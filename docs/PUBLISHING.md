# Publication and release checklist

The project is prepared for a new public GitHub repository named `signalk-mcp-ops`. No remote or public release is created by the scaffold. Verify the repository and npm name are available before publishing. Do not publish development status as production-ready support.

## GitHub

From the project directory, after reviewing the code and initial commit:

```sh
gh auth status
gh repo create signalk-mcp-ops --public --source=. --remote=origin --push --description "Read-only Signal K MCP operations and diagnostics plugin"
```

Before a release:

- Set `repository`, `bugs` and `homepage` in package.json using the actual GitHub URL; do not invent an owner in package metadata.
- Enable private vulnerability reporting and review SECURITY.md contact instructions.
- Confirm CI passes on all matrix entries and set branch protections as appropriate.
- Review the staged/published files for credentials or installation-specific data.
- Run the live Signal K compatibility checks below and record exact versions/results.

## Live compatibility checklist

The successful operator-reported baseline validation is recorded in README.md. The checklist below remains useful for release acceptance beyond those confirmed scenarios.

- Install the built tarball in a disposable Signal K instance; verify plugin discovery and Admin UI schema.
- Enable with valid settings/environment; verify missing key and invalid settings fail closed.
- Confirm unauthenticated/non-admin Signal K requests are rejected when host security is on, even with the plugin key.
- Confirm missing/wrong plugin keys fail even when host security is off.
- Connect a real MCP client with both credentials; initialize, list tools, read a known sample path, inspect sources and list plugins.
- Verify allowed/disallowed Host and Origin, proxy/TLS behavior, JSON parser limits and invalid/oversized requests.
- Exercise stop/re-enable/reconfigure and concurrent requests; confirm no duplicate handlers, open transports or stale credentials.
- Confirm only seven implemented tools appear in `tools/list`; planned/reserved tools are not callable and no raw configuration or logs are exposed.

## Package

```sh
npm ci --ignore-scripts
npm test
npm audit --omit=dev
npm pack --dry-run
npm pack
```

Inspect the tarball and test that exact artifact in Signal K before publishing. The `files` allowlist includes compiled code and core documentation, excluding tests, CI, local settings and dependencies. A lockfile is committed for reproducible development/CI; npm consumers resolve runtime dependencies using package.json. Use `npm publish --access public` only after choosing the npm owner and confirming package-name availability. Publication is a separate maintainer action. No automated publishing workflow or stored npm token is included.
