---
name: slack-personal
description: Read, send, search, and manage Slack messages and DMs via the slk CLI. Supports multiple workspaces with switching. Use when the user asks to check Slack, read channels or DMs, send Slack messages, search Slack, check unreads, manage drafts, view saved items, switch Slack workspaces, or interact with Slack workspace. Also use for heartbeat Slack checks. Triggers on "check slack", "any slack messages", "send on slack", "slack unreads", "search slack", "slack threads", "draft on slack", "read slack dms", "message on slack", "switch workspace", "slack workspaces".
homepage: https://github.com/kimjisub/slack-personal-cli
metadata: {"moltbot":{"emoji":"💬","requires":{"bins":["slk"]},"install":[{"id":"npm","kind":"node","package":"github:kimjisub/slack-personal-cli","bins":["slk"],"label":"Install slack-personal-cli from GitHub"}],"os":["darwin"]}}
---

# slack-personal-cli — Slack CLI

Session-based Slack CLI for macOS. Auto-authenticates from the Slack desktop app — no tokens, no OAuth, no app installs. Acts as your user (`xoxc-` session tokens).

**vs other Slack options:** unlike the official Slack MCP (`slackapi/slack-mcp-plugin`, OAuth, one workspace) or `korotovsky/slack-mcp-server` (bring-your-own `xoxc`/`xoxd`/`xoxp`/`xoxb` token, one workspace per token), `slk` needs **no token setup** and works across **all signed-in workspaces at once** (`-A`). It's a CLI, so a human and an agent (over Bash) use the same tool. Unique commands: `inbox -A` (cross-workspace unread digest), `owed` (mentions you haven't answered), `search -A`. macOS-only; full-account access. See README "How it compares" for the full table.

## Setup & updates

You're reading this as an already-registered skill, so registration itself is done. This section is for the agent maintaining the install. The skill has **two parts that must stay version-aligned**:

1. **the `slk` binary on `PATH`** — what actually talks to Slack
2. **this `SKILL.md`** — the command reference you're reading

New commands land in both at once, so a stale binary or a stale skill file will disagree. Keep them on the same version.

