/**
 * Presentation layer: turn Slack data into human-readable lines (and the small
 * JSON-shaping helpers that mirror them). Nothing here performs I/O beyond
 * writing to stdout, so it stays free of API/auth concerns.
 */

export function formatTs(ts) {
  return new Date(parseFloat(ts) * 1000).toLocaleString();
}

export function userName(users, id) {
  return users[id] || id;
}

export function printMessage(users, msg, { showTs = true, prefix = "", indent = "  " } = {}) {
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

// ── search ──

export function searchAuthor(msg, users) {
  return users[msg.user] || msg.username || msg.user || "?";
}

export function normalizeMatch(msg, users, label) {
  return {
    workspace: label,
    ts: msg.ts,
    channel: msg.channel?.name || msg.channel?.id || null,
    author: searchAuthor(msg, users),
    text: msg.text,
    permalink: msg.permalink,
  };
}

export function renderSearchMatch(msg, users, label = null) {
  const who = searchAuthor(msg, users);
  const time = formatTs(msg.ts);
  const ch = msg.channel?.name || msg.channel?.id || "?";
  const wsTag = label ? `[${label}] ` : "";
  console.log(`[${time}] ${wsTag}#${ch} — ${who}:`);
  console.log(`  ${msg.text}`);
  console.log();
}

// ── owed ──

export function renderOwed(rows, label = null) {
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

// ── inbox / unread ──

function filterUnreadItems(data, unreadOnly) {
  if (!unreadOnly) return data.items;
  return data.items.filter(
    (c) => (c.has_unreads || c.mention_count > 0) && !data.mutedSet.has(c.id)
  );
}

export function renderUnreadSection(data, unreadOnly, label = null) {
  if (label) console.log(`\n=== ${label} ===`);

  if (data.threads?.has_unreads || data.threads?.mention_count > 0) {
    console.log(
      `🧵 Threads — ${data.threads.mention_count} mentions, unreads: ${data.threads.has_unreads}`
    );
    console.log();
  }

  const filtered = filterUnreadItems(data, unreadOnly);
  if (filtered.length === 0) {
    console.log(unreadOnly ? "No unreads! 🎉" : "No activity.");
    return 0;
  }

  for (const ch of filtered) {
    const name = data.chMap[ch.id] || ch.id;
    const prefix = ch.type === "dm" ? "💬" : ch.type === "group" ? "👥" : "#";
    const mentions = ch.mention_count > 0 ? ` (${ch.mention_count} mentions)` : "";
    const unread = ch.has_unreads ? " •" : "";
    const muted = data.mutedSet.has(ch.id) ? " 🔇" : "";
    console.log(`${prefix} ${name}${unread}${mentions}${muted}`);
  }
  return filtered.length;
}

export function unreadsToJson(data, unreadOnly, label) {
  return {
    workspace: label,
    threads: data.threads || null,
    items: filterUnreadItems(data, unreadOnly).map((c) => ({
      id: c.id,
      name: data.chMap[c.id] || c.id,
      type: c.type,
      has_unreads: Boolean(c.has_unreads),
      mention_count: c.mention_count || 0,
      muted: data.mutedSet.has(c.id),
    })),
  };
}
