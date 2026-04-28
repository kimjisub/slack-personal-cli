import test from "node:test";
import assert from "node:assert/strict";

import { executeSlackRequest } from "../src/runtime.js";
import { cleanupDir, makeJsonResponse, makeTempDir } from "./helpers.js";

test("executeSlackRequest returns cached read results without hitting fetch", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  let fetchCalls = 0;

  const fetchImpl = async () => {
    fetchCalls += 1;
    return makeJsonResponse(200, { ok: true, members: [{ id: "U1" }] });
  };

  const common = {
    method: "users.list",
    params: { limit: 200 },
    isWrite: false,
    cachePolicy: { ttlMs: 60_000 },
    config: {
      minRequestGapMs: 0,
      maxRetries: 1,
      retryJitterMs: 0,
      lockTimeoutMs: 1000,
      staleLockMs: 1000,
      cacheEnabled: true,
      cacheRefresh: false,
      cacheDebug: false,
      queueDebug: false,
      stateRootDir: root,
    },
    fetchImpl,
    getCredentials: () => ({ token: "xoxc-test", cookie: "xoxd-test", teamId: "T1" }),
    refreshCredentials: () => ({ token: "xoxc-test", cookie: "xoxd-test", teamId: "T1" }),
  };

  const first = await executeSlackRequest(common);
  const second = await executeSlackRequest(common);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(fetchCalls, 1);
});

test("executeSlackRequest retries once on network failure", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  let fetchCalls = 0;

  const result = await executeSlackRequest({
    method: "users.list",
    params: { limit: 200 },
    isWrite: false,
    cachePolicy: { ttlMs: 0 },
    config: {
      minRequestGapMs: 0,
      maxRetries: 2,
      retryJitterMs: 0,
      lockTimeoutMs: 1000,
      staleLockMs: 1000,
      cacheEnabled: false,
      cacheRefresh: false,
      cacheDebug: false,
      queueDebug: false,
      stateRootDir: root,
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) throw new Error("socket hang up");
      return makeJsonResponse(200, { ok: true, members: [] });
    },
    getCredentials: () => ({ token: "xoxc-test", cookie: "xoxd-test", teamId: "T1" }),
    refreshCredentials: () => ({ token: "xoxc-test", cookie: "xoxd-test", teamId: "T1" }),
  });

  assert.equal(result.ok, true);
  assert.equal(fetchCalls, 2);
});

test("executeSlackRequest recomputes cache scope after invalid_auth refresh changes team", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  let fetchCalls = 0;

  await executeSlackRequest({
    method: "users.list",
    params: { limit: 200 },
    isWrite: false,
    cachePolicy: { ttlMs: 60_000 },
    config: {
      minRequestGapMs: 0,
      maxRetries: 1,
      retryJitterMs: 0,
      lockTimeoutMs: 1000,
      staleLockMs: 1000,
      cacheEnabled: true,
      cacheRefresh: false,
      cacheDebug: false,
      queueDebug: false,
      stateRootDir: root,
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      return fetchCalls === 1
        ? makeJsonResponse(200, { ok: false, error: "invalid_auth" })
        : makeJsonResponse(200, { ok: true, members: [{ id: "U2" }] });
    },
    getCredentials: () => ({ token: "xoxc-old", cookie: "xoxd-cookie", teamId: "T1" }),
    refreshCredentials: () => ({ token: "xoxc-new", cookie: "xoxd-cookie", teamId: "T2" }),
  });

  const { buildCacheKey, readCache } = await import("../src/cache.js");
  const team1 = buildCacheKey({ teamId: "T1", method: "users.list", params: { limit: 200 } });
  const team2 = buildCacheKey({ teamId: "T2", method: "users.list", params: { limit: 200 } });
  const cacheRoot = `${root}/cache`;

  const team1Cache = await readCache(cacheRoot, team1, 60_000);
  const team2Cache = await readCache(cacheRoot, team2, 60_000);

  assert.equal(team1Cache.hit, false);
  assert.equal(team2Cache.hit, true);
});

test("executeSlackRequest retries once on invalid_auth after refreshing credentials", async () => {
  let fetchCalls = 0;

  const result = await executeSlackRequest({
    method: "auth.test",
    params: {},
    isWrite: false,
    cachePolicy: { ttlMs: 0 },
    config: {
      minRequestGapMs: 0,
      maxRetries: 1,
      retryJitterMs: 0,
      lockTimeoutMs: 1000,
      staleLockMs: 1000,
      cacheEnabled: false,
      cacheRefresh: false,
      cacheDebug: false,
      queueDebug: false,
      stateRootDir: makeTempDir(),
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      return fetchCalls === 1
        ? makeJsonResponse(200, { ok: false, error: "invalid_auth" })
        : makeJsonResponse(200, { ok: true, team: "Candid" });
    },
    getCredentials: () => ({ token: "xoxc-old", cookie: "xoxd-cookie", teamId: "T1" }),
    refreshCredentials: () => ({ token: "xoxc-new", cookie: "xoxd-cookie", teamId: "T1" }),
  });

  assert.equal(result.ok, true);
  assert.equal(fetchCalls, 2);
});

