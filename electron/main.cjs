const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const developmentUrl = process.env.VITE_DEV_SERVER_URL;
const releaseApi = 'https://api.github.com/repos/itsTyger1/fire_Calc/releases/latest';

const requestJson = (url) => new Promise((resolve, reject) => {
  const request = https.get(url, { headers: { 'User-Agent': 'FIRE-Projector-Updater', Accept: 'application/vnd.github+json' } }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('error', reject);
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

const downloadFile = (url, destination, redirects = 0) => new Promise((resolve, reject) => {
  if (redirects > 5 || new URL(url).protocol !== 'https:') return reject(new Error('Invalid update download redirect'));
  const request = https.get(url, { headers: { 'User-Agent': 'FIRE-Projector-Updater', Accept: 'application/octet-stream' } }, (response) => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      response.resume();
      return downloadFile(new URL(response.headers.location, url).href, destination, redirects + 1).then(resolve, reject);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.resume();
      return reject(new Error(`Download failed (${response.statusCode})`));
    }
    const output = fs.createWriteStream(destination);
    pipeline(response, output).then(resolve, reject);
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

let installingUpdate = false;
ipcMain.handle('download-and-install-update', async (_event, downloadUrl) => {
  if (typeof downloadUrl !== 'string' || !/^https:\/\/github\.com\/itsTyger1\/fire_Calc\/releases\/download\/[^/]+\/FIRE-Projector-Setup-[^/]+\.exe$/.test(downloadUrl)) throw new Error('Invalid update download URL');
  if (installingUpdate) throw new Error('An update is already being installed');
  installingUpdate = true;
  const destination = path.join(os.tmpdir(), `FIRE-Projector-update-${Date.now()}.exe`);
  try {
    await downloadFile(downloadUrl, destination);
    await new Promise((resolve, reject) => {
      const installer = spawn(destination, [], { detached: true, stdio: 'ignore' });
      installer.once('error', reject);
      installer.once('spawn', () => { installer.unref(); resolve(); });
    });
    app.quit();
    return { started: true };
  } catch (error) {
    await fs.promises.rm(destination, { force: true }).catch(() => {});
    throw error;
  } finally {
    installingUpdate = false;
  }
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
