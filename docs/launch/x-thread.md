# X / Twitter thread

Strong hook, short lines, restrained emoji. Attach the demo GIF to tweet 1
([`../../assets/demo/slk-demo.gif`](../../assets/demo/slk-demo.gif)).

```
1/  I'm in ~10 Slack workspaces and built a CLI so I never have to click
    between them again.

    slk inbox -A → unread + mentions across ALL of them, one command.

    No OAuth app. No bot token. It just reads your desktop session. 🧵

2/  The setup is the whole point: there isn't any.

    Most Slack tools make you create an app, pick scopes, paste a token.
    slk reuses the session your Slack desktop app already has. Install → run.

3/  My favorite command:

    slk owed

    → every mention you haven't replied to yet, across every workspace.
    (Replied or dropped an emoji? It clears.) It's a to-do list you didn't
    have to make.

4/  It's a CLI, so it works two ways:
    • you, in the terminal
    • an AI agent, over a shell — Claude Code, Codex, Hermes, OpenClaw

    There's --json on every command for piping.

5/  Honest about what it is:
    • macOS only
    • not official OAuth — it acts as YOU, full access, no scoping
    • personal automation on your own machine, not a hosted bot

    README has a full comparison vs the official + community Slack MCPs.

6/  MIT, free, install from GitHub:
    https://github.com/kimjisub/slack-personal-cli

    Curious if the multi-workspace "owed" view is as useful to you as it is
    to me.
```
