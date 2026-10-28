# Server log access verification

## Finding

Signal K Server exposes recent server output through its admin WebSocket connection. This was verified in the source of **2.31.0 and 2.35.1** on 2026-10-26. On 2026-10-28, the development-only probe also verified admin log access on the operator's live 2.31.0 server and rejected an invalid token. It printed/saved no raw log contents; valid non-admin denial remains untested. See [LIVE-ACCEPTANCE.md](LIVE-ACCEPTANCE.md). The MCP plugin still has nine tools and does not expose logs; `get_recent_errors` remains unregistered.

An authenticated client connects to `wss://<server>/signalk/v1/stream?subscribe=none` and sends:

```json
{"context":"vessels.self","subscribe":[{"path":"log"}]}
```

When Signal K security is enabled, this subscription requires admin access. The response includes retained entries as `{"type":"LOG","data":{"ts":"...","row":"...","isError":true}}`, then new entries. `isError` is optional and means the output came from stderr, not a structured severity or proof of a fault. Signal K's dummy/disabled security strategy bypasses the admin check: use enabled security and TLS.

The server retains **100 stdout/stderr write chunks**, not necessarily 100 lines or errors. A chunk may contain multiple lines. History is in memory and is lost on process restart; 2.35.1 can also clear it. The timestamp is a formatted local `MMM DD HH:mm:ss` string without a year or time zone. Do not infer reliable absolute dates or stable pagination from it. An empty observation does not prove that log access is unavailable or that the server has no errors.

This buffer is distinct from systemd/journald history, rotated log files and recorded NMEA/Signal K data. This project does not read those files or execute journal/shell commands.

## Verify a live server without printing its logs

From a development checkout with `npm ci --ignore-scripts`, set `SIGNALK_LOG_PROBE_URL` to the full `wss://<server>/signalk/v1/stream` URL without a query string. Use an existing authorized Signal K admin token in `SIGNALK_ADMIN_TOKEN`. This is **not** `SIGNALK_MCP_OPS_KEY`; the direct Signal K WebSocket does not use that key.

PowerShell example; enter the token at the hidden prompt, not in command history:

```powershell
$env:SIGNALK_LOG_PROBE_URL = Read-Host 'Signal K WebSocket URL (wss://host:port/signalk/v1/stream)'
$env:SIGNALK_ADMIN_TOKEN = Read-Host 'Signal K admin token' -MaskInput
try { npm.cmd run verify:logs }
finally { Remove-Item Env:SIGNALK_ADMIN_TOKEN -ErrorAction SilentlyContinue }
```

`-MaskInput` requires PowerShell 7. The token is available to the child process via its environment; use a trusted local machine. Do not paste the token into an issue or chat.

The probe validates TLS normally, sends the token only in the Authorization header, refuses redirects, allows plaintext only for loopback tests, caps messages at 64 KiB, caps observation at 200 messages and five seconds, and terminates after the first valid log entry. It reports only fixed status codes and counts, never log text, timestamps, URLs, server exception messages or tokens. It does not alter debug settings, clear history or trigger a test log. The remote system may still log the connection independently.

- `verified` / `LOG_ENTRY_OBSERVED`: a valid log record was received; exit 0.
- `denied`: the HTTP handshake or subscription was rejected; exit 1. Use an admin credential and enabled Signal K security.
- `inconclusive`: no valid record was observed before timeout/close/limit; exit 1. A quiet or empty buffer is possible.
- `failed`: invalid configuration, TLS/network/protocol problem, or rejected upgrade; exit 1. The reason is intentionally generic to avoid leaking remote error text.

The probe is development-only and is not included in the installed plugin tarball. Local WebSocket fixtures test success, denial, timeout, configuration checks, redirect refusal and the absence of log text in results. They do not replace live server verification. To verify negative authorization, run separately with an operator-provided non-admin credential; never disable server security for this test.

## Implications for a future MCP log tool

`app.logging.getLog()` is an internal method returning the buffer. The plugin host copies the app's enumerable properties into the plugin facade in both inspected versions, making access feasible, but it is not part of the stable `ServerAPI` contract. A future adapter needs runtime shape checks, explicit opt-in, output limits and its own unsupported result.

Log text may contain credentials, positions, configuration and instructions planted by third parties. Existing telemetry redaction does not make arbitrary logs safe. Before adding a tool, decide whether it exports strictly projected metadata or reviewed/redacted text, document the disclosure risk, and test it against representative secret-bearing records. No log tool or log subscription is added to the running plugin by this change.

## Primary source evidence

- [2.31.0 logging buffer](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/logging.js) and [2.35.1 logging buffer](https://github.com/SignalK/signalk-server/blob/v2.35.1/src/logging.js): retention, timestamp, stdout/stderr capture, `getLog` and emitted events.
- [2.31.0 WebSocket interface](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/interfaces/ws.ts) and [2.35.1 WebSocket interface](https://github.com/SignalK/signalk-server/blob/v2.35.1/src/interfaces/ws.ts): `processSubscribe`, admin check and `startServerLog`.
- [2.35.1 plugin facade](https://github.com/SignalK/signalk-server/blob/v2.35.1/src/interfaces/plugins.ts): `appCopy` construction.
- [2.31.0 Admin UI](https://github.com/SignalK/signalk-server/blob/v2.31.0/packages/server-admin-ui/src/views/ServerConfig/ServerLog.tsx): log subscription used by the server UI.
