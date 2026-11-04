/* v1.0.4 四项优化测试：首次指引、吸顶头部、全部折叠/展开、悬浮待办定位 */
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

const userData = mkdtempSync(join(tmpdir(), 'cs-v104-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let app
try {
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
  const page = await app.firstWindow()
  await page.bringToFront()
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setAlwaysOnTop(true)
    w.show()
    w.focus()
  })
  await page.waitForSelector('.nav-item', { timeout: 20000 })
  await sleep(500)
  const readDB = () => JSON.parse(readFileSync(join(userData, 'data', 'checkstep.json'), 'utf-8'))

  /* ---------- 1. 首次使用指引 ---------- */
  console.log('▶ 首次使用指引')
  ok((await page.locator('.dialog-guide').count()) === 1, '首次打开显示使用指引')
  ok((await page.locator('.guide-item').count()) === 4, '指引包含 4 条使用说明')
  await page.locator('.dialog-guide .btn.primary').click()
  await sleep(400)
  ok((await page.locator('.dialog-guide').count()) === 0, '点击「开始使用」后指引关闭')
  ok(readDB().guideSeen === true, 'guideSeen 已持久化')
  // 重启后不再显示
  await app.close()
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
  const page2 = await app.firstWindow()
  await page2.bringToFront()
  await page2.waitForSelector('.task', { timeout: 20000 })
  await sleep(800)
  ok((await page2.locator('.dialog-guide').count()) === 0, '重启后不再显示指引')

  /* ---------- 2. 吸顶头部 / 模式提醒移除 ---------- */
  console.log('▶ 吸顶头部与移除项')
  ok((await page2.locator('.mode-hint').count()) === 0, '进度条下方的模式提醒已移除')
  ok((await page2.locator('.main-search').count()) === 0, '内容区搜索框已移除')
  ok((await page2.locator('.proj-top .overall').count()) === 1, '进度条位于吸顶头部内')
  await page2.evaluate(() => document.querySelector('.main').scrollTop = 400)
  await sleep(300)
  const stuckOn = await page2.evaluate(() => {
    const el = document.querySelector('.proj-top')
    return getComputedStyle(el).position === 'sticky' && el.classList.contains('stuck')
  })
  ok(stuckOn, '滚动后头部吸附顶部并显示阴影')
  const topVisible = await page2.evaluate(() => {
    const r = document.querySelector('.proj-top').getBoundingClientRect()
    const m = document.querySelector('.main').getBoundingClientRect()
    return Math.abs(r.top - m.top) < 2
  })
  ok(topVisible, '滚动后标题与进度条仍贴住内容区顶部（吸顶）')

  /* ---------- 3. 全部折叠 / 全部展开 ---------- */
  console.log('▶ 全部折叠 / 展开')
  const msTotal = await page2.locator('.ms-card').count()
  ok(msTotal >= 2, `存在里程碑卡片（${msTotal}）`)
  await page2.locator('.proj-toolbar .btn', { hasText: '全部折叠' }).click()
  await sleep(500)
  const collapsedCount = await page2.locator('.ms-card.collapsed').count()
  ok(collapsedCount === msTotal, `全部折叠后所有卡片折叠（${collapsedCount}/${msTotal}）`)
  const contentH = await page2.evaluate(() => document.querySelector('.main').scrollHeight)
  await page2.locator('.proj-toolbar .btn', { hasText: '全部展开' }).click()
  await sleep(500)
  const collapsedAfter = await page2.locator('.ms-card.collapsed').count()
  ok(collapsedAfter === 0, '全部展开后无折叠卡片')
  const contentH2 = await page2.evaluate(() => document.querySelector('.main').scrollHeight)
  ok(contentH2 > contentH, '展开后内容高度增加')

  /* ---------- 4. 悬浮待办定位 ---------- */
  console.log('▶ 悬浮待办定位')
  // 把首个待办之外的所有待办勾完，让页面底部只剩已完成项
  const pendingCount = await page2.locator('.task:not(.done) .check').count()
  ok(pendingCount >= 2, `存在多个未执行项（${pendingCount}）`)
  for (let i = 1; i < pendingCount; i++) {
    await page2.locator('.task:not(.done) .check').nth(1).click()
    await sleep(250)
  }
  ok((await page2.locator('.task:not(.done)').count()) === 1, '仅剩最早一个待办')
  // 滚到底部让视口内没有未执行项
  await page2.evaluate(() => {
    const m = document.querySelector('.main')
    m.scrollTop = m.scrollHeight
  })
  await sleep(600)
  const fabShown = (await page2.locator('.jump-fab').count()) === 1
  ok(fabShown, '视口内无未执行项时显示悬浮按钮')
  if (fabShown) {
    await page2.locator('.jump-fab').click()
    await sleep(1600)
    const after = await page2.evaluate(() => {
      const flash = document.querySelector('.task.locate-flash')
      const m = document.querySelector('.main')
      return {
        hasFlash: !!flash,
        scrollTop: m.scrollTop,
        rectTop: flash ? flash.getBoundingClientRect().top : -1,
        viewH: m.clientHeight
      }
    })
    ok(after.hasFlash, '定位后目标执行项高亮')
    ok(after.rectTop > 80 && after.rectTop < after.viewH, `目标执行项进入视口（top=${Math.round(after.rectTop)}）`)
    const isEarliest = await page2.evaluate(() => {
      const first = document.querySelector('.task:not(.done)')
      return first?.classList.contains('locate-flash')
    })
    ok(isEarliest, '定位的正是最早未执行的执行项')
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exitCode = fail ? 1 : 0
} catch (e) {
  console.error('测试异常：', e)
  process.exitCode = 1
} finally {
  await app.close().catch(() => {})
}
