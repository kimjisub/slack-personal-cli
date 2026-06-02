// Regression test for the symlinked-global-bin silent-exit bug.
//
// Before v0.3.1, the main-module guard in bin/slk.js compared `process.argv[1]`
// to `import.meta.url` directly. When the CLI was invoked through the global
// npm bin symlink (.../bin/slk → .../lib/node_modules/.../bin/slk.js), argv[1]
// stayed as the symlink path while Node resolved import.meta.url to the real
// path — the equality failed, `main()` never ran, and the process exited 0
// with no output.
//
// This test reproduces that scenario by creating a symlink to bin/slk.js in a
// temp directory and invoking it. If the realpath fix is reverted, the version
// command will print nothing and the assertion fails.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("global symlinked bin runs main() (regression: realpath fix)", () => {
  const binPath = join(process.cwd(), "bin", "slk.js");
  const tmpDir = mkdtempSync(join(tmpdir(), "slk-symlink-"));
  const linkPath = join(tmpDir, "slk");
  symlinkSync(binPath, linkPath);

  const { version } = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  );

  const res = spawnSync(process.execPath, [linkPath, "--version"], {
    encoding: "utf8",
  });

  assert.equal(
    res.status,
    0,
    `expected exit 0, got ${res.status}. stderr=${res.stderr}`,
  );
  assert.ok(
    res.stdout.includes(version),
    `expected version ${version} in stdout, got: ${JSON.stringify(res.stdout)}`,
  );
});
