# Signal K MCP Operations

A generic TypeScript Signal K plugin for read-only operations and diagnostics through the Model Context Protocol (MCP).

**Status: v0.1 baseline with successful live end-to-end validation on OpenPlotter / Signal K.** Automated protocol tests also use the official MCP client and a simulated Signal K API. See the validation scope below. This repository contains no vessel-specific addresses, identities or credentials.

The plugin mounts a stateless Streamable HTTP endpoint at:

```text
https://<server>/plugins/signalk-mcp-ops/mcp
```

It uses Signal K's existing HTTP server and TLS deployment. It opens no additional listener. There are no write tools, shell execution, generated code execution, configuration updates, restarts or control commands.

## Available in v0.1

- Read one allowed `vessels.self` value with native units, timestamp, source and freshness.
- Discover value paths with bounded pagination and inspect source identifiers.
- Diagnose missing or stale data without claiming a hardware root cause.
- List plugins (`id`, `name`, `version`, `enabled`) through the official asynchronous `getFeatures()` API.
- Report MCP capabilities and the plugin's security policy.

The MCP registry exposes nine tools, including `list_connections` and `get_connection_status` through an isolated Signal K 2.31.0 internal adapter. Connection configuration, plugin configuration/status and recent server errors remain planned and unregistered. See the full [API matrix](SPEC.md).

## Live end-to-end validation

The current v0.1 baseline was successfully validated on a real OpenPlotter / Signal K installation, as reported by the operator:

- Signal K loaded and enabled the plugin successfully.
- The MCP endpoint was available at `/plugins/signalk-mcp-ops/mcp` and reused the existing Signal K TLS setup.
- Signal K admin authentication and the additional `X-MCP-Ops-Key` both worked.
- An external Windows client connected remotely using Streamable HTTP MCP.
- Remote `tools/list`, `get_server_info` and `read_path("navigation.datetime")` calls succeeded.

This records the operator's completed baseline validation, not a new live run performed as part of this cleanup. Signal K Server 2.31.0 is the confirmed baseline runtime; exact OpenPlotter and client versions are not recorded here, so this does not establish a supported version range or certify all deployment scenarios. No vessel-specific hostnames, IP addresses, usernames, tokens or secrets are included.

## Completed provider diagnostics live validation

The operator confirmed successful end-to-end testing on **Signal K Server 2.31.0**, **Node.js 22.23.2**, **OpenPlotter / Raspberry Pi**, using a remote Windows MCP client over the existing authenticated HTTPS endpoint.

- `tools/list` returned 9 tools.
- `get_server_info` returned `publicApiAvailable: true`, `internalAdapter.referenceVersion: "2.31.0"` and `internalAdapter.compatible: true`.
- `list_connections` returned the live configured Signal K Data Connection using only `id`, `enabled` and `type`.
- `get_connection_status` returned live provider status; free-form provider status text was withheld as designed.
- No connection configuration, credentials or secrets appeared in MCP output.
- `diagnose_missing_path` on an existing fresh path returned the live reading, source information and explicitly unproven correlation information.
- On a missing wind path, `diagnose_missing_path` returned `state: missing`, provider context and zero enabled provider errors, without claiming provider ownership or a hardware root cause.

These are operator-reported verified results, recorded by a documentation-only update. They establish the tested reference combination, not a broad supported-version range or results for other scenarios. No vessel-specific identifiers, readings or secrets are reproduced.

## Internal provider diagnostics reference

Provider diagnostics were successfully live-tested on OpenPlotter / Raspberry Pi with Signal K Server **2.31.0** and Node.js **22.23.2**, using a remote Windows MCP client over the existing authenticated HTTPS endpoint. See the completed validation record in README.md. Public API types remain 2.33.0 and MCP SDK remains 1.30.1; neither is upgraded here. Runtime shape detection, not an assumed package version, gates internal access. No broad server-version range is claimed.

