---
name: slack-personal
description: Read, send, search, and manage Slack messages and DMs via the slk CLI. Supports multiple workspaces with switching. Use when the user asks to check Slack, read channels or DMs, send Slack messages, search Slack, check unreads, manage drafts, view saved items, switch Slack workspaces, or interact with Slack workspace. Also use for heartbeat Slack checks. Triggers on "check slack", "any slack messages", "send on slack", "slack unreads", "search slack", "slack threads", "draft on slack", "read slack dms", "message on slack", "switch workspace", "slack workspaces".
homepage: https://www.npmjs.com/package/slkcli
metadata: {"moltbot":{"emoji":"💬","requires":{"bins":["slk"]},"install":[{"id":"npm","kind":"node","package":"slkcli","bins":["slk"],"label":"Install slk (npm)"}],"os":["darwin"]}}
---

# slk — Slack CLI

Session-based Slack CLI for macOS. Auto-authenticates from the Slack desktop app — no tokens, no OAuth, no app installs. Acts as your user (`xoxc-` session tokens).

## Commands

Preferred public names:
- `triage` — synthesized action queue (legacy alias: `inbox`)
- `thread-inbox` — Slack thread inbox / subscribed-thread view (legacy alias: `thread-unread`)
- `channel-context` — synthesized channel summary (legacy alias: `context`)

```bash
# Workspace
slk auth
slk workspaces
slk switch <name|domain|id>

# Conversations & people
slk channels
slk dms
slk users
slk read <conversation> [count]
slk search <query> [count]
slk pins <conversation>
slk saved [count] [--all]

# Messages & threads
slk thread <conversation> <ts> [count]
slk thread-inbox [count]
slk permalink <conversation> <ts>
slk send <conversation> <message>
slk react <conversation> <ts> <emoji>

# Agent-facing synthesized views
slk mentions [count]
slk triage [count]
slk unread
slk activity
slk channel-context <channel> [count]
slk starred

# Utilities
slk export <source> ...
slk watch <source> ...
slk cache-clear

# Drafts
slk draft <conversation> <message>
slk draft thread <conversation> <ts> <message>
slk draft user <user_id> <message>
slk drafts
slk draft drop <draft_id>
```

### Scoped options

- `read` — `--threads`, `--from`, `--to`, `--since-ts`, `--checkpoint`, `--cursor`, `--json`
- `search` — `--page` (preferred), `--cursor` (legacy), `--summary-fields`, `--json`
- `mentions` / `triage` — `--from`, `--to`, `--user`, `--channel`, `--kind`, `--summary-fields`, `--checkpoint`, `--json`
- `thread-inbox` — `--max-ts` (preferred), `--cursor` (legacy), `--summary-fields`, `--json`
- `export` — `--format`, `--output`
- `watch` — `--interval`, `--iterations`, `--checkpoint`, `--json`
- `cache-clear` — `--include-workspace`, `--json`
- runtime safety — `--read-only` or `SLK_READ_ONLY=1` blocks mutating Slack actions

## Auth

Automatic — extracts session tokens from Slack desktop app's LevelDB (`localConfig_v2`) + decrypts cookie from macOS Keychain.

**First run:** macOS will show a Keychain dialog asking to allow access to "Slack Safe Storage":
- **Allow** — one-time access, prompted again next time
- **Always Allow** — permanent, no future prompts (convenient but any process running as your user can extract credentials silently)
- **Deny** — blocks access, slk cannot authenticate

**Token cache:** `~/.local/slk/token-cache.json` — auto-validated, auto-refreshed on `invalid_auth`.
**Response cache:** `~/.local/slk/cache/` — TTL-based cache for safe read endpoints.
**Queue / rate state:** `~/.local/slk/locks/` + `~/.local/slk/runtime/rate-state.json`.
**Active workspace:** `~/.local/slk/active-workspace` — stores the selected team ID. Delete to reset to default.

If auth fails (token rotated, Slack logged out):
```bash
rm ~/.local/slk/token-cache.json
slk auth
```

Slack desktop app must be installed and logged in. Does not need to be running if token is cached.

## Workspaces

All workspaces logged in to the Slack desktop app are available. Tokens are extracted from `localConfig_v2` in LevelDB.

```bash
slk workspaces                        # List all workspaces (shows ← active marker)
slk switch candid                     # Switch by name (fuzzy match)
slk switch unipad-team                # Switch by domain
slk switch T05BFH4UW5T               # Switch by team ID
slk auth                              # Verify current workspace
```

The `switch` command matches against workspace name, domain, or team ID (case-insensitive, partial match supported). After switching, all subsequent commands operate on the selected workspace until switched again.

### Canonical local repo path

For this Hermes skill, the maintained repo checkout should live at:

```bash
~/.hermes/skills/productivity/slack-personal
```

Do **not** relocate it to ad-hoc paths like `~/.hermes/tools/slkcli` just to make the path look cleaner. Keep it in the standard Hermes skills tree under `~/.hermes/skills/productivity/` so docs, memory, and local references stay aligned.

If you want a shorter command path for day-to-day work, prefer shell aliases or `npm link` rather than moving the repo itself.

