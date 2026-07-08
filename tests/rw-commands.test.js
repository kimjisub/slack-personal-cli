import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadCli() {
  const cliUrl = pathToFileURL(path.join(process.cwd(), 'bin', 'slk.js')).href;
  return import(`${cliUrl}?t=${Date.now()}-${Math.random()}`);
}

// Records which injected handler each command routes to, with its args.
function makeDeps() {
  const calls = [];
  const rec = (name) => async (...args) => calls.push([name, ...args]);
  const cmd = {
    editMessage: rec('cmd.editMessage'),
    deleteMessage: rec('cmd.deleteMessage'),
    unreact: rec('cmd.unreact'),
    pinAdd: rec('cmd.pinAdd'),
    pinRemove: rec('cmd.pinRemove'),
    savedAdd: rec('cmd.savedAdd'),
    savedRemove: rec('cmd.savedRemove'),
    joinChannel: rec('cmd.joinChannel'),
    leaveChannel: rec('cmd.leaveChannel'),
  };
  const status = {
    setStatus: rec('status.setStatus'),
    clearStatus: rec('status.clearStatus'),
  };
  const dnd = {
    snooze: rec('dnd.snooze'),
    endSnooze: rec('dnd.endSnooze'),
    dndStatus: rec('dnd.dndStatus'),
  };
  const files = {
    uploadFile: rec('files.uploadFile'),
    downloadFile: rec('files.downloadFile'),
  };
  const output = { logs: [], errors: [] };
  const consoleMock = {
    log: (...a) => output.logs.push(a.join(' ')),
    error: (...a) => output.errors.push(a.join(' ')),
  };
  const exit = (code) => { throw new Error(`EXIT:${code}`); };
  return { calls, cmd, status, dnd, files, console: consoleMock, exit, output };
}

test('message write commands route to edit/delete', async () => {
  const cli = await loadCli();

  {
    const deps = makeDeps();
    await cli.runCli(['edit', 'general', '123.4', 'fixed', 'typo'], deps);
    assert.deepEqual(deps.calls, [['cmd.editMessage', 'general', '123.4', 'fixed typo']]);
  }
  {
    const deps = makeDeps();
    await cli.runCli(['delete', 'general', '123.4'], deps);
    assert.deepEqual(deps.calls, [['cmd.deleteMessage', 'general', '123.4']]);
  }
  {
    const deps = makeDeps();
    await cli.runCli(['del', 'general', '123.4'], deps);
    assert.deepEqual(deps.calls, [['cmd.deleteMessage', 'general', '123.4']]);
  }
});

test('reaction/pin/save/membership commands route correctly', async () => {
  const cli = await loadCli();
  const cases = [
    [['unreact', 'general', '123.4', 'tada'], ['cmd.unreact', 'general', '123.4', 'tada']],
    [['pin', 'general', '123.4'], ['cmd.pinAdd', 'general', '123.4']],
    [['unpin', 'general', '123.4'], ['cmd.pinRemove', 'general', '123.4']],
    [['save', 'general', '123.4'], ['cmd.savedAdd', 'general', '123.4']],
    [['unsave', 'general', '123.4'], ['cmd.savedRemove', 'general', '123.4']],
    [['join', 'general'], ['cmd.joinChannel', 'general']],
    [['leave', 'general'], ['cmd.leaveChannel', 'general']],
  ];
  for (const [argv, expected] of cases) {
    const deps = makeDeps();
    await cli.runCli(argv, deps);
    assert.deepEqual(deps.calls, [expected]);
  }
});

test('status command sets, expires, and clears', async () => {
  const cli = await loadCli();

  {
    const deps = makeDeps();
    await cli.runCli(['status', 'In a meeting', 'calendar'], deps);
    assert.deepEqual(deps.calls, [['status.setStatus', 'In a meeting', 'calendar', 0]]);
  }
  {
    const deps = makeDeps();
    await cli.runCli(['status', 'Lunch', 'hamburger', '--for', '45'], deps);
    assert.deepEqual(deps.calls, [['status.setStatus', 'Lunch', 'hamburger', 45]]);
  }
  {
    const deps = makeDeps();
    await cli.runCli(['status', 'clear'], deps);
    assert.deepEqual(deps.calls, [['status.clearStatus']]);
  }
});

test('dnd family routes snooze/off/status', async () => {
  const cli = await loadCli();
  const cases = [
    [['dnd', '30'], ['dnd.snooze', '30']],
    [['dnd', 'off'], ['dnd.endSnooze']],
    [['dnd', 'status'], ['dnd.dndStatus']],
  ];
  for (const [argv, expected] of cases) {
    const deps = makeDeps();
    await cli.runCli(argv, deps);
    assert.deepEqual(deps.calls, [expected]);
  }
});

test('file commands route upload (with flags) and download', async () => {
  const cli = await loadCli();

  {
    const deps = makeDeps();
    await cli.runCli(['upload', './a.png', 'general', '--thread', '123.4', '--comment', 'see this'], deps);
    assert.deepEqual(deps.calls, [['files.uploadFile', './a.png', 'general', { threadTs: '123.4', comment: 'see this' }]]);
  }
  {
    const deps = makeDeps();
    await cli.runCli(['download', 'F123', 'out.png'], deps);
    assert.deepEqual(deps.calls, [['files.downloadFile', 'F123', 'out.png']]);
  }
  {
    const deps = makeDeps();
    await cli.runCli(['dl', 'F123'], deps);
    assert.deepEqual(deps.calls, [['files.downloadFile', 'F123', null]]);
  }
});
