# Installation and client setup

[Back to the overview](../README.md)

## Install the published version

Find **MCP Operations & Diagnostics** in the Signal K App Store. The published stable package is currently **v0.1.0**; the **1.0.0-rc.1** candidate is not yet published. If the listing is not available, install the stable package manually from your Signal K configuration directory:

```sh
npm install --ignore-scripts signalk-mcp-ops@0.1.0
```

Restart Signal K to discover the plugin. It is disabled by default. Complete the key and access configuration below before enabling it. This version has no separate web interface; you use it through a compatible MCP client.

## Test the release candidate

For a local development build, use a clean repository checkout with Node.js >=22. The current candidate has not been published; v0.1.0 remains available on npm:

```sh
npm ci
npm test
npm pack
```

Install the generated `signalk-mcp-ops-1.0.0-rc.1.tgz` in the Signal K configuration directory, using the account that runs Signal K:

```sh
cd <Signal K configuration directory>
npm install --ignore-scripts /path/to/signalk-mcp-ops-1.0.0-rc.1.tgz
```

The tarball includes compiled `dist/` code. Installation does not require TypeScript or install-time scripts. Restart Signal K to discover the plugin, deploy the MCP key as described below, then configure and enable the plugin in the Admin UI.

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

Use your deployment's incoming Host header, including its port, in `allowedHosts`. Enter a host and port, without a URL scheme or path. For a native MCP client that sends no Origin, leave `allowedOrigins` as an empty list: remove blank rows rather than saving an empty-string entry. A nonempty list must contain valid, exact origin URLs. Present Origin headers must match `allowedOrigins` exactly; an empty list permits clients that omit Origin and rejects requests that carry one. Cross-origin CORS support is not provided. A reverse proxy must preserve an allowed Host; forwarded host headers do not determine trust.

## Troubleshooting startup

The Admin UI enabled switch does not by itself confirm successful startup. The ready status is **Read-only MCP ready**. HTTP 503 with `PLUGIN_DISABLED` means startup has not completed successfully or the plugin is stopped. Check the saved settings and that `SIGNALK_MCP_OPS_KEY` is present in the running Signal K process environment with 32–512 characters. Invalid settings, including a blank `allowedOrigins` entry, also prevent startup. A key file alone is insufficient unless the service loads it. After changing the service environment, restart Signal K.

HTTP 401 means the admin token or MCP key was rejected; HTTP 403 can indicate insufficient admin permissions or the Host/Origin policy. Do not rotate credentials merely because the plugin returned HTTP 503.

## MCP client authentication

Configure a Streamable HTTP MCP client with:

```text
Endpoint: https://<Signal K server>/plugins/signalk-mcp-ops/mcp
Authorization: Bearer <Signal K token>
X-MCP-Ops-Key: <MCP Ops key>
```

The route intentionally retains **Signal K admin authentication**. Enable Signal K security and use an authorized admin token; the extra MCP key does not replace it. Clients must support both headers. The plugin key check remains enforced even if host security is disabled, but disabling host security is not the documented deployment configuration.

Use the existing Signal K HTTPS endpoint for remote clients. This version provides no OAuth discovery or OAuth authorization server; clients requiring that flow are unsupported. See [SECURITY.md](../SECURITY.md) for the existing trust model and deployment limits.

