# Security Policy

## What this tool does with your credentials

`slack-personal-cli` does **not** use Slack's official OAuth flow. It reads the
session artifacts the Slack **desktop app** already stores on your Mac and reuses
them to act as you:

- the encrypted `d` cookie from Slack's Cookie store, decrypted with the
  **"Slack Safe Storage"** key from your macOS **Keychain**;
- the `xoxc-` session token(s) from Slack's local **LevelDB**/IndexedDB.

These are combined into a bearer credential and sent to `https://slack.com/api`.
With them, the tool can do anything your Slack account can do in the workspaces
you're signed into — read private channels and DMs, post as you, react, and
mark things read.

### Trust boundaries

- **Credentials never leave your machine** except in requests to Slack's own
  API. There is no telemetry, no third-party endpoint, and no network call other
  than to `slack.com`.
- A short-lived token cache lives at
  `~/.local/slack-personal-cli/token-cache.json`. It contains a session token —
  treat that directory as sensitive. Tokens are also written transiently to a
  temp file during cookie decryption and removed immediately after.
- The tool shells out to `sqlite3`, `openssl`, `curl`, and (as a fallback)
  `python3`. A compromised version of any of those on your `PATH` could observe
  the credentials. Use a trusted environment.

### Implications you should accept before using it

- This is **personal automation for a machine you control.** Running it grants
  whatever runs it full, unscoped access to your Slack account — there is no
  bot-token-style permission scoping.
- Using session artifacts this way may be against your workspace's policy.
  That's your call to make for your own account; don't run it against accounts
  or machines that aren't yours.
- If you run it inside an AI agent, that agent inherits your Slack access.
  Restrict what the agent can send (the CLI never posts unless you invoke a
  write command), and review automated actions.

## Supported versions

This is a small personal project. Security fixes are applied to the latest
release on `main` only.

## Reporting a vulnerability

Please report security issues **privately** rather than opening a public issue:

- Use GitHub's **"Report a vulnerability"** (Security advisories) on
  <https://github.com/kimjisub/slack-personal-cli/security/advisories/new>, or
- email the maintainer listed in `package.json`.

Include the version (`slk --version`), your macOS version, and steps to
reproduce. You'll get an acknowledgement as soon as the maintainer sees it;
because this is a personal project, response times are best-effort.
