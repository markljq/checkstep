import { useSyncExternalStore } from 'react'
import type { AccentKey, DB, Milestone, Project, Task } from './types'

/* ---------- 主题色方案 ---------- */
export interface AccentDef {
  name: string
  dark: string
  darkOn: string
  light: string
  lightOn: string
}

export const ACCENTS: Record<AccentKey, AccentDef> = {
  blue: { name: '默认蓝', dark: '#4CC2FF', darkOn: '#003E5B', light: '#0067C0', lightOn: '#FFFFFF' },
  teal: { name: '青绿', dark: '#4AD2A8', darkOn: '#00312A', light: '#0E7A5F', lightOn: '#FFFFFF' },
  purple: { name: '紫色', dark: '#B79CFF', darkOn: '#2A1A5E', light: '#6B4FD8', lightOn: '#FFFFFF' },
  pink: { name: '粉色', dark: '#FF9CC0', darkOn: '#4A1029', light: '#C93A72', lightOn: '#FFFFFF' },
  orange: { name: '橙色', dark: '#FFB86B', darkOn: '#3D2200', light: '#C2610C', lightOn: '#FFFFFF' },
  green: { name: '绿色', dark: '#8FD968', darkOn: '#1D3200', light: '#4E8A1B', lightOn: '#FFFFFF' },
  gold: { name: '金色', dark: '#F2D15C', darkOn: '#3A2C00', light: '#9A7412', lightOn: '#FFFFFF' },
  red: { name: '红色', dark: '#FF8C8C', darkOn: '#4A0F0F', light: '#C42B1C', lightOn: '#FFFFFF' }
}

let db: DB | null = null
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore(): DB | null {
  return useSyncExternalStore(subscribe, () => db)
}

export function getDB(): DB | null {
  return db
}

export async function initStore(): Promise<void> {
  try {
    db = ((await window.api.load()) as DB | null) || seed()
  } catch {
    db = seed()
  }
  if (!db.mode) db.mode = 'execute'
  if (!db.accent) db.accent = 'blue'
  if (!db.theme) db.theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  // 兼容旧数据：旧版本的"直接执行项"（未分组执行项）已废弃，加载时丢弃
  for (const p of db.projects) {
    delete (p as unknown as Record<string, unknown>).tasks
  }
  emit()
}

/** 不可变更新 + 自动持久化到本地 JSON */
export function update(fn: (draft: DB) => void): void {
  if (!db) return
  const next: DB = structuredClone(db)
  fn(next)
  db = next
  emit()
  void window.api.save(db)
}

export function resetToSeed(): void {
  db = seed()
  emit()
  void window.api.save(db)
}

/** 用外部数据整体替换（含主题等偏好），返回是否成功 */
export function replaceAll(raw: unknown): boolean {
  const next = normalizeDB(raw, false)
  if (!next) return false
  db = next
  emit()
  void window.api.save(db)
  return true
}

/** 追加导入的项目（全部生成新 id，避免与现有数据冲突），返回追加数量 */
export function appendProjects(raw: unknown): number {
  const next = normalizeDB(raw, true)
  if (!next) return 0
  const base = db ?? seed()
  db = {
    ...base,
    projects: [...base.projects, ...next.projects],
    currentProjectId: next.projects[0].id
  }
  emit()
  void window.api.save(db)
  return next.projects.length
}

