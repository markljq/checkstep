import { useSyncExternalStore, useState, useEffect, useRef } from 'react'

/* ---------------- 表单 / 确认对话框 + Toast（轻量全局状态） ---------------- */

export interface FormField {
  key: string
  label: string
  type: 'input' | 'textarea' | 'select' | 'datetime' | 'hint'
  required?: boolean
  options?: { value: string; label: string }[]
  /** 字段下方的小字提示（type 为 input/textarea/select/datetime 时生效） */
  hint?: string
}

type DialogState =
  | { kind: 'form'; title: string; fields: FormField[]; values: Record<string, string>; onSubmit: (v: Record<string, string>) => void | false }
  | { kind: 'steps'; title: string; initial: string[]; onSubmit: (steps: string[]) => void }
  | { kind: 'confirm'; title: string; message: string; okText: string; onOk: () => void }
  | null

let dialog: DialogState = null
const dialogListeners = new Set<() => void>()
function emitDialog(): void {
  dialogListeners.forEach((l) => l())
}

export function openForm(
  title: string,
  fields: FormField[],
  onSubmit: (v: Record<string, string>) => void | false,
  values: Record<string, string> = {}
): void {
  dialog = { kind: 'form', title, fields, values, onSubmit }
  emitDialog()
}

export function openConfirm(title: string, message: string, onOk: () => void, okText = '删除'): void {
  dialog = { kind: 'confirm', title, message, okText, onOk }
  emitDialog()
}

/** 多行连续录入（如批量添加执行步骤）：Enter 新增下一条，最终一次性提交 */
export function openSteps(title: string, onSubmit: (steps: string[]) => void, initial: string[] = []): void {
  dialog = { kind: 'steps', title, initial: initial.length ? initial : [''], onSubmit }
  emitDialog()
}

function closeDialog(): void {
  dialog = null
  emitDialog()
}

/* Toast */
let toastState = { msg: '', visible: false }
let toastTimer: ReturnType<typeof setTimeout> | undefined
const toastListeners = new Set<() => void>()

function emitToast(): void {
  toastListeners.forEach((l) => l())
}

export function toast(msg: string): void {
  toastState = { msg, visible: true }
  emitToast()
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastState = { ...toastState, visible: false }
    emitToast()
  }, 2400)
}

