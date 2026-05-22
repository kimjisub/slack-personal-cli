/**
 * Slack API wrapper — handles auth, rate limiting, retries, and pagination.
 */

import { getCredentials as getCredentialsFromAuth, refresh as refreshFromAuth } from "./auth.js";
import { applySharedCooldown, sleep, withRateLimitSlot } from "./rate_limit.js";

const BASE = "https://slack.com/api";
const MAX_429_RETRIES = Number(process.env.SLK_MAX_429_RETRIES || 2);
const MIN_REQUEST_INTERVAL_MS = Number(process.env.SLK_MIN_REQUEST_INTERVAL_MS || 1200);
const DEBUG_RATE_LIMIT = process.env.SLK_DEBUG_RATE_LIMIT === '1';

function getAuthFns() {
  const hooks = globalThis.__SLK_TEST_HOOKS__;
  return {
    getCredentials: hooks?.getCredentials || getCredentialsFromAuth,
    refresh: hooks?.refresh || refreshFromAuth,
  };
}

function buildRequest(method, params, token, cookie) {
  const url = new URL(`${BASE}/${method}`);

  const writeMethods = [
    "chat.postMessage",
    "chat.update",
    "chat.delete",
    "reactions.add",
    "reactions.remove",
    "files.upload",
    "drafts.create",
    "drafts.delete",
    "drafts.update",
    "conversations.open",
    "client.counts",
    "users.prefs.get",
    "saved.list",
  ];

  const isWrite = writeMethods.some((m) => method.startsWith(m));

  if (isWrite) {
    return {
      url,
      options: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: `d=${cookie}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(params),
      },
    };
  }

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  return {
    url,
    options: {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `d=${cookie}`,
      },
    },
  };
}

function getRetryAfterMs(res) {
  const raw = res.headers?.get?.('retry-after');
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return MIN_REQUEST_INTERVAL_MS;
  }
  return Math.ceil(seconds * 1000);
}

/**
 * Make an authenticated Slack API call.
 * Auto-refreshes credentials on invalid_auth (once).
 * Coordinates requests across processes to avoid overwhelming Slack.
 */
export async function slackApi(method, params = {}) {
  return withRateLimitSlot(async () => {
    const { getCredentials, refresh } = getAuthFns();
    let authRetried = false;
    let rateLimitRetries = 0;

    while (true) {
      const { token, cookie } = getCredentials();
      const { url, options } = buildRequest(method, params, token, cookie);
      const res = await fetch(url, options);

      if (res.status === 429) {
        const delayMs = getRetryAfterMs(res);
        applySharedCooldown(delayMs);
        if (DEBUG_RATE_LIMIT) {
          console.error(`[slk rate-limit] 429 on ${method}; retrying after ${delayMs}ms`);
        }
        if (rateLimitRetries >= MAX_429_RETRIES) {
          return { ok: false, error: 'rate_limited', retry_after_ms: delayMs };
        }
        rateLimitRetries += 1;
        await sleep(delayMs);
        continue;
      }

      const data = await res.json();

      if (!data.ok && data.error === "invalid_auth" && !authRetried) {
        authRetried = true;
        refresh();
        continue;
      }

      return data;
    }
  }, { minIntervalMs: MIN_REQUEST_INTERVAL_MS });
}

/**
 * Paginate through a Slack API method using cursor-based pagination.
 */
export async function slackPaginate(method, params = {}, key = "channels") {
  const results = [];
  let cursor;

  do {
    const data = await slackApi(method, { ...params, cursor, limit: params.limit || 200 });
    if (!data.ok) return data; // return error as-is

    if (data[key]) results.push(...data[key]);
    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  return { ok: true, [key]: results };
}
