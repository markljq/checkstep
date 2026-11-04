import { useEffect, useRef, useState } from 'react'
import { allTasks, doneCount, uid, update, useStore } from '../store'
import type { Task } from '../types'
import { openConfirm, openForm, toast } from './Dialogs'
import { exportJSON, exportMarkdown, importJSON } from '../transfer'

export function Sidebar(): JSX.Element | null {
  const db = useStore()
  const [ioOpen, setIoOpen] = useState(false)
  const ioRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ioOpen) return
    const onDown = (e: MouseEvent): void => {
      if (!ioRef.current?.contains(e.target as Node)) setIoOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIoOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ioOpen])

  if (!db) return null
  const editMode = db.mode === 'edit'

  const newProject = (): void => {
    openForm('新建项目', [
      { key: 'name', label: '项目名称', type: 'input', required: true },
      { key: 'desc', label: '备注（可选）', type: 'input' }
    ], (v) => {
      const pid = uid()
      update((draft) => {
        draft.projects.unshift({ id: pid, name: v.name, desc: v.desc, milestones: [] })
        draft.currentProjectId = pid
      })
      toast('项目已创建')
    })
  }

  const editProject = (pid: string): void => {
    const p = db.projects.find((x) => x.id === pid)
    if (!p) return
    openForm('编辑项目', [
      { key: 'name', label: '项目名称', type: 'input', required: true },
      { key: 'desc', label: '备注', type: 'input' }
    ], (v) => {
      update((draft) => {
        const target = draft.projects.find((x) => x.id === pid)
        if (target) {
          target.name = v.name
          target.desc = v.desc
        }
      })
      toast('项目已更新')
    }, { name: p.name, desc: p.desc })
  }

  const deleteProject = (pid: string): void => {
    const p = db.projects.find((x) => x.id === pid)
    if (!p) return
    if (db.projects.length <= 1) {
      toast('至少保留一个项目')
      return
    }
    openConfirm(
      `删除项目「${p.name}」？`,
      `该项目下的 ${p.milestones.length} 个里程碑、${allTasks(p).length} 个执行项及全部执行步骤将一并删除，且不可恢复。`,
      () => {
        update((draft) => {
          draft.projects = draft.projects.filter((x) => x.id !== pid)
          if (!draft.projects.some((x) => x.id === draft.currentProjectId)) {
            draft.currentProjectId = draft.projects[0].id
          }
        })
        toast('项目已删除')
      }
    )
  }

  /** 深拷贝项目结构，所有执行项/步骤重置为未完成，id 全部重新生成 */
  const resetCopyTask = (t: Task): Task => ({
    id: uid(),
    title: t.title,
    note: t.note,
    done: false,
    doneAt: null,
    steps: t.steps.map((s) => ({ id: uid(), content: s.content, done: false }))
  })

  const duplicateProject = (pid: string): void => {
    const p = db.projects.find((x) => x.id === pid)
    if (!p) return
    openForm('复制项目', [
      { key: 'name', label: '项目名称', type: 'input', required: true, hint: '不能与其他项目重名' },
      { key: 'desc', label: '备注（可选）', type: 'input' }
    ], (v) => {
      const name = v.name.trim()
      if (db.projects.some((x) => x.name === name)) {
        toast('项目名称已存在，请换一个')
        return false
      }
      const newId = uid()
      update((draft) => {
        const src = draft.projects.find((x) => x.id === pid)
        if (!src) return
        const idx = draft.projects.findIndex((x) => x.id === pid)
        draft.projects.splice(idx + 1, 0, {
          id: newId,
          name,
          desc: v.desc,
          milestones: src.milestones.map((m) => ({
            id: uid(),
            name: m.name,
            tasks: m.tasks.map(resetCopyTask)
          }))
        })
        draft.currentProjectId = newId
      })
      toast(`已复制为「${name}」，执行状态已重置`)
    }, { name: p.name + ' - 副本', desc: p.desc })
  }

  const runIO = (fn: () => void | Promise<unknown>): void => {
    setIoOpen(false)
    void fn()
  }

  return (
    <aside className="sidebar">
      <div className="side-label">项目列表</div>
      {db.projects.map((p) => {
        const ts = allTasks(p)
        const dn = doneCount(ts)
        const pct = ts.length ? Math.round((dn / ts.length) * 100) : 0
        const selected = p.id === db.currentProjectId
        return (
          <div
            key={p.id}
            className={'nav-item' + (selected ? ' selected' : '')}
            role="button"
            tabIndex={0}
            onClick={() => update((d) => { d.currentProjectId = p.id })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                update((d) => { d.currentProjectId = p.id })
              }
            }}
          >
            <span className="p-name">{p.name}</span>
            {editMode && selected ? (
              <span className="nav-actions">
                <button
                  className="icon-btn"
                  title="编辑项目"
                  onClick={(e) => {
                    e.stopPropagation()
                    editProject(p.id)
                  }}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M11.3 2.3l2.4 2.4L6 12.4l-3 .6.6-3 7.7-7.7z" />
                  </svg>
                </button>
                <button
                  className="icon-btn"
                  title="复制项目"
                  onClick={(e) => {
                    e.stopPropagation()
                    duplicateProject(p.id)
                  }}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
                    <path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
                  </svg>
                </button>
                <button
                  className="icon-btn"
                  title="删除项目"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteProject(p.id)
                  }}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" />
                  </svg>
                </button>
              </span>
            ) : (
              <span className="p-count">
                {dn}/{ts.length}
              </span>
            )}
            <div className="mini-bar">
              <i style={{ width: pct + '%' }} />
            </div>
          </div>
        )
      })}
      <div style={{ flex: 1 }} />
      <div className="side-foot" ref={ioRef}>
        <div className="side-new" onClick={newProject}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M8 3v10M3 8h10" />
          </svg>
          新建项目
        </div>
        <div
          className={'side-new io-trigger' + (ioOpen ? ' active' : '')}
          role="button"
          tabIndex={0}
          onClick={() => setIoOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setIoOpen((v) => !v)
            }
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 2v8M8 10l-3-3M8 10l3-3M3 12.5v1h10v-1" />
          </svg>
          导入 / 导出
        </div>
        {ioOpen && (
          <div className="io-pop" role="menu">
            <div className="pop-title">导出</div>
            <button className="io-item" onClick={() => runIO(() => exportJSON('all'))}>
              JSON 备份 · 全部项目
            </button>
            <button className="io-item" onClick={() => runIO(() => exportJSON('current'))}>
              JSON · 当前项目
            </button>
            <button className="io-item" onClick={() => runIO(() => exportMarkdown())}>
              Markdown 清单 · 当前项目
            </button>
            <div className="io-sep" />
            <div className="pop-title">导入</div>
            <button className="io-item" onClick={() => runIO(() => importJSON())}>
              从 JSON 文件导入…
            </button>
            <div className="pop-hint">JSON 可跨设备迁移；Markdown 便于评审与归档</div>
          </div>
        )}
      </div>
    </aside>
  )
}
