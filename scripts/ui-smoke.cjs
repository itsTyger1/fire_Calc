// UI regression checks against the built app, using a disposable Electron profile.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const { version: packageVersion } = require('../package.json');
// Keep the populated regression fixture separate from a new user's blank plan.
const populatedFixture = require('./planner-fixture.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-projector-test-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
let saveOutcome = 'success';
let savedPlan;
ipcMain.handle('save-plan-file', async (_event, _name, data) => {
  assert.equal(data.version, 1);
  if (saveOutcome === 'cancel') return { canceled: true };
  if (saveOutcome === 'error') throw new Error('Test save failure');
  savedPlan = { id: 'ui-smoke-save', name: 'Retirement test', savedAt: new Date().toISOString(), data };
  return { canceled: false, name: 'Retirement test', filePath: path.join(profile, 'Retirement test.json') };
});
ipcMain.handle('list-plan-files', async () => savedPlan ? [savedPlan] : []);
ipcMain.handle('delete-plan-file', async (_event, id) => {
  if (!savedPlan || savedPlan.id !== id) return false;
  savedPlan = undefined;
  return true;
});
ipcMain.handle('get-app-version', () => packageVersion);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1450, height: 1050, webPreferences: { partition: 'ui-smoke', backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, '../electron/preload.cjs') } });
  const evaluate = async (fn, ...args) => {
    const result = await window.webContents.executeJavaScript(`(() => { try { return { value: (${fn.toString()})(...${JSON.stringify(args)}) }; } catch (error) { return { error: error.stack || error.message }; } })()`)
      .catch((error) => { throw new Error(`${error.message}\nDuring: ${fn.toString()}`); });
    if (result.error) throw new Error(result.error);
    return result.value;
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, 700));
  const errors = [];
  window.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  const select = async (label, value) => {
    if (label === 'Scenario you’re editing') {
      await evaluate(() => document.querySelector('[aria-label="Choose scenario"]').click());
      await wait();
      await evaluate((id) => {
        const names = { base: 'Base FIRE at 50', conservative: 'Conservative returns' };
        const option = [...document.querySelectorAll('#scenario-options [role="option"]')].find((el) => el.querySelector('span')?.textContent === names[id]);
        if (!option) throw new Error(`Missing scenario: ${id}`);
        option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }, value);
      await wait();
      return;
    }
    await evaluate((label, value) => {
      const el = [...document.querySelectorAll('label')].find((el) => el.textContent.includes(label))?.querySelector('select');
      if (!el) throw new Error(`Missing select: ${label}`);
      el.focus(); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, label, value);
    await wait();
  };
  const inputValue = (label) => evaluate((label) => {
    const account = label.match(/^(.*) monthly contribution$/)?.[1];
    const input = [...document.querySelectorAll('input')].find((element) => {
      const ariaLabel = element.getAttribute('aria-label');
      return ariaLabel === label || (account && ariaLabel?.startsWith(`${account} monthly personal contribution,`));
    });
    return input?.value;
  }, label);
  const edit = async (label, value, commit = true) => {
    await evaluate((label, value) => {
      const account = label.match(/^(.*) monthly contribution$/)?.[1];
      const input = [...document.querySelectorAll('input')].find((element) => {
        const ariaLabel = element.getAttribute('aria-label');
        return ariaLabel === label || (account && ariaLabel?.startsWith(`${account} monthly personal contribution,`));
      });
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
    // Native click/blur events require focused web contents, even when hidden.
    window.webContents.focus();
    assert.equal(await evaluate(() => document.querySelector('.app-version')?.textContent), `v${packageVersion}`);
    assert.equal(await evaluate(() => document.querySelectorAll('[role="tab"]').length), 3);
    assert.equal(await evaluate(() => document.querySelectorAll('#results input').length), 0);
    assert.equal(await evaluate(() => document.getElementById('inputs').compareDocumentPosition(document.getElementById('results')) & Node.DOCUMENT_POSITION_FOLLOWING), 4);
    assert.equal(await evaluate(() => document.getElementById('tab-plan').getAttribute('aria-selected')), 'true');
    const checkDefaults = async () => {
      assert.equal(await inputValue('Current age'), '0');
      assert.equal(await inputValue('Annual retirement spending'), '0');
      assert.equal(await inputValue('Maximum projection age · shared'), '100');
      assert.equal(await inputValue('Expected nominal return'), '10');
      assert.equal(await inputValue('Inflation rate'), '3.2');
      assert.equal(await inputValue('Safe withdrawal rate'), '4');
      assert.equal(await inputValue('Expected real return · calculated'), '6.59');
    };
    await checkDefaults();
    await evaluate(() => { const input = document.querySelector('[aria-label="Current age"]'); input.focus(); input.blur(); });
    await wait();
    assert.equal(await inputValue('Current age'), '0', 'Untouched zero defaults must not be clamped on blur');
    await tab('money');
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '0');
    await tab('plan');
    await edit('Expected nominal return', 8);
    await edit('Maximum projection age · shared', 90);
    await tab('money');
    await evaluate(() => { window.confirm = () => true; document.querySelector('[aria-label="Reset planner"]').click(); }); await wait();
    assert.equal(await evaluate(() => document.getElementById('tab-plan').getAttribute('aria-selected')), 'true');
    await checkDefaults();
    await evaluate((fixture) => localStorage.setItem('fire-projector-v1', JSON.stringify(fixture)), populatedFixture);
    await window.webContents.reload(); await wait();
    assert.equal(await evaluate(() => document.getElementById('tab-plan').getAttribute('aria-selected')), 'true');
    const bridgeFixture = structuredClone(populatedFixture);
    bridgeFixture.profile = { ...bridgeFixture.profile, currentAge: 49, retirementAge: 50, maxAge: 100,
      annualSpending: 12000, customFireNumber: 300000, mode: 'real', rothContributionBasis: 0, rothTransfers: [], rothConversionHistory: [] };
    bridgeFixture.accounts = [{ ...bridgeFixture.accounts[0], id: 'locked', name: 'Locked retirement', type: 'Traditional 401(k)', balance: 1000000,
      monthlyContribution: 0, employerContribution: 0, annualReturn: 0, returnMode: 'custom', accessibility: 'Restricted', fireEligible: true, holdings: [] }];
    bridgeFixture.phases = [{ id: 'bridge-saving', name: 'Saving', startsWhen: { kind: 'always' }, contributions: { locked: { personal: 0, employer: 0 } } }];
    bridgeFixture.scenarios = [{ ...bridgeFixture.scenarios[0], overrides: {} }];
    await evaluate((fixture) => localStorage.setItem('fire-projector-v1', JSON.stringify(fixture)), bridgeFixture);
    await window.webContents.reload(); await wait();
    assert.match(await evaluate(() => document.querySelector('.hero h1').textContent), /needs more accessible money/);
    assert.match(await evaluate(() => document.querySelector('.hero p').textContent), /money available for living expenses falls short at age 50.0/);
    assert.match(await evaluate(() => document.querySelector('.funding-card').textContent), /Spending gap at age 50.0/);
    assert.match(await evaluate(() => document.querySelector('.bridge-panel').textContent), /retirement at age 50.0/);
    assert.equal(await evaluate(() => document.querySelector('.bridge-ring strong').textContent), '0.0%');
    assert.ok(await evaluate(() => document.querySelector('.table-wrap .status').textContent.includes('Spending gap at age 50.0')));
    window.setSize(390, 844); await wait();
    await evaluate(() => { window.scrollTo({ top: window.scrollY + document.querySelector('.bridge-panel').getBoundingClientRect().top - 85, behavior: 'instant' }); }); await wait();
    assert.ok(await evaluate(() => document.querySelector('.bridge-panel').getBoundingClientRect().top >= 60 && document.querySelector('.bridge-panel').getBoundingClientRect().top < 100));
    await capture('bridge-gap-mobile');
    assert.equal(await evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    window.setSize(1450, 1050); await wait();
    bridgeFixture.accounts.push({ ...bridgeFixture.accounts[0], id: 'liquid', name: 'Bridge funds', type: 'Taxable Brokerage', accessibility: 'Immediate', balance: 114000 });
    await evaluate((fixture) => localStorage.setItem('fire-projector-v1', JSON.stringify(fixture)), bridgeFixture);
    await window.webContents.reload(); await wait();
    assert.match(await evaluate(() => document.querySelector('.hero h1').textContent), /projected to cover retirement/);
    assert.equal(await evaluate(() => document.querySelector('.bridge-ring strong').textContent), '100.0%');
    assert.match(await evaluate(() => document.querySelector('.bridge-panel h3').textContent), /Living expenses are covered/);
    if (process.argv.includes('--bridge-only')) {
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log('PASS: bridge warning/funded states, selected retirement date, desktop/mobile layout.');
      return;
    }
    await evaluate((fixture) => localStorage.setItem('fire-projector-v1', JSON.stringify(fixture)), populatedFixture);
    await window.webContents.reload(); await wait();
    assert.equal(await evaluate(() => document.querySelectorAll('.retirement-outlook .panel').length), 2);
    assert.match(await evaluate(() => document.querySelector('.funding-card').textContent), /covered through age 100/);
    assert.match(await evaluate(() => document.querySelector('.coast-card').textContent), /stop adding to retirement savings at age/);
    await edit('Maximum projection age · shared', 70);
    await evaluate(() => [...document.querySelectorAll('.funding-card button')].find((button) => button.textContent === 'View through age 100').click()); await wait();
    assert.equal(await evaluate(() => document.querySelector('[aria-label="Timeline range"]').value), 'horizon');
    const savedBeforeCoast = await evaluate(() => localStorage.getItem('fire-projector-v1'));
    await evaluate(() => document.querySelector('.coast-path-toggle').click()); await wait();
    assert.equal(await evaluate(() => document.querySelector('.coast-path-toggle').getAttribute('aria-pressed')), 'true');
    assert.match(await evaluate(() => document.querySelector('.coast-path-note').textContent), /stop investing at age.*cover living expenses with income/);
    assert.ok(await evaluate(() => [...document.querySelectorAll('#scenario-timelines .recharts-line')].some((line) => line.querySelector('[data-chart-key$="__coast"]') || line.getAttribute('data-chart-key')?.endsWith('__coast'))));
    assert.equal(await evaluate(() => localStorage.getItem('fire-projector-v1')), savedBeforeCoast, 'Coast comparison must not edit the saved plan');
    window.setSize(390, 844); await wait();
    await evaluate(() => { document.querySelector('.retirement-outlook').scrollIntoView({ behavior: 'instant', block: 'start' }); }); await wait(); await capture('retirement-outlook-mobile');
    assert.equal(await evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.ok(await evaluate(() => document.querySelector('.coast-card').getBoundingClientRect().top >= document.querySelector('.funding-card').getBoundingClientRect().bottom));
    window.setSize(1450, 1050); await wait();
    await evaluate(() => document.querySelector('.coast-path-toggle').click()); await wait();
    assert.equal(await evaluate(() => Boolean(document.querySelector('.coast-path-note'))), false);
    await edit('Maximum projection age · shared', 100);
    await tab('money');
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '850');
    assert.match(await remainder(), /522/);
    assert.equal(await evaluate(() => document.querySelectorAll('.budget-row select').length), 0);
    const expenseBefore = await evaluate(() => document.querySelector('.budget-row input').value);
    await evaluate(() => [...document.querySelectorAll('[aria-label="Income and expenses detail"] button')].find((el) => el.textContent === 'Advanced').click()); await wait();
    assert.ok(await evaluate(() => document.querySelectorAll('.budget-row select').length) > 0);
    await capture('monthly-money-advanced');
    await evaluate(() => [...document.querySelectorAll('[aria-label="Income and expenses detail"] button')].find((el) => el.textContent === 'Basic').click()); await wait();
    assert.equal(await evaluate(() => document.querySelector('.budget-row input').value), expenseBefore);
    assert.match(await remainder(), /522/);
    await capture('monthly-money');
    await edit('Taxable Brokerage monthly contribution', 1000, false);
    assert.match(await remainder(), /522/);
    const outsideField = await evaluate(() => {
      const rect = document.querySelector('.brand').getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    });
    window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...outsideField });
    window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...outsideField }); await wait();
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1000');
    assert.match(await remainder(), /372/);
    assert.match(await evaluate(() => document.querySelector('.zero-sum-adjustment').textContent), /372/);
    await edit('Taxable Brokerage monthly contribution', 1200, false);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await wait();
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1000');
    assert.match(await remainder(), /372/);
    window.setSize(390, 844); await wait();
    await edit('Taxable Brokerage monthly contribution', 1100, false);
    await evaluate(() => document.querySelector('.brand').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true })));
    await wait();
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1100');
    assert.match(await remainder(), /272/);
    await edit('Taxable Brokerage monthly contribution', 1000, false);
    await evaluate(() => document.activeElement.blur()); await wait();
    assert.match(await remainder(), /372/);
    window.setSize(1450, 1050); await wait();
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
    await select('Scenario you’re editing', 'conservative');
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '850');
    await edit('Taxable Brokerage monthly contribution', 1342);
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1342');
    await tab('plan');
    assert.equal(await inputValue('Expected nominal return'), '6.6');
    await edit('Expected nominal return', 7);
    assert.equal(await inputValue('Expected nominal return'), '7');
    assert.equal(await inputValue('Expected real return · calculated'), '4.39');
    await capture('plan');
    await tab('accounts');
    await evaluate(() => document.querySelector('.account-summary').click()); await wait();
    assert.equal(await evaluate(() => document.body.textContent.includes('Base personal contribution')), false);
    assert.equal(await evaluate(() => document.querySelectorAll('#results input').length), 0);
    await evaluate(() => document.querySelector('.roth-editor > summary').click()); await wait();
    await evaluate(() => [...document.querySelectorAll('.roth-editor button')].find((el) => el.textContent === 'Add Roth transfer').click()); await wait();
    await select('Transfer from', 'trad-ira');
    await edit('Transfer amount', 1000);
    assert.match(await evaluate(() => document.querySelector('.roth-transfer').textContent), /1,000 transferred.*220.*funded/);
    await evaluate(() => { document.querySelector('.roth-editor').scrollIntoView({ behavior: 'instant', block: 'start' }); }); await wait(); await capture('roth-transfers');
    await window.webContents.reload(); await wait();
    await select('Scenario you’re editing', 'conservative');
    await tab('accounts');
    await evaluate(() => document.querySelector('.roth-editor > summary').click()); await wait();
    assert.equal(await inputValue('Transfer amount'), '1000');
    await evaluate(() => [...document.querySelectorAll('.roth-editor button')].find((el) => el.textContent === 'Add after-tax 401(k) account').click()); await wait();
    await evaluate(() => [...document.querySelectorAll('.account-summary')].find((el) => el.textContent.includes('After-tax 401(k)')).click()); await wait();
    await edit('Current balance', 12000);
    await edit('Current after-tax contribution basis', 10000);
    await select('Transfer type', 'mega-ira');
    const afterTaxId = await evaluate(() => [...document.querySelectorAll('label')].find((el) => el.textContent.includes('Transfer from')).querySelector('select option:nth-child(2)').value);
    await select('Transfer from', afterTaxId);
    await select('Transfer to Roth IRA', 'roth-ira');
    await edit('Transfer amount', 12000);
    assert.match(await evaluate(() => document.querySelector('.roth-transfer').textContent), /12,000 transferred.*2,000 taxable.*440/);
    await select('Treatment of pretax earnings', 'trad-ira');
    assert.match(await evaluate(() => document.querySelector('.roth-transfer').textContent), /10,000 to Roth.*2,000 earnings to Traditional IRA/);
    await select('Repeat transfer', 'monthly');
    await edit('Last transfer age', 31);
    await select('Transfer sizing', 'all');
    assert.equal(await inputValue('Transfer amount'), undefined);
    await evaluate(() => { document.querySelector('.roth-transfer').scrollIntoView({ behavior: 'instant', block: 'center' }); }); await wait(); await capture('mega-backdoor');
    await window.webContents.reload(); await wait();
    await select('Scenario you’re editing', 'conservative');
    await tab('accounts');
    await evaluate(() => document.querySelector('.roth-editor > summary').click()); await wait();
    assert.equal(await inputValue('Last transfer age'), '31');
    assert.match(await evaluate(() => document.querySelector('.roth-transfer').textContent), /10,000 to Roth.*2,000 earnings to Traditional IRA/);
    await select('Scenario you’re editing', 'base');
    assert.equal(await evaluate(() => document.querySelectorAll('.roth-transfer').length), 0);
    await tab('money');
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1000');
    await window.webContents.reload(); await wait();
    assert.equal(await evaluate(() => document.getElementById('tab-plan').getAttribute('aria-selected')), 'true');
    await tab('money');
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1000');
    const clickSave = async () => { await evaluate(() => [...document.querySelectorAll('.top-actions button')].find((el) => el.textContent.trim() === 'Save').click()); await wait(); };
    await clickSave();
    assert.equal(await evaluate(() => document.querySelector('.save-confirmation')?.open), true);
    assert.equal(await evaluate(() => document.querySelector('.save-location').textContent), path.join(profile, 'Retirement test.json'));
    await evaluate(() => document.querySelector('.save-confirmation button').click()); await wait();
    await edit('Taxable Brokerage monthly contribution', 777);
    await evaluate(() => { const button = [...document.querySelectorAll('.top-actions button')].find((el) => el.textContent.trim() === 'Load'); button.focus(); button.click(); }); await wait();
    await evaluate(() => document.querySelector('.load-menu-item').click()); await wait();
    assert.equal(await inputValue('Taxable Brokerage monthly contribution'), '1000');
    await evaluate(() => [...document.querySelectorAll('.top-actions button')].find((el) => el.textContent.trim() === 'Load').click()); await wait();
    await evaluate(() => { window.confirm = () => false; document.querySelector('.load-menu-delete').click(); }); await wait();
    assert.equal(await evaluate(() => document.querySelectorAll('.load-menu-item').length), 1);
    await evaluate(() => { window.confirm = () => true; document.querySelector('.load-menu-delete').click(); }); await wait();
    assert.equal(await evaluate(() => document.querySelectorAll('.load-menu-item').length), 0);
    assert.equal(await evaluate(() => document.querySelector('.load-menu-heading small')?.textContent), 'No saves yet');
    saveOutcome = 'cancel';
    await clickSave();
    assert.equal(await evaluate(() => Boolean(document.querySelector('.save-confirmation'))), false);
    saveOutcome = 'error';
    await clickSave();
    assert.match(await evaluate(() => document.querySelector('.toast')?.textContent), /Test save failure/);
    assert.equal(await evaluate(() => Boolean(document.querySelector('.save-confirmation'))), false);
    window.setSize(1050, 900); await wait(); await capture('monthly-money-small');
    assert.equal(await evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: retirement access and bridge status on desktop/mobile, Coast comparison, Plan on opening/reset/refresh, zero defaults, click-away and touch saving, budgeting, scenario isolation, and persistence.');
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
