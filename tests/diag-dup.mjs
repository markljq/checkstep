import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const userData = mkdtempSync(join(tmpdir(), 'cs-dupdiag-'))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.bringToFront()
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setAlwaysOnTop(true); w.show(); w.focus() })
await page.waitForSelector('.task', { timeout: 20000 }); await sleep(600)
await page.locator('.mode-switch button', { hasText: '编辑模式' }).click(); await sleep(300)
await page.locator('.nav-item').first().click(); await sleep(200)
await page.locator('.nav-item').first().locator('button[title="复制项目"]').click(); await sleep(300)
await page.locator('.dialog input').first().fill('复制测试项目')
await page.locator('.dialog .btn.primary').click(); await sleep(600)
console.log('侧栏项:', await page.locator('.nav-item .p-name').allInnerTexts())
console.log('选中项索引:', await page.evaluate(() => [...document.querySelectorAll('.nav-item')].findIndex(n => n.classList.contains('selected'))))
console.log('主区域里程碑:', await page.locator('.ms-name').allInnerTexts())
console.log('主区域标题:', await page.locator('.proj-header h1').innerText().catch(()=> 'none'))
const db = JSON.parse(readFileSync(join(userData, 'data', 'checkstep.json'), 'utf-8'))
console.log('数据顺序:', db.projects.map(p => p.name), '| current:', db.projects.find(p=>p.id===db.currentProjectId)?.name)
await app.close()
