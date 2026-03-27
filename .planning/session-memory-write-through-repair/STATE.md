# State

## 2026-03-27

- Approved by Mathieu to proceed immediately.
- Ground truth from audit: current branch `feature/exa-search-provider` is unrelated to memory changes.
- Known gap: `/Users/mathieuwauters/code/openclaw-pr-fix/src/gateway/server-methods/chat.ts` appends transcripts without emitting the transcript-update event consumed by session-memory sync.
- Implemented the narrow fix in `/Users/mathieuwauters/code/openclaw-pr-fix/src/gateway/server-methods/chat.ts`: gateway-injected transcript appends now emit `emitSessionTranscriptUpdate(transcriptPath)` immediately after `SessionManager.appendMessage(...)`.
- Added verification coverage in `/Users/mathieuwauters/code/openclaw-pr-fix/src/gateway/server-methods/chat.inject.parentid.e2e.test.ts` and `/Users/mathieuwauters/code/openclaw-pr-fix/src/gateway/server-methods/server-methods.test.ts`.
- Verified with:
  - `pnpm exec vitest run --config vitest.e2e.config.ts src/gateway/server-methods/chat.inject.parentid.e2e.test.ts`
  - `pnpm exec vitest run --config vitest.gateway.config.ts src/gateway/server-methods/server-methods.test.ts`
  - `pnpm exec oxfmt --check src/gateway/server-methods/chat.ts src/gateway/server-methods/server-methods.test.ts src/gateway/server-methods/chat.inject.parentid.e2e.test.ts`
  - `pnpm exec oxlint src/gateway/server-methods/chat.ts src/gateway/server-methods/server-methods.test.ts src/gateway/server-methods/chat.inject.parentid.e2e.test.ts`
- Remaining explicit risk is branch hygiene, not test failure: this repair now lives on `feature/exa-search-provider` because the repo instructions forbid branch switching without explicit request.
