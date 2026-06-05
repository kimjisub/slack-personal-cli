#!/usr/bin/env node

/**
 * slack-personal-cli — Slack CLI with auto-auth from macOS Slack desktop app.
 */

import * as defaultCmd from "../src/commands.js";
import * as defaultDrafts from "../src/drafts.js";
import { setJsonMode } from "../src/output.js";
import { pathToFileURL } from "node:url";
import { realpathSync, readFileSync } from "node:fs";

function buildHelp({ supportsEmoji = true } = {}) {
  const e = (emoji, fallback = "") => supportsEmoji ? `${emoji} ` : fallback;

  return `${e("💬")}slk — Slack CLI for macOS (package: slack-personal-cli)

Preferred command families:
  slk workspace list                     List all logged-in workspaces
  slk workspace use <name|id>            Switch active workspace
  slk workspace current                  Show the current workspace
  slk inbox activity                     Channel activity with unread/mention counts
  slk inbox unread                       Channels with unreads (excludes muted)
  slk inbox saved [n] [--all]            Saved for later items
  slk inbox starred                      VIP users + starred items
  slk channel pins <ch>                  Pinned items in a channel
  slk draft list                         List active drafts
  slk draft channel <ch> <msg>           Draft a channel message
  slk draft thread <ch> <ts> <msg>       Draft a thread reply
  slk draft dm <user_id> <msg>           Draft a DM
  slk draft drop <id>                    Delete a draft
  slk reply <ch> <ts> <msg>              Send a thread reply
  slk message link <ch> <ts>             Show the Slack permalink for a message
  slk message show <ch> <ts>             Show one exact message
  slk message context <ch> <ts> [b] [a]  Show surrounding message context

Core commands:
  slk auth                               Test auth, show user/team info
  slk channels          (ch)             List channels with member counts
  slk dms               (dm)             List DM conversations with IDs
  slk users             (u)              List workspace users with statuses
  slk read <ch> [n]     (r)              Read last n messages (default: 20)
  slk send <ch> <msg>   (s)              Send a message
  slk search <query> [n]                 Search messages (add -A to search all workspaces)
  slk owed [--days N]                     Mentions you haven't answered (emoji counts as answered)
  slk thread <ch> <ts> [n] (t)           Read thread replies (default: 50)
  slk react <ch> <ts> <emoji>            Add emoji reaction
  slk mark <ch>                          Mark a channel as read (opt-in; -w supported, not -A)

Workspace scope (default: active workspace):
  -w, --workspace <name|id>              Target a specific workspace for this command
  -A, --all-workspaces                   Run across ALL logged-in workspaces
                                         (supported: inbox activity, inbox unread)

Settings:
  --json                                 Machine-readable JSON output (inbox, owed, search, mark)
  --ts                                   Show raw Slack timestamps (for thread commands)
  --threads                              Auto-expand threads when reading
  --from YYYY-MM-DD                      Read messages from this date
  --to YYYY-MM-DD                        Read messages until this date
  --all                                  Include completed items in saved views
  --no-emoji                             Disable emoji output (or set NO_EMOJI=1)
  --version, -v                          Print the CLI version

Channels: name ("general"), ID ("C08A8AQ2AFP"), @username, or user ID ("U...").
DMs: use @username or user ID to send/read DMs. Aliases shown in parens.

Examples:
  slk workspace list
  slk workspace use alpaon
  slk workspace current
  slk inbox unread
  slk channel pins general
  slk draft channel general "PR summary..."
  slk draft dm U123456 "hey!"
  slk reply general 1714280000.000100 "on it"
  slk message link general 1714280000.000100
  slk message context general 1714280000.000100 2 2
  slk read general 50
  slk read @andrej 100 --threads
  slk send engineering "build passed"
  slk search "deploy failed" 10

Auth: reads credentials from the Slack desktop app automatically.
Cache: ~/.local/slack-personal-cli/token-cache.json (auto-validated, auto-refreshed).
Docs:  https://github.com/kimjisub/slack-personal-cli`;
}

function parseNumericArg(args, { startIndex = 0, fallback = 20 } = {}) {
  for (let i = startIndex; i < args.length; i += 1) {
    if (/^\d+$/.test(args[i])) return parseInt(args[i], 10);
  }
  return fallback;
}

function parseReadWindow(args) {
  const fromIdx = args.indexOf("--from");
  const toIdx = args.indexOf("--to");
  let oldest = null;
  let latest = null;

  if (fromIdx > -1 && args[fromIdx + 1]) {
    oldest = String(new Date(args[fromIdx + 1]).getTime() / 1000);
  }
  if (toIdx > -1 && args[toIdx + 1]) {
    latest = String(new Date(args[toIdx + 1]).getTime() / 1000);
  }

  return { oldest, latest };
}

