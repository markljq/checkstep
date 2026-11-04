import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const userData = mkdtempSync(join(tmpdir(), 'cs-diag8-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.bringToFront()
await page.locator('.dialog-guide .btn.primary').click({ timeout: 3000 }).catch(() => {})
await page.waitForSelector('.task', { timeout: 20000 })
await sleep(400)
await page.locator('.proj-toolbar .share-btn').click()
await sleep(900)
const img = page.locator('.share-preview img')
await img.scrollIntoViewIfNeeded()
await page.locator('.share-preview').evaluate((el) => { el.scrollTop = el.scrollHeight })
await sleep(300)
await img.screenshot({ path: 'tests/shot-footer-dark.png' })
await page.keyboard.press('Escape')
await sleep(250)
await page.locator('.titlebar button[title="切换深色 / 浅色"]').click()
await sleep(400)
await page.locator('.proj-toolbar .share-btn').click()
await sleep(900)
const img2 = page.locator('.share-preview img')
await page.locator('.share-preview').evaluate((el) => { el.scrollTop = el.scrollHeight })
await sleep(300)
await img2.screenshot({ path: 'tests/shot-footer-light.png' })
await app.close()
console.log('done')
