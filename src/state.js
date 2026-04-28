import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { rm } from "fs/promises";

export function getStateRootDir(rootDir = null) {
  return rootDir || join(homedir(), ".local", "slk");
}

export async function clearLocalState({ rootDir = null, includeWorkspace = false } = {}) {
  const stateRoot = getStateRootDir(rootDir);
  const targets = [
    { label: "token-cache.json", path: join(stateRoot, "token-cache.json") },
    { label: "checkpoints.json", path: join(stateRoot, "checkpoints.json") },
    { label: "cache/", path: join(stateRoot, "cache") },
    { label: "locks/", path: join(stateRoot, "locks") },
    { label: "runtime/", path: join(stateRoot, "runtime") },
  ];

  if (includeWorkspace) {
    targets.push({ label: "active-workspace", path: join(stateRoot, "active-workspace") });
  }

  const removed = [];
  const missing = [];
  for (const target of targets) {
    if (!existsSync(target.path)) {
      missing.push(target.label);
      continue;
    }
    await rm(target.path, { recursive: true, force: true });
    removed.push(target.label);
  }

  return {
    rootDir: stateRoot,
    includeWorkspace,
    removed,
    missing,
  };
}
