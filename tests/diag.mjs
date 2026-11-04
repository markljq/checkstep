import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(import.meta.url)
const userData = mkdtempSync(join(tmpdir(), 'cs-diag-'))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
const page = await app.firstWindow()
await page.waitForSelector('.task')
await new Promise(r => setTimeout(r, 800))
const el = page.locator('.task').filter({ hasText: '冻结数据写入' }).locator('.check')
for (let i = 0; i < 4; i++) {
  console.log('box', i, JSON.stringify(await el.boundingBox()))
  await new Promise(r => setTimeout(r, 250))
}
const info = await page.evaluate(() => {
  const c = document.querySelector('.check')
  const anims = document.getAnimations().map(a => ({ name: a.animationName || a.transitionProperty, state: a.playState, target: a.effect?.target?.className }))
  return { anims, rect: c.getBoundingClientRect().toJSON(), styles: getComputedStyle(c).animationName }
})
console.log('anims:', JSON.stringify(info.anims))
console.log('rect:', JSON.stringify(info.rect), 'anim:', info.styles)
await app.close()
