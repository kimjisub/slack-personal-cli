import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadCli() {
  const cliUrl = pathToFileURL(path.join(process.cwd(), 'bin', 'slk.js')).href;
  return import(`${cliUrl}?t=${Date.now()}-${Math.random()}`);
}

function makeDeps() {
  const calls = [];
  const cmd = {
    auth: async () => calls.push(['cmd.auth']),
    channels: async () => calls.push(['cmd.channels']),
    dms: async () => calls.push(['cmd.dms']),
    users: async () => calls.push(['cmd.users']),
    read: async (...args) => calls.push(['cmd.read', ...args]),
    send: async (...args) => calls.push(['cmd.send', ...args]),
    reply: async (...args) => calls.push(['cmd.reply', ...args]),
    permalink: async (...args) => calls.push(['cmd.permalink', ...args]),
    showMessage: async (...args) => calls.push(['cmd.showMessage', ...args]),
    messageContext: async (...args) => calls.push(['cmd.messageContext', ...args]),
    search: async (...args) => calls.push(['cmd.search', ...args]),
    thread: async (...args) => calls.push(['cmd.thread', ...args]),
    activity: async (...args) => calls.push(['cmd.activity', ...args]),
    saved: async (...args) => calls.push(['cmd.saved', ...args]),
    pins: async (...args) => calls.push(['cmd.pins', ...args]),
    workspaces: async (...args) => calls.push(['cmd.workspaces', ...args]),
    switchWorkspace: async (...args) => calls.push(['cmd.switchWorkspace', ...args]),
    currentWorkspace: async (...args) => calls.push(['cmd.currentWorkspace', ...args]),
    starred: async (...args) => calls.push(['cmd.starred', ...args]),
    react: async (...args) => calls.push(['cmd.react', ...args]),
  };
  const drafts = {
    draftChannel: async (...args) => calls.push(['drafts.draftChannel', ...args]),
    draftThread: async (...args) => calls.push(['drafts.draftThread', ...args]),
    draftDm: async (...args) => calls.push(['drafts.draftDm', ...args]),
    listDrafts: async (...args) => calls.push(['drafts.listDrafts', ...args]),
    dropDraft: async (...args) => calls.push(['drafts.dropDraft', ...args]),
  };
  const output = { logs: [], errors: [] };
  const consoleMock = {
    log: (...args) => output.logs.push(args.join(' ')),
    error: (...args) => output.errors.push(args.join(' ')),
  };
  const exit = (code) => {
    throw new Error(`EXIT:${code}`);
  };
  return { calls, cmd, drafts, console: consoleMock, exit, output };
}

test('workspace family uses consistent nested commands', async () => {
  const cli = await loadCli();

  {
    const deps = makeDeps();
    await cli.runCli(['workspace', 'list'], deps);
    assert.deepEqual(deps.calls, [['cmd.workspaces']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['workspace', 'use', 'candid'], deps);
    assert.deepEqual(deps.calls, [['cmd.switchWorkspace', 'candid']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['workspace', 'current'], deps);
    assert.deepEqual(deps.calls, [['cmd.currentWorkspace']]);
  }
});

test('draft family uses consistent nested commands', async () => {
  const cli = await loadCli();

  {
    const deps = makeDeps();
    await cli.runCli(['draft', 'list'], deps);
    assert.deepEqual(deps.calls, [['drafts.listDrafts']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['draft', 'channel', 'general', 'hello', 'team'], deps);
    assert.deepEqual(deps.calls, [['drafts.draftChannel', 'general', 'hello team']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['draft', 'thread', 'general', '1714280000.000100', 'reply'], deps);
    assert.deepEqual(deps.calls, [['drafts.draftThread', 'general', '1714280000.000100', 'reply']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['draft', 'dm', 'U123', 'hi'], deps);
    assert.deepEqual(deps.calls, [['drafts.draftDm', 'U123', 'hi']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['draft', 'drop', 'draft-1'], deps);
    assert.deepEqual(deps.calls, [['drafts.dropDraft', 'draft-1']]);
  }
});

test('inbox and channel families provide consistent grouped entry points', async () => {
  const cli = await loadCli();

  {
    const deps = makeDeps();
    await cli.runCli(['inbox', 'activity'], deps);
    assert.deepEqual(deps.calls, [['cmd.activity', false]]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['inbox', 'unread'], deps);
    assert.deepEqual(deps.calls, [['cmd.activity', true]]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['inbox', 'saved', '10'], deps);
    assert.deepEqual(deps.calls, [['cmd.saved', 10, false]]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['inbox', 'starred'], deps);
    assert.deepEqual(deps.calls, [['cmd.starred']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['channel', 'pins', 'general'], deps);
    assert.deepEqual(deps.calls, [['cmd.pins', 'general']]);
  }
});

test('legacy top-level commands remain supported as compatibility aliases', async () => {
  const cli = await loadCli();

  {
    const deps = makeDeps();
    await cli.runCli(['workspaces'], deps);
    assert.deepEqual(deps.calls, [['cmd.workspaces']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['switch', 'alpaon'], deps);
    assert.deepEqual(deps.calls, [['cmd.switchWorkspace', 'alpaon']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['drafts'], deps);
    assert.deepEqual(deps.calls, [['drafts.listDrafts']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['unread'], deps);
    assert.deepEqual(deps.calls, [['cmd.activity', true]]);
  }
});

test('message action commands support thread replies and message references consistently', async () => {
  const cli = await loadCli();

  {
    const deps = makeDeps();
    await cli.runCli(['send', 'general', 'hello', '--thread', '1714280000.000100'], deps);
    assert.deepEqual(deps.calls, [['cmd.send', 'general', 'hello', { threadTs: '1714280000.000100' }]]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['reply', 'general', '1714280000.000100', 'hello', 'thread'], deps);
    assert.deepEqual(deps.calls, [['cmd.reply', 'general', '1714280000.000100', 'hello thread']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['message', 'link', 'general', '1714280000.000100'], deps);
    assert.deepEqual(deps.calls, [['cmd.permalink', 'general', '1714280000.000100']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['message', 'show', 'general', '1714280000.000100'], deps);
    assert.deepEqual(deps.calls, [['cmd.showMessage', 'general', '1714280000.000100']]);
  }

  {
    const deps = makeDeps();
    await cli.runCli(['message', 'context', 'general', '1714280000.000100', '2', '3'], deps);
    assert.deepEqual(deps.calls, [['cmd.messageContext', 'general', '1714280000.000100', 2, 3]]);
  }
});
