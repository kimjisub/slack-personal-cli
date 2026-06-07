# slk demo — synthetic data, real output format.
# Regenerate from the repo root:  vhs assets/demo/demo.tape
Output "assets/demo/slk-demo.gif"

Set Shell "bash"
Set FontSize 18
Set Width 1180
Set Height 860
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 55ms

# --- setup (hidden): put the synthetic `slk` on PATH + a clean prompt ---
Hide
Type "export PATH=$PWD/assets/demo/path:$PATH; export PS1='$ '; clear"
Enter
Show

Sleep 700ms
Type "# one CLI across every Slack workspace you're signed into"
Sleep 600ms
Enter
Sleep 400ms

Type "slk inbox unread -A"
Sleep 700ms
Enter
Sleep 3500ms

Type "# what have I left unanswered, everywhere?"
Sleep 500ms
Enter
Type "slk owed"
Sleep 700ms
Enter
Sleep 4000ms

Type "# search all workspaces at once"
Sleep 500ms
Enter
Type 'slk search "deploy" -A'
Sleep 700ms
Enter
Sleep 3500ms

Type "# --json on every command — pipe it into any agent"
Sleep 500ms
Enter
Type "slk owed -A --json"
Sleep 700ms
Enter
Sleep 3000ms

Type "# works inside Claude Code, Codex, Hermes, OpenClaw —"
Sleep 400ms
Enter
Type "# any agent that can run a shell. No OAuth app, no bot token."
Sleep 1500ms
Enter
Sleep 1800ms
