# Contributing

Thanks for your interest in `slack-personal-cli`. This is a small, focused,
**zero-dependency** Node project — please keep it that way.

## Development setup

Requires Node 18+ and (for live use) the macOS Slack desktop app signed in.

```bash
git clone https://github.com/kimjisub/slack-personal-cli.git
cd slack-personal-cli
npm link          # puts `slk` on your PATH, pointing at this checkout
slk auth          # verify it can read your local Slack session
```

## Running tests

No install step — there are no dependencies.

```bash
node --test                 # unit + routing tests (fast, no network)
node --check src/*.js bin/*.js   # syntax check
```

Tests run on Linux CI without a Slack install: importing any module is
side-effect free, and credential access is only triggered when a command
actually runs. Live tests against real Slack are opt-in:

```bash
SLK_LIVE_TESTS=1 SLK_LIVE_READ_CHANNEL=general npm run test:live
```

See [Live Slack integration tests](README.md#live-slack-integration-tests) for
the full list of environment variables.

## Architecture

The code is layered so each module has one job:

| Module | Responsibility |
|---|---|
| `bin/slk.js` | Argument parsing, global flags (`-w`/`-A`/`--json`), command dispatch |
| `src/api.js` | Authenticated Slack HTTP calls, rate-limit/retry, pagination, `die()`-free transport |
| `src/auth.js` | Reads session credentials from the Slack desktop app (lazy — no import-time I/O) |
| `src/workspaces.js` | Scope resolution (`resolveScope`/`resolveTargets`) and bounded-concurrency fan-out (`mapWorkspaces`) |
| `src/scoped.js` | `runScopedSections()` — the shared "active vs `-w` vs `-A` → emit → summarize failures" flow |
| `src/commands.js` | Command implementations and their `compute*` data fetchers |
| `src/render.js` | Presentation: human-readable lines and the JSON-row shapers that mirror them |
| `src/output.js` | `emit()` (human vs `--json`) and `die()` (single error-exit path) |
| `src/drafts.js` | Slack-draft management commands |

### Conventions

- **Scope flags are uniform.** A command that can target a workspace takes
  `opts` and resolves it through `resolveScope`. Cross-workspace section
  commands (like `inbox`, `owed`) should use `runScopedSections` rather than
  re-implementing the fan-out/emit/failure pattern.
- **Keep fetching and rendering separate.** A command fetches plain data
  (`computeX`), `render.js` turns it into text, and `emit()` decides human vs
  JSON. Don't `console.log` business data straight from a fetcher.
- **Errors exit through `die()`** (or by throwing, which `bin/slk.js` catches).
  Don't sprinkle `console.error(...); process.exit(1)`.
- **No dependencies.** If you reach for a package, reconsider — the appeal of
  this tool is that it's a single small install with no supply chain.

## Pull requests

- Keep changes focused; one concern per PR.
- Add or update tests for behavior changes (`tests/*.test.js`).
- Run `node --test` and `node --check` before pushing — CI runs both on
  Node 18/20/22.
- Update `README.md` / `SKILL.md` when you add or change a command or flag.
