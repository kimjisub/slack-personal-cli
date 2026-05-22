# slack-personal-cli public-release checklist

Use this checklist before treating `slack-personal-cli` as a broadly distributed public tool rather than a personal automation utility.

## Positioning
- [ ] Decide whether `slack-personal-cli` is explicitly **personal-use only** or intended for broader public use
- [ ] If personal-use only, say that clearly in README and package metadata
- [ ] If public-use, document the auth model and its trade-offs very prominently

## Auth model clarity
- [ ] README clearly states that `slack-personal-cli` does **not** use Slack OAuth
- [ ] README clearly states that `slack-personal-cli` reuses local desktop session credentials
- [ ] README clearly explains what system data is accessed
- [ ] README clearly states that commands act as the signed-in user

## Secret handling
- [ ] Disk cache permissions are hardened (`0600`)
- [ ] `--no-cache` or equivalent exists
- [ ] Cache clear command exists
- [ ] Sensitive data is never printed to stdout/stderr by default

## Safety for AI/automation use
- [ ] Agent/automation documentation explains that `slack-personal-cli` grants Slack session access
- [ ] Write commands are intentionally designed, not accidental
- [ ] Optional write gate / read-only mode exists if needed

## Engineering quality
- [ ] Extraction paths are documented and testable
- [ ] Fallback order is deterministic and auditable
- [ ] Errors are understandable without leaking secrets
- [ ] Temp files are cleaned up reliably

## Policy / ecosystem risk
- [ ] Accept that this auth model may be viewed as non-standard or policy-sensitive
- [ ] Avoid overstating safety or official support
- [ ] Keep branding clear: independent tool, not Slack-endorsed

## Naming / branding
- [ ] If upstream is unresponsive, decide whether to remain a fork or publish under an independent name
- [ ] Ensure repo / package / docs names match the intended long-term identity

## Release decision gate

If the tool is:
- **for personal local automation** → current approach may be acceptable with better warnings and safer cache behavior
- **for broad public distribution** → complete at least the secret-handling and auth-clarity checklist first
