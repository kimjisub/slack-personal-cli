/**
 * CLI command implementations.
 */

import { slackApi, slackPaginate } from "./api.js";
import { getCredentials, listWorkspaces, getActiveWorkspace, setActiveWorkspace } from "./auth.js";
import { resolveScope, resolveTargets, mapWorkspaces, workspaceLabel } from "./workspaces.js";
import { emit } from "./output.js";

// ── Helpers ──────────────────────────────────────────────

let userCache = null;

async function getUsers() {
  if (userCache) return userCache;
  const data = await slackPaginate("users.list", {}, "members");
  if (!data.ok) return {};
  userCache = {};
  for (const u of data.members) {
    userCache[u.id] = u.real_name || u.profile?.display_name || u.name;
  }
  return userCache;
}

function userName(users, id) {
  return users[id] || id;
}

async function resolveChannel(nameOrId, creds = null) {
  // Already a channel/DM/group ID
  if (nameOrId.startsWith("C") || nameOrId.startsWith("D") || nameOrId.startsWith("G")) {
    return nameOrId;
  }

  // User ID → open DM and return channel ID
  if (nameOrId.startsWith("U")) {
    const dm = await slackApi("conversations.open", { users: nameOrId }, creds);
    if (!dm.ok) throw new Error(`Failed to open DM with ${nameOrId}: ${dm.error}`);
    return dm.channel.id;
  }

  // @username or username → find user, open DM
  if (nameOrId.startsWith("@") || !nameOrId.includes("#")) {
    const username = nameOrId.replace(/^@/, "").toLowerCase();
    const usersData = await slackPaginate("users.list", {}, "members", creds);
    if (usersData.ok) {
      const user = usersData.members.find(
        (u) => u.name?.toLowerCase() === username ||
               u.real_name?.toLowerCase() === username ||
               u.profile?.display_name?.toLowerCase() === username
      );
      if (user) {
        const dm = await slackApi("conversations.open", { users: user.id }, creds);
        if (dm.ok) return dm.channel.id;
      }
    }
  }

  // Channel name
  const name = nameOrId.replace(/^#/, "");
  const data = await slackPaginate("conversations.list", {
    types: "public_channel,private_channel,mpim,im",
  }, "channels", creds);
  if (!data.ok) throw new Error(`Failed to list channels: ${data.error}`);
  const ch = data.channels.find(
    (c) => c.name === name || c.name_normalized === name
  );
  if (!ch) throw new Error(`Channel not found: ${nameOrId}`);
  return ch.id;
}

function formatTs(ts) {
  return new Date(parseFloat(ts) * 1000).toLocaleString();
}

function printMessage(users, msg, { showTs = true, prefix = "", indent = "  " } = {}) {
  const who = userName(users, msg.user);
  const time = formatTs(msg.ts);
  const tsStr = showTs ? ` ts:${msg.ts}` : "";
  const thread = msg.reply_count ? ` [${msg.reply_count} replies]` : "";
  console.log(`${prefix}[${time}${tsStr}] ${who}${thread}:`);
  console.log(`${indent}${msg.text || ""}`);
  if (msg.files?.length) {
    for (const f of msg.files) {
      console.log(`${indent}📎 ${f.name} (${f.mimetype})`);
    }
  }
}

async function fetchMessage(channel, ts) {
  const data = await slackApi("conversations.history", {
    channel,
    latest: ts,
    inclusive: true,
    limit: 1,
  });

  if (!data.ok) {
    throw new Error(`Failed to fetch message: ${data.error}`);
  }

  const msg = data.messages?.[0];
  if (!msg || msg.ts !== ts) {
    throw new Error(`Message not found at ts ${ts}`);
  }

  return msg;
}

async function fetchMessageContext(channel, ts, before = 2, after = 2) {
  const [olderData, newerData] = await Promise.all([
    slackApi("conversations.history", {
      channel,
      latest: ts,
      inclusive: true,
      limit: before + 1,
    }),
    slackApi("conversations.history", {
      channel,
      oldest: ts,
      inclusive: true,
      limit: after + 1,
    }),
  ]);

  if (!olderData.ok) throw new Error(`Failed to fetch older context: ${olderData.error}`);
  if (!newerData.ok) throw new Error(`Failed to fetch newer context: ${newerData.error}`);

  const older = [...(olderData.messages || [])].reverse();
  const newer = newerData.messages || [];
  const merged = [...older, ...newer.slice(1)];
  const deduped = [];
  const seen = new Set();
  for (const msg of merged) {
    if (!msg?.ts || seen.has(msg.ts)) continue;
    seen.add(msg.ts);
    deduped.push(msg);
  }
  return deduped;
}

// ── Commands ─────────────────────────────────────────────

export async function auth() {
  const data = await slackApi("auth.test");
  if (data.ok) {
    console.log(`✅ Authenticated as ${data.user} @ ${data.team}`);
    console.log(`   Team ID: ${data.team_id}`);
    console.log(`   User ID: ${data.user_id}`);
    console.log(`   URL: ${data.url}`);
  } else {
    console.error(`❌ Auth failed: ${data.error}`);
    process.exit(1);
  }
}

export async function channels() {
  const data = await slackPaginate("conversations.list", {
    types: "public_channel,private_channel",
    exclude_archived: true,
  });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }
  for (const ch of data.channels) {
    const prefix = ch.is_private ? "🔒" : "#";
    const members = ch.num_members || 0;
    console.log(`${prefix} ${ch.name}  (${members} members, id: ${ch.id})`);
  }
}

