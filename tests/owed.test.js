import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isOwed } from "../src/commands.js";

const ME = "U_ME";
const MENTION_TS = "1000.000100";

// ── isOwed judgment ──────────────────────────────────────

test("owed when nobody (including me) responded after the mention", () => {
  const thread = [
    { user: "U_OTHER", ts: "1000.000100", text: "<@U_ME> ping" },
  ];
  assert.equal(isOwed(ME, MENTION_TS, thread), true);
});

test("not owed when I posted a reply after the mention", () => {
  const thread = [
    { user: "U_OTHER", ts: "1000.000100" },
    { user: ME, ts: "1000.000200", text: "on it" },
  ];
  assert.equal(isOwed(ME, MENTION_TS, thread), false);
});

test("not owed when I reacted anywhere in the thread (emoji counts)", () => {
  const thread = [
    { user: "U_OTHER", ts: "1000.000100", reactions: [{ name: "+1", users: [ME] }] },
  ];
  assert.equal(isOwed(ME, MENTION_TS, thread), false);
});

test("still owed when only someone else reacted", () => {
  const thread = [
    { user: "U_OTHER", ts: "1000.000100", reactions: [{ name: "+1", users: ["U_X"] }] },
  ];
  assert.equal(isOwed(ME, MENTION_TS, thread), true);
});

test("still owed when my only message predates the mention", () => {
  const thread = [
    { user: ME, ts: "999.000000", text: "earlier unrelated" },
    { user: "U_OTHER", ts: "1000.000100", text: "<@U_ME> ping" },
  ];
  assert.equal(isOwed(ME, MENTION_TS, thread), true);
});

// ── CLI routing for owed / search scope ──────────────────

async function loadCli() {
  const cliUrl = pathToFileURL(path.join(process.cwd(), "bin", "slk.js")).href;
  return import(`${cliUrl}?t=${Date.now()}-${Math.random()}`);
}

function makeDeps() {
  const calls = [];
  const cmd = {
    owed: async (...args) => calls.push(["cmd.owed", ...args]),
    search: async (...args) => calls.push(["cmd.search", ...args]),
  };
  const consoleMock = { log: () => {}, error: () => {} };
  const exit = (code) => {
    throw new Error(`EXIT:${code}`);
  };
  return { calls, cmd, console: consoleMock, exit };
}

test("owed defaults to active workspace with a 30-day window", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["owed"], deps);
  assert.deepEqual(deps.calls, [["cmd.owed", { workspace: null, all: false, days: 30 }]]);
});

test("owed -A --days 7 routes to all workspaces with a 7-day window", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["owed", "-A", "--days", "7"], deps);
  assert.deepEqual(deps.calls, [["cmd.owed", { workspace: null, all: true, days: 7 }]]);
});

test("search without scope flags omits the opts argument", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["search", "deploy"], deps);
  assert.deepEqual(deps.calls, [["cmd.search", "deploy", 20]]);
});

test("search -A passes all-workspaces scope", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["search", "deploy", "-A"], deps);
  assert.deepEqual(deps.calls, [
    ["cmd.search", "deploy", 20, { workspace: null, all: true }],
  ]);
});

test("search treats a trailing number as the count, not part of the query", async () => {
  const cli = await loadCli();
  {
    const deps = makeDeps();
    await cli.runCli(["search", "deploy", "5"], deps);
    assert.deepEqual(deps.calls, [["cmd.search", "deploy", 5]]);
  }
  {
    const deps = makeDeps();
    await cli.runCli(["search", "deploy", "failed", "10"], deps);
    assert.deepEqual(deps.calls, [["cmd.search", "deploy failed", 10]]);
  }
  {
    // A lone numeric query is still a query, not a count.
    const deps = makeDeps();
    await cli.runCli(["search", "1234"], deps);
    assert.deepEqual(deps.calls, [["cmd.search", "1234", 20]]);
  }
});
