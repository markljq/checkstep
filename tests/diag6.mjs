import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const userData = mkdtempSync(join(tmpdir(), 'cs-diag6-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.bringToFront()
await page.locator('.dialog-guide .btn.primary').click({ timeout: 3000 }).catch(() => {})
await page.waitForSelector('.task', { timeout: 20000 })
await sleep(500)

// 1. PNG 生成诊断
const diag1 = await page.evaluate(async () => {
  try {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>'
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    const img = new Image()
    await new Promise((res, rej) => { img.onload = res; img.onerror = (e) => rej(new Error('img onerror')); img.src = url })
    const c = document.createElement('canvas')
    c.width = 200; c.height = 200
    const ctx = c.getContext('2d')
    ctx.scale(2, 2)
    ctx.drawImage(img, 0, 0)
    const d = c.toDataURL('image/png')
    return { ok: true, len: d.length }
  } catch (e) { return { ok: false, err: String(e) } }
})
console.log('简单SVG PNG:', JSON.stringify(diag1))

// 2. 真实 SVG 是否合法：让页面加载真实生成的图
const diag2 = await page.evaluate(async () => {
  try {
    const btn = document.querySelector('.proj-toolbar .share-btn')
    btn.click()
    await new Promise(r => setTimeout(r, 1200))
    const img = document.querySelector('.share-preview img')
    return { src: img.getAttribute('src').slice(0, 60) }
  } catch (e) { return { err: String(e) } }
})
console.log('预览图src前缀:', JSON.stringify(diag2))

// 3. hover 高亮诊断
await page.keyboard.press('Escape')
await page.locator('.mode-switch button', { hasText: '编辑模式' }).click()
await sleep(300)
const t = page.locator('.task', { has: page.locator('.steps-toggle:not(.ghost)') }).first()
await t.locator('.steps-toggle').click()
await sleep(400)
const step = t.locator('.step').first()
const box = await step.boundingBox()
console.log('step box:', JSON.stringify(box))
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await sleep(300)
const diag3 = await page.evaluate(() => {
  const el = document.querySelector('.step:hover')
  if (!el) return { hovered: false }
  return { hovered: true, bg: getComputedStyle(el).backgroundColor }
})
console.log('hover状态:', JSON.stringify(diag3))
await app.close()
