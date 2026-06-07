# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-06-07

### Changed

- **Standardized active-workspace resolution** to match mature multi-context
  CLIs (kubectl/aws/docker/gcloud). A single resolver now decides the target for
  scope-less commands with a clear precedence: `-w` flag → `SLACK_CLI_WORKSPACE`
  env → `workspace use` file → sole login → **error** (no more silent
  first-found / token-cache guessing). `workspace current` reports the resolved
  workspace *and its source*, so the readout always matches execution.

### Added

- **`SLACK_CLI_WORKSPACE`** env var to override the active workspace per
  session/script (like `AWS_PROFILE` / `DOCKER_CONTEXT`).
- `-w` and `-A` are now rejected together with a clear usage error.

### Fixed

- When no workspace was selected and 2+ were logged in, the `current` readout
  and actual execution could target different workspaces. They now share one
  resolver, and an ambiguous state errors instead of guessing.

## [0.5.0] - 2026-06-04

### Added

- **Workspace scope flags**, consistent across commands: default targets the
  active workspace, `-w, --workspace <name|id>` targets a specific one, and
  `-A, --all-workspaces` runs across every locally signed-in workspace.
- **`inbox activity -A` / `inbox unread -A`** — unread/mention/DM digest
  aggregated across all workspaces, grouped per workspace.
- **`owed [--days N]`** — surfaces mentions you haven't answered yet; a reply or
  an emoji reaction in the thread clears them. Works per-workspace or with `-A`.
- **`search -A`** — fan out search across all workspaces and merge results
  newest-first, tagged by workspace.
- **`mark <channel>`** — opt-in `conversations.mark` to mark a channel read
  (active or `-w`; not `-A`).
- **`--json`** — machine-readable output for `inbox`, `owed`, `search`, `mark`.

### Changed

- Credential resolution in `auth.js` is now lazy: importing any module has no
  side effects, so the test suite (and CI) runs without a local Slack install.
- Internal refactor: presentation moved to `src/render.js`, the cross-workspace
  fan-out/emit flow to `src/scoped.js`, and error exits unified through
  `output.die()`. No user-facing behavior change.

### Notes

- `schedule` was evaluated and intentionally **not** included: Slack's
  `chat.scheduleMessage` rejects browser session tokens
  (`not_allowed_token_type`), which is the only kind of token this tool uses.

## [0.4.0]

- Baseline: session-based Slack CLI with auth, read/send, search, threads,
  drafts, inbox views, and multi-workspace switching.