### Important local fallback

In some environments, the `slk` found in `PATH` can be an older global install that does **not** expose `workspaces` / `switch`, while the maintained repo checkout of `slkcli` does support them.

When `slk workspaces` returns `Unknown command`, verify which binary is active and use the repo copy directly:

```bash
command -v slk
node ~/.hermes/skills/productivity/slack-personal/bin/slk.js workspaces
node ~/.hermes/skills/productivity/slack-personal/bin/slk.js switch alpaon
slk auth
```

If the repo copy is the desired build, replace the global shim with the current checkout:

```bash
cd ~/.hermes/skills/productivity/slack-personal
npm link
slk workspaces
```

After linking, `command -v slk` may stay the same while its realpath changes to the repo checkout's `bin/slk.js`.

## Reading Threads

Threads require a Slack timestamp. Use `--ts` to get it, then read the thread:

```bash
slk read general 10 --ts
# Output: [1/30/2026, 11:41 AM ts:1769753479.788949] User [3 replies]: ...

slk thread general 1769753479.788949
```

## Runtime hardening

All Slack API access now goes through a shared local runtime layer:

- **Host-level queue:** multiple `slk` processes serialize API calls through a shared lock instead of firing in parallel.
- **Rate-limit handling:** `429 Retry-After` is respected, with bounded retry and shared pacing across separate invocations.
- **Persistent read cache:** safe read endpoints (for example `users.list`, `conversations.list`, `conversations.history`, `conversations.replies`, `search.messages`) can be served from `~/.local/slk/cache/`.
- **Write invalidation:** mutating endpoints bypass cache and invalidate related read entries.
- **Read-only safety mode:** set `--read-only` or `SLK_READ_ONLY=1` to block mutating Slack actions during automation runs.

Useful runtime controls:

```bash
slk read general 20 --no-cache
slk read general 20 --refresh
slk mentions 20 --from 2026-02-01 --json
slk mentions 20 --user alice --channel engineering --json --summary-fields text,permalink
slk triage --json
slk read engineering 100 --checkpoint morning-eng --json
slk thread-inbox --json
slk thread-inbox 20 --max-ts 1777357082.902859 --json
slk export mentions 20 --user alice --format ndjson --summary-fields text,permalink
slk watch triage 20 --checkpoint inbox-main --interval 60 --iterations 5 --json
slk channel-context engineering 20 --json
slk unread --debug-cache
slk unread --debug-queue
slk cache-clear
SLK_READ_ONLY=1 slk react C123 1714280000.000100 thumbsup
```

## Agent command-selection guide

Use the narrowest command that matches the job:

- Need direct asks to the current user → `slk mentions`
- Need one combined action queue → `slk triage`
- Need subscribed thread follow-up / reply pressure → `slk thread-inbox`
- Need one channel's purpose and recent state before replying → `slk channel-context`
- Need exact history from one conversation → `slk read`
- Need one exact thread → `slk thread`
- Need a portable dataset for downstream analysis → `slk export`
- Need recurring checks without writing your own shell loop → `slk watch`

## Agent Workflow Examples

- **Heartbeat/cron unread check** — `slk unread` → `slk read <channel>` for channels that need attention
- **Mentions triage** — `slk mentions --json` to collect direct asks, then `slk permalink` / `slk thread` for drill-down
- **Unified agent inbox** — `slk triage --json` to merge mentions, unreads, thread pressure, and saved items into one feed
- **Unread thread triage** — `slk thread-inbox --json` to inspect thread inbox entries with direct permalinks and unread replies
- **Channel context restoration** — `slk channel-context <channel> --json` to recover topic, purpose, pins, and recent messages before responding
- **Structured export** — `slk export <source> --format ndjson|csv` to hand off Slack snapshots into downstream analysis or archival systems
- **Polling / heartbeat helper** — `slk watch <source> --interval 60 --iterations 5 --json` for lightweight recurring checks without writing a separate loop
- **Save & pick up** — Human saves threads in Slack ("Save for later"). Agent runs `slk saved` during heartbeat, reads full threads with `slk thread`, summarizes or extracts action items
- **Daily channel digest** — `slk read <channel> 100` across key channels → compile decisions, open questions, action items → `slk send daily-digest "📋 ..."`
- **Weekly DM summary** — `slk read @boss 200 --from 2026-02-01 --threads` → extract action items, decisions, context
- **Thread monitoring** — Watch specific threads for new replies (incidents, PR reviews, decisions)
- **Draft for human review** — `slk draft <channel> "..."` posts to Slack's editor UI for human to review before sending
- **Search-driven context** — `slk search "deployment process"` or `slk pins <channel>` to pull context before answering questions

## Limitations

- **macOS only** — uses Keychain + Electron storage paths
- **Session-based** — acts as your user, not a bot. Be mindful of what you send
- **Draft drop** may fail with `draft_has_conflict` if Slack has that conversation open
- **Session token** expires on logout — keep Slack app running or rely on cached token

## Missing Features & Issues

Create PR or Report Issue at: https://github.com/kimjisub/slkcli
