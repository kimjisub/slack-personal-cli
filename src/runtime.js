import { homedir } from "os";
import { join } from "path";

import { readCache, writeCache, buildCacheKey, invalidateByPrefixes } from "./cache.js";
import { withProcessLock } from "./lock.js";
import { loadRateState, mark429, markRequestStarted, markSuccess, waitForTurn } from "./rate-limit.js";
import { getCredentials, refresh } from "./auth.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getStateRootDir(config) {
  return config.stateRootDir || join(homedir(), ".local", "slk");
}

function getCacheRootDir(config) {
  return join(getStateRootDir(config), "cache");
}

function getLockRootDir(config) {
  return join(getStateRootDir(config), "locks");
}

function getRateRootDir(config) {
  return join(getStateRootDir(config), "runtime");
}

function buildUrl(method, params, isPost) {
  const url = new URL(`https://slack.com/api/${method}`);
  if (!isPost) {
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url;
}

function buildFetchOptions({ token, cookie, params, isPost }) {
  if (isPost) {
    return {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `d=${cookie}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(params),
    };
  }

  return {
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: `d=${cookie}`,
    },
  };
}

function getInvalidationPrefixes(teamId, method) {
  const scoped = (name) => ({ teamId, method: name });

  if (["chat.postMessage", "chat.update", "chat.delete"].includes(method)) {
    return [
      scoped("conversations.history"),
      scoped("conversations.replies"),
      scoped("client.counts"),
    ];
  }

  if (["reactions.add", "reactions.remove"].includes(method)) {
    return [scoped("conversations.history"), scoped("conversations.replies")];
  }

  if (method === "conversations.open") {
    return [scoped("conversations.list")];
  }

  if (method.startsWith("drafts.")) {
    return [scoped("drafts.list")];
  }

  return [];
}

function getRetryAfterSeconds(response) {
  const raw = response.headers?.get?.("retry-after");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 1;
}

export async function executeSlackRequest({
  method,
  params = {},
  isWrite,
  isMutation = isWrite,
  isPost = false,
  cachePolicy = { ttlMs: 0 },
  fetchImpl = fetch,
  getCredentials: getCredentialsImpl = getCredentials,
  refreshCredentials: refreshCredentialsImpl = refresh,
  config,
}) {
  if (config.readOnly && isMutation) {
    throw new Error(`Cannot call ${method} in read-only mode.`);
  }

  let credentials = getCredentialsImpl();
  let teamId = credentials.teamId || "default";
  const cacheRootDir = getCacheRootDir(config);
  const lockRootDir = getLockRootDir(config);
  const rateRootDir = getRateRootDir(config);
  let descriptor = buildCacheKey({ teamId, method, params });
  const ttlMs = cachePolicy?.ttlMs ?? 0;
  const canUseCache = !isWrite && config.cacheEnabled && !config.cacheRefresh && ttlMs > 0;

  if (canUseCache) {
    const cached = await readCache(cacheRootDir, descriptor, ttlMs);
    if (cached.hit) {
      if (config.cacheDebug) console.error(`cache hit: ${method} key=${descriptor.key}`);
      return cached.payload;
    }
    if (config.cacheDebug) console.error(`cache miss: ${method} key=${descriptor.key}`);
  }

  let authRetried = false;
  let attempt = 0;

  while (true) {
    const outcome = await withProcessLock(
      "api",
      {
        rootDir: lockRootDir,
        timeoutMs: config.lockTimeoutMs,
        staleMs: config.staleLockMs,
        pollMs: 10,
        onWait: config.queueDebug
          ? ({ lockName, waitedMs }) => console.error(`queue wait: ${waitedMs}ms for ${lockName}`)
          : undefined,
      },
      async () => {
        if (canUseCache) {
          const cached = await readCache(cacheRootDir, descriptor, ttlMs);
          if (cached.hit) {
            if (config.cacheDebug) console.error(`cache hit(after-lock): ${method} key=${descriptor.key}`);
            return { type: "result", data: cached.payload };
          }
        }

        const waitedMs = await waitForTurn({ rootDir: rateRootDir, minRequestGapMs: config.minRequestGapMs });
        if (config.queueDebug && waitedMs > 0) {
          console.error(`rate wait: sleeping ${waitedMs}ms before ${method}`);
        }
        await markRequestStarted({ rootDir: rateRootDir, now: Date.now() });

        const url = buildUrl(method, params, isPost);
        let response;
        try {
          response = await fetchImpl(url, buildFetchOptions({ ...credentials, params, isPost }));
        } catch (error) {
          if (attempt >= config.maxRetries) {
            throw new Error(`Network error calling ${method}: ${error.message}`);
          }
          const retryAfterSeconds = Math.max(0.01, (2 ** attempt) / 10);
          await mark429({
            rootDir: rateRootDir,
            retryAfterSeconds,
            jitterMs: config.retryJitterMs,
            now: Date.now(),
          });
          const state = await loadRateState(rateRootDir);
          return { type: "retry", delayMs: state.retryAfterMs, reason: "network" };
        }

        if (response.status === 429) {
          if (attempt >= config.maxRetries) {
            return { type: "result", data: { ok: false, error: "ratelimited" } };
          }
          const retryAfterSeconds = getRetryAfterSeconds(response);
          await mark429({
            rootDir: rateRootDir,
            retryAfterSeconds,
            jitterMs: config.retryJitterMs,
            now: Date.now(),
          });
          const state = await loadRateState(rateRootDir);
          if (config.queueDebug) {
            console.error(`429 received: retrying in ${state.retryAfterMs}ms for ${method}`);
          }
          return { type: "retry", delayMs: state.retryAfterMs, reason: "429" };
        }

        if (response.status >= 500) {
          if (attempt < config.maxRetries) {
            const retryAfterSeconds = Math.max(0.01, (2 ** attempt) / 10);
            await mark429({
              rootDir: rateRootDir,
              retryAfterSeconds,
              jitterMs: config.retryJitterMs,
              now: Date.now(),
            });
            const state = await loadRateState(rateRootDir);
            return { type: "retry", delayMs: state.retryAfterMs, reason: "5xx" };
          }

          try {
            const data = await response.json();
            return { type: "result", data };
          } catch {
            return { type: "result", data: { ok: false, error: `http_${response.status}` } };
          }
        }

        let data;
        try {
          data = await response.json();
        } catch (error) {
          throw new Error(`Failed to parse Slack response for ${method}: ${error.message}`);
        }

        if (!data.ok && data.error === "invalid_auth" && !authRetried) {
          credentials = refreshCredentialsImpl();
          teamId = credentials.teamId || teamId;
          descriptor = buildCacheKey({ teamId, method, params });
          authRetried = true;
          return { type: "retry", delayMs: 0, reason: "invalid_auth" };
        }

        await markSuccess({ rootDir: rateRootDir, now: Date.now() });

        if (!isWrite && config.cacheEnabled && ttlMs > 0 && data.ok) {
          await writeCache(cacheRootDir, descriptor, data, { ttlMs });
        }

        if (isWrite && data.ok) {
          await invalidateByPrefixes(cacheRootDir, getInvalidationPrefixes(teamId, method));
        }

        return { type: "result", data };
      }
    );

    if (outcome.type === "result") {
      return outcome.data;
    }

    attempt += 1;
    if (outcome.delayMs > 0) {
      await sleep(outcome.delayMs);
    }
  }
}
