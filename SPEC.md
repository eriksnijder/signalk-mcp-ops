# Specification: version 1.1.0

## Scope and transport

Plugin ID/package: `signalk-mcp-ops`. Node.js >=22. CommonJS plugin factory with `start`, `stop`, `schema`, `registerWithRouter` and `getOpenApi`.

Endpoint: `/plugins/signalk-mcp-ops/mcp`, registered through Signal K's plugin router. POST supports MCP initialization, notifications, tool discovery and calls through the official SDK. Every request gets a fresh server and stateless transport; there are no session identifiers or retained client state. JSON responses are enabled. GET and DELETE return 405 after policy checks; there is no SSE subscription/resumption. SDK protocol negotiation and validation apply. Plugin-owned malformed JSON returns a generic `INVALID_JSON` error; parser size/encoding failures return generic 413/415 errors. Earlier host/proxy parsing remains outside the plugin's control. Tools use JSON schemas and advertise read-only/non-destructive/idempotent annotations. These are hints; the implementation enforces the scope by exposing no mutation API.

## API matrix

Fourteen tools are registered and returned by `tools/list`, plus one static resource (`signalk-mcp-ops://guide`) and server instructions. Four planned/reserved entries below remain unregistered.

| Tool | Input | Source | Candidate behavior / stability |
| --- | --- | --- | --- |
| `get_server_info` | none | plugin constants/settings | Implemented; plugin version/capabilities; host version unknown |
| `list_plugins` | none | `await app.getFeatures()` | Implemented; documented API, validated array; `id`, `name`, `version`, `enabled` |
| `read_path` | `path` | `app.getSelfPath(path)` | Implemented; value leaves only, allowed self paths |
| `list_paths` | optional `prefix`, `offset=0`, `limit=50` | bounded traversal via `getSelfPath` | Implemented; sorted page, `nextOffset`, `truncated` |
| `inspect_path_sources` | `path` | leaf `$source` and `values` keys | Implemented; no raw source connection configuration |
| `diagnose_missing_path` | `path` | path read plus timestamp | Implemented; missing/fresh/stale/unknown freshness |
| `get_vessel_overview` | none | well-known self paths, discovered battery/tank/engine instances, notifications | Implemented; omits unreadable/absent items; native value plus `display` |
| `search_paths` | `query`, optional `prefix`, `limit=20` (<=50) | bounded traversal plus leaf `meta` | Implemented; all words must match path or displayName/shortName/description |
| `read_paths` | `paths` (1-25, de-duplicated), `convertUnits=false` | `read_path` per entry | Implemented; per-entry `ok`/`error.code` |
| `list_alarms` | `includeNormal=false`, `limit=50` (<=100) | `notifications` leaves | Implemented; sorted emergency > alarm > warn > alert; requires `notifications` prefix |
| `get_usage_guide` | none | static text | Implemented; also served as resource `signalk-mcp-ops://guide` |
| `get_security_status` | none | plugin policy | Implemented; native security verified available, TLS deployment-dependent |
| `list_connections` | none | isolated 2.31 internal adapter | Implemented; connections with id, enabled, type only |
| `get_connection` | `id` | planned projected provider config | Planned/reserved; not registered |
| `get_connection_status` | `id` | isolated 2.31 getProviderStatus adapter | Implemented; safe status projection or unknown; NOT_FOUND for absent connection |
| `get_plugin_status` | `problemsOnly=false` | FeatureInfo plus `getProviderStatus` plugin rows (internal, shape-checked) | Implemented; admin-only; cleaned/capped status text |
| `get_server_logs` | `problemsOnly=true`, optional `contains` (1-100), `limit=50` (<=100) | internal `app.logging.getLog()` buffer (shape-checked) | Implemented; admin-only and operator opt-in (`allowServerLogs`); redacted |
| `get_plugin_config` | `id` | planned per-plugin allowlisted projection | Planned/reserved; not registered |
| `get_recent_errors` | none | superseded by `get_server_logs` | Not registered |

Internal provider reads are restricted to the isolated 2.31 adapter and runtime shape detection. No filesystem or full configuration is exposed; the in-memory server log is exposed only through `get_server_logs` as described below. Further adapters require representative fixtures and secret-leak tests. An unsupported feature is not reported as an empty inventory or healthy state.

## Response contract

Successful results use `{ "ok": true, "data": ... }`; failures use `{ "ok": false, "error": { "code": "..." } }` with MCP `isError: true`. Both JSON text and `structuredContent` contain the envelope. SDK input/protocol validation errors follow the SDK contract instead. Error codes: `NOT_FOUND`, `NOT_A_VALUE_PATH`, `PATH_NOT_ALLOWED`, `UNSUPPORTED`, `RESULT_TOO_LARGE`, `INVALID_DATA`, `INTERNAL_ERROR`. Raw exception messages are never returned.

