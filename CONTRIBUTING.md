# Contributing to slk

Thanks for contributing.

## Before you start

`slk` is a macOS-only Slack CLI that reuses credentials from the locally installed Slack desktop app. It is designed for personal/local automation first. Please read these before opening a large change:

- `README.md`
- `AGENTS.md`
- `SECURITY.md`
- `docs/public-release-checklist.md`
- `docs/public-release-audit.md`
- `docs/auth-risk-mitigation.md`
- `docs/hierarchical-subcommands.md`

## Project principles

1. Keep Slack-native commands narrow and literal.
2. Keep synthesized agent views clearly labeled as synthesized.
3. Prefer non-breaking cleanup: add aliases before removing old names.
4. Treat JSON output as a stable API surface for agents.
5. Keep security / auth model warnings accurate and prominent.

## Local development

```bash
npm install
npm test
node bin/slk.js --help
```

Run directly:

```bash
node bin/slk.js auth
node bin/slk.js triage 1 --json
```

## Testing expectations

For behavior changes, add or update tests first.

Useful commands:

```bash
node --test tests/commands.test.js
node --test tests/config.test.js
node --test tests/agent-utils.test.js
npm test
```

## CLI change checklist

If you change commands, flags, aliases, or JSON output:

- [ ] Update tests
- [ ] Update `bin/slk.js --help`
- [ ] Update `README.md`
- [ ] Update `SKILL.md`
- [ ] Update `AGENTS.md` if maintenance guidance changed
- [ ] Prefer preferred names in examples: `triage`, `thread-inbox`, `channel-context`

## Pull request guidance

Good PRs are:
- small in scope
- explicit about whether they touch Slack-native commands or synthesized agent views
- clear about any JSON shape changes
- clear about any auth / safety implications

Suggested PR template:

```md
## Summary
- ...

## Surface touched
- [ ] Slack-native command
- [ ] Synthesized agent view
- [ ] Utility (`export` / `watch`)
- [ ] Auth / cache / runtime
- [ ] Docs only

## Test plan
- `npm test`
- `node bin/slk.js --help`
- ...

## Compatibility
- [ ] No breaking CLI changes
- [ ] Added alias for renamed command
- [ ] JSON shape unchanged
- [ ] JSON shape intentionally changed and documented
```