/* ---------- 多行连续录入：执行步骤 ---------- */
function StepsDialog({
  title,
  initial,
  onSubmit
}: {
  title: string
  initial: string[]
  onSubmit: (steps: string[]) => void
}): JSX.Element {
  const [rows, setRows] = useState<string[]>(initial)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const focusIdx = useRef<number | null>(0)

  // 每次结构变化后把焦点落到指定行（新增/删除行后）
  useEffect(() => {
    const i = focusIdx.current
    if (i == null) return
    const el = inputs.current[i]
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
      focusIdx.current = null
    }
  })

  const addRowAfter = (i: number): void => {
    const next = [...rows.slice(0, i + 1), '', ...rows.slice(i + 1)]
    focusIdx.current = i + 1
    setRows(next)
  }

  const removeRow = (i: number): void => {
    if (rows.length <= 1) {
      setRows([''])
      focusIdx.current = 0
      return
    }
    const next = rows.filter((_, idx) => idx !== i)
    focusIdx.current = Math.max(0, i - 1)
    setRows(next)
  }

  const submit = (): void => {
    const list = rows.map((r) => r.trim()).filter(Boolean)
    if (!list.length) {
      toast('请至少输入一条步骤')
      return
    }
    closeDialog()
    onSubmit(list)
  }

  return (
    <>
      <h3>{title}</h3>
      <div className="step-editor">
        {rows.map((v, i) => (
          <div className="step-row" key={i}>
            <span className="num">{i + 1}</span>
            <input
              ref={(el) => {
                inputs.current[i] = el
              }}
              value={v}
              placeholder={i === 0 ? '输入步骤内容，按 Enter 继续下一条' : '按 Enter 继续下一条'}
              onChange={(e) => {
                const next = [...rows]
                next[i] = e.target.value
                setRows(next)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault()
                  addRowAfter(i)
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  submit()
                } else if (e.key === 'Backspace' && !v && rows.length > 1) {
                  e.preventDefault()
                  removeRow(i)
                }
              }}
            />
            {rows.length > 1 && (
              <button className="icon-btn row-del" title="移除此行" onClick={() => removeRow(i)}>
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="dlg-hint">按 Enter 添加下一条，空行会自动忽略；Ctrl+Enter 直接完成。</div>
      <div className="dlg-btns">
        <button className="btn" onClick={closeDialog}>
          取消
        </button>
        <button className="btn primary" onClick={submit}>
          确定
        </button>
      </div>
    </>
  )
}

export function DialogHost(): JSX.Element | null {
  const d = useSyncExternalStore(
    (l) => {
      dialogListeners.add(l)
      return () => dialogListeners.delete(l)
    },
    () => dialog
  )
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (dialog?.kind === 'form') setValues({ ...dialog.values })
  }, [dialog])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeDialog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!d) return null

  const submitForm = (): void => {
    if (d.kind !== 'form') return
    const v: Record<string, string> = {}
    for (const f of d.fields) {
      if (f.type === 'hint') continue
      v[f.key] = (values[f.key] ?? '').trim()
      if (f.required && !v[f.key]) {
        toast(f.label + ' 不能为空')
        return
      }
    }
    // onSubmit 返回 false 表示校验未通过（如重名），对话框保持打开供修改；
    // onSubmit 内部若打开了新的对话框（如导入替换的二次确认），则保留新对话框
    const before = dialog
    const r = d.onSubmit(v)
    if (r === false) return
    if (dialog !== before) {
      emitDialog()
      return
    }
    closeDialog()
  }

  // 只有第一个可输入字段自动聚焦（否则多个 autoFocus 会让焦点落到最后一个，如"备注"）
  const firstInputKey = d.kind === 'form' ? d.fields.find((f) => f.type !== 'hint')?.key : null

  return (
    <div className="overlay show" onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <div className={'dialog' + (d.kind === 'steps' ? ' dialog-wide' : '')} role="dialog" aria-modal="true">
        {d.kind === 'form' ? (
          <>
            <h3>{d.title}</h3>
            {d.fields.map((f) => {
              if (f.type === 'hint') {
                return (
                  <p key={f.key} className="dlg-hint">
                    {f.label}
                  </p>
                )
              }
              return (
                <div key={f.key}>
                  <label>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </label>
                  {f.type === 'input' && (
                    <input
                      autoFocus={f.key === firstInputKey}
                      name={f.key}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && submitForm()}
                    />
                  )}
                  {f.type === 'datetime' && (
                    <input
                      autoFocus={f.key === firstInputKey}
                      type="datetime-local"
                      name={f.key}
                      step={1}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                    />
                  )}
                  {f.type === 'textarea' && (
                    <textarea
                      name={f.key}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                    />
                  )}
                  {f.type === 'select' && (
                    <select
                      name={f.key}
                      value={values[f.key] ?? f.options?.[0]?.value ?? ''}
                      onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                    >
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {f.hint ? <div className="field-hint">{f.hint}</div> : null}
                </div>
              )
            })}
            <div className="dlg-btns">
              <button className="btn" onClick={closeDialog}>
                取消
              </button>
              <button className="btn primary" onClick={submitForm}>
                确定
              </button>
            </div>
          </>
        ) : d.kind === 'steps' ? (
          <StepsDialog title={d.title} initial={d.initial} onSubmit={d.onSubmit} />
        ) : (
          <>
            <h3>{d.title}</h3>
            <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>{d.message}</p>
            <div className="dlg-btns">
              <button className="btn" onClick={closeDialog}>
                取消
              </button>
              <button
                className="btn danger-t"
                style={{ borderColor: 'var(--danger)' }}
                onClick={() => {
                  closeDialog()
                  d.onOk()
                }}
              >
                {d.okText}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function ToastHost(): JSX.Element {
  const s = useSyncExternalStore(
    (l) => {
      toastListeners.add(l)
      return () => toastListeners.delete(l)
    },
    () => toastState
  )
  return (
    <div className={'toast' + (s.visible ? ' show' : '')}>
      <span className="dot" />
      <span>{s.msg}</span>
    </div>
  )
}
