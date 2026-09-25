const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-scenario-edit-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1450, height: 1050 });
  win.webContents.on('console-message', (event) => { if (event.level === 'error') console.error(event.message); });
  const evaluate = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
  let code = 0;
  try {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    await settle();
    const original = await evaluate(() => document.querySelector('[role="combobox"]').value);
    const position = await evaluate(() => {
      const input = document.querySelector('[role="combobox"]');
      const rect = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      const context = document.createElement('canvas').getContext('2d');
      context.font = style.font;
      return { x: Math.round(rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + context.measureText(input.value.slice(0, 5)).width), y: Math.round(rect.top + rect.height / 2) };
    });
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...position });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...position });
    await settle();
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').selectionStart), 5, 'Click should place the caret between the intended letters');
    assert.equal(await evaluate(() => Boolean(document.getElementById('scenario-options'))), false, 'Editing the name should not open the scenario menu');
    await win.webContents.insertText('test');
    await settle();
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').value), original.slice(0, 5) + 'test' + original.slice(5));
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').selectionStart), 9, 'Typing should leave the caret after the inserted text');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
    await settle();
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').value), original.slice(0, 5) + 'tes' + original.slice(5));
    // Rapid blur/refocus must not run an old deferred commit over a new edit.
    await evaluate(() => {
      const input = document.querySelector('[role="combobox"]');
      input.blur(); input.focus(); input.setSelectionRange(5, 5);
    });
    await win.webContents.insertText(' new ');
    await settle();
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').value), original.slice(0, 5) + ' new tes' + original.slice(5));
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await settle();
    const renamed = original.slice(0, 5) + ' new tes' + original.slice(5);
    assert.equal(await evaluate(() => document.querySelector('.results-heading h2').textContent), renamed);
    await evaluate(() => document.querySelector('[aria-label="Choose scenario"]').click());
    await settle();
    assert.ok(await evaluate(() => document.querySelectorAll('#scenario-options [role="option"]').length) > 1, 'Renaming must not filter out the other scenarios');
    await evaluate(() => document.querySelectorAll('#scenario-options [role="option"]')[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    await settle();
    assert.notEqual(await evaluate(() => document.querySelector('[role="combobox"]').value), renamed);
    await evaluate(() => document.querySelector('[aria-label="Choose scenario"]').click());
    await settle();
    await evaluate(() => document.querySelectorAll('#scenario-options [role="option"]')[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    await settle();
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').value), renamed);
    await settle();
    await evaluate(() => {
      const data = JSON.parse(localStorage.getItem('fire-projector-v1'));
      data.scenarios = data.scenarios.slice(0, 2);
      localStorage.setItem('fire-projector-v1', JSON.stringify(data));
    });
    const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.reload();
    await loaded;
    await settle();
    const click = async (selector, caretIndex) => {
      const point = await evaluate((selector, caretIndex) => {
        const element = document.querySelector(selector);
        const rect = element.getBoundingClientRect();
        if (caretIndex == null) return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
        const style = getComputedStyle(element);
        const context = document.createElement('canvas').getContext('2d');
        context.font = style.font;
        return { x: Math.round(rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + context.measureText(element.value.slice(0, caretIndex)).width - element.scrollLeft), y: Math.round(rect.top + rect.height / 2) };
      }, selector, caretIndex);
      win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
      await settle();
      win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
      win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
      await settle();
    };
    await click('.scenario-options summary');
    await evaluate(() => document.querySelector('.scenario-modal-actions button:nth-child(2)').click());
    await settle();
    const duplicateName = await evaluate(() => document.querySelector('[role="combobox"]').value);
    assert.equal(duplicateName, renamed + ' copy');
    assert.equal(await evaluate(() => document.querySelector('.scenario-options').open), false, 'Duplicating closes the menu');
    assert.deepEqual(await evaluate(() => {
      const input = document.querySelector('[role="combobox"]');
      return [document.activeElement === input, input.selectionStart, input.selectionEnd];
    }), [true, 0, duplicateName.length], 'The new name is focused and selected for editing');
    await evaluate(() => document.querySelector('.scenario-options summary').focus());
    await click('[role="combobox"]', 4);
    assert.equal(await evaluate(() => document.activeElement === document.querySelector('[role="combobox"]')), true, 'The first name click after Duplicate must focus the input');
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').selectionStart), 4, 'The first name click after Duplicate must place the caret');
    await win.webContents.insertText('EDIT');
    await settle();
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').value), duplicateName.slice(0, 4) + 'EDIT' + duplicateName.slice(4));
    await evaluate(() => document.querySelector('.scenario-options summary').click());
    await settle();
    await evaluate(() => document.querySelector('.scenario-options-body .button.danger').click());
    await settle();
    assert.equal(await evaluate(() => document.querySelector('.scenario-confirmation')?.open), true);
    await click('.scenario-confirmation .button.danger');
    assert.equal(await evaluate(() => document.querySelector('.scenario-options').open), false, 'Deleting closes the menu');
    const survivingName = await evaluate(() => document.querySelector('[role="combobox"]').value);
    assert.equal(survivingName, renamed);
    assert.deepEqual(await evaluate(() => {
      const input = document.querySelector('[role="combobox"]');
      return [document.activeElement === input, input.selectionStart, input.selectionEnd];
    }), [true, 0, survivingName.length], 'Deleting the selected scenario focuses the surviving name');
    await evaluate(() => document.querySelector('.scenario-options summary').focus());
    await click('[role="combobox"]', 4);
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').selectionStart), 4, 'The first name click after Delete must place the caret');
    await win.webContents.insertText('MORE');
    await settle();
    const editedSurvivor = survivingName.slice(0, 4) + 'MORE' + survivingName.slice(4);
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').value), editedSurvivor);
    await evaluate(() => document.querySelector('[aria-label="Choose scenario"]').click());
    await settle();
    await evaluate(() => document.querySelector('[aria-label="Delete Conservative returns"]').click());
    await settle();
    await click('.scenario-confirmation .button.danger');
    assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').value), editedSurvivor, 'Deleting another scenario preserves the name edit');
    assert.deepEqual(await evaluate(() => {
      const input = document.querySelector('[role="combobox"]');
      return [document.activeElement === input, input.selectionStart, input.selectionEnd];
    }), [true, 0, editedSurvivor.length], 'Deleting another scenario focuses the current name');
    // Exercise the actual confirmation UI repeatedly, without stubbing confirm.
    // Native char events check keyboard delivery as well as the DOM selection.
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await click('.scenario-options summary');
      await click('.scenario-modal-actions button:nth-child(2)');
      await click('.scenario-options summary');
      await click('.scenario-options-body .button.danger');
      assert.equal(await evaluate(() => document.querySelector('.scenario-confirmation')?.open), true);
      const beforeCancel = await evaluate(() => document.querySelector('[role="combobox"]').value);
      if (cycle === 1) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
        await settle();
      } else await click('.scenario-confirmation .button.secondary');
      assert.equal(await evaluate(() => Boolean(document.querySelector('.scenario-confirmation'))), false);
      assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').value), beforeCancel, 'Cancel keeps the scenario');
      await click('[role="combobox"]', 4);
      assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').selectionStart), 4);
      win.webContents.sendInputEvent({ type: 'char', keyCode: 'X' });
      await settle();
      assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').value), beforeCancel.slice(0, 4) + 'X' + beforeCancel.slice(4));
      await click('.scenario-options summary');
      await click('.scenario-options-body .button.danger');
      await click('.scenario-confirmation .button.danger');
      assert.equal(await evaluate(() => Boolean(document.querySelector('.scenario-confirmation'))), false);
      const beforeEdit = await evaluate(() => document.querySelector('[role="combobox"]').value);
      await click('[role="combobox"]', 4);
      assert.deepEqual(await evaluate(() => {
        const input = document.querySelector('[role="combobox"]');
        return [document.activeElement === input, input.selectionStart, input.selectionEnd];
      }), [true, 4, 4]);
      win.webContents.sendInputEvent({ type: 'char', keyCode: 'Y' });
      await settle();
      assert.equal(await evaluate(() => document.querySelector('[role="combobox"]').value), beforeEdit.slice(0, 4) + 'Y' + beforeEdit.slice(4));
    }
    console.log('PASS: native cursor/keyboard editing after repeated duplicate, delete, confirm, cancel, and Escape flows');
  } catch (error) { console.error(error); code = 1; }
  finally {
    win.destroy();
    if (path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep + 'fire-scenario-edit-')) {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chromium may still hold handles. */ }
    }
    app.exit(code);
  }
});
