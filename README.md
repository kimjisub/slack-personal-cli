# slk 💬 — macOS Slack CLI for personal automation and agent workflows

`slk` is a Slack command-line tool for macOS that auto-extracts auth from the local Slack desktop app. Read channels, search messages, inspect unreads and thread inboxes, manage drafts, and send messages from the terminal — without creating a Slack app or manually pasting tokens.

Built for local AI agents, terminal-heavy workflows, and power users who want Slack access from the command line.

> **Not affiliated with Slack.** This is an independent Slack CLI built for personal productivity and agent automation. It uses session credentials from the Slack desktop app and works only on macOS. Use at your own discretion.
>
> **Security / policy warning:** `slk` does **not** use Slack's official OAuth flow. It reads locally available Slack session artifacts from the macOS desktop app (Keychain + cookie store + local app storage) and reuses them to act as the signed-in user. This is intended for personal, local automation on a machine you control. It may be inappropriate for shared machines, managed environments, or broad public distribution without additional safeguards and policy review.

## Release status

`slkcli@0.2.0` is open-source-ready for public release as a macOS personal/local automation tool.

- Stable enough for day-to-day personal use
- Explicit about its non-OAuth auth model
- Designed for agents as well as humans
- Still evolving toward a cleaner hierarchical `1.0` CLI surface

Helpful companion docs:

- `CHANGELOG.md` — notable changes by release
- `docs/releases-v0.2.0.md` — GitHub/npm release notes
- `docs/public-release-audit.md` — current release-readiness audit
- `docs/hierarchical-subcommands.md` — future `1.0` CLI design proposal
- `SECURITY.md` — auth-sensitive usage and reporting notes

## Why `slk`

- No Slack app creation
- No OAuth dance
- No bot user requirement
- Works with the Slack desktop session you already use
- Agent-friendly JSON, checkpoints, export, and watch flows
- Multi-workspace support for people logged into several Slack orgs locally

## Install

```bash
npm install -g slkcli
```

One-shot (no install):

```bash
npx slkcli auth
```

**Requirements:** macOS, Slack desktop app (installed and logged in), Node.js 18+.

### Local global install from this repo

This repo already exposes a CLI entrypoint via `package.json`:

```json
"bin": {
  "slk": "bin/slk.js"
}
```

So when developing locally, you can install the current repo copy as a real global command:

```bash
cd /path/to/slkcli
npm link
```

After that, these should work from anywhere:

```bash
slk auth
slk unread
slk read general 20
```

To remove the linked global command later:

```bash
cd /path/to/slkcli
npm unlink -g slkcli
```

If you prefer a one-time global install instead of a live symlink:

```bash
cd /path/to/slkcli
npm install -g .
```

## Agent Skill

Add to your AI agent (Claude Code, Codex, Moltbot, etc.):

```bash
# ClawdHub
clawdhub install slack-personal

# skills.sh
npx skills add therohitdas/slkcli
```

