# Demo assets

`slk-demo.gif` is the terminal demo shown in the main README.

## ⚠️ Synthetic data

The demo does **not** use real Slack content. `path/slk` is a stand-in script
that prints `slk`'s real output *format* with made-up workspaces (Acme Corp,
Weekend Hackers, rust-lang community, side-project). This keeps real workspace
data out of the recording while showing exactly what the tool looks like.

## Regenerate

Requires [`vhs`](https://github.com/charmbracelet/vhs) (`brew install vhs`).
From the repo root:

```bash
vhs assets/demo/demo.tape
```

That re-renders `assets/demo/slk-demo.gif` in place.

## Editing

- **What's shown / pacing / theme** → edit `demo.tape` (it's a small DSL:
  `Type`, `Sleep`, `Enter`, `Set Theme`, …).
- **The fake output** (workspace names, channels, messages) → edit
  `path/slk`. Match the real command output format so the demo stays accurate.
