# Changelog

## 1.0.1

- Remove the duplicate HTML logo from the README: Signal K renders it as text and already displays the app icon in its header. Start directly with the example questions.
- Clarify version-specific registry audit evidence and stale App Store indicators. The 1.0.0 registry scan dated 2026-10-29 reports zero high/moderate/critical findings; the older high warning belongs to 0.1.0. No dependency changes are needed for that cached warning.

## 1.0.0

- Lead the README with practical questions; move setup and validation history into focused guides.
- Add an app icon, Signal K metadata and package verification of the shipped asset.

- Update MCP SDK to 1.32.2, migrate to Zod 4.6.7, require Express >=4.22.3 within major 4, and refresh compatible locked dependencies.
- Return generic plugin JSON parser errors instead of default error pages; add malformed/oversized/pre-parsed request coverage.
- Derive MCP and OpenAPI versions from package metadata.
- Add production dependency auditing and a clean consumer tarball check exercising MCP discovery/authentication and telemetry.
- Enable private vulnerability reporting and define reporting/support policy, npm login recovery and stable 1.0 acceptance requirements.
- Verify Signal K server-log access in 2.31.0/2.35.1 source and add a development-only probe that returns no log text. The nine-tool MCP scope is unchanged.
- Verify the candidate live on Signal K 2.31.0 / Node 22.23.2: all nine tools, independent admin/token/key rejection, Host/Origin restrictions, request-size rejection, restart, disable/re-enable and MCP-key rotation.
- Verify live admin log access and valid non-admin denial without printing or saving log contents.
- Document the accepted hosting limitation: Signal K 2.31.0 may emit a stack trace for malformed JSON before plugin middleware runs. The plugin does not patch the host error handler.
- Prepare the stable version and release notes; final artifact validation and publication approval remain separate.

## 0.1.0 — 2026-09-29

First public npm and GitHub release.

- Streamable HTTP MCP endpoint under the plugin route, reusing Signal K HTTP/TLS and admin authentication without an extra listener.
- Nine read-only tools, protected by a second, environment-held MCP key plus host/origin and path restrictions.
- Public telemetry tools for native values, freshness, path/source discovery, plugin inventory and server/security information.
- Isolated, runtime-checked provider diagnostics based on Signal K Server v2.31.0: safe connection inventory, provider status and evidence-only missing-path context.
- Live validation on Signal K 2.31.0 / Node.js 22.23.2 / OpenPlotter Raspberry Pi from a remote Windows client over authenticated HTTPS.
- Security boundaries: allowlisted configuration projection, arbitrary status-text withholding, bounded output, unproven source correlations, and no write/configuration/control operations or log/file access.
- Automated protocol, security, lifecycle and diagnostic tests; project CI and official Signal K Plugin CI on Node 22/24. Manual server-integration testing is opt-in; latest Signal K is not live-validated.
- Signal K App Store metadata, tarball installation, protected systemd key deployment, two-header client authentication and a concrete publication checklist.
