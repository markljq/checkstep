import type { Project } from '../types'
import { ACCENTS } from '../store'
import type { AccentKey, Theme } from '../types'

/* ---------- 分享进度：纵向里程碑卡时间线 ---------- */

interface Group {
  name: string
  tasks: { done: boolean; title: string }[]
}

interface Palette {
  wash: string
  card: string
  cardStroke: string
  text: string
  text2: string
  text3: string
  line: string
  axis: string
  chip: string
  doneSoft: string
  doneStroke: string
  hdrA: number
}

const THEMES: Record<Theme, Palette> = {
  light: {
    wash: '#F6F8FB',
    card: '#FFFFFF',
    cardStroke: '#E6EAF1',
    text: '#17191D',
    text2: '#5A616B',
    text3: '#98A0AA',
    line: '#E8ECF2',
    axis: '#DCE1E8',
    chip: '#F2F5F9',
    doneSoft: '#EAF3FE',
    doneStroke: '#C7E0FB',
    hdrA: 0.1
  },
  dark: {
    wash: '#1B1C1E',
    card: '#24262A',
    cardStroke: '#36393F',
    text: '#F2F3F5',
    text2: '#B7BCC4',
    text3: '#7D838C',
    line: '#33363B',
    axis: '#3E4248',
    chip: '#2C2F34',
    doneSoft: 'rgba(76,194,255,0.15)',
    doneStroke: 'rgba(76,194,255,0.45)',
    hdrA: 0.13
  }
}

const FONT = "Segoe UI, Microsoft YaHei, PingFang SC, sans-serif"

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const trunc = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function fmtNow(): string {
  const d = new Date()
  const z = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`
}

/** 粗略估算文字宽度（中文按 12px/字，西文 6.8px/字），用于胶囊自适应宽度 */
function estWidth(s: string): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 255 ? 12 : 6.8
  return w
}

function checkPath(x: number, y: number, r: number, color: string): string {
  return (
    `<path d="M${x - r * 0.45} ${y} L${x - r * 0.1} ${y + r * 0.38} L${x + r * 0.5} ${y - r * 0.38}" ` +
    `fill="none" stroke="${color}" stroke-width="${(r * 0.42).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`
  )
}

/**
 * 生成纵向里程碑时间线 SVG：里程碑卡片自上而下排列，执行项以胶囊自动换行，
 * 已完成填充主题色。不显示具体完成时间，配色与深浅主题跟随用户当前设置。
 */
