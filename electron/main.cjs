const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

const developmentUrl = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const window = new BrowserWindow({
    title: 'FIRE Projector',
    width: 1500,
    height: 980,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#071b24',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const allowedUrl = developmentUrl ?? `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
    if (!url.startsWith(allowedUrl)) event.preventDefault();
  });

  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