export async function dms() {
  const users = await getUsers();
  const data = await slackPaginate("conversations.list", {
    types: "im",
    exclude_archived: true,
  });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }
  for (const ch of data.channels) {
    const name = userName(users, ch.user);
    console.log(`💬 ${name}  (${ch.id})`);
  }
}

export async function read(channelRef, count = 20, options = {}) {
  const { showTs = false, oldest = null, latest = null, expandThreads = false } = options;
  const channel = await resolveChannel(channelRef);
  const users = await getUsers();
  
  const params = { channel, limit: count };
  if (oldest) params.oldest = oldest;
  if (latest) params.latest = latest;
  
  const data = await slackApi("conversations.history", params);
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  const messages = data.messages.reverse();
  for (const msg of messages) {
    const who = userName(users, msg.user);
    const time = formatTs(msg.ts);
    const tsStr = showTs ? ` ts:${msg.ts}` : "";
    const thread = msg.reply_count ? ` [${msg.reply_count} replies]` : "";
    console.log(`[${time}${tsStr}] ${who}${thread}:`);
    console.log(`  ${msg.text}`);
    if (msg.files?.length) {
      for (const f of msg.files) {
        console.log(`  📎 ${f.name} (${f.mimetype})`);
      }
    }
    
    // Auto-expand threads
    if (expandThreads && msg.reply_count > 0) {
      const replies = await slackApi("conversations.replies", {
        channel,
        ts: msg.ts,
        limit: 100,
      });
      if (replies.ok && replies.messages?.length > 1) {
        for (const reply of replies.messages.slice(1)) { // skip parent
          const replyWho = userName(users, reply.user);
          const replyTime = formatTs(reply.ts);
          const replyTsStr = showTs ? ` ts:${reply.ts}` : "";
          console.log(`    ↳ [${replyTime}${replyTsStr}] ${replyWho}:`);
          console.log(`      ${reply.text}`);
          if (reply.files?.length) {
            for (const f of reply.files) {
              console.log(`      📎 ${f.name} (${f.mimetype})`);
            }
          }
        }
      }
    }
    console.log();
  }
}

export async function send(channelRef, text, options = {}) {
  const channel = await resolveChannel(channelRef);
  const params = { channel, text };
  if (options.threadTs) params.thread_ts = options.threadTs;
  const data = await slackApi("chat.postMessage", params);
  if (data.ok) {
    const threadSuffix = options.threadTs ? ` in thread ${options.threadTs}` : "";
    console.log(`✅ Sent to ${channelRef}${threadSuffix} (ts: ${data.ts})`);
  } else {
    console.error(`❌ Failed: ${data.error}`);
    process.exit(1);
  }
}

export async function reply(channelRef, threadTs, text) {
  return send(channelRef, text, { threadTs });
}