/* ---------- 工具 ---------- */
export const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export function now(): string {
  const d = new Date()
  const z = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`
}

export function allTasks(p: Project): Task[] {
  return p.milestones.flatMap((m) => m.tasks)
}

export function doneCount(tasks: Task[]): number {
  return tasks.filter((t) => t.done).length
}

export function useProject(): Project | null {
  const d = useStore()
  if (!d) return null
  return d.projects.find((p) => p.id === d.currentProjectId) || d.projects[0] || null
}

export function findTask(tid: string): { task: Task; project: Project } | null {
  const d = db
  if (!d) return null
  for (const p of d.projects) {
    for (const m of p.milestones) {
      const t = m.tasks.find((x) => x.id === tid)
      if (t) return { task: t, project: p }
    }
  }
  return null
}

export function findMilestone(mid: string): { milestone: Milestone; project: Project } | null {
  const d = db
  if (!d) return null
  for (const p of d.projects) {
    const m = p.milestones.find((x) => x.id === mid)
    if (m) return { milestone: m, project: p }
  }
  return null
}

/* ---------- 拖拽排序 / 跨分组移动 ---------- */

function groupArray(p: Project, groupId: string): Task[] | null {
  return p.milestones.find((m) => m.id === groupId)?.tasks ?? null
}

/** 把执行项移动到指定里程碑的第 index 位 */
export function moveTaskTo(projectId: string, taskId: string, targetGroup: string, index: number): void {
  update((draft) => {
    const p = draft.projects.find((x) => x.id === projectId)
    if (!p) return

    // 先从原位置摘除
    let moving: Task | null = null
    let sourceGroup = ''
    let sourceIndex = -1
    for (const m of p.milestones) {
      const i = m.tasks.findIndex((t) => t.id === taskId)
      if (i >= 0) {
        moving = m.tasks[i]
        sourceGroup = m.id
        sourceIndex = i
        m.tasks.splice(i, 1)
        break
      }
    }
    if (!moving) return

    const target = groupArray(p, targetGroup)
    if (!target) {
      // 目标分组不存在（可能刚被删除）：放回原处
      groupArray(p, sourceGroup)?.splice(sourceIndex, 0, moving)
      return
    }
    let at = Number.isFinite(index) && index >= 0 ? index : target.length
    if (sourceGroup === targetGroup && sourceIndex < at) at -= 1 // 同组内下移时索引回退
    at = Math.max(0, Math.min(at, target.length))
    target.splice(at, 0, moving)
  })
}

/** 调整里程碑顺序 */
export function moveMilestoneTo(projectId: string, milestoneId: string, targetIndex: number): void {
  update((draft) => {
    const p = draft.projects.find((x) => x.id === projectId)
    if (!p) return
    const from = p.milestones.findIndex((m) => m.id === milestoneId)
    if (from < 0) return
    const [m] = p.milestones.splice(from, 1)
    let at = from < targetIndex ? targetIndex - 1 : targetIndex
    at = Math.max(0, Math.min(at, p.milestones.length))
    p.milestones.splice(at, 0, m)
  })
}

/* ---------- 完成时间转换 ---------- */
const pad2 = (n: number): string => String(n).padStart(2, '0')

/** 'YYYY-MM-DD HH:mm:ss' → <input type="datetime-local"> 需要的 'YYYY-MM-DDTHH:mm' */
export function toInputValue(v: string | null): string {
  if (!v) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(v)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : ''
}

/** 'YYYY-MM-DDTHH:mm' → 'YYYY-MM-DD HH:mm:ss'（秒沿用原值，缺省 00） */
export function fromInputValue(v: string, prev: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v.trim())
  if (!m) return ''
  const sec = prev && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(prev) ? prev.slice(17, 19) : '00'
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${sec}`
}

export function isValidDateTime(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return false
  const d = new Date(v.replace(' ', 'T'))
  return !Number.isNaN(d.getTime()) && Number(v.slice(0, 4)) > 1970
}

/** 默认导出文件名用的时间戳 */
export function stamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`
}

/* ---------- 导出 Markdown 清单 ---------- */
function taskLines(t: Task, out: string[], indent: string): void {
  const when = t.done && t.doneAt ? ` — 完成于 ${t.doneAt}` : ''
  out.push(`${indent}- ${t.done ? '[x]' : '[ ]'} ${t.title}${when}`)
  if (t.note) out.push(`${indent}  - 备注：${t.note}`)
  for (const s of t.steps) out.push(`${indent}  - ${s.done ? '[x]' : '[ ]'} ${s.content}`)
}

export function buildMarkdown(p: Project): string {
  const all = allTasks(p)
  const dn = doneCount(all)
  const out: string[] = []
  out.push(`# ${p.name}`)
  out.push('')
  if (p.desc) {
    out.push(`> ${p.desc}`)
    out.push('')
  }
  out.push(`- 导出时间：${now()}`)
  out.push(`- 完成进度：${dn}/${all.length}（${all.length ? Math.round((dn / all.length) * 100) : 0}%）`)
  out.push('')
  for (const m of p.milestones) {
    out.push(`## 里程碑 · ${m.name}（${doneCount(m.tasks)}/${m.tasks.length}）`)
    out.push('')
    if (!m.tasks.length) out.push('_暂无执行项_')
    else m.tasks.forEach((t) => taskLines(t, out, ''))
    out.push('')
  }
  return out.join('\n')
}

/* ---------- 导入：结构校验与规范化 ---------- */
const ACCENT_KEYS: AccentKey[] = ['blue', 'teal', 'purple', 'pink', 'orange', 'green', 'gold', 'red']

