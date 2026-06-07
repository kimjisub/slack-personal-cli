# slk demo — synthetic data, real output format.
# Regenerate from the repo root:  vhs assets/demo/demo.tape
Output "assets/demo/slk-demo.gif"

Set Shell "bash"
Set FontSize 18
Set Width 1180
Set Height 900
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 22ms

# --- setup (hidden): put the synthetic `slk` on PATH + a clean prompt ---
Hide
Type "export PATH=$PWD/assets/demo/path:$PATH; export PS1='$ '; clear"
Enter
Show

Sleep 600ms
Type "# signed into several Slack workspaces? slk sees them all"
Sleep 400ms
Enter
Type "slk workspace list"
Sleep 300ms
Enter
Sleep 2200ms

Type "slk inbox unread -A"
Sleep 300ms
Enter
Sleep 3200ms

Type "# what have I left unanswered, everywhere?"
Sleep 400ms
Enter
Type "slk owed"
Sleep 300ms
Enter
Sleep 3500ms

Type "# read the thread, then act on it"
Sleep 400ms
Enter
Type "slk read engineering --ts"
Sleep 300ms
Enter
Sleep 2600ms

Type 'slk reply engineering 1780681424.000200 "on it 👍"'
Sleep 300ms
Enter
Sleep 1600ms
Type "slk react engineering 1780681424.000200 rocket"
Sleep 300ms
Enter
Sleep 1600ms
Type 'slk send general "deploying the hotfix now"'
Sleep 300ms
Enter
Sleep 1600ms
Type 'slk draft channel engineering "PR review notes…"'
Sleep 300ms
Enter
Sleep 2200ms

Type "# search every workspace at once"
Sleep 400ms
Enter
Type 'slk search "deploy" -A'
Sleep 300ms
Enter
Sleep 3200ms

Type "# --json on every command — pipe it into any agent"
Sleep 400ms
Enter
Type "slk owed -A --json"
Sleep 300ms
Enter
Sleep 2800ms

Type "# works inside Claude Code, Codex, Hermes, OpenClaw —"
Sleep 300ms
Enter
Type "# any agent that can run a shell. No OAuth app, no bot token."
Sleep 1500ms
Enter
Sleep 1800ms
