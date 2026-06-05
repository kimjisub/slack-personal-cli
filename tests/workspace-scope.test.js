import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveScope, mapWorkspaces, workspaceLabel } from "../src/workspaces.js";

// ── resolveScope ─────────────────────────────────────────

test("resolveScope defaults to the active workspace", () => {
  assert.deepEqual(resolveScope(), { mode: "active" });
  assert.deepEqual(resolveScope({}), { mode: "active" });
});

test("resolveScope picks a specific workspace with -w", () => {
  assert.deepEqual(resolveScope({ workspace: "alpaon" }), {
    mode: "one",
    query: "alpaon",
  });
});

test("resolveScope picks all workspaces with -A (overrides -w)", () => {
  assert.deepEqual(resolveScope({ all: true }), { mode: "all" });
  assert.deepEqual(resolveScope({ all: true, workspace: "alpaon" }), {
    mode: "all",
  });
});

// ── mapWorkspaces ────────────────────────────────────────

test("mapWorkspaces returns values in input order", async () => {
  const targets = [
    { team: { id: "T1" }, creds: { token: "a" } },
    { team: { id: "T2" }, creds: { token: "b" } },
    { team: { id: "T3" }, creds: { token: "c" } },
  ];
  const results = await mapWorkspaces(targets, (creds) => creds.token.toUpperCase());
  assert.deepEqual(
    results.map((r) => r.value),
    ["A", "B", "C"]
  );
  assert.deepEqual(
    results.map((r) => r.team.id),
    ["T1", "T2", "T3"]
  );
});

test("mapWorkspaces isolates partial failures instead of rejecting", async () => {
  const targets = [
    { team: { id: "ok1" }, creds: {} },
    { team: { id: "boom" }, creds: {} },
    { team: { id: "ok2" }, creds: {} },
  ];
  const results = await mapWorkspaces(
    targets,
    (_creds, team) => {
      if (team.id === "boom") throw new Error("nope");
      return team.id;
    },
    { concurrency: 2 }
  );
  assert.equal(results[0].value, "ok1");
  assert.equal(results[1].value, undefined);
  assert.ok(results[1].error instanceof Error);
  assert.equal(results[1].error.message, "nope");
  assert.equal(results[2].value, "ok2");
});

test("mapWorkspaces respects the concurrency cap", async () => {
  let active = 0;
  let peak = 0;
  const targets = Array.from({ length: 8 }, (_, i) => ({
    team: { id: `T${i}` },
    creds: {},
  }));
  await mapWorkspaces(
    targets,
    async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
    },
    { concurrency: 3 }
  );
  assert.ok(peak <= 3, `peak concurrency ${peak} exceeded cap 3`);
});

test("workspaceLabel falls back through name → domain → id → active", () => {
  assert.equal(workspaceLabel({ name: "Alpaon", domain: "alpaon", id: "T1" }), "Alpaon");
  assert.equal(workspaceLabel({ domain: "alpaon", id: "T1" }), "alpaon");
  assert.equal(workspaceLabel({ id: "T1" }), "T1");
  assert.equal(workspaceLabel(null), "active");
});

test("workspaceLabel skips a garbled (U+FFFD) name in favor of the domain", () => {
  const garbled = `THE ${String.fromCharCode(0xfffd)} team`;
  assert.equal(workspaceLabel({ name: garbled, domain: "the-team", id: "T1" }), "the-team");
  assert.equal(workspaceLabel({ name: garbled, id: "T1" }), "T1");
});

// ── CLI scope routing ────────────────────────────────────

async function loadCli() {
  const cliUrl = pathToFileURL(path.join(process.cwd(), "bin", "slk.js")).href;
  return import(`${cliUrl}?t=${Date.now()}-${Math.random()}`);
}

function makeDeps() {
  const calls = [];
  const cmd = {
    activity: async (...args) => calls.push(["cmd.activity", ...args]),
    saved: async (...args) => calls.push(["cmd.saved", ...args]),
    starred: async (...args) => calls.push(["cmd.starred", ...args]),
  };
  const consoleMock = { log: () => {}, error: () => {} };
  const exit = (code) => {
    throw new Error(`EXIT:${code}`);
  };
  return { calls, cmd, console: consoleMock, exit };
}

test("inbox without scope flags omits the opts argument (backward compatible)", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["inbox", "unread"], deps);
  assert.deepEqual(deps.calls, [["cmd.activity", true]]);
});

test("inbox -A routes to all-workspaces scope", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["inbox", "unread", "-A"], deps);
  assert.deepEqual(deps.calls, [["cmd.activity", true, { workspace: null, all: true }]]);
});

test("inbox -w <ws> routes to a specific workspace and strips the flag", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["inbox", "activity", "-w", "alpaon"], deps);
  assert.deepEqual(deps.calls, [
    ["cmd.activity", false, { workspace: "alpaon", all: false }],
  ]);
});

test("--all on inbox saved still means include-completed, not all-workspaces", async () => {
  const cli = await loadCli();
  const deps = makeDeps();
  await cli.runCli(["inbox", "saved", "10", "--all"], deps);
  assert.deepEqual(deps.calls, [["cmd.saved", 10, true]]);
});