The original adapter is based on tag [v2.31.0](https://github.com/SignalK/signalk-server/tree/v2.31.0), commit `5a3c945ca3f8a0427302ca37a4ae476ee2276adc`:

- [src/interfaces/providers.ts](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/interfaces/providers.ts): configured connection shape; a single providers/simple element uses options.type, otherwise the first pipe element type is used.
- [src/pipedproviders.ts](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/pipedproviders.ts): omitted enabled means enabled.
- [src/index.ts](https://github.com/SignalK/signalk-server/blob/v2.31.0/src/index.ts): getProviderStatus returns an array; type is status/error, statusType distinguishes provider/plugin; historical error fields may be absent. Source labels from upstream may be preserved, so identifier matching is not proof of local connection ownership.

Only src/internal/signalK231Adapter.ts accesses app.config.settings.pipedProviders and app.getProviderStatus(). The public layer continues to use getSelfPath() and getFeatures(). Missing/malformed internals return UNSUPPORTED; limits return RESULT_TOO_LARGE. A valid empty configuration is distinct from an unavailable API. An unavailable diagnostic context never prevents the existing path-state diagnosis.

## Development

Node.js 22 or later is required. The Signal K API types are pinned to `@signalk/server-api` 2.33.0; this is a types baseline, not a claim of testing a specific Signal K server release.

```sh
npm ci --ignore-scripts
npm test
npm pack --dry-run
```

`npm test` compiles TypeScript and runs unit tests plus an actual HTTP MCP client/server exchange. CI repeats these checks on Node 22/24 and Linux/Windows. `dist/index.js` exports the CommonJS factory expected by Signal K.

## Install on a development Signal K server

Build a tarball with `npm pack`, then install that tarball in the server's configuration directory using `npm install /path/to/signalk-mcp-ops-0.1.0.tgz`. Restart Signal K to discover the plugin. Configure and enable it in the Admin UI.

Supply `SIGNALK_MCP_OPS_KEY` to the **Signal K process environment**. Generate a unique random secret of at least 32 characters, for example with a password manager. It is never stored in plugin options. Do not paste it into an issue or commit it. Restart the Signal K process after changing its environment.

Example plugin options (adapt the host and port to your deployment):

```json
{
  "allowedHosts": ["localhost:3000"],
  "allowedOrigins": [],
  "pathPrefixes": ["navigation", "environment", "electrical", "propulsion", "tanks"],
  "staleAfterSeconds": 300
}
```

`allowedHosts` matches the incoming Host header exactly, including any port. `allowedOrigins` defaults to rejecting requests carrying any Origin header; non-browser clients normally omit it. If browser access is needed, list exact trusted origins. This plugin does not provide cross-origin CORS support. A reverse proxy must preserve a configured Host; forwarded host headers are not trusted.

Configure a Streamable HTTP MCP client with the endpoint URL and custom header `X-MCP-Ops-Key`. Where Signal K security is enabled, the ordinary Signal K admin credential is **also** required (normally in `Authorization: Bearer <Signal K token>`). Plugin routes retain Signal K's admin protection. The extra key does not replace it. Client-specific configuration syntax varies; the client must support both headers.

Use HTTPS for remote access. This version does not implement MCP OAuth discovery or an OAuth authorization server; clients that require that flow are not supported. Keep deployment private until the [release checklist](docs/PUBLISHING.md) and security review are complete.

## Documentation

- [Specification and API matrix](SPEC.md)
- [Architecture and compatibility boundaries](ARCHITECTURE.md)
- [Security model and reporting](SECURITY.md)
- [GitHub publication and release checklist](docs/PUBLISHING.md)
- [Contributing](CONTRIBUTING.md)

## Related work and design references

[sailingnaturali/signalk-mcp](https://github.com/sailingnaturali/signalk-mcp) demonstrates discrete tools and path discovery. [VesselSense/signalk-mcp-server](https://github.com/VesselSense/signalk-mcp-server) demonstrates compact results and flexible Signal K querying. This project adopts the ideas of discoverable tools and bounded responses, with an in-process operations focus. Its implementation is original; no code from either repository was copied. Arbitrary code execution and vessel-specific voice/navigation behavior are outside this project's scope.

Primary interface references: [Signal K plugin documentation](https://demo.signalk.org/documentation/Developing/Plugins.html), [Signal K server API](https://github.com/SignalK/signalk-server/tree/master/packages/server-api), and the [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). See `package-lock.json` for the exact dependency resolution.

MIT licensed. Package-name availability and GitHub repository metadata must be checked before publication.
