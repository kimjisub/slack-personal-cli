import test from "node:test";
import assert from "node:assert/strict";

import {
  computeSearch,
  computeOwed,
  computeUnreads,
} from "../src/commands.js";

/**
 * Install a fake Slack transport: a map of method -> (params, creds) => response.
 * Returns a restore function. Methods not in the map throw, which surfaces any
 * unexpected call a compute* function makes.
 */
function withTransport(routes) {
  const prev = globalThis.__SLK_TEST_HOOKS__;
  globalThis.__SLK_TEST_HOOKS__ = {
    handle: async (method, params, creds) => {
      const route = routes[method];
      if (!route) throw new Error(`unexpected Slack call: ${method}`);
      return route(params, creds);
    },
  };
  return () => {
    globalThis.__SLK_TEST_HOOKS__ = prev;
  };
}

// ── computeSearch ────────────────────────────────────────

test("computeSearch returns total and matches from search.messages", async () => {
  const restore = withTransport({
    "search.messages": (params) => {
      assert.equal(params.query, "deploy");
      assert.equal(params.count, 5);
      return {
        ok: true,
        messages: { total: 2, matches: [{ ts: "1.0", text: "a" }, { ts: "2.0", text: "b" }] },
      };
    },
  });
  try {
    const res = await computeSearch("deploy", 5, { token: "t", cookie: "c" });
    assert.equal(res.total, 2);
    assert.equal(res.matches.length, 2);
  } finally {
    restore();
  }
});

test("computeSearch throws on a Slack error", async () => {
  const restore = withTransport({
    "search.messages": () => ({ ok: false, error: "invalid_auth" }),
  });
  try {
    await assert.rejects(() => computeSearch("x", 1, null), /invalid_auth/);
  } finally {
    restore();
  }
});

// ── computeOwed ──────────────────────────────────────────

const MY_ID = "U_ME";
function authTestOk() {
  return { ok: true, user_id: MY_ID };
}

test("computeOwed keeps mentions I never answered", async () => {
  const restore = withTransport({
    "auth.test": authTestOk,
    "search.messages": () => ({
      ok: true,
      messages: {
        matches: [
          { ts: "100.1", channel: { id: "C1", name: "general" }, username: "boss", text: "<@U_ME> ping", permalink: "p1" },
        ],
      },
    }),
    "conversations.replies": (params) => {
      assert.equal(params.channel, "C1");
      // Only the mention itself, no reply from me and no reaction.
      return { ok: true, messages: [{ user: "boss", ts: "100.1" }] };
    },
  });
  try {
    const rows = await computeOwed({ token: "t", cookie: "c" }, 30);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].channelName, "general");
    assert.equal(rows[0].permalink, "p1");
  } finally {
    restore();
  }
});

test("computeOwed drops a mention I replied to", async () => {
  const restore = withTransport({
    "auth.test": authTestOk,
    "search.messages": () => ({
      ok: true,
      messages: { matches: [{ ts: "100.1", channel: { id: "C1", name: "general" }, text: "<@U_ME> ping" }] },
    }),
    "conversations.replies": () => ({
      ok: true,
      messages: [
        { user: "boss", ts: "100.1" },
        { user: MY_ID, ts: "100.2", text: "on it" },
      ],
    }),
  });
  try {
    const rows = await computeOwed(null, 30);
    assert.equal(rows.length, 0);
  } finally {
    restore();
  }
});

test("computeOwed drops a mention I reacted to with an emoji", async () => {
  const restore = withTransport({
    "auth.test": authTestOk,
    "search.messages": () => ({
      ok: true,
      messages: { matches: [{ ts: "100.1", channel: { id: "C1", name: "general" }, text: "<@U_ME> ping" }] },
    }),
    "conversations.replies": () => ({
      ok: true,
      messages: [{ user: "boss", ts: "100.1", reactions: [{ name: "+1", users: [MY_ID] }] }],
    }),
  });
  try {
    const rows = await computeOwed(null, 30);
    assert.equal(rows.length, 0);
  } finally {
    restore();
  }
});

// ── computeUnreads ───────────────────────────────────────

test("computeUnreads merges counts with channel names and resolves unread DM names", async () => {
  const restore = withTransport({
    "client.counts": () => ({
      ok: true,
      threads: { has_unreads: false, mention_count: 0 },
      channels: [{ id: "C1", has_unreads: true, mention_count: 0 }],
      mpims: [],
      ims: [{ id: "D1", has_unreads: true, mention_count: 1 }],
    }),
    "users.prefs.get": () => ({ ok: true, prefs: { all_notifications_prefs: { channels: {} } } }),
    "conversations.list": () => ({
      ok: true,
      channels: [
        { id: "C1", name: "general" },
        { id: "D1", is_im: true, user: "U_BOB" },
      ],
    }),
    "users.info": (params) => {
      assert.equal(params.user, "U_BOB");
      return { ok: true, user: { id: "U_BOB", real_name: "Bob" } };
    },
  });
  try {
    const data = await computeUnreads({ token: "t", cookie: "c" });
    assert.equal(data.chMap.C1, "general");
    assert.equal(data.chMap.D1, "DM:Bob");
    assert.equal(data.items.length, 2);
    assert.ok(data.mutedSet instanceof Set);
  } finally {
    restore();
  }
});

test("computeUnreads only resolves names for unread DMs (no users.info for read ones)", async () => {
  let userInfoCalls = 0;
  const restore = withTransport({
    "client.counts": () => ({
      ok: true,
      threads: null,
      channels: [],
      mpims: [],
      ims: [{ id: "D1", has_unreads: false, mention_count: 0 }],
    }),
    "users.prefs.get": () => ({ ok: true, prefs: {} }),
    "conversations.list": () => ({
      ok: true,
      channels: [{ id: "D1", is_im: true, user: "U_BOB" }],
    }),
    "users.info": () => {
      userInfoCalls += 1;
      return { ok: true, user: { id: "U_BOB", real_name: "Bob" } };
    },
  });
  try {
    await computeUnreads(null);
    assert.equal(userInfoCalls, 0);
  } finally {
    restore();
  }
});

test("computeUnreads throws when client.counts fails", async () => {
  const restore = withTransport({
    "client.counts": () => ({ ok: false, error: "ratelimited" }),
    "users.prefs.get": () => ({ ok: true, prefs: {} }),
    "conversations.list": () => ({ ok: true, channels: [] }),
  });
  try {
    await assert.rejects(() => computeUnreads(null), /ratelimited/);
  } finally {
    restore();
  }
});
