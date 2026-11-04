import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const userData = mkdtempSync(join(tmpdir(), 'cs-diag9-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.bringToFront()
await page.locator('.dialog-guide .btn.primary').click({ timeout: 3000 }).catch(() => {})
await page.waitForSelector('.task', { timeout: 20000 })
await sleep(600)
await page.locator('.mode-switch button', { hasText: '编辑模式' }).click()
await sleep(400)
await page.screenshot({ path: 'tests/shot-v108.png' })
await app.close()
console.log('done')
