# Specification: v0.1

## Scope and transport

Plugin ID/package: `signalk-mcp-ops`. Node.js >=22. CommonJS plugin factory with `start`, `stop`, `schema`, `registerWithRouter` and `getOpenApi`.

Endpoint: `/plugins/signalk-mcp-ops/mcp`, registered through Signal K's plugin router. POST supports MCP initialization, notifications, tool discovery and calls through the official SDK. Every request gets a fresh server and stateless transport; there are no session identifiers or retained client state. JSON responses are enabled. GET and DELETE return 405 after policy checks; there is no SSE subscription/resumption. SDK protocol negotiation and validation apply. Tools use JSON schemas and advertise read-only/non-destructive/idempotent annotations. These are hints; the implementation enforces the scope by exposing no mutation API.

## API matrix

Nine tools are registered and returned by `tools/list`. Four planned/reserved entries below remain unregistered.

| Tool | Input | Source | v0.1 behavior / stability |
| --- | --- | --- | --- |
| `get_server_info` | none | plugin constants/settings | Implemented; plugin version/capabilities; host version unknown |
| `list_plugins` | none | `await app.getFeatures()` | Implemented; documented API, validated array; `id`, `name`, `version`, `enabled` |
| `read_path` | `path` | `app.getSelfPath(path)` | Implemented; value leaves only, allowed self paths |
| `list_paths` | optional `prefix`, `offset=0`, `limit=50` | bounded traversal via `getSelfPath` | Implemented; sorted page, `nextOffset`, `truncated` |
| `inspect_path_sources` | `path` | leaf `$source` and `values` keys | Implemented; no raw source connection configuration |
| `diagnose_missing_path` | `path` | path read plus timestamp | Implemented; missing/fresh/stale/unknown freshness |
| `get_security_status` | none | plugin policy | Implemented; host security unknown, TLS deployment-dependent |
| `list_connections` | none | isolated 2.31 internal adapter | Implemented; connections with id, enabled, type only |
| `get_connection` | `id` | planned projected provider config | Planned/reserved; not registered |
| `get_connection_status` | `id` | isolated 2.31 getProviderStatus adapter | Implemented; safe status projection or unknown; NOT_FOUND for absent connection |
| `get_plugin_status` | `id` | planned versioned status adapter | Planned/reserved; not registered |
| `get_plugin_config` | `id` | planned per-plugin allowlisted projection | Planned/reserved; not registered |
| `get_recent_errors` | none | planned bounded, sanitized log adapter | Planned/reserved; not registered; no log subscription |

Internal provider reads are restricted to the isolated 2.31 adapter and runtime shape detection. No filesystem, logs or full configuration are exposed. Further adapters require representative fixtures and secret-leak tests. An unsupported feature is not reported as an empty inventory or healthy state.

## Response contract

Successful results use `{ "ok": true, "data": ... }`; failures use `{ "ok": false, "error": { "code": "..." } }` with MCP `isError: true`. Both JSON text and `structuredContent` contain the envelope. SDK input/protocol validation errors follow the SDK contract instead. Error codes: `NOT_FOUND`, `NOT_A_VALUE_PATH`, `PATH_NOT_ALLOWED`, `UNSUPPORTED`, `RESULT_TOO_LARGE`, `INVALID_DATA`, `INTERNAL_ERROR`. Raw exception messages are never returned.

`list_plugins` returns a bounded `plugins` array and `truncated`. Each entry contains `id`, `name`, `version`, and `enabled`. Missing or non-string names are null; names are capped at 256 characters. Unexpected FeatureInfo shapes still return `UNSUPPORTED`.

`read_path` returns `path`, `value`, `timestamp`, `ageSeconds`, `stale`, `source`, and `units`. Missing timestamps/freshness/source/units are null. Null sensor values remain null. Age is computed using server time, clamped to zero for future timestamps; clock correctness is not verified. Staleness uses the operator's threshold (default 300 seconds), which may be unsuitable for infrequently updated paths. Native Signal K units are retained; no conversions or interpolations occur.

