const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const path = require('node:path');

const developmentUrl = process.env.VITE_DEV_SERVER_URL;
const releaseApi = 'https://api.github.com/repos/itsTyger1/fire_Calc/releases/latest';

const requestJson = (url) => new Promise((resolve, reject) => {
  const request = https.get(url, { headers: { 'User-Agent': 'FIRE-Projector-Updater', Accept: 'application/vnd.github+json' } }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const error = new Error(`Update check failed (${response.statusCode})`);
        error.statusCode = response.statusCode;
        return reject(error);
      }
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Update service returned invalid data')); }
    });
  });
  request.on('error', reject);
  request.setTimeout(10000, () => request.destroy(new Error('Update check timed out')));
});

const downloadFile = (url, destination) => new Promise((resolve, reject) => {
  const request = https.get(url, { headers: { 'User-Agent': 'FIRE-Projector-Updater', Accept: 'application/octet-stream' } }, (response) => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) return downloadFile(response.headers.location, destination).then(resolve, reject);
    if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Download failed (${response.statusCode})`));
    const output = fs.createWriteStream(destination);
    response.pipe(output);
    output.on('finish', () => output.close(resolve));
    output.on('error', reject);
  });
  request.on('error', reject);
  request.setTimeout(120000, () => request.destroy(new Error('Update download timed out')));
});

const normalizeVersion = (value) => String(value ?? '').replace(/^v/i, '').split('-')[0].split('.').map((part) => Number.parseInt(part, 10) || 0);
const isNewer = (candidate, current) => {
  const next = normalizeVersion(candidate); const installed = normalizeVersion(current);
  for (let index = 0; index < Math.max(next.length, installed.length); index += 1) {
    if ((next[index] ?? 0) !== (installed[index] ?? 0)) return (next[index] ?? 0) > (installed[index] ?? 0);
  }
  return false;
};

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
      preload: path.join(__dirname, 'preload.cjs'),
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

ipcMain.handle('check-for-updates', async () => {
  let release;
  try {
    release = await requestJson(releaseApi);
  } catch (error) {
    if (error?.statusCode === 404) return { currentVersion: app.getVersion(), updateAvailable: false, noPublishedRelease: true };
    throw error;
  }
  const asset = (release.assets ?? []).find((item) => /FIRE-Projector-Setup-.*\.exe$/i.test(item.name));
  return { currentVersion: app.getVersion(), latestVersion: release.tag_name, updateAvailable: isNewer(release.tag_name, app.getVersion()), downloadUrl: asset?.browser_download_url ?? null, releaseUrl: release.html_url };
});

ipcMain.handle('download-and-install-update', async (_event, downloadUrl) => {
  if (typeof downloadUrl !== 'string' || !downloadUrl.startsWith('https://github.com/')) throw new Error('Invalid update download URL');
  const destination = path.join(os.tmpdir(), `FIRE-Projector-update-${Date.now()}.exe`);
  await downloadFile(downloadUrl, destination);
  const result = await dialog.showMessageBox({ type: 'info', buttons: ['Install update', 'Cancel'], defaultId: 0, cancelId: 1, title: 'FIRE Projector update ready', message: 'The update has downloaded. Install it now?' });
  if (result.response !== 0) return { started: false };
  spawn(destination, [], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
  return { started: true };
});

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
