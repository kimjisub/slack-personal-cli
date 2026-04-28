# AGENTS.md — slk maintenance guide

This file is the operating manual for AI agents modifying `slk`.

`slk` is no longer a tiny one-layer CLI. It now has three distinct surfaces:

1. Slack-native object commands
   - workspace, conversations, messages, threads, pins, saved items, drafts
2. Agent-facing synthesized views
   - triage, mentions, thread inbox, channel context
3. Utilities
   - export, watch

When changing the CLI, preserve that separation. Do not casually mix Slack-native objects with synthesized agent workflows.

## Project structure

```text
slk/
├── bin/slk.js              # CLI entry point, help text, alias routing, command-scoped flag parsing
├── src/
│   ├── api.js              # Slack API wrapper — POST/read policy + cache TTLs
│   ├── agent-utils.js      # Export formatting, checkpoint-ts detection, watch diffs
│   ├── auth.js             # Credential extraction — Keychain, cookies, token cache, workspace discovery
│   ├── cache.js            # Persistent TTL cache for safe read endpoints
│   ├── commands.js         # Command implementations and synthesized agent views
│   ├── config.js           # Runtime flag/env parsing (cache / queue flags only)
│   ├── drafts.js           # Draft-specific commands
│   ├── lock.js             # Cross-process lock / queue primitive
│   ├── rate-limit.js       # Shared pacing state + 429 handling
│   └── runtime.js          # Unified request pipeline
├── tests/
│   ├── commands.test.js    # Command behavior tests
│   ├── config.test.js      # CLI/runtime parsing tests
│   ├── agent-utils.test.js # Export/watch/checkpoint helpers
│   └── ...
├── README.md               # Public user docs
├── SKILL.md                # Agent-facing usage guide
├── AGENTS.md               # This file
└── docs/
    ├── auth-risk-mitigation.md
    └── public-release-checklist.md
```

## Canonical naming policy

Use these names as the preferred public vocabulary in docs and examples:

- `triage` — preferred synthesized inbox view
  - legacy alias: `inbox`
- `thread-inbox` — preferred thread inbox name
  - legacy alias: `thread-unread`
- `channel-context` — preferred channel summary name
  - legacy alias: `context`

Keep legacy aliases working unless intentionally shipping a breaking change.

## Command taxonomy

### 1. Slack-native object commands
These should map cleanly to Slack concepts.

- `auth`, `workspaces`, `switch`
- `channels`, `dms`, `users`
- `read`, `search`, `pins`, `saved`
- `thread`, `permalink`, `send`, `react`
- `draft*`

### 2. Synthesized agent views
These are not one-to-one Slack objects. They combine multiple Slack sources for agent workflows.

- `triage`
- `mentions`
- `thread-inbox`
- `channel-context`
- `activity`, `unread`, `starred`

### 3. Utilities
These operate on structured results produced by commands.

- `export`
- `watch`

## Flag semantics policy

Do not treat every flag as global. Prefer command-scoped semantics.

### Preferred scoped flags
- `search` paging → `--page`
- `thread-inbox` paging → `--max-ts`
- `read` history pagination → `--cursor`
- incremental history/triage → `--checkpoint`, `--since-ts`
- structured projection → `--summary-fields`
- export output → `--format`, `--output`
- watch control → `--interval`, `--iterations`
- runtime safety → `--read-only` / `SLK_READ_ONLY=1`

### Compatibility flags
- `--cursor` may remain as a generic legacy compatibility flag
- if a command has a more precise domain flag, prefer documenting the domain flag instead of `--cursor`

## Design rules for new work

### Rule 1: preserve the Slack model
If a command represents a Slack object, keep it narrow and literal.

Good:
- `thread <conv> <ts>` reads one specific thread
- `permalink <conv> <ts>` resolves one specific message link

Bad:
- stuffing triage logic into `thread`
- making `read` also summarize, classify, or export by default

### Rule 2: synthesized views must say they are synthesized
If a command merges multiple Slack concepts, document that clearly.

Examples:
- `triage` = mentions + unreads + thread inbox + saved items
- `channel-context` = channel metadata + pins + recent messages + participant rollup

### Rule 3: prefer non-breaking cleanup
If you improve naming, add aliases first and migrate docs to the better name.
Do not break existing automation unless the repo intentionally ships a major-version CLI break.

### Rule 4: machine output is a first-class surface
For agent-facing commands, JSON shape quality matters as much as human-readable output.
When changing command behavior, verify:
- human output still reads cleanly
- JSON shape stays stable or changes intentionally
- paging/checkpoint metadata remains usable

## Implementation loop

### 1. Write the failing test first
For behavior changes, add or update tests before implementation.

Use:
```bash
node --test tests/commands.test.js
node --test tests/config.test.js
node --test tests/agent-utils.test.js
npm test
```

### 2. Implement the minimal change
Common edit locations:
- command behavior → `src/commands.js`
- command routing / aliases / help / command-scoped flags → `bin/slk.js`
- export/watch/checkpoint helpers → `src/agent-utils.js`
- runtime/cache/TTL policy → `src/api.js`, `src/runtime.js`, `src/config.js`

### 3. Verify both surfaces
Always check both:
- test suite
- `node bin/slk.js --help`

For user-visible CLI changes, also smoke-test at least one real command if it is safe to run.
Examples:
```bash
node bin/slk.js triage 1 --json
node bin/slk.js thread-inbox 1 --json
node bin/slk.js channel-context engineering 5 --json
```

## Documentation update requirements
When CLI behavior changes, update all of these together:

1. `README.md`
   - public-facing command taxonomy
   - preferred command names and aliases
   - command-scoped option semantics
   - examples using preferred names

2. `SKILL.md`
   - agent-first command selection guidance
   - examples using preferred names
   - synthesized-view explanations

3. `bin/slk.js` help string
   - keep it aligned with README and SKILL

4. `AGENTS.md`
   - update if the maintenance workflow, canonical naming, or taxonomy changed

## What to test for each category

### Slack-native commands
Test:
- channel/user resolution
- pagination metadata
- JSON structure
- graceful fallback when Slack metadata fetch fails

### Synthesized agent views
Test:
- merged payload composition
- ranking / priority fields if any
- checkpoint-ts extraction behavior
- summary-field projection

### Utilities
Test:
- export shape for json / ndjson / csv
- watch diff behavior
- checkpoint save/load behavior if touched

## Common mistakes to avoid

- Documenting legacy alias as if it were the preferred canonical name
- Adding a flag to help without clarifying which commands actually support it
- Using vague names like `context` in examples when `channel-context` is the intended public name
- Returning pretty human text from utility commands that are supposed to be machine-friendly
- Changing JSON shape silently without tests
- Treating synthesized views as if they were official Slack primitives

## Release readiness reminders
Before treating changes as public/open-source quality:
- review `docs/public-release-checklist.md`
- review `docs/public-release-audit.md`
- review `SECURITY.md`
- keep auth-model warnings accurate
- do not overstate safety or official Slack support
- prefer explicit wording: personal local automation, signed-in user session, macOS only
- keep the future major-version direction documented in `docs/hierarchical-subcommands.md`

## Quick command selection guide for agents

- Need directed asks → `mentions`
- Need broad action queue → `triage`
- Need subscribed thread follow-up → `thread-inbox`
- Need channel understanding before responding → `channel-context`
- Need exact history from one conversation → `read`
- Need one exact thread → `thread`
- Need a portable artifact for downstream analysis → `export`
- Need recurring polling without writing a shell loop → `watch`
