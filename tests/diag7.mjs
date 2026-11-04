import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const userData = mkdtempSync(join(tmpdir(), 'cs-diag7b-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.bringToFront()
await page.locator('.dialog-guide .btn.primary').click({ timeout: 3000 }).catch(() => {})
await page.waitForSelector('.task', { timeout: 20000 })
await page.locator('.mode-switch button', { hasText: '编辑模式' }).click()
await sleep(300)
const t = page.locator('.task', { has: page.locator('.steps-toggle:not(.ghost)') }).first()
await t.locator('.steps-toggle').click()
await sleep(400)
const step = t.locator('.step').first()
await step.hover()
await sleep(400)
const diag = await page.evaluate(() => {
  const el = document.querySelector('.step')
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2
  const at = document.elementFromPoint(cx, cy)
  return {
    hovered: !!document.querySelector('.step:hover'),
    atPoint: at ? at.className.toString().slice(0, 40) : '(none)',
    same: at === el
  }
})
console.log(JSON.stringify(diag, null, 2))
await app.close()
