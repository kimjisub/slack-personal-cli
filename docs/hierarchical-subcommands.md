# Hierarchical subcommand design for `slk` v1

This document proposes a future major-version CLI shape for `slk` that keeps the current flat command surface compatible in `0.x`, while moving toward a clearer, more Slack-native, agent-friendly information architecture in `1.0`.

## Why change at all?

The current flat command surface is workable, but it mixes three different concepts at the same level:

1. Slack-native objects
2. Synthesized agent workflow views
3. Utility wrappers around structured output

That is fine for a fast-moving personal CLI, but it becomes harder to teach, document, and extend once the project is public-facing.

A hierarchical subcommand surface makes three things clearer:

- which commands map directly to Slack concepts
- which commands are composite agent views
- which commands are utilities operating on structured results

## Design goals

- Preserve the current behavior in `0.x`
- Make the future `1.0` CLI self-explanatory from `--help`
- Keep Slack-native commands narrow and literal
- Keep synthesized views clearly marked as synthesized
- Reduce overloaded global flags by scoping them to subcommand families
- Make the machine-readable surface easier to reason about for agents and scripts

## Proposed top-level shape

```text
slk workspace <subcommand>
slk convo <subcommand>
slk message <subcommand>
slk thread <subcommand>
slk attention <subcommand>
slk summary <subcommand>
slk draft <subcommand>
slk util <subcommand>
```

## Command tree

### `slk workspace`

Slack workspace selection and identity.

```text
slk workspace auth
slk workspace list
slk workspace use <name|domain|team-id>
slk workspace current
```

Maps from current commands:

- `slk auth` → `slk workspace auth`
- `slk workspaces` → `slk workspace list`
- `slk switch <...>` → `slk workspace use <...>`

Notes:
- `current` is optional but useful for scripts that only need the active team ID / name.

### `slk convo`

Conversation and people discovery plus direct history reads.

```text
slk convo list channels
slk convo list dms
slk convo list users
slk convo read <conversation> [count]
slk convo search <query> [count]
slk convo pins <conversation>
slk convo saved [count]
```

Maps from current commands:

- `slk channels` → `slk convo list channels`
- `slk dms` → `slk convo list dms`
- `slk users` → `slk convo list users`
- `slk read` → `slk convo read`
- `slk search` → `slk convo search`
- `slk pins` → `slk convo pins`
- `slk saved` → `slk convo saved`

### `slk message`

Single-message operations.

```text
slk message permalink <conversation> <ts>
slk message send <conversation> <text>
slk message react <conversation> <ts> <emoji>
```

Maps from current commands:

- `slk permalink` → `slk message permalink`
- `slk send` → `slk message send`
- `slk react` → `slk message react`

### `slk thread`

Thread-specific reads and thread inbox workflows.

```text
slk thread read <conversation> <ts> [count]
slk thread inbox [count]
```

Maps from current commands:

- `slk thread <...>` → `slk thread read <...>`
- `slk thread-inbox [count]` → `slk thread inbox [count]`

Why keep thread inbox here?
- It is still close to a real Slack concept: the subscribed-thread / thread inbox view.
- It reads better as a thread-oriented mode than as a generic attention queue.

### `slk attention`

Synthesized or attention-centric workflow views.

```text
slk attention mentions [count]
slk attention triage [count]
slk attention unread
slk attention activity
slk attention starred
```

Maps from current commands:

- `slk mentions` → `slk attention mentions`
- `slk triage` → `slk attention triage`
- `slk unread` → `slk attention unread`
- `slk activity` → `slk attention activity`
- `slk starred` → `slk attention starred`

This namespace matters because these are not all pure Slack objects. They are “what needs attention?” views.

### `slk summary`

Synthesized summaries of Slack entities.

```text
slk summary channel <channel> [count]
```

Maps from current commands:

- `slk channel-context <channel> [count]` → `slk summary channel <channel> [count]`

