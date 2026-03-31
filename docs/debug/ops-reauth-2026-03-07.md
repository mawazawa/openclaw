# Ops Report: Gateway Re-Auth & System Recovery

**Date**: 2026-03-07
**Operator**: Claude Code (Opus 4.6) + Mathieu Wauters
**Duration**: ~90 minutes
**Severity**: P1 — All agents offline

---

## Incident Summary

All OpenClaw agents (main, archibald, sable, speedy-gonzalez, kimi-raikonen) were failing with cascading provider errors. Every fallback model was unreachable, causing retry loops that consumed resources without producing responses.

## Root Cause

| Provider     | Error                                                        | Root Cause                                                         |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Anthropic    | `Your credit balance is too low to access the Anthropic API` | API account out of credits (separate from Claude Pro subscription) |
| OpenAI       | `API rate limit reached`                                     | Usage cap hit on gpt-5.1-codex                                     |
| OpenAI Codex | `API rate limit reached`                                     | Usage cap hit on gpt-5.3-codex                                     |
| Groq         | `API rate limit reached`                                     | Free tier rate limit                                               |
| WhatsApp     | `401 Unauthorized`                                           | Session logged out / stale credentials                             |

**Key insight**: Claude Pro $200/mo subscription (Claude Code CLI) is separate billing from the Anthropic API at console.anthropic.com. The Pro subscription does NOT add API credits.

## Resolution Steps

### 1. Process Cleanup (~1.8 GB RAM freed)

Killed non-essential processes consuming resources:

| Process                      | CPU  | RAM    | Action                                              |
| ---------------------------- | ---- | ------ | --------------------------------------------------- |
| Docker Desktop (5 procs)     | idle | 135 MB | `osascript -e 'tell application "Docker" to quit'`  |
| Adobe Creative Cloud Sync    | idle | 12 MB  | `kill <PID>`                                        |
| Zoom Audio Driver (residual) | idle | 7 MB   | `kill <PID>`                                        |
| MS Teams Audio Driver        | idle | 11 MB  | `kill <PID>`                                        |
| Chrome (13 tab renderers)    | 0%   | 1.3 GB | `pgrep -f "Chrome Helper (Renderer)" \| xargs kill` |
| ReportCrash                  | 2%   | 97 MB  | `kill <PID>`                                        |
| mission-control-api          | 3%   | 102 MB | `kill <PID>` + `launchctl bootout`                  |

### 2. Gateway Shutdown

Killed gateway + all agent processes to stop retry loops:

```bash
pkill -f openclaw-gateway
pkill -f openclaw
# If lingering:
kill -9 <PIDs>
```

### 3. Codex OAuth Re-Auth

The `openai-codex` provider syncs credentials from the Codex desktop app, NOT via an OpenClaw plugin.

**Credential flow**: Codex.app login -> `~/.codex/auth.json` (or macOS Keychain `"Codex Auth"`) -> OpenClaw `syncExternalCliCredentials()` on boot

**Steps taken**:

a) Cleared old OAuth tokens from all 21 agent auth-profiles.json files:

```bash
find ~/.openclaw -name "auth-profiles.json" -not -path "*/backups/*" | while read f; do
  python3 -c "
import json
with open('$f') as fh:
    d = json.load(fh)
changed = False
for key in list(d.get('profiles', {}).keys()):
    if key.startswith('openai-codex:'):
        del d['profiles'][key]
        changed = True
if changed:
    with open('$f', 'w') as fh:
        json.dump(d, fh, indent=2)
"
done
```

b) Re-logged Codex CLI with personal account:

```bash
codex auth logout
codex auth login
# Browser OAuth flow -> sign in with new account
```

c) Verified new credentials in `~/.codex/auth.json`

### 4. WhatsApp Re-Link

a) Cleared stale WhatsApp session cache:

```bash
rm -rf ~/.openclaw/credentials/whatsapp/default
```

b) Re-linked via QR scan:

```bash
openclaw channels login --channel whatsapp
# Scan QR in WhatsApp -> Settings -> Linked Devices -> Link a Device
```

### 5. Gateway Restart

```bash
nohup openclaw gateway run --bind loopback --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 &
```

Verification:

```bash
openclaw channels status --probe
```

## Final State

| Component          | Status                             |
| ------------------ | ---------------------------------- |
| Gateway            | Running, port 18789                |
| Telegram archibald | works (@empathylabs_archibald_bot) |
| Telegram default   | works (@Bhagwan_01_Bot)            |
| Telegram sable     | works (@empathylabs_sable_bot)     |
| WhatsApp default   | linked, listening for messages     |
| Codex OAuth        | refreshed (personal Pro account)   |

## Process Priority Management (Research)

macOS does NOT have Linux cgroups. Available tools for resource reservation:

### QoS Classes (recommended)

macOS routes lower QoS threads to E-cores on Apple Silicon:

- `QOS_CLASS_USER_INTERACTIVE` — streams, video calls (P0)
- `QOS_CLASS_UTILITY` — coding tools, builds
- `QOS_CLASS_BACKGROUND` — iCloud, indexing

### renice (manual throttle)

```bash
# Throttle all dev tools before streaming:
pgrep -f "openclaw|codex|node|deno|npm|git" | xargs renice -n 20 -p

# Boost P0 app:
sudo renice -n -20 -p $(pgrep -f "Google Chrome")
```

### launchd plist keys (permanent throttle)

```xml
<key>Nice</key><integer>20</integer>
<key>ProcessType</key><string>Background</string>
<key>LowPriorityIO</key><true/>
```

## Lessons Learned

1. **Anthropic API vs Claude Pro are separate billing** — running out of API credits does NOT relate to the $200/mo Pro subscription
2. **OpenClaw syncs Codex auth from `~/.codex/auth.json`** — not a plugin provider, it's `syncExternalCliCredentials()` in `src/agents/cli-credentials.ts`
3. **Kill the gateway before re-auth** — retry loops against dead providers waste CPU and can exhaust rate limits faster
4. **WhatsApp needs cache clear + QR re-scan** — `rm -rf ~/.openclaw/credentials/whatsapp/default` then `openclaw channels login --channel whatsapp`
5. **mission-control-api has a launchd service** — `com.empathylabs.mission-control-api` auto-restarts it; must `launchctl bootout` to stop
6. **Safari WebKit eats ~140% CPU for video streams** — Chrome is significantly lighter for streaming on macOS
