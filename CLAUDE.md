# CLAUDE.md — Quick Reference for Claude Code / Codex

## What is slack-personal-cli?

Slack CLI for macOS. Auto-auth from Slack desktop app (session cookies, no bot install). Zero dependencies.

## Key Files

- `src/commands.js` — All command logic. Add new commands here.
- `src/api.js` — `slackApi()` and `slackPaginate()`. Add POST endpoints to `writeMethods` array.
- `src/auth.js` — Keychain + LevelDB credential extraction + Snappy decompression + workspace management.
- `src/drafts.js` — Draft commands (create/list/drop).
- `bin/slk.js` — CLI entry point. Command routing + help text.

## Adding a Feature

1. Add function in `src/commands.js` (export async)
2. If new API needs POST → add to `writeMethods` in `src/api.js`
3. Add case + alias in `bin/slk.js` switch block
4. Add to HELP string in `bin/slk.js`
5. Update `README.md` (commands table, examples, flags if any)
6. Update `SKILL.md` (commands list)
7. `npm version patch --no-git-tag-version`
8. `git add -A && git commit -m "feat: ..." && git push`  ← release; users install via `npm install -g github:kimjisub/slack-personal-cli`
9. (optional) `git tag v$(node -p "require('./package.json').version") && git push --tags`
10. (optional, downstream skill mirrors) `cp SKILL.md ~/.claude/skills/slack-personal/SKILL.md`

## Testing

```bash
node bin/slk.js <command>   # Direct run
slk <command>
```

## Patterns

- Use `getUsers()` for user ID → name resolution (cached)
- Use `resolveChannel(nameOrId)` for channel name/ID handling
- Use `formatTs(ts)` for Slack timestamp → human date
- Use `listWorkspaces()` for workspace enumeration from `auth.js`
- Errors: `console.error()` + `process.exit(1)`
- Output: `console.log()` with emoji prefixes

## Auth

Session-based (`xoxc-` token + `xoxd-` cookie). Auto-extracted from Slack desktop app on macOS.
- Token cache: `~/.local/slack-personal-cli/token-cache.json`. Delete to force re-extract.
- Active workspace: `~/.local/slack-personal-cli/active-workspace`. Delete to reset to default.

### Multi-workspace

All workspace tokens are stored in `localConfig_v2` inside LevelDB (Snappy-compressed SSTable blocks, UTF-16LE encoded JSON).
- `extractLocalConfig()` — parses LevelDB index → decompresses blocks → regex-extracts team entries
- `listWorkspaces()` / `setActiveWorkspace()` / `getCredentialsForTeam()` — workspace CRUD
- `getCredentials()` checks active workspace first, then falls back to cache → localConfig → LevelDB/IndexedDB scan

## Distribution

Not published to npm. Installs come straight from the GitHub repo:

```bash
npm install -g github:kimjisub/slack-personal-cli
```

`git push` is the release step. No npm token, no `.npmrc`.
