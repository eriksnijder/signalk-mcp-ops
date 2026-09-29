# Changelog

## 0.1.0

Prepared for the first release; not yet published. No release date is assigned.

- Streamable HTTP MCP endpoint under the plugin route, reusing Signal K HTTP/TLS and admin authentication without an extra listener.
- Nine read-only tools, protected by a second, environment-held MCP key plus host/origin and path restrictions.
- Public telemetry tools for native values, freshness, path/source discovery, plugin inventory and server/security information.
- Isolated, runtime-checked provider diagnostics based on Signal K Server v2.31.0: safe connection inventory, provider status and evidence-only missing-path context.
- Live validation on Signal K 2.31.0 / Node.js 22.23.2 / OpenPlotter Raspberry Pi from a remote Windows client over authenticated HTTPS.
- Security boundaries: allowlisted configuration projection, arbitrary status-text withholding, bounded output, unproven source correlations, and no write/configuration/control operations or log/file access.
- Automated protocol, security, lifecycle and diagnostic tests; project CI and official Signal K Plugin CI on Node 22/24. Manual server-integration testing is opt-in; latest Signal K is not live-validated.
- Signal K App Store metadata, tarball installation, protected systemd key deployment, two-header client authentication and a concrete publication checklist.

Dependency versions and runtime behavior are unchanged by the App Store-readiness preparation. No npm publish, tag or GitHub Release is performed by that change.
