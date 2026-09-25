# Signal K MCP Operations

A generic TypeScript Signal K plugin for read-only operations and diagnostics through the Model Context Protocol (MCP).

**Status: v0.1 development baseline.** Protocol integration is tested with the official MCP client and a simulated Signal K API. A live Signal K compatibility test is required before release or deployment. This repository contains no vessel-specific addresses, identities or credentials.

The plugin mounts a stateless Streamable HTTP endpoint at:

```text
https://<server>/plugins/signalk-mcp-ops/mcp
```

It uses Signal K's existing HTTP server and TLS deployment. It opens no additional listener. There are no write tools, shell execution, generated code execution, configuration updates, restarts or control commands.

## Available in v0.1

- Read one allowed `vessels.self` value with native units, timestamp, source and freshness.
- Discover value paths with bounded pagination and inspect source identifiers.
- Diagnose missing or stale data without claiming a hardware root cause.
- List plugins through the official asynchronous `getFeatures()` API.
- Report MCP capabilities and the plugin's security policy.

Connection inspection, plugin configuration/status and recent server errors are **reserved contracts**, returning `UNSUPPORTED`. No version-specific internal adapter ships in v0.1. See the full [API matrix](SPEC.md).

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
