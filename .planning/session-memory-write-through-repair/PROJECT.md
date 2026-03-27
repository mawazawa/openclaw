# Session-Memory Write-Through Repair

## Outcome

Ensure chat transcript appends in OpenClaw emit the same session transcript update signal as other append paths so session-memory indexing can observe new transcript data promptly.

## Success Criteria

- Chat append path emits transcript update after successful transcript persistence.
- A targeted test proves the chat path emits the event.
- A targeted test proves the event reaches the session-memory sync seam or at least the notifier contract used by that seam.
- Existing session-memory behavior is not regressed.

## Scope

- `/Users/mathieuwauters/code/openclaw-pr-fix/src/gateway/server-methods/chat.ts`
- related transcript event helpers
- targeted tests only

## Non-Goals

- changing session-memory opt-in defaults
- changing debounce thresholds
- broader memory architecture refactors