test("executeSlackRequest waits and retries after HTTP 429", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  let fetchCalls = 0;

  const before = Date.now();
  const result = await executeSlackRequest({
    method: "search.messages",
    params: { query: "deploy" },
    isWrite: false,
    cachePolicy: { ttlMs: 0 },
    config: {
      minRequestGapMs: 0,
      maxRetries: 2,
      retryJitterMs: 0,
      lockTimeoutMs: 1000,
      staleLockMs: 1000,
      cacheEnabled: false,
      cacheRefresh: false,
      cacheDebug: false,
      queueDebug: false,
      stateRootDir: root,
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      return fetchCalls === 1
        ? makeJsonResponse(429, { ok: false, error: "ratelimited" }, { "retry-after": "0.02" })
        : makeJsonResponse(200, { ok: true, messages: { matches: [] } });
    },
    getCredentials: () => ({ token: "xoxc", cookie: "xoxd", teamId: "T1" }),
    refreshCredentials: () => ({ token: "xoxc", cookie: "xoxd", teamId: "T1" }),
  });

  assert.equal(result.ok, true);
  assert.equal(fetchCalls, 2);
  assert.ok(Date.now() - before >= 15);
});

test("executeSlackRequest retries on 5xx responses even when the error body is not JSON", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  let fetchCalls = 0;

  const result = await executeSlackRequest({
    method: "users.list",
    params: { limit: 200 },
    isWrite: false,
    cachePolicy: { ttlMs: 0 },
    config: {
      minRequestGapMs: 0,
      maxRetries: 2,
      retryJitterMs: 0,
      lockTimeoutMs: 1000,
      staleLockMs: 1000,
      cacheEnabled: false,
      cacheRefresh: false,
      cacheDebug: false,
      queueDebug: false,
      stateRootDir: root,
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return {
          status: 502,
          headers: { get: () => null },
          async json() {
            throw new Error("unexpected token <");
          },
        };
      }
      return makeJsonResponse(200, { ok: true, members: [] });
    },
    getCredentials: () => ({ token: "xoxc-test", cookie: "xoxd-test", teamId: "T1" }),
    refreshCredentials: () => ({ token: "xoxc-test", cookie: "xoxd-test", teamId: "T1" }),
  });

  assert.equal(result.ok, true);
  assert.equal(fetchCalls, 2);
});

test("executeSlackRequest bypasses cache for write methods", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  let fetchCalls = 0;

  const common = {
    method: "chat.postMessage",
    params: { channel: "C1", text: "hello" },
    isWrite: true,
    cachePolicy: { ttlMs: 60_000 },
    config: {
      minRequestGapMs: 0,
      maxRetries: 1,
      retryJitterMs: 0,
      lockTimeoutMs: 1000,
      staleLockMs: 1000,
      cacheEnabled: true,
      cacheRefresh: false,
      cacheDebug: false,
      queueDebug: false,
      readOnly: false,
      stateRootDir: root,
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      return makeJsonResponse(200, { ok: true, ts: String(fetchCalls) });
    },
    getCredentials: () => ({ token: "xoxc-test", cookie: "xoxd-test", teamId: "T1" }),
    refreshCredentials: () => ({ token: "xoxc-test", cookie: "xoxd-test", teamId: "T1" }),
  };

  await executeSlackRequest(common);
  await executeSlackRequest(common);

  assert.equal(fetchCalls, 2);
});

test("executeSlackRequest blocks mutating methods in read-only mode", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));
  let fetchCalls = 0;

  await assert.rejects(
    executeSlackRequest({
      method: "chat.postMessage",
      params: { channel: "C1", text: "hello" },
      isWrite: true,
      isMutation: true,
      cachePolicy: { ttlMs: 0 },
      config: {
        minRequestGapMs: 0,
        maxRetries: 1,
        retryJitterMs: 0,
        lockTimeoutMs: 1000,
        staleLockMs: 1000,
        cacheEnabled: false,
        cacheRefresh: false,
        cacheDebug: false,
        queueDebug: false,
        readOnly: true,
        stateRootDir: root,
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(200, { ok: true });
      },
      getCredentials: () => ({ token: "xoxc-test", cookie: "xoxd-test", teamId: "T1" }),
      refreshCredentials: () => ({ token: "xoxc-test", cookie: "xoxd-test", teamId: "T1" }),
    }),
    /read-only mode/
  );

  assert.equal(fetchCalls, 0);
});
