# Candidate live acceptance: 2026-10-27–28

## Deployment and evidence boundaries

- Plugin reported by MCP and plugin inventory: **1.0.0-rc.1**.
- Candidate source/artifact prepared for this installation: commit `3f6cd5217a9881a714e6f384a6c295c297ec0547`; tarball SHA-256 `8e4f42bb367dfde22c6fc41f7134735fdd322883bcf0a7dd854c9345e9296eb4`.
- The installed version was confirmed by the operator's `npm ls` and by live MCP calls. Installed file hashes have not been compared with the tarball, so exact artifact identity is not independently proven.
- Signal K Server **2.31.0**, verified from its public discovery response on 2026-10-28. The MCP tool deliberately returns `serverVersion: null`; its adapter reference version is not server-version evidence.
- Node **22.23.2**, operator terminal evidence on 2026-10-27; OpenPlotter on Raspberry Pi. Exact OS release and architecture were not recorded.
- Client: Codex desktop on Windows using Streamable HTTP over the existing HTTPS endpoint. Exact desktop version was not recorded.
- No hostnames, credentials, vessel readings or raw log text are included in this report.

## Successful live checks

On 2026-10-27, all nine advertised tools returned successful responses: `get_server_info`, `list_plugins`, `read_path`, `list_paths`, `inspect_path_sources`, `diagnose_missing_path`, `get_security_status`, `list_connections`, and `get_connection_status`.

The plugin reported read-only mode, public API availability and a compatible internal provider adapter. A telemetry sample was fresh, its selected source was reported, a configured NMEA0183 connection was available, and arbitrary provider status text was withheld. An empty list of additional sources was not treated as an error or proof of source ownership.

On 2026-10-28, an out-of-policy path returned `PATH_NOT_ALLOWED`, and a deliberately nonexistent allowed path returned `state: missing` with bounded provider context. These are read-only requests and create no paths.

Independent requests against the same live HTTPS endpoint produced:

| Request | Expected | Observed |
| --- | --- | --- |
| Valid admin token and MCP key | MCP initialization succeeds | HTTP 200 |
| Missing admin token, valid MCP key | Rejected | HTTP 401 |
| Invalid admin token, valid MCP key | Rejected | HTTP 401 |
| Valid non-admin token, valid MCP key | Rejected | HTTP 401; token validity and non-admin role independently confirmed |
| Valid admin token, missing MCP key | Rejected | HTTP 401, `UNAUTHORIZED` |
| Valid admin token, incorrect MCP key | Rejected | HTTP 401, `UNAUTHORIZED` |
| Both valid credentials, unapproved Origin | Rejected | HTTP 403, `FORBIDDEN_ORIGIN_OR_HOST` |
| Both valid credentials, malformed JSON | Rejected | HTTP 400; response includes a stack trace (see below) |
| Both valid credentials, 66,000-character padding in a JSON object | Rejected | HTTP 413; 17-byte response |

Requests used normal TLS certificate verification and did not follow redirects. No failed-authentication response bodies were copied into this report beyond the plugin's fixed error enums.

At 09:46 UTC on 2026-10-28, a separate operator-provided temporary token was confirmed by `/skServer/loginStatus` as authenticated, non-admin and subject to enabled authentication. An admin initialization baseline returned HTTP 200 with the same MCP key; replacing only the bearer token with the confirmed non-admin token returned HTTP 401. The non-admin token was held only in memory, did not replace the client's saved credentials, and was not saved in the results.

## Open finding: host parser error disclosure

The malformed JSON request was rejected, but its 1,100-byte response contained `SyntaxError` and stack-frame patterns. Only classification booleans and response size were saved; no stack text or server filesystem paths were printed or saved. This is not a successful generic-error acceptance check.

The tagged [Signal K 2.31.0 server entry point](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/index.ts) installs its JSON body parser before security and plugin routes. Its configuration loader installs the `errorhandler` middleware in both [development](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/config/development.js) and [production](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/config/production.js). The candidate's route-local parser cannot sanitize an error raised and handled before its route is reached. This source ordering explains the observed host-level response. Merely setting `NODE_ENV=production` does not remove that middleware and is not a verified fix. A host or ingress remediation remains to be implemented and tested, or this upstream limitation must be explicitly reviewed before stable release acceptance.

## Live server log access

On 2026-10-28, the development-only WebSocket probe received one valid `LOG` record with an admin token and terminated immediately. It returned only `verified / LOG_ENTRY_OBSERVED` and a count; no raw log contents were printed or saved. An invalid token was rejected at the HTTP handshake (`denied / HTTP_AUTH_DENIED`).

The independently confirmed valid non-admin token was also denied the log subscription (`denied / SUBSCRIPTION_REJECTED`); no log chunks were observed or returned. This verifies admin access and non-admin denial for Signal K's recent server-output stream on the live 2.31.0 installation. It does not verify journald/file access or complete log retention. No MCP log tool was added.

## Setup finding

The plugin was enabled in the Admin UI but returned HTTP 503 while startup validation failed. The operator confirmed a 64-character MCP key in the service's main-process environment. After correcting the nonempty `allowedOrigins` setting, startup and MCP connection succeeded. The exact original value was not captured: do not infer that every nonempty origins list is invalid. Valid nonempty URL allowlists are supported; an empty-string entry fails validation.

## Service restart recovery

On 2026-10-28, the operator reported completing a deliberate Signal K service restart. At approximately 10:04 UTC, the existing Codex MCP connection successfully called `get_server_info`, `list_plugins`, `list_connections`, `read_path` and `get_connection_status` without re-entering credentials or reconfiguring the plugin. The plugin reported 1.0.0-rc.1, enabled/read-only state, the same allowed path prefixes, public API availability and a compatible provider adapter. A telemetry sample was less than one second old, and the configured NMEA0183 provider had no recorded last error. No vessel reading or provider message text is reproduced here.

This verifies post-restart recovery through the existing saved client configuration, with the restart action itself operator-reported. It does not measure downtime or establish disable/re-enable or key-rotation behavior.

## Disable/re-enable recovery

At 10:08 UTC on 2026-10-28, after the operator reported disabling the plugin, both `get_server_info` and `read_path` failed with HTTP 503 and the fixed `PLUGIN_DISABLED` error. A separate authenticated initialization request returned the same status/error while public Signal K discovery remained reachable with HTTP 200. This distinguishes the plugin's disabled state from a server outage or credential failure.

After the operator reported enabling the plugin again, at approximately 11:58 UTC the existing Codex connection successfully called `get_server_info`, `read_path`, `list_connections` and `list_plugins` without re-entering credentials. The plugin reported 1.0.0-rc.1, enabled/read-only state and a compatible adapter. A telemetry sample was less than one second old. This verifies the observed disable/re-enable cycle; it does not establish key-rotation behavior.

## Remaining acceptance work

- MCP-key rotation was not tested; the existing key was retained.
- Host allowlist rejection remains unconfirmed: changing Host with the PowerShell client produced a transport exception before any usable HTTP result. TLS checks were not disabled. Unsupported provider shapes were not exercised live. A 66 KB JSON body was rejected, but broader proxy limits were not tested. Local/CI coverage must be distinguished from live evidence.
- Resolve or explicitly review the observed host parser stack-trace response, and verify the resulting response without exposing its contents.
- Record exact client/platform versions and, if required for artifact traceability, compare installed runtime files with the candidate artifact.
- Review/merge the release changes, validate the final versioned release commit and package, reconfirm npm publication access/2FA, obtain stable-release approval, then verify the published installation.

The successful connection and negative authentication tests advance candidate acceptance; they do not constitute stable-release approval or a comprehensive security audit.
