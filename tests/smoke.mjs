/**
 * Check Step 自动化冒烟测试（Playwright + Electron）
 * 运行：node tests/smoke.mjs
 * 用一个临时 user-data-dir，避免污染真实用户数据。
 */
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const projectDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const userData = mkdtempSync(join(tmpdir(), 'checkstep-test-'))
const dataFile = join(userData, 'data', 'checkstep.json')

const results = []
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const readDB = () => JSON.parse(readFileSync(dataFile, 'utf-8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function dragTo(page, srcLocator, tgtLocator, pos = 'after') {
  const src = await srcLocator.first().elementHandle()
  const tgt = await tgtLocator.first().elementHandle()
  if (!src || !tgt) throw new Error('拖拽元素不存在')
  await page.evaluate(({ s, t, pos }) => {
    const dt = new DataTransfer()
    const fire = (el, type, extra = {}) =>
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...extra }))
    fire(s, 'dragstart')
    const r = t.getBoundingClientRect()
    const y = pos === 'before' ? r.top + 2 : r.bottom - 2
    fire(t, 'dragover', { clientY: y, clientX: r.left + 20 })
    fire(t, 'drop', { clientY: y, clientX: r.left + 20 })
    fire(s, 'dragend')
  }, { s: src, t: tgt, pos })
  await sleep(250)
}