## Native permissions (since 1.1.0)

The MCP route requires an explicit native Signal K bearer token and the additional MCP key. Authenticated readonly/readwrite/admin identities may use telemetry under the intersection of configured prefixes and exact native self-context path/source read permission. Native admins do not bypass these ACLs. `list_connections`, `get_connection_status` and `list_plugins` additionally require admin role; non-admin `get_server_info` omits internal-adapter detail and diagnosis omits provider context. All nine tools remain discoverable with explicit admin-only descriptions.

Additional codes: `ADMIN_REQUIRED`, `PATH_UNAVAILABLE`, `BEARER_TOKEN_REQUIRED`, `INVALID_TOKEN`, `PERMISSION_DENIED`, `SIGNALK_SECURITY_UNAVAILABLE`, `PLUGIN_DISABLED` and `LOGS_DISABLED`. Transport authentication errors use 401/403/503; tool failures keep the response envelope. Missing/dummy security and unavailable permission-aware routing fail closed. Only the Authorization header is used for native authentication, never cookies, query tokens or an inherited HTTP principal. See [complete permission behavior](docs/READ-ONLY-USERS.md).

`list_paths` paginates only native-authorized selected-source leaves. `inspect_path_sources` requires an authorized selected value and filters each alternate source ID. Missing/unknown source provenance is readable only when Signal K confirms no ACLs and grants the read. With ACLs, absent and denied readings both return `PATH_UNAVAILABLE` and diagnosis reports `unavailable` without values, sources or provider context. With no ACLs, absent paths retain `NOT_FOUND` / `missing`. The native ACL rule order remains authoritative.

`list_plugins` returns a bounded `plugins` array and `truncated`. Each entry contains `id`, `name`, `version`, and `enabled`. Missing or non-string names are null; names are capped at 256 characters. Unexpected FeatureInfo shapes still return `UNSUPPORTED`.

`read_path` returns `path`, `value`, `timestamp`, `ageSeconds`, `stale`, `source`, and `units`. Missing timestamps/freshness/source/units are null. Null sensor values remain null. Age is computed using server time, clamped to zero for future timestamps; clock correctness is not verified. Staleness uses the operator's threshold (default 300 seconds), which may be unsuitable for infrequently updated paths. Native Signal K units are retained; no conversions or interpolations occur. `read_paths` (with `convertUnits`) and `get_vessel_overview` add a separate `display` `{ value, units }` for common SI units (m/s→kn, rad→°, K→°C, ratio→%, Pa→hPa/bar, m3→L, Hz→rpm on propulsion, C→Ah, J→Wh, m→nm for log/distance paths); it is presentation only and null when no conversion applies.

`notifications` is part of the default prefixes so alarms are readable; operators with explicit prefixes must add it. Notification `message` strings are capped at 512 characters and `method` at 4 entries. Overview instance discovery is capped at 10 batteries, 8 tank types x 8 tanks and 6 engines; child names are used only to attempt authorized reads and are not returned unless a read succeeds.

`diagnose_missing_path` maps `NOT_FOUND` to `missing` and `PATH_UNAVAILABLE` to `unavailable`. Other adapter errors remain errors. Unavailable does not reveal whether the path exists. Missing data does not prove that a sensor or connection is broken.

## Provider diagnostics contract

list_connections returns { connections: [{ id, enabled, type }] }. options/subOptions and arbitrary config fields are never serialized. Omitted enabled follows the reference server default (true). get_connection_status returns id, type, statusType, message, timeStamp, lastError, lastErrorTimeStamp, and status. status is error for a reported error, reported for a normal status (not a health guarantee), or unknown for a configured connection with no matching provider row. Plugin or unclassified rows never establish connection status. Missing optional timestamps/history are null. Missing/malformed APIs return UNSUPPORTED; an absent connection with compatible APIs returns NOT_FOUND.

Free-form message and lastError values can echo credentials. Only complete generic messages (Connected, Disconnected, Started, Stopped, Connecting, Connection closed) pass through; all other strings become [withheld: untrusted provider text]. This deliberately trades message detail for preventing arbitrary config/credential export. Presence of historical errors and their timestamps is retained. Identifier fields are operator metadata, not a place to store secrets.

Admin diagnoses of authorized paths include providerContext with availability, projected connections/statuses, and a separately labelled assessment counting enabled providers reporting errors. Present paths also include authorized selected/available sources and namespace-based correlation candidates, always marked proven:false because upstream labels may be preserved. No candidate is asserted to own a path. Missing paths have no inferred source ownership. Unavailable/oversized context returns available:false with an error code while preserving path state. Non-admin diagnoses omit operational context with ADMIN_REQUIRED; permission-unavailable diagnoses include no provider context. Admin get_server_info reports publicApiAvailable (method presence) and internalAdapter {referenceVersion, compatible, code?}; non-admin internalAdapter is withheld with ADMIN_REQUIRED. Compatibility is shape compatibility, not certification or the detected server version.

