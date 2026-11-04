/**
 * 生成 README 所需截图：主界面（深色/浅色）、编辑模式、分享进度弹窗与时间线 PNG。
 * 运行：node scripts/gen-screenshots.mjs
 * 使用临时 userData，不触碰真实用户数据。
 */
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const userData = mkdtempSync(join(tmpdir(), 'checkstep-shot-'))
const outDir = join(root, 'docs', 'images')
mkdirSync(outDir, { recursive: true })
mkdirSync(join(userData, 'data'), { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const task = (title, note, done, doneAt, steps = []) => ({
  id: Math.random().toString(36).slice(2, 10),
  title,
  note,
  done,
  doneAt,
  steps: steps.map((s) => ({ id: Math.random().toString(36).slice(2, 10), content: s[0], done: !!s[1] }))
})

const demo = {
  projects: [
    {
      id: 'p1',
      name: '订单中台 V3.0 上线',
      desc: '2026-11-06 22:00 割接窗口 · 负责人：张工',
      milestones: [
        {
          id: 'm1',
          name: '上线前准备',
          tasks: [
            task('通知相关方上线窗口时间', '邮件 + 群公告，确认值班表', true, '2026-11-04 10:12:33'),
            task('备份生产库并校验备份', '全量 dump 与 MD5 比对', true, '2026-11-04 14:26:08', [
              ['导出全量备份 dump', true],
              ['比对 MD5 与记录数', true]
            ]),
            task('冻结数据写入', '通知业务方停止写入，确认无新增连接', true, '2026-11-04 21:03:47', [
              ['发布停写公告', true],
              ['关闭应用写入开关', true],
              ['确认无新增连接', false]
            ]),
            task('准备回滚方案与快照', '镜像 tag、回滚脚本、数据库快照', true, '2026-11-04 21:40:15')
          ]
        },
        {
          id: 'm2',
          name: '割接执行',
          tasks: [
            task('部署新版本到生产集群', '灰度 2 个节点', false, null, [
              ['推送镜像到生产仓库'],
              ['更新部署清单'],
              ['滚动重启并健康检查']
            ]),
            task('切换流量到新版本', '', false, null, [
              ['灰度 10% 观察 5 分钟'],
              ['全量切换'],
              ['确认网关无 5xx 激增']
            ]),
            task('核心链路冒烟验证', '登录、下单、支付、退款', false, null),
            task('数据一致性抽检', '抽取 100 笔订单比对金额与状态', false, null)
          ]
        },
        {
          id: 'm3',
          name: '上线后验证',
          tasks: [
            task('观察错误率与耗时 30 分钟', '看板：错误率 < 0.1%，P99 < 800ms', false, null),
            task('开放流量并解除数据冻结', '', false, null),
            task('输出上线报告', '含问题清单与后续动作', false, null)
          ]
        }
      ]
    },
    {
      id: 'p2',
      name: '网关升级割接',
      desc: '逐台滚动重启',
      milestones: [
        {
          id: 'm4',
          name: '割接执行',
          tasks: [
            task('升级前配置快照', '', true, '2026-11-03 09:12:40'),
            task('逐台滚动重启节点', '', true, '2026-11-03 10:02:11', [['摘除节点流量', true], ['重启并健康检查', true]]),
            task('观察错误率 30 分钟', '', false, null)
          ]
        }
      ]
    },
    {
      id: 'p3',
      name: '数据库迁移（已完成）',
      desc: '2026-10-30 收尾',
      milestones: [
        {
          id: 'm5',
          name: '迁移收尾',
          tasks: [
            task('新旧库数据比对', '', true, '2026-10-30 15:20:00'),
            task('应用切换连接串', '', true, '2026-10-30 16:05:31')
          ]
        }
      ]
    }
  ],
  currentProjectId: 'p1',
  mode: 'execute',
  theme: 'dark',
  accent: 'blue',
  guideSeen: true
}
writeFileSync(join(userData, 'data', 'checkstep.json'), JSON.stringify(demo, null, 2), 'utf-8')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: root,
  executablePath: require('electron'),
  env
})
const page = await app.firstWindow()
await page.bringToFront()
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  w.setSize(1440, 940)
  w.center()
  w.show()
  w.focus()
})
await page.waitForSelector('.task', { timeout: 20000 })
await page.locator('.dialog-guide .btn.primary').click({ timeout: 2000 }).catch(() => {})
await sleep(900)

// 1. 深色主界面
await page.screenshot({ path: join(outDir, 'main-dark.png') })

// 2. 展开一个带步骤的执行项，展示步骤清单
await page.locator('.task').filter({ hasText: '冻结数据写入' }).locator('.steps-toggle').click()
await sleep(500)
await page.screenshot({ path: join(outDir, 'main-dark-steps.png') })
await page.locator('.task').filter({ hasText: '冻结数据写入' }).locator('.steps-toggle').click()
await sleep(400)

// 3. 编辑模式
await page.locator('.mode-switch button', { hasText: '编辑模式' }).click()
await sleep(600)
await page.screenshot({ path: join(outDir, 'main-edit.png') })
await page.locator('.mode-switch button', { hasText: '执行模式' }).click()
await sleep(500)

// 4. 浅色主题
await page.locator('.icon-btn[title="切换深色 / 浅色"]').click()
await sleep(900)
await page.screenshot({ path: join(outDir, 'main-light.png') })

// 5. 分享进度弹窗（浅色）
await page.locator('.share-btn').click()
await page.waitForSelector('.dialog-share', { timeout: 5000 })
await sleep(700)
await page.screenshot({ path: join(outDir, 'share-dialog-light.png') })

// 6. 单独导出时间线图 PNG（2x）
const svg = await page.locator('.share-preview img').getAttribute('src')
const pngBase64 = await page.evaluate(async (src) => {
  const img = new Image()
  await new Promise((res, rej) => {
    img.onload = res
    img.onerror = () => rej(new Error('load fail'))
    img.src = src
  })
  const c = document.createElement('canvas')
  c.width = img.naturalWidth * 2
  c.height = img.naturalHeight * 2
  const ctx = c.getContext('2d')
  ctx.scale(2, 2)
  ctx.drawImage(img, 0, 0)
  return c.toDataURL('image/png').split(',')[1]
}, svg)
writeFileSync(join(outDir, 'share-timeline-light.png'), Buffer.from(pngBase64, 'base64'))

await page.keyboard.press('Escape')
await sleep(300)

// 7. 深色下的分享弹窗
await page.locator('.icon-btn[title="切换深色 / 浅色"]').click()
await sleep(800)
await page.locator('.share-btn').click()
await page.waitForSelector('.dialog-share', { timeout: 5000 })
await sleep(600)
await page.screenshot({ path: join(outDir, 'share-dialog-dark.png') })

console.log('截图已生成 ->', outDir)
await app.close()