Why a separate namespace?
- `channel-context` is not a primitive. It is a synthesized summary object.
- `summary channel` is easier to extend later with `summary user`, `summary dm`, or `summary thread`.

### `slk draft`

Draft lifecycle.

```text
slk draft channel <conversation> <message>
slk draft thread <conversation> <ts> <message>
slk draft user <user_id> <message>
slk draft list
slk draft drop <draft_id>
```

Maps from current commands:

- `slk draft <conversation> <message>` → `slk draft channel <conversation> <message>`
- `slk draft thread ...` → same
- `slk draft user ...` → same
- `slk drafts` → `slk draft list`

### `slk util`

Structured-output utilities.

```text
slk util export <source> ...
slk util watch <source> ...
```

Maps from current commands:

- `slk export ...` → `slk util export ...`
- `slk watch ...` → `slk util watch ...`

## Preferred source names inside utility commands

Today, `export` and `watch` accept source names from the flat command surface. For `1.0`, use the canonical internal names even if the flat aliases still exist:

- `mentions`
- `triage`
- `thread-inbox`
- `channel-context`
- `read`
- `search`
- `unread`
- `activity`

Longer term, the ideal shape is:

```text
slk util export attention triage 20 --format ndjson
slk util export thread inbox 20 --format csv
```

But that is a second-step design. It should not be attempted until the first hierarchical surface is stable.

## Flag scoping in the hierarchical model

One benefit of hierarchy is tighter option semantics.

### `slk convo read`
- `--threads`
- `--from`
- `--to`
- `--since-ts`
- `--checkpoint`
- `--cursor`
- `--json`

### `slk convo search`
- `--page`
- `--summary-fields`
- `--json`

### `slk thread inbox`
- `--max-ts`
- `--summary-fields`
- `--json`

### `slk attention mentions` / `slk attention triage`
- `--from`
- `--to`
- `--user`
- `--channel`
- `--kind`
- `--summary-fields`
- `--checkpoint`
- `--json`

### `slk util export`
- `--format`
- `--output`

### `slk util watch`
- `--interval`
- `--iterations`
- `--checkpoint`
- `--json`

Runtime flags like `--no-cache`, `--refresh`, `--debug-cache`, and `--debug-queue` can remain shared.

## Migration strategy

### Phase 1 — now (`0.x`)
- Keep the flat command surface as the primary executable surface
- Keep preferred names documented as:
  - `triage`
  - `thread-inbox`
  - `channel-context`
- Add this design doc and keep docs consistent about future direction

### Phase 2 — dual surface (`0.x` late or `0.9`)
- Introduce hierarchical aliases behind the existing flat commands
- Examples:
  - `slk workspace list`
  - `slk convo read general 20`
  - `slk attention triage 20`
- Keep flat commands fully supported
- Update tests so both surfaces produce identical structured output

### Phase 3 — major release (`1.0`)
- Make hierarchical commands the primary help surface
- Keep flat commands as compatibility aliases if practical
- If any flat commands are removed, ship a migration table in README and release notes

## Backward compatibility rules

- Do not silently change JSON payload shapes during the hierarchy migration
- Prefer aliasing old names to new handlers instead of duplicating logic
- Utility commands should continue accepting the old source names during the transition
- Keep stable machine-readable metadata in JSON even if help text changes

## Example translations

```bash
# today
slk auth
slk read engineering 50 --threads --json
slk thread-inbox 20 --json
slk triage 20 --checkpoint inbox-main --json
slk channel-context engineering 20 --json
slk export mentions 20 --format ndjson

# future
slk workspace auth
slk convo read engineering 50 --threads --json
slk thread inbox 20 --json
slk attention triage 20 --checkpoint inbox-main --json
slk summary channel engineering 20 --json
slk util export mentions 20 --format ndjson
```

## Recommendation

For the next public release, do not ship the hierarchy yet. Ship the current flat surface with:

- explicit taxonomy in docs
- preferred names clearly stated
- this `v1` design doc for maintainers and contributors

That keeps compatibility intact while making the long-term direction legible.