## Bounds

- Internal arrays: <=100 configured connections, <=100 pipe elements per connection and <=1,000 status rows; oversized input fails rather than silently truncating. IDs/types are <=256 characters and are never truncated for matching. Accessor fields, invalid shapes and duplicate IDs fail closed. Status timestamps must be ISO UTC milliseconds. Output retains the existing 2,000-node/32 KiB bounds.
- Paths: 1-256 characters, dotted alphanumeric/underscore/hyphen segments; prototype-related segments rejected.
- Only configured prefixes in `vessels.self`; no arbitrary contexts, full tree or config reads.
- Discovery: <=10,000 visited nodes and depth <=20; pages <=100 paths; offset <=10,000. Pagination is a changing view, not a snapshot. `truncated` signals traversal limits, while `nextOffset` signals available further pages.
- Inventories/source identifiers: <=100 returned entries. Source inspection scans <=1,000 source identifiers before native filtering; larger input fails with RESULT_TOO_LARGE. Plugin inventory and sources report truncation.
- Data projection: <=2,000 nodes, depth <=12, strings <=4,096 characters, encoded data <=32 KiB. Oversized results fail; smaller pages or more specific paths can help. Envelopes add a small amount of overhead.
- Request body <=64 KiB; <=8 active requests; 15-second connection deadline. There is no requests-per-minute limiter. The deadline cannot preempt synchronous host code; bounded traversal limits plugin work.

Signal K may parse JSON before the plugin. Its own parser/proxy must therefore enforce an ingress body limit; the plugin additionally rejects oversized pre-parsed objects but cannot undo memory already allocated by the host.

## Server diagnostics contract

`get_plugin_status` (admin) joins the bounded plugin inventory with `getProviderStatus()` rows of `statusType: 'plugin'`, plus 2.31 fallback rows without `statusType` only for known plugin ids. Connection (`provider`) rows are excluded and keep the stricter withholding policy above. Each plugin reports `state` (`error`, `ok` = a normal status was reported, or `no_status`), `message`, `since`, `previousError` and `previousErrorAt`. Text is cleaned by the redaction rules below and capped at 300 characters. Unexpected shapes return `UNSUPPORTED`.

`get_server_logs` (admin) returns `LOGS_DISABLED` unless the operator sets `allowServerLogs: true` (default false). It snapshots the host buffer without mutating it, skips non-string chunks, redacts each whole chunk, then splits it into lines. Filtering (`problemsOnly`: stderr or a problem keyword/errno code; `contains`: case-insensitive) runs on redacted text, so a search cannot confirm a hidden secret. It returns the newest matching lines in chronological order, up to `limit`, 500 characters per line and about 20,000 characters of text, with `matched`, `scannedLines`, `skippedBinaryChunks`, `olderMatchesOmitted` and fixed notes. The buffer holds 100 write chunks, is lost on restart and uses local `MMM DD HH:mm:ss` timestamps.

Redaction (best effort, `src/redact.ts`): ANSI/control characters; PEM private keys; `Bearer`/`Basic`/`Digest`/`JWT` credentials; JWTs; URL user-info; values of sensitive keys (password, secret, token, api key, authorization, credential, private key, session, cookie, signature) in `key=value`, `key: value`, JSON and query strings; hex runs of 32+ characters; mixed-case base64-like runs of 40+ characters; and the plugin's own MCP key. Log text may still contain positions, host names or paths and is labelled untrusted. Source evidence for both internals: [SERVER-LOGS.md](docs/SERVER-LOGS.md).

## Acceptance and exclusions

Automated checks cover MCP negotiation and tool calls, authorization, host/origin rejection, path restrictions, result bounds, redaction, discovery, lifecycle and official FeatureInfo shape. The operator-reported live validation on OpenPlotter / Signal K confirmed loading/enabling, the plugin route, reuse of existing TLS, Signal K admin authentication, the extra key, and remote Streamable HTTP from an external Windows client (`tools/list`, `get_server_info`, `read_path("navigation.datetime")`); see [compatibility record](docs/COMPATIBILITY.md). Actual restart/reconfiguration behavior, additional proxy scenarios, negative authentication cases and a versioned compatibility matrix remain deployment acceptance work.

No OAuth server, subscriptions, arbitrary JavaScript, shell commands, file reads, REST proxy, write operations, restart tools, fleet contexts, navigation advice or autonomous vessel control is included.
