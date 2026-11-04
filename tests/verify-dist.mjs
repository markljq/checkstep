/**
 * 打包产物验证：直接启动 win-unpacked 里的 Check Step.exe，验证窗口、图标标题、核心交互
 * 运行：node tests/verify-dist.mjs
 */
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const projectDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const exePath = join(projectDir, 'dist', 'win-unpacked', 'Check Step.exe')
const ver = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8')).version
const setupPath = join(projectDir, 'dist', `CheckStep-Setup-${ver}.exe`)

const results = []
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let app
try {
  // 安装包存在性
  const setupSize = (await import('fs')).statSync(setupPath).size
  check(`安装包 CheckStep-Setup-${ver}.exe 存在（>40MB）`, setupSize > 40 * 1024 * 1024, `${Math.round(setupSize / 1024 / 1024)}MB`)

  const userData = mkdtempSync(join(tmpdir(), 'checkstep-dist-'))
  const dataFile = join(userData, 'data', 'checkstep.json')
  const readDB = () => JSON.parse(readFileSync(dataFile, 'utf-8'))

  app = await electron.launch({ executablePath: exePath, args: [`--user-data-dir=${userData}`], env })
  const page = await app.firstWindow()
  await page.bringToFront()
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setAlwaysOnTop(true)
    w.show()
    w.focus()
  })
  await page.waitForSelector('.task', { timeout: 20000 })
  await sleep(500)
  // 首次使用指引（新 userData 会弹出）：关闭
  await page.locator('.dialog-guide .btn.primary').click({ timeout: 3000 }).catch(() => {})
  await sleep(300)

  check('打包版窗口标题为 Check Step', (await page.title()) === 'Check Step', await page.title())
  check('项目列表渲染 3 个演示项目', (await page.locator('.nav-item').count()) === 3)

  // 核心交互：勾选 + 时间登记
  const target = page.locator('.task').filter({ hasText: '冻结数据写入' })
  await target.locator('.check').click()
  await sleep(350)
  check('勾选正常工作', (await target.getAttribute('class')).includes('done'))

  // 导出面板（新功能在打包版可用）
  await page.locator('.io-trigger').click()
  await sleep(250)
  check('导入/导出面板可用', await page.locator('.io-pop').isVisible())
  await page.keyboard.press('Escape')

  // 时间编辑入口（新功能在打包版可用）
  await target.locator('.task-row').hover()
  check('完成时间编辑入口可用', (await target.locator('.time-edit').count()) === 1)

  // 持久化
  await sleep(400)
  const saved = readDB()
  const frozen = saved.projects[0].milestones[0].tasks.find((t) => t.title === '冻结数据写入')
  check('打包版数据持久化正常', frozen.done === true && typeof frozen.doneAt === 'string', String(frozen?.doneAt))

  await app.close()
  app = null
} catch (err) {
  console.error('验证执行异常:', err)
  results.push({ name: '验证执行未中断', ok: false, detail: String(err).slice(0, 200) })
} finally {
  if (app) await app.close().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过，${failed.length} 失败 =====`)
if (failed.length) {
  failed.forEach((f) => console.log(`  失败：${f.name} ${f.detail ? '(' + f.detail + ')' : ''}`))
  process.exit(1)
}