async function computeSearch(query, count, creds = null) {
  const data = await slackApi("search.messages", { query, count }, creds);
  if (!data.ok) throw new Error(data.error || "search failed");
  return { total: data.messages?.total || 0, matches: data.messages?.matches || [] };
}

function searchAuthor(msg, users) {
  return users[msg.user] || msg.username || msg.user || "?";
}

function normalizeMatch(msg, users, label) {
  return {
    workspace: label,
    ts: msg.ts,
    channel: msg.channel?.name || msg.channel?.id || null,
    author: searchAuthor(msg, users),
    text: msg.text,
    permalink: msg.permalink,
  };
}

function renderSearchMatch(msg, users, label = null) {
  const who = searchAuthor(msg, users);
  const time = formatTs(msg.ts);
  const ch = msg.channel?.name || msg.channel?.id || "?";
  const wsTag = label ? `[${label}] ` : "";
  console.log(`[${time}] ${wsTag}#${ch} — ${who}:`);
  console.log(`  ${msg.text}`);
  console.log();
}

export async function search(query, count = 20, opts = {}) {
  const scope = resolveScope(opts);
  const targets = resolveTargets(scope);

  if (targets.length === 1) {
    let res;
    try {
      res = await computeSearch(query, count, targets[0].creds);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    // Real names only available cheaply for the active workspace.
    const users = scope.mode === "active" ? await getUsers() : {};
    const label = scope.mode === "one" ? workspaceLabel(targets[0].team) : null;
    emit(
      {
        query,
        scope: scope.mode,
        total: res.total,
        results: res.matches.map((m) => normalizeMatch(m, users, label)),
      },
      () => {
        console.log(`Found ${res.total} results\n`);
        for (const msg of res.matches) renderSearchMatch(msg, users, label);
      }
    );
    return;
  }

  // All workspaces: fan out, merge newest-first with a workspace tag.
  const results = await mapWorkspaces(targets, (creds) =>
    computeSearch(query, count, creds)
  );
  const merged = [];
  for (const r of results) {
    if (r.error) continue;
    for (const msg of r.value.matches) merged.push({ msg, label: workspaceLabel(r.team) });
  }
  merged.sort((a, b) => parseFloat(b.msg.ts) - parseFloat(a.msg.ts));

  const okCount = results.filter((r) => !r.error).length;
  const failed = results.filter((r) => r.error).map((r) => workspaceLabel(r.team));
  emit(
    {
      query,
      scope: "all",
      workspaces: okCount,
      results: merged.map(({ msg, label }) => normalizeMatch(msg, {}, label)),
      failed,
    },
    () => {
      console.log(`Found ${merged.length} results across ${okCount} workspaces\n`);
      for (const { msg, label } of merged) renderSearchMatch(msg, {}, label);
      if (failed.length) {
        console.log(`⚠️  ${failed.length} workspace(s) failed: ${failed.join(", ")}`);
      }
    }
  );
}

// ── owed: threads that @mention me and I haven't responded to ──

/**
 * Decide whether a mention thread still needs my response.
 * Responded = I posted a message after the mention, OR I reacted anywhere in
 * the thread (an emoji counts as acknowledgement).
 */
export function isOwed(myId, mentionTs, threadMessages) {
  const repliedAfter = threadMessages.some(
    (m) => m.user === myId && parseFloat(m.ts) > parseFloat(mentionTs)
  );
  if (repliedAfter) return false;

  const reacted = threadMessages.some((m) =>
    (m.reactions || []).some((r) => (r.users || []).includes(myId))
  );
  if (reacted) return false;

  return true;
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function computeOwed(creds, days) {
  const me = await slackApi("auth.test", {}, creds);
  if (!me.ok) throw new Error(me.error || "auth.test failed");
  const myId = me.user_id;

  const found = await slackApi(
    "search.messages",
    { query: `<@${myId}> after:${isoDaysAgo(days)}`, count: 50 },
    creds
  );
  if (!found.ok) throw new Error(found.error || "search failed");
  const matches = found.messages?.matches || [];

  const rows = [];
  for (const m of matches) {
    const channel = m.channel?.id;
    if (!channel) continue;
    const replies = await slackApi(
      "conversations.replies",
      { channel, ts: m.ts, limit: 200 },
      creds
    );
    const msgs = replies.ok ? replies.messages || [] : [];
    if (isOwed(myId, m.ts, msgs)) {
      rows.push({
        channelName: m.channel?.name || channel,
        author: m.username || m.user,
        ts: m.ts,
        text: m.text,
        permalink: m.permalink,
      });
    }
  }
  return rows;
}

function renderOwed(rows, label = null) {
  if (label) console.log(`\n=== ${label} ===`);
  if (rows.length === 0) {
    console.log("Nothing owed! 🎉");
    return;
  }
  for (const r of rows) {
    console.log(`[${formatTs(r.ts)}] #${r.channelName} — ${r.author}:`);
    console.log(`  ${r.text}`);
    if (r.permalink) console.log(`  ${r.permalink}`);
    console.log();
  }
}

export async function owed(opts = {}) {
  const days = opts.days || 30;
  const scope = resolveScope(opts);
  const targets = resolveTargets(scope);

  let sections; // [{ label, rows, error? }]
  if (targets.length === 1) {
    let rows;
    try {
      rows = await computeOwed(targets[0].creds, days);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    sections = [
      { label: scope.mode === "one" ? workspaceLabel(targets[0].team) : null, rows },
    ];
  } else {
    const results = await mapWorkspaces(targets, (creds) => computeOwed(creds, days));
    sections = results.map((r) => ({
      label: workspaceLabel(r.team),
      rows: r.value,
      error: r.error,
    }));
  }

  emit(
    {
      scope: scope.mode,
      days,
      workspaces: sections
        .filter((s) => !s.error)
        .map((s) => ({ workspace: s.label, owed: s.rows })),
      failed: sections.filter((s) => s.error).map((s) => s.label),
    },
    () => {
      for (const s of sections) {
        if (s.error) continue;
        renderOwed(s.rows, s.label);
      }
      const failed = sections.filter((s) => s.error);
      if (failed.length) {
        console.log(
          `\n⚠️  ${failed.length} workspace(s) failed: ${failed
            .map((s) => s.label)
            .join(", ")}`
        );
      }
    }
  );
}

export async function thread(channelRef, ts, count = 50) {
  const channel = await resolveChannel(channelRef);
  const users = await getUsers();
  const data = await slackApi("conversations.replies", {
    channel,
    ts,
    limit: count,
  });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  for (const msg of data.messages) {
    printMessage(users, msg, { showTs: true });
    console.log();
  }
}

export async function permalink(channelRef, ts) {
  const channel = await resolveChannel(channelRef);
  const data = await slackApi("chat.getPermalink", { channel, message_ts: ts });
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  console.log(data.permalink);
}

export async function showMessage(channelRef, ts) {
  const channel = await resolveChannel(channelRef);
  const users = await getUsers();

  try {
    const msg = await fetchMessage(channel, ts);
    printMessage(users, msg, { showTs: true });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

export async function messageContext(channelRef, ts, before = 2, after = 2) {
  const channel = await resolveChannel(channelRef);
  const users = await getUsers();

  try {
    const messages = await fetchMessageContext(channel, ts, before, after);
    for (const msg of messages) {
      const isTarget = msg.ts === ts;
      printMessage(users, msg, {
        showTs: true,
        prefix: isTarget ? '→ ' : '  ',
        indent: isTarget ? '    ' : '    ',
      });
      console.log();
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

export async function users() {
  const data = await slackPaginate("users.list", {}, "members");
  if (!data.ok) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  for (const u of data.members) {
    if (u.deleted || u.is_bot) continue;
    const name = u.real_name || u.name;
    const display = u.profile?.display_name || "";
    const status = u.profile?.status_text ? ` — ${u.profile.status_text}` : "";
    console.log(`${name}${display ? ` (@${display})` : ""} (${u.id})${status}`);
  }
}

async function getMutedChannels(creds = null) {
  const prefs = await slackApi("users.prefs.get", {}, creds);
  if (!prefs.ok) return new Set();

  const allNotifs = prefs.prefs?.all_notifications_prefs;
  if (!allNotifs) return new Set();

  const parsed = typeof allNotifs === "string" ? JSON.parse(allNotifs) : allNotifs;
  const muted = new Set();
  for (const [chId, chPrefs] of Object.entries(parsed.channels || {})) {
    if (chPrefs.muted) muted.add(chId);
  }
  return muted;
}

/**
 * Fetch unread/activity data for one workspace (creds = null → active workspace).
 * Returns plain data; rendering is separate so it can be reused per-workspace.
 */
async function computeUnreads(creds = null) {
  const [counts, mutedSet, chData] = await Promise.all([
    slackApi("client.counts", {}, creds),
    getMutedChannels(creds),
    slackPaginate(
      "conversations.list",
      { types: "public_channel,private_channel,mpim,im", exclude_archived: true },
      "channels",
      creds
    ),
  ]);

  if (!counts.ok) {
    throw new Error(counts.error || "client.counts failed");
  }

  // Channel names come straight from conversations.list. DM (im) names are
  // resolved lazily below — fetching the full users.list per workspace is far
  // too expensive on large public workspaces (tens of thousands of members).
  const chMap = {};
  const dmUserId = {};
  if (chData.ok) {
    for (const ch of chData.channels) {
      if (ch.is_im || (ch.user && !ch.name)) {
        dmUserId[ch.id] = ch.user;
      } else {
        chMap[ch.id] = ch.name || ch.id;
      }
    }
  }

  const items = [
    ...(counts.channels || []).map((c) => ({ ...c, type: "channel" })),
    ...(counts.mpims || []).map((c) => ({ ...c, type: "group" })),
    ...(counts.ims || []).map((c) => ({ ...c, type: "dm" })),
  ];

  // Resolve names only for DMs that are actually unread/mentioned — a handful
  // of users.info calls, not the entire workspace directory.
  const unreadDmUsers = [
    ...new Set(
      items
        .filter((c) => c.type === "dm" && (c.has_unreads || c.mention_count > 0))
        .map((c) => dmUserId[c.id])
        .filter(Boolean)
    ),
  ];
  const nameById = {};
  for (const uid of unreadDmUsers) {
    const info = await slackApi("users.info", { user: uid }, creds);
    const u = info.ok ? info.user : null;
    nameById[uid] = u ? u.real_name || u.profile?.display_name || u.name : uid;
  }
  for (const [chId, uid] of Object.entries(dmUserId)) {
    chMap[chId] = `DM:${nameById[uid] || uid}`;
  }

  return { threads: counts.threads, items, chMap, mutedSet };
}

function renderUnreadSection(data, unreadOnly, label = null) {
  if (label) console.log(`\n=== ${label} ===`);

  if (data.threads?.has_unreads || data.threads?.mention_count > 0) {
    console.log(
      `🧵 Threads — ${data.threads.mention_count} mentions, unreads: ${data.threads.has_unreads}`
    );
    console.log();
  }

  let filtered = data.items;
  if (unreadOnly) {
    filtered = filtered.filter(
      (c) => (c.has_unreads || c.mention_count > 0) && !data.mutedSet.has(c.id)
    );
  }

  if (filtered.length === 0) {
    console.log(unreadOnly ? "No unreads! 🎉" : "No activity.");
    return 0;
  }

  for (const ch of filtered) {
    const name = data.chMap[ch.id] || ch.id;
    const isMuted = data.mutedSet.has(ch.id);
    const prefix = ch.type === "dm" ? "💬" : ch.type === "group" ? "👥" : "#";
    const mentions = ch.mention_count > 0 ? ` (${ch.mention_count} mentions)` : "";
    const unread = ch.has_unreads ? " •" : "";
    const muted = isMuted ? " 🔇" : "";
    console.log(`${prefix} ${name}${unread}${mentions}${muted}`);
  }
  return filtered.length;
}

function unreadsToJson(data, unreadOnly, label) {
  let items = data.items;
  if (unreadOnly) {
    items = items.filter(
      (c) => (c.has_unreads || c.mention_count > 0) && !data.mutedSet.has(c.id)
    );
  }
  return {
    workspace: label,
    threads: data.threads || null,
    items: items.map((c) => ({
      id: c.id,
      name: data.chMap[c.id] || c.id,
      type: c.type,
      has_unreads: Boolean(c.has_unreads),
      mention_count: c.mention_count || 0,
      muted: data.mutedSet.has(c.id),
    })),
  };
}

export async function activity(unreadOnly = false, opts = {}) {
  const scope = resolveScope(opts);
  const targets = resolveTargets(scope);

  let sections; // [{ label, data, error? }]
  if (targets.length === 1) {
    let data;
    try {
      data = await computeUnreads(targets[0].creds);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    sections = [
      { label: scope.mode === "one" ? workspaceLabel(targets[0].team) : null, data },
    ];
  } else {
    const results = await mapWorkspaces(targets, (creds) => computeUnreads(creds));
    sections = results.map((r) => ({
      label: workspaceLabel(r.team),
      data: r.value,
      error: r.error,
    }));
  }

  emit(
    {
      scope: scope.mode,
      workspaces: sections
        .filter((s) => !s.error)
        .map((s) => unreadsToJson(s.data, unreadOnly, s.label)),
      failed: sections.filter((s) => s.error).map((s) => s.label),
    },
    () => {
      for (const s of sections) {
        if (s.error) continue;
        renderUnreadSection(s.data, unreadOnly, s.label);
      }
      const failed = sections.filter((s) => s.error);
      if (failed.length) {
        console.log(
          `\n⚠️  ${failed.length} workspace(s) failed: ${failed
            .map((s) => s.label)
            .join(", ")}`
        );
      }
    }
  );
}

export async function starred() {
  const users = await getUsers();

  // Get VIP users from prefs
  const prefs = await slackApi("users.prefs.get", {});
  const vipIds = prefs.ok ? (prefs.prefs?.vip_users || "").split(",").filter(Boolean) : [];

  if (vipIds.length > 0) {
    console.log("👑 VIP Users:");
    for (const uid of vipIds) {
      console.log(`   ${userName(users, uid)} (${uid})`);
    }
    console.log();
  }

  // Build channel name map
  const chData = await slackPaginate("conversations.list", {
    types: "public_channel,private_channel,mpim,im",
    exclude_archived: true,
  });
  const chMap = {};
  if (chData.ok) {
    for (const ch of chData.channels) {
      chMap[ch.id] = ch.name || (ch.user ? `DM:${userName(users, ch.user)}` : ch.id);
    }
  }

  // Get starred items
  const stars = await slackApi("stars.list", { count: 50 });
  if (!stars.ok) {
    console.error(`Error: ${stars.error}`);
    process.exit(1);
  }

  if (stars.items?.length > 0) {
    console.log("⭐ Starred:");
    for (const item of stars.items) {
      if (item.type === "message") {
        const msg = item.message || {};
        const ch = chMap[item.channel] || item.channel;
        const who = userName(users, msg.user);
        console.log(`   #${ch} — ${who}: ${(msg.text || "").substring(0, 100)}`);
      } else if (item.type === "channel") {
        console.log(`   #${chMap[item.channel] || item.channel}`);
      } else if (item.type === "im") {
        console.log(`   💬 ${chMap[item.channel] || item.channel}`);
      } else if (item.type === "file") {
        console.log(`   📎 ${item.file?.name || "?"}`);
      }
    }
  } else {
    console.log("⭐ No starred items.");
  }
}

export async function pins(channelRef) {
  const channel = await resolveChannel(channelRef);
  const users = await getUsers();

  const data = await slackApi("pins.list", { channel });
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
    const who = userName(users, msg.user);
    const time = formatTs(msg.ts);
    console.log(`[${time}] ${who}:`);
    console.log(`  ${(msg.text || "").substring(0, 200)}`);
    console.log();
  }
}

export async function saved(count = 20, includeCompleted = false) {
  const users = await getUsers();

  // Build channel name map
  const chData = await slackPaginate("conversations.list", {
    types: "public_channel,private_channel,mpim,im",
    exclude_archived: true,
  });
  const chMap = {};
  if (chData.ok) {
    for (const ch of chData.channels) {
      chMap[ch.id] = ch.name || (ch.user ? `DM:${userName(users, ch.user)}` : ch.id);
    }
  }

  const data = await slackApi("saved.list", { count });
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

    // Fetch the actual message
    try {
      const msgData = await slackApi("conversations.history", {
        channel: item.item_id,
        latest: item.ts,
        inclusive: true,
        limit: 1,
      });
      if (msgData.ok && msgData.messages?.[0]) {
        const msg = msgData.messages[0];
        const who = userName(users, msg.user);
        const msgTime = formatTs(msg.ts);
        console.log(`[saved ${savedAt}]${state} #${chName} — ${who} (${msgTime}):`);
        console.log(`  ${(msg.text || "").substring(0, 300)}`);
        if (msg.files?.length) {
          for (const f of msg.files) {
            console.log(`  📎 ${f.name} (${f.mimetype})`);
          }
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

export async function currentWorkspace() {
  const teams = listWorkspaces();
  const activeTeam = getActiveWorkspace();

  if (activeTeam && teams[activeTeam]) {
    const info = teams[activeTeam];
    console.log(`Current workspace: ${info.name} (${info.domain})`);
    console.log(`ID: ${activeTeam}  URL: ${info.url}`);
    return;
  }

  const [defaultTeamId, defaultInfo] = Object.entries(teams)[0] || [];
  if (!defaultTeamId) {
    console.error("No workspaces found.");
    process.exit(1);
  }

  console.log(`Current workspace: ${defaultInfo.name} (${defaultInfo.domain})`);
  console.log(`ID: ${defaultTeamId}  URL: ${defaultInfo.url}`);
  console.log("No explicit workspace selected; using Slack's default local workspace.");
}

export async function switchWorkspace(query) {
  const teams = listWorkspaces();

  const q = query.toLowerCase();
  const match = Object.entries(teams).find(
    ([id, info]) =>
      id === query ||
      info.domain?.toLowerCase() === q ||
      info.name?.toLowerCase() === q ||
      info.domain?.toLowerCase().includes(q) ||
      info.name?.toLowerCase().includes(q)
  );

  if (!match) {
    console.error(`No workspace matching "${query}".`);
    console.error("Available:");
    for (const [id, info] of Object.entries(teams)) {
      console.error(`  ${info.name} (${info.domain}) — ${id}`);
    }
    process.exit(1);
  }

  const [teamId, info] = match;
  setActiveWorkspace(teamId);
  console.log(`✅ Switched to ${info.name} (${info.domain})`);

  // Verify the switch works
  const data = await slackApi("auth.test");
  if (data.ok) {
    console.log(`   Authenticated as ${data.user} @ ${data.team}`);
  } else {
    console.error(`   ⚠️  Auth check failed: ${data.error}`);
  }
}

export async function react(channelRef, ts, emoji) {
  const channel = await resolveChannel(channelRef);
  const data = await slackApi("reactions.add", {
    channel,
    timestamp: ts,
    name: emoji.replace(/:/g, ""),
  });
  if (data.ok) {
    console.log(`✅ Reacted with :${emoji.replace(/:/g, "")}:`);
  } else {
    console.error(`❌ Failed: ${data.error}`);
    process.exit(1);
  }
}

// ── mark / schedule (parity) ──────────────────────────────

// Pick the single-workspace creds for a scope, rejecting -A for write-ish ops.
function singleTargetCreds(opts, opName) {
  const scope = resolveScope(opts);
  if (scope.mode === "all") {
    console.error(`${opName} does not support -A (per-workspace only).`);
    process.exit(1);
  }
  return resolveTargets(scope)[0].creds;
}

export async function mark(channelRef, opts = {}) {
  const creds = singleTargetCreds(opts, "mark");
  const channel = await resolveChannel(channelRef, creds);

  // Mark up to the latest message in the channel.
  const hist = await slackApi("conversations.history", { channel, limit: 1 }, creds);
  const ts = hist.ok ? hist.messages?.[0]?.ts : null;
  if (!ts) {
    console.error("Nothing to mark (no messages or fetch failed).");
    process.exit(1);
  }

  const res = await slackApi("conversations.mark", { channel, ts }, creds);
  if (!res.ok) {
    console.error(`Error: ${res.error}`);
    process.exit(1);
  }
  emit({ ok: true, channel, ts }, () => {
    console.log(`✓ Marked ${channelRef} as read (up to ts ${ts})`);
  });
}
