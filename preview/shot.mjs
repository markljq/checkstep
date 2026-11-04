import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['preview/electron-shot.js'], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.setViewportSize({ width: 1500, height: 1100 })
await new Promise(r => setTimeout(r, 1200))
const h = await page.evaluate(() => document.body.scrollHeight)
console.log('page height', h)
await page.screenshot({ path: 'preview/shot-full.png', fullPage: true })
await app.close()
