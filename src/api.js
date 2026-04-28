/**
 * Slack API wrapper — handles auth, retries on invalid_auth, rate protection, cache, and pagination.
 */

import { getRuntimeConfig } from "./config.js";
import { executeSlackRequest } from "./runtime.js";

const POST_METHODS = new Set([
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
  "subscriptions.thread.getView",
]);

const WRITE_METHODS = new Set([
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
]);

const MUTATING_METHODS = new Set([
  "chat.postMessage",
  "chat.update",
  "chat.delete",
  "reactions.add",
  "reactions.remove",
  "files.upload",
  "drafts.create",
  "drafts.delete",
  "drafts.update",
]);

const CACHE_TTLS = {
  "auth.test": 10_000,
  "users.list": 600_000,
  "conversations.list": 300_000,
  "users.prefs.get": 120_000,
  "client.counts": 15_000,
  "conversations.history": 20_000,
  "conversations.replies": 20_000,
  "conversations.info": 300_000,
  "search.messages": 30_000,
  "saved.list": 20_000,
  "pins.list": 30_000,
  "chat.getPermalink": 300_000,
  "subscriptions.thread.getView": 20_000,
  "drafts.list": 15_000,
};

function matchesMethod(method, set) {
  return [...set].some((candidate) => method.startsWith(candidate));
}

function getCachePolicy(method) {
  return { ttlMs: CACHE_TTLS[method] ?? 0 };
}

export async function slackApi(method, params = {}) {
  return executeSlackRequest({
    method,
    params,
    isWrite: matchesMethod(method, WRITE_METHODS),
    isMutation: matchesMethod(method, MUTATING_METHODS),
    isPost: matchesMethod(method, POST_METHODS),
    cachePolicy: getCachePolicy(method),
    config: getRuntimeConfig(),
  });
}

/**
 * Paginate through a Slack API method using cursor-based pagination.
 */
export async function slackPaginate(method, params = {}, key = "channels") {
  const results = [];
  let cursor;

  do {
    const data = await slackApi(method, { ...params, cursor, limit: params.limit || 200 });
    if (!data.ok) return data;

    if (data[key]) results.push(...data[key]);
    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  return { ok: true, [key]: results };
}
