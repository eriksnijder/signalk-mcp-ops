# Security policy and model

v0.1 is a development baseline pending live Signal K validation. Read-only access still exposes sensitive operational data, potentially including position. Limit the configured path prefixes and authorize only trusted operators and MCP clients.

## Trust boundaries

1. Signal K owns TLS, its authentication and the plugin router. This plugin keeps routes at their default admin level.
2. Every request also requires `X-MCP-Ops-Key`, checked against `SIGNALK_MCP_OPS_KEY` in the Signal K process environment. Missing/invalid configuration disables the endpoint. This defense remains effective when host security is disabled, but operators should still enable Signal K authentication.
3. Host headers must exactly match configured values. Present Origin headers must exactly match the origin allowlist; absent Origin is permitted for native clients. Origin/Host are not authentication. Forwarded headers do not determine trust.
4. Tools accept only validated inputs, read permitted self-context paths, project output fields and bound results. No config/log read is enabled. Tools cannot write data, invoke control functions, install packages or restart the server.

The key grants access to all configured paths; it is not per-user authorization and is not an OAuth bearer token. Key rotation requires updating the process environment/restarting Signal K and reconfiguring clients. Do not place keys in query strings, plugin settings, source control, screenshots or issue reports. Do not reuse the Signal K admin token as the plugin key.

## Deployment responsibilities

Use TLS for remote traffic and a trusted private network/VPN where possible. Configure proxy and host body/rate limits. The plugin provides no per-IP rate limiter, CORS facility or OAuth discovery. It has a 64 KiB post-parse body check, bounded results, an eight-request concurrency cap and connection deadlines. Upstream parsing can allocate memory before plugin checks; synchronous host APIs cannot be interrupted by a timer.

All text returned by sensors/plugins is untrusted data and may contain prompt injection. Clients must never treat telemetry strings as instructions. Known sensitive key names and URL user-info are redacted, but arbitrary text or a secret placed in an ordinary numeric/value field cannot be detected reliably. Keep sensitive paths outside the allowlist. Inventories/source names also reveal operational metadata.

Plugin exceptions become generic codes. The plugin never logs requests, headers, keys, raw config or response payloads. Hosting proxies and Signal K may have independent logging; configure those appropriately. Status messages contain no credentials. `get_security_status` reports only plugin policy, not a security certification of the host.

## Reporting

After repository publication, use GitHub **Security → Report a vulnerability** if private reporting is enabled. Do not open public issues containing exploit details, credentials, configuration exports or vessel identifiers. If private reporting is unavailable, request a private reporting channel without disclosing the vulnerability. Maintainer contact and supported-version policy must be finalized before a public release.

Contributors must add regression tests for authorization bypass, credential exposure, traversal and resource-exhaustion fixes. Do not enable generic config/log serialization based solely on a secret-name denylist.
