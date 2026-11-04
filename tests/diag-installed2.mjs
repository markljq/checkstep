/**
 * 复现：安装版使用共享 userData（%APPDATA%\checkstep-desktop）时是否异常
 * 运行：node tests/diag-installed2.mjs
 */
import { _electron as electron } from 'playwright-core'

const exePath = 'D:\\wb_tools\\check step\\Check Step.exe'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS

const app = await electron.launch({ executablePath: exePath, args: [], env })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (const t of [2000, 4000, 8000, 15000]) {
  await sleep(t === 2000 ? 2000 : t - (t === 4000 ? 2000 : t === 8000 ? 4000 : 8000))
  try {
    const info = await app.evaluate(({ app, BrowserWindow }) => ({
      wins: BrowserWindow.getAllWindows().map((w) => ({
        visible: w.isVisible(),
        title: w.getTitle(),
        url: w.webContents.getURL().slice(0, 80)
      })),
      userData: app.getPath('userData'),
      alive: true
    }))
    console.log(`t≈${t}s:`, JSON.stringify(info))
  } catch {
    console.log(`t≈${t}s: 主进程已退出`)
    break
  }
}

await app.close().catch(() => {})
process.exit(0)
