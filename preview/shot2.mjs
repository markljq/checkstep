import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['preview/electron-shot.js'], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.setViewportSize({ width: 2400, height: 1200 })
await new Promise(r => setTimeout(r, 1000))
await page.locator('#b').screenshot({ path: 'preview/shot-b.png' })
await page.locator('#a').screenshot({ path: 'preview/shot-a.png' })
await app.close()