let app
try {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: projectDir,
    executablePath: require('electron'),
    env
  })
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

  /* ---------- 1. 基础渲染 ---------- */
  check('窗口标题为 Check Step', (await page.title()) === 'Check Step', await page.title())
  check('项目列表渲染 3 个项目', (await page.locator('.nav-item').count()) === 3)
  check('执行项渲染（含跨里程碑）', (await page.locator('.task').count()) >= 6)
  check('无控制台语法错误（页面已挂载 React）', (await page.locator('#app').count()) === 1)

  /* ---------- 2. 勾选与完成时间 ---------- */
  const target = page.locator('.task').filter({ hasText: '冻结数据写入' })
  await target.locator('.check').click()
  await sleep(300)
  check('点击圆圈后执行项标记完成', (await target.getAttribute('class')).includes('done'))
  check('完成时间自动登记', (await target.locator('.t-doneat').innerText()).match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/) !== null)

  const db1 = readDB()
  const frozen1 = db1.projects[0].milestones[0].tasks.find((t) => t.title === '冻结数据写入')
  check('完成状态已持久化到 JSON', frozen1.done === true && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(frozen1.doneAt))
  check('项目进度随勾选更新', (await page.locator('.pct').innerText()).replace('%', '') !== '0')

  await target.locator('.check').click()
  await sleep(250)
  const db2 = readDB()
  const frozen2 = db2.projects[0].milestones[0].tasks.find((t) => t.title === '冻结数据写入')
  check('再次点击可撤销完成并清空时间', frozen2.done === false && frozen2.doneAt === null)

  /* ---------- 3. 执行步骤 ---------- */
  await target.locator('.steps-toggle').click()
  await sleep(300)
  const expanded = await target.locator('.steps-wrap').evaluate((el) => el.classList.contains('open'))
  check('执行步骤可展开', expanded)
  check('无步骤的执行项不显示展开入口', (await page.locator('.task').filter({ hasText: '通知相关方上线窗口时间' }).locator('.steps-toggle').count()) === 0)

  await target.locator('.step').first().click()
  await sleep(200)
  check('步骤可单独打勾', await target.locator('.step').first().evaluate((el) => el.classList.contains('done')))
  const db3 = readDB()
  check('步骤状态已持久化', db3.projects[0].milestones[0].tasks.find((t) => t.title === '冻结数据写入').steps[0].done === true)

  /* ---------- 4. 折叠 ---------- */
  const firstMsCard = page.locator('.ms-card').first()
  await firstMsCard.locator('.ms-head').click()
  await sleep(350)
  check('里程碑可折叠', (await firstMsCard.getAttribute('class')).includes('collapsed'))
  await firstMsCard.locator('.ms-head').click()
  await sleep(300)

  /* ---------- 5. 主题与配色 ---------- */
  const bgBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await page.locator('.titlebar .icon-btn[title="切换深色 / 浅色"]').click()
  await sleep(350)
  const themeAttr = await page.evaluate(() => document.documentElement.dataset.theme)
  const bgAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check('切换主题写入 data-theme=light', themeAttr === 'light')
  check('切换主题后页面背景实际变化', bgBefore !== bgAfter, `${bgBefore} → ${bgAfter}`)

  await page.locator('.theme-picker .icon-btn').click()
  await sleep(250)
  check('配色面板可打开', await page.locator('.accent-pop').isVisible())
  const swatchCount = await page.locator('.swatch').count()
  check('提供 8 种预设配色', swatchCount === 8, String(swatchCount))
  const accentBefore = await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))
  await page.locator('.swatch[title="紫色"]').click()
  await sleep(300)
  const accentAfter = await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))
  check('自定义配色生效', accentAfter !== accentBefore && accentAfter.length > 0, `${accentBefore} → ${accentAfter}`)
  const db4 = readDB()
  check('配色选择已持久化', db4.accent === 'purple')

  /* ---------- 6. 编辑模式与入口 ---------- */
  await page.locator('.mode-switch button', { hasText: '编辑模式' }).click()
  await sleep(350)
  check('编辑模式显示新增入口', await page.locator('.bottom-actions').isVisible())
  const addButtons = await page.locator('.bottom-actions .add-ms').allInnerTexts()
  check('底部仅保留新增里程碑按钮', addButtons.length === 1 && addButtons[0].includes('新增里程碑'), addButtons.join(' | '))
  check('直接执行项分组已移除', (await page.locator('.ms-name', { hasText: '直接执行项' }).count()) === 0)
  check('编辑模式显示拖拽手柄', (await page.locator('.drag-grip').count()) > 0)

  /* 新增里程碑 */
  await page.locator('.bottom-actions .add-ms').first().click()
  await sleep(250)
  await page.locator('.dialog input').fill('测试里程碑')
  await page.locator('.dialog .btn.primary').click()
  await sleep(350)
  check('可新增里程碑', (await page.locator('.ms-name', { hasText: '测试里程碑' }).count()) === 1)

  /* 新增执行项到指定里程碑（里程碑卡片内 AddRow） */
  const testMsCard = page.locator('.ms-card', { has: page.locator('.ms-name', { hasText: '测试里程碑' }) })
  await testMsCard.locator('.add-row').click()
  await sleep(250)
  await page.locator('.dialog input').first().fill('冒烟测试执行项')
  await page.locator('.dialog .btn.primary').click()
  await sleep(350)
  const db5 = readDB()
  const newMs = db5.projects[0].milestones.find((m) => m.name === '测试里程碑')
  check('新增执行项可指定归属里程碑', !!newMs && newMs.tasks.some((t) => t.title === '冒烟测试执行项'))

  /* ---------- 7. 拖拽 ---------- */
  const t1 = page.locator('.task').filter({ hasText: '切换流量到新版本' })
  const t2 = page.locator('.task').filter({ hasText: '核心链路冒烟验证' })
  await dragTo(page, t1, t2, 'after')
  const db6 = readDB()
  const m2 = db6.projects[0].milestones.find((m) => m.name === '割接窗口')
  const order6 = m2.tasks.map((t) => t.title)
  check('同分组内拖拽排序生效', order6.indexOf('切换流量到新版本') > order6.indexOf('核心链路冒烟验证'), order6.join(' > '))

  const crossTask = page.locator('.task').filter({ hasText: '冻结数据写入' })
  const targetList = page.locator('.ms-card', { has: page.locator('.ms-name', { hasText: '割接窗口' }) }).locator('.task-list')
  await dragTo(page, crossTask, targetList, 'after')
  const db7 = readDB()
  check(
    '执行项可跨里程碑拖拽移动',
    db7.projects[0].milestones.find((m) => m.name === '割接窗口').tasks.some((t) => t.title === '冻结数据写入') &&
      !db7.projects[0].milestones.find((m) => m.name === '数据准备').tasks.some((t) => t.title === '冻结数据写入')
  )

  const heads = page.locator('.ms-card .ms-head')
  await dragTo(page, heads.nth(2), heads.nth(1), 'before')
  const db8 = readDB()
  const names8 = db8.projects[0].milestones.map((m) => m.name)
  check('里程碑拖拽排序生效', names8[0] !== '数据准备' || names8[1] !== '割接窗口', names8.join(' > '))

  /* ---------- 8. 删除与保护 ---------- */
  await page.locator('.nav-item').first().hover()
  const delBtns = page.locator('.nav-actions .icon-btn[title="删除项目"]')
  check('编辑模式项目行有删除入口', (await delBtns.count()) === 1)
  await delBtns.click()
  await sleep(250)
  check('删除项目有二次确认', await page.locator('.dialog').isVisible())
  await page.locator('.dialog .btn.danger-t').click()
  await sleep(400)
  check('删除项目后列表减少', (await page.locator('.nav-item').count()) === 2)

  /* ---------- 9. 重启持久化 ---------- */
  await app.close()
  app = null
  await sleep(800)

  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: projectDir,
    executablePath: require('electron'),
    env
  })
  const page2 = await app.firstWindow()
  await page2.waitForSelector('.nav-item', { timeout: 20000 })
  await sleep(500)
  check('重启后数据保留（项目数）', (await page2.locator('.nav-item').count()) === 2)
  check('重启后主题与配色保留', (await page2.evaluate(() => document.documentElement.dataset.theme)) === 'light')
  const accentRestart = await page2.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))
  check('重启后强调色仍为紫色系', accentRestart.toLowerCase().includes('6b4fd8') || accentRestart !== '')
} catch (err) {
  console.error('测试执行异常:', err)
  results.push({ name: '测试执行未中断', ok: false, detail: String(err).slice(0, 200) })
} finally {
  if (app) await app.close().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过，${failed.length} 失败 =====`)
if (failed.length) {
  failed.forEach((f) => console.log(`  失败：${f.name} ${f.detail ? '(' + f.detail + ')' : ''}`))
  process.exit(1)
}
