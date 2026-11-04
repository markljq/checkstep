import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const userData = mkdtempSync(join(tmpdir(), 'cs-diag3-'))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const sleep = ms => new Promise(r => setTimeout(r, ms))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.bringToFront()
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setAlwaysOnTop(true); w.show(); w.focus() })
await page.waitForSelector('.task'); await sleep(600)
await page.locator('.mode-switch button', { hasText: '编辑模式' }).click(); await sleep(300)
await page.locator('.bottom-actions .add-ms').nth(1).click(); await sleep(300)
await page.locator('.dialog input').first().fill('测试执行项A')
await page.locator('.dialog input').first().press('Enter')
await sleep(400)
console.log('回车后对话框可见:', await page.locator('.dialog').isVisible(), '| 有对话框节点:', await page.locator('.dialog').count())
console.log('toast:', await page.locator('.toast').innerText())
const db = JSON.parse(readFileSync(join(userData, 'data', 'checkstep.json'), 'utf-8'))
console.log('直接执行项:', db.projects[0].tasks.map(t => t.title))
await app.close()
