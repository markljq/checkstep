/* v1.0.5 新功能测试：分享进度时间线图、步骤编辑与悬停高亮 */
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
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

const userData = mkdtempSync(join(tmpdir(), 'cs-v105-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let app
try {
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), executablePath: require('electron'), env })
  const page = await app.firstWindow()
  await page.bringToFront()
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setSize(1200, 800)
    w.setAlwaysOnTop(true)
    w.show()
    w.focus()
  })
  await page.waitForSelector('.task', { timeout: 20000 })
  await sleep(500)
  // 首次使用指引：关闭
  await page.locator('.dialog-guide .btn.primary').click({ timeout: 3000 }).catch(() => {})
  await sleep(300)

  /* ---------- 1. 分享进度 ---------- */
  console.log('▶ 分享进度时间线图')
  ok((await page.locator('.proj-toolbar .share-btn').count()) === 1, '工具栏存在「分享进度」按钮')
  ok((await page.evaluate(() => typeof window.api.saveImage)) === 'function', 'saveImage IPC 已暴露')
  await page.locator('.proj-toolbar .share-btn').click()
  await sleep(800)
  ok((await page.locator('.dialog-share').count()) === 1, '点击后弹出预览对话框')
  const svgSrc = await page.locator('.share-preview img').getAttribute('src')
  ok(!!svgSrc && svgSrc.startsWith('data:image/svg'), '预览图为矢量 SVG')
  const svgText = decodeURIComponent(svgSrc.replace('data:image/svg+xml;charset=utf-8,', ''))
  ok(svgText.includes('数据准备'), '时间线包含里程碑名称')
  ok(svgText.includes('已完成') && svgText.includes('未执行'), '时间线包含完成状态图例')
  const dim = /width="(\d+)" height="(\d+)"/.exec(svgText)
  const cards = [...svgText.matchAll(/<rect x="134" y="(\d+)" width="\d+" height="\d+" rx="14"/g)]
  const asc = cards.every((m, i) => i === 0 || Number(m[1]) > Number(cards[i - 1][1]))
  ok(!!dim && cards.length >= 2 && asc, `里程碑卡片自上而下排列（${cards.length} 张，画布 ${dim ? dim[1] + '×' + dim[2] : '?'}）`)
  const th0 = await page.evaluate(() => document.documentElement.dataset.theme)
  ok(svgText.includes(`fill="${th0 === 'dark' ? '#1B1C1E' : '#F6F8FB'}"`), `图片底色跟随当前主题（${th0}）`)
  // 在页面内验证 SVG→PNG 转换管线可用（CSP 放行 data: 图片）
  const pngOk = await page.evaluate(async (svg) => {
    try {
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
      const img = new Image()
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('load')); img.src = url })
      const c = document.createElement('canvas')
      c.width = img.naturalWidth * 2
      c.height = img.naturalHeight * 2
      const ctx = c.getContext('2d')
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0)
      const d = c.toDataURL('image/png')
      return d.startsWith('data:image/png') && d.length > 1000
    } catch {
      return false
    }
  }, svgText)
  ok(pngOk, 'SVG→PNG 转换管线可用（CSP 已放行）')
  await page.screenshot({ path: 'tests/shot-share.png' })
  await page.keyboard.press('Escape')
  await sleep(300)
  ok((await page.locator('.dialog-share').count()) === 0, 'Esc 可关闭预览')

  // 切换主题后重新生成，配色应跟随
  await page.locator('.titlebar button[title="切换深色 / 浅色"]').click()
  await sleep(400)
  const th1 = await page.evaluate(() => document.documentElement.dataset.theme)
  await page.locator('.proj-toolbar .share-btn').click()
  await sleep(700)
  const src2 = await page.locator('.share-preview img').getAttribute('src')
  const svg2 = decodeURIComponent(src2.replace('data:image/svg+xml;charset=utf-8,', ''))
  ok(
    th1 !== th0 && svg2.includes(`fill="${th1 === 'dark' ? '#1B1C1E' : '#F6F8FB'}"`),
    `切换主题后图片重绘为新主题（${th1}）`
  )
  await page.screenshot({ path: 'tests/shot-share-' + th1 + '.png' })
  await page.keyboard.press('Escape')
  await sleep(250)
  await page.locator('.titlebar button[title="切换深色 / 浅色"]').click()
  await sleep(350)

  /* ---------- 2. 步骤编辑 ---------- */
  console.log('▶ 步骤编辑')
  await page.locator('.mode-switch button', { hasText: '编辑模式' }).click()
  await sleep(300)
  // 找第一个有步骤的执行项，展开步骤
  const taskWithSteps = page.locator('.task', { has: page.locator('.steps-toggle:not(.ghost)') }).first()
  await taskWithSteps.locator('.steps-toggle').click()
  await sleep(400)
  const stepCount = await taskWithSteps.locator('.step').count()
  ok(stepCount > 0, `展开后可见执行步骤（${stepCount} 条）`)
  // 悬停高亮（CDP 合成鼠标不触发 :hover，改为校验样式规则存在）
  const firstStep = taskWithSteps.locator('.step').first()
  const hoverRule = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const r of sheet.cssRules) {
          if (r.selectorText && r.selectorText.includes('.step:hover') && r.style && r.style.background) return true
        }
      } catch {
        /* 跨域样式表忽略 */
      }
    }
    return false
  })
  ok(hoverRule, '步骤行悬停高亮样式规则已生效（.step:hover 背景色）')
  ok((await firstStep.locator('.s-actions .icon-btn[title="编辑步骤"]').count()) === 1, '悬停显示编辑按钮')
  ok((await firstStep.locator('.s-actions .icon-btn[title="删除步骤"]').count()) === 1, '悬停显示删除按钮')
  // 编辑内容
  const oldText = (await firstStep.textContent()) ?? ''
  await firstStep.locator('.s-actions .icon-btn[title="编辑步骤"]').click()
  await sleep(400)
  ok((await page.locator('.dialog h3', { hasText: '编辑步骤' }).count()) === 1, '点击编辑弹出对话框')
  const input = page.locator('.dialog input[name="content"]')
  const oldVal = await input.inputValue()
  ok(oldText.includes(oldVal), '对话框预填原步骤内容')
  await input.fill('已修改的步骤内容XYZ')
  await page.locator('.dialog .btn.primary').click()
  await sleep(400)
  const newText = (await taskWithSteps.locator('.step').first().textContent()) ?? ''
  ok(newText.includes('已修改的步骤内容XYZ'), '步骤内容已更新')
  // 编辑模式之外按钮不可见
  await page.locator('.mode-switch button', { hasText: '执行模式' }).click()
  await sleep(300)
  await firstStep.hover()
  await sleep(200)
  ok((await firstStep.locator('.s-actions').count()) === 0, '执行模式下步骤不显示编辑/删除按钮')

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exitCode = fail ? 1 : 0
} catch (e) {
  console.error('测试异常：', e)
  process.exitCode = 1
} finally {
  await app.close().catch(() => {})
}
