import { useEffect, useRef, useState } from 'react'
import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components'
import { ACCENTS, initStore, update, useStore } from './store'
import type { AccentKey } from './types'
import { Sidebar } from './components/Sidebar'
import { ProjectView } from './components/ProjectView'
import { DialogHost, ToastHost, toast } from './components/Dialogs'

/* ---------- 首次使用指引（topTips） ---------- */
function GuideOverlay(): JSX.Element {
  const tips: { icon: string; title: string; desc: string }[] = [
    { icon: '📁', title: '项目', desc: '左侧管理项目列表，一个项目对应一次上线操作，支持新增、复制、导入导出' },
    { icon: '🚩', title: '里程碑与执行项', desc: '执行项归属里程碑分阶段管理；右上角切换「编辑模式」即可增删改与拖拽排序' },
    { icon: '✓', title: '登记完成', desc: '执行模式点击执行项前的圆圈即登记完成，自动记录完成时间（可修改），步骤可逐项打勾' },
    { icon: '👆', title: '快速定位', desc: '内容较多时，右下角「待办」悬浮按钮可一键定位到最早未执行的执行项；顶部支持全部折叠 / 展开' }
  ]
  return (
    <div className="overlay show" role="dialog" aria-modal="true">
      <div className="dialog dialog-guide">
        <div className="guide-hero">
          <div className="app-icon large" />
          <h3>欢迎使用 Check Step</h3>
          <p>上线操作检查清单 · 按步骤执行，不漏项</p>
        </div>
        <div className="guide-list">
          {tips.map((t) => (
            <div className="guide-item" key={t.title}>
              <span className="guide-icon">{t.icon}</span>
              <div>
                <div className="guide-title">{t.title}</div>
                <div className="guide-desc">{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="dlg-btns">
          <button
            className="btn primary"
            onClick={() => {
              update((d) => { d.guideSeen = true })
              toast('开始使用吧！')
            }}
          >
            开始使用
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App(): JSX.Element | null {
  const db = useStore()
  const [accentOpen, setAccentOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void initStore()
  }, [])

  // 主题同步到根元素（驱动 CSS 变量切换）
  useEffect(() => {
    document.documentElement.dataset.theme = db?.theme ?? 'dark'
  }, [db?.theme])

  // 主题色同步（深浅色各有一套色值）
  useEffect(() => {
    const a = ACCENTS[db?.accent ?? 'blue']
    const dark = (db?.theme ?? 'dark') === 'dark'
    const accent = dark ? a.dark : a.light
    const on = dark ? a.darkOn : a.lightOn
    const root = document.documentElement.style
    root.setProperty('--accent', accent)
    root.setProperty('--on-accent', on)
    root.setProperty('--accent-hover', `color-mix(in srgb, ${accent} 86%, ${dark ? 'white' : 'black'})`)
    root.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 14%, transparent)`)
  }, [db?.accent, db?.theme])

  // 点击外部关闭配色面板
  useEffect(() => {
    if (!accentOpen) return
    const onDown = (e: MouseEvent): void => {
      if (!pickerRef.current?.contains(e.target as Node)) setAccentOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [accentOpen])

  if (!db) {
    return (
      <div className="boot">
        <div className="app-icon large" />
        <div>正在加载…</div>
      </div>
    )
  }

  const setMode = (m: 'execute' | 'edit'): void => {
    update((d) => { d.mode = m })
    toast(m === 'edit' ? '已进入编辑模式：可增删改清单，支持拖拽排序' : '已返回执行模式')
  }

  return (
    <FluentProvider theme={db.theme === 'light' ? webLightTheme : webDarkTheme}>
      <div id="app">
        <div className="titlebar">
          <div className="app-icon" />
          <span className="name">Check Step</span>
          <div className="spacer" />
          <div className="mode-switch">
            <button className={db.mode === 'execute' ? 'active' : ''} onClick={() => setMode('execute')}>
              执行模式
            </button>
            <button className={db.mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>
              编辑模式
            </button>
          </div>
          <div className="theme-picker" ref={pickerRef}>
            <button className="icon-btn" title="自定义主题色" onClick={() => setAccentOpen((v) => !v)}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M8 1.8a6.2 6.2 0 1 0 0 12.4c1.1 0 1.5-.7 1.5-1.4 0-.8-.6-1.1-.6-1.9 0-.7.6-1.2 1.4-1.2h1c1.5 0 2.5-1 2.5-2.5A5.4 5.4 0 0 0 8 1.8z" />
                <circle cx="5.2" cy="6" r="1" fill="currentColor" stroke="none" />
                <circle cx="8" cy="4.4" r="1" fill="currentColor" stroke="none" />
                <circle cx="10.8" cy="6" r="1" fill="currentColor" stroke="none" />
              </svg>
            </button>
            {accentOpen && (
              <div className="accent-pop">
                <div className="pop-title">主题色</div>
                <div className="swatches">
                  {(Object.keys(ACCENTS) as AccentKey[]).map((k) => {
                    const a = ACCENTS[k]
                    return (
                      <button
                        key={k}
                        className={'swatch' + (db.accent === k ? ' active' : '')}
                        style={{ background: db.theme === 'dark' ? a.dark : a.light }}
                        title={a.name}
                        onClick={() => {
                          update((d) => { d.accent = k })
                          setAccentOpen(false)
                          toast('主题色：' + a.name)
                        }}
                      >
                        {db.accent === k && <span className="swatch-tick">✓</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="pop-hint">配色会同时应用到勾选、进度与按钮</div>
              </div>
            )}
          </div>
          <button
            className="icon-btn"
            title="切换深色 / 浅色"
            onClick={() => update((d) => { d.theme = d.theme === 'dark' ? 'light' : 'dark' })}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z" />
            </svg>
          </button>
          <div className="win-controls-space" />
        </div>
        <div className="body">
          <Sidebar />
          <ProjectView />
        </div>
      </div>
      <DialogHost />
      <ToastHost />
      {!db.guideSeen && <GuideOverlay />}
    </FluentProvider>
  )
}
