/* v1.0.3 三项优化测试：焦点、连续添加步骤、复制执行项 */
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const require = createRequire(import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0
let fail = 0
const ok = (c, n, extra = '') => {
  if (c) {
    pass++
    console.log('  ✓', n)
  } else {
    fail++
    console.log('  ✗', n, extra)
  }
}

const userData = mkdtempSync(join(tmpdir(), 'cs-opt-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let app
try {
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
  const page = await app.firstWindow()
  await page.bringToFront()
  // 首次使用指引（新 userData 会弹出）：点击开始使用关闭
  await page.locator('.dialog-guide .btn.primary').click({ timeout: 3000 }).catch(() => {})
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setAlwaysOnTop(true)
    w.show()
    w.focus()
  })
  await page.waitForSelector('.task', { timeout: 20000 })
  await sleep(600)
  const readDB = () => JSON.parse(readFileSync(join(userData, 'data', 'checkstep.json'), 'utf-8'))

  await page.locator('.mode-switch button', { hasText: '编辑模式' }).click()
  await sleep(300)

  /* ---------- 1. 添加执行项：焦点应在名称 ---------- */
  console.log('▶ 弹窗焦点')
  await page.locator('.task-list .add-row').first().click()
  await sleep(400)
  const focusName = await page.evaluate(() => document.activeElement?.getAttribute('name') ?? '')
  ok(focusName === 'title', `「添加执行项」焦点在名称输入框（实际：${focusName}）`)
  await page.keyboard.type('焦点测试执行项')
  const typed = await page.locator('.dialog input[name="title"]').inputValue()
  ok(typed === '焦点测试执行项', '直接输入即写入名称字段')
  await page.locator('.dialog .btn.primary').click()
  await sleep(400)

  /* ---------- 2. 连续添加步骤 ---------- */
  console.log('▶ 连续添加步骤')
  // 编辑模式下的空步骤提示行需先展开：选一个有步骤的执行项
  const target = page.locator('.task').filter({ hasText: '冻结数据写入' }).first()
  await target.hover()
  await sleep(200)
  await target.locator('button[title="添加步骤"]').click()
  await sleep(400)
  ok(await page.locator('.step-editor').isVisible(), '打开多行步骤编辑器')
  ok((await page.locator('.step-row').count()) === 1, '初始一行输入')

  const firstInput = page.locator('.step-row input').first()
  ok(await firstInput.evaluate((el) => el === document.activeElement), '首行自动聚焦')
  await page.keyboard.type('步骤A')
  await page.keyboard.press('Enter')
  await sleep(250)
  ok((await page.locator('.step-row').count()) === 2, 'Enter 新增第二行')
  ok((await page.locator('.step-row input').nth(1).evaluate((el) => el === document.activeElement)), '焦点自动移到新行')
  await page.keyboard.type('步骤B')
  await page.keyboard.press('Enter')
  await sleep(200)
  await page.keyboard.type('步骤C')
  await sleep(200)
  ok((await page.locator('.step-row').count()) === 3, '共 3 行')
  // 加一个空行，验证空行被忽略
  await page.keyboard.press('Enter')
  await sleep(200)
  await page.locator('.dialog .btn.primary').click()
  await sleep(500)
  ok(!(await page.locator('.step-editor').isVisible().catch(() => false)), '提交后对话框关闭')

  const db1 = readDB()
  const p1 = db1.projects.find((p) => p.name === 'XX 系统 V2.0 上线')
  const t1 = p1.milestones.flatMap((m) => m.tasks).find((t) => t.title === '冻结数据写入')
  const contents = t1.steps.map((s) => s.content)
  ok(contents.slice(-3).join(',') === '步骤A,步骤B,步骤C', `三条步骤按序插入（实际：${contents.slice(-3).join(',')}）`)
  ok(!contents.includes(''), '空行被忽略')
  ok((await page.locator('.task').filter({ hasText: '冻结数据写入' }).first().locator('.step').count()) >= 6, '界面显示新增步骤')

  /* ---------- 3. 复制执行项 ---------- */
  console.log('▶ 复制执行项')
  // 复制一个已完成执行项（校验数据文件完整性 已完成）
  const doneTask = page.locator('.task').filter({ hasText: '校验数据文件完整性' }).first()
  const beforeCount = await page.locator('.task').count()
  await doneTask.hover()
  await sleep(200)
  await doneTask.locator('button[title="复制执行项"]').click()
  await sleep(500)
  ok((await page.locator('.task').count()) === beforeCount + 1, '执行项数量 +1')

  const db2 = readDB()
  const p2 = db2.projects.find((p) => p.name === 'XX 系统 V2.0 上线')
  const list2 = p2.milestones.find((m) => m.name === '数据准备').tasks
  const idx = list2.findIndex((t) => t.title === '校验数据文件完整性')
  ok(list2[idx + 1] && list2[idx + 1].title === '校验数据文件完整性', '副本紧跟在原执行项之后')
  const copy = list2[idx + 1]
  ok(copy.id !== list2[idx].id, '副本 id 与原项不同')
  ok(copy.done === false && copy.doneAt === null, '副本为未执行状态')
  ok(copy.note === list2[idx].note, '备注保留')

  // 复制带步骤的执行项
  const stepTask = page.locator('.task').filter({ hasText: '冻结数据写入' }).first()
  await stepTask.hover()
  await sleep(200)
  await stepTask.locator('button[title="复制执行项"]').click()
  await sleep(500)
  const db3 = readDB()
  const p3 = db3.projects.find((p) => p.name === 'XX 系统 V2.0 上线')
  const l3 = p3.milestones.find((m) => m.name === '数据准备').tasks
  const src3 = l3.find((t) => t.title === '冻结数据写入')
  const cps = l3.filter((t) => t.title === '冻结数据写入')
  ok(cps.length === 2, '带步骤执行项复制成功')
  ok(cps[0].steps.length === src3.steps.length && cps[1].steps.length === src3.steps.length, '步骤数量一致')
  ok(cps[1].steps.every((s) => s.done === false), '副本步骤均为未完成')
  const ids = [...cps[0].steps, ...cps[1].steps].map((s) => s.id)
  ok(new Set(ids).size === ids.length, '步骤 id 无重复')

  /* ---------- 4. 执行模式不显示（避免现场误操作） ---------- */
  await page.locator('.mode-switch button', { hasText: '执行模式' }).click()
  await sleep(300)
  ok((await page.locator('.task button[title="复制执行项"]').first().isVisible().catch(() => false)) === false, '执行模式下复制按钮不可见')

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exitCode = fail ? 1 : 0
  await app.close()
} catch (err) {
  console.error('测试异常:', err.message)
  process.exitCode = 1
  if (app) await app.close().catch(() => {})
}
