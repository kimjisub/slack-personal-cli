/**
 * CLI command implementations.
 */

import { slackApi as defaultSlackApi, slackPaginate as defaultSlackPaginate } from "./api.js";
import { listWorkspaces, getActiveWorkspace, setActiveWorkspace } from "./auth.js";
import { clearLocalState } from "./state.js";

export function createCommandContext(overrides = {}) {
  return {
    slackApi: overrides.slackApi || defaultSlackApi,
    slackPaginate: overrides.slackPaginate || defaultSlackPaginate,
    userMapCache: overrides.userMapCache || null,
    usersListCache: overrides.usersListCache || null,
    channelMapCache: overrides.channelMapCache || null,
    channelsListCache: overrides.channelsListCache || null,
  };
}

async function getUsersList(context) {
  if (context.usersListCache) return context.usersListCache;
  const data = await context.slackPaginate("users.list", {}, "members");
  if (!data.ok) return [];
  context.usersListCache = data.members || [];
  return context.usersListCache;
}

async function getUsersMap(context) {
  if (context.userMapCache) return context.userMapCache;
  const users = await getUsersList(context);
  context.userMapCache = {};
  for (const user of users) {
    context.userMapCache[user.id] = user.real_name || user.profile?.display_name || user.name;
  }
  return context.userMapCache;
}

function userName(users, id) {
  return users[id] || id;
}

async function getChannelsList(context) {
  if (context.channelsListCache) return context.channelsListCache;
  const data = await context.slackPaginate("conversations.list", {
    types: "public_channel,private_channel,mpim,im",
    exclude_archived: true,
  });
  if (!data.ok) return [];
  context.channelsListCache = data.channels || [];
  return context.channelsListCache;
}

async function getChannelsMap(context) {
  if (context.channelMapCache) return context.channelMapCache;
  const channels = await getChannelsList(context);
  const users = await getUsersMap(context);
  context.channelMapCache = {};
  for (const channel of channels) {
    context.channelMapCache[channel.id] = channel.name || (channel.user ? `DM:${userName(users, channel.user)}` : channel.id);
  }
  return context.channelMapCache;
}

async function resolveUserByName(username, context) {
  const normalized = username.replace(/^@/, "").toLowerCase();
  const users = await getUsersList(context);
  return users.find(
    (user) =>
      user.name?.toLowerCase() === normalized ||
      user.real_name?.toLowerCase() === normalized ||
      user.profile?.display_name?.toLowerCase() === normalized
  );
}

