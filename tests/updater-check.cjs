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

function updater(t, { status = 200, release = {}, spawnError = false, downloadError = false, cancelSave = false, invalidFolder = false } = {}) {
  const handlers = {};
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-updater-test-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  let quit = false;
  const app = { getPath: () => folder, getVersion: () => '1.1.1', whenReady: () => new Promise(() => {}), on() {}, quit() { quit = true; } };
  const filePath = path.join(folder, ...(invalidFolder ? ['missing'] : []), 'My retirement plan.json');
  let dialogOptions;
  const mocks = {
    electron: { app, BrowserWindow: { fromWebContents: () => null }, dialog: { showSaveDialog: async (_parent, options) => { dialogOptions = options; return { canceled: cancelSave, filePath }; } }, ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, Menu: { setApplicationMenu() {} } },
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
  return { check: () => handlers['check-for-updates'](), install: (address = url) => handlers['download-and-install-update']({}, address), save: (data) => handlers['save-plan-file']({}, 'My FIRE plan', data), dialogOptions: () => dialogOptions, filePath, quit: () => quit, folder };
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

const plan = { version: 1, profile: { retirementAge: 50 }, accounts: [], phases: [], scenarios: [], budget: [] };
test('Save As writes the complete named plan and returns the chosen location', async (t) => {
  const app = updater(t);
  const result = await app.save(plan);
  assert.equal(result.canceled, false);
  assert.equal(result.filePath, app.filePath);
  assert.equal(result.name, 'My retirement plan');
  const saved = JSON.parse(fs.readFileSync(app.filePath, 'utf8'));
  assert.deepEqual(saved.data, plan);
  assert.equal(saved.name, result.name);
  assert.ok(saved.id && saved.savedAt);
  assert.equal(app.dialogOptions().defaultPath, path.join(app.folder, 'My FIRE plan.json'));
  await app.save({ ...plan, profile: { retirementAge: 55 } });
  assert.equal(JSON.parse(fs.readFileSync(app.filePath, 'utf8')).data.profile.retirementAge, 55);
  assert.deepEqual(fs.readdirSync(app.folder), ['My retirement plan.json']);
});
test('canceling Save As writes nothing', async (t) => {
  const app = updater(t, { cancelSave: true });
  assert.equal((await app.save(plan)).canceled, true);
  assert.deepEqual(fs.readdirSync(app.folder), []);
});
test('save failures are reported without claiming success', async (t) => {
  const app = updater(t, { invalidFolder: true });
  await assert.rejects(app.save(plan), /ENOENT/);
  assert.deepEqual(fs.readdirSync(app.folder), []);
});
test('invalid plan data is rejected before opening Save As', async (t) => {
  const app = updater(t);
  await assert.rejects(app.save({}), /Invalid plan data/);
  assert.equal(app.dialogOptions(), undefined);
});