`diagnose_missing_path` maps only `NOT_FOUND` to a successful `missing` diagnosis. Denied paths and adapter errors remain errors. Missing data does not prove that a sensor or connection is broken.

## Provider diagnostics contract

list_connections returns { connections: [{ id, enabled, type }] }. options/subOptions and arbitrary config fields are never serialized. Omitted enabled follows the reference server default (true). get_connection_status returns id, type, statusType, message, timeStamp, lastError, lastErrorTimeStamp, and status. status is error for a reported error, reported for a normal status (not a health guarantee), or unknown for a configured connection with no matching provider row. Plugin or unclassified rows never establish connection status. Missing optional timestamps/history are null. Missing/malformed APIs return UNSUPPORTED; an absent connection with compatible APIs returns NOT_FOUND.

Free-form message and lastError values can echo credentials. Only complete generic messages (Connected, Disconnected, Started, Stopped, Connecting, Connection closed) pass through; all other strings become [withheld: untrusted provider text]. This deliberately trades message detail for preventing arbitrary config/credential export. Presence of historical errors and their timestamps is retained. Identifier fields are operator metadata, not a place to store secrets.

diagnose_missing_path retains its four states and adds providerContext with availability, projected connections/statuses, and a separately labelled assessment counting enabled providers reporting errors. Present paths also include selected/available sources and namespace-based correlation candidates, always marked proven:false because upstream labels may be preserved. No candidate is asserted to own a path. Missing paths have no inferred source ownership. Unavailable/oversized context returns available:false with an error code while preserving path state. get_server_info reports publicApiAvailable (method presence) and internalAdapter {referenceVersion, compatible, code?}; compatibility is shape compatibility, not certification or the detected server version.

## Bounds

- Internal arrays: <=100 configured connections, <=100 pipe elements per connection and <=1,000 status rows; oversized input fails rather than silently truncating. IDs/types are <=256 characters and are never truncated for matching. Accessor fields, invalid shapes and duplicate IDs fail closed. Status timestamps must be ISO UTC milliseconds. Output retains the existing 2,000-node/32 KiB bounds.
- Paths: 1-256 characters, dotted alphanumeric/underscore/hyphen segments; prototype-related segments rejected.
- Only configured prefixes in `vessels.self`; no arbitrary contexts, full tree or config reads.
- Discovery: <=10,000 visited nodes and depth <=20; pages <=100 paths; offset <=10,000. Pagination is a changing view, not a snapshot. `truncated` signals traversal limits, while `nextOffset` signals available further pages.
- Inventories/source identifiers: <=100 entries. Plugin inventory and sources report truncation.
- Data projection: <=2,000 nodes, depth <=12, strings <=4,096 characters, encoded data <=32 KiB. Oversized results fail; smaller pages or more specific paths can help. Envelopes add a small amount of overhead.
- Request body <=64 KiB; <=8 active requests; 15-second connection deadline. There is no requests-per-minute limiter. The deadline cannot preempt synchronous host code; bounded traversal limits plugin work.

Signal K may parse JSON before the plugin. Its own parser/proxy must therefore enforce an ingress body limit; the plugin additionally rejects oversized pre-parsed objects but cannot undo memory already allocated by the host.

## Acceptance and exclusions

Automated checks cover MCP negotiation and tool calls, authorization, host/origin rejection, path restrictions, result bounds, redaction, discovery, lifecycle and official FeatureInfo shape. The operator-reported live validation on OpenPlotter / Signal K confirmed loading/enabling, the plugin route, reuse of existing TLS, Signal K admin authentication, the extra key, and remote Streamable HTTP from an external Windows client (`tools/list`, `get_server_info`, `read_path("navigation.datetime")`); see README.md. Actual restart/reconfiguration behavior, additional proxy scenarios, negative authentication cases and a versioned compatibility matrix remain deployment acceptance work.

No OAuth server, subscriptions, arbitrary JavaScript, shell commands, file reads, REST proxy, write operations, restart tools, fleet contexts, navigation advice or autonomous vessel control is included.
