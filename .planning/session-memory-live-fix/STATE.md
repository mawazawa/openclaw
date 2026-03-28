# State

## 2026-03-27 14:29 PDT

- Installed runtime is `/opt/homebrew/lib/node_modules/openclaw` at `2026.3.24` commit `cff6dc94e30794a269eb7805b6e636c3634a088c`.
- Matching source clone created at `/Users/mathieuwauters/code/openclaw-live-fix` on branch `codex/session-memory-live-fix`.
- Live workaround already in place via `/Users/mathieuwauters/.openclaw/openclaw.json` using `memorySearch.remote.apiKey = "GEMINI_API_KEY"` for agent `main`.
- Gateway is currently healthy and `main` session memory is indexed; remaining gap is making the auth behavior work without relying on that workaround and adding a durable live regression check.
