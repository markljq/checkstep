/* 复制项目功能自动化测试 */
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
const ok = (cond, name) => {
  if (cond) {
    pass++
    console.log('  ✓', name)
  } else {
    fail++
    console.log('  ✗', name)
  }
}

const userData = mkdtempSync(join(tmpdir(), 'cs-dup-'))
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

  const dbPath = join(userData, 'data', 'checkstep.json')
  const readDB = () => JSON.parse(readFileSync(dbPath, 'utf-8'))

  /* ---------- 1. 进入编辑模式，选中第一个项目 ---------- */
  console.log('▶ 复制项目基本流程')
  await page.locator('.mode-switch button', { hasText: '编辑模式' }).click()
  await sleep(300)
  await page.locator('.nav-item').first().click()
  await sleep(200)
  const copyBtn = page.locator('.nav-item').first().locator('button[title="复制项目"]')
  ok((await copyBtn.count()) === 1, '编辑模式下选中项目显示复制按钮')

  /* ---------- 2. 打开复制对话框，检查预填 ---------- */
  await copyBtn.click()
  await sleep(300)
  ok(await page.locator('.dialog').isVisible(), '弹出复制项目对话框')
  const preName = await page.locator('.dialog input').first().inputValue()
  ok(preName.includes('副本'), `名称预填含"副本"（实际：${preName}）`)
  ok((await page.locator('.dialog .field-hint').count()) === 1, '显示重名提示文字')

  /* ---------- 3. 重名校验 ---------- */
  await page.locator('.dialog input').first().fill('网关升级割接')
  await page.locator('.dialog .btn.primary').click()
  await sleep(300)
  ok(await page.locator('.dialog').isVisible(), '重名提交后对话框保持打开')
  const toastText = await page.locator('.toast').innerText()
  ok(toastText.includes('已存在'), `提示名称已存在（实际：${toastText}）`)

  /* ---------- 4. 修改名称后提交 ---------- */
  await page.locator('.dialog input').first().fill('复制测试项目')
  await page.locator('.dialog .btn.primary').click()
  await sleep(500)
  ok(!(await page.locator('.dialog').isVisible().catch(() => false)), '提交成功后对话框关闭')

  const db1 = readDB()
  ok(db1.projects.length === 4, '项目数 3 → 4')
  ok(db1.currentProjectId === db1.projects[1].id, '新副本插在原项目后并自动选中')
  const src = db1.projects.find((p) => p.name === 'XX 系统 V2.0 上线')
  const dup = db1.projects.find((p) => p.name === '复制测试项目')
  ok(!!dup, '数据文件中出现副本项目')
  ok(dup.milestones.length === src.milestones.length, '里程碑结构一致')
  const srcAll = src.milestones.flatMap((m) => m.tasks)
  const dupAll = dup.milestones.flatMap((m) => m.tasks)
  ok(dupAll.length === srcAll.length, `执行项数量一致（${dupAll.length}）`)
  ok(dupAll.every((t) => t.done === false && t.doneAt === null), '所有执行项为未执行状态且无完成时间')
  ok(dupAll.every((t) => t.steps.every((s) => s.done === false)), '所有步骤为未完成状态')
  ok(dupAll.every((t) => t.title && t.id !== undefined), '标题与备注等字段保留')
  ok(new Set(dupAll.map((t) => t.id)).size === dupAll.length, '所有 id 重新生成无重复')
  const dupStepIds = dupAll.flatMap((t) => t.steps.map((s) => s.id))
  ok(new Set(dupStepIds).size === dupStepIds.length, '步骤 id 无重复')

  /* ---------- 5. 界面渲染验证 ---------- */
  const names = await page.locator('.nav-item .p-name').allInnerTexts()
  ok(names[0] === 'XX 系统 V2.0 上线' && names[1] === '复制测试项目', `副本插在原项目之后（实际：${names.join(' | ')}）`)
  const selIdx = await page.evaluate(() => [...document.querySelectorAll('.nav-item')].findIndex((n) => n.classList.contains('selected')))
  ok(selIdx === 1, `副本在侧栏处于选中态（选中索引：${selIdx}）`)
  const msNames = await page.locator('.ms-name').allInnerTexts()
  ok(msNames.some((s) => s.includes('数据准备')) && msNames.some((s) => s.includes('割接窗口')), '里程碑正确渲染')
  const header = await page.locator('.proj-header h1').innerText()
  ok(header === '复制测试项目', `主区域标题为副本（实际：${header}）`)
  const checkedCount = await page.locator('.check.checked').count()
  ok(checkedCount === 0, `界面无勾选圆点（发现 ${checkedCount} 个）`)
  const doneatCount = await page.locator('.t-doneat').count()
  ok(doneatCount === 0, '界面无完成时间行')

  /* ---------- 6. 副本可独立执行，不影响原项目 ---------- */
  const dbBefore = readDB()
  const srcDoneBefore = dbBefore.projects.find((p) => p.name === 'XX 系统 V2.0 上线').milestones.flatMap((m) => m.tasks).filter((t) => t.done).length
  await page.locator('.mode-switch button', { hasText: '执行模式' }).click()
  await sleep(300)
  await page.locator('.task').first().locator('.check').first().click()
  await sleep(500)
  const db2 = readDB()
  const src2 = db2.projects.find((p) => p.name === 'XX 系统 V2.0 上线')
  const src2All = src2.milestones.flatMap((m) => m.tasks)
  ok(src2All.filter((t) => t.done).length === srcDoneBefore, '在副本打勾不影响原项目（源项目完成数不变）')
  ok(db2.projects.find((p) => p.name === '复制测试项目').milestones.flatMap((m) => m.tasks).some((t) => t.done === true), '副本内打勾生效')

  /* ---------- 7. 重启持久化 ---------- */
  console.log('▶ 重启验证')
  await app.close()
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
  const page2 = await app.firstWindow()
  await page2.bringToFront()
  // 首次使用指引：可能已关闭
  await page2.locator('.dialog-guide .btn.primary').click({ timeout: 2000 }).catch(() => {})
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setAlwaysOnTop(true)
    w.show()
    w.focus()
  })
  await page2.waitForSelector('.task', { timeout: 20000 })
  await sleep(500)
  const names2 = await page2.locator('.nav-item .p-name').allInnerTexts()
  ok(names2.includes('复制测试项目'), '重启后副本仍在')
  const db3 = readDB()
  const dup3 = db3.projects.find((p) => p.name === '复制测试项目')
  const dup3All = dup3.milestones.flatMap((m) => m.tasks)
  ok(dup3All.filter((t) => t.done).length === 1, '重启后副本勾选状态保持')

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exitCode = fail ? 1 : 0
  await app.close()
} catch (err) {
  console.error('测试异常:', err.message)
  process.exitCode = 1
  if (app) await app.close().catch(() => {})
}