export async function resolveChannel(nameOrId, context = createCommandContext()) {
  if (nameOrId.startsWith("C") || nameOrId.startsWith("D") || nameOrId.startsWith("G")) {
    return nameOrId;
  }

  if (nameOrId.startsWith("U")) {
    const dm = await context.slackApi("conversations.open", { users: nameOrId });
    if (!dm.ok) throw new Error(`Failed to open DM with ${nameOrId}: ${dm.error}`);
    return dm.channel.id;
  }

  if (nameOrId.startsWith("@") || !nameOrId.includes("#")) {
    const user = await resolveUserByName(nameOrId, context);
    if (user) {
      const dm = await context.slackApi("conversations.open", { users: user.id });
      if (dm.ok) return dm.channel.id;
    }
  }

  const name = nameOrId.replace(/^#/, "");
  const channels = await getChannelsList(context);
  const channel = channels.find((candidate) => candidate.name === name || candidate.name_normalized === name);
  if (!channel) throw new Error(`Channel not found: ${nameOrId}`);
  return channel.id;
}

function formatTs(ts) {
  return new Date(parseFloat(ts) * 1000).toLocaleString();
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function truncate(text, max = 140) {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function pickSummaryFields(value, summaryFields) {
  if (!summaryFields?.length) return value;
  const picked = {};
  for (const field of summaryFields) {
    if (Object.prototype.hasOwnProperty.call(value, field)) picked[field] = value[field];
  }
  return picked;
}

function withSummaryFields(payload, summaryFields) {
  if (!summaryFields?.length) return payload;
  return {
    ...payload,
    items: Array.isArray(payload.items) ? payload.items.map((item) => pickSummaryFields(item, summaryFields)) : payload.items,
  };
}

async function getSelfUser(context) {
  const data = await context.slackApi("auth.test");
  if (!data.ok) {
    console.error(`❌ Auth failed: ${data.error}`);
    process.exit(1);
  }
  return data;
}

function buildMentionsQuery(userId, { from = null, to = null, user = null, channel = null } = {}) {
  const parts = [`"<@${userId}>"`];
  if (from) parts.push(`after:${from}`);
  if (to) parts.push(`before:${to}`);
  if (user) parts.push(`from:@${user.replace(/^@/, "")}`);
  if (channel) parts.push(`in:${channel.replace(/^#/, "")}`);
  return parts.join(" ");
}

function normalizeReplyMessage(msg, users) {
  return {
    ts: msg.ts,
    time: formatTs(msg.ts),
    text: msg.text || "",
    user: {
      id: msg.user,
      name: userName(users, msg.user),
    },
    files: (msg.files || []).map((file) => ({ name: file.name, mimetype: file.mimetype })),
  };
}

function normalizeHistoryMessage(msg, users) {
  return {
    ts: msg.ts,
    time: formatTs(msg.ts),
    text: msg.text || "",
    user: {
      id: msg.user,
      name: userName(users, msg.user),
    },
    replyCount: msg.reply_count || 0,
    files: (msg.files || []).map((file) => ({ name: file.name, mimetype: file.mimetype })),
  };
}

function normalizeSearchMatch(msg, users) {
  return {
    ts: msg.ts,
    time: formatTs(msg.ts),
    text: msg.text || "",
    permalink: msg.permalink || null,
    user: {
      id: msg.user,
      name: userName(users, msg.user),
    },
    channel: {
      id: msg.channel?.id || null,
      name: msg.channel?.name || msg.channel?.id || null,
    },
  };
}

async function fetchThreadReplies(channel, ts, context, users) {
  const replies = await context.slackApi("conversations.replies", { channel, ts, limit: 100 });
  if (!replies.ok || !replies.messages?.length) return [];
  return replies.messages.slice(1).map((reply) => normalizeReplyMessage(reply, users));
}

async function fetchReadData(channelRef, count = 20, options = {}) {
  const context = options.context || createCommandContext();
  const { oldest = null, latest = null, sinceTs = null, expandThreads = false, cursor = null } = options;
  const channel = await resolveChannel(channelRef, context);
  const users = await getUsersMap(context);
  const params = { channel, limit: count };
  if (oldest || sinceTs) params.oldest = oldest || sinceTs;
  if (latest) params.latest = latest;
  if (cursor) params.cursor = cursor;

  const data = await context.slackApi("conversations.history", params);
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  const messages = [];
  for (const msg of data.messages.reverse()) {
    const normalized = normalizeHistoryMessage(msg, users);
    if (expandThreads && msg.reply_count > 0) {
      normalized.thread = {
        replies: await fetchThreadReplies(channel, msg.ts, context, users),
      };
    }
    messages.push(normalized);
  }

  return {
    channel: {
      id: channel,
      name: channelRef.replace(/^#/, ""),
    },
    paging: {
      hasMore: Boolean(data.has_more),
      nextCursor: data.response_metadata?.next_cursor || null,
    },
    messages,
  };
}

async function fetchMentionsData({ count = 20, from = null, to = null, user = null, channel = null, kind = null, context = createCommandContext() } = {}) {
  const authData = await getSelfUser(context);
  const query = buildMentionsQuery(authData.user_id, { from, to, user, channel });
  const data = await context.slackApi("search.messages", { query, count });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  const users = await getUsersMap(context);
  let items = (data.messages?.matches || []).map((msg) => normalizeSearchMatch(msg, users));
  if (kind) {
    items = items.filter((item) => {
      if (kind === "channel") return item.channel?.id?.startsWith("C");
      if (kind === "dm") return item.channel?.id?.startsWith("D");
      if (kind === "group") return item.channel?.id?.startsWith("G");
      return true;
    });
  }
  return {
    userId: authData.user_id,
    query,
    total: data.messages?.total || 0,
    items,
  };
}

async function collectSavedItems({ count = 20, includeCompleted = false, context = createCommandContext() } = {}) {
  const users = await getUsersMap(context);
  const chMap = await getChannelsMap(context);
  const data = await context.slackApi("saved.list", { count });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  const items = [];
  for (const item of data.saved_items || []) {
    if (!includeCompleted && item.state === "completed") continue;

    let message = null;
    try {
      const msgData = await context.slackApi("conversations.history", {
        channel: item.item_id,
        latest: item.ts,
        inclusive: true,
        limit: 1,
      });
      if (msgData.ok && msgData.messages?.[0]) {
        const msg = msgData.messages[0];
        message = {
          ts: msg.ts,
          time: formatTs(msg.ts),
          text: msg.text || "",
          user: {
            id: msg.user,
            name: userName(users, msg.user),
          },
          files: (msg.files || []).map((file) => ({ name: file.name, mimetype: file.mimetype })),
        };
      }
    } catch {
      message = null;
    }

    items.push({
      channel: {
        id: item.item_id,
        name: chMap[item.item_id] || item.item_id,
      },
      ts: item.ts,
      savedAt: formatTs(item.date_created),
      state: item.state,
      message,
    });
  }

  return {
    counts: {
      active: data.counts?.uncompleted_count || 0,
      completed: data.counts?.completed_count || 0,
    },
    items,
  };
}

export async function auth() {
  const data = await defaultSlackApi("auth.test");
  if (!data.ok) {
    console.error(`❌ Auth failed: ${data.error}`);
    process.exit(1);
  }

  console.log(`✅ Authenticated as ${data.user} @ ${data.team}`);
  console.log(`   Team ID: ${data.team_id}`);
  console.log(`   User ID: ${data.user_id}`);
  console.log(`   URL: ${data.url}`);
}

export async function channels() {
  const context = createCommandContext();
  const data = await context.slackPaginate("conversations.list", {
    types: "public_channel,private_channel",
    exclude_archived: true,
  });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  for (const channel of data.channels) {
    const prefix = channel.is_private ? "🔒" : "#";
    console.log(`${prefix} ${channel.name}  (${channel.num_members || 0} members, id: ${channel.id})`);
  }
}

export async function dms() {
  const context = createCommandContext();
  const users = await getUsersMap(context);
  const data = await context.slackPaginate("conversations.list", {
    types: "im",
    exclude_archived: true,
  });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  for (const channel of data.channels) {
    console.log(`💬 ${userName(users, channel.user)}  (${channel.id})`);
  }
}

export async function read(channelRef, count = 20, options = {}) {
  const { showTs = false, json = false } = options;
  const result = await fetchReadData(channelRef, count, options);

  if (json) {
    printJson(result);
    return result;
  }

  for (const msg of result.messages) {
    const tsStr = showTs ? ` ts:${msg.ts}` : "";
    const thread = msg.replyCount ? ` [${msg.replyCount} replies]` : "";
    console.log(`[${msg.time}${tsStr}] ${msg.user.name}${thread}:`);
    console.log(`  ${msg.text}`);
    if (msg.files?.length) {
      for (const file of msg.files) console.log(`  📎 ${file.name} (${file.mimetype})`);
    }

    if (msg.thread?.replies?.length) {
      for (const reply of msg.thread.replies) {
        const replyTs = showTs ? ` ts:${reply.ts}` : "";
        console.log(`    ↳ [${reply.time}${replyTs}] ${reply.user.name}:`);
        console.log(`      ${reply.text}`);
        if (reply.files?.length) {
          for (const file of reply.files) console.log(`      📎 ${file.name} (${file.mimetype})`);
        }
      }
    }
    console.log();
  }
  return result;
}

export async function send(channelRef, text) {
  const context = createCommandContext();
  const channel = await resolveChannel(channelRef, context);
  const data = await context.slackApi("chat.postMessage", { channel, text });
  if (!data.ok) {
    console.error(`❌ Failed: ${data.error}`);
    process.exit(1);
  }
  console.log(`✅ Sent to ${channelRef} (ts: ${data.ts})`);
}

export async function search(query, count = 20, options = {}) {
  const context = options.context || createCommandContext();
  const params = { query, count };
  if (options.page) params.page = options.page;
  const data = await context.slackApi("search.messages", params);
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  const users = await getUsersMap(context);
  const items = (data.messages?.matches || []).map((msg) => normalizeSearchMatch(msg, users));
  let payload = {
    query,
    total: data.messages?.total || 0,
    paging: {
      page: data.messages?.paging?.page || options.page || 1,
      pages: data.messages?.paging?.pages || null,
      perPage: data.messages?.paging?.per_page || count,
    },
    items,
  };
  payload = withSummaryFields(payload, options.summaryFields);

  if (options.json) {
    printJson(payload);
    return payload;
  }

  console.log(`Found ${payload.total} results\n`);
  for (const item of items) {
    console.log(`[${item.time}] #${item.channel.name || item.channel.id || "?"} — ${item.user.name}:`);
    console.log(`  ${item.text}`);
    console.log();
  }
  return payload;
}

export async function mentions({ count = 20, from = null, to = null, user = null, channel = null, kind = null, json = false, summaryFields = null, context = createCommandContext() } = {}) {
  let result = await fetchMentionsData({ count, from, to, user, channel, kind, context });
  result = withSummaryFields(result, summaryFields);
  if (json) {
    printJson(result);
    return result;
  }

  console.log(`📣 Mentions — ${result.total} results\n`);
  if (!result.items.length) {
    console.log("No mentions found.");
    return result;
  }

  for (const item of result.items) {
    console.log(`[${item.time}] #${item.channel.name || item.channel.id} — ${item.user.name}:`);
    console.log(`  ${item.text}`);
    if (item.permalink) console.log(`  🔗 ${item.permalink}`);
    console.log();
  }
  return result;
}

export async function permalink(channelRef, ts, { json = false, context = createCommandContext() } = {}) {
  const channel = await resolveChannel(channelRef, context);
  const data = await context.slackApi("chat.getPermalink", { channel, message_ts: ts });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  const payload = { channel, ts, permalink: data.permalink };
  if (json) {
    printJson(payload);
    return;
  }
  console.log(data.permalink);
}

export async function inbox({ count = 20, from = null, to = null, user = null, channel = null, kind = null, json = false, summaryFields = null, context = createCommandContext() } = {}) {
  const [mentionsData, counts, mutedSet, savedData] = await Promise.all([
    fetchMentionsData({ count, from, to, user, channel, kind, context }),
    context.slackApi("client.counts", {}),
    getMutedChannels(context),
    collectSavedItems({ count, includeCompleted: false, context }),
  ]);

  if (!counts.ok) {
    console.error(`Error: ${counts.error}`);
    process.exit(1);
  }

  const chMap = await getChannelsMap(context);
  const unreadItems = [
    ...(counts.channels || []).map((item) => ({ ...item, kind: "channel" })),
    ...(counts.mpims || []).map((item) => ({ ...item, kind: "group" })),
    ...(counts.ims || []).map((item) => ({ ...item, kind: "dm" })),
  ]
    .filter((item) => (item.has_unreads || item.mention_count > 0) && !mutedSet.has(item.id))
    .map((item) => ({
      type: "unread",
      priority: item.mention_count > 0 ? 80 : 60,
      channel: {
        id: item.id,
        name: chMap[item.id] || item.id,
        kind: item.kind,
      },
      mentionCount: item.mention_count || 0,
      hasUnreads: Boolean(item.has_unreads),
    }));

  const mentionItems = mentionsData.items.map((item) => ({
    type: "mention",
    priority: 100,
    ...item,
  }));

  const threadItem = counts.threads?.has_unreads || counts.threads?.mention_count > 0
    ? [{
        type: "threads",
        priority: 70,
        hasUnreads: Boolean(counts.threads?.has_unreads),
        mentionCount: counts.threads?.mention_count || 0,
      }]
    : [];

  const savedItems = savedData.items.map((item) => ({
    type: "saved",
    priority: 40,
    ...item,
  }));

  const items = [...mentionItems, ...unreadItems, ...threadItem, ...savedItems].sort((a, b) => b.priority - a.priority);
  let payload = {
    mentions: mentionsData,
    unreads: unreadItems,
    threads: threadItem[0] || null,
    saved: savedData,
    items,
  };
  payload = withSummaryFields(payload, summaryFields);

  if (json) {
    printJson(payload);
    return payload;
  }

  console.log(`📥 Inbox — ${items.length} items\n`);
  if (!items.length) {
    console.log("Inbox clear! 🎉");
    return payload;
  }

  for (const item of items) {
    if (item.type === "mention") {
      console.log(`[MENTION] #${item.channel.name || item.channel.id} — ${item.user.name}: ${truncate(item.text)}`);
      continue;
    }
    if (item.type === "unread") {
      const prefix = item.channel.kind === "dm" ? item.channel.name : `#${item.channel.name}`;
      const details = [];
      if (item.hasUnreads) details.push("unread");
      if (item.mentionCount > 0) details.push(`${item.mentionCount} mentions`);
      console.log(`[UNREAD] ${prefix} — ${details.join(", ")}`);
      continue;
    }
    if (item.type === "threads") {
      console.log(`[THREADS] unread thread activity — ${item.mentionCount} mentions`);
      continue;
    }
    if (item.type === "saved") {
      const text = item.message?.text ? truncate(item.message.text) : "message unavailable";
      console.log(`[SAVED] #${item.channel.name} — ${text}`);
    }
  }
  return payload;
}

export async function threadUnread({ limit = 20, json = false, summaryFields = null, cursor = null, context = createCommandContext() } = {}) {
  const params = { limit, fetch_threads_state: true };
  if (cursor) params.max_ts = cursor;
  const data = await context.slackApi("subscriptions.thread.getView", params);
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  const users = await getUsersMap(context);
  const chMap = await getChannelsMap(context);
  const items = await Promise.all((data.threads || []).map(async (thread) => {
    const root = thread.root_msg || {};
    const channelId = root.channel;
    const threadTs = root.thread_ts || root.ts;
    const permalinkData = channelId && threadTs
      ? await context.slackApi("chat.getPermalink", { channel: channelId, message_ts: threadTs })
      : { ok: false };

    return {
      channel: {
        id: channelId,
        name: chMap[channelId] || channelId,
      },
      threadTs,
      rootMessage: {
        ts: root.ts,
        time: root.ts ? formatTs(root.ts) : null,
        text: root.text || "",
        user: {
          id: root.user,
          name: userName(users, root.user),
        },
        replyCount: root.reply_count || 0,
        lastRead: root.last_read || null,
        latestReply: root.latest_reply || null,
        subscribed: Boolean(root.subscribed),
      },
      unreadReplies: (thread.unread_replies || []).map((reply) => normalizeReplyMessage(reply, users)),
      latestReplies: (thread.latest_replies || []).map((reply) => normalizeReplyMessage(reply, users)),
      permalink: permalinkData.ok ? permalinkData.permalink : null,
    };
  }));

  let payload = {
    totalUnreadReplies: data.total_unread_replies || 0,
    newThreadsCount: data.new_threads_count || 0,
    paging: {
      hasMore: Boolean(data.has_more),
      nextCursor: data.max_ts || null,
    },
    items,
  };
  payload = withSummaryFields(payload, summaryFields);

  if (json) {
    printJson(payload);
    return payload;
  }

  console.log(`🧵 Thread Inbox — ${payload.totalUnreadReplies} unread replies across ${items.length} threads\n`);
  if (!items.length) {
    console.log("No unread threads.");
    return payload;
  }

  for (const item of items) {
    console.log(`#${item.channel.name} — ${item.rootMessage.user.name}: ${truncate(item.rootMessage.text)}`);
    if (item.unreadReplies.length > 0) {
      const latest = item.unreadReplies.at(-1);
      console.log(`  ${item.unreadReplies.length} unread replies; latest by ${latest.user.name}: ${truncate(latest.text)}`);
    }
    if (item.permalink) console.log(`  🔗 ${item.permalink}`);
    console.log();
  }
  return payload;
}

export async function contextSummary(channelRef, { messageCount = 20, json = false, context = createCommandContext() } = {}) {
  const channel = await resolveChannel(channelRef, context);
  const users = await getUsersMap(context);
  const [info, pinsData, historyData] = await Promise.all([
    context.slackApi("conversations.info", { channel }),
    context.slackApi("pins.list", { channel }),
    context.slackApi("conversations.history", { channel, limit: messageCount }),
  ]);

  if (!info.ok) {
    console.error(`Error: ${info.error}`);
    process.exit(1);
  }
  if (!pinsData.ok) {
    console.error(`Error: ${pinsData.error}`);
    process.exit(1);
  }
  if (!historyData.ok) {
    console.error(`Error: ${historyData.error}`);
    process.exit(1);
  }

  const channelInfo = info.channel || {};
  const recentMessages = (historyData.messages || []).reverse().map((msg) => normalizeHistoryMessage(msg, users));
  const participantCounts = new Map();
  for (const msg of recentMessages) {
    const existing = participantCounts.get(msg.user.id) || { user: msg.user, messageCount: 0 };
    existing.messageCount += 1;
    participantCounts.set(msg.user.id, existing);
  }
  const topParticipants = [...participantCounts.values()].sort((a, b) => b.messageCount - a.messageCount).slice(0, 5);

  const payload = {
    channel: {
      id: channel,
      name: channelInfo.name || channelRef.replace(/^#/, ""),
      isPrivate: Boolean(channelInfo.is_private),
      memberCount: channelInfo.num_members || 0,
      topic: channelInfo.topic?.value || "",
      purpose: channelInfo.purpose?.value || "",
      creator: {
        id: channelInfo.creator || null,
        name: userName(users, channelInfo.creator),
      },
    },
    activity: {
      messageCount: recentMessages.length,
      threadedMessageCount: recentMessages.filter((msg) => msg.replyCount > 0).length,
      latestMessageTs: recentMessages.at(-1)?.ts || null,
      latestMessageTime: recentMessages.at(-1)?.time || null,
    },
    topParticipants,
    pins: (pinsData.items || []).map((item) => ({
      ts: item.message?.ts || null,
      time: item.message?.ts ? formatTs(item.message.ts) : null,
      text: item.message?.text || "",
      user: {
        id: item.message?.user || null,
        name: userName(users, item.message?.user),
      },
    })),
    recentMessages,
  };

  if (json) {
    printJson(payload);
    return payload;
  }

  console.log(`#${payload.channel.name} — ${payload.channel.memberCount} members${payload.channel.isPrivate ? ", private" : ""}`);
  if (payload.channel.topic) console.log(`Topic: ${payload.channel.topic}`);
  if (payload.channel.purpose) console.log(`Purpose: ${payload.channel.purpose}`);
  console.log(`Pins: ${payload.pins.length}`);
  if (payload.topParticipants.length) console.log(`Top participants: ${payload.topParticipants.map((entry) => `${entry.user.name} (${entry.messageCount})`).join(", ")}`);
  console.log();
  for (const msg of payload.recentMessages) {
    console.log(`[${msg.time}] ${msg.user.name}: ${truncate(msg.text)}`);
  }
  return payload;
}

export async function thread(channelRef, ts, count = 50, options = {}) {
  const context = options.context || createCommandContext();
  const channel = await resolveChannel(channelRef, context);
  const users = await getUsersMap(context);
  const params = { channel, ts, limit: count };
  if (options.cursor) params.cursor = options.cursor;
  const data = await context.slackApi("conversations.replies", params);
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  const payload = {
    channel: {
      id: channel,
      name: channelRef.replace(/^#/, ""),
    },
    threadTs: ts,
    paging: {
      hasMore: Boolean(data.has_more),
      nextCursor: data.response_metadata?.next_cursor || null,
    },
    messages: (data.messages || []).map((msg) => normalizeReplyMessage(msg, users)),
  };

  if (options.json) {
    printJson(payload);
    return payload;
  }

  for (const msg of payload.messages) {
    console.log(`[${msg.time}] ${msg.user.name}:`);
    console.log(`  ${msg.text}`);
    console.log();
  }
  return payload;
}

export async function users() {
  const context = createCommandContext();
  const data = await context.slackPaginate("users.list", {}, "members");
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  for (const user of data.members) {
    if (user.deleted || user.is_bot) continue;
    const name = user.real_name || user.name;
    const display = user.profile?.display_name || "";
    const status = user.profile?.status_text ? ` — ${user.profile.status_text}` : "";
    console.log(`${name}${display ? ` (@${display})` : ""} (${user.id})${status}`);
  }
}

async function getMutedChannels(context) {
  const prefs = await context.slackApi("users.prefs.get", {});
  if (!prefs.ok) return new Set();

  const allNotifs = prefs.prefs?.all_notifications_prefs;
  if (!allNotifs) return new Set();
  const parsed = typeof allNotifs === "string" ? JSON.parse(allNotifs) : allNotifs;
  const muted = new Set();
  for (const [channelId, channelPrefs] of Object.entries(parsed.channels || {})) {
    if (channelPrefs.muted) muted.add(channelId);
  }
  return muted;
}

async function buildActivityPayload(unreadOnly = false, context = createCommandContext()) {
  await getUsersMap(context);
  const [counts, mutedSet] = await Promise.all([context.slackApi("client.counts", {}), getMutedChannels(context)]);
  if (!counts.ok) {
    console.error(`Error: ${counts.error}`);
    process.exit(1);
  }

  const chMap = await getChannelsMap(context);
  const all = [
    ...(counts.channels || []).map((c) => ({ ...c, type: "channel" })),
    ...(counts.mpims || []).map((c) => ({ ...c, type: "group" })),
    ...(counts.ims || []).map((c) => ({ ...c, type: "dm" })),
  ];

  const filtered = unreadOnly
    ? all.filter((channel) => (channel.has_unreads || channel.mention_count > 0) && !mutedSet.has(channel.id))
    : all;

  return {
    unreadOnly,
    threads: counts.threads
      ? {
          hasUnreads: Boolean(counts.threads.has_unreads),
          mentionCount: counts.threads.mention_count || 0,
        }
      : null,
    channels: filtered.map((channel) => ({
      id: channel.id,
      name: chMap[channel.id] || channel.id,
      type: channel.type,
      hasUnreads: Boolean(channel.has_unreads),
      mentionCount: channel.mention_count || 0,
      muted: mutedSet.has(channel.id),
    })),
  };
}

export async function activity(unreadOnly = false, context = createCommandContext(), options = {}) {
  const payload = await buildActivityPayload(unreadOnly, context);

  if (options.json) {
    printJson(payload);
    return;
  }

  if (payload.threads && (payload.threads.hasUnreads || payload.threads.mentionCount > 0)) {
    console.log(`🧵 Threads — ${payload.threads.mentionCount} mentions, unreads: ${payload.threads.hasUnreads}`);
    console.log();
  }

  if (payload.channels.length === 0) {
    console.log(unreadOnly ? "No unreads! 🎉" : "No activity.");
    return;
  }

  for (const channel of payload.channels) {
    const prefix = channel.type === "dm" ? "💬" : channel.type === "group" ? "👥" : "#";
    const mentions = channel.mentionCount > 0 ? ` (${channel.mentionCount} mentions)` : "";
    const unread = channel.hasUnreads ? " •" : "";
    const muted = channel.muted ? " 🔇" : "";
    console.log(`${prefix} ${channel.name}${unread}${mentions}${muted}`);
  }
}

export async function starred(context = createCommandContext()) {
  const users = await getUsersMap(context);
  const prefs = await context.slackApi("users.prefs.get", {});
  const vipIds = prefs.ok ? (prefs.prefs?.vip_users || "").split(",").filter(Boolean) : [];

  if (vipIds.length > 0) {
    console.log("👑 VIP Users:");
    for (const uid of vipIds) console.log(`   ${userName(users, uid)} (${uid})`);
    console.log();
  }

  const chMap = await getChannelsMap(context);
  const stars = await context.slackApi("stars.list", { count: 50 });
  if (!stars.ok) {
    console.error(`Error: ${stars.error}`);
    process.exit(1);
  }

  if (!stars.items?.length) {
    console.log("⭐ No starred items.");
    return;
  }

  console.log("⭐ Starred:");
  for (const item of stars.items) {
    if (item.type === "message") {
      const msg = item.message || {};
      const channel = chMap[item.channel] || item.channel;
      console.log(`   #${channel} — ${userName(users, msg.user)}: ${(msg.text || "").substring(0, 100)}`);
    } else if (item.type === "channel") {
      console.log(`   #${chMap[item.channel] || item.channel}`);
    } else if (item.type === "im") {
      console.log(`   💬 ${chMap[item.channel] || item.channel}`);
    } else if (item.type === "file") {
      console.log(`   📎 ${item.file?.name || "?"}`);
    }
  }
}

export async function pins(channelRef) {
  const context = createCommandContext();
  const channel = await resolveChannel(channelRef, context);
  const users = await getUsersMap(context);
  const data = await context.slackApi("pins.list", { channel });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  if (!data.items?.length) {
    console.log("No pinned items.");
    return;
  }

  console.log(`📌 ${data.items.length} pinned items:\n`);
  for (const item of data.items) {
    const msg = item.message || {};
    console.log(`[${formatTs(msg.ts)}] ${userName(users, msg.user)}:`);
    console.log(`  ${(msg.text || "").substring(0, 200)}`);
    console.log();
  }
}

export async function saved(count = 20, includeCompleted = false, context = createCommandContext()) {
  const users = await getUsersMap(context);
  const chMap = await getChannelsMap(context);
  const data = await context.slackApi("saved.list", { count });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  const items = data.saved_items || [];
  const counts = data.counts || {};
  console.log(`📑 Saved for Later — ${counts.uncompleted_count || 0} active, ${counts.completed_count || 0} completed\n`);
  if (!items.length) {
    console.log("No saved items.");
    return;
  }

  for (const item of items) {
    if (!includeCompleted && item.state === "completed") continue;
    const chName = chMap[item.item_id] || item.item_id;
    const savedAt = formatTs(item.date_created);
    const state = item.state === "completed" ? " ✅" : "";

    try {
      const msgData = await context.slackApi("conversations.history", {
        channel: item.item_id,
        latest: item.ts,
        inclusive: true,
        limit: 1,
      });
      if (msgData.ok && msgData.messages?.[0]) {
        const msg = msgData.messages[0];
        console.log(`[saved ${savedAt}]${state} #${chName} — ${userName(users, msg.user)} (${formatTs(msg.ts)}):`);
        console.log(`  ${(msg.text || "").substring(0, 300)}`);
        if (msg.files?.length) {
          for (const file of msg.files) console.log(`  📎 ${file.name} (${file.mimetype})`);
        }
      } else {
        console.log(`[saved ${savedAt}]${state} #${chName} (ts: ${item.ts}) — could not fetch message`);
      }
    } catch {
      console.log(`[saved ${savedAt}]${state} #${chName} (ts: ${item.ts}) — access denied or channel not found`);
    }
    console.log();
  }
}

export async function workspaces() {
  const teams = listWorkspaces();
  const activeTeam = getActiveWorkspace();
  console.log("Workspaces:\n");
  for (const [id, info] of Object.entries(teams)) {
    const active = id === activeTeam ? " ← active" : "";
    console.log(`  ${info.name} (${info.domain})${active}`);
    console.log(`    ID: ${id}  URL: ${info.url}`);
  }
  console.log(`\n${Object.keys(teams).length} workspaces found.`);
}

export async function switchWorkspace(query) {
  const teams = listWorkspaces();
  const lower = query.toLowerCase();
  const match = Object.entries(teams).find(
    ([id, info]) =>
      id === query ||
      info.domain?.toLowerCase() === lower ||
      info.name?.toLowerCase() === lower ||
      info.domain?.toLowerCase().includes(lower) ||
      info.name?.toLowerCase().includes(lower)
  );

  if (!match) {
    console.error(`No workspace matching "${query}".`);
    console.error("Available:");
    for (const [id, info] of Object.entries(teams)) console.error(`  ${info.name} (${info.domain}) — ${id}`);
    process.exit(1);
  }

  const [teamId, info] = match;
  setActiveWorkspace(teamId);
  console.log(`✅ Switched to ${info.name} (${info.domain})`);

  const data = await defaultSlackApi("auth.test");
  if (data.ok && data.team_id === teamId) {
    console.log(`   Authenticated as ${data.user} @ ${data.team}`);
    return;
  }
  if (data.ok && data.team_id !== teamId) {
    console.error(`   ⚠️  Auth resolved to ${data.team} (${data.team_id}) instead of the selected workspace.`);
    process.exit(1);
  }
  console.error(`   ⚠️  Auth check failed: ${data.error}`);
  process.exit(1);
}

export async function react(channelRef, ts, emoji) {
  const context = createCommandContext();
  const channel = await resolveChannel(channelRef, context);
  const data = await context.slackApi("reactions.add", {
    channel,
    timestamp: ts,
    name: emoji.replace(/:/g, ""),
  });
  if (!data.ok) {
    console.error(`❌ Failed: ${data.error}`);
    process.exit(1);
  }
  console.log(`✅ Reacted with :${emoji.replace(/:/g, "")}:`);
}

export async function cacheClear({ stateRootDir = null, includeWorkspace = false, json = false } = {}) {
  const result = await clearLocalState({ rootDir: stateRootDir, includeWorkspace });
  if (json) {
    printJson({ kind: "cache-clear", ...result });
    return result;
  }
  console.log(`Cleared local slk state under ${result.rootDir}`);
  if (result.removed.length) console.log(`Removed: ${result.removed.join(", ")}`);
  else console.log("Removed: nothing (state already clean)");
  if (!includeWorkspace) console.log("Preserved: active-workspace");
  return result;
}
