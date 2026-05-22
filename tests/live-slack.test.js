import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { getLiveTestConfig } from '../src/live_test_config.js';

const config = getLiveTestConfig();
const baseEnv = {
  ...process.env,
  NO_EMOJI: '1',
};

function runCli(args) {
  const result = spawnSync('node', ['bin/slk.js', ...args], {
    cwd: process.cwd(),
    env: baseEnv,
    encoding: 'utf-8',
    timeout: 30000,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function assertOk(result, label) {
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

test('live Slack integration: auth and workspace commands succeed', { skip: !config.enabled ? config.reason : false }, () => {
  const workspaceResult = runCli(['workspace', 'current']);
  assertOk(workspaceResult, 'workspace current');
  assert.match(workspaceResult.stdout, /Current workspace:/);

  const authResult = runCli(['auth']);
  assertOk(authResult, 'auth');
  assert.match(authResult.stdout, /Authenticated as/);
});

test('live Slack integration: unread inbox succeeds', { skip: !config.enabled ? config.reason : false }, () => {
  const result = runCli(['inbox', 'unread']);
  assertOk(result, 'inbox unread');
});

test('live Slack integration: message reference commands succeed', {
  skip: !config.enabled
    ? config.reason
    : config.readTargets.missing.length > 0
      ? `Missing ${config.readTargets.missing.join(', ')} for message reference live tests.`
      : false,
}, () => {
  const { channel, messageTs } = config.readTargets;

  const linkResult = runCli(['message', 'link', channel, messageTs]);
  assertOk(linkResult, 'message link');
  assert.match(linkResult.stdout, /https:\/\//);

  const showResult = runCli(['message', 'show', channel, messageTs]);
  assertOk(showResult, 'message show');
  assert.match(showResult.stdout, /ts:/);

  const contextResult = runCli(['message', 'context', channel, messageTs, '1', '1']);
  assertOk(contextResult, 'message context');
  assert.match(contextResult.stdout, /ts:/);
});

test('live Slack integration: thread write commands succeed when explicitly enabled', {
  skip: !config.enabled
    ? config.reason
    : !config.allowWrite
      ? 'Set SLK_LIVE_ALLOW_WRITE=1 to run live Slack write tests.'
      : config.readTargets.missing.length > 0 || config.writeTargets.missing.length > 0
        ? `Missing ${[...config.readTargets.missing, ...config.writeTargets.missing].join(', ')} for live Slack write tests.`
        : false,
}, () => {
  const { channel } = config.readTargets;
  const { threadTs } = config.writeTargets;
  const marker = `[slk live test ${Date.now()}]`;

  const replyResult = runCli(['reply', channel, threadTs, `${marker} reply`]);
  assertOk(replyResult, 'reply');
  assert.match(replyResult.stdout, /Sent to/);

  const sendThreadResult = runCli(['send', channel, `${marker} send-thread`, '--thread', threadTs]);
  assertOk(sendThreadResult, 'send --thread');
  assert.match(sendThreadResult.stdout, /Sent to/);
});
