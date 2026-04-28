import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "fs";
import { stat } from "fs/promises";
import { join } from "path";

import { buildCacheKey, readCache, writeCache, invalidateByPrefixes } from "../src/cache.js";
import { cleanupDir, makeTempDir } from "./helpers.js";

test("buildCacheKey is stable regardless of param key order", () => {
  const a = buildCacheKey({
    teamId: "T1",
    method: "conversations.history",
    params: { channel: "C1", limit: 20, oldest: "1" },
  });

  const b = buildCacheKey({
    teamId: "T1",
    method: "conversations.history",
    params: { oldest: "1", limit: 20, channel: "C1" },
  });

  assert.equal(a.key, b.key);
  assert.deepEqual(a.normalized.params, b.normalized.params);
});

test("writeCache persists entries and readCache returns fresh values", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  const descriptor = buildCacheKey({ teamId: "T1", method: "users.list", params: { limit: 200 } });

  await writeCache(root, descriptor, { ok: true, members: [{ id: "U1" }] }, { ttlMs: 60_000 });
  const result = await readCache(root, descriptor, 60_000);

  assert.equal(result.hit, true);
  assert.equal(result.payload.members[0].id, "U1");
  assert.equal(existsSync(join(root, descriptor.fileName)), true);
});

test("readCache ignores expired entries", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  const descriptor = buildCacheKey({ teamId: "T1", method: "client.counts", params: {} });

  await writeCache(root, descriptor, { ok: true }, { ttlMs: 5 });
  await new Promise((resolve) => setTimeout(resolve, 15));
  const result = await readCache(root, descriptor, 5);

  assert.equal(result.hit, false);
});

test("invalidateByPrefixes removes matching cache files only", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  const history = buildCacheKey({ teamId: "T1", method: "conversations.history", params: { channel: "C1" } });
  const users = buildCacheKey({ teamId: "T1", method: "users.list", params: {} });

  await writeCache(root, history, { ok: true }, { ttlMs: 1000 });
  await writeCache(root, users, { ok: true }, { ttlMs: 1000 });
  await invalidateByPrefixes(root, [{ teamId: "T1", method: "conversations.history" }]);

  assert.equal(existsSync(join(root, history.fileName)), false);
  assert.equal(existsSync(join(root, users.fileName)), true);
});

test("writeCache uses owner-only file permissions", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  const descriptor = buildCacheKey({ teamId: "T1", method: "users.list", params: {} });

  await writeCache(root, descriptor, { ok: true }, { ttlMs: 1000 });
  const fileStats = await stat(join(root, descriptor.fileName));

  assert.equal(fileStats.mode & 0o777, 0o600);
  const raw = JSON.parse(readFileSync(join(root, descriptor.fileName), "utf8"));
  assert.equal(raw.meta.ttlMs, 1000);
});
