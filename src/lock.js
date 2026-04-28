import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { hostname } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const currentHost = hostname();

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

async function readMetadata(lockDir) {
  try {
    return JSON.parse(await readFile(join(lockDir, "metadata.json"), "utf8"));
  } catch {
    return null;
  }
}

async function writeMetadata(lockDir, token) {
  await writeFile(
    join(lockDir, "metadata.json"),
    JSON.stringify(
      {
        token,
        pid: process.pid,
        hostname: currentHost,
        startedAt: Date.now(),
        command: process.argv.join(" "),
        cwd: process.cwd(),
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
}

function isProcessAlive(metadata) {
  if (!metadata?.pid || metadata.hostname !== currentHost) return false;

  try {
    process.kill(metadata.pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

async function getLockAgeMs(lockDir, metadata) {
  if (metadata?.startedAt) {
    return Date.now() - metadata.startedAt;
  }

  try {
    const info = await stat(lockDir);
    return Date.now() - info.mtimeMs;
  } catch {
    return 0;
  }
}

export async function withProcessLock(name, options, fn) {
  const { rootDir, timeoutMs, staleMs, pollMs = 10, onWait } = options;
  const startedAt = Date.now();
  const lockDir = join(rootDir, `${name}.lock`);
  const ownerToken = randomUUID();
  await ensureDir(rootDir);

  while (true) {
    try {
      await mkdir(lockDir, { mode: 0o700 });
      await writeMetadata(lockDir, ownerToken);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;

      if (existsSync(lockDir)) {
        const metadata = await readMetadata(lockDir);
        const lockAgeMs = await getLockAgeMs(lockDir, metadata);
        if (lockAgeMs > staleMs && !isProcessAlive(metadata)) {
          await rm(lockDir, { recursive: true, force: true });
          continue;
        }
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for lock: ${name}`);
      }

      if (typeof onWait === "function") {
        onWait({ lockName: name, waitedMs: Date.now() - startedAt });
      }

      await sleep(pollMs);
    }
  }

  try {
    return await fn();
  } finally {
    const metadata = await readMetadata(lockDir);
    if (metadata?.token === ownerToken) {
      await rm(lockDir, { recursive: true, force: true });
    }
  }
}
