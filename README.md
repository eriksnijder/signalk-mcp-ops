<img src="./icon.png" alt="Signal K MCP Operations icon" width="96" height="96" align="right">

# Signal K MCP Operations

## Ask your boat's data a question

| Ask your AI assistant… | What it can check |
| --- | --- |
| **“Why has my wind data disappeared?”** | Whether the path exists, when it last updated, and whether any configured connections report errors. |
| **“Is this battery voltage reading still fresh?”** | The value, timestamp and age of the reading against your configured freshness threshold. |
| **“Where is this depth reading coming from?”** | The selected source and other source identifiers available for that path. |
| **“Which data connections report a problem?”** | Connection inventory, reported status and the presence of previous errors. |
| **“What data and plugins are available?”** | Discover permitted telemetry paths and list installed plugins. |

**MCP Operations & Diagnostics** connects a compatible AI assistant to your Signal K server. It gives the assistant nine read-only tools to inspect available data and explain what it finds. Answers depend on the data your server supplies and the paths you allow; a missing value does not prove a sensor has failed.

The plugin cannot change settings, restart services or control the boat. It is a diagnostic aid, not a navigation instrument.

## Get started

1. **Install the plugin.** Look for **MCP Operations & Diagnostics** in the Signal K App Store, or use the [manual installation guide](docs/INSTALLATION.md).
2. **Configure access.** Set a private MCP key, choose the allowed host and data paths, then enable the plugin. The [setup guide](docs/INSTALLATION.md) walks through this.
3. **Connect your AI client.** Use a client that supports Streamable HTTP MCP with both headers below, then try one of the questions above.

```text
Endpoint: https://<your-server>/plugins/signalk-mcp-ops/mcp
Authorization: Bearer <Signal K admin token>
X-MCP-Ops-Key: <your MCP key>
```

Use HTTPS and keep Signal K security enabled. The plugin uses the server's existing connection; no extra port is needed. Clients that require OAuth discovery are not currently supported.

## Version and compatibility

**Version 1.0.0.** Check [npm](https://www.npmjs.com/package/signalk-mcp-ops) or [GitHub releases](https://github.com/eriksnijder/signalk-mcp-ops/releases) for published availability. App Store availability depends on indexing; an unpublished build can be tested from its local tarball.

- **Automated coverage:** Node.js 22 and 24; Signal K integration tests on **2.31.0 and 2.35.1**.
- **Live candidate validation:** all nine tools, authentication rejection, restart, disable/re-enable and key rotation on Signal K **2.31.0 / Node.js 22.23.2 / OpenPlotter Raspberry Pi**.
- **Known hosting limitation:** Signal K 2.31.0 can return a stack trace for malformed JSON before the plugin handles the request. See [deployment responsibilities](SECURITY.md#deployment-responsibilities).

See [compatibility and validation evidence](docs/COMPATIBILITY.md) for the distinction between automated tests and live results.

## Can it read server logs?

**Not through MCP yet.** Signal K exposes recent logs to administrators, and this repository includes a verification command that checks access without printing log contents. See [server log access](docs/SERVER-LOGS.md).

## Learn more

- [Installation and client setup](docs/INSTALLATION.md)
- [Tools, inputs and response formats](SPEC.md)
- [Security and private vulnerability reporting](SECURITY.md)
- [Compatibility and validation](docs/COMPATIBILITY.md)
- [1.0 acceptance checklist](docs/RELEASE-1.0.md) · [Release procedure](docs/PUBLISHING.md)

## Development

Requires Node.js 22 or newer.

```sh
npm ci --ignore-scripts
npm test
npm run audit:runtime
npm run verify:package
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for development details. The icon is included in the npm package and declared through Signal K's `appIcon` metadata.

MIT licensed. Design references and acknowledgements are in [the architecture notes](ARCHITECTURE.md#design-references).
