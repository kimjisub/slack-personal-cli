import test from "node:test";
import assert from "node:assert/strict";

import { detectCheckpointTs, flattenRows, formatExport, summarizeWatchChange } from "../src/agent-utils.js";

test("flattenRows prefers items then messages then recentMessages", () => {
  assert.deepEqual(flattenRows({ items: [{ a: 1 }] }), [{ a: 1 }]);
  assert.deepEqual(flattenRows({ messages: [{ b: 2 }] }), [{ b: 2 }]);
  assert.deepEqual(flattenRows({ recentMessages: [{ c: 3 }] }), [{ c: 3 }]);
});

test("formatExport renders ndjson and csv from nested rows", () => {
  const rows = [{ text: "hello", user: { name: "Alice" }, meta: { ts: "1" } }];
  const ndjson = formatExport(rows, "ndjson");
  assert.match(ndjson, /"text":"hello"/);
  const csv = formatExport(rows, "csv");
  assert.match(csv, /text,user.name,meta.ts/);
  assert.match(csv, /hello,Alice,1/);
});

test("detectCheckpointTs extracts latest ts from common payload shapes", () => {
  assert.equal(detectCheckpointTs({ messages: [{ ts: "1" }, { ts: "2" }] }), "2");
  assert.equal(detectCheckpointTs({ items: [{ ts: "3" }, { rootMessage: { ts: "4" } }] }), "4");
  assert.equal(detectCheckpointTs({ recentMessages: [{ ts: "5" }] }), "5");
});

test("summarizeWatchChange reports changed counts and latest ts", () => {
  const prev = { items: [{ ts: "1" }], total: 1 };
  const next = { items: [{ ts: "1" }, { ts: "2" }], total: 2 };
  const summary = summarizeWatchChange(prev, next);
  assert.equal(summary.changed, true);
  assert.equal(summary.previousCount, 1);
  assert.equal(summary.currentCount, 2);
  assert.equal(summary.latestTs, "2");
});
