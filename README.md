# Signal K MCP Operations

**MCP Operations & Diagnostics** adds a read-only Model Context Protocol endpoint to Signal K so compatible AI clients can inspect telemetry, discover paths and diagnose missing data or provider status.

- Reuses Signal K's existing HTTP/TLS server at `/plugins/signalk-mcp-ops/mcp`; opens no extra listening port.
- Requires Signal K admin authentication and a separate `X-MCP-Ops-Key` in the documented secure deployment.
- Includes **nine read-only tools** for telemetry, path/source discovery, server/security information and provider diagnostics.
- Provider diagnostics are live runtime-validated on **Signal K Server 2.31.0**. Version-sensitive internals are feature-detected at runtime and fail safely with `UNSUPPORTED` when incompatible.
- No write operations, configuration changes, restarts, logs, arbitrary code execution or vessel control.

**Release status:** preparing the first public v0.1.0 npm / Signal K App Store release. This is not a publication announcement.

## Tools

`get_server_info`, `list_plugins`, `read_path`, `list_paths`, `inspect_path_sources`, `diagnose_missing_path`, `get_security_status`, `list_connections`, `get_connection_status`.

Telemetry retains native units and timestamps. Provider inventory exports only id/enabled/type, and arbitrary status text is withheld. Full connection/plugin configuration and server logs are not exposed. See the [API matrix](SPEC.md).

## Installation

### Current/manual development install

This package is being prepared for its first public release; these instructions do not imply that it is already published. From a clean repository checkout with Node.js >=22:

```sh
npm ci
npm test
npm pack
```

Install the generated `signalk-mcp-ops-0.1.0.tgz` in the Signal K configuration directory, using the account that runs Signal K:

```sh
cd <Signal K configuration directory>
npm install --ignore-scripts /path/to/signalk-mcp-ops-0.1.0.tgz
```

The tarball includes compiled `dist/` code. Installation does not require TypeScript or install-time scripts. Restart Signal K to discover the plugin, deploy the MCP key as described below, then configure and enable the plugin in the Admin UI.

### Future App Store install

After npm publication and App Store indexing, install **MCP Operations & Diagnostics** (`signalk-mcp-ops`) through the Signal K App Store. It is disabled by default. Deploy the key, configure the allowed host/path settings, and enable it. Until publication, use the tarball procedure above.

## Deploy the MCP key

`SIGNALK_MCP_OPS_KEY` must be available in the **Signal K process environment**. It is separate from the Signal K authentication token. Generate a fresh random key locally:

```sh
openssl rand -hex 32
```

The output is the secret: transfer it privately to the environment file, not to logs, screenshots, issues or source control. Do not save it in plugin settings.

For a systemd-managed OpenPlotter installation, first identify the actual Signal K service unit. The following examples assume it is `signalk.service`; adapt only the service name if yours differs.

Create `/etc/signalk-mcp-ops.env` as a root-owned file readable/writable only by root (mode `0600`), and edit it using an administrator editor. Its contents should be:

```text
SIGNALK_MCP_OPS_KEY=<random secret>
```

For example, create a new file using `sudo install -m 600 -o root -g root /dev/null /etc/signalk-mcp-ops.env`, then `sudoedit /etc/signalk-mcp-ops.env`. Do not run the creation command over an existing key file, because it empties the file.

Use `sudo systemctl edit signalk.service` to add this drop-in:

```ini
[Service]
EnvironmentFile=/etc/signalk-mcp-ops.env
```

The system service manager reads this root-protected file and passes the key to Signal K. Then apply the drop-in and restart the service:

```sh
sudo systemctl daemon-reload
sudo systemctl restart signalk.service
```

Key rotation requires updating the protected file, restarting Signal K and updating the client key. Reloading plugin settings alone does not refresh the process environment. For other service managers, supply the same environment variable through their protected deployment configuration. Never commit or include the key in diagnostic output.

## Plugin configuration

Example options, with a generic local host:

