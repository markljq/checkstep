import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const userData = mkdtempSync(join(tmpdir(), 'cs-diag5-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.bringToFront()
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1200, 800) })
await sleep(800)
await page.screenshot({ path: 'tests/shot-guide.png' })
await page.locator('.dialog-guide .btn.primary').click()
await sleep(500)
// 折叠里程碑，把待办都留上面，滚到底
const pending = await page.locator('.task:not(.done) .check').count()
for (let i = 1; i < pending; i++) { await page.locator('.task:not(.done) .check').nth(1).click(); await sleep(200) }
await page.evaluate(() => { const m = document.querySelector('.main'); m.scrollTop = m.scrollHeight })
await sleep(700)
await page.screenshot({ path: 'tests/shot-fab.png' })
await page.locator('.jump-fab').click()
await sleep(1500)
await page.screenshot({ path: 'tests/shot-locate.png' })
await app.close()
