import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export function makeTempDir(prefix = "slk-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanupDir(path) {
  rmSync(path, { recursive: true, force: true });
}

export function makeJsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      get(name) {
        return headers[name] ?? headers[name.toLowerCase()] ?? null;
      },
    },
    async json() {
      return body;
    },
  };
}
