#!/usr/bin/env node

/**
 * slk — Slack CLI with auto-auth from macOS Slack desktop app.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import * as cmd from "../src/commands.js";
import * as drafts from "../src/drafts.js";
import { detectCheckpointTs, flattenRows, formatExport, summarizeWatchChange } from "../src/agent-utils.js";
import { splitCliArgs } from "../src/config.js";

const rawArgs = process.argv.slice(2);
const { command, commandArgs: args } = splitCliArgs(rawArgs);

const supportsEmoji = !process.env.NO_EMOJI && !rawArgs.includes("--no-emoji");
const showTs = rawArgs.includes("--ts");
const outputJson = rawArgs.includes("--json");
const e = (emoji, fallback = "") => (supportsEmoji ? `${emoji} ` : fallback);

const getFlagValue = (flag) => {
  const idx = rawArgs.indexOf(flag);
  return idx > -1 && rawArgs[idx + 1] ? rawArgs[idx + 1] : null;
};

const parseSummaryFields = () => {
  const raw = getFlagValue("--summary-fields");
  return raw ? raw.split(",").map((field) => field.trim()).filter(Boolean) : null;
};

const parseKind = () => getFlagValue("--kind");
const parseFilterUser = () => getFlagValue("--user");
const parseFilterChannel = () => getFlagValue("--channel");
const parseCursor = () => getFlagValue("--cursor");
const parsePage = () => getFlagValue("--page") || getFlagValue("--cursor");
const parseMaxTs = () => getFlagValue("--max-ts") || getFlagValue("--cursor");
const parseSinceTs = () => getFlagValue("--since-ts");
const parseCheckpoint = () => getFlagValue("--checkpoint");
const parseFormat = () => getFlagValue("--format") || "json";
const parseOutputPath = () => getFlagValue("--output");
const parseIntervalSeconds = () => Number(getFlagValue("--interval") || 30);
const parseIterations = () => Number(getFlagValue("--iterations") || 0);

const CHECKPOINTS_PATH = path.join(os.homedir(), ".local", "slk", "checkpoints.json");

async function loadCheckpoints() {
  try {
    return JSON.parse(await fs.readFile(CHECKPOINTS_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function saveCheckpoint(name, value) {
  if (!name || !value) return;
  const data = await loadCheckpoints();
  data[name] = value;
  await fs.mkdir(path.dirname(CHECKPOINTS_PATH), { recursive: true });
  await fs.writeFile(CHECKPOINTS_PATH, JSON.stringify(data, null, 2));
}

async function resolveSinceTs() {
  const direct = parseSinceTs();
  if (direct) return direct;
  const checkpoint = parseCheckpoint();
  if (!checkpoint) return null;
  const data = await loadCheckpoints();
  return data[checkpoint] || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSuppressedLogs(fn) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}

async function maybeWriteOutput(text) {
  const outputPath = parseOutputPath();
  if (!outputPath) {
    console.log(text);
    return;
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, text);
  console.log(`Wrote ${outputPath}`);
}

async function runStructuredSource(source, sourceArgs = []) {
  return withSuppressedLogs(async () => {
    switch (source) {
    case "read": {
      if (!sourceArgs[0]) throw new Error("Usage: slk export read <channel> [count]");
      const sinceTs = await resolveSinceTs();
      const count = /^\d+$/.test(sourceArgs[1]) ? parseInt(sourceArgs[1], 10) : 20;
      return cmd.read(sourceArgs[0], count, {
        showTs,
        oldest: null,
        latest: null,
        sinceTs,
        cursor: parseCursor(),
        expandThreads: rawArgs.includes("--threads"),
        json: false,
      });
    }
    case "mentions": {
      const count = /^\d+$/.test(sourceArgs[0]) ? parseInt(sourceArgs[0], 10) : 20;
      return cmd.mentions({
        count,
        from: getFlagValue("--from"),
        to: getFlagValue("--to"),
        user: parseFilterUser(),
        channel: parseFilterChannel(),
        kind: parseKind(),
        summaryFields: parseSummaryFields(),
        json: false,
      });
    }
    case "inbox":
    case "triage": {
      const count = /^\d+$/.test(sourceArgs[0]) ? parseInt(sourceArgs[0], 10) : 20;
      return cmd.inbox({
        count,
        from: getFlagValue("--from"),
        to: getFlagValue("--to"),
        user: parseFilterUser(),
        channel: parseFilterChannel(),
        kind: parseKind(),
        summaryFields: parseSummaryFields(),
        json: false,
      });
    }
    case "thread-unread":
    case "thread-inbox": {
      const count = /^\d+$/.test(sourceArgs[0]) ? parseInt(sourceArgs[0], 10) : 20;
      return cmd.threadUnread({ limit: count, cursor: parseMaxTs(), summaryFields: parseSummaryFields(), json: false });
    }
    case "search": {
      if (!sourceArgs[0]) throw new Error("Usage: slk export search <query> [count]");
      const maybeCount = sourceArgs[sourceArgs.length - 1];
      const count = /^\d+$/.test(maybeCount) ? parseInt(maybeCount, 10) : 20;
      const queryParts = /^\d+$/.test(maybeCount) ? sourceArgs.slice(0, -1) : sourceArgs;
      return cmd.search(queryParts.join(" "), count, { summaryFields: parseSummaryFields(), page: parsePage() ? parseInt(parsePage(), 10) || 1 : undefined, json: false });
    }
    case "thread": {
      if (!sourceArgs[0] || !sourceArgs[1]) throw new Error("Usage: slk export thread <channel> <ts> [count]");
      return cmd.thread(sourceArgs[0], sourceArgs[1], parseInt(sourceArgs[2], 10) || 50, { cursor: parseCursor(), json: false });
    }
    case "context":
    case "channel-context": {
      if (!sourceArgs[0]) throw new Error("Usage: slk export context <channel> [count]");
      return cmd.contextSummary(sourceArgs[0], { messageCount: /^\d+$/.test(sourceArgs[1]) ? parseInt(sourceArgs[1], 10) : 20, json: false });
    }
    case "unread":
      return cmd.activity(true, undefined, { json: false });
    case "activity":
      return cmd.activity(false, undefined, { json: false });
    default:
      throw new Error(`Unsupported export/watch source: ${source}`);
    }
  });
}

const HELP = `${e("💬")}slk — Slack CLI for macOS (auto-auth from Slack desktop app)

Core Slack objects
  Workspace
    slk auth                              Test auth, show user/team info
    slk workspaces        (ws)            List all logged-in workspaces
    slk switch <name|id>  (sw)            Switch active workspace

  Conversations & people
    slk channels          (ch)            List channels with member counts
    slk dms               (dm)            List DM conversations with IDs
    slk users             (u)             List workspace users with statuses
    slk read <conv> [n]   (r)             Read conversation history for a channel or DM
    slk search <query> [n]                Search messages across the workspace
    slk pins <conv>       (pin)           Show pinned items in a conversation
    slk saved [n]         (sv)            Show saved-for-later items

  Messages & threads
    slk thread <conv> <ts> [n]  (t)       Read a specific thread
    slk thread-inbox [n]                  Show the Slack thread inbox (legacy alias: thread-unread)
    slk permalink <conv> <ts>             Get a Slack permalink for a message
    slk send <conv> <msg>   (s)           Send a message
    slk react <conv> <ts> <emoji>         Add emoji reaction

  Channel summaries
    slk channel-context <channel> [n]     Summarize channel metadata + pins + recent activity
                                          legacy alias: context

Attention & triage views
    slk activity          (a)             Show activity across channels / DMs / groups
    slk unread            (ur)            Show only unread conversations
    slk mentions [n]                      Show direct mentions of the current user
    slk triage [n]                        Agent triage inbox: mentions + unreads + threads + saved
                                          legacy alias: inbox
    slk starred           (star)          Show VIP users and starred items

Utilities
    slk export <source> ...               Export structured results as json, ndjson, or csv
    slk watch <source> ...                Poll a structured source for changes
    slk cache-clear                       Clear local token/cache/runtime state (preserves active workspace by default)

Drafts (synced to Slack UI)
    slk draft <conv> <msg>                Draft a channel message
    slk draft thread <conv> <ts> <msg>    Draft a thread reply
    slk draft user <user_id> <msg>        Draft a DM
    slk drafts                            List active drafts
    slk draft drop <id>                   Delete a draft

Scoped options by command
  read
    --threads
    --from YYYY-MM-DD | --to YYYY-MM-DD
    --since-ts TS | --checkpoint NAME
    --cursor TOKEN
    --json

  search
    --page N                              Preferred paging flag (legacy: --cursor)
    --summary-fields a,b,c
    --json

  mentions / triage
    --from YYYY-MM-DD | --to YYYY-MM-DD
    --user USERNAME | --channel CHANNEL | --kind channel|dm|group
    --summary-fields a,b,c
    --checkpoint NAME                     Save latest seen ts for incremental triage
    --json

  thread-inbox
    --max-ts TS                           Preferred paging flag (legacy: --cursor)
    --summary-fields a,b,c
    --json

  export
    --format json|ndjson|csv
    --output PATH

  watch
    --interval SEC
    --iterations N                        0 means forever
    --checkpoint NAME
    --json

  cache-clear
    --include-workspace                   Also remove the selected active workspace marker
    --json

Shared / compatibility flags
    --cursor TOKEN                        Legacy generic paging flag; prefer --page or --max-ts when available
    --no-emoji                            Disable emoji output (or set NO_EMOJI=1)

Runtime flags
    --no-cache                            Bypass persistent read cache
    --refresh                             Force refetch and refresh cache entries
    --debug-cache                         Print cache-hit / miss diagnostics to stderr
    --debug-queue                         Print queue / pacing diagnostics to stderr
    --read-only                           Block mutating Slack actions such as send/react/draft writes

Examples
  slk read engineering 50 --threads --json
  slk mentions 20 --user alice --channel engineering --json --summary-fields text,permalink
  slk thread-inbox 20 --max-ts 1777357082.902859 --json
  slk channel-context engineering 30 --json
  slk triage 20 --checkpoint inbox-main --json
  slk export mentions 20 --format ndjson --output /tmp/mentions.ndjson
  slk watch triage 20 --interval 60 --iterations 5 --json
  slk cache-clear
  SLK_READ_ONLY=1 slk send engineering "hello"

Channels/conversations: name ("general"), ID ("C..."/"D..."/"G..."), @username, or user ID ("U...").
Docs: https://github.com/kimjisub/slack-personal-cli`;

async function main() {
  try {
    switch (command) {
      case "auth":
        await cmd.auth();
        break;

      case "channels":
      case "ch":
        await cmd.channels();
        break;

      case "dms":
      case "dm":
        await cmd.dms();
        break;

      case "read":
      case "r": {
        if (!args[1]) {
          console.error("Usage: slk read <channel|@user> [count] [--ts] [--threads] [--from YYYY-MM-DD] [--to YYYY-MM-DD]");
          process.exit(1);
        }
        const expandThreads = rawArgs.includes("--threads");
        const fromIdx = rawArgs.indexOf("--from");
        const toIdx = rawArgs.indexOf("--to");
        let oldest = null;
        let latest = null;
        const sinceTs = await resolveSinceTs();
        const cursor = parseCursor();
        const checkpoint = parseCheckpoint();
        if (fromIdx > -1 && rawArgs[fromIdx + 1]) oldest = String(new Date(rawArgs[fromIdx + 1]).getTime() / 1000);
        if (toIdx > -1 && rawArgs[toIdx + 1]) latest = String(new Date(rawArgs[toIdx + 1]).getTime() / 1000);
        let count = 20;
        for (let i = 2; i < args.length; i += 1) {
          if (/^\d+$/.test(args[i])) {
            count = parseInt(args[i], 10);
            break;
          }
        }
        const result = await cmd.read(args[1], count, { showTs, oldest, latest, sinceTs, cursor, expandThreads, json: outputJson });
        await saveCheckpoint(checkpoint, result?.messages?.at(-1)?.ts || null);
        break;
      }

      case "send":
      case "s":
        if (!args[1] || !args[2]) {
          console.error("Usage: slk send <channel> <message>");
          process.exit(1);
        }
        await cmd.send(args[1], args.slice(2).join(" "));
        break;

      case "search": {
        if (!args[1]) {
          console.error("Usage: slk search <query> [count]");
          process.exit(1);
        }
        const optionStart = rawArgs.findIndex((arg, idx) => idx > 0 && arg.startsWith("--"));
        const positionalArgs = (optionStart === -1 ? rawArgs.slice(1) : rawArgs.slice(1, optionStart)).filter(Boolean);
        const maybeCount = positionalArgs[positionalArgs.length - 1];
        const count = /^\d+$/.test(maybeCount) ? parseInt(maybeCount, 10) : 20;
        const queryParts = /^\d+$/.test(maybeCount) ? positionalArgs.slice(0, -1) : positionalArgs;
        await cmd.search(queryParts.join(" "), count, { json: outputJson, summaryFields: parseSummaryFields(), page: parsePage() ? parseInt(parsePage(), 10) || 1 : undefined });
        break;
      }

      case "mentions": {
        const fromIdx = rawArgs.indexOf("--from");
        const toIdx = rawArgs.indexOf("--to");
        const from = fromIdx > -1 && rawArgs[fromIdx + 1] ? rawArgs[fromIdx + 1] : null;
        const to = toIdx > -1 && rawArgs[toIdx + 1] ? rawArgs[toIdx + 1] : null;
        const count = /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : 20;
        const result = await cmd.mentions({ count, from, to, user: parseFilterUser(), channel: parseFilterChannel(), kind: parseKind(), json: outputJson, summaryFields: parseSummaryFields() });
        await saveCheckpoint(parseCheckpoint(), result?.items?.at(-1)?.ts || null);
        break;
      }

      case "inbox":
      case "triage": {
        const fromIdx = rawArgs.indexOf("--from");
        const toIdx = rawArgs.indexOf("--to");
        const from = fromIdx > -1 && rawArgs[fromIdx + 1] ? rawArgs[fromIdx + 1] : null;
        const to = toIdx > -1 && rawArgs[toIdx + 1] ? rawArgs[toIdx + 1] : null;
        const count = /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : 20;
        const result = await cmd.inbox({ count, from, to, user: parseFilterUser(), channel: parseFilterChannel(), kind: parseKind(), json: outputJson, summaryFields: parseSummaryFields() });
        await saveCheckpoint(parseCheckpoint(), detectCheckpointTs(result));
        break;
      }

      case "thread-unread":
      case "thread-inbox": {
        const count = /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : 20;
        await cmd.threadUnread({ limit: count, cursor: parseMaxTs(), json: outputJson, summaryFields: parseSummaryFields() });
        break;
      }

      case "context":
      case "channel-context":
        if (!args[1]) {
          console.error("Usage: slk context <channel> [count]");
          process.exit(1);
        }
        await cmd.contextSummary(args[1], {
          messageCount: /^\d+$/.test(args[2]) ? parseInt(args[2], 10) : 20,
          json: outputJson,
        });
        break;

      case "export": {
        if (!args[1]) {
          console.error("Usage: slk export <source> [source-args...] --format json|ndjson|csv [--output PATH]");
          process.exit(1);
        }
        const payload = await runStructuredSource(args[1], args.slice(2));
        const rows = flattenRows(payload);
        const format = parseFormat();
        const body = format === "json" ? JSON.stringify(payload, null, 2) : formatExport(rows, format);
        await maybeWriteOutput(body);
        await saveCheckpoint(parseCheckpoint(), detectCheckpointTs(payload));
        break;
      }

      case "watch": {
        if (!args[1]) {
          console.error("Usage: slk watch <source> [source-args...] [--interval SEC] [--iterations N]");
          process.exit(1);
        }
        const intervalMs = Math.max(1, parseIntervalSeconds()) * 1000;
        const iterations = Math.max(0, parseIterations());
        let previous = null;
        let tick = 0;
        while (iterations === 0 || tick < iterations) {
          tick += 1;
          const payload = await runStructuredSource(args[1], args.slice(2));
          const summary = summarizeWatchChange(previous, payload);
          if (!previous || summary.changed) {
            const line = outputJson
              ? JSON.stringify({ tick, changed: !previous ? true : summary.changed, summary }, null, 2)
              : `[watch ${tick}] changed=${!previous ? true : summary.changed} count=${summary.currentCount} latestTs=${summary.latestTs || "-"}`;
            console.log(line);
            await saveCheckpoint(parseCheckpoint(), detectCheckpointTs(payload));
          }
          previous = payload;
          if (iterations !== 0 && tick >= iterations) break;
          await sleep(intervalMs);
        }
        break;
      }

      case "cache-clear":
      case "clear-cache": {
        await cmd.cacheClear({
          stateRootDir: process.env.SLK_STATE_ROOT_DIR || null,
          includeWorkspace: rawArgs.includes("--include-workspace"),
          json: outputJson,
        });
        break;
      }

      case "thread":
      case "t":
        if (!args[1] || !args[2]) {
          console.error("Usage: slk thread <channel> <ts>");
          process.exit(1);
        }
        await cmd.thread(args[1], args[2], parseInt(args[3], 10) || 50, { json: outputJson, cursor: parseCursor() });
        break;

      case "permalink":
        if (!args[1] || !args[2]) {
          console.error("Usage: slk permalink <channel> <ts>");
          process.exit(1);
        }
        await cmd.permalink(args[1], args[2], { json: outputJson });
        break;

      case "users":
      case "u":
        await cmd.users();
        break;

      case "react":
        if (!args[1] || !args[2] || !args[3]) {
          console.error("Usage: slk react <channel> <ts> <emoji>");
          process.exit(1);
        }
        await cmd.react(args[1], args[2], args[3]);
        break;

      case "activity":
      case "a":
        await cmd.activity(false, undefined, { json: outputJson });
        break;

      case "unread":
      case "ur":
        await cmd.activity(true, undefined, { json: outputJson });
        break;

      case "starred":
      case "star":
        await cmd.starred();
        break;

      case "saved":
      case "sv":
        await cmd.saved(parseInt(args[1], 10) || 20, rawArgs.includes("--all"));
        break;

      case "pins":
      case "pin":
        if (!args[1]) {
          console.error("Usage: slk pins <channel>");
          process.exit(1);
        }
        await cmd.pins(args[1]);
        break;

      case "workspaces":
      case "ws":
        await cmd.workspaces();
        break;

      case "switch":
      case "sw":
        if (!args[1]) {
          console.error("Usage: slk switch <workspace-name|domain|team-id>");
          process.exit(1);
        }
        await cmd.switchWorkspace(args.slice(1).join(" "));
        break;

      case "drafts":
        await drafts.listDrafts();
        break;

      case "draft": {
        const sub = args[1];
        if (sub === "thread") {
          if (!args[2] || !args[3] || !args[4]) {
            console.error("Usage: slk draft thread <channel> <ts> <message>");
            process.exit(1);
          }
          await drafts.draftThread(args[2], args[3], args.slice(4).join(" "));
        } else if (sub === "user") {
          if (!args[2] || !args[3]) {
            console.error("Usage: slk draft user <user_id> <message>");
            process.exit(1);
          }
          await drafts.draftUser(args[2], args.slice(3).join(" "));
        } else if (sub === "drop") {
          if (!args[2]) {
            console.error("Usage: slk draft drop <draft_id>");
            process.exit(1);
          }
          await drafts.dropDraft(args[2]);
        } else {
          if (!sub || !args[2]) {
            console.error("Usage: slk draft <channel> <message>");
            process.exit(1);
          }
          await drafts.draftChannel(sub, args.slice(2).join(" "));
        }
        break;
      }

      case "help":
      case "-h":
      case "--help":
      case undefined:
        console.log(HELP);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
