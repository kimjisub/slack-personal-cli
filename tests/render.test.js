import test from "node:test";
import assert from "node:assert/strict";

import {
  formatTs,
  userName,
  searchAuthor,
  normalizeMatch,
  renderUnreadSection,
  unreadsToJson,
  renderOwed,
  printMessage,
} from "../src/render.js";

function capture(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return logs;
}

// ── small helpers ────────────────────────────────────────

test("userName falls back to the id when unknown", () => {
  assert.equal(userName({ U1: "Alice" }, "U1"), "Alice");
  assert.equal(userName({}, "U2"), "U2");
});

test("searchAuthor prefers the user map, then username, then id", () => {
  assert.equal(searchAuthor({ user: "U1", username: "bob" }, { U1: "Alice" }), "Alice");
  assert.equal(searchAuthor({ user: "U1", username: "bob" }, {}), "bob");
  assert.equal(searchAuthor({ user: "U1" }, {}), "U1");
  assert.equal(searchAuthor({}, {}), "?");
});

test("formatTs renders a non-empty string for a unix-seconds timestamp", () => {
  const out = formatTs("1769753479.788949");
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});

test("normalizeMatch projects a search match into a stable shape", () => {
  const match = {
    ts: "123.456",
    channel: { id: "C1", name: "general" },
    user: "U1",
    username: "alice",
    text: "hi",
    permalink: "https://x/y",
  };
  assert.deepEqual(normalizeMatch(match, {}, "alpaon"), {
    workspace: "alpaon",
    ts: "123.456",
    channel: "general",
    author: "alice",
    text: "hi",
    permalink: "https://x/y",
  });
});

// ── printMessage ─────────────────────────────────────────

test("printMessage prints reaction tallies as :name: count", () => {
  const msg = {
    user: "U1",
    ts: "123.4",
    text: "lunch?",
    reactions: [
      { name: "pizza", count: 5, users: ["U2"] },
      { name: "ramen", count: 2, users: ["U3"] },
    ],
  };
  const logs = capture(() => printMessage({ U1: "Alice" }, msg));
  const joined = logs.join("\n");
  assert.ok(joined.includes(":pizza: 5"));
  assert.ok(joined.includes(":ramen: 2"));
});

test("printMessage omits the reaction line when there are none", () => {
  const msg = { user: "U1", ts: "123.4", text: "hi" };
  const logs = capture(() => printMessage({ U1: "Alice" }, msg));
  // The reaction line is the only one shaped like `:name: count`.
  assert.ok(!logs.some((l) => /:\w+:\s+\d+/.test(l)));
});

// ── unread filtering (shared by render + json) ───────────

const unreadData = {
  threads: { has_unreads: false, mention_count: 0 },
  items: [
    { id: "C1", type: "channel", has_unreads: true, mention_count: 0 },
    { id: "C2", type: "channel", has_unreads: true, mention_count: 0 }, // muted
    { id: "C3", type: "channel", has_unreads: false, mention_count: 0 }, // read
    { id: "D1", type: "dm", has_unreads: false, mention_count: 2 }, // mentioned
  ],
  chMap: { C1: "general", C2: "noise", C3: "quiet", D1: "DM:Bob" },
  mutedSet: new Set(["C2"]),
};

test("unreadsToJson keeps only unread/mentioned, non-muted items", () => {
  const json = unreadsToJson(unreadData, true, "alpaon");
  assert.equal(json.workspace, "alpaon");
  assert.deepEqual(
    json.items.map((i) => i.id).sort(),
    ["C1", "D1"]
  );
  const d1 = json.items.find((i) => i.id === "D1");
  assert.equal(d1.mention_count, 2);
  assert.equal(d1.name, "DM:Bob");
});

test("renderUnreadSection prints unread items and skips muted/read ones", () => {
  const logs = capture(() => renderUnreadSection(unreadData, true, null));
  const joined = logs.join("\n");
  assert.ok(joined.includes("# general"));
  assert.ok(joined.includes("(2 mentions)"));
  assert.ok(!joined.includes("noise"));
  assert.ok(!joined.includes("quiet"));
});

test("renderUnreadSection reports an empty unread inbox", () => {
  const empty = { threads: null, items: [], chMap: {}, mutedSet: new Set() };
  const logs = capture(() => renderUnreadSection(empty, true, null));
  assert.deepEqual(logs, ["No unreads! 🎉"]);
});

// ── owed ─────────────────────────────────────────────────

test("renderOwed reports nothing owed for an empty list", () => {
  const logs = capture(() => renderOwed([], null));
  assert.deepEqual(logs, ["Nothing owed! 🎉"]);
});

test("renderOwed prints channel, author, text and permalink", () => {
  const rows = [
    { channelName: "maritime", author: "구성윤", ts: "123.4", text: "ping", permalink: "https://x" },
  ];
  const logs = capture(() => renderOwed(rows, "alpaon"));
  const joined = logs.join("\n");
  assert.ok(joined.includes("=== alpaon ==="));
  assert.ok(joined.includes("#maritime"));
  assert.ok(joined.includes("구성윤"));
  assert.ok(joined.includes("ping"));
  assert.ok(joined.includes("https://x"));
});
