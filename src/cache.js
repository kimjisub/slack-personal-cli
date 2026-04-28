import { createHash } from "crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])])
    );
  }
  return value;
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildCacheKey({ teamId, method, params = {} }) {
  const normalized = {
    v: 1,
    teamId: teamId || "default",
    method,
    params: sortValue(params),
  };
  const key = hashJson(normalized);
  return {
    key,
    normalized,
    fileName: `${key}.json`,
  };
}

export async function readCache(rootDir, descriptor, ttlMs) {
  const filePath = join(rootDir, descriptor.fileName);
  if (!existsSync(filePath)) return { hit: false, payload: null, meta: null };

  try {
    const raw = JSON.parse(await readFile(filePath, "utf8"));
    const expiresIn = ttlMs ?? raw.meta?.ttlMs ?? 0;
    if (!expiresIn || expiresIn <= 0) {
      return { hit: false, payload: null, meta: raw.meta ?? null };
    }

    if (Date.now() - (raw.meta?.createdAt ?? 0) > expiresIn) {
      return { hit: false, payload: null, meta: raw.meta ?? null };
    }

    return { hit: true, payload: raw.payload, meta: raw.meta ?? null };
  } catch {
    return { hit: false, payload: null, meta: null };
  }
}

export async function writeCache(rootDir, descriptor, payload, meta = {}) {
  await ensureDir(rootDir);
  const filePath = join(rootDir, descriptor.fileName);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const body = JSON.stringify(
    {
      meta: {
        createdAt: Date.now(),
        ttlMs: meta.ttlMs ?? 0,
        normalized: descriptor.normalized,
      },
      payload,
    },
    null,
    2
  );

  await writeFile(tempPath, body, { mode: 0o600 });
  await rename(tempPath, filePath);
}

export async function invalidateByPrefixes(rootDir, prefixes = []) {
  if (!existsSync(rootDir)) return;

  const files = await readdir(rootDir);
  await Promise.all(
    files.map(async (file) => {
      const filePath = join(rootDir, file);
      try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) return;
        const raw = JSON.parse(await readFile(filePath, "utf8"));
        const normalized = raw.meta?.normalized;
        const shouldDelete = prefixes.some((prefix) => {
          if (!normalized) return false;
          if (prefix.teamId && normalized.teamId !== prefix.teamId) return false;
          if (prefix.method && normalized.method !== prefix.method) return false;
          return true;
        });
        if (shouldDelete) await rm(filePath, { force: true });
      } catch {
        // ignore malformed cache entries
      }
    })
  );
}
