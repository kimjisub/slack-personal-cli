import test from "node:test";
import assert from "node:assert/strict";

import { loadRateState, mark429, markRequestStarted, markSuccess, waitForTurn } from "../src/rate-limit.js";
import { cleanupDir, makeTempDir } from "./helpers.js";

test("mark429 records the next allowed time using Retry-After", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));

  await mark429({ rootDir: root, retryAfterSeconds: 2, jitterMs: 0 });
  const state = await loadRateState(root);

  assert.ok(state.nextAllowedAt >= Date.now() + 1900);
});

test("waitForTurn respects the configured minimum request gap", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));

  await markRequestStarted({ rootDir: root, now: Date.now() });
  const before = Date.now();
  await waitForTurn({ rootDir: root, minRequestGapMs: 30 });
  const elapsed = Date.now() - before;

  assert.ok(elapsed >= 25);
});

test("markSuccess clears retry-after pressure but preserves timing fields", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));

  await mark429({ rootDir: root, retryAfterSeconds: 1, jitterMs: 0 });
  await markSuccess({ rootDir: root, now: Date.now() });
  const state = await loadRateState(root);

  assert.equal(state.retryAfterMs, 0);
  assert.ok(typeof state.lastRequestAt === "number");
});
