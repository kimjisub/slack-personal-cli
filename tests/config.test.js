import test from "node:test";
import assert from "node:assert/strict";

import { getRuntimeConfig, splitCliArgs } from "../src/config.js";

test("getRuntimeConfig reads defaults when no env or flags are present", () => {
  const config = getRuntimeConfig([], {});

  assert.equal(config.minRequestGapMs, 1200);
  assert.equal(config.maxRetries, 3);
  assert.equal(config.retryJitterMs, 250);
  assert.equal(config.lockTimeoutMs, 30000);
  assert.equal(config.staleLockMs, 120000);
  assert.equal(config.cacheEnabled, true);
  assert.equal(config.cacheRefresh, false);
  assert.equal(config.cacheDebug, false);
  assert.equal(config.queueDebug, false);
});

test("getRuntimeConfig lets CLI flags override cache behavior", () => {
  const config = getRuntimeConfig(["--no-cache", "--refresh", "--debug-cache", "--debug-queue"], {});

  assert.equal(config.cacheEnabled, false);
  assert.equal(config.cacheRefresh, true);
  assert.equal(config.cacheDebug, true);
  assert.equal(config.queueDebug, true);
});

test("getRuntimeConfig enables read-only mode from env or CLI flag", () => {
  const fromEnv = getRuntimeConfig([], { SLK_READ_ONLY: "1" });
  const fromFlag = getRuntimeConfig(["--read-only"], {});

  assert.equal(fromEnv.readOnly, true);
  assert.equal(fromFlag.readOnly, true);
});

test("splitCliArgs strips trailing runtime flags from free-form commands", () => {
  const parsed = splitCliArgs(["search", "deploy failed", "10", "--refresh", "--debug-cache"]);

  assert.equal(parsed.command, "search");
  assert.deepEqual(parsed.commandArgs, ["search", "deploy failed", "10"]);
  assert.deepEqual(parsed.runtimeFlags, ["--refresh", "--debug-cache"]);
});

test("splitCliArgs preserves non-trailing flag-like search terms", () => {
  const parsed = splitCliArgs(["search", "--refresh", "behavior", "10"]);

  assert.equal(parsed.command, "search");
  assert.deepEqual(parsed.commandArgs, ["search", "--refresh", "behavior", "10"]);
  assert.deepEqual(parsed.runtimeFlags, []);
});

test("splitCliArgs strips leading global runtime flags before the command", () => {
  const parsed = splitCliArgs(["--refresh", "read", "general", "10"]);

  assert.equal(parsed.command, "read");
  assert.deepEqual(parsed.commandArgs, ["read", "general", "10"]);
  assert.deepEqual(parsed.runtimeFlags, ["--refresh"]);
});

test("splitCliArgs strips runtime flags from structured commands", () => {
  const parsed = splitCliArgs(["read", "general", "10", "--debug-cache"]);

  assert.equal(parsed.command, "read");
  assert.deepEqual(parsed.commandArgs, ["read", "general", "10"]);
  assert.deepEqual(parsed.runtimeFlags, ["--debug-cache"]);
});

test("getRuntimeConfig reads numeric env overrides", () => {
  const config = getRuntimeConfig([], {
    SLK_MIN_REQUEST_GAP_MS: "2000",
    SLK_MAX_RETRIES: "5",
    SLK_RETRY_JITTER_MS: "10",
    SLK_LOCK_TIMEOUT_MS: "5000",
    SLK_STALE_LOCK_MS: "9000",
    SLK_NO_CACHE: "1",
  });

  assert.equal(config.minRequestGapMs, 2000);
  assert.equal(config.maxRetries, 5);
  assert.equal(config.retryJitterMs, 10);
  assert.equal(config.lockTimeoutMs, 5000);
  assert.equal(config.staleLockMs, 9000);
  assert.equal(config.cacheEnabled, false);
});

test("splitCliArgs preserves precise scoped flags for taxonomy cleanup", () => {
  const parsed = splitCliArgs(["search", "deploy failed", "10", "--page", "2", "--summary-fields", "text,permalink", "--channel", "eng"]);

  assert.equal(parsed.command, "search");
  assert.deepEqual(parsed.commandArgs, ["search", "deploy failed", "10", "--page", "2", "--summary-fields", "text,permalink", "--channel", "eng"]);
  assert.deepEqual(parsed.runtimeFlags, []);
});
