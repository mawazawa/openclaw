# State

## 2026-03-27

- Approved by Mathieu to proceed immediately.
- Ground truth from audit: current branch `feature/exa-search-provider` is unrelated to memory changes.
- Known gap: `/Users/mathieuwauters/code/openclaw-pr-fix/src/gateway/server-methods/chat.ts` appends transcripts without emitting the transcript-update event consumed by session-memory sync.
- Next step: inspect the chat append path, wire the notifier, add targeted tests, verify, then report branch hygiene risk separately.
