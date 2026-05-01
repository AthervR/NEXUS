const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    backgroundColor: '#0e0010',
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    title: 'NEXUS',
  })

  win.loadURL('http://localhost:5173')
  win.setMenuBarVisibility(false)

  // Alt+F4 to close since there's no frame
  win.webContents.on('before-input-event', (event, input) => {
    if (input.alt && input.key === 'F4') app.quit()
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())