# Security policy

`slkcli` is an auth-sensitive tool.

It does not use Slack OAuth. It reads locally available Slack desktop session artifacts on macOS and reuses them to act as the signed-in user. That makes responsible disclosure especially important.

## Supported versions

Because the project is still early-stage, security fixes are expected to land on the latest published version first.

| Version | Supported |
|---|---|
| latest | yes |
| older `0.x` releases | best effort |

## What to report

Please report issues that could:
- expose Slack session credentials
- leak cached secrets to other local users or processes
- bypass intended workspace selection boundaries
- unintentionally execute write operations
- weaken cache, lock, or runtime isolation guarantees

## How to report

Prefer a private report before opening a public issue.

Until a dedicated security inbox exists, use the repository issue tracker only if the report does not disclose active secrets or a weaponizable exploit path. If you need a safer channel, mention in a minimal public issue that you need a private contact path for a security report.

## Operational guidance for users

- Treat `~/.local/slk/` as sensitive local state
- Prefer personal machines over shared or managed machines
- Be cautious with "Always Allow" Keychain access for `Slack Safe Storage`
- Consider disabling cache behavior in higher-risk environments with `--no-cache`
- Assume any process acting as your user may be able to invoke `slk` if your environment is compromised

## Scope and limits

This tool is intended for local personal automation on macOS. It is not presented as a hardened enterprise credential broker or a Slack-endorsed integration.
