// UI regression checks against the built app, using a disposable Electron profile.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-projector-test-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1450, height: 1050, webPreferences: { partition: 'ui-smoke', contextIsolation: true, nodeIntegration: false } });
  const evaluate = (fn, ...args) => window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
  const wait = () => new Promise((resolve) => setTimeout(resolve, 700));
  const errors = [];
  window.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  const select = async (label, value) => {
    await evaluate((label, value) => {
      const el = [...document.querySelectorAll('label')].find((el) => el.textContent.includes(label))?.querySelector('select');
      if (!el) throw new Error(`Missing select: ${label}`);
      el.focus(); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, label, value);
    await wait();
  };
  const inputValue = (label) => evaluate((label) => document.querySelector(`input[aria-label="${label}"]`)?.value, label);
  const edit = async (label, value, commit = true) => {
    await evaluate((label, value) => {
      const input = document.querySelector(`input[aria-label="${label}"]`);
      if (!input) throw new Error(`Missing input: ${label}`);
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, label, String(value));
    await wait();
    if (commit) {
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
      await wait();
    }
  };
  const tab = async (id) => { await evaluate((id) => document.getElementById(`tab-${id}`).click(), id); await wait(); };
  const remainder = () => evaluate(() => document.querySelector('.budget-live-total')?.textContent);
  const capture = async (name) => {
    if (!process.argv.includes('--capture')) return;
    const folder = path.join(__dirname, '..', 'artifacts');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, `${name}.png`), (await window.webContents.capturePage()).toPNG());
  };
  let code = 0;
  try {
    const appRoot = process.argv.includes('--packaged') ? 'release/win-unpacked/resources/app.asar' : '.';
    await window.loadFile(path.join(__dirname, '..', appRoot, 'dist', 'index.html')); await wait();
    assert.equal(await evaluate(() => document.querySelectorAll('[role="tab"]').length), 3);
    assert.equal(await evaluate(() => document.querySelectorAll('#results input').length), 0);
    assert.equal(await evaluate(() => document.getElementById('inputs').compareDocumentPosition(document.getElementById('results')) & Node.DOCUMENT_POSITION_FOLLOWING), 4);
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '850');
    assert.match(await remainder(), /522/);
    await capture('monthly-money');
    await edit('Taxable Brokerage monthly contribution', 1000, false);
    assert.match(await remainder(), /522/);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); await wait();
    assert.match(await remainder(), /372/);
    assert.match(await evaluate(() => document.querySelector('.zero-sum-adjustment').textContent), /372/);
    await edit('Roth 401(k) monthly contribution', 950);
    assert.match(await remainder(), /372/);
    await select('Contribution phase', 'phase-emergency');
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '0');
    assert.match(await remainder(), /Over budget.*478/);
    assert.match(await evaluate(() => document.querySelector('.zero-sum-adjustment').textContent), /478/);
    assert.equal(await evaluate(() => [...document.querySelectorAll('.allocation-row')].some((row) => row.textContent.includes('HYSA / Cash') && row.textContent.includes('2,100'))), true);
    await edit('HYSA / Cash monthly contribution', 1000);
    assert.match(await remainder(), /Unassigned take-home.*622/);
    await select('Contribution phase', 'phase-fire');
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1000');
    assert.equal(await inputValue('HYSA / Cash monthly contribution'), '250');
    assert.match(await remainder(), /372/);
    await select('Scenario you’re editing', 'higher');
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1342');
    await tab('plan');
    assert.equal(await inputValue('Expected real return'), '5');
    await select('Scenario you’re editing', 'conservative');
    assert.equal(await inputValue('Expected real return'), '4');
    await edit('Expected real return', 4.5);
    assert.equal(await inputValue('Expected real return'), '4.5');
    await capture('plan');
    await tab('accounts');
    await evaluate(() => document.querySelector('.account-summary').click()); await wait();
    assert.equal(await evaluate(() => document.body.textContent.includes('Base personal contribution')), false);
    assert.equal(await evaluate(() => document.querySelectorAll('#results input').length), 0);
    await select('Scenario you’re editing', 'base');
    await tab('money');
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1000');
    await window.webContents.reload(); await wait();
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1000');
    window.setSize(1050, 900); await wait(); await capture('monthly-money-small');
    assert.equal(await evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: input ordering, read-only results, Enter-only edits, brokerage math, payroll exclusion, phase selection, scenario isolation, effective plan settings, persistence, and desktop layout.');
  } catch (error) { console.error(error); code = 1; }
  finally {
    window.destroy();
    // Only the disposable directory created above can be removed.
    if (path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep + 'fire-projector-test-')) {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may still hold cache handles until exit. */ }
    }
    app.exit(code);
  }
});
