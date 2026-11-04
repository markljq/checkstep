import { useEffect, useRef, useState } from 'react'
import {
  allTasks,
  doneCount,
  findMilestone,
  moveMilestoneTo,
  moveTaskTo,
  stamp,
  uid,
  update,
  useProject,
  useStore
} from '../store'
import type { Task } from '../types'
import { openConfirm, openForm, toast } from './Dialogs'
import { TaskItem } from './TaskItem'
import { buildTimelineSVG, svgToPngBase64 } from './TimelineImage'

type DragPayload =
  | { kind: 'task'; id: string; groupId: string; index: number }
  | { kind: 'milestone'; id: string; index: number }
  | null

function AddRow({ onAdd, label = '添加执行项' }: { onAdd: () => void; label?: string }): JSX.Element {
  return (
    <div className="add-row" onClick={onAdd}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M8 3v10M3 8h10" />
      </svg>
      {label}
    </div>
  )
}

export function ProjectView(): JSX.Element | null {
  const db = useStore()
  const project = useProject()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const mainRef = useRef<HTMLElement>(null)
  const [stuck, setStuck] = useState(false)
  const [showJump, setShowJump] = useState(false)
  const [share, setShare] = useState<{ svg: string } | null>(null)

  /* ---------- 拖拽状态 ---------- */
  const dragRef = useRef<DragPayload>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [taskHint, setTaskHint] = useState<{ taskId: string; pos: 'before' | 'after' } | null>(null)
  const [listHint, setListHint] = useState<string | null>(null)
  const [msHint, setMsHint] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)

  const resetDrag = (): void => {
    dragRef.current = null
    setDraggingId(null)
    setTaskHint(null)
    setListHint(null)
    setMsHint(null)
  }

  /* ---------- 滚动监听：吸顶阴影 + 悬浮定位按钮 ---------- */
  const updateJumpVisible = (): void => {
    const el = mainRef.current
    if (!el) return
    setStuck(el.scrollTop > 4)
    const pending = el.querySelectorAll<HTMLElement>('.task:not(.done)')
    if (!pending.length) {
      setShowJump(false)
      return
    }
    const box = el.getBoundingClientRect()
    const headerH = 96 // 吸顶头部大致高度，低于它的不算可见
    let anyVisible = false
    pending.forEach((t) => {
      const r = t.getBoundingClientRect()
      if (r.bottom > box.top + headerH && r.top < box.bottom) anyVisible = true
    })
    setShowJump(!anyVisible)
  }

  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const onScroll = (): void => {
      window.requestAnimationFrame(updateJumpVisible)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [project?.id])

  // 折叠状态、数据变化后重新评估悬浮按钮
  useEffect(() => {
    const t = window.setTimeout(updateJumpVisible, 50)
    return () => window.clearTimeout(t)
  }, [collapsed, project, db?.mode])

  if (!db || !project) return null
  const editMode = db.mode === 'edit'

  const tasks = allTasks(project)
  const dn = doneCount(tasks)
  const pct = tasks.length ? Math.round((dn / tasks.length) * 100) : 0
  const allDone = tasks.length > 0 && dn === tasks.length

  /* ---------- 全部折叠 / 全部展开 ---------- */
  const collapseAll = (): void => {
    setCollapsed(new Set(project.milestones.map((m) => m.id)))
  }
  const expandAll = (): void => {
    setCollapsed(new Set())
  }

  /* ---------- 分享进度：时间线图 ---------- */
  const openShare = (): void => {
    // 图片配色跟随当前主题与主题色
    const svg = buildTimelineSVG(project, db.accent, db.theme)
    setShare({ svg })
  }

  const saveShare = async (): Promise<void> => {
    if (!share) return
    try {
      const base64 = await svgToPngBase64(share.svg)
      const res = await window.api.saveImage({
        title: '保存进度图',
        defaultName: `${project.name}-进度-${stamp()}.png`,
        base64
      })
      if (res.ok && res.path) toast('已保存：' + res.path)
      else if (!res.canceled) toast('保存失败：' + (res.error ?? '未知错误'))
    } catch (e) {
      toast('生成图片失败：' + String(e))
    }
  }

  const copyShare = async (): Promise<void> => {
    if (!share) return
    try {
      const base64 = await svgToPngBase64(share.svg)
      const bin = atob(base64)
      const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([arr], { type: 'image/png' }) })])
      toast('进度图已复制，可直接粘贴分享')
    } catch {
      toast('复制失败，请改用「保存 PNG」')
    }
  }

  // 分享预览打开时支持 Esc 关闭
  useEffect(() => {
    if (!share) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShare(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [share])

  /* ---------- 定位到最早未执行的执行项 ---------- */
  // 按界面展示顺序（里程碑顺序）找第一个未完成项
  const orderedTasks: { task: Task; groupId: string }[] = project.milestones.flatMap((m) =>
    m.tasks.map((task) => ({ task, groupId: m.id }))
  )
  const firstPending = orderedTasks.find((x) => !x.task.done) || null

  const jumpToPending = (): void => {
    if (!firstPending) return
    // 目标所在分组若被折叠，先展开
    setCollapsed((s) => {
      if (!s.has(firstPending.groupId)) return s
      const next = new Set(s)
      next.delete(firstPending.groupId)
      return next
    })
    // 等展开动画结束后再滚动定位并高亮
    window.setTimeout(() => {
      const el = mainRef.current?.querySelector(`[data-tid="${firstPending.task.id}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('locate-flash')
      window.setTimeout(() => el.classList.remove('locate-flash'), 1800)
    }, 360)
  }

  const pushTask = (groupId: string, task: Task): void => {
    update((draft) => {
      const p = draft.projects.find((x) => x.id === project.id)
      if (!p) return
      p.milestones.find((m) => m.id === groupId)?.tasks.push(task)
    })
  }

  const addTaskTo = (groupId: string): void => {
    openForm('添加执行项', [
      { key: 'title', label: '执行项名称', type: 'input', required: true },
      { key: 'note', label: '备注（可选）', type: 'input' }
    ], (v) => {
      pushTask(groupId, { id: uid(), title: v.title, note: v.note, done: false, doneAt: null, steps: [] })
      toast('已添加执行项：' + v.title)
    })
  }

  const addMilestone = (): void => {
    openForm('新增里程碑', [{ key: 'name', label: '里程碑名称', type: 'input', required: true }], (v) => {
      update((draft) => {
        draft.projects.find((p) => p.id === project.id)?.milestones.push({ id: uid(), name: v.name, tasks: [] })
      })
      toast('已新增里程碑')
    })
  }

  const toggleCollapse = (mid: string): void => {
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(mid)) next.delete(mid)
      else next.add(mid)
      return next
    })
  }

  /* ---------- 执行项拖拽 ---------- */
  const onTaskDragStart = (e: React.DragEvent, taskId: string, groupId: string, index: number): void => {
    dragRef.current = { kind: 'task', id: taskId, groupId, index }
    setDraggingId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('text/plain', taskId)
    } catch {
      /* 某些环境不支持 setData，忽略 */
    }
  }

  const onTaskDragOver = (e: React.DragEvent, taskId: string): void => {
    if (dragRef.current?.kind !== 'task') return
    e.preventDefault()
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const pos: 'before' | 'after' = e.clientY < r.top + r.height / 2 ? 'before' : 'after'
    setTaskHint({ taskId, pos })
    setListHint(null)
  }

  const onTaskDrop = (e: React.DragEvent, groupId: string, index: number): void => {
    const d = dragRef.current
    if (!d || d.kind !== 'task') return
    e.preventDefault()
    e.stopPropagation()
    // 位置在 drop 时按坐标实时计算，避免依赖 dragover 的异步 state
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const isAfter = e.clientY >= r.top + r.height / 2
    moveTaskTo(project.id, d.id, groupId, index + (isAfter ? 1 : 0))
    toast('已移动执行项')
    resetDrag()
  }

  /* ---------- 分组容器拖拽（拖到空白区 = 放到末尾） ---------- */
  const onListDragOver = (e: React.DragEvent, groupId: string): void => {
    if (dragRef.current?.kind !== 'task') return
    e.preventDefault()
    setListHint(groupId)
    setTaskHint(null)
  }

  const onListDrop = (e: React.DragEvent, groupId: string): void => {
    const d = dragRef.current
    if (!d || d.kind !== 'task') return
    e.preventDefault()
    e.stopPropagation()
    moveTaskTo(project.id, d.id, groupId, Number.MAX_SAFE_INTEGER)
    toast('已移动执行项')
    resetDrag()
  }

  /* ---------- 里程碑拖拽 ---------- */
  const onMsDragStart = (e: React.DragEvent, mid: string, index: number): void => {
    if ((e.target as HTMLElement).closest('.task')) return
    dragRef.current = { kind: 'milestone', id: mid, index }
    setDraggingId(mid)
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('text/plain', mid)
    } catch {
      /* ignore */
    }
  }

  const onMsDragOver = (e: React.DragEvent, mid: string): void => {
    const d = dragRef.current
    if (!d) return
    if (d.kind !== 'milestone') return
    e.preventDefault()
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const pos: 'before' | 'after' = e.clientY < r.top + r.height / 2 ? 'before' : 'after'
    setMsHint({ id: mid, pos })
  }

  const onMsDrop = (e: React.DragEvent, mid: string, index: number): void => {
    const d = dragRef.current
    if (!d) return
    e.preventDefault()
    e.stopPropagation()
    if (d.kind === 'milestone') {
      if (d.id !== mid) {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const isAfter = e.clientY >= r.top + r.height / 2
        moveMilestoneTo(project.id, d.id, index + (isAfter ? 1 : 0))
        toast('已调整里程碑顺序')
      }
    } else {
      // 执行项拖到里程碑头部 → 移入该里程碑末尾
      moveTaskTo(project.id, d.id, mid, Number.MAX_SAFE_INTEGER)
      toast('已移入该里程碑')
    }
    resetDrag()
  }

  const renderTasks = (list: Task[], groupId: string): JSX.Element => (
    <div
      className={'task-list' + (listHint === groupId ? ' list-drop' : '')}
      onDragOver={(e) => onListDragOver(e, groupId)}
      onDragLeave={() => setListHint(null)}
      onDrop={(e) => onListDrop(e, groupId)}
    >
      {list.map((t, i) => (
        <TaskItem
          key={t.id}
          task={t}
          groupId={groupId}
          index={i}
          hint={taskHint?.taskId === t.id ? taskHint.pos : null}
          dragging={draggingId === t.id}
          onDragStart={onTaskDragStart}
          onDragOver={onTaskDragOver}
          onDragLeave={() => setTaskHint(null)}
          onDrop={onTaskDrop}
          onDragEnd={resetDrag}
        />
      ))}
      {list.length === 0 && <div className="empty-hint">{editMode ? '暂无执行项，可拖拽执行项到此处' : '暂无执行项'}</div>}
      {editMode && <AddRow onAdd={() => addTaskTo(groupId)} />}
    </div>
  )

  return (
    <main className="main" ref={mainRef}>
      <div className={'proj-top' + (stuck ? ' stuck' : '')}>
        <div className="proj-header">
          <h1>{project.name}</h1>
          <span className={'badge' + (allDone ? ' done' : '')}>{allDone ? '已完成' : '进行中'}</span>
        </div>
        <div className="proj-sub">{project.desc}</div>
        <div className="proj-toolbar">
          <button className="btn btn-sm" title="折叠所有里程碑" onClick={collapseAll}>
            全部折叠
          </button>
          <button className="btn btn-sm" title="展开所有里程碑" onClick={expandAll}>
            全部展开
          </button>
          <button className="btn btn-sm share-btn" title="生成时间线进度图，可保存或复制分享" onClick={openShare}>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="6" cy="8" r="2.6" />
              <circle cx="12.5" cy="3.5" r="2" />
              <circle cx="12" cy="12.5" r="2" />
              <path d="M8.4 6.8l2.3-2.2M8.3 9.1l1.9 2.5" />
            </svg>
            分享进度
          </button>
        </div>
        <div className="overall">
          <div className="track">
            <i style={{ width: pct + '%' }} />
          </div>
          <span className="pct">{pct}%</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {dn} / {tasks.length} 项
          </span>
        </div>
      </div>

      {/* 里程碑 */}
      {!project.milestones.length && (
        <div className="empty-hint big">
          {editMode ? '还没有里程碑，点击下方「新增里程碑」开始组织执行项' : '该项目还没有里程碑与执行项'}
        </div>
      )}
      {project.milestones.map((m, mi) => {
        const mdn = doneCount(m.tasks)
        const mp = m.tasks.length ? Math.round((mdn / m.tasks.length) * 100) : 0
        const isCollapsed = collapsed.has(m.id)
        const hintCls = msHint?.id === m.id ? ' ms-drop-' + msHint.pos : ''
        return (
          <div
            key={m.id}
            className={'ms-card' + (isCollapsed ? ' collapsed' : '') + hintCls + (draggingId === m.id ? ' dragging' : '')}
          >
            <div
              className="ms-head"
              draggable={editMode}
              onDragStart={(e) => onMsDragStart(e, m.id, mi)}
              onDragOver={(e) => onMsDragOver(e, m.id)}
              onDrop={(e) => onMsDrop(e, m.id, mi)}
              onDragEnd={resetDrag}
              onClick={() => toggleCollapse(m.id)}
            >
              {editMode && (
                <span className="drag-grip" title="拖拽调整里程碑顺序">
                  <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor">
                    <circle cx="3" cy="4" r="1.2" />
                    <circle cx="7" cy="4" r="1.2" />
                    <circle cx="3" cy="8" r="1.2" />
                    <circle cx="7" cy="8" r="1.2" />
                    <circle cx="3" cy="12" r="1.2" />
                    <circle cx="7" cy="12" r="1.2" />
                  </svg>
                </span>
              )}
              <span className={'chev' + (isCollapsed ? ' closed' : '')}>▾</span>
              <span className="ms-name">里程碑 · {m.name}</span>
              <span className="ms-meta">{m.tasks.length} 个执行项</span>
              <div className="ms-bar">
                <i style={{ width: mp + '%' }} />
              </div>
              <span className="ms-pct">
                {mdn}/{m.tasks.length}
              </span>
              {editMode && (
                <span className="ms-actions">
                  <button
                    className="icon-btn"
                    title="编辑里程碑"
                    onClick={(e) => {
                      e.stopPropagation()
                      openForm('编辑里程碑', [{ key: 'name', label: '里程碑名称', type: 'input', required: true }], (v) => {
                        update((draft) => {
                          const mm = findMilestone(m.id)
                          if (!mm) return
                          const target = draft.projects
                            .find((p) => p.id === mm.project.id)
                            ?.milestones.find((x) => x.id === m.id)
                          if (target) target.name = v.name
                        })
                      }, { name: m.name })
                    }}
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <path d="M11.3 2.3l2.4 2.4L6 12.4l-3 .6.6-3 7.7-7.7z" />
                    </svg>
                  </button>
                  <button
                    className="icon-btn"
                    title="删除里程碑"
                    onClick={(e) => {
                      e.stopPropagation()
                      openConfirm(`删除里程碑「${m.name}」？`, '其下所有执行项及步骤将一并删除，且不可恢复。', () => {
                        update((draft) => {
                          const p = draft.projects.find((x) => x.id === project.id)
                          if (p) p.milestones = p.milestones.filter((x) => x.id !== m.id)
                        })
                        toast('已删除里程碑')
                      })
                    }}
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" />
                    </svg>
                  </button>
                </span>
              )}
            </div>
            <div className={'ms-body' + (isCollapsed ? '' : ' open')}>
              <div className="ms-inner">{renderTasks(m.tasks, m.id)}</div>
            </div>
          </div>
        )
      })}

      {editMode && (
        <div className="bottom-actions">
          <div className="add-ms" onClick={addMilestone}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8 3v10M3 8h10" />
            </svg>
            新增里程碑
          </div>
        </div>
      )}

      {/* 悬浮定位按钮：视口内没有未执行项时出现 */}
      {showJump && firstPending && (
        <button className="jump-fab" title={`定位到最早未执行：${firstPending.task.title}`} onClick={jumpToPending}>
          <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="8" cy="8" r="6.2" />
            <circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />
            <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2" />
          </svg>
          <span>待办</span>
        </button>
      )}

      {/* 分享进度：时间线图预览 */}
      {share && (
        <div className="overlay show" onMouseDown={(e) => e.target === e.currentTarget && setShare(null)}>
          <div className="dialog dialog-share" role="dialog" aria-modal="true">
            <h3>分享进度</h3>
            <div className="share-preview">
              <img src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(share.svg)} alt="进度时间线图" />
            </div>
            <div className="dlg-hint">
              里程碑按顺序自上而下排列：<b style={{ color: 'var(--accent)' }}>实心胶囊</b> 为已完成，空心为未执行。
              配色跟随当前主题与主题色，不包含具体完成时间。
            </div>
            <div className="dlg-btns">
              <button className="btn" onClick={() => setShare(null)}>
                关闭
              </button>
              <button className="btn" onClick={copyShare}>
                复制图片
              </button>
              <button className="btn primary" onClick={saveShare}>
                保存 PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
