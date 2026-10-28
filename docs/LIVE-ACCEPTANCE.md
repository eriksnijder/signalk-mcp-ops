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
| Valid admin token, missing MCP key | Rejected | HTTP 401, `UNAUTHORIZED` |
| Valid admin token, incorrect MCP key | Rejected | HTTP 401, `UNAUTHORIZED` |
| Both valid credentials, unapproved Origin | Rejected | HTTP 403, `FORBIDDEN_ORIGIN_OR_HOST` |

Requests used normal TLS certificate verification and did not follow redirects. No failed-authentication response bodies were copied into this report beyond the plugin's fixed error enums. These checks do not replace a valid non-admin credential test.

## Live server log access

On 2026-10-28, the development-only WebSocket probe received one valid `LOG` record with an admin token and terminated immediately. It returned only `verified / LOG_ENTRY_OBSERVED` and a count; no raw log contents were printed or saved. An invalid token was rejected at the HTTP handshake (`denied / HTTP_AUTH_DENIED`).

This verifies admin access to Signal K's recent server-output stream on the live 2.31.0 installation. It does not verify journald/file access, complete log retention, or valid non-admin denial. No MCP log tool was added.

## Setup finding

The plugin was enabled in the Admin UI but returned HTTP 503 while startup validation failed. The operator confirmed a 64-character MCP key in the service's main-process environment. After correcting the nonempty `allowedOrigins` setting, startup and MCP connection succeeded. The exact original value was not captured: do not infer that every nonempty origins list is invalid. Valid nonempty URL allowlists are supported; an empty-string entry fails validation.

## Remaining acceptance work

- A valid non-admin Signal K token must be rejected by the MCP admin gate; the operator currently has only an admin account. The analogous log-subscription check also remains pending.
- Record deliberate disable/re-enable and service restart recovery. Token replacement and recovery from invalid settings were observed; a complete lifecycle test was not.
- MCP-key rotation was not tested; the existing key was retained.
- Host allowlist rejection, ingress/body limits and unsupported provider shapes were not separately exercised live. Local/CI coverage must be distinguished from live evidence.
- Record exact client/platform versions and, if required for artifact traceability, compare installed runtime files with the candidate artifact.
- Review/merge the release changes, validate the final versioned release commit and package, reconfirm npm publication access/2FA, obtain stable-release approval, then verify the published installation.

The successful connection and negative authentication tests advance candidate acceptance; they do not constitute stable-release approval or a comprehensive security audit.
