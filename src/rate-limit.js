import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getStateFile(rootDir) {
  return join(rootDir, "rate-state.json");
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

async function writeState(rootDir, state) {
  await ensureDir(rootDir);
  const filePath = getStateFile(rootDir);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(tempPath, filePath);
}

export async function loadRateState(rootDir) {
  const filePath = getStateFile(rootDir);
  if (!existsSync(filePath)) {
    return {
      nextAllowedAt: 0,
      lastRequestAt: 0,
      last429At: 0,
      retryAfterMs: 0,
    };
  }

  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {
      nextAllowedAt: 0,
      lastRequestAt: 0,
      last429At: 0,
      retryAfterMs: 0,
    };
  }
}

export async function waitForTurn({ rootDir, minRequestGapMs, now = Date.now(), sleepFn = sleep }) {
  const state = await loadRateState(rootDir);
  const nextAt = Math.max(state.nextAllowedAt || 0, (state.lastRequestAt || 0) + minRequestGapMs);
  const waitMs = Math.max(0, nextAt - now);
  if (waitMs > 0) await sleepFn(waitMs);
  return waitMs;
}

export async function markRequestStarted({ rootDir, now = Date.now() }) {
  const state = await loadRateState(rootDir);
  const nextState = { ...state, lastRequestAt: now };
  await writeState(rootDir, nextState);
  return nextState;
}

export async function mark429({ rootDir, retryAfterSeconds, jitterMs = 0, now = Date.now() }) {
  const retryAfterMs = Math.max(0, Math.round(Number(retryAfterSeconds || 0) * 1000)) + Math.max(0, jitterMs);
  const state = await loadRateState(rootDir);
  const nextState = {
    ...state,
    last429At: now,
    retryAfterMs,
    nextAllowedAt: now + retryAfterMs,
  };
  await writeState(rootDir, nextState);
  return nextState;
}

export async function markSuccess({ rootDir, now = Date.now() }) {
  const state = await loadRateState(rootDir);
  const nextState = {
    ...state,
    lastRequestAt: now,
    retryAfterMs: 0,
    nextAllowedAt: now,
  };
  await writeState(rootDir, nextState);
  return nextState;
}
