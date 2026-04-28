# Public release audit for `slk` v0.2.0

This document evaluates the current repo against `docs/public-release-checklist.md`.

Status labels:
- pass
- partial
- missing

## Recommended positioning decision

Current recommendation: treat `slk` as a public, open-source repository for personal/local automation on macOS — not as a general enterprise Slack integration.

That means the project should keep saying all of the following, clearly and repeatedly:
- macOS only
- personal/local automation first
- uses local Slack desktop session credentials
- acts as the signed-in user
- not Slack-endorsed

## Audit summary

| Area | Status | Notes |
|---|---|---|
| Positioning clarity | pass | README and package description both frame the tool as personal/local automation on macOS. |
| Auth model clarity | pass | README and SKILL clearly explain session reuse, non-OAuth auth, and signed-in-user behavior. |
| Secret handling | pass | Owner-only file permissions exist, runtime cache controls exist, and `slk cache-clear` can clear local state. |
| AI / automation safety | pass | Warnings exist and read-only mode can block mutating Slack actions. |
| Engineering quality | pass | Runtime, cache, lock, and retry behavior are documented and covered by tests. |
| Policy / branding | pass | README already says independent/not affiliated. |
| Naming / branding consistency | partial | Repo/package naming is consistent around `slkcli`, but future long-term brand choice (`slk` vs `slkcli`) should be kept under review. |

## Checklist audit

### Positioning
- [x] Decide whether `slk` is explicitly personal-use only or intended for broader public use
- [x] If personal-use only, say that clearly in README and package metadata
- [x] If public-use, document the auth model and its trade-offs very prominently

Assessment:
- The repo currently communicates the correct “public repo, personal/local automation tool” position.

### Auth model clarity
- [x] README clearly states that `slk` does not use Slack OAuth
- [x] README clearly states that `slk` reuses local desktop session credentials
- [x] README clearly explains what system data is accessed
- [x] README clearly states that commands act as the signed-in user

Assessment:
- This is one of the stronger parts of the repo right now.

### Secret handling
- [x] Disk cache permissions are hardened (`0600`)
- [x] `--no-cache` or equivalent exists
- [x] Cache clear command exists
- [x] Sensitive data is never printed to stdout/stderr by default

Assessment:
- File permission hardening is implemented in auth/cache/lock/runtime files.
- `slk cache-clear` now clears token/cache/runtime state while preserving the selected workspace by default.

### Safety for AI/automation use
- [x] Agent/automation documentation explains that `slk` grants Slack session access
- [x] Write commands are intentionally designed, not accidental
- [x] Optional write gate / read-only mode exists if needed

Assessment:
- Current docs are honest.
- `--read-only` and `SLK_READ_ONLY=1` now provide a simple safety gate for automation contexts.

### Engineering quality
- [x] Extraction paths are documented and testable
- [x] Fallback order is deterministic and auditable
- [x] Errors are understandable without leaking secrets
- [x] Temp files are cleaned up reliably

Assessment:
- Test coverage and docs are sufficient for this release tier.

### Policy / ecosystem risk
- [x] Accept that this auth model may be viewed as non-standard or policy-sensitive
- [x] Avoid overstating safety or official support
- [x] Keep branding clear: independent tool, not Slack-endorsed

Assessment:
- README language is appropriately cautious.

### Naming / branding
- [ ] If upstream is unresponsive, decide whether to remain a fork or publish under an independent name
- [x] Ensure repo / package / docs names match the intended long-term identity

Assessment:
- Immediate release is fine.
- Long-term question remains whether the public brand should stay `slkcli` or evolve into a more explicit name around personal Slack automation.

## Release blockers vs non-blockers

### Not blocking `v0.2.0`
- hierarchical subcommand surface not implemented yet
- no `CHANGELOG.md` in earlier versions

### Worth shipping soon after `v0.2.0`
1. public issue templates / PR template if community traffic starts to grow
2. decide the longer-term public branding strategy (`slk` vs `slkcli`)

## Recommendation

`slk` is ready for a public `v0.2.0` release as a clearly positioned macOS personal-automation CLI.

It is not yet positioned as a universally safe general-purpose Slack integration, and the docs should continue to avoid implying that.
