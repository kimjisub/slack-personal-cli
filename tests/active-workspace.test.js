import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { matchTeamId, resolveActiveWorkspace, ACTIVE_WORKSPACE_ENV } from "../src/auth.js";

const TEAMS = {
  T1: { id: "T1", name: "Acme Corp", domain: "acme" },
  T2: { id: "T2", name: "rust-lang community", domain: "rust-lang" },
};

// ── matchTeamId ──────────────────────────────────────────

test("matchTeamId matches by id, domain, exact name, then partial", () => {
  assert.equal(matchTeamId(TEAMS, "T2"), "T2");
  assert.equal(matchTeamId(TEAMS, "acme"), "T1");
  assert.equal(matchTeamId(TEAMS, "Acme Corp"), "T1");
  assert.equal(matchTeamId(TEAMS, "rust"), "T2"); // partial domain/name
  assert.equal(matchTeamId(TEAMS, "nope"), null);
});

// ── resolveActiveWorkspace precedence ────────────────────
// Precedence: SLACK_CLI_WORKSPACE env > active file > sole login > error.
// The active-file tier reads from real cache state, so these tests exercise the
// env tier, the sole-login tier, and the ambiguity error — the parts that don't
// depend on a written active file.

function withEnv(value, fn) {
  const prev = process.env[ACTIVE_WORKSPACE_ENV];
  if (value === undefined) delete process.env[ACTIVE_WORKSPACE_ENV];
  else process.env[ACTIVE_WORKSPACE_ENV] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[ACTIVE_WORKSPACE_ENV];
    else process.env[ACTIVE_WORKSPACE_ENV] = prev;
  }
}

test("env var wins and reports its source", () => {
  withEnv("rust", () => {
    const r = resolveActiveWorkspace(TEAMS);
    assert.equal(r.teamId, "T2");
    assert.match(r.source, /env/);
  });
});

test("env var that matches nothing throws", () => {
  withEnv("ghost", () => {
    assert.throws(() => resolveActiveWorkspace(TEAMS), /does not match/);
  });
});

test("a sole logged-in workspace is used without any selection", () => {
  withEnv(undefined, () => {
    const r = resolveActiveWorkspace({ T1: TEAMS.T1 });
    assert.equal(r.teamId, "T1");
    assert.match(r.source, /sole/);
  });
});

test("2+ workspaces with nothing selected throws an actionable error", () => {
  withEnv(undefined, () => {
    // No env and (in CI) no active file → ambiguous → must error, not guess.
    assert.throws(() => resolveActiveWorkspace(TEAMS), /No active workspace/);
  });
});

// ── CLI: -w and -A are mutually exclusive ────────────────

async function loadCli() {
  const cliUrl = pathToFileURL(path.join(process.cwd(), "bin", "slk.js")).href;
  return import(`${cliUrl}?t=${Date.now()}-${Math.random()}`);
}

test("passing both -w and -A is a usage error (no command runs)", async () => {
  const cli = await loadCli();
  const calls = [];
  const deps = {
    cmd: { activity: async (...a) => calls.push(["activity", ...a]) },
    console: { log: () => {}, error: () => {} },
    exit: (code) => {
      throw new Error(`EXIT:${code}`);
    },
  };
  await assert.rejects(
    () => cli.runCli(["inbox", "unread", "-w", "acme", "-A"], deps),
    /EXIT:1/
  );
  assert.equal(calls.length, 0);
});
