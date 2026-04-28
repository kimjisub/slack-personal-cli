import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "fs";
import { join } from "path";

import { withProcessLock } from "../src/lock.js";
import { cleanupDir, makeTempDir } from "./helpers.js";

test("withProcessLock serializes concurrent callers", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  const order = [];

  const first = withProcessLock("api", { rootDir: root, timeoutMs: 1000, staleMs: 1000 }, async () => {
    order.push("first-start");
    await new Promise((resolve) => setTimeout(resolve, 50));
    order.push("first-end");
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  const second = withProcessLock("api", { rootDir: root, timeoutMs: 1000, staleMs: 1000 }, async () => {
    order.push("second");
  });

  await Promise.all([first, second]);
  assert.deepEqual(order, ["first-start", "first-end", "second"]);
});

test("withProcessLock reaps stale lock directories", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  const lockDir = join(root, "api.lock");
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, "metadata.json"), JSON.stringify({ startedAt: Date.now() - 10_000 }));

  let entered = false;
  await withProcessLock("api", { rootDir: root, timeoutMs: 1000, staleMs: 5 }, async () => {
    entered = true;
  });

  assert.equal(entered, true);
});

test("withProcessLock reaps stale lock directories even when metadata is missing", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  const lockDir = join(root, "api.lock");
  mkdirSync(lockDir, { recursive: true });
  const old = new Date(Date.now() - 10_000);
  utimesSync(lockDir, old, old);

  let entered = false;
  await withProcessLock("api", { rootDir: root, timeoutMs: 1000, staleMs: 5 }, async () => {
    entered = true;
  });

  assert.equal(entered, true);
});

test("withProcessLock does not reap a live owner just because staleMs elapsed", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));

  const holder = withProcessLock("api", { rootDir: root, timeoutMs: 1000, staleMs: 20 }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });

  await new Promise((resolve) => setTimeout(resolve, 30));

  await assert.rejects(
    withProcessLock("api", { rootDir: root, timeoutMs: 15, staleMs: 20 }, async () => {}),
    /Timed out waiting for lock/
  );

  await holder;
});

test("withProcessLock only removes the lock directory when it still owns it", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  const lockDir = join(root, "api.lock");

  await withProcessLock("api", { rootDir: root, timeoutMs: 1000, staleMs: 1000 }, async () => {
    writeFileSync(
      join(lockDir, "metadata.json"),
      JSON.stringify({ token: "replacement-owner", startedAt: Date.now(), pid: process.pid })
    );
  });

  assert.equal(existsSync(lockDir), true);
});
