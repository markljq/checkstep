import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'

const DATA_DIR = join(app.getPath('userData'), 'data')
const DATA_FILE = join(DATA_DIR, 'checkstep.json')
const LOG_FILE = join(app.getPath('userData'), 'main.log')

/** 启动诊断日志：写入 userData/main.log，便于排查"进程在、窗口无"类问题 */
function log(msg: string): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`, 'utf-8')
  } catch {
    /* 日志失败不影响运行 */
  }
}

process.on('uncaughtException', (err) => {
  log(`uncaughtException: ${err.stack || err.message}`)
})
process.on('unhandledRejection', (reason) => {
  log(`unhandledRejection: ${String(reason)}`)
})

log(`启动 v${app.getVersion()} | electron=${process.versions.electron} | cwd=${process.cwd()}`)

function loadData(): unknown | null {
  try {
    if (!existsSync(DATA_FILE)) return null
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
  } catch (err) {
    console.error('[store] 读取数据失败，已备份损坏文件:', err)
    // 数据损坏时先备份，避免后续写入覆盖掉用户唯一的数据
    try {
      copyFileSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}.bak`)
    } catch (copyErr) {
      console.error('[store] 备份损坏文件失败:', copyErr)
    }
    return null
  }
}

function saveData(db: unknown): boolean {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    // 原子写入：先写临时文件，再重命名覆盖，防止写一半崩溃导致数据损坏
    const tmp = DATA_FILE + '.tmp'
    writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8')
    renameSync(tmp, DATA_FILE)
    return true
  } catch (err) {
    console.error('[store] 写入数据失败:', err)
    return false
  }
}

function getDataPath(): string {
  return DATA_FILE
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 920,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#202020',
    titleBarStyle: process.platform === 'win32' ? 'hidden' : 'default',
    titleBarOverlay: process.platform === 'win32' ? { color: '#202020', symbolColor: '#ffffff', height: 44 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // 窗口失焦后仍保持动画/计时器流畅（Windows 后台节流会导致勾选动画停滞）
      backgroundThrottling: false
    }
  })

  let shown = false
  const showOnce = (reason: string): void => {
    if (shown) return
    shown = true
    log(`显示窗口（${reason}）`)
    win.show()
    win.focus()
  }

  // 正常路径：渲染层就绪后显示
  win.on('ready-to-show', () => showOnce('ready-to-show'))
  // 实测部分环境（如资源管理器直接双击启动）ready-to-show 永不触发：
  // 页面加载完成后短暂延迟即显示，避免"进程在、窗口无"的僵尸状态
  win.webContents.on('did-finish-load', () => {
    log('渲染层加载完成')
    setTimeout(() => showOnce('did-finish-load'), 200)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    log(`渲染层加载失败: code=${code} desc=${desc} url=${url} main=${isMain}`)
    if (isMain && code !== -3) {
      setTimeout(() => {
        log('尝试重新加载渲染层')
        win.webContents.reload()
      }, 800)
    }
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    log(`渲染进程退出: ${details.reason}`)
    if (details.reason !== 'clean-exit') {
      setTimeout(() => win.webContents.reload(), 800)
    }
  })
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) log(`渲染层 console: ${message.slice(0, 200)} (${sourceId}:${line})`)
  })

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('store:load', () => loadData())
ipcMain.handle('store:save', (_e, db: unknown) => saveData(db))
ipcMain.handle('store:path', () => getDataPath())

/* ---------- 导入 / 导出：系统文件对话框 ---------- */
interface SavePayload {
  title?: string
  defaultName?: string
  filters?: { name: string; extensions: string[] }[]
  content?: string
}

interface OpenPayload {
  title?: string
  filters?: { name: string; extensions: string[] }[]
}

ipcMain.handle('file:saveText', async (_e, payload: SavePayload) => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  try {
    const res = win
      ? await dialog.showSaveDialog(win, {
          title: payload?.title ?? '保存文件',
          defaultPath: payload?.defaultName,
          filters: payload?.filters
        })
      : await dialog.showSaveDialog({
          title: payload?.title ?? '保存文件',
          defaultPath: payload?.defaultName,
          filters: payload?.filters
        })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    writeFileSync(res.filePath, String(payload?.content ?? ''), 'utf-8')
    return { ok: true, path: res.filePath }
  } catch (err) {
    console.error('[file] 保存失败:', err)
    return { ok: false, error: String(err) }
  }
})

/** 保存二进制图片（base64 编码），用于分享进度图导出 PNG */
ipcMain.handle('file:saveImage', async (_e, payload: { title?: string; defaultName?: string; base64?: string }) => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  try {
    const res = win
      ? await dialog.showSaveDialog(win, {
          title: payload?.title ?? '保存图片',
          defaultPath: payload?.defaultName,
          filters: [{ name: 'PNG 图片', extensions: ['png'] }]
        })
      : await dialog.showSaveDialog({
          title: payload?.title ?? '保存图片',
          defaultPath: payload?.defaultName,
          filters: [{ name: 'PNG 图片', extensions: ['png'] }]
        })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    writeFileSync(res.filePath, Buffer.from(String(payload?.base64 ?? ''), 'base64'))
    return { ok: true, path: res.filePath }
  } catch (err) {
    console.error('[file] 保存图片失败:', err)
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('file:openText', async (_e, payload: OpenPayload) => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  try {
    const res = win
      ? await dialog.showOpenDialog(win, {
          title: payload?.title ?? '打开文件',
          properties: ['openFile'],
          filters: payload?.filters
        })
      : await dialog.showOpenDialog({
          title: payload?.title ?? '打开文件',
          properties: ['openFile'],
          filters: payload?.filters
        })
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true }
    const filePath = res.filePaths[0]
    return { ok: true, path: filePath, content: readFileSync(filePath, 'utf-8') }
  } catch (err) {
    console.error('[file] 读取失败:', err)
    return { ok: false, error: String(err) }
  }
})

// 单实例锁：避免多开导致本地 JSON 数据互相覆盖
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      // 无论窗口此前是否可见都强制显示，避免僵尸实例被"唤醒"后仍不可见
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    log('app ready，创建主窗口')
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
