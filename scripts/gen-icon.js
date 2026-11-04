/**
 * 用 Electron 渲染层 canvas 将 build/icon.svg 转成 512x512 透明背景 PNG。
 * 运行: npx electron scripts/gen-icon.js
 */
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

// 防止上游泄漏的 ELECTRON_RUN_AS_NODE 导致 electron 以纯 node 模式启动
delete process.env.ELECTRON_RUN_AS_NODE

const ROOT = join(__dirname, '..')

app.whenReady().then(async () => {
  try {
    const svg = readFileSync(join(ROOT, 'build', 'icon.svg'), 'utf-8')
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    await win.loadURL('data:text/html,<body></body>')
    const dataUrl = await win.webContents.executeJavaScript(
      `(async () => {
        const svg = ${JSON.stringify(svg)}
        const img = new Image()
        await new Promise((res, rej) => {
          img.onload = res
          img.onerror = () => rej(new Error('svg load failed'))
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
        })
        const c = document.createElement('canvas')
        c.width = 512
        c.height = 512
        const ctx = c.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, 512, 512)
        return c.toDataURL('image/png')
      })()`
    )
    const out = join(ROOT, 'build', 'icon.png')
    writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log('[gen-icon] OK ->', out)
    app.exit(0)
  } catch (err) {
    console.error('[gen-icon] FAIL:', err)
    app.exit(1)
  }
})
