# Show HN

HN punishes marketing tone. First person, "why I built it", technical honesty,
and **limitations stated up front** earn trust.

## Title (≤80 chars)

```
Show HN: Slk – a zero-setup macOS Slack CLI that spans all your workspaces
```

## First comment (post immediately after submitting)

```
I'm signed into ~10 Slack workspaces and got tired of two things: clicking
between them to find what I'd missed, and the setup tax on every Slack
integration (create an app, juggle OAuth scopes, copy bot tokens).

slk skips all of that. It reads the session your Slack desktop app already
has — the Keychain "Safe Storage" key + the local LevelDB token — so there's
no app to create and no token to paste. Because it reads every signed-in
workspace at once, it can do things a single-token integration structurally
can't:

  slk inbox -A         # unread/mentions/DMs across ALL workspaces, at once
  slk owed             # mentions you haven't replied to (an emoji counts)
  slk search "x" -A    # search every workspace, merged newest-first

It's a CLI, so a human uses it in the terminal and an agent uses it over a
shell. There's a --json flag for piping. Zero runtime dependencies — it's a
single small Node package; the LevelDB SSTable + Snappy decoding is hand-rolled
rather than pulling a library.

Honest limitations, up front:
- macOS only (it depends on Keychain + the Slack app's storage layout).
- It's NOT official OAuth. It reuses your desktop session and acts as YOU,
  with full account access and no scoping. Personal automation on a machine
  you control — not something to point at accounts that aren't yours.
- It rides undocumented Slack internals, so a Slack app update could break the
  extraction layer. The pure parsing logic is unit-tested; the extraction
  against real Slack data is opt-in.

There's a comparison table in the README vs the official Slack MCP and the
popular community one (korotovsky/slack-mcp-server), and a SECURITY.md spelling
out exactly what it touches.

https://github.com/kimjisub/slack-personal-cli

Happy to answer anything — especially curious if people want the multi-workspace
"owed" view as much as I did.
```
