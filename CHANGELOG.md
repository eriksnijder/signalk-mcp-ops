# Changelog

## 0.1.0 — Unreleased

- TypeScript Signal K plugin with stateless Streamable HTTP MCP endpoint.
- Seven implemented read-only diagnostic tools; removed six UNSUPPORTED-only placeholders from the MCP registry while retaining them as planned/reserved functionality in SPEC.md.
- `list_plugins` now includes bounded, nullable `name` alongside `id`, `version` and `enabled`.
- Recorded operator-reported live OpenPlotter / Signal K validation: loading/enabling, plugin route, existing TLS, admin authentication, additional key and remote Streamable HTTP from an external Windows client. `tools/list`, `get_server_info` and `read_path("navigation.datetime")` succeeded.
- Updated registry and inventory tests; security model and MCP SDK unchanged.
- Host/origin allowlists, separate environment key, prefix restrictions and bounded output.
- Unit and MCP HTTP integration tests; Node 22/24 Linux/Windows CI.
- Architecture, specification, security model and release checklist.

Live baseline end-to-end validation succeeded; a versioned compatibility matrix and package release remain pending. No vessel-specific data or secrets were added.
