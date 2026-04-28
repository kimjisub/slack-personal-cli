# Changelog

All notable changes to `slkcli` will be documented in this file.

The format is inspired by Keep a Changelog, and this project follows semver-in-spirit while the CLI surface is still evolving.

## [Unreleased]

### Planned
- Hierarchical subcommand aliases for a future `1.0` CLI
- Optional read-only / write-gate mode for automation contexts
- Cache-clear command for local credential/runtime state

## [0.2.0] - 2026-04-28

### Added
- Multi-workspace discovery with `slk workspaces`
- Active workspace switching with `slk switch <name|domain|team-id>`
- Agent-facing views: `mentions`, `triage`, `thread-inbox`, `channel-context`
- `permalink` command for stable Slack message links
- JSON output and summary-field projection across agent-relevant commands
- Incremental checkpoint support for structured polling workflows
- `export` and `watch` utility commands
- `cache-clear` command for local token/cache/runtime cleanup
- Shared runtime hardening for cache, queueing, pacing, retry, and read-only safety mode
- `CONTRIBUTING.md`, `SECURITY.md`, release audit docs, and hierarchy design docs

### Changed
- Public docs now distinguish Slack-native commands, synthesized agent views, and utilities
- Preferred names are now documented explicitly:
  - `triage`
  - `thread-inbox`
  - `channel-context`
- README now frames `slkcli` as a macOS personal/local automation tool rather than a generic Slack CLI

### Compatibility
- Legacy aliases remain supported:
  - `inbox`
  - `thread-unread`
  - `context`
