# slack-personal-cli 💬

[![CI](https://github.com/kimjisub/slack-personal-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/kimjisub/slack-personal-cli/actions/workflows/ci.yml)

A macOS Slack CLI built for agent workflows.

![slk demo — inbox, owed, and search across all your workspaces](assets/demo/slk-demo.gif)

> Demo uses synthetic data; it mirrors the real output format.

`slack-personal-cli` reads the Slack desktop app's local session data, so you can work with Slack from the terminal without setting up OAuth apps, bot tokens, or manual cookie copying. It is designed for personal automation, AI agents, and fast terminal-native Slack workflows.

> Not affiliated with Slack. This tool uses your existing Slack desktop session and acts as your user account.
>
> Security / policy warning: `slack-personal-cli` does not use Slack's official OAuth flow. It reads locally available Slack session artifacts from the macOS desktop app and reuses them to act as the signed-in user. This is intended for personal automation on a machine you control.

## Why slack-personal-cli

- zero OAuth setup
- works with the Slack desktop app you already use
- built for CLI and agent workflows
- supports reading, searching, sending, reacting, drafts, pins, saved items, unread tracking, and workspace switching
- macOS-native auth flow using Keychain + local Slack storage

## Use it from an AI agent

`slk` is a plain CLI, so **any agent that can run a shell command can drive Slack
through it** — no SDK to wire up, no MCP server to host, no token to mint. It
works inside **Claude Code**, **Codex**, **Hermes**, **OpenClaw**, or any harness
that shells out.

- **Structured output:** every read command takes `--json`, so the agent gets
  parseable data instead of scraping text.

  ```bash
  slk owed -A --json | jq '.workspaces[].owed[]'   # what needs a reply, as JSON
  slk inbox unread -A --json                        # cross-workspace unread digest
  ```

- **Skill file included:** a bundled [`SKILL.md`](SKILL.md) documents the command
  surface for skill-aware harnesses. Note this is a reference doc shipped in the
  package — registering it is a separate step (e.g. copy it into
  `~/.claude/skills/slack-personal/` for Claude Code). Installing the CLI does
  not auto-register the skill.

- **Safe by default:** the agent only ever sends when you invoke a write command
  (`send`/`reply`/`react`/`mark`); everything else is read-only.

## How it compares (Slack official MCP, community MCP, this CLI)

If you're an AI agent or a developer choosing how to give a Claude/LLM agent
access to Slack, there are three realistic options. They differ mainly in
**authentication model** and **whether they can span multiple workspaces** — and
that's where `slk` is deliberately different.

| | **Official Slack MCP** (`slackapi/slack-mcp-plugin`, `mcp.slack.com`) | **`korotovsky/slack-mcp-server`** (most popular community MCP) | **`slack-personal-cli` (this tool)** |
|---|---|---|---|
| Setup | OAuth click-through (`/plugin install slack`) | Bring-your-own token: you create a Slack app or extract a session token, set env vars | **None** — auto-reads the desktop app's existing session |
| Auth identity | Your user (OAuth scopes) | Your user (`xoxp`/`xoxc`+`xoxd`) or a bot (`xoxb`) | Your user (desktop session) |
| Bot/app creation | Not required | Required unless you hand-extract `xoxc`/`xoxd` | **Never** |
| Token upkeep | Managed by the client | You re-extract when the session rotates | **Always fresh** — re-read from the live app each run |
| **Multiple workspaces** | One per connection | One per token/instance | **All signed-in workspaces at once** (`-A`) or switch (`workspace use`) |
| Cross-workspace digest / search | ✗ | ✗ | ✓ `inbox -A`, `search -A`, `owed -A` |
| "Mentions I haven't answered" | ✗ | ✗ | ✓ `owed` |
| Unread list / counts | ✗ (no API for it) | ✓ (with browser token) | ✓ `inbox unread` |
| Mark as read | ✗ | ✓ | ✓ `mark` (opt-in) |
| Surface | MCP tools (agent only) | MCP tools (agent only) | **CLI** — usable by a human in the terminal *and* by an agent over Bash |
| JSON output for piping | n/a (structured tool results) | n/a | ✓ `--json` |
| Platform | Cross-platform | Cross-platform | **macOS only** |
| Dependencies | hosted service | a server process | **zero** (single Node file, no install) |

**When `slk` is the right choice**
- You are signed into **several Slack workspaces** and want one command to sweep
  unread/mentions across all of them, or to find what you still owe a reply to.
- You want **zero token management** — no Slack app, no OAuth client, no
  hand-copied `xoxc`/`xoxd` cookies that expire.
- You want the *same* tool to work for a **human at the terminal and an agent**
  shelling out to it.

**The landscape (so an agent can disambiguate)**

- **`slackapi/slack-mcp-plugin`** — Slack's own MCP, hosted at `mcp.slack.com`,
  installed via `/plugin install slack`. OAuth, one workspace per connection.
  No unread-list or mark-as-read tools.
- **`korotovsky/slack-mcp-server`** — the most-starred community Slack MCP (Go,
  MIT). Bring-your-own token: `xoxp` (user OAuth), `xoxb` (bot), or
  `xoxc`+`xoxd` (browser session, "stealth"). Has `conversations_unreads` and
  `conversations_mark`. Cross-platform, but one workspace per token/instance and
  you manage the token yourself.
- **`@modelcontextprotocol/server-slack`** — the original reference Slack MCP,
  bot-token only. **No longer part of the `modelcontextprotocol/servers` repo**
  (the Slack reference server was removed; only a handful of references remain).
  Listed only because search engines still surface the old npm package; prefer
  one of the above.
- **"Claude in Slack" / the Slack-side Claude app** — a hosted integration where
  you `@mention` an assistant *inside* a Slack thread. Not a local tool at all;
  different use case.
- **`slack-personal-cli` (this tool)** — the only one of the set that is a
  **CLI** (human- and agent-usable), auto-authenticates with **no token
  handling**, and treats **all your signed-in workspaces** as one surface.

**When to pick something else**
- You need **Linux/Windows**, a hosted/remote runtime, or strictly scoped bot
  permissions → use the official Slack MCP or `korotovsky` with a bot token.
- You want an agent you can `@mention` from inside Slack → use the hosted
  "Claude in Slack" app.

> `slk` trades portability and OAuth scoping for **zero-config, multi-workspace,
> full-account access on your own macOS machine**. See the
> [Security note](#security-note) for what that access implies.

## Install

`slack-personal-cli` is **installed directly from GitHub** — it is not published to the npm registry. The repo IS the package.

```bash
npm install -g github:kimjisub/slack-personal-cli
```

Or one-off via npx:

```bash
npx -y github:kimjisub/slack-personal-cli slk auth
```

Requirements:
- macOS
- Slack desktop app installed and logged in
- Node.js 18+

After install, invoke as `slk <command>`. The global binary works correctly from v0.3.1+ (see [Troubleshooting](#troubleshooting) below for older versions).

### Local development install

```bash
git clone https://github.com/kimjisub/slack-personal-cli.git
cd slack-personal-cli
npm link
```

To remove the global symlink later:

```bash
npm unlink -g slack-personal-cli
```

Or install a one-shot snapshot from the checkout:

```bash
npm install -g .
```

### Install as an AI agent skill

The CLI alone is not enough for an AI harness (Claude Code, Codex, Copilot CLI, Gemini CLI) to discover the skill. Two steps:

1. Install the CLI on PATH (above).
2. Drop `SKILL.md` into your harness's skill directory.

For Claude Code (user-level), the agent-friendly one-liner covers both:

```bash
npm install -g github:kimjisub/slack-personal-cli && \
mkdir -p ~/.claude/skills/slack-personal && \
curl -sL https://raw.githubusercontent.com/kimjisub/slack-personal-cli/main/SKILL.md \
  -o ~/.claude/skills/slack-personal/SKILL.md
```

For project-scoped Claude Code skills, use `<repo>/.claude/skills/slack-personal/SKILL.md` instead. For other harnesses, refer to their skill registration docs — the `SKILL.md` format itself is portable.

### Troubleshooting: `slk` is silent (exit 0, no output)

You are on a pre-0.3.1 version. The previous main-module guard compared `process.argv[1]` to `import.meta.url` directly, which never matched for symlinked global bins, so `main()` was never invoked. Fix:

```bash
slk --version            # check which version is on PATH (v0.3.1+ has the fix)
npm install -g github:kimjisub/slack-personal-cli
slk auth
```

Do **not** work around this with `node $(npm root -g)/slack-personal-cli/bin/slk.js …` — install the patched version instead.

## Quickstart

```bash
# verify auth
slk auth

# list channels, DMs, and workspaces
slk channels
slk dms
slk workspace list

# read channel or DM
slk read general
slk read @andrej 50

# switch workspace when multiple Slack teams are signed in locally
slk workspace use alpaon
slk workspace current

# search workspace
slk search "deployment failed"

# send a message
slk send general "hello from slack"
slk send general "reply in thread" --thread 1769753479.788949
slk send @andrej "hey, can you take a look?"

# inspect attention queues
slk inbox unread
slk inbox activity
slk inbox saved
slk channel pins general

# work with threads and message references
slk read general 20 --ts
slk thread general 1769753479.788949
slk react general 1769753479.788949 thumbsup
slk reply general 1769753479.788949 "on it"
slk message link general 1769753479.788949
slk message context general 1769753479.788949 2 2

# save a draft into Slack UI
slk draft channel general "draft for review"
slk draft dm @andrej "hey, can you take a look?"
```

## Commands

### Preferred command families

| Family | Command | Notes |
|---|---|---|
| Workspace | `slk workspace list` | List locally discovered logged-in Slack workspaces |
| Workspace | `slk workspace use <name|domain|team-id>` | Switch the active workspace used by later commands |
| Workspace | `slk workspace current` | Show the currently selected workspace |
| Inbox | `slk inbox activity` | Show channel activity with unread and mention counts |
| Inbox | `slk inbox unread` | Show only unread channels |
| Inbox | `slk inbox saved [count]` | Show saved-for-later items |
| Inbox | `slk inbox starred` | Show starred items and VIP users |
| Channel | `slk channel pins <channel>` | Show pinned items |
| Draft | `slk draft list` | List active drafts |
| Draft | `slk draft channel <channel> <message>` | Create a channel draft |
| Draft | `slk draft thread <channel> <ts> <message>` | Create a thread draft |
| Draft | `slk draft dm <user_id|@username> <message>` | Create a DM draft |
| Draft | `slk draft drop <draft_id>` | Delete a draft |
| Message | `slk reply <channel> <ts> <message>` | Send a thread reply |
| Message | `slk message link <channel> <ts>` | Show a Slack permalink for a message |
| Message | `slk message show <channel> <ts>` | Show one exact message |
| Message | `slk message context <channel> <ts> [before] [after]` | Show surrounding message context |

### Core commands

| Command | Alias | Description |
|---|---|---|
| `slk auth` |  | Test auth and show workspace identity |
| `slk channels` | `ch` | List channels |
| `slk dms` | `dm` | List DM conversations |
| `slk users` | `u` | List workspace users |
| `slk read <channel> [count]` | `r` | Read recent messages |
| `slk send <channel> <message>` | `s` | Send a message |
| `slk search <query> [count]` |  | Search messages (add `-A` to search every workspace) |
| `slk owed [--days N]` |  | Mentions you haven't answered yet (an emoji reaction counts as answered) |
| `slk thread <channel> <ts> [count]` | `t` | Read thread replies |
| `slk react <channel> <ts> <emoji>` |  | Add a reaction |
| `slk mark <channel>` |  | Mark a channel as read (opt-in; `-w` supported, not `-A`) |

## Useful flags

| Flag | Description |
|---|---|
| `-w, --workspace <name|id>` | Run the command against a specific workspace (instead of the active one) |
| `-A, --all-workspaces` | Run the command across every logged-in workspace (`inbox`, `search`) |
| `--json` | Machine-readable JSON output (`inbox`, `owed`, `search`, `mark`) |
| `--ts` | Show raw Slack timestamps for thread follow-up |
| `--threads` | Auto-expand threads while reading |
| `--from YYYY-MM-DD` | Read messages from a date onward |
| `--to YYYY-MM-DD` | Read messages until a date |
| `--all` | Include completed items in `slk inbox saved` (distinct from `-A`/`--all-workspaces`) |
| `--no-emoji` | Disable emoji output |

## Channel, DM, and workspace resolution

You can target conversations by:
- channel name: `general`
- channel ID: `C08A8AQ2AFP`
- DM username: `@andrej`
- Slack user ID: `U07RQTFCLUC`
- workspace name/domain/team-id for `slk workspace use`

Examples:

```bash
slk read general
slk read C08A8AQ2AFP
slk read @andrej 100 --threads
slk send U07RQTFCLUC "hello"
slk send general "follow-up" --thread 1769753479.788949
slk workspace use alpaon
slk workspace use teamcandid
slk draft dm @andrej "hello"
slk message link general 1769753479.788949
```

## Threads and message references

Once you have a message timestamp, you can read the thread, reply to it, or inspect the exact message and nearby context.

```bash
slk thread general 1769753479.788949
slk reply general 1769753479.788949 "on it"
slk send general "same effect via send" --thread 1769753479.788949
slk message link general 1769753479.788949
slk message show general 1769753479.788949
slk message context general 1769753479.788949 2 2
```

## Multiple workspaces

If you're signed into multiple Slack workspaces in the desktop app, `slack-personal-cli` can enumerate and switch between them.

```bash
# show discovered workspaces
slk workspace list

# inspect the current workspace selection
slk workspace current

# switch by workspace name
slk workspace use alpaon

# switch by Slack domain or team id
slk workspace use teamcandid
slk workspace use T12345678
```

The selected workspace is then used for subsequent `slack-personal-cli` commands.

### Workspace scope flags

Every command defaults to the **active** workspace. Two flags change that scope:

```bash
slk inbox unread                 # active workspace (default)
slk inbox unread -w candid       # a specific workspace, without switching the active one
slk inbox unread -A              # aggregate across ALL logged-in workspaces
```

### Cross-workspace commands

Because `slk` reads every locally signed-in workspace from one session, it can do
things a single-token integration structurally cannot — sweep all of them at once.

```bash
# Unread/mention/DM digest across every workspace, grouped per workspace
slk inbox unread -A

# Mentions you still owe a reply to (a reply or emoji reaction clears them)
slk owed                         # active workspace, last 30 days
slk owed -A --days 14            # every workspace, last 14 days

# Search merged newest-first across every workspace, tagged by workspace
slk search "deploy failed" -A

# Pipe any of these to a tool or agent
slk inbox unread -A --json | jq '.workspaces[].items[]'
```

`-A` fans out with bounded concurrency and isolates failures: if one workspace
errors, the rest still return and the failures are summarized at the end. Sweeps
are paced by the shared rate limiter, so a full `-A` across many workspaces can
take a while.

## How auth works

`slack-personal-cli` reuses the credentials already present in the Slack desktop app.

1. reads the encrypted `d` cookie from Slack's local cookie store
2. decrypts it using the `Slack Safe Storage` key from macOS Keychain
3. scans Slack local storage for `xoxc-` session tokens
4. validates candidate credentials against Slack
5. caches the working token locally for faster future runs

Token cache location:

```text
~/.local/slack-personal-cli/token-cache.json
```

Runtime coordination files:

```text
~/.local/slack-personal-cli/runtime/
```

If auth gets stuck or Slack rotated your session:

```bash
rm ~/.local/slack-personal-cli/token-cache.json
slk auth
```

## Security note

On first run, macOS may ask whether to allow access to `Slack Safe Storage`.

- `Allow` gives one-time access
- `Always Allow` is more convenient, but lowers the security boundary for any process running as your user
- `Deny` prevents `slack-personal-cli` from authenticating

If this machine is shared or tightly managed, prefer the more conservative option.

For the full credential model, trust boundaries, and how to report a
vulnerability, see [SECURITY.md](SECURITY.md).

## Rate limiting and multi-process safety

`slack-personal-cli` coordinates Slack API requests across multiple local processes.

That means if several shells, agents, cron jobs, or bots invoke `slack-personal-cli` at the same time, they share one local request lane instead of all hitting Slack at once.

Behavior:
- requests are globally paced across local `slack-personal-cli` processes
- if one process gets HTTP `429`, the cooldown is written to shared runtime state
- other local `slack-personal-cli` processes honor that cooldown automatically

Useful environment variables:

```bash
SLK_MIN_REQUEST_INTERVAL_MS=1200
SLK_MAX_429_RETRIES=2
SLK_LOCK_STALE_MS=30000
SLK_LOCK_POLL_MS=100
SLK_DEBUG_RATE_LIMIT=1
```

## Agent-friendly workflows

`slack-personal-cli` is especially useful when an agent needs real Slack context.

Examples:
- `slk inbox unread` → find what needs attention now
- `slk read <channel> 100` → summarize decisions and action items
- `slk search "launch checklist"` → recover prior context
- `slk channel pins <channel>` → inspect canonical references
- `slk draft channel <channel> "..."` → prepare a message for human review
- `slk thread <channel> <ts>` / `slk reply <channel> <ts> "..."` → inspect and answer inside one thread
- `slk message link <channel> <ts>` / `slk message context <channel> <ts>` → recover one exact message plus its surrounding context
- `slk workspace list` / `slk workspace use ...` → move between locally signed-in workspaces without reconfiguring tokens
- multiple concurrent `slack-personal-cli` invocations → automatically share one paced local Slack request lane

## Development

```bash
git clone https://github.com/kimjisub/slack-personal-cli.git
cd slack-personal-cli
node bin/slk.js auth
npm link
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the module architecture and coding
conventions, and [CHANGELOG.md](CHANGELOG.md) for release notes. The project has
**zero runtime dependencies**; CI runs `node --test` on Node 18/20/22.

## Live Slack integration tests

Default `npm test` stays safe for local/CI runs. It includes the live test file, but that file auto-skips unless you explicitly opt in.

### Read-only live verification

Use this when you want to verify auth, workspace resolution, unread inbox, and message-reference commands against the real Slack desktop session:

```bash
SLK_LIVE_TESTS=1 \
SLK_LIVE_CHANNEL=general \
SLK_LIVE_MESSAGE_TS=1769753479.788949 \
npm run test:live
```

This runs real end-to-end checks for:
- `slk auth`
- `slk workspace current`
- `slk inbox unread`
- `slk message link/show/context`

### Live write verification

To also verify real thread writes, opt in explicitly and provide a safe thread target:

```bash
SLK_LIVE_TESTS=1 \
SLK_LIVE_ALLOW_WRITE=1 \
SLK_LIVE_CHANNEL=general \
SLK_LIVE_MESSAGE_TS=1769753479.788949 \
SLK_LIVE_THREAD_TS=1769753479.788949 \
npm run test:live
```

This additionally runs real end-to-end checks for:
- `slk reply <channel> <thread_ts> <message>`
- `slk send <channel> <message> --thread <thread_ts>`

### Environment variables

- `SLK_LIVE_TESTS=1` — enable live Slack tests at all
- `SLK_LIVE_CHANNEL` — conversation used for message-reference and write tests
- `SLK_LIVE_MESSAGE_TS` — existing message timestamp for `message link/show/context`
- `SLK_LIVE_ALLOW_WRITE=1` — opt in to mutating live tests
- `SLK_LIVE_THREAD_TS` — existing thread target for `reply` / `send --thread`

The write tests intentionally require a second opt-in so `npm run test:live` does not post to Slack unless you explicitly allow it.

## Notes

- macOS only
- Slack desktop app required
- zero runtime dependencies beyond Node built-ins
- session-based, so actions happen as your user account
- `activity` and `unread` respect mute settings
- local runtime coordination files live under `~/.local/slack-personal-cli/runtime/`

## Inspiration

This project was lightly inspired by earlier Slack CLI work, especially [`therohitdas/slkcli`](https://github.com/therohitdas/slkcli), and is being adapted here for a more agent-centric workflow.

## License

MIT
