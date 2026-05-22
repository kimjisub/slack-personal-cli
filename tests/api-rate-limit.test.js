import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function makeRuntimeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slk-api-rate-limit-'));
}

async function loadApiWithHooks({ runtimeDir, fetchImpl, refreshImpl } = {}) {
  process.env.SLK_RUNTIME_DIR = runtimeDir;
  process.env.SLK_MIN_REQUEST_INTERVAL_MS = '25';
  process.env.SLK_MAX_429_RETRIES = '1';

  global.fetch = fetchImpl;
  globalThis.__SLK_TEST_HOOKS__ = {
    getCredentials: () => ({ token: 'token-123', cookie: 'cookie-123' }),
    refresh: refreshImpl || (() => {}),
  };

  const apiUrl = pathToFileURL(path.join(process.cwd(), 'src', 'api.js')).href;
  return import(`${apiUrl}?t=${Date.now()}-${Math.random()}`);
}

test('slackApi persists shared cooldown after HTTP 429 and retries once', async () => {
  const runtimeDir = makeRuntimeDir();
  let calls = 0;

  const api = await loadApiWithHooks({
    runtimeDir,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: 429,
          headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? '1' : null) },
          json: async () => ({ ok: false, error: 'rate_limited' }),
        };
      }
      return {
        status: 200,
        headers: { get: () => null },
        json: async () => ({ ok: true, team: 'Candid' }),
      };
    },
  });

  const result = await api.slackApi('auth.test');
  const { readRateLimitState } = await import(pathToFileURL(path.join(process.cwd(), 'src', 'rate_limit.js')).href + `?t=${Math.random()}`);
  const state = readRateLimitState({ runtimeDir });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(state.lastDelayMs, 1000);
  assert.ok(state.nextAllowedAt > Date.now() - 100);

  delete globalThis.__SLK_TEST_HOOKS__;
});

test('slackApi still refreshes and retries once on invalid_auth', async () => {
  const runtimeDir = makeRuntimeDir();
  let refreshCalls = 0;
  let calls = 0;

  const api = await loadApiWithHooks({
    runtimeDir,
    refreshImpl: () => { refreshCalls += 1; },
    fetchImpl: async () => {
      calls += 1;
      return {
        status: 200,
        headers: { get: () => null },
        json: async () => (calls === 1 ? { ok: false, error: 'invalid_auth' } : { ok: true, user: 'jisub' }),
      };
    },
  });

  const result = await api.slackApi('auth.test');

  assert.equal(result.ok, true);
  assert.equal(refreshCalls, 1);
  assert.equal(calls, 2);

  delete globalThis.__SLK_TEST_HOOKS__;
});