function normText(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

function normTasks(raw: unknown, freshIds: boolean): Task[] {
  if (!Array.isArray(raw)) return []
  const list: Task[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const title = normText(o.title)
    if (!title) continue
    const done = o.done === true
    const doneAt = done && typeof o.doneAt === 'string' && isValidDateTime(o.doneAt) ? o.doneAt : null
    const steps = Array.isArray(o.steps)
      ? o.steps
          .filter((s) => s && typeof s === 'object' && normText((s as Record<string, unknown>).content))
          .map((s) => {
            const so = s as Record<string, unknown>
            return {
              id: freshIds || typeof so.id !== 'string' ? uid() : so.id,
              content: normText(so.content),
              done: so.done === true
            }
          })
      : []
    list.push({
      id: freshIds || typeof o.id !== 'string' ? uid() : (o.id as string),
      title,
      note: typeof o.note === 'string' ? o.note : '',
      done,
      doneAt,
      steps
    })
  }
  return list
}

/** 校验并规范化外部 JSON；无法识别时返回 null */
export function normalizeDB(raw: unknown, freshIds = false): DB | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.projects)) return null
  const projects: Project[] = []
  for (const rp of o.projects) {
    if (!rp || typeof rp !== 'object') continue
    const po = rp as Record<string, unknown>
    const milestones: Milestone[] = []
    if (Array.isArray(po.milestones)) {
      for (const rm of po.milestones) {
        if (!rm || typeof rm !== 'object') continue
        const mo = rm as Record<string, unknown>
        milestones.push({
          id: freshIds || typeof mo.id !== 'string' ? uid() : mo.id,
          name: normText(mo.name, '未命名里程碑'),
          tasks: normTasks(mo.tasks, freshIds)
        })
      }
    }
    projects.push({
      id: freshIds || typeof po.id !== 'string' ? uid() : po.id,
      name: normText(po.name, '未命名项目'),
      desc: typeof po.desc === 'string' ? po.desc : '',
      milestones
      // 注：旧版数据中未分组的 tasks（直接执行项）已废弃，导入时丢弃
    })
  }
  if (!projects.length) return null
  return {
    projects,
    currentProjectId: projects[0].id,
    mode: o.mode === 'edit' ? 'edit' : 'execute',
    theme: o.theme === 'light' ? 'light' : 'dark',
    accent: ACCENT_KEYS.includes(o.accent as AccentKey) ? (o.accent as AccentKey) : 'blue',
    guideSeen: o.guideSeen === true
  }
}

/* ---------- 演示种子数据 ---------- */
function seed(): DB {
  const t = (title: string, note = '', done = false, doneAt: string | null = null, steps: { c: string; d?: boolean }[] = []): Task => ({
    id: uid(),
    title,
    note,
    done,
    doneAt,
    steps: steps.map((s) => ({ id: uid(), content: s.c, done: !!s.d }))
  })
  return {
    projects: [
      {
        id: 'p1',
        name: 'XX 系统 V2.0 上线',
        desc: '2026-11-05 22:00 割接窗口',
        milestones: [
          {
            id: 'm1',
            name: '数据准备',
            tasks: [
              t('通知相关方上线窗口时间'),
              t('校验数据文件完整性', '比对 MD5 清单', true, '2026-11-02 21:04:11'),
              t('备份数据库并校验备份', '', true, '2026-11-02 23:41:02', [
                { c: '导出全量备份 dump', d: true },
                { c: '校验备份文件大小与记录数', d: true }
              ]),
              t('冻结数据写入', '通知各业务方停止写入', false, null, [
                { c: '发布停写公告' },
                { c: '关闭应用写入开关' },
                { c: '确认无新增连接' }
              ])
            ]
          },
          {
            id: 'm2',
            name: '割接窗口',
            tasks: [
              t('切换流量到新版本', '', false, null, [
                { c: '更新网关路由配置' },
                { c: '灰度 10% 流量观察 5 分钟' },
                { c: '全量切换' }
              ]),
              t('核心链路冒烟验证', '登录、下单、支付')
            ]
          }
        ]
      },
      {
        id: 'p2',
        name: '网关升级割接',
        desc: '逐台滚动重启的割接示例',
        milestones: [
          {
            id: 'm3',
            name: '割接执行',
            tasks: [
              t('升级前配置快照', '', true, '2026-11-01 09:12:40'),
              t('逐台滚动重启网关节点', '', false, null, [{ c: '摘除节点流量' }, { c: '重启并健康检查' }, { c: '回切流量' }]),
              t('观察错误率 30 分钟')
            ]
          }
        ]
      },
      {
        id: 'p3',
        name: '数据库迁移',
        desc: '已全部完成的示例',
        milestones: [
          {
            id: 'm4',
            name: '迁移收尾',
            tasks: [t('新旧库数据比对', '', true, '2026-10-30 15:20:00'), t('应用切换连接串', '', true, '2026-10-30 16:05:31')]
          }
        ]
      }
    ],
    currentProjectId: 'p1',
    mode: 'execute',
    theme: 'dark',
    accent: 'blue'
  }
}
