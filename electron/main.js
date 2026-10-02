const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const isDev = !app.isPackaged;

async function loadFrontend(win) {
  const devUrl = 'http://localhost:5173';
  const builtFile = path.join(__dirname, '../dist/index.html');

  if (isDev) {
    try {
      const response = await fetch(devUrl, { method: 'GET' });
      if (response.ok) {
        await win.loadURL(devUrl);
        return;
      }
    } catch (error) {
      // Fall through to the built app when the Vite dev server is not running.
    }
  }

  if (fs.existsSync(builtFile)) {
    await win.loadFile(builtFile);
    return;
  }

  if (isDev) {
    await win.loadURL(devUrl);
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0d0f18',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await loadFrontend(win);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
