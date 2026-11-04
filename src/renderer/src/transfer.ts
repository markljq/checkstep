import { appendProjects, buildMarkdown, getDB, normalizeDB, replaceAll, stamp } from './store'
import type { Project } from './types'
import { openConfirm, openForm, toast } from './components/Dialogs'

/** 去掉文件名非法字符 */
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'CheckStep'
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

const JSON_FILTER = [{ name: 'CheckStep 数据', extensions: ['json'] }]

/* ---------------- 导出 ---------------- */

export async function exportJSON(scope: 'all' | 'current'): Promise<void> {
  const db = getDB()
  if (!db) return
  const project = db.projects.find((p) => p.id === db.currentProjectId) ?? db.projects[0]
  const payload =
    scope === 'all' || !project
      ? db
      : {
          projects: [project],
          currentProjectId: project.id,
          mode: db.mode,
          theme: db.theme,
          accent: db.accent
        }
  const name =
    scope === 'all' || !project ? `CheckStep-全部项目-${stamp()}.json` : `CheckStep-${safeName(project.name)}-${stamp()}.json`
  const res = await window.api.saveText({
    title: '导出 CheckStep 数据',
    defaultName: name,
    filters: JSON_FILTER,
    content: JSON.stringify(payload, null, 2)
  })
  if (res.canceled) return
  if (!res.ok) {
    toast('导出失败：' + (res.error ?? '未知错误'))
    return
  }
  toast('已导出 JSON：' + baseName(res.path ?? name))
}

export async function exportMarkdown(): Promise<Project | null> {
  const db = getDB()
  if (!db) return null
  const project = db.projects.find((p) => p.id === db.currentProjectId) ?? db.projects[0]
  if (!project) {
    toast('没有可导出的项目')
    return null
  }
  const res = await window.api.saveText({
    title: '导出 Markdown 清单',
    defaultName: `CheckStep-${safeName(project.name)}-${stamp()}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    content: buildMarkdown(project)
  })
  if (res.canceled) return project
  if (!res.ok) {
    toast('导出失败：' + (res.error ?? '未知错误'))
    return project
  }
  toast('已导出 Markdown：' + baseName(res.path ?? ''))
  return project
}

/* ---------------- 导入 ---------------- */

export async function importJSON(): Promise<void> {
  const res = await window.api.openText({ title: '导入 CheckStep 数据', filters: JSON_FILTER })
  if (res.canceled) return
  if (!res.ok) {
    toast('读取文件失败：' + (res.error ?? '未知错误'))
    return
  }
  let raw: unknown
  try {
    raw = JSON.parse(res.content ?? '')
  } catch {
    toast('文件不是有效的 JSON，导入已取消')
    return
  }
  const probe = normalizeDB(raw)
  if (!probe) {
    toast('文件结构不匹配（缺少 projects 数组），导入已取消')
    return
  }
  const projectCount = probe.projects.length
  const taskCount = probe.projects.reduce(
    (n, p) => n + p.milestones.reduce((m, ms) => m + ms.tasks.length, 0),
    0
  )

  openForm(
    '导入 CheckStep 数据',
    [
      { key: 'info', label: `文件「${baseName(res.path ?? '')}」包含 ${projectCount} 个项目、${taskCount} 个执行项。`, type: 'hint' },
      {
        key: 'mode',
        label: '导入方式',
        type: 'select',
        options: [
          { value: 'append', label: '追加为新项目（保留现有数据）' },
          { value: 'replace', label: '替换全部数据（覆盖现有清单）' }
        ]
      }
    ],
    (v) => {
      if (v.mode === 'replace') {
        openConfirm(
          '替换全部数据？',
          '当前所有项目、里程碑与执行项将被导入文件覆盖，且不可恢复。建议先导出 JSON 备份。',
          () => {
            if (replaceAll(raw)) toast(`已导入并替换：${projectCount} 个项目`)
            else toast('导入失败：数据无法识别')
          },
          '替换'
        )
        return
      }
      const n = appendProjects(raw)
      if (n) toast(`已追加导入 ${n} 个项目`)
      else toast('导入失败：数据无法识别')
    }
  )
}
