# `slack-personal-cli` v0.2.0 release notes

`v0.2.0` turns `slk` from a simple personal Slack helper into a more agent-friendly, automation-ready CLI for macOS.

## Highlights

### Multi-workspace support
- Added `slk workspaces` to list all locally available Slack workspaces
- Added `slk switch <name|domain|team-id>` to select the active workspace
- Stores the active workspace locally so subsequent commands stay scoped correctly

### Agent-friendly command surface
- Added `slk mentions` for direct asks to the current user
- Added `slk triage` as a combined agent inbox view
- Added `slk thread-inbox` for Slack’s subscribed-thread / thread inbox workflow
- Added `slk channel-context` for synthesized channel summaries
- Added `slk permalink` for stable message links

### Structured output and automation utilities
- Added `--json` to the main agent-relevant read surfaces
- Added `--summary-fields` for compact machine-readable projections
- Added checkpoint-based incremental reads with `--checkpoint`
- Added `slk export <source> ...` for JSON / NDJSON / CSV output
- Added `slk watch <source> ...` for polling structured sources over time

### Runtime hardening
- Added shared local request serialization to avoid parallel request bursts
- Added persistent read cache for safe Slack read endpoints
- Added shared pacing and retry handling for Slack rate limits and transient failures
- Added runtime debug flags: `--debug-cache`, `--debug-queue`
- Added `slk cache-clear` to clear local token/cache/runtime state
- Added read-only safety mode via `--read-only` / `SLK_READ_ONLY=1`

### Documentation overhaul
- Reorganized docs around:
  - Slack-native commands
  - synthesized agent views
  - utilities
- Clarified preferred names vs legacy aliases
- Added maintainer guidance in `AGENTS.md`
- Added public release audit and future hierarchy design docs

## Preferred command names

These are the preferred public names going forward:
- `triage` (legacy alias: `inbox`)
- `thread-inbox` (legacy alias: `thread-unread`)
- `channel-context` (legacy alias: `context`)

## Upgrade notes

- Existing flat commands continue to work
- Legacy aliases continue to work for compatibility
- New docs prefer the canonical names above

## Verification

Release validation for this snapshot included:
- `npm test`
- `node bin/slk.js --help`
- `npm pack --dry-run`

## Positioning reminder

`slack-personal-cli` is a macOS-only personal/local automation tool. It reuses Slack desktop session credentials and acts as the signed-in user. It is not an official Slack OAuth integration.

---

## Short GitHub / npm release summary

`slack-personal-cli@0.2.0` adds multi-workspace support, agent-friendly triage commands, JSON/export/watch automation helpers, and shared runtime hardening for cache + rate-limit-safe local Slack automation on macOS.
