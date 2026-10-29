# Native read-only user support (unreleased)

Published 1.0.1 requires an admin token. This development change accepts existing Signal K user/device bearer tokens for `readonly`, `readwrite` and `admin` identities. It exposes no writes for any role. The endpoint, settings, extra MCP key and Host/Origin rules are unchanged.

## Access policy

| Tool / result | Authenticated non-admin | Administrator |
| --- | --- | --- |
| `read_path`, `list_paths` | Configured prefix and native path/source read grant | Same native checks; no admin ACL bypass |
| `inspect_path_sources` | Selected value must be authorized; filter each alternate source | Same native checks |
| `diagnose_missing_path` | Authorized telemetry only; no connection/provider context | Authorized telemetry plus existing bounded provider context |
| `get_server_info` | Basic capabilities; internal adapter details withheld | Existing bounded adapter compatibility details |
| `get_security_status` | Plugin policy and verified native security availability | Same |
| `list_connections`, `get_connection_status`, `list_plugins` | `ADMIN_REQUIRED` | Existing bounded projections |

The nine tools remain discoverable for every authenticated caller; admin-only descriptions explain their requirements. Discovery does not grant execution permission. Native telemetry ACLs do not authorize access to host connection or package inventories, hence the separate admin gate.

Every measurement uses the exact native call `checkACL(identifier, 'vessels.self', path, source, 'read')`; only literal `true` grants access. These are Signal K's own rule-ordering semantics, not an additional independent source/path ACL language. There is no configured-ACL admin bypass. With no native ACLs configured, the host permits reads; administrators must configure native restrictions if needed. Plugin prefix restrictions always apply as another boundary.

For a missing or source-less leaf, source-specific permission cannot be established. Only a literal native `anyACLs() === false` and a successful native read check allow a source-less result. Otherwise `read_path` and source inspection return `PATH_UNAVAILABLE`; diagnosis reports `unavailable` identically for absent and denied paths. With no ACLs, genuinely absent paths retain `NOT_FOUND` / `missing`. There is no fallback to another source when the selected source is denied.

Alternate source identifiers are individually checked before they are returned. Pagination is calculated after filtering authorized paths. Source truncation counts only permitted identifiers; source scanning is capped at 1,000 entries and result pages at 100 sources. Existing traversal, output, redaction and request limits remain in effect.

## Authentication bridge and lifecycle

`src/auth.ts` isolates version-sensitive Signal K `securityStrategy` hooks. It requires enabled/non-dummy security, synchronous `authorizeWS`, `checkACL` and `anyACLs` hooks. It delegates JWT verification and current user/device lookup to Signal K; it never reads security configuration, decodes/signs JWTs or retains identities across requests.

Authentication uses a fresh object containing only the supplied bearer header. Cookies, URL tokens and HTTP middleware principals cannot elevate or replace it. Missing, invalid, expired, deleted, anonymous `AUTO`, malformed or unknown-role identities are rejected. Tool calls authenticate again and remain bound to the same identity. Async inventory reads recheck identity/role after awaiting the host. Stopping/reconfiguring the plugin invalidates the captured access context.

The native plugin router classifies only the MCP POST/GET/DELETE routes as `readonly`. All methods still run the plugin guard; GET/DELETE return 405 after authentication. Signal K may call `start()` before `registerWithRouter()`; admission remains closed until permission-aware routes exist. Missing routing/security contracts fail closed. The host/proxy may reject a request before plugin middleware; see [hosting responsibilities](../SECURITY.md#deployment-responsibilities).

## Compatibility and verification

The new native integration test targets **Signal K 2.31.0 and 2.35.1**. It starts an isolated real server, discovers the plugin through its native plugin loader/router and exercises actual user/device JWTs and native ACL rules over MCP. It covers permitted reads, path and source denial, filtered paths/sources, indistinguishable absent/denied diagnosis, admin-only inventories, expired/deleted identities, ACL changes, caller isolation, retained key/Origin enforcement and conflicting admin cookies. Synthetic unit tests cover missing/dummy/changed security contracts and role changes during pending inventory reads.

Reproduce against a separately installed disposable runtime (POSIX example; set the same environment variables in PowerShell on Windows):

```sh
npm ci --ignore-scripts
npm test
npm install --prefix /tmp/signalk-auth-231 --ignore-scripts --omit=optional --no-audit --no-fund signalk-server@2.31.0
SIGNALK_TEST_SERVER_DIR=/tmp/signalk-auth-231/node_modules/signalk-server \
SIGNALK_TEST_SERVER_VERSION=2.31.0 npm run test:integration
```

Use a fresh runtime directory and repeat for 2.35.1. CI tests each server version on Node 22 and 24. The explicit integration runner uses Node's force-exit option after the tests and cleanup hooks; a test assertion failure still fails the run. No operational server credentials or vessel data are used. A passing local/CI test is not vessel acceptance or compatibility evidence for every Signal K version.
