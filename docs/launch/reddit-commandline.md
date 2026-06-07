# Reddit — r/commandline

Casual but informative. A demo GIF is basically required. Disclose self-promo.
Attach [`../../assets/demo/slk-demo.gif`](../../assets/demo/slk-demo.gif).

## Title

```
[OC] slk — a macOS Slack CLI with no token setup that works across all your workspaces at once
```

## Body

```
I built a small Slack CLI for my own use and figured r/commandline might like it.

The pitch: no OAuth app, no bot token, no cookie copying. It reuses your Slack
desktop session, so you just install it and run. And because it sees every
workspace you're logged into, it has a few commands the official/MCP options
can't really do:

    slk inbox -A      # unread + mentions across every workspace
    slk owed          # mentions you still owe a reply to
    slk search q -A   # search all workspaces, merged

Other bits commandline folks might appreciate:
- zero runtime dependencies (single Node package)
- --json on the main commands for piping into jq/scripts
- a shared rate-limiter so multiple concurrent invocations don't hammer Slack

Caveats so nobody's surprised: macOS only, it's session-based (acts as your
user, full access, not scoped), and it rides Slack's local storage format so
it's inherently a bit fragile. Details + a comparison table in the README.

Repo: https://github.com/kimjisub/slack-personal-cli

(Self-promo, it's my own project and MIT-licensed. Feedback welcome.)
```
