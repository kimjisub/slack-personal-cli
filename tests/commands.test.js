import test from "node:test";
import assert from "node:assert/strict";

import { activity, cacheClear, contextSummary, createCommandContext, inbox, mentions, permalink, read, saved, search, starred, thread, threadUnread } from "../src/commands.js";

function withCapturedLogs(run) {
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(" "));
  };

  return Promise.resolve()
    .then(() => run(lines))
    .finally(() => {
      console.log = originalLog;
    });
}

test("activity falls back to raw channel ids when conversations.list fails", async () => {
  const context = createCommandContext({
    slackApi: async (method) => {
      if (method === "client.counts") {
        return {
          ok: true,
          channels: [{ id: "C123", has_unreads: true, mention_count: 0 }],
          mpims: [],
          ims: [],
        };
      }
      if (method === "users.prefs.get") {
        return { ok: true, prefs: {} };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") {
        return { ok: true, members: [] };
      }
      if (method === "conversations.list") {
        return { ok: false, error: "boom" };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(activity(false, context));
    assert.ok(lines.includes("# C123 •"));
  });
});

test("starred falls back to raw channel ids when conversations.list fails", async () => {
  const context = createCommandContext({
    slackApi: async (method) => {
      if (method === "users.prefs.get") {
        return { ok: true, prefs: { vip_users: "" } };
      }
      if (method === "stars.list") {
        return {
          ok: true,
          items: [{ type: "message", channel: "C123", message: { user: "U1", text: "hello" } }],
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") {
        return { ok: true, members: [{ id: "U1", real_name: "Alice" }] };
      }
      if (method === "conversations.list") {
        return { ok: false, error: "boom" };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(starred(context));
    assert.ok(lines.some((line) => line.includes("#C123 — Alice: hello")));
  });
});

test("saved falls back to raw channel ids when conversations.list fails", async () => {
  const context = createCommandContext({
    slackApi: async (method) => {
      if (method === "saved.list") {
        return {
          ok: true,
          saved_items: [{ item_id: "C123", ts: "1", date_created: 1, state: "active" }],
          counts: { uncompleted_count: 1, completed_count: 0 },
        };
      }
      if (method === "conversations.history") {
        return {
          ok: true,
          messages: [{ user: "U1", ts: "1", text: "saved hello" }],
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") {
        return { ok: true, members: [{ id: "U1", real_name: "Alice" }] };
      }
      if (method === "conversations.list") {
        return { ok: false, error: "boom" };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(saved(20, false, context));
    assert.ok(lines.some((line) => line.includes("#C123 — Alice")));
  });
});

test("mentions searches for direct mentions with date filters and can emit json", async () => {
  const calls = [];
  const context = createCommandContext({
    slackApi: async (method, params = {}) => {
      calls.push({ method, params });
      if (method === "auth.test") {
        return { ok: true, user_id: "U_SELF" };
      }
      if (method === "search.messages") {
        return {
          ok: true,
          messages: {
            total: 1,
            matches: [
              {
                ts: "1714280000.000100",
                user: "U1",
                text: "hey <@U_SELF> can you check this?",
                channel: { id: "C123", name: "eng" },
                permalink: "https://example.slack.com/archives/C123/p1714280000000100",
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") {
        return { ok: true, members: [{ id: "U1", real_name: "Alice" }] };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(mentions({ count: 10, from: "2026-04-01", to: "2026-04-30", json: true, context }));
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.total, 1);
    assert.equal(payload.items[0].channel.name, "eng");
    assert.equal(payload.items[0].user.name, "Alice");
  });

  assert.deepEqual(calls, [
    { method: "auth.test", params: {} },
    { method: "search.messages", params: { query: "\"<@U_SELF>\" after:2026-04-01 before:2026-04-30", count: 10 } },
  ]);
});

test("permalink resolves a channel reference and prints the Slack permalink", async () => {
  const calls = [];
  const context = createCommandContext({
    slackApi: async (method, params = {}) => {
      calls.push({ method, params });
      if (method === "chat.getPermalink") {
        return { ok: true, permalink: "https://example.slack.com/archives/C123/p1714280000000100" };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") {
        return { ok: true, members: [] };
      }
      if (method === "conversations.list") {
        return { ok: true, channels: [{ id: "C123", name: "eng" }] };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(permalink("eng", "1714280000.000100", { context }));
    assert.equal(lines.at(-1), "https://example.slack.com/archives/C123/p1714280000000100");
  });

  assert.deepEqual(calls, [
    { method: "chat.getPermalink", params: { channel: "C123", message_ts: "1714280000.000100" } },
  ]);
});

test("inbox aggregates mentions, unread activity, and saved items into priority buckets", async () => {
  const context = createCommandContext({
    slackApi: async (method, params = {}) => {
      if (method === "auth.test") {
        return { ok: true, user_id: "U_SELF" };
      }
      if (method === "search.messages") {
        return {
          ok: true,
          messages: {
            total: 1,
            matches: [
              {
                ts: "1714280000.000100",
                user: "U1",
                text: "hey <@U_SELF>",
                channel: { id: "C123", name: "eng" },
                permalink: "https://example.slack.com/archives/C123/p1714280000000100",
              },
            ],
          },
        };
      }
      if (method === "client.counts") {
        return {
          ok: true,
          channels: [{ id: "C123", has_unreads: true, mention_count: 1 }],
          mpims: [],
          ims: [{ id: "D123", has_unreads: true, mention_count: 0 }],
          threads: { has_unreads: true, mention_count: 2 },
        };
      }
      if (method === "users.prefs.get") {
        return { ok: true, prefs: {} };
      }
      if (method === "saved.list") {
        return {
          ok: true,
          saved_items: [{ item_id: "C123", ts: "1714280000.000100", date_created: 1714281000, state: "active" }],
          counts: { uncompleted_count: 1, completed_count: 0 },
        };
      }
      if (method === "conversations.history") {
        return {
          ok: true,
          messages: [{ user: "U1", ts: "1714280000.000100", text: "saved hello" }],
        };
      }
      throw new Error(`Unexpected method: ${method} ${JSON.stringify(params)}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") {
        return { ok: true, members: [{ id: "U1", real_name: "Alice" }, { id: "DUSER", real_name: "Bob" }] };
      }
      if (method === "conversations.list") {
        return {
          ok: true,
          channels: [
            { id: "C123", name: "eng" },
            { id: "D123", user: "DUSER" },
          ],
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(inbox({ count: 10, context }));
    assert.ok(lines.some((line) => line.includes("MENTION") && line.includes("#eng")));
    assert.ok(lines.some((line) => line.includes("UNREAD") && line.includes("DM:Bob")));
    assert.ok(lines.some((line) => line.includes("THREADS") && line.includes("2 mentions")));
    assert.ok(lines.some((line) => line.includes("SAVED") && line.includes("saved hello")));
  });
});

test("read can emit json with expanded thread replies", async () => {
  const context = createCommandContext({
    slackApi: async (method, params = {}) => {
      if (method === "conversations.history") {
        return {
          ok: true,
          messages: [
            { user: "U2", ts: "2", text: "latest", reply_count: 0 },
            { user: "U1", ts: "1", text: "root", reply_count: 1, files: [{ name: "a.txt", mimetype: "text/plain" }] },
          ],
        };
      }
      if (method === "conversations.replies") {
        return {
          ok: true,
          messages: [
            { user: "U1", ts: "1", text: "root" },
            { user: "U2", ts: "1.1", text: "reply" },
          ],
        };
      }
      throw new Error(`Unexpected method: ${method} ${JSON.stringify(params)}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") {
        return { ok: true, members: [{ id: "U1", real_name: "Alice" }, { id: "U2", real_name: "Bob" }] };
      }
      if (method === "conversations.list") {
        return { ok: true, channels: [{ id: "C123", name: "eng" }] };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(read("eng", 20, { expandThreads: true, json: true, context }));
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.channel.name, "eng");
    assert.equal(payload.messages.length, 2);
    assert.equal(payload.messages[0].user.name, "Alice");
    assert.equal(payload.messages[0].thread.replies[0].user.name, "Bob");
  });
});

test("search can emit json results", async () => {
  const context = createCommandContext({
    slackApi: async (method) => {
      if (method === "search.messages") {
        return {
          ok: true,
          messages: {
            total: 1,
            matches: [{ ts: "1", user: "U1", text: "deploy failed", channel: { id: "C123", name: "eng" }, permalink: "https://x" }],
          },
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") {
        return { ok: true, members: [{ id: "U1", real_name: "Alice" }] };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(search("deploy failed", 5, { json: true, context }));
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.total, 1);
    assert.equal(payload.items[0].user.name, "Alice");
  });
});

test("thread can emit json replies", async () => {
  const context = createCommandContext({
    slackApi: async (method) => {
      if (method === "conversations.replies") {
        return {
          ok: true,
          messages: [
            { user: "U1", ts: "1", text: "root" },
            { user: "U2", ts: "1.1", text: "reply" },
          ],
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") {
        return { ok: true, members: [{ id: "U1", real_name: "Alice" }, { id: "U2", real_name: "Bob" }] };
      }
      if (method === "conversations.list") {
        return { ok: true, channels: [{ id: "C123", name: "eng" }] };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(thread("eng", "1", 50, { json: true, context }));
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.channel.name, "eng");
    assert.equal(payload.messages[1].text, "reply");
  });
});

test("activity can emit json for unread channels and threads", async () => {
  const context = createCommandContext({
    slackApi: async (method) => {
      if (method === "client.counts") {
        return {
          ok: true,
          channels: [{ id: "C123", has_unreads: true, mention_count: 2 }],
          mpims: [],
          ims: [],
          threads: { has_unreads: true, mention_count: 3 },
        };
      }
      if (method === "users.prefs.get") {
        return { ok: true, prefs: {} };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") return { ok: true, members: [] };
      if (method === "conversations.list") return { ok: true, channels: [{ id: "C123", name: "eng" }] };
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(activity(true, context, { json: true }));
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.threads.mentionCount, 3);
    assert.equal(payload.channels[0].name, "eng");
  });
});

test("thread-unread summarizes unread thread list", async () => {
  const context = createCommandContext({
    slackApi: async (method) => {
      if (method === "subscriptions.thread.getView") {
        return {
          ok: true,
          total_unread_replies: 1,
          new_threads_count: 1,
          threads: [
            {
              root_msg: {
                user: "U1",
                text: "bug report",
                ts: "10",
                thread_ts: "10",
                channel: "C123",
                reply_count: 2,
                latest_reply: "11",
                reply_users: ["U2"],
                last_read: "10.5",
                subscribed: true,
              },
              unread_replies: [{ user: "U2", ts: "11", text: "new reply" }],
              latest_replies: [],
            },
          ],
        };
      }
      if (method === "chat.getPermalink") {
        return { ok: true, permalink: "https://example.slack.com/archives/C123/p10" };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") return { ok: true, members: [{ id: "U1", real_name: "Alice" }, { id: "U2", real_name: "Bob" }] };
      if (method === "conversations.list") return { ok: true, channels: [{ id: "C123", name: "eng" }] };
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(threadUnread({ limit: 10, json: true, context }));
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.totalUnreadReplies, 1);
    assert.equal(payload.items[0].channel.name, "eng");
    assert.equal(payload.items[0].unreadReplies[0].user.name, "Bob");
  });
});

test("context summary returns channel metadata and recent messages as json", async () => {
  const context = createCommandContext({
    slackApi: async (method, params = {}) => {
      if (method === "conversations.info") {
        return {
          ok: true,
          channel: {
            id: "C123",
            name: "eng",
            is_private: false,
            num_members: 12,
            topic: { value: "Engineering sync" },
            purpose: { value: "Ship product" },
            creator: "U1",
          },
        };
      }
      if (method === "pins.list") {
        return { ok: true, items: [{ message: { ts: "1", user: "U1", text: "pin text" } }] };
      }
      if (method === "conversations.history") {
        return {
          ok: true,
          messages: [
            { user: "U2", ts: "2", text: "latest" },
            { user: "U1", ts: "1", text: "older" },
          ],
        };
      }
      throw new Error(`Unexpected method: ${method} ${JSON.stringify(params)}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") return { ok: true, members: [{ id: "U1", real_name: "Alice" }, { id: "U2", real_name: "Bob" }] };
      if (method === "conversations.list") return { ok: true, channels: [{ id: "C123", name: "eng" }] };
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(contextSummary("eng", { messageCount: 2, json: true, context }));
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.channel.name, "eng");
    assert.equal(payload.channel.topic, "Engineering sync");
    assert.equal(payload.pins.length, 1);
    assert.equal(payload.recentMessages[0].text, "older");
  });
});

test("read json exposes paging metadata and since-ts filtering", async () => {
  const historyCalls = [];
  const context = createCommandContext({
    slackApi: async (method, params = {}) => {
      if (method === "conversations.history") {
        historyCalls.push(params);
        return {
          ok: true,
          messages: [{ user: "U1", ts: "5", text: "new" }],
          has_more: true,
          response_metadata: { next_cursor: "CURSOR123" },
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") return { ok: true, members: [{ id: "U1", real_name: "Alice" }] };
      if (method === "conversations.list") return { ok: true, channels: [{ id: "C123", name: "eng" }] };
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(read("eng", 20, { sinceTs: "4", cursor: "START", json: true, context }));
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.paging.nextCursor, "CURSOR123");
    assert.equal(payload.messages[0].text, "new");
  });

  assert.deepEqual(historyCalls, [{ channel: "C123", limit: 20, oldest: "4", cursor: "START" }]);
});

test("mentions supports user and channel filters plus summary field projection", async () => {
  const calls = [];
  const context = createCommandContext({
    slackApi: async (method, params = {}) => {
      calls.push({ method, params });
      if (method === "auth.test") return { ok: true, user_id: "U_SELF" };
      if (method === "search.messages") {
        return {
          ok: true,
          messages: {
            total: 1,
            matches: [{ ts: "1", user: "U1", text: "hey", channel: { id: "C123", name: "eng" }, permalink: "https://x" }],
          },
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") return { ok: true, members: [{ id: "U1", real_name: "Alice" }] };
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(mentions({ count: 5, user: "alice", channel: "eng", kind: "channel", json: true, summaryFields: ["text", "permalink"], context }));
    const payload = JSON.parse(lines.join("\n"));
    assert.deepEqual(payload.items[0], { text: "hey", permalink: "https://x" });
  });

  assert.deepEqual(calls, [
    { method: "auth.test", params: {} },
    { method: "search.messages", params: { query: '"<@U_SELF>" from:@alice in:eng', count: 5 } },
  ]);
});

test("thread unread supports cursor/max_ts and summary field projection", async () => {
  const calls = [];
  const context = createCommandContext({
    slackApi: async (method, params = {}) => {
      calls.push({ method, params });
      if (method === "subscriptions.thread.getView") {
        return {
          ok: true,
          total_unread_replies: 1,
          new_threads_count: 1,
          has_more: true,
          max_ts: "99",
          threads: [
            { root_msg: { user: "U1", text: "root", ts: "10", thread_ts: "10", channel: "C123" }, unread_replies: [] },
          ],
        };
      }
      if (method === "chat.getPermalink") return { ok: true, permalink: "https://x" };
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") return { ok: true, members: [{ id: "U1", real_name: "Alice" }] };
      if (method === "conversations.list") return { ok: true, channels: [{ id: "C123", name: "eng" }] };
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(threadUnread({ limit: 5, cursor: "99", json: true, summaryFields: ["permalink"], context }));
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.paging.nextCursor, "99");
    assert.deepEqual(payload.items[0], { permalink: "https://x" });
  });

  assert.deepEqual(calls[0], { method: "subscriptions.thread.getView", params: { limit: 5, fetch_threads_state: true, max_ts: "99" } });
});

test("context summary includes participant rollup and activity stats", async () => {
  const context = createCommandContext({
    slackApi: async (method) => {
      if (method === "conversations.info") {
        return { ok: true, channel: { id: "C123", name: "eng", is_private: false, num_members: 12, topic: { value: "Engineering sync" }, purpose: { value: "Ship product" }, creator: "U1" } };
      }
      if (method === "pins.list") return { ok: true, items: [] };
      if (method === "conversations.history") {
        return {
          ok: true,
          messages: [
            { user: "U2", ts: "4", text: "latest", reply_count: 2 },
            { user: "U1", ts: "3", text: "next" },
            { user: "U2", ts: "2", text: "prev" },
            { user: "U3", ts: "1", text: "old" },
          ],
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
    slackPaginate: async (method) => {
      if (method === "users.list") return { ok: true, members: [{ id: "U1", real_name: "Alice" }, { id: "U2", real_name: "Bob" }, { id: "U3", real_name: "Carol" }] };
      if (method === "conversations.list") return { ok: true, channels: [{ id: "C123", name: "eng" }] };
      throw new Error(`Unexpected method: ${method}`);
    },
  });

  await withCapturedLogs(async (lines) => {
    await assert.doesNotReject(contextSummary("eng", { messageCount: 4, json: true, context }));
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.activity.messageCount, 4);
    assert.equal(payload.activity.threadedMessageCount, 1);
    assert.equal(payload.topParticipants[0].user.name, "Bob");
    assert.equal(payload.topParticipants[0].messageCount, 2);
  });
});

test("cacheClear reports removed local state and preserves workspace by default", async () => {
  const { mkdirSync, writeFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { makeTempDir, cleanupDir } = await import("./helpers.js");
  const root = makeTempDir();

  try {
    mkdirSync(join(root, "cache"), { recursive: true });
    writeFileSync(join(root, "cache", "entry.json"), "{}");
    writeFileSync(join(root, "token-cache.json"), "{}");
    writeFileSync(join(root, "active-workspace"), "T1");

    await withCapturedLogs(async (lines) => {
      await assert.doesNotReject(cacheClear({ stateRootDir: root }));
      assert.ok(lines.some((line) => line.includes("Cleared local slk state")));
    });

    assert.equal(existsSync(join(root, "cache")), false);
    assert.equal(existsSync(join(root, "token-cache.json")), false);
    assert.equal(existsSync(join(root, "active-workspace")), true);
  } finally {
    cleanupDir(root);
  }
});