```json
{
  "allowedHosts": ["localhost:3000"],
  "allowedOrigins": [],
  "pathPrefixes": ["navigation", "environment", "electrical", "propulsion", "tanks"],
  "staleAfterSeconds": 300
}
```

Use your deployment's incoming Host header, including its port, in `allowedHosts`. Present Origin headers must match `allowedOrigins` exactly; an empty list permits clients that omit Origin and rejects requests that carry one. Cross-origin CORS support is not provided. A reverse proxy must preserve an allowed Host; forwarded host headers do not determine trust.

## MCP client authentication

Configure a Streamable HTTP MCP client with:

```text
Endpoint: https://<Signal K server>/plugins/signalk-mcp-ops/mcp
Authorization: Bearer <Signal K token>
X-MCP-Ops-Key: <MCP Ops key>
```

The route intentionally retains **Signal K admin authentication**. Enable Signal K security and use an authorized admin token; the extra MCP key does not replace it. Clients must support both headers. The plugin key check remains enforced even if host security is disabled, but disabling host security is not the documented deployment configuration.

Use the existing Signal K HTTPS endpoint for remote clients. This version provides no OAuth discovery or OAuth authorization server; clients requiring that flow are unsupported. See [SECURITY.md](SECURITY.md) for the existing trust model and deployment limits.

## Compatibility

| Component | Status | Scope |
| --- | --- | --- |
| Signal K Server 2.31.0 | Live validated | Public tools and provider diagnostics on the reference installation |
| Node.js 22.23.2 | Live validated | OpenPlotter / Raspberry Pi, remote Windows MCP client |
| Node.js 22 / 24 | CI tested | Automated build/tests; distinct from live server compatibility |
| Signal K latest | Not yet live validated | No compatibility claim; optional manual integration target |

Internal provider access uses runtime feature detection against the documented 2.31.0 shapes and fails with `UNSUPPORTED` when incompatible. No broad Signal K version range is claimed. The compile-time `@signalk/server-api` version remains 2.33.0; MCP SDK remains 1.30.1.

The official Signal K reusable CI runs alongside project CI. Automatic push/PR runs use Node 22/24 with armv7 and server integration disabled. Once this workflow is on the default branch, use Actions → SignalK Plugin CI → Run workflow, enable integration and supply a JSON version list such as `["2.31.0", "latest"]` for optional server integration checks. A CI server-start check is not a replacement for authenticated live MCP tests.

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

Node.js >=22 is required. From a clean checkout:

```sh
npm ci
npm test
npm pack --dry-run
```

Tests compile TypeScript and cover protocol, security, lifecycle and diagnostics using the official MCP client. The published entry point is the compiled CommonJS factory `dist/index.js`. The `prepack` hook builds it before packing; no install-time build is needed.

## Documentation

- [Specification and API matrix](SPEC.md)
- [Architecture and compatibility boundaries](ARCHITECTURE.md)
- [Security model and reporting](SECURITY.md)
- [GitHub publication and release checklist](docs/PUBLISHING.md)
- [Contributing](CONTRIBUTING.md)

## Related work and design references

[sailingnaturali/signalk-mcp](https://github.com/sailingnaturali/signalk-mcp) demonstrates discrete tools and path discovery. [VesselSense/signalk-mcp-server](https://github.com/VesselSense/signalk-mcp-server) demonstrates compact results and flexible Signal K querying. This project adopts the ideas of discoverable tools and bounded responses, with an in-process operations focus. Its implementation is original; no code from either repository was copied. Arbitrary code execution and vessel-specific voice/navigation behavior are outside this project's scope.

Primary interface references: [Signal K plugin documentation](https://demo.signalk.org/documentation/Developing/Plugins.html), [Signal K server API](https://github.com/SignalK/signalk-server/tree/master/packages/server-api), and the [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). See `package-lock.json` for the exact dependency resolution.

MIT licensed. Publication remains a separate maintainer action; see the release checklist.
