# Architecture

```mermaid
flowchart TD
  Client[MCP client] --> HTTP[Signal K HTTP/TLS and admin route protection]
  HTTP --> Guard[Plugin enabled / Host / Origin / secret checks]
  Guard --> Transport[Stateless Streamable HTTP transport]
  Transport --> Tools[Explicit read-only tools]
  Tools --> Adapter[Signal K read adapter]
  Adapter --> Public[getSelfPath / getFeatures]
  Tools --> Output[Field projection / redaction / bounds]
  Output --> Client
```

## Modules

`src/index.ts` owns the Signal K lifecycle, schema, route registration and transport disposal. It exports a CommonJS factory. Invalid configuration or a missing environment key leaves the route disabled. Stop first disables admission, then closes active transports. Existing router handlers refer to current state, so requests after stop receive 503; no private Express router structures are modified. Reconfiguration follows the host's stop/start lifecycle.

`src/tools.ts` registers nine implemented tools and defines their input schemas, response envelopes and generic error boundary. Connection inventory/status use the isolated internal adapter. Full connection config, plugin config/status and error-log tools remain unregistered. A fresh MCP server is connected for each POST, following the SDK's stateless approach; state is not shared between clients. This is appropriate for snapshot diagnostics, without notification streams or resumable sessions.

`src/adapter.ts` reads the public Signal K data model. Its narrowed `ReadAPI` type exposes just `getSelfPath` and `getFeatures`. It projects plugin inventory fields (`id`, `name`, `version`, `enabled`) and traverses only allowed telemetry roots. It does not receive a caller-controlled URL, file path, executable or method name. Full config/log export adapters intentionally do not exist.

`src/safety.ts` holds validation, prefix checks, constant-length hashed secret comparison and bounded safe copying. Redaction is defense in depth. It is not a substitute for field allowlists or an authorization boundary.

## Decisions

- Run inside Signal K to reuse its lifecycle, network listener and official data access. No additional service, hostname, certificate or port is assumed.
- Keep the default admin-only plugin route and add a separate environment-held key. A custom header avoids consuming Signal K's Authorization header. Per-user/path permissions are not propagated through this key; access is operator-level within configured prefixes.
- Use named tools for discoverability and small, bounded responses. No code execution tool is exposed.
- Prefer supported APIs. Server-internal functions need isolated, versioned adapters and an explicit unsupported state. Published API types do not establish runtime compatibility by themselves.
- Return native units, timestamps and unknown values honestly. Do not infer system health from absence of data.

## Internal provider diagnostics reference

Provider diagnostics were successfully live-tested on OpenPlotter / Raspberry Pi with Signal K Server **2.31.0** and Node.js **22.23.2**, using a remote Windows MCP client over the existing authenticated HTTPS endpoint. See the completed validation record in README.md. Public API types remain 2.33.0 and MCP SDK remains 1.30.1; neither is upgraded here. Runtime shape detection, not an assumed package version, gates internal access. No broad server-version range is claimed.

The original adapter is based on tag [v2.31.0](https://github.com/SignalK/signalk-server/tree/v2.31.0), commit `5a3c945ca3f8a0427302ca37a4ae476ee2276adc`:

- [src/interfaces/providers.ts](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/interfaces/providers.ts): configured connection shape; a single providers/simple element uses options.type, otherwise the first pipe element type is used.
- [src/pipedproviders.ts](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/pipedproviders.ts): omitted enabled means enabled.
- [src/index.ts](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/index.ts): getProviderStatus returns an array; type is status/error, statusType distinguishes provider/plugin; historical error fields may be absent. Source labels from upstream may be preserved, so identifier matching is not proof of local connection ownership.

Only src/internal/signalK231Adapter.ts accesses app.config.settings.pipedProviders and app.getProviderStatus(). The public layer continues to use getSelfPath() and getFeatures(). Missing/malformed internals return UNSUPPORTED; limits return RESULT_TOO_LARGE. A valid empty configuration is distinct from an unavailable API. An unavailable diagnostic context never prevents the existing path-state diagnosis.

## Compatibility and release work

Compiled against `@signalk/server-api` 2.33.0 and MCP SDK 1.30.1. The official FeatureInfo API is asynchronous and returns a plugin array. Unexpected shapes yield `UNSUPPORTED`. Tests use fixtures matching those types, plus an actual SDK client over HTTP.

The operator reported successful live baseline validation on a real OpenPlotter / Signal K installation: plugin loading/enabling, the plugin MCP route, existing Signal K TLS, admin authentication and the extra key, plus remote Streamable HTTP from an external Windows client. Remote `tools/list`, `get_server_info` and `read_path("navigation.datetime")` succeeded. See README.md for scope and provenance. Signal K Server 2.31.0 is the confirmed reference runtime for the existing baseline; a broader release range is not established. Provider diagnostics validation also confirmed nine tools, compatible internal adapter detection, projected connection inventory, live status with text withholding, and evidence-only fresh/missing path diagnosis (README.md). Remaining release work includes broader version coverage, negative authentication cases, pre-parsed JSON, disable/re-enable behavior and additional proxy scenarios. Add internal adapters only with tests derived from that exact server source and a documented upgrade strategy.

In-process execution shares Signal K's event loop. Result and traversal bounds constrain work but cannot interrupt a slow host API call. Use a deployment rate limiter if exposing the endpoint beyond a trusted network. There is no background polling, persistence or added stream subscription.
