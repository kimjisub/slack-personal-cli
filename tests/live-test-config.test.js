import test from 'node:test';
import assert from 'node:assert/strict';

import { getLiveTestConfig } from '../src/live_test_config.js';

test('getLiveTestConfig disables live tests by default', () => {
  const config = getLiveTestConfig({});

  assert.equal(config.enabled, false);
  assert.match(config.reason, /SLK_LIVE_TESTS=1/);
});

test('getLiveTestConfig validates read-only live test prerequisites', () => {
  const config = getLiveTestConfig({
    SLK_LIVE_TESTS: '1',
  });

  assert.equal(config.enabled, true);
  assert.equal(config.allowWrite, false);
  assert.deepEqual(config.readTargets.missing, ['SLK_LIVE_CHANNEL', 'SLK_LIVE_MESSAGE_TS']);
});

test('getLiveTestConfig validates optional write prerequisites separately', () => {
  const config = getLiveTestConfig({
    SLK_LIVE_TESTS: '1',
    SLK_LIVE_ALLOW_WRITE: '1',
    SLK_LIVE_CHANNEL: 'general',
    SLK_LIVE_MESSAGE_TS: '1714280000.000100',
  });

  assert.equal(config.enabled, true);
  assert.equal(config.allowWrite, true);
  assert.deepEqual(config.readTargets.missing, []);
  assert.deepEqual(config.writeTargets.missing, ['SLK_LIVE_THREAD_TS']);
});

test('getLiveTestConfig returns resolved read and write targets when fully configured', () => {
  const config = getLiveTestConfig({
    SLK_LIVE_TESTS: '1',
    SLK_LIVE_ALLOW_WRITE: '1',
    SLK_LIVE_CHANNEL: 'general',
    SLK_LIVE_MESSAGE_TS: '1714280000.000100',
    SLK_LIVE_THREAD_TS: '1714280000.000100',
  });

  assert.equal(config.enabled, true);
  assert.equal(config.allowWrite, true);
  assert.deepEqual(config.readTargets, {
    channel: 'general',
    messageTs: '1714280000.000100',
    missing: [],
  });
  assert.deepEqual(config.writeTargets, {
    threadTs: '1714280000.000100',
    missing: [],
  });
});
