/**
 * 新增功能测试：导入 / 导出 / 完成时间可编辑
 * 运行：node tests/features.mjs
 * 通过 app.evaluate 替换主进程 dialog 方法，避免原生对话框阻塞自动化。
 */
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'module'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const projectDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const userData = mkdtempSync(join(tmpdir(), 'checkstep-feat-'))
const workDir = mkdtempSync(join(tmpdir(), 'checkstep-io-'))
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

const jsonOut = join(workDir, 'all.json')
const mdOut = join(workDir, 'checklist.md')
const importIn = join(workDir, 'import.json')
const badIn = join(workDir, 'bad.json')

const fixture = {
  projects: [
    {
      id: 'ip1',
      name: '导入的项目',
      desc: '来自备份文件',
      milestones: [
        {
          id: 'im1',
          name: '导入里程碑',
          tasks: [
            { id: 'it1', title: '导入执行项A', note: '备注A', done: true, doneAt: '2026-10-01 08:30:00', steps: [{ id: 'is1', content: '步骤一', done: true }] },
            { title: '导入执行项B（缺 id）', done: false, steps: [] }
          ]
        }
      ],
      tasks: [{ title: '导入的直接执行项' }] // 旧版字段：导入时应被丢弃
    }
  ]
}
writeFileSync(importIn, JSON.stringify(fixture, null, 2), 'utf-8')
writeFileSync(badIn, '{ this is not json ', 'utf-8')

async function stubDialogs(app, savePath, openPath) {
  await app.evaluate(
    ({ dialog }, paths) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.save })
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.open] })
    },
    { save: savePath, open: openPath }
  )
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

  /* ---------- 1. 完成时间可编辑 ---------- */
  const target = page.locator('.task').filter({ hasText: '冻结数据写入' })
  await target.locator('.check').click()
  await sleep(350)
  const before = readDB().projects[0].milestones[0].tasks.find((t) => t.title === '冻结数据写入')
  check('勾选后自动写入完成时间', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(before.doneAt ?? ''), String(before.doneAt))

  check('已完成项显示时间编辑入口', (await target.locator('.time-edit').count()) === 1)
  await target.locator('.task-row').hover()
  await target.locator('.time-edit').click()
  await sleep(300)
  const dtInput = page.locator('.dialog input[type="datetime-local"]')
  check('点击后弹出时间选择器', (await dtInput.count()) === 1)
  const prefill = await dtInput.inputValue()
  check('对话框回填当前完成时间', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(prefill), prefill)

  await dtInput.fill('2026-01-02T03:04')
  await page.locator('.dialog .btn.primary').click()
  await sleep(400)
  const edited = readDB().projects[0].milestones[0].tasks.find((t) => t.title === '冻结数据写入')
  check('完成时间可修改并持久化', edited.doneAt === `2026-01-02 03:04:${String(before.doneAt).slice(17, 19)}`, String(edited.doneAt))
  check('界面同步显示新时间', (await target.locator('.t-doneat').innerText()).includes('2026-01-02 03:04'))
  check('修改时间不影响完成状态', edited.done === true)

  /* ---------- 2. 导出 JSON（全部项目） ---------- */
  await stubDialogs(app, jsonOut, importIn)
  await page.locator('.io-trigger').click()
  await sleep(250)
  check('导入/导出面板可打开', await page.locator('.io-pop').isVisible())
  await page.locator('.io-item', { hasText: 'JSON 备份' }).click()
  await sleep(700)
  check('导出 JSON 文件已生成', existsSync(jsonOut))
  const exported = JSON.parse(readFileSync(jsonOut, 'utf-8'))
  check('导出的 JSON 含全部项目', Array.isArray(exported.projects) && exported.projects.length === 3, String(exported.projects?.length))
  check('导出的 JSON 保留完成时间', exported.projects[0].milestones[0].tasks.some((t) => t.doneAt === `${'2026-01-02 03:04'}:${String(before.doneAt).slice(17, 19)}`))

  /* ---------- 3. 导出 Markdown（当前项目） ---------- */
  await stubDialogs(app, mdOut, importIn)
  await page.locator('.io-trigger').click()
  await sleep(200)
  await page.locator('.io-item', { hasText: 'Markdown' }).click()
  await sleep(700)
  check('导出 Markdown 文件已生成', existsSync(mdOut))
  const md = readFileSync(mdOut, 'utf-8')
  check('Markdown 含项目标题', md.startsWith('# XX 系统 V2.0 上线'), md.split('\n')[0])
  check('Markdown 含里程碑小节', md.includes('## 里程碑 · 数据准备'))
  check('Markdown 用勾选框标记完成状态', md.includes('- [x] 校验数据文件完整性'))
  check('Markdown 记录完成时间', /完成于 2026-11-02 21:04:11/.test(md))
  check('Markdown 含执行步骤', md.includes('导出全量备份 dump'))

  /* ---------- 4. 导入：追加 ---------- */
  const navBefore = await page.locator('.nav-item').count()
  await page.locator('.io-trigger').click()
  await sleep(200)
  await page.locator('.io-item', { hasText: '从 JSON 文件导入' }).click()
  await sleep(600)
  check('导入对话框显示文件摘要', (await page.locator('.dlg-hint').innerText()).includes('1 个项目'), await page.locator('.dlg-hint').innerText())
  check('导入默认方式为追加', (await page.locator('.dialog select').inputValue()) === 'append')
  await page.locator('.dialog .btn.primary').click()
  await sleep(600)
  check('追加导入后项目数 +1', (await page.locator('.nav-item').count()) === navBefore + 1)
  const dbAfterImport = readDB()
  const imported = dbAfterImport.projects.find((p) => p.name === '导入的项目')
  check('导入的项目结构完整', !!imported && imported.milestones[0].tasks.length === 2)
  check('旧版直接执行项已按新规则丢弃', !!imported && imported.tasks === undefined)
  check('缺失 id 的条目已自动补齐', !!imported && imported.milestones[0].tasks.every((t) => typeof t.id === 'string' && t.id.length > 0))
  check('导入后自动选中新项目', dbAfterImport.currentProjectId === imported?.id)
  check('导入数据中的完成时间保留', imported?.milestones[0].tasks[0].doneAt === '2026-10-01 08:30:00')

  const importedTasks = await page.locator('.task').count()
  check('导入项目在主区域渲染', importedTasks === 2, String(importedTasks))

  /* ---------- 5. 导入：非法 JSON 防护 ---------- */
  await stubDialogs(app, jsonOut, badIn)
  const navBeforeBad = await page.locator('.nav-item').count()
  await page.locator('.io-trigger').click()
  await sleep(200)
  await page.locator('.io-item', { hasText: '从 JSON 文件导入' }).click()
  await sleep(600)
  check('非法 JSON 不会弹出导入选项', (await page.locator('.dialog').count()) === 0)
  check('非法 JSON 给出提示', (await page.locator('.toast').innerText()).includes('不是有效的 JSON'))
  check('非法导入不改变数据', (await page.locator('.nav-item').count()) === navBeforeBad)

  /* ---------- 6. 导入：替换全部 ---------- */
  await stubDialogs(app, jsonOut, importIn)
  await page.locator('.io-trigger').click()
  await sleep(200)
  await page.locator('.io-item', { hasText: '从 JSON 文件导入' }).click()
  await sleep(600)
  await page.locator('.dialog select').selectOption('replace')
  await page.locator('.dialog .btn.primary').click()
  await sleep(400)
  check('替换模式需要二次确认', (await page.locator('.dialog .btn.danger-t').count()) === 1)
  await page.locator('.dialog .btn.danger-t').click()
  await sleep(600)
  const dbAfterReplace = readDB()
  check('替换后仅保留导入的项目', dbAfterReplace.projects.length === 1 && dbAfterReplace.projects[0].name === '导入的项目', String(dbAfterReplace.projects.length))
  check('替换后侧栏同步', (await page.locator('.nav-item').count()) === 1)

  /* ---------- 7. 重启后数据仍正确 ---------- */
  await app.close()
  app = null
  await sleep(700)
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: projectDir,
    executablePath: require('electron'),
    env
  })
  const page2 = await app.firstWindow()
  await page2.waitForSelector('.nav-item', { timeout: 20000 })
  await sleep(500)
  check('重启后导入的数据仍在', (await page2.locator('.nav-item').count()) === 1)
  check('重启后导入项目的执行项渲染正常', (await page2.locator('.task').count()) === 2)
  const doneTexts = await page2.locator('.t-doneat').allInnerTexts()
  check('重启后完成时间显示正确', doneTexts.some((t) => t.includes('2026-10-01 08:30:00')), doneTexts.join(' | '))
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
