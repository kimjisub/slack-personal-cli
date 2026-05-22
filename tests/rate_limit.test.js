import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getRuntimeDir,
  readRateLimitState,
  writeRateLimitState,
  reserveRateLimitSlot,
  withRateLimitSlot,
} from '../src/rate_limit.js';

function makeRuntimeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slk-rate-limit-'));
}

test('getRuntimeDir uses SLK_RUNTIME_DIR when set', () => {
  const runtimeDir = makeRuntimeDir();
  process.env.SLK_RUNTIME_DIR = runtimeDir;
  assert.equal(getRuntimeDir(), runtimeDir);
  delete process.env.SLK_RUNTIME_DIR;
});

test('readRateLimitState returns default shape when state file does not exist', () => {
  const runtimeDir = makeRuntimeDir();
  const state = readRateLimitState({ runtimeDir });

  assert.equal(typeof state.nextAllowedAt, 'number');
  assert.equal(state.nextAllowedAt, 0);
  assert.equal(state.lastDelayMs, 0);
});

test('writeRateLimitState persists state to disk', () => {
  const runtimeDir = makeRuntimeDir();
  writeRateLimitState({ nextAllowedAt: 123, lastDelayMs: 456 }, { runtimeDir });

  const state = readRateLimitState({ runtimeDir });
  assert.equal(state.nextAllowedAt, 123);
  assert.equal(state.lastDelayMs, 456);
});

test('reserveRateLimitSlot advances nextAllowedAt by min interval', () => {
  const runtimeDir = makeRuntimeDir();
  const now = 10_000;
  const reservation = reserveRateLimitSlot({ runtimeDir, now, minIntervalMs: 1500 });

  assert.equal(reservation.waitMs, 0);
  assert.equal(reservation.nextAllowedAt, now + 1500);

  const state = readRateLimitState({ runtimeDir });
  assert.equal(state.nextAllowedAt, now + 1500);
});

test('reserveRateLimitSlot waits for existing shared cooldown', () => {
  const runtimeDir = makeRuntimeDir();
  writeRateLimitState({ nextAllowedAt: 20_000, lastDelayMs: 0 }, { runtimeDir });

  const reservation = reserveRateLimitSlot({ runtimeDir, now: 18_500, minIntervalMs: 1000 });

  assert.equal(reservation.waitMs, 1500);
  assert.equal(reservation.nextAllowedAt, 21_000);
});

test('withRateLimitSlot serializes concurrent callers', async () => {
  const runtimeDir = makeRuntimeDir();
  const events = [];

  const job1 = withRateLimitSlot(async () => {
    events.push('job1-start');
    await new Promise((resolve) => setTimeout(resolve, 50));
    events.push('job1-end');
  }, { runtimeDir, minIntervalMs: 0, lockPollMs: 10 });

  const job2 = withRateLimitSlot(async () => {
    events.push('job2-start');
    events.push('job2-end');
  }, { runtimeDir, minIntervalMs: 0, lockPollMs: 10 });

  await Promise.all([job1, job2]);

  assert.deepEqual(events, ['job1-start', 'job1-end', 'job2-start', 'job2-end']);
});
