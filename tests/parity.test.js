import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { setJsonMode, emit } from "../src/output.js";

// ── output mode ──────────────────────────────────────────

test("emit calls the human renderer when JSON mode is off", () => {
  setJsonMode(false);
  let human = false;
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  try {
    emit({ a: 1 }, () => {
      human = true;
    });
  } finally {
    console.log = orig;
  }
  assert.equal(human, true);
  assert.equal(logs.length, 0);
});

test("emit serializes data when JSON mode is on", () => {
  setJsonMode(true);
  let human = false;
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  try {
    emit({ a: 1 }, () => {
      human = true;
    });
  } finally {
    console.log = orig;
    setJsonMode(false);
  }
  assert.equal(human, false);
  assert.deepEqual(JSON.parse(logs[0]), { a: 1 });
});

// ── CLI routing: mark / schedule / --json ────────────────

async function loadCli() {
  const cliUrl = pathToFileURL(path.join(process.cwd(), "bin", "slk.js")).href;
  return import(`${cliUrl}?t=${Date.now()}-${Math.random()}`);
}

function makeDeps() {
  const calls = [];
  const jsonModeCalls = [];
  const cmd = {
    mark: async (...args) => calls.push(["cmd.mark", ...args]),
    activity: async (...args) => calls.push(["cmd.activity", ...args]),
  };
  const consoleMock = { log: () => {}, error: () => {} };
  const exit = (code) => {
    throw new Error(`EXIT:${code}`);
  };
  return {
    calls,
    jsonModeCalls,
    cmd,
    console: consoleMock,
    exit,
    setJsonMode: (v) => jsonModeCalls.push(v),
  };
}

test("mark routes with scope, defaulting to active", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["mark", "general"], deps);
  assert.deepEqual(deps.calls, [["cmd.mark", "general", { workspace: null, all: false }]]);
});

test("mark -w targets a specific workspace", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["mark", "general", "-w", "candid"], deps);
  assert.deepEqual(deps.calls, [
    ["cmd.mark", "general", { workspace: "candid", all: false }],
  ]);
});

test("--json flag flips json mode and is stripped from positional args", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["inbox", "unread", "--json"], deps);
  assert.deepEqual(deps.jsonModeCalls, [true]);
  assert.deepEqual(deps.calls, [["cmd.activity", true]]);
});