> **First-time install from scratch** (neither part exists yet — e.g. registering this skill in a brand-new harness) is a human bootstrap step, not something to run from here. See the [README → Install](https://github.com/kimjisub/slack-personal-cli#install).

### 1. Check current state

```bash
slk --version   # → slk 0.6.1 (or newer). `command not found` = binary missing
slk auth        # confirms credentials resolve for the active workspace
```

### 2. Install the binary (only if missing)

This repo *is* the package; it is **not** on the npm registry. Requires Node.js ≥ 18 and macOS with the Slack desktop app installed and logged in.

```bash
npm install -g github:kimjisub/slack-personal-cli
```

### 3. Check whether an update is available

Updating only matters once installed, so check before acting. Compare the installed binary against the latest on `main`:

```bash
slk --version   # installed version
curl -s https://raw.githubusercontent.com/kimjisub/slack-personal-cli/main/package.json \
  | grep '"version"'   # latest published to the repo
```

An update is worth doing when the two versions differ, or when a command documented in this file isn't recognized by the installed binary (a sign the skill file is ahead of the binary). If they already match, **do nothing** — there's no update to apply.

### 4. Apply the update — confirm with the user first

Updating replaces a global binary **and** overwrites the registered skill file. Both modify the user's machine, so **do not run these automatically.** Tell the user the installed → latest version jump and ask before proceeding. Once they agree, refresh **both** parts together so they stay aligned:

```bash
# a. binary — npm re-fetches the latest main
npm install -g github:kimjisub/slack-personal-cli

# b. this skill file — overwrite the registered copy with the latest from the repo
#    (path shown for user-level Claude Code; swap in your harness's skill dir)
curl -sL https://raw.githubusercontent.com/kimjisub/slack-personal-cli/main/SKILL.md \
  -o ~/.claude/skills/slack-personal/SKILL.md
```

After step (b), re-read the refreshed `SKILL.md` before relying on any newly documented command — the copy you started from may predate it. Confirm the result with `slk --version`.

### How to invoke

**Always call the CLI as `slk <command>`.** The global binary is on `PATH` and is the correct invocation path for every harness (Claude Code, Codex, Copilot CLI, Gemini CLI, plain shell).

> **Do NOT use `node <path>/bin/slk.js` as a workaround.** That pattern was a necessary fallback only before v0.3.1, when a `process.argv[1]` vs `import.meta.url` mismatch caused the global `slk` to exit silently from symlinked installs. v0.3.1+ resolves the symlink before comparing, so the global binary works correctly. If `slk` produces no output, upgrade instead of falling back to `node`:
>
> ```bash
> slk --version           # confirms which version is on PATH
> npm install -g github:kimjisub/slack-personal-cli   # upgrades from main
> ```

## Commands

```bash
# Auth
slk auth                              # Test authentication, show user/team

# Core read/write
slk channels                          # List channels (alias: ch)
slk dms                               # List DM conversations with IDs (alias: dm)
slk users                             # List workspace users (alias: u)
slk read <channel> [count]            # Read recent messages, default 20 (alias: r)
slk read @username [count]            # Read DMs by username
slk read <channel> --threads          # Auto-expand all threads
slk read <channel> --from 2026-02-01  # Date range filter
slk thread <channel> <ts> [count]     # Read thread replies, default 50 (alias: t)
slk search <query> [count]            # Search messages (add -A to search all workspaces)
slk owed [--days N]                   # Mentions you haven't answered (emoji reaction counts as answered)
slk send <channel> <message>          # Send a message (alias: s)
slk send <channel> <message> --thread <ts>  # Send into an existing thread
slk react <channel> <ts> <emoji>      # React to a message
slk mark <channel>                    # Mark a channel as read (opt-in; -w supported, not -A)
slk reply <channel> <ts> <message>    # Reply to a thread root or thread message
slk message link <channel> <ts>       # Print the Slack permalink for one message
slk message show <channel> <ts>       # Show one exact message
slk message context <channel> <ts> [before] [after]  # Show nearby context

# Preferred workspace family
slk workspace list                    # List all logged-in workspaces
slk workspace use <name|domain|id>    # Switch active workspace
slk workspace current                 # Show the current workspace

# Preferred inbox family
slk inbox activity                    # All channels with unread/mention counts
slk inbox unread                      # Only unreads, excludes muted
slk inbox saved [count] [--all]       # Saved for later items
slk inbox starred                     # VIP users + starred items
slk channel pins <channel>            # Pinned items in a channel

# Preferred drafts family (synced to Slack editor UI)
slk draft list                        # List active drafts
slk draft channel <channel> <message> # Draft a channel message
slk draft thread <ch> <ts> <message>  # Draft a thread reply
slk draft dm <user_id|@username> <message>  # Draft a DM
slk draft drop <draft_id>             # Delete a draft

# Workspace scope (default = active workspace)
# Resolution order: -w flag > SLACK_CLI_WORKSPACE env > `workspace use` > sole login > error
slk inbox unread -w candid            # -w <name|id>: a specific workspace, no active switch
slk inbox unread -A                   # -A: aggregate across ALL logged-in workspaces (mutually exclusive with -w)
SLACK_CLI_WORKSPACE=candid slk owed   # env override for a session/script
slk search "deploy" -A                # cross-workspace search, merged newest-first
slk owed -A --days 14                 # mentions owed across every workspace
slk inbox unread -A --json | jq .     # --json: machine-readable output (inbox/owed/search/mark)

```

Channel accepts name (`general`), ID (`C08A8AQ2AFP`), `@username` for DMs, or user ID (`U07RQTFCLUC`).

## Auth

Automatic — extracts session tokens from Slack desktop app's LevelDB (`localConfig_v2`) + decrypts cookie from macOS Keychain.

**First run:** macOS will show a Keychain dialog asking to allow access to "Slack Safe Storage":
- **Allow** — one-time access, prompted again next time
- **Always Allow** — permanent, no future prompts (convenient but any process running as your user can extract credentials silently)
- **Deny** — blocks access, slk cannot authenticate

**Token cache:** `~/.local/slack-personal-cli/token-cache.json` — auto-validated, auto-refreshed on `invalid_auth`.
**Active workspace:** `~/.local/slack-personal-cli/active-workspace` — stores the selected team ID. Delete to reset to default.
**Runtime coordination:** `~/.local/slack-personal-cli/runtime/` — shared pacing + 429 cooldown state for concurrent local `slk` processes.

If auth fails (token rotated, Slack logged out):
```bash
rm ~/.local/slack-personal-cli/token-cache.json
slk auth
```

Slack desktop app must be installed and logged in. Does not need to be running if token is cached.

## Workspaces

All workspaces logged in to the Slack desktop app are available. Tokens are extracted from `localConfig_v2` in LevelDB.

```bash
slk workspace list                    # List all workspaces (shows ← active marker)
slk workspace current                 # Show the current selection / default
slk workspace use candid              # Switch by name (fuzzy match)
slk workspace use unipad-team         # Switch by domain
slk workspace use T05BFH4UW5T         # Switch by team ID
slk auth                              # Verify current workspace
```

The `workspace use` command matches against workspace name, domain, or team ID (case-insensitive, partial match supported). After switching, all subsequent commands operate on the selected workspace until switched again.

## Reading Threads

Threads require a Slack timestamp. Use `--ts` to get it, then read the thread or act on one exact message:

```bash
slk read general 10 --ts
# Output: [1/30/2026, 11:41 AM ts:1769753479.788949] User [3 replies]: ...

slk thread general 1769753479.788949
slk reply general 1769753479.788949 "on it"
slk send general "same effect via send" --thread 1769753479.788949
slk message link general 1769753479.788949
slk message show general 1769753479.788949
slk message context general 1769753479.788949 2 2
```

## Agent Workflow Examples

- **Heartbeat/cron unread check** — `slk inbox unread` → `slk read <channel>` for channels that need attention
- **Save & pick up** — Human saves threads in Slack ("Save for later"). Agent runs `slk inbox saved` during heartbeat, reads full threads with `slk thread`, summarizes or extracts action items
- **Daily channel digest** — `slk read <channel> 100` across key channels → compile decisions, open questions, action items → `slk send daily-digest "📋 ..."`
- **Weekly DM summary** — `slk read @boss 200 --from 2026-02-01 --threads` → extract action items, decisions, context
- **Thread monitoring** — `slk thread <channel> <ts>` to inspect the thread, then `slk reply <channel> <ts> "..."` or `slk send <channel> "..." --thread <ts>` to answer in place
- **Message-level navigation** — `slk message link <channel> <ts>` for the permalink, `slk message show <channel> <ts>` for the exact item, `slk message context <channel> <ts>` for surrounding context
- **Draft for human review** — `slk draft channel <channel> "..."` posts to Slack's editor UI for human to review before sending
- **Search-driven context** — `slk search "deployment process"` or `slk channel pins <channel>` to pull context before answering questions
- **Concurrent local automation** — Multiple agents or cron jobs can invoke `slk` safely; requests are paced through one shared local runtime lane and 429 cooldowns propagate automatically

## Live Slack integration tests

The repo now supports opt-in real-Slack integration tests in `tests/live-slack.test.js`.

- Default `npm test` remains safe because the live file auto-skips unless `SLK_LIVE_TESTS=1` is set.
- Read-only live verification requires:
  - `SLK_LIVE_TESTS=1`
  - `SLK_LIVE_CHANNEL`
  - `SLK_LIVE_MESSAGE_TS`
- Write verification additionally requires:
  - `SLK_LIVE_ALLOW_WRITE=1`
  - `SLK_LIVE_THREAD_TS`

Run:

```bash
npm test
SLK_LIVE_TESTS=1 SLK_LIVE_CHANNEL=general SLK_LIVE_MESSAGE_TS=1769753479.788949 npm run test:live
SLK_LIVE_TESTS=1 SLK_LIVE_ALLOW_WRITE=1 SLK_LIVE_CHANNEL=general SLK_LIVE_MESSAGE_TS=1769753479.788949 SLK_LIVE_THREAD_TS=1769753479.788949 npm run test:live
```

The write tests intentionally require a second opt-in so they do not post to Slack by accident.

## Limitations

- **macOS only** — uses Keychain + Electron storage paths
- **Session-based** — acts as your user, not a bot. Be mindful of what you send
- **Draft drop** may fail with `draft_has_conflict` if Slack has that conversation open
- **Session token** expires on logout — keep Slack app running or rely on cached token
- **`-A` is paced by the rate limiter** — sweeping many workspaces is serialized
  (~1.2s/request), so a full cross-workspace run can take a while
- **Non-ASCII workspace names** can't always be recovered from the desktop app's
  LevelDB (multi-byte names lose information during extraction). Labels fall back
  to the workspace domain in that case, and IDs/domains are unaffected, so
  commands and `-w <name|id>` still work correctly

## Missing Features & Issues

Create PR or Report Issue at: https://github.com/kimjisub/slack-personal-cli
