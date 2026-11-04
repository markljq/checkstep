/**
 * 生成应用图标 build/icon.png（512×512，RGBA）
 * 纯 Node 实现：SDF 抗锯齿绘制 + zlib 编码 PNG，无需外部依赖
 * 运行：node scripts/make-icon.mjs
 */
import { deflateSync } from 'zlib'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SIZE = 512
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png')

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- 绘制工具 ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const clamp01 = (v) => clamp(v, 0, 1)

function sdRoundRect(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r)
  const qy = Math.abs(py - cy) - (halfH - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

function sdSegment(px, py, ax, ay, bx, by, radius) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy))
  return Math.hypot(wx - vx * t, wy - vy * t) - radius
}

function sdPolyline(px, py, pts, radius) {
  let d = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    d = Math.min(d, sdSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], radius))
  }
  return d
}

/* 标准 over 合成 */
function over(dst, i, r, g, b, a) {
  if (a <= 0) return
  const dr = dst[i]
  const dg = dst[i + 1]
  const db = dst[i + 2]
  const da = dst[i + 3] / 255
  const oa = a + da * (1 - a)
  if (oa <= 0) return
  dst[i] = Math.round((r * a + dr * da * (1 - a)) / oa)
  dst[i + 1] = Math.round((g * a + dg * da * (1 - a)) / oa)
  dst[i + 2] = Math.round((b * a + db * da * (1 - a)) / oa)
  dst[i + 3] = Math.round(oa * 255)
}

/* ---------- 绘制图标 ---------- */
const buf = Buffer.alloc(SIZE * SIZE * 4)

const R = 116 // 圆角半径（Win11 风格圆角方块）
const TOP = [86, 198, 255]
const BOTTOM = [11, 106, 191]

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    const px = x + 0.5
    const py = y + 0.5

    // 背景：圆角方块 + 垂直渐变
    const dRect = sdRoundRect(px, py, 256, 256, 250, 250, R)
    const covRect = clamp01(0.5 - dRect)
    if (covRect > 0) {
      const t = clamp01((py - 6) / (SIZE - 12))
      const grad = [
        Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
        Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
        Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t)
      ]
      over(buf, i, grad[0], grad[1], grad[2], covRect)
    }

    // 顶部柔和高光，增强 Windows 11 亚克力质感
    const dHi = Math.hypot(px - 256, py - 30) - 210
    const covHi = clamp01(0.5 - dHi) * 0.16 * covRect
    if (covHi > 0) over(buf, i, 255, 255, 255, covHi)

    // 圆环
    const dRing = Math.abs(Math.hypot(px - 256, py - 258) - 152) - 15
    const covRing = clamp01(0.5 - dRing) * 0.92 * covRect
    if (covRing > 0) over(buf, i, 255, 255, 255, covRing)

    // 对勾
    const dTick = sdPolyline(px, py, [[176, 262], [234, 320], [340, 196]], 26)
    const covTick = clamp01(0.5 - dTick) * covRect
    if (covTick > 0) over(buf, i, 255, 255, 255, covTick)
  }
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, encodePNG(buf, SIZE, SIZE))
console.log('图标已生成:', OUT)
