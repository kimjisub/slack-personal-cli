# slk auth risk mitigation TODO

This document tracks concrete mitigations for the current auth approach.

## Current risk summary

`slk` currently authenticates by reading local Slack desktop session artifacts:
- macOS Keychain (`Slack Safe Storage`)
- Slack cookie store (`Cookies` SQLite)
- Slack local storage (`LevelDB`, `IndexedDB` fallback)
- validated `xoxc-*` token caching on disk

This is practical for personal automation, but sensitive for public distribution.

## Highest-priority mitigations

### 1. Harden token cache handling
- [x] Set cache file permissions explicitly to `0600`
- [x] Verify parent dir permissions on `~/.local/slk`
- [x] Avoid leaving plaintext tokens world-readable under any failure mode
- [ ] Consider atomic writes for cache replacement

### 2. Add cache control modes
- [x] `--no-cache` runtime flag
- [x] `SLK_NO_CACHE=1` environment variable
- [ ] optional short TTL / expiration policy for cached tokens
- [ ] optional command to clear cache (`slk logout` / `slk cache clear`)

### 3. Reduce extraction aggressiveness
- [ ] Consider making IndexedDB fallback opt-in instead of always-on
- [ ] Document LevelDB / IndexedDB scanning clearly
- [ ] Prefer the least invasive source that works (`localConfig_v2` before broader scans)

### 4. Safer defaults for AI agent usage
- [ ] Document that using `slk` from agents effectively grants Slack user-session access to those agents
- [ ] Consider a read-only mode for agent workflows
- [ ] Consider gating write commands behind explicit flag / env (`SLK_ENABLE_WRITE=1`)

### 5. Improve auditability
- [ ] Add a command to explain which auth source was used (cache / localConfig / LevelDB / IndexedDB)
- [ ] Add optional verbose auth diagnostics without printing secrets
- [ ] Make token extraction path easier to audit in code/docs

## Nice-to-have mitigations

### 6. Safer storage strategy
- [ ] Consider storing validated token in Keychain instead of plaintext disk cache
- [ ] Evaluate whether cookie/token can be kept memory-only for one-shot runs

### 7. UX / warning improvements
- [ ] Warn clearly when the user chooses Keychain `Always Allow`
- [ ] Warn when running on shared or managed machines
- [ ] Warn when cache file already exists with weak permissions

### 8. Security hygiene
- [ ] Ensure temp files are always removed on all error paths
- [ ] Review command invocations (`sqlite3`, `openssl`, `curl`, `python3`) for edge-case failure behavior
- [ ] Consider checksum / sanity validation around token extraction results

## Bottom line

The current approach is acceptable for a personal, local productivity tool on a machine the user controls.
Before broader public distribution, token handling, write-safety, cache policy, and documentation should be tightened.