Browse on [ClawdHub](https://www.clawhub.ai/therohitdas/slack-personal).

## Quickstart

```bash
# Verify your session works
slk auth

# List channels
slk channels

# Read the last 20 messages in a channel
slk read general
slk read C08A8AQ2AFP        # by channel ID

# Send a message
slk send general "Hello from slk"

# Search across the workspace
slk search "deployment failed"

# Check what's unread
slk unread

# See starred items and VIP users
slk starred

# See saved for later items
slk saved

# See pinned messages in a channel
slk pins general

# Read a thread
slk thread general 1234567890.123456

# React to a message
slk react general 1234567890.123456 thumbsup

# List available Slack workspaces from the local Slack app
slk workspaces

# Switch the active workspace used by subsequent commands
slk switch alpaon
```

## Good fit / bad fit

Good fit:
- personal macOS machine
- local automations
- AI agent workflows that need to read or send Slack as the signed-in user
- quick exports, triage loops, and thread follow-up

Bad fit:
- shared machines
- enterprise-wide deployment without policy review
- cases where you need official Slack OAuth, bot scopes, or admin-grade controls
- environments where local desktop session reuse is unacceptable

## Commands

The CLI is organized around three layers:

1. Slack-native objects — workspace, conversations, messages, threads, pins, saved items
2. Agent-facing synthesized views — triage, mentions, thread inbox, channel context
3. Utilities — export and watch

### Core Slack objects

#### Workspace

| Command | Alias | Description |
|---------|-------|-------------|
| `slk auth` | | Test authentication and show active workspace/user |
| `slk workspaces` | `ws` | List all logged-in Slack workspaces discovered from the local desktop app |
| `slk switch <name|domain|team-id>` | `sw` | Switch the active workspace used for subsequent commands |

#### Conversations & people

| Command | Alias | Description |
|---------|-------|-------------|
| `slk channels` | `ch` | List public/private channels with member counts |
| `slk dms` | `dm` | List DM conversations with IDs |
| `slk users` | `u` | List workspace users with statuses |
| `slk read <conversation> [count]` | `r` | Read conversation history from a channel, DM, or group DM |
| `slk search <query> [count]` | | Search messages across the workspace |
| `slk pins <conversation>` | `pin` | Show pinned items in a conversation |
| `slk saved [count]` | `sv` | Show saved-for-later items (`--all` includes completed) |

#### Messages & threads

| Command | Alias | Description |
|---------|-------|-------------|
| `slk thread <conversation> <ts> [count]` | `t` | Read a specific thread |
| `slk thread-inbox [count]` | `thread-unread` | Read Slack's thread inbox / subscribed-thread view |
| `slk permalink <conversation> <ts>` | | Return a Slack permalink for a specific message |
| `slk send <conversation> <message>` | `s` | Send a message to a conversation |
| `slk react <conversation> <ts> <emoji>` | | Add an emoji reaction to a message |

### Agent-facing views

| Command | Legacy alias | Description |
|---------|--------------|-------------|
| `slk triage [count]` | `inbox` | Combined agent triage view: mentions + unreads + thread inbox + saved items |
| `slk mentions [count]` | | Direct mentions of the current user |
| `slk unread` | `ur` | Only unread conversations (muted conversations excluded) |
| `slk activity` | `a` | Cross-workspace activity view across channels / DMs / groups |
| `slk channel-context <channel> [count]` | `context` | Channel summary combining metadata, pins, participants, and recent activity |
| `slk starred` | `star` | VIP users and starred items |

### Utilities

| Command | Description |
|---------|-------------|
| `slk export <source> ...` | Export structured results as JSON, NDJSON, or CSV |
| `slk watch <source> ...` | Poll a structured source and emit compact change summaries |
| `slk cache-clear` | Clear local token/cache/runtime state while preserving the selected workspace by default |

### Drafts

| Command | Description |
|---------|-------------|
| `slk draft <conversation> <message>` | Draft a channel message |
| `slk draft thread <conversation> <ts> <message>` | Draft a thread reply |
| `slk draft user <user_id> <message>` | Draft a DM |
| `slk drafts` | List all active drafts |
| `slk draft drop <draft_id>` | Delete a draft |

### Option semantics by command

#### `read`
- `--ts` — show raw Slack timestamps in human-readable output
- `--threads` — expand thread replies inline
- `--from YYYY-MM-DD`, `--to YYYY-MM-DD` — date bounds
- `--since-ts TS` — incremental reads from a raw Slack timestamp
- `--checkpoint NAME` — load/save the latest seen timestamp under a local checkpoint name
- `--cursor TOKEN` — resume cursor-based conversation history pagination
- `--json` — emit structured JSON

#### `search`
- `--page N` — preferred paging flag
- `--cursor TOKEN` — legacy compatibility alias for `--page`
- `--summary-fields a,b,c` — project JSON `items` to selected fields
- `--json` — emit structured JSON

#### `mentions` and `triage`
- `--from YYYY-MM-DD`, `--to YYYY-MM-DD` — time bounds
- `--user USERNAME` — restrict to messages from a specific author
- `--channel CHANNEL` — restrict to a channel name
- `--kind channel|dm|group` — restrict by conversation kind
- `--summary-fields a,b,c` — project JSON `items` to selected fields
- `--checkpoint NAME` — save the latest seen timestamp for incremental triage workflows
- `--json` — emit structured JSON

#### `thread-inbox`
- `--max-ts TS` — preferred paging flag for Slack thread inbox pagination
- `--cursor TOKEN` — legacy compatibility alias for `--max-ts`
- `--summary-fields a,b,c` — project JSON `items` to selected fields
- `--json` — emit structured JSON

#### `thread`
- `--cursor TOKEN` — resume thread reply pagination
- `--json` — emit structured JSON

#### `export`
- `--format json|ndjson|csv`
- `--output PATH`

#### `watch`
- `--interval SEC`
- `--iterations N` (`0` means forever)
- `--checkpoint NAME`
- `--json`

#### `cache-clear`
- `--include-workspace` — also remove the selected workspace marker (`active-workspace`)
- `--json`

### Shared / compatibility flags

| Flag | Description |
|------|-------------|
| `--no-emoji` | Disable emoji in output (or set `NO_EMOJI=1`) |
| `--all` | Include completed items in `slk saved` |
| `--no-cache` | Bypass persistent read cache for this invocation |
| `--refresh` | Force a network refetch and refresh any cache entry |
| `--debug-cache` | Print cache hit/miss diagnostics to stderr |
| `--debug-queue` | Print queue / pacing / retry diagnostics to stderr |
| `--read-only` | Block mutating Slack actions for this invocation (or set `SLK_READ_ONLY=1`) |

```bash
# Get timestamps to use with thread command
slk read general 10 --ts
# Output: [1/30/2026, 11:41:19 AM ts:1769753479.788949] User [3 replies]:

# Then read that thread
slk thread general 1769753479.788949
```

### Channel resolution

Channels can be specified by **name** or **ID** in any command:

```bash
slk read general           # by name
slk read ai-coding         # by name
slk read C08A8AQ2AFP       # by ID
```

### DMs

Read, send, and react to DMs using `@username` or user ID:

```bash
# List all DM conversations
slk dms

# Read DMs by username
slk read @andrej 50
slk read @nikhil 100 --threads    # auto-expand threads

# Read DMs with date range
slk read @andrej 100 --from 2026-02-01 --to 2026-02-07 --threads

# Send DM
slk send @andrej "hey, check this out"

# React to DM message
slk react @andrej 1769753479.788949 fire

# By user ID (U...)
slk read U07RQTFCLUC 50
```

### Workspaces

If you're signed into multiple Slack workspaces in the desktop app, `slk` can enumerate and switch between them.

```bash
# Show all discovered workspaces (the active one is marked)
slk workspaces

# Switch by workspace name
slk switch candid

# Switch by domain
slk switch alpaon

# Switch by Slack team ID
slk switch T06QABB3SAE

# Verify which workspace is active
slk auth
```

The active workspace selection is stored in `~/.local/slk/active-workspace`.

## Authentication

`slk` uses the credentials already stored by the Slack desktop app. No OAuth flows, no manual token management.

### Keychain access prompt

On first run, macOS will show a Keychain dialog asking whether to allow access to "Slack Safe Storage":

- **Allow** — grants one-time access. You'll be prompted again next time slk needs to decrypt the cookie.
- **Always Allow** — grants permanent access for this binary. No future prompts.
- **Deny** — blocks access. slk cannot authenticate.

> **Caution:** Choosing "Always Allow" means any process running as your user that invokes the `slk` binary (or the `security` command targeting "Slack Safe Storage") can read the encryption key without a prompt. This is convenient but reduces the security boundary — any code running in your terminal (scripts, agents, other CLI tools) could trigger credential extraction silently. On a personal machine this is a reasonable trade-off. On a shared or managed machine, prefer "Allow" so you get prompted each time and maintain visibility into access.

### How it works

1. **Cookie decryption** — Reads the encrypted `d` cookie from Slack's SQLite cookie store (`Cookies` file). Decrypts it using the "Slack Safe Storage" key from the macOS Keychain via PBKDF2 + AES-128-CBC. Supports both direct-download and Mac App Store keychain account names.

2. **Token extraction** — Scans Slack's LevelDB storage (`Local Storage/leveldb/`) for `xoxc-` session tokens. Uses both direct regex scanning and a Python fallback for Snappy-compressed entries. The Slack data directory is auto-detected (direct download or App Store sandbox).

3. **Validation** — Tests each candidate token against `auth.test` with the decrypted cookie. The first valid pair is used.

4. **Auto-refresh** — On `invalid_auth`, credentials are re-extracted and the request is retried once automatically.

### Token caching

Validated tokens are cached to avoid re-extracting on every invocation.

- Token cache: `~/.local/slk/token-cache.json`
- Response cache: `~/.local/slk/cache/`
- Shared lock root: `~/.local/slk/locks/`
- Shared pacing state: `~/.local/slk/runtime/rate-state.json`

### Runtime hardening

`slk` now coordinates all local Slack API traffic through a shared runtime layer:

1. **Host-level request queue** — all CLI processes on the same machine serialize API access through a shared lock, so two concurrent `slk` commands do not burst Slack in parallel.
2. **Rate-limit protection** — the runtime respects `429 Retry-After`, keeps a minimum gap between requests, and retries transient failures with bounded backoff.
3. **Persistent read cache** — safe read endpoints such as `users.list`, `conversations.list`, `conversations.history`, `conversations.replies`, and `search.messages` can be served from a TTL-based local cache.
4. **Write invalidation** — mutating commands bypass the cache and invalidate related read entries so a subsequent read is not stale.

### Cache / queue controls

```bash
# Always hit the network
slk read general 20 --no-cache

# Force a refetch and refresh cache contents
slk search "deploy failed" 10 --refresh

# Show cache diagnostics
slk unread --debug-cache

# Show queue / pacing / retry diagnostics
slk unread --debug-queue
```

Environment overrides:

```bash
SLK_NO_CACHE=1
SLK_REFRESH=1
SLK_READ_ONLY=1
SLK_MIN_REQUEST_GAP_MS=1200
SLK_MAX_RETRIES=3
SLK_LOCK_TIMEOUT_MS=30000
SLK_STALE_LOCK_MS=120000
```

To clear local state without changing the selected workspace:

```bash
slk cache-clear
```

If you also want to remove the selected workspace marker:

```bash
slk cache-clear --include-workspace
```

> **Important:** the cache contains a reusable Slack user session token. Treat it as sensitive credential material. On personal machines this may be an acceptable trade-off for convenience. On shared or higher-risk environments, disk caching should be disabled or replaced with a more secure storage strategy.


| | |
|---|---|
| **Cache file** | `~/.local/slk/token-cache.json` |
| **Format** | `{ "token": "xoxc-...", "ts": 1706000000000 }` |
| **Behavior** | Load cache → validate with Slack API → use if valid, otherwise re-extract from LevelDB |
| **In-memory** | Within a single process, credentials are cached in memory after first load |

### Credential resolution order

```
1. In-memory cache (same process)
2. Disk cache (~/.local/slk/token-cache.json) → validate → use if ok
3. Fresh extraction from Slack desktop app → validate → cache → use
```

### What it reads from your system

| Data | Source | Purpose |
|------|--------|---------|
| Keychain password | `security find-generic-password -s "Slack Safe Storage"` | Derive AES key for cookie decryption |
| Encrypted cookie | `<slack-data-dir>/Cookies` (SQLite) | Decrypt the `d` session cookie (`xoxd-`) |
| Session token | `<slack-data-dir>/Local Storage/leveldb/` | Extract `xoxc-` token |

## Agent usage patterns

`slk` is designed to be used by AI agents. Common patterns:

```bash
# Check auth before doing anything
slk auth

# Get channel list, find the right one
slk channels

# Read recent context from a channel
slk read engineering 50

# Search for something specific
slk search "PR review needed"

# Find messages that directly mention you
slk mentions 20 --from 2026-02-01
slk mentions 20 --user alice --channel engineering --json --summary-fields text,permalink

# Get a single triage feed for an agent
slk triage --json

# Incremental channel scan with local checkpoint persistence
slk read engineering 100 --checkpoint morning-eng --json

# Resume the Slack thread inbox
slk thread-inbox 20 --max-ts 1777357082.902859 --json

# Export a compact mention feed as NDJSON
slk export mentions 20 --user alice --format ndjson --summary-fields text,permalink

# Watch a source for changes with checkpoint updates
slk watch triage 20 --checkpoint inbox-main --interval 60 --iterations 5 --json

# Summarize a channel's purpose, pins, and recent traffic
slk channel-context engineering --json

# Check what needs attention
slk unread

# See pinned context in a channel
slk pins engineering

# Send a message
slk send engineering "Build passed on main"

# Read a thread for full context
slk thread engineering 1706000000.000000

# Draft a message for human review (appears in Slack UI)
slk draft engineering "Here's the summary of today's standup..."
```

**Exit codes:** `0` on success, `1` on error. Errors are printed to stderr.

## Contributing

If you want to improve the CLI itself, start here:

- `AGENTS.md` — maintenance rules, taxonomy, canonical naming, and testing expectations
- `CONTRIBUTING.md` — contributor workflow and PR checklist
- `SECURITY.md` — security posture and reporting expectations
- `docs/public-release-checklist.md` — release review template
- `docs/public-release-audit.md` — current audit of what is done vs still missing
- `docs/hierarchical-subcommands.md` — future major-version CLI direction

For CLI changes, keep these aligned:
- `bin/slk.js --help`
- `README.md`
- `SKILL.md`
- tests under `tests/`

## How it was installed

The `bin` field in `package.json` maps `slk` to `./bin/slk.js`:

```json
{ "bin": { "slk": "./bin/slk.js" } }
```

Running `npm install -g` creates a symlink in your PATH:

```
/opt/homebrew/bin/slk -> ../lib/node_modules/slkcli/bin/slk.js
```

## Development

```bash
git clone https://github.com/therohitdas/slkcli.git
cd slkcli
node bin/slk.js auth       # run directly
npm link                   # symlink globally for development
```

## Notes

- **Personal machine oriented** — this tool assumes local access to your signed-in Slack desktop app and should be treated as a personal automation tool, not a general-purpose enterprise auth integration.
- **macOS only** — uses Keychain and Electron storage paths specific to macOS.
- **Both Slack variants supported** — works with the direct download (`~/Library/Application Support/Slack/`) and the Mac App Store version (`~/Library/Containers/com.tinyspeck.slackmacgap/.../Slack/`). The correct path is auto-detected at runtime.
- **Slack desktop app required** — must be installed and logged in. The app does not need to be running for cached tokens.
- **Zero dependencies** — uses only Node.js built-in modules (`crypto`, `fs`, `child_process`, `fetch`).
- **Session-based** — uses `xoxc-` tokens (user session), not bot tokens. This means you act as yourself.
- **Mute-aware** — `activity` and `unread` commands respect your mute settings.