export function buildTimelineSVG(project: Project, accentKey: AccentKey, theme: Theme = 'light'): string {
  const accentDef = ACCENTS[accentKey] ?? ACCENTS.blue
  const accent = theme === 'dark' ? accentDef.dark : accentDef.light
  const onAccent = theme === 'dark' ? accentDef.darkOn : accentDef.lightOn
  const th = THEMES[theme] ?? THEMES.light

  const groups: Group[] = project.milestones.map((m) => ({ name: m.name, tasks: m.tasks }))

  const total = groups.reduce((s, g) => s + g.tasks.length, 0)
  const dn = groups.reduce((s, g) => s + g.tasks.filter((t) => t.done).length, 0)
  const pct = total ? Math.round((dn / total) * 100) : 0

  let currentIdx = -1
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].tasks.some((t) => !t.done)) {
      currentIdx = i
      break
    }
  }

  const M = 56
  const W_MAX = 980
  const axisX = 104
  const cardX = 134

  /* 预排：先量出每个分组「一整行」需要多宽，据此决定画布宽度（内容少时不留大片空白） */
  const measured = groups.map((g) => {
    const items = g.tasks.map((t) => {
      const label = trunc(t.title, 18)
      return { label, w: 30 + estWidth(label), done: t.done }
    })
    const sum = items.reduce((s, it) => s + it.w + 8, 0)
    return { items, sum }
  })
  const idealInner = Math.max(320, ...measured.map((m) => m.sum))
  const maxInner = W_MAX - M - cardX - 32
  const innerW = Math.min(maxInner, idealInner)
  const cardW = innerW + 32
  const headerNeed = M + estWidth(trunc(project.name, 22)) * (23 / 12) + 250
  const W = Math.max(Math.min(cardX + cardW + M, W_MAX), Math.min(W_MAX, headerNeed))

  /* 按最终宽度换行 */
  const laid = measured.map((m) => {
    const rows: { label: string; w: number; done: boolean }[][] = [[]]
    let x = 0
    for (const it of m.items) {
      const w = Math.min(innerW, it.w)
      if (x + w > innerW && rows[rows.length - 1].length) {
        rows.push([])
        x = 0
      }
      rows[rows.length - 1].push({ ...it, w })
      x += w + 8
    }
    const rowCount = Math.max(1, rows.length)
    return { rows, rowCount, h: 46 + rowCount * 34 + 6 }
  })

  let y = 172
  const tops = laid.map((l) => {
    const t = y
    y += l.h + 16
    return t
  })
  const H = y + 46

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`)
  parts.push(`<rect width="${W}" height="${H}" fill="${th.wash}"/>`)

  /* ---------- 标题区 ---------- */
  parts.push(
    `<defs><linearGradient id="csHdr" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="${accent}" stop-opacity="${th.hdrA}"/>` +
      `<stop offset="0.75" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>`,
    `<rect x="0" y="0" width="${W}" height="122" fill="url(#csHdr)"/>`,
    `<text x="${M}" y="60" font-size="23" font-weight="700" fill="${th.text}">${esc(trunc(project.name, 22))}</text>`,
    `<text x="${M}" y="86" font-size="12.5" fill="${th.text3}">${esc(
      `${project.milestones.length} 个里程碑 · ${total} 个执行项 · 生成于 ${fmtNow()}`
    )}</text>`,
    `<text x="${W - M}" y="62" text-anchor="end" font-size="34" font-weight="700" fill="${accent}">${pct}%</text>`,
    `<text x="${W - M}" y="86" text-anchor="end" font-size="12" fill="${th.text3}">已完成 ${dn} / ${total} 项</text>`,
    `<rect x="${M}" y="102" width="${W - 2 * M}" height="6" rx="3" fill="${th.axis}"/>`
  )
  if (dn > 0) {
    parts.push(
      `<rect x="${M}" y="102" width="${Math.max(6, ((W - 2 * M) * pct) / 100)}" height="6" rx="3" fill="${accent}"/>`
    )
  }

  if (!groups.length) {
    parts.push(
      `<text x="${W / 2}" y="${H / 2 + 40}" text-anchor="middle" font-size="15" fill="${th.text3}">暂无执行项</text>`,
      '</svg>'
    )
    return parts.join('\n')
  }

  /* ---------- 纵向主轴（已完成段高亮） ---------- */
  const firstY = tops[0] + 26
  const lastY = tops[tops.length - 1] + 26
  const curY = currentIdx >= 0 ? tops[currentIdx] + 26 : lastY
  parts.push(
    `<line x1="${axisX}" y1="${firstY}" x2="${axisX}" y2="${lastY}" stroke="${th.axis}" stroke-width="2.5" stroke-linecap="round"/>`
  )
  if (curY > firstY) {
    parts.push(
      `<line x1="${axisX}" y1="${firstY}" x2="${axisX}" y2="${curY}" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>`
    )
  }

  /* ---------- 里程碑卡片 ---------- */
  groups.forEach((g, i) => {
    const card = laid[i]
    const cy = tops[i]
    const done = g.tasks.filter((t) => t.done).length
    const full = done === g.tasks.length && g.tasks.length > 0
    const isCur = i === currentIdx

    parts.push(
      `<rect x="${cardX}" y="${cy}" width="${cardW}" height="${card.h}" rx="14" fill="${th.card}" stroke="${
        isCur ? accent : th.cardStroke
      }" stroke-width="${isCur ? 1.8 : 1}"/>`,
      `<text x="${cardX + 16}" y="${cy + 28}" font-size="14.5" font-weight="600" fill="${th.text}">${esc(
        trunc(g.name, 16)
      )}</text>`,
      `<text x="${cardX + cardW - 16}" y="${cy + 28}" text-anchor="end" font-size="12" fill="${
        full ? accent : th.text3
      }">${done}/${g.tasks.length} 项</text>`
    )

    if (!g.tasks.length) {
      parts.push(
        `<text x="${cardX + 16}" y="${cy + 44 + 18}" font-size="12" fill="${th.text3}">暂无执行项</text>`
      )
    }

    card.rows.forEach((row, r) => {
      let x = cardX + 16
      const top = cy + 44 + r * 34
      for (const c of row) {
        if (c.done) {
          parts.push(
            `<rect x="${x}" y="${top}" width="${c.w}" height="26" rx="13" fill="${th.doneSoft}" stroke="${th.doneStroke}" stroke-width="1"/>`,
            `<circle cx="${x + 13}" cy="${top + 13}" r="5.2" fill="${accent}"/>`,
            checkPath(x + 13, top + 13, 5.2, onAccent),
            `<text x="${x + 23}" y="${top + 17.5}" font-size="12" font-weight="500" fill="${th.text}">${esc(c.label)}</text>`
          )
        } else {
          parts.push(
            `<rect x="${x}" y="${top}" width="${c.w}" height="26" rx="13" fill="${th.chip}" stroke="${th.cardStroke}" stroke-width="1"/>`,
            `<circle cx="${x + 13}" cy="${top + 13}" r="4.6" fill="none" stroke="${th.text3}" stroke-width="1.5"/>`,
            `<text x="${x + 23}" y="${top + 17.5}" font-size="12" fill="${th.text2}">${esc(c.label)}</text>`
          )
        }
        x += c.w + 8
      }
    })

    /* 轴节点 */
    const ny = cy + 26
    if (isCur) {
      parts.push(
        `<circle cx="${axisX}" cy="${ny}" r="18" fill="${accent}" opacity="0.14"/>`,
        `<circle cx="${axisX}" cy="${ny}" r="11" fill="${th.wash}" stroke="${accent}" stroke-width="3"/>`,
        `<text x="${axisX}" y="${ny + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${accent}">${i + 1}</text>`
      )
    } else if (full) {
      parts.push(`<circle cx="${axisX}" cy="${ny}" r="11" fill="${accent}"/>`, checkPath(axisX, ny, 11, onAccent))
    } else {
      parts.push(
        `<circle cx="${axisX}" cy="${ny}" r="11" fill="${th.card}" stroke="${th.axis}" stroke-width="2.5"/>`,
        `<text x="${axisX}" y="${ny + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="${th.text3}">${i + 1}</text>`
      )
    }
  })

  /* ---------- 图例（左下）与进度标注（右下） ---------- */
  const ly = H - 22
  parts.push(
    `<circle cx="${M + 6}" cy="${ly - 4}" r="6.2" fill="${accent}"/>`,
    checkPath(M + 6, ly - 4, 6.2, onAccent),
    `<text x="${M + 18}" y="${ly}" font-size="11.5" fill="${th.text2}">已完成</text>`,
    `<circle cx="${M + 78}" cy="${ly - 4}" r="5.4" fill="none" stroke="${th.text3}" stroke-width="1.5"/>`,
    `<text x="${M + 89}" y="${ly}" font-size="11.5" fill="${th.text2}">未执行</text>`,
    `<text x="${W - M}" y="${ly}" text-anchor="end" font-size="11.5" fill="${th.text3}">按里程碑顺序 · 进行到第 ${
      currentIdx >= 0 ? currentIdx + 1 : groups.length
    } 项</text>`
  )

  parts.push('</svg>')
  return parts.join('\n')
}

/** SVG 字符串 → PNG base64（不含 data: 前缀），用于保存/复制 */
export async function svgToPngBase64(svg: string, scale = 2): Promise<string> {
  // 用 data URL 而非 blob URL，避免 CSP img-src 限制导致加载失败
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('SVG 渲染失败'))
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth * scale
  canvas.height = img.naturalHeight * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0)
  const dataUrl = canvas.toDataURL('image/png')
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
