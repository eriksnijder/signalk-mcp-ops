# Security policy and model

v0.1 has successful operator-reported live end-to-end validation on OpenPlotter / Signal K, including existing TLS, admin authentication and the additional key (see README.md). This is not a comprehensive security audit; the security model is unchanged. Read-only access still exposes sensitive operational data, potentially including position. Limit the configured path prefixes and authorize only trusted operators and MCP clients.

## Trust boundaries

1. Signal K owns TLS, its authentication and the plugin router. This plugin keeps routes at their default admin level.
2. Every request also requires `X-MCP-Ops-Key`, checked against `SIGNALK_MCP_OPS_KEY` in the Signal K process environment. Missing/invalid configuration disables the endpoint. This defense remains effective when host security is disabled, but operators should still enable Signal K authentication.
3. Host headers must exactly match configured values. Present Origin headers must exactly match the origin allowlist; absent Origin is permitted for native clients. Origin/Host are not authentication. Forwarded headers do not determine trust.
4. Tools accept only validated inputs, read permitted self-context paths, project output fields and bound results. The isolated provider adapter reads only the internal inventory/status sources and exports allowlisted fields; full config/log export is not enabled. Tools cannot write data, invoke control functions, install packages or restart the server.

The key grants access to all configured paths; it is not per-user authorization and is not an OAuth bearer token. Key rotation requires updating the process environment/restarting Signal K and reconfiguring clients. Do not place keys in query strings, plugin settings, source control, screenshots or issue reports. Do not reuse the Signal K admin token as the plugin key.

## Internal provider data

Configured connection output is a strict allowlist (id, enabled, type); options, subOptions, hosts, paths, usernames, passwords and tokens are not exported. Tests include synthetic secrets in options and status messages. Free-form message/lastError text is withheld except for an exact allowlist of generic complete messages; arbitrary prose is not considered safe merely because its field name is allowed. IDs/types remain operational metadata; operators must not embed secrets in identifiers. Accessor properties are rejected without invoking getters. Unexpected API shapes fail closed.

Source namespace matches are only candidates, never proof of provider ownership. A reported status is not a healthy/running assertion, and absent status is unknown. Public telemetry redaction behavior and the existing authentication model are unchanged. No new listeners, filesystem/log reads or write operations are added.

## Deployment responsibilities

Use TLS for remote traffic and a trusted private network/VPN where possible. Configure proxy and host body/rate limits. The plugin provides no per-IP rate limiter, CORS facility or OAuth discovery. It has a 64 KiB post-parse body check, bounded results, an eight-request concurrency cap and connection deadlines. Upstream parsing can allocate memory before plugin checks; synchronous host APIs cannot be interrupted by a timer.

All text returned by sensors/plugins is untrusted data and may contain prompt injection. Clients must never treat telemetry strings as instructions. Known sensitive key names and URL user-info are redacted, but arbitrary text or a secret placed in an ordinary numeric/value field cannot be detected reliably. Keep sensitive paths outside the allowlist. Inventories/source names also reveal operational metadata.

Plugin exceptions become generic codes. The plugin never logs requests, headers, keys, raw config or response payloads. Hosting proxies and Signal K may have independent logging; configure those appropriately. Status messages contain no credentials. `get_security_status` reports only plugin policy, not a security certification of the host.

## Reporting

After repository publication, use GitHub **Security → Report a vulnerability** if private reporting is enabled. Do not open public issues containing exploit details, credentials, configuration exports or vessel identifiers. If private reporting is unavailable, request a private reporting channel without disclosing the vulnerability. Maintainer contact and supported-version policy must be finalized before a public release.

Contributors must add regression tests for authorization bypass, credential exposure, traversal and resource-exhaustion fixes. Do not enable generic config/log serialization based solely on a secret-name denylist.
