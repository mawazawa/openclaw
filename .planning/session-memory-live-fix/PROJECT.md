# Session Memory Live Fix

## Outcome

Repair the live OpenClaw memory embedding auth path so environment-backed API keys can be used for session-memory indexing and search even when stale auth profiles exist, then deploy that fix into the installed runtime and prove session memory stays searchable.

## Success Criteria

- Memory embedding auth can prefer a valid env-backed key for service-style indexing/search paths.
- A stale Google auth profile no longer blocks Gemini-backed session-memory indexing when `GEMINI_API_KEY` is valid.
- The installed runtime on this machine is updated from a source tree that matches the installed `2026.3.24` release.
- A live regression check proves gateway health plus searchable `main` session memory after deploy.

## Scope

- `/Users/mathieuwauters/code/openclaw-live-fix/src/agents/`
- `/Users/mathieuwauters/code/openclaw-live-fix/src/memory/`
- `/Users/mathieuwauters/code/openclaw-live-fix/src/commands/`
- `/Users/mathieuwauters/clawd/scripts/reliability/`

## Non-Goals

- Reworking global auth precedence for all interactive provider flows.
- Re-enabling disabled SQLite memory-core defaults.
- Changing OpenClaw channel behavior unrelated to session-memory indexing/search.
