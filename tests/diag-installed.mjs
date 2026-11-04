/**
 * 诊断安装版 Check Step.exe：窗口状态、页面加载、渲染层报错
 * 运行：node tests/diag-installed.mjs
 */
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const exePath = 'D:\\wb_tools\\check step\\Check Step.exe'
const userData = mkdtempSync(join(tmpdir(), 'cs-installed-'))

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS

const app = await electron.launch({
  executablePath: exePath,
  args: [`--user-data-dir=${userData}`],
  env
})

// 捕获主进程 stdout/stderr
app.process().stdout?.on('data', (d) => console.log('[main stdout]', String(d).trim()))
app.process().stderr?.on('data', (d) => console.log('[main stderr]', String(d).trim()))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(6000)

const info = await app.evaluate(({ app, BrowserWindow }) => {
  const wins = BrowserWindow.getAllWindows().map((w) => ({
    visible: w.isVisible(),
    minimized: w.isMinimized(),
    bounds: w.getBounds(),
    title: w.getTitle(),
    url: w.webContents.getURL(),
    loading: w.webContents.isLoading(),
    crash: w.webContents.getProcessId()
  }))
  return {
    wins,
    appName: app.getName(),
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
    ready: app.isReady()
  }
})
console.log('=== 主进程信息 ===')
console.log(JSON.stringify(info, null, 2))

const pages = app.windows()
console.log('=== Playwright 窗口数:', pages.length)
for (const p of pages) {
  p.on('console', (m) => console.log('[renderer]', m.type(), m.text().slice(0, 200)))
  p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
  try {
    console.log('page url:', p.url())
    console.log('title:', await p.title())
  } catch (e) {
    console.log('page query failed:', String(e).slice(0, 150))
  }
}

await sleep(3000)
const info2 = await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().map((w) => ({
    visible: w.isVisible(),
    url: w.webContents.getURL(),
    title: w.getTitle()
  }))
)
console.log('=== 3 秒后复查 ===')
console.log(JSON.stringify(info2, null, 2))

await app.close().catch(() => {})
process.exit(0)
