const { app, BrowserWindow } = require('electron')
const path = require('path')
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1500, height: 1100, show: true })
  win.loadFile(path.join(__dirname, 'timeline-styles.html'))
})