function parseSendArgs(args) {
  const threadIdx = args.indexOf("--thread");
  let threadTs = null;
  let messageParts = [];

  if (threadIdx > -1) {
    threadTs = args[threadIdx + 1] || null;
    messageParts = args.slice(2, threadIdx);
  } else {
    messageParts = args.slice(2);
  }

  return {
    threadTs,
    message: messageParts.join(" "),
  };
}

function usageError(consoleObj, exit, message) {
  consoleObj.error(message);
  return exit(1);
}

// Extract cross-workspace scope flags before positional parsing.
// Uses `-A`/`--all-workspaces` (not `--all`, which `inbox saved` already uses
// to mean "include completed").
function parseScopeFlags(args) {
  const rest = [];
  let workspace = null;
  let all = false;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "-A" || a === "--all-workspaces") {
      all = true;
      continue;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "-w" || a === "--workspace") {
      workspace = args[i + 1] || null;
      i += 1;
      continue;
    }
    rest.push(a);
  }

  return { workspace, all, json, rest };
}

export async function runCli(rawArgs = process.argv.slice(2), deps = {}) {
  const { workspace, all, json, rest } = parseScopeFlags([...rawArgs]);
  const args = rest;
  const scope = { workspace, all };
  const hasScope = Boolean(workspace) || all;
  (deps.setJsonMode ?? setJsonMode)(json);
  const command = args[0];
  const cmd = deps.cmd ?? defaultCmd;
  const drafts = deps.drafts ?? defaultDrafts;
  const consoleObj = deps.console ?? console;
  const exit = deps.exit ?? ((code) => process.exit(code));
  const supportsEmoji = !process.env.NO_EMOJI && !args.includes("--no-emoji");
  const showTs = args.includes("--ts");
  const HELP = buildHelp({ supportsEmoji });

  switch (command) {
    case "auth":
      return cmd.auth();

    case "channels":
    case "ch":
      return cmd.channels();

    case "dms":
    case "dm":
      return cmd.dms();

    case "users":
    case "u":
      return cmd.users();

    case "read":
    case "r": {
      if (!args[1]) return usageError(consoleObj, exit, "Usage: slk read <channel|@user> [count] [--ts] [--threads] [--from YYYY-MM-DD] [--to YYYY-MM-DD]");
      const expandThreads = args.includes("--threads");
      const { oldest, latest } = parseReadWindow(args);
      const count = parseNumericArg(args, { startIndex: 2, fallback: 20 });
      return cmd.read(args[1], count, { showTs, oldest, latest, expandThreads });
    }

    case "send":
    case "s": {
      if (!args[1] || !args[2]) return usageError(consoleObj, exit, "Usage: slk send <channel> <message> [--thread <ts>]");
      const { message, threadTs } = parseSendArgs(args);
      if (!message) return usageError(consoleObj, exit, "Usage: slk send <channel> <message> [--thread <ts>]");
      if (args.includes("--thread") && !threadTs) return usageError(consoleObj, exit, "Usage: slk send <channel> <message> [--thread <ts>]");
      return cmd.send(args[1], message, threadTs ? { threadTs } : {});
    }

    case "reply":
      if (!args[1] || !args[2] || !args[3]) return usageError(consoleObj, exit, "Usage: slk reply <channel> <ts> <message>");
      return cmd.reply(args[1], args[2], args.slice(3).join(" "));

    case "search": {
      if (!args[1]) return usageError(consoleObj, exit, "Usage: slk search <query> [count] [-w <ws> | -A]");
      const scopeArgs = hasScope ? [scope] : [];
      // A trailing bare number is the result count, not part of the query.
      const last = args[args.length - 1];
      const hasCount = args.length > 2 && /^\d+$/.test(last);
      const count = hasCount ? parseInt(last, 10) : 20;
      const query = (hasCount ? args.slice(1, -1) : args.slice(1)).join(" ");
      return cmd.search(query, count, ...scopeArgs);
    }

    case "owed": {
      const dIdx = args.indexOf("--days");
      const days = dIdx > -1 ? parseInt(args[dIdx + 1], 10) || 30 : 30;
      return cmd.owed({ workspace, all, days });
    }

    case "mark": {
      if (!args[1]) return usageError(consoleObj, exit, "Usage: slk mark <channel> [-w <ws>]");
      return cmd.mark(args[1], { workspace, all });
    }

    case "thread":
    case "t":
      if (!args[1] || !args[2]) return usageError(consoleObj, exit, "Usage: slk thread <channel> <ts> [count]");
      return cmd.thread(args[1], args[2], parseInt(args[3], 10) || 50);

    case "react":
      if (!args[1] || !args[2] || !args[3]) return usageError(consoleObj, exit, "Usage: slk react <channel> <ts> <emoji>");
      return cmd.react(args[1], args[2], args[3]);

    case "workspace": {
      const sub = args[1];
      if (!sub || sub === "list") return cmd.workspaces();
      if (sub === "use") {
        if (!args[2]) return usageError(consoleObj, exit, "Usage: slk workspace use <workspace-name|domain|team-id>");
        return cmd.switchWorkspace(args.slice(2).join(" "));
      }
      if (sub === "current") return cmd.currentWorkspace();
      return usageError(consoleObj, exit, "Usage: slk workspace <list|use|current>");
    }


    case "inbox": {
      const sub = args[1];
      const scopeArgs = hasScope ? [scope] : [];
      if (!sub || sub === "activity") return cmd.activity(false, ...scopeArgs);
      if (sub === "unread") return cmd.activity(true, ...scopeArgs);
      if (sub === "saved") return cmd.saved(parseInt(args[2], 10) || 20, args.includes("--all"));
      if (sub === "starred") return cmd.starred();
      return usageError(consoleObj, exit, "Usage: slk inbox <activity|unread|saved|starred>");
    }


    case "channel": {
      const sub = args[1];
      if (sub === "pins") {
        if (!args[2]) return usageError(consoleObj, exit, "Usage: slk channel pins <channel>");
        return cmd.pins(args[2]);
      }
      return usageError(consoleObj, exit, "Usage: slk channel pins <channel>");
    }

    case "message": {
      const sub = args[1];
      if (sub === "link") {
        if (!args[2] || !args[3]) return usageError(consoleObj, exit, "Usage: slk message link <channel> <ts>");
        return cmd.permalink(args[2], args[3]);
      }
      if (sub === "show") {
        if (!args[2] || !args[3]) return usageError(consoleObj, exit, "Usage: slk message show <channel> <ts>");
        return cmd.showMessage(args[2], args[3]);
      }
      if (sub === "context") {
        if (!args[2] || !args[3]) return usageError(consoleObj, exit, "Usage: slk message context <channel> <ts> [before] [after]");
        const before = parseInt(args[4], 10) || 2;
        const after = parseInt(args[5], 10) || before;
        return cmd.messageContext(args[2], args[3], before, after);
      }
      return usageError(consoleObj, exit, "Usage: slk message <link|show|context> ...");
    }


    case "draft": {
      const sub = args[1];
      if (sub === "list") return drafts.listDrafts();
      if (sub === "channel") {
        if (!args[2] || !args[3]) return usageError(consoleObj, exit, "Usage: slk draft channel <channel> <message>");
        return drafts.draftChannel(args[2], args.slice(3).join(" "));
      }
      if (sub === "thread") {
        if (!args[2] || !args[3] || !args[4]) return usageError(consoleObj, exit, "Usage: slk draft thread <channel> <ts> <message>");
        return drafts.draftThread(args[2], args[3], args.slice(4).join(" "));
      }
      if (sub === "dm") {
        if (!args[2] || !args[3]) return usageError(consoleObj, exit, "Usage: slk draft dm <user_id> <message>");
        return drafts.draftDm(args[2], args.slice(3).join(" "));
      }
      if (sub === "drop") {
        if (!args[2]) return usageError(consoleObj, exit, "Usage: slk draft drop <draft_id>");
        return drafts.dropDraft(args[2]);
      }
      return usageError(consoleObj, exit, "Usage: slk draft <list|channel|thread|dm|drop> ...");
    }

    case "version":
    case "-v":
    case "--version": {
      const pkgUrl = new URL("../package.json", import.meta.url);
      const { version } = JSON.parse(readFileSync(pkgUrl, "utf8"));
      consoleObj.log(`slk ${version}`);
      return;
    }

    case "help":
    case "-h":
    case "--help":
    case undefined:
      consoleObj.log(HELP);
      return;

    default:
      consoleObj.error(`Unknown command: ${command}`);
      consoleObj.log(HELP);
      return exit(1);
  }
}

async function main() {
  try {
    await runCli();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Resolve symlinks before comparing argv[1] to import.meta.url.
// Global npm bins are symlinks (e.g. .../bin/slk → .../lib/node_modules/.../bin/slk.js),
// and Node resolves ESM module URLs to the real path. Without realpath, the comparison
// fails for the global `slk`, the guard skips main(), and the command exits silently.
const argv1 = process.argv[1];
const isMain =
  argv1 &&
  import.meta.url === pathToFileURL(realpathSync(argv1)).href;
if (isMain) {
  main();
}
