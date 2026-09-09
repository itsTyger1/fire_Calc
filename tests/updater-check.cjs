const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const source = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
const url = 'https://github.com/itsTyger1/fire_Calc/releases/download/v1.2.1/FIRE-Projector-Setup-1.2.1.exe';

function updater(t, { status = 200, release = {}, spawnError = false, downloadError = false } = {}) {
  const handlers = {};
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-updater-test-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  let quit = false;
  const app = { getVersion: () => '1.1.1', whenReady: () => new Promise(() => {}), on() {}, quit() { quit = true; } };
  const mocks = {
    electron: { app, ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, Menu: { setApplicationMenu() {} } },
    'node:os': { tmpdir: () => folder },
    'node:https': { get(address, options, callback) {
      const request = new EventEmitter();
      request.setTimeout = () => {};
      process.nextTick(() => {
        const response = new PassThrough();
        response.statusCode = status;
        response.headers = {};
        callback(response);
        if (address.includes('api.github.com')) response.end(JSON.stringify(release));
        else if (downloadError) response.destroy(new Error('Connection interrupted'));
        else response.end('test installer');
      });
      return request;
    } },
    'node:child_process': { spawn() {
      const child = new EventEmitter();
      child.unref = () => {};
      process.nextTick(() => spawnError ? child.emit('error', new Error('Installer failed to start')) : child.emit('spawn'));
      return child;
    } },
  };
  vm.runInNewContext(source, { require: (name) => mocks[name] ?? require(name), process, __dirname: path.join(__dirname, '../electron'), URL });
  return { check: () => handlers['check-for-updates'](), install: (address = url) => handlers['download-and-install-update']({}, address), quit: () => quit, folder };
}

test('an existing 1.1.1 app detects the automated release', async (t) => {
  const result = await updater(t, { release: { tag_name: 'v1.2.1', assets: [{ name: 'FIRE-Projector-Setup-1.2.1.exe', browser_download_url: url }] } }).check();
  assert.equal(result.updateAvailable, true);
  assert.equal(result.downloadUrl, url);
});
test('missing releases and API failures are distinguished', async (t) => {
  assert.equal((await updater(t, { status: 404 }).check()).noPublishedRelease, true);
  await assert.rejects(updater(t, { status: 403 }).check(), /403/);
});
test('same version is not offered as an update', async (t) => {
  assert.equal((await updater(t, { release: { tag_name: 'v1.1.1' } }).check()).updateAvailable, false);
});
test('installers outside this repository are rejected', async (t) => {
  await assert.rejects(updater(t).install(url.replace('itsTyger1', 'someone-else')), /Invalid update/);
});
test('failed installer launch keeps the app running and removes the download', async (t) => {
  const app = updater(t, { spawnError: true });
  await assert.rejects(app.install(), /failed to start/);
  assert.equal(app.quit(), false);
  assert.deepEqual(fs.readdirSync(app.folder), []);
});
test('interrupted downloads keep the app running and remove partial files', async (t) => {
  const app = updater(t, { downloadError: true });
  await assert.rejects(app.install(), /Connection interrupted/);
  assert.equal(app.quit(), false);
  assert.deepEqual(fs.readdirSync(app.folder), []);
});
test('successful installer launch closes the app', async (t) => {
  const app = updater(t);
  assert.equal((await app.install()).started, true);
  assert.equal(app.quit(), true);
});
