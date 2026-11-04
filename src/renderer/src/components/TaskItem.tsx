import { useState } from 'react'
import type { Task } from '../types'
import { fromInputValue, isValidDateTime, now, toInputValue, uid, update, useStore } from '../store'
import { openConfirm, openForm, openSteps, toast } from './Dialogs'

function CheckCircle({ done, onToggle }: { done: boolean; onToggle: () => void }): JSX.Element {
  return (
    <div
      className={'check' + (done ? ' checked' : '')}
      role="checkbox"
      aria-checked={done}
      tabIndex={0}
      title={done ? '取消完成' : '标记完成'}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      <svg viewBox="0 0 22 22">
        <circle className="ring" cx="11" cy="11" r="9" />
        <path className="tick" d="M7 11.5l2.6 2.6L15 8.5" />
      </svg>
    </div>
  )
}

export interface TaskItemProps {
  task: Task
  groupId: string
  index: number
  hint: 'before' | 'after' | null
  dragging: boolean
  onDragStart: (e: React.DragEvent, taskId: string, groupId: string, index: number) => void
  onDragOver: (e: React.DragEvent, taskId: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, groupId: string, index: number) => void
  onDragEnd: () => void
}

export function TaskItem(props: TaskItemProps): JSX.Element | null {
  const { task, groupId, index, hint, dragging, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd } = props
  const db = useStore()
  const [expanded, setExpanded] = useState(false)
  const editMode = db?.mode === 'edit'

  const mutateTask = (fn: (t: Task) => void): void => {
    update((draft) => {
      for (const p of draft.projects) {
        for (const m of p.milestones) {
          const t = m.tasks.find((x) => x.id === task.id)
          if (t) {
            fn(t)
            return
          }
        }
      }
    })
  }

  const toggleDone = (): void => {
    const willDone = !task.done
    mutateTask((t) => {
      t.done = willDone
      t.doneAt = willDone ? now() : null
      if (!willDone) t.steps.forEach((s) => (s.done = false))
    })
    if (willDone) toast('已完成：' + task.title)
  }

  const editDoneAt = (): void => {
    openForm(
      '修改完成时间',
      [
        { key: 'doneAt', label: '完成时间', type: 'datetime', required: true },
        { key: 'sec', label: '仅可修改到分钟，秒沿用原值；清空或取消勾选可撤销完成。', type: 'hint' }
      ],
      (v) => {
        const val = fromInputValue(v.doneAt, task.doneAt)
        if (!isValidDateTime(val)) {
          toast('时间格式不正确，请重新输入')
          return
        }
        mutateTask((t) => {
          t.done = true
          t.doneAt = val
        })
        toast('完成时间已更新：' + val)
      },
      { doneAt: toInputValue(task.doneAt) }
    )
  }

  const addStep = (): void => {
    openSteps('添加执行步骤', (list) => {
      mutateTask((t) => {
        for (const content of list) t.steps.push({ id: uid(), content, done: false })
      })
      setExpanded(true)
      toast(`已添加 ${list.length} 个执行步骤`)
    })
  }

  /** 编辑步骤内容 */
  const editStep = (stepId: string, content: string): void => {
    openForm(
      '编辑步骤',
      [{ key: 'content', label: '步骤内容', type: 'input', required: true }],
      (v) =>
        mutateTask((t) => {
          const st = t.steps.find((x) => x.id === stepId)
          if (st) st.content = v.content
        }),
      { content }
    )
  }

  /** 删除步骤 */
  const deleteStep = (stepId: string): void => {
    mutateTask((t) => {
      t.steps = t.steps.filter((x) => x.id !== stepId)
    })
    toast('已删除步骤')
  }

  /** 复制执行项：结构完整保留，执行状态重置（与复制项目一致） */
  const duplicateTask = (): void => {
    const copy: Task = {
      id: uid(),
      title: task.title,
      note: task.note,
      done: false,
      doneAt: null,
      steps: task.steps.map((s) => ({ id: uid(), content: s.content, done: false }))
    }
    update((draft) => {
      for (const p of draft.projects) {
        for (const m of p.milestones) {
          const i = m.tasks.findIndex((x) => x.id === task.id)
          if (i >= 0) {
            m.tasks.splice(i + 1, 0, copy)
            return
          }
        }
      }
    })
    toast('已复制执行项')
  }

  const editTask = (): void => {
    openForm(
      '编辑执行项',
      [
        { key: 'title', label: '执行项名称', type: 'input', required: true },
        { key: 'note', label: '备注', type: 'input' }
      ],
      (v) =>
        mutateTask((t) => {
          t.title = v.title
          t.note = v.note
        }),
      { title: task.title, note: task.note }
    )
  }

  const deleteTask = (): void => {
    openConfirm(`删除执行项「${task.title}」？`, '其下所有执行步骤将一并删除，且不可恢复。', () => {
      update((draft) => {
        for (const p of draft.projects) {
          for (const m of p.milestones) m.tasks = m.tasks.filter((x) => x.id !== task.id)
        }
      })
      toast('已删除')
    })
  }

  const hasSteps = task.steps.length > 0

  return (
    <div
      className={
        'task' + (task.done ? ' done' : '') + (hint ? ' drop-' + hint : '') + (dragging ? ' dragging' : '')
      }
      data-tid={task.id}
      draggable={editMode}
      onDragStart={(e) => onDragStart(e, task.id, groupId, index)}
      onDragOver={(e) => onDragOver(e, task.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, groupId, index)}
      onDragEnd={onDragEnd}
    >
      <div className="task-row">
        {editMode && (
          <span className="drag-grip" title="拖拽调整顺序或移动到其他分组">
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
        <CheckCircle done={task.done} onToggle={toggleDone} />
        <div className="t-main">
          <div className="t-title">{task.title}</div>
          {task.note ? <div className="t-note">{task.note}</div> : null}
          {task.done && task.doneAt ? (
            <div className="t-doneat">
              <span>✓ 完成时间：{task.doneAt}</span>
              <button
                className="time-edit"
                title="修改完成时间"
                aria-label="修改完成时间"
                onClick={(e) => {
                  e.stopPropagation()
                  editDoneAt()
                }}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M11.3 2.3l2.4 2.4L6 12.4l-3 .6.6-3 7.7-7.7z" />
                </svg>
              </button>
            </div>
          ) : null}
          {hasSteps ? (
            <div
              className="steps-toggle"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
            >
              <span className={'chev' + (expanded ? '' : ' closed')}>▾</span>
              {task.steps.length} 个执行步骤
            </div>
          ) : (
            editMode && <div className="steps-toggle ghost">无执行步骤</div>
          )}
        </div>
        {editMode && (
          <div className="t-actions">
            <button className="icon-btn" title="添加步骤" onClick={addStep}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
          <button className="icon-btn" title="复制执行项" onClick={duplicateTask}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
              <path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
            </svg>
          </button>
          <button className="icon-btn" title="编辑" onClick={editTask}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M11.3 2.3l2.4 2.4L6 12.4l-3 .6.6-3 7.7-7.7z" />
            </svg>
          </button>
          <button className="icon-btn" title="删除" onClick={deleteTask}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" />
            </svg>
          </button>
          </div>
        )}
      </div>
      <div className={'steps-wrap' + (expanded ? ' open' : '')}>
        <div className="steps">
          <ol>
            {task.steps.map((s, i) => (
              <li
                key={s.id}
                className={'step' + (s.done ? ' done' : '')}
                onClick={() => {
                  mutateTask((t) => {
                    const st = t.steps.find((x) => x.id === s.id)
                    if (st) st.done = !st.done
                  })
                }}
              >
                <span className="idx">{i + 1}</span>
                <span>{s.content}</span>
                {editMode && (
                  <span className="s-actions">
                    <button
                      className="icon-btn"
                      title="编辑步骤"
                      onClick={(e) => {
                        e.stopPropagation()
                        editStep(s.id, s.content)
                      }}
                    >
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
                        <path d="M11.3 2.3l2.4 2.4L6 12.4l-3 .6.6-3 7.7-7.7z" />
                      </svg>
                    </button>
                    <button
                      className="icon-btn"
                      title="删除步骤"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteStep(s.id)
                      }}
                    >
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3">
                        <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" />
                      </svg>
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
