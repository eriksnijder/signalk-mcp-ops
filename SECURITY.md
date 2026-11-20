# Security policy and model

The unreleased development build supports authenticated native read-only users with path/source permissions. Published 1.0.1 retains its admin-only route model. Historical live acceptance on Signal K 2.31.0 / Node 22.23.2 / OpenPlotter does not validate this new authorization feature; see [compatibility record](docs/COMPATIBILITY.md) and [native permission tests](docs/READ-ONLY-USERS.md). Read-only access still exposes sensitive operational data, potentially including position. Limit configured prefixes, native ACL grants and trusted clients. This is not a comprehensive security audit.

## Trust boundaries

1. Signal K owns TLS, JWT verification and native permissions. Only the MCP routes are classified `readonly`; the plugin independently verifies an explicit bearer identity and checks native self-context path/source read permission for every telemetry leaf and source identifier. Admin identities do not bypass native telemetry ACLs. Connection and plugin inventories/status remain admin-only.
2. Every request also requires `X-MCP-Ops-Key`, checked against `SIGNALK_MCP_OPS_KEY` in the Signal K process environment. Missing/invalid configuration, disabled/unknown native security or unavailable permission-aware routing disables admission. Cookie/query-only, guest and anonymous access are rejected.
3. Host headers must exactly match configured values. Present Origin headers must exactly match the origin allowlist; absent Origin is permitted for native clients. Origin/Host are not authentication. Forwarded headers do not determine trust.
4. Tools accept only validated inputs, read permitted self-context paths, project output fields and bound results. The isolated provider adapter reads only the internal inventory/status sources and exports allowlisted fields; full config/log export is not enabled. Tools cannot write data, invoke control functions, install packages or restart the server.

The shared key is an additional gate, not a per-user grant or OAuth bearer token. Native identity and telemetry ACLs apply independently, intersected with configured prefixes. With no ACLs, native Signal K permits reads; a read-only role alone does not restrict the user to particular measurements. Key rotation requires updating the process environment/restarting Signal K and reconfiguring clients. Do not place keys in query strings, plugin settings, source control, screenshots or issue reports. Do not reuse a Signal K token as the plugin key.

`src/auth.ts` isolates version-sensitive `securityStrategy` hooks. Known synchronous authentication and literal-boolean permission decisions are required; unknown contracts fail closed. The plugin does not read security configuration or signing secrets. Identities are verified per request and again on calls; async inventory reads recheck identity and admin role after awaiting. No operational information is accessed for a non-admin's inventory request. Missing and denied paths are indistinguishable when source-specific permission cannot be established; see [detailed boundaries](docs/READ-ONLY-USERS.md).

## Internal provider data

Configured connection output is a strict allowlist (id, enabled, type); options, subOptions, hosts, paths, usernames, passwords and tokens are not exported. Tests include synthetic secrets in options and status messages. Free-form message/lastError text is withheld except for an exact allowlist of generic complete messages; arbitrary prose is not considered safe merely because its field name is allowed. IDs/types remain operational metadata; operators must not embed secrets in identifiers. Accessor properties are rejected without invoking getters. Unexpected API shapes fail closed.

Source namespace matches are only candidates, never proof of provider ownership. A reported status is not a healthy/running assertion, and absent status is unknown. Provider context and internal-adapter compatibility details are withheld from non-admins. Existing output redaction remains defense in depth. The plugin adds no listeners, filesystem/log reads or write operations.

## Deployment responsibilities

Use TLS for remote traffic and a trusted private network/VPN where possible. Configure proxy and host body/rate limits. The plugin provides no per-IP rate limiter, CORS facility or OAuth discovery. It has a 64 KiB post-parse body check, bounded results, an eight-request concurrency cap and connection deadlines. Upstream parsing can allocate memory before plugin checks; synchronous host APIs cannot be interrupted by a timer.

**Known host limitation (Signal K 2.31.0):** malformed JSON can fail in the host parser before plugin routing and return a stack trace from Signal K's own error middleware. The plugin's generic parser responses apply only to errors its middleware handles. Both host development and production configurations install the upstream error handler; setting `NODE_ENV=production` alone is not a verified fix. This limitation was reviewed for 1.0 preparation and remains unfixed in the host. Operators needing generic responses at that boundary must verify a host or ingress mitigation. See [live evidence](docs/LIVE-ACCEPTANCE.md#open-finding-host-parser-error-disclosure).

All text returned by sensors/plugins is untrusted data and may contain prompt injection. Clients must never treat telemetry strings as instructions. Known sensitive key names and URL user-info are redacted, but arbitrary text or a secret placed in an ordinary numeric/value field cannot be detected reliably. Keep sensitive paths outside the allowlist. Inventories/source names also reveal operational metadata.

Plugin exceptions become generic codes. The plugin never logs requests, headers, keys, raw config or response payloads. Hosting proxies and Signal K may have independent logging; configure those appropriately. Status messages contain no credentials. `get_security_status` reports only plugin policy, not a security certification of the host.

## App Store audit indicators

Compare an indicator with the exact package version and scan date in the [public registry record](https://signalk.org/signalk-plugin-registry/plugins/signalk-mcp-ops.json). Signal K caches registry data and plugin details, so an installed newer version can temporarily display an older score or audit badge. Refresh the App Store metadata and reload the detail page before interpreting a stale badge.

On 2026-10-29, the registry's 1.0.0 scan reported zero high, moderate and critical findings; its 0.1.0 record still reported two high findings. Refreshing the reference server's App Store cache changed its displayed detail response from score 75 / audit warning to score 85 / audit OK. A fresh full audit of this repository also reported zero vulnerabilities. These are dated observations, not guarantees against future advisories. The host installation's audit and other plugins' Node engine requirements must be assessed separately.

## Reporting

Use [GitHub private vulnerability reporting](https://github.com/eriksnijder/signalk-mcp-ops/security/advisories/new) to contact the repository maintainer, Erik Snijder. Private reporting was enabled and verified on 2026-10-26. Include the affected package/server/Node versions, a minimal synthetic reproduction and the impact. Do not attach live credentials, vessel data or full configurations. If the private form is unavailable, open a public issue requesting a private reporting route without vulnerability details.

Security fixes target the latest stable release. Older releases are not maintained separately; users should upgrade to the fixed version once released. The prepared 1.0 package does not replace the published stable release until acceptance and publication. Reports are handled on a best-effort basis with no guaranteed response time. This is not a security certification.

The 1.0 preparation updates MCP SDK, Zod and transitive dependencies after the October 2026 audit findings. CI audits the production dependency tree and rejects moderate-or-higher known findings. A clean audit does not prove all behavior secure or establish whether every upstream advisory is reachable in this plugin.

The separate log-access verification script observes at most one log record and reports only fixed status/count fields. It is development-only, uses a Signal K admin token over TLS, refuses redirects and never prints log content. It does not add log access to MCP; see [SERVER-LOGS.md](docs/SERVER-LOGS.md).

Contributors must add regression tests for authorization bypass, credential exposure, traversal and resource-exhaustion fixes. Do not enable generic config/log serialization based solely on a secret-name denylist.
