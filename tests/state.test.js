import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { clearLocalState } from "../src/state.js";
import { cleanupDir, makeTempDir } from "./helpers.js";

test("clearLocalState removes cache/runtime files but preserves active workspace by default", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));

  mkdirSync(join(root, "cache"), { recursive: true });
  mkdirSync(join(root, "locks"), { recursive: true });
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(join(root, "cache", "entry.json"), "{}");
  writeFileSync(join(root, "locks", "owner"), "lock");
  writeFileSync(join(root, "runtime", "rate-state.json"), "{}");
  writeFileSync(join(root, "token-cache.json"), "{}");
  writeFileSync(join(root, "checkpoints.json"), "{}");
  writeFileSync(join(root, "active-workspace"), "T1");

  const result = await clearLocalState({ rootDir: root });

  assert.equal(result.removed.includes("cache/"), true);
  assert.equal(result.removed.includes("locks/"), true);
  assert.equal(result.removed.includes("runtime/"), true);
  assert.equal(result.removed.includes("token-cache.json"), true);
  assert.equal(result.removed.includes("checkpoints.json"), true);
  assert.equal(existsSync(join(root, "active-workspace")), true);
  assert.equal(existsSync(join(root, "token-cache.json")), false);
  assert.equal(existsSync(join(root, "cache")), false);
});

test("clearLocalState can also remove active workspace selection", async (t) => {
  const root = makeTempDir();
  t.after(() => cleanupDir(root));

  writeFileSync(join(root, "active-workspace"), "T1");

  const result = await clearLocalState({ rootDir: root, includeWorkspace: true });

  assert.equal(result.removed.includes("active-workspace"), true);
  assert.equal(existsSync(join(root, "active-workspace")), false);
});
