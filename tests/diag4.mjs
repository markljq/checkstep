import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const userData = mkdtempSync(join(tmpdir(), 'cs-diag4-'))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const sleep = ms => new Promise(r => setTimeout(r, ms))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.bringToFront()
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setAlwaysOnTop(true); w.show(); w.focus() })
await page.waitForSelector('.task'); await sleep(600)
await page.locator('.mode-switch button', { hasText: '编辑模式' }).click(); await sleep(300)
await page.locator('.bottom-actions .add-ms').nth(1).click(); await sleep(300)
const input = page.locator('.dialog input').first()
await input.click()
await input.pressSequentially('键盘输入测试', { delay: 30 })
await sleep(300)
console.log('输入后 DOM 值:', await input.inputValue())
await page.locator('.dialog input').nth(1).fill('备注触发重渲染'); await sleep(300)
console.log('重渲染后标题值:', await input.inputValue())
const btnState = await page.evaluate(() => { const b=document.querySelector('.dialog .btn.primary'); return b ? b.outerHTML.slice(0,80) : 'none' })
console.log('确定按钮:', btnState)
const html = await page.locator('.dialog').innerHTML()
console.log('dialog 片段:', html.slice(0, 300).replace(/\s+/g,' '))
await app.close()
