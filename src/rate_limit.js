import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_MIN_INTERVAL_MS = Number(process.env.SLK_MIN_REQUEST_INTERVAL_MS || 1200);
const DEFAULT_LOCK_STALE_MS = Number(process.env.SLK_LOCK_STALE_MS || 30_000);
const DEFAULT_LOCK_POLL_MS = Number(process.env.SLK_LOCK_POLL_MS || 100);

export function getRuntimeDir() {
  return process.env.SLK_RUNTIME_DIR || path.join(os.homedir(), '.local', 'slack-personal-cli', 'runtime');
}

function getStatePath(runtimeDir = getRuntimeDir()) {
  return path.join(runtimeDir, 'rate-limit-state.json');
}

function getLockDir(runtimeDir = getRuntimeDir()) {
  return path.join(runtimeDir, 'rate-limit-lock');
}

function ensureRuntimeDir(runtimeDir = getRuntimeDir()) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  return runtimeDir;
}

export function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readRateLimitState({ runtimeDir = getRuntimeDir() } = {}) {
  const statePath = getStatePath(runtimeDir);
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      nextAllowedAt: Number(parsed.nextAllowedAt || 0),
      last429At: Number(parsed.last429At || 0),
      lastDelayMs: Number(parsed.lastDelayMs || 0),
      updatedBy: parsed.updatedBy ?? null,
    };
  } catch {
    return {
      nextAllowedAt: 0,
      last429At: 0,
      lastDelayMs: 0,
      updatedBy: null,
    };
  }
}

export function writeRateLimitState(state, { runtimeDir = getRuntimeDir() } = {}) {
  ensureRuntimeDir(runtimeDir);
  const statePath = getStatePath(runtimeDir);
  const normalized = {
    nextAllowedAt: Number(state.nextAllowedAt || 0),
    last429At: Number(state.last429At || 0),
    lastDelayMs: Number(state.lastDelayMs || 0),
    updatedBy: state.updatedBy ?? process.pid,
  };
  fs.writeFileSync(statePath, JSON.stringify(normalized, null, 2));
  return normalized;
}

function tryBreakStaleLock(lockDir, staleMs) {
  try {
    const stat = fs.statSync(lockDir);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > staleMs) {
      fs.rmSync(lockDir, { recursive: true, force: true });
      return true;
    }
  } catch {}
  return false;
}

async function acquireLock({ runtimeDir = getRuntimeDir(), staleMs = DEFAULT_LOCK_STALE_MS, lockPollMs = DEFAULT_LOCK_POLL_MS } = {}) {
  ensureRuntimeDir(runtimeDir);
  const lockDir = getLockDir(runtimeDir);

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }));
      return lockDir;
    } catch (/** @type {any} */ error) {
      if (error?.code !== 'EEXIST') throw error;
      if (!tryBreakStaleLock(lockDir, staleMs)) {
        await sleep(lockPollMs);
      }
    }
  }
}

function releaseLock(lockDir) {
  fs.rmSync(lockDir, { recursive: true, force: true });
}

export function reserveRateLimitSlot({ runtimeDir = getRuntimeDir(), now = Date.now(), minIntervalMs = DEFAULT_MIN_INTERVAL_MS } = {}) {
  const state = readRateLimitState({ runtimeDir });
  const waitMs = Math.max(0, state.nextAllowedAt - now);
  const baseTime = Math.max(now, state.nextAllowedAt);
  const nextAllowedAt = baseTime + minIntervalMs;
  const nextState = writeRateLimitState(
    {
      ...state,
      nextAllowedAt,
      updatedBy: process.pid,
    },
    { runtimeDir }
  );
  return { waitMs, nextAllowedAt, state: nextState };
}

export function applySharedCooldown(delayMs, { runtimeDir = getRuntimeDir(), now = Date.now() } = {}) {
  const state = readRateLimitState({ runtimeDir });
  const nextAllowedAt = Math.max(state.nextAllowedAt, now + Math.max(0, delayMs));
  return writeRateLimitState(
    {
      ...state,
      nextAllowedAt,
      last429At: now,
      lastDelayMs: Math.max(0, delayMs),
      updatedBy: process.pid,
    },
    { runtimeDir }
  );
}

export async function withRateLimitSlot(fn, { runtimeDir = getRuntimeDir(), minIntervalMs = DEFAULT_MIN_INTERVAL_MS, staleMs = DEFAULT_LOCK_STALE_MS, lockPollMs = DEFAULT_LOCK_POLL_MS } = {}) {
  const lockDir = await acquireLock({ runtimeDir, staleMs, lockPollMs });
  try {
    const reservation = reserveRateLimitSlot({ runtimeDir, now: Date.now(), minIntervalMs });
    if (reservation.waitMs > 0) {
      await sleep(reservation.waitMs);
    }
    return await fn({ reservation });
  } finally {
    releaseLock(lockDir);
  }
}
