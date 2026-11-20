# Compatibility and validation

The package's Node.js requirement is **22 or newer**. Automated tests cover Node 22 and 24. Compile-time Signal K API types are 2.33.0; they do not establish a supported server-version range. The candidate uses MCP SDK 1.32.2 and Zod 4.6.7; exact dependencies are recorded in package-lock.json.

## Unreleased native read-only user support

The development build adds native bearer identity and self-context path/source permission checks, including discovery and alternate source identifiers. It requires enabled native security and permission-aware routing; connection/status/plugin inventories remain admin-only. See [behavior, compatibility and reproduction](READ-ONLY-USERS.md). Published 1.0.1 and historical acceptance evidence below retain their previous admin-only model. New-feature tests do not establish a boat deployment or a published release.

## Published release: 1.0.0

At preparation on 2026-10-28, the 1.0 package was unpublished. Live acceptance below was performed on 1.0.0-rc.1. Final versioned package checks, exact commit/CI links and artifact hashes are recorded with the release artifact and the [release PR](https://github.com/eriksnijder/signalk-mcp-ops/pull/5). Do not present candidate evidence as a live installation of the final tarball.

## Candidate evidence: 1.0.0-rc.1

On commit `9e1979cefe5d176ff14180a9c8734bb1a075584f`, the following checks passed on 2026-10-26:

| Check | Coverage | Evidence |
| --- | --- | --- |
| Project tests and package install | 18 tests; Windows/Linux; Node 22/24; clean consumer install and MCP exchange | [CI run](https://github.com/eriksnijder/signalk-mcp-ops/actions/runs/40386137435) |
| Official Signal K plugin tests | Linux, Linux ARM64, macOS and Windows; Node 22/24 | [Plugin CI run](https://github.com/eriksnijder/signalk-mcp-ops/actions/runs/40386137897) |
| Server integration | Signal K **2.31.0 and 2.35.1**, each on Node 22/24 | [Integration run](https://github.com/eriksnijder/signalk-mcp-ops/actions/runs/40386165916) |
| Dependency audit | Zero known production vulnerabilities at check time | Project CI audit job |

These links identify a specific tested commit. Later changes must pass their own PR checks, and the reviewed release commit must be verified before publication. CI installation/startup and simulated-host MCP tests do not replace authenticated live acceptance through the operator's TLS/proxy setup. Live candidate checks on Signal K 2.31.0 passed on 2026-10-27–28, including all nine tools and independent missing/invalid credential rejection. Some acceptance checks remain pending; see [LIVE-ACCEPTANCE.md](LIVE-ACCEPTANCE.md) and [RELEASE-1.0.md](RELEASE-1.0.md).

The manual **SignalK Plugin CI** workflow accepts explicit server versions. Use `["2.31.0", "2.35.1"]` when reproducing this matrix. Record exact versions and run links rather than treating an old `latest` result as evidence for a newer server.

## Historical live validation: v0.1.0

The operator reported successful tests on **Signal K 2.31.0 / Node.js 22.23.2 / OpenPlotter Raspberry Pi**, from a remote Windows MCP client over existing authenticated HTTPS. Exact OpenPlotter and client versions were not recorded.

- The plugin loaded and enabled, reused Signal K's TLS endpoint and accepted both Signal K admin authentication and the extra MCP key.
- `tools/list` returned nine tools; `get_server_info` reported the public API and compatible 2.31 internal adapter.
- `read_path("navigation.datetime")` returned live data.
- `list_connections` returned projected id/enabled/type fields. `get_connection_status` returned status while withholding arbitrary text.
- `diagnose_missing_path` distinguished fresh and missing paths, included provider context and did not claim a hardware root cause or proven source ownership.
- No configuration or credentials appeared in the reported output.

These are operator-reported results for v0.1.0, not a new live run of the candidate or a comprehensive security audit. No vessel-specific readings, addresses or credentials are reproduced.

## Internal provider adapter

Provider diagnostics use runtime shape detection based on Signal K **2.31.0**. Unsupported internal shapes return `UNSUPPORTED`; oversized inputs return `RESULT_TOO_LARGE`. An unavailable provider context does not prevent the existing path freshness/missing-data diagnosis.

The original reference is tag [v2.31.0](https://github.com/SignalK/signalk-server/tree/v2.31.0), commit `5a3c945ca3f8a0427302ca37a4ae476ee2276adc`. [ARCHITECTURE.md](../ARCHITECTURE.md#internal-provider-diagnostics-reference) records the source contracts. Do not infer compatibility with every Signal K version from a package version or a successful runtime shape check.

## Registry indicators checked on 2026-10-29

The [version-specific registry record](https://signalk.org/signalk-plugin-registry/plugins/signalk-mcp-ops.json) reports score 85 and zero high/moderate/critical findings for 1.0.0, tested at 07:44 UTC on Signal K 2.35.1 / Node 24. The old 0.1.0 scan reports score 75 and two high findings. A reference server displayed the old warning alongside its installed 1.0.0 metadata until its App Store cache was refreshed; the subsequent detail response reported score 85 and audit OK. No dependency overrides or audit suppression were used. A full repository audit on that date also reported zero findings.

The 1.0.1 patch changes README/documentation and package version only. It removes the raw HTML image line; the Signal K appIcon metadata and PNG remain unchanged.

## Log access

Server-source inspection confirms admin WebSocket log access in 2.31.0 and 2.35.1. A live 2.31.0 probe on 2026-10-28 verified admin log access and invalid-token rejection without printing or saving log contents. A separate check confirmed a valid non-admin token and verified rejection by both the MCP admin gate and the log subscription. This is separate from plugin compatibility. The plugin has no MCP log tool. See [SERVER-LOGS.md](SERVER-LOGS.md).
