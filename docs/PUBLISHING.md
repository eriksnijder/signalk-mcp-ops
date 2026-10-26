# Release procedure

The public baseline is [v0.1.0, published on 2026-09-29](https://github.com/eriksnijder/signalk-mcp-ops/releases/tag/v0.1.0). Current development prepares **1.0.0-rc.1**. A release candidate is not stable 1.0 and must not replace npm's `latest` tag. Publication, tagging and a GitHub Release require a separate release decision.

## 1. Verify the reviewed commit

- Start from a clean checkout of the reviewed commit and record its SHA.
- Confirm package metadata, MIT license, version and changelog. Runtime MCP/OpenAPI versions come from package.json.
- Run `npm ci --ignore-scripts`, `npm test`, `npm run audit:runtime`, and `npm run verify:package`.
- Confirm project CI and SignalK Plugin CI are green for that exact commit.
- Manually run SignalK Plugin CI integration against explicit versions `["2.31.0", "2.35.1"]` with Node 22 and 24. Record versions and run links; a historical `latest` result is not evidence for today's latest server.
- Run `npm pack`, retain the exact tarball, record its SHA-256 and inspect its contents. The published package must contain compiled code, approved documentation, metadata and license only. No credentials, environment files, test fixtures or local configuration may ship.
- Test that exact artifact on the reference Signal K runtime. Verify Signal K admin authentication, missing/wrong MCP key rejection, host/origin rejection, nine tools, allowed/denied paths, provider projections, text withholding, stop/restart and proxy/body-limit behavior. `verify:package` proves clean consumer loading and an MCP exchange with a simulated host; it is not this live acceptance test.
- Record findings in [the 1.0 acceptance checklist](RELEASE-1.0.md). Do not copy v0.1's historical operator validation as a new result.

## 2. Publishing identity and security reporting

Private vulnerability reporting is enabled for this repository, verified on 2026-10-26. Before release, check the [private reporting page](https://github.com/eriksnijder/signalk-mcp-ops/security/advisories/new) and review SECURITY.md.

The local `npm whoami` check returned HTTP 401 on 2026-10-26. The maintainer must restore authentication interactively on their trusted machine:

```sh
npm login --auth-type=web --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm owner ls signalk-mcp-ops --registry=https://registry.npmjs.org/
```

Complete the browser login and required 2FA privately. Do not paste passwords, OTPs or registry tokens into chat, files, CI or Git. Confirm the signed-in account is authorized to publish this existing package. Authentication is not proof of ownership. For an alternative OIDC trusted-publishing setup, configure the exact repository/workflow on npm first; this project does not silently configure a publisher or store a registry token.

Check the intended version with `npm view signalk-mcp-ops versions --json` and verify it is unused. Registry/network/authentication errors are not evidence that a version is available.

## 3. Publish only after a release decision

For an approved release candidate, publish the inspected artifact with a non-default tag:

```sh
npm publish ./signalk-mcp-ops-1.0.0-rc.1.tgz --access public --tag next
```

After verification, tag the exact source commit `v1.0.0-rc.1` and create a GitHub **prerelease**. Verify npm's `latest` tag still points to the previous stable release. Do not assume App Store indexing of a prerelease.

For stable 1.0, complete acceptance, update the package to `1.0.0`, rebuild and repeat artifact checks. That is a new artifact, not simply a relabel of the RC. After approval, publish the exact stable tarball with `--tag latest`, verify its registry contents, then tag the matching commit and create the stable GitHub Release. Add the real release date to the changelog. Never overwrite/reuse a published version.

Finally verify Signal K App Store indexing and installation, configure the protected key, and repeat authenticated remote MCP acceptance. Record actual tested versions and remaining limits in the release notes.
