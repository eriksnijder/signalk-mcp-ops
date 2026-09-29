# v0.1.0 publication checklist

Release preparation only: no npm publication, Git tag or GitHub Release is performed by the readiness branch. The repository is [eriksnijder/signalk-mcp-ops](https://github.com/eriksnijder/signalk-mcp-ops). Follow this checklist when the maintainer explicitly decides to release.

## Review and package

- [ ] Start from a clean checkout of the reviewed `main` commit; confirm `git status --short` is empty and record the commit.
- [ ] Confirm version `0.1.0`, metadata, MIT license and the undated `0.1.0` changelog/release notes.
- [ ] Run `npm ci`.
- [ ] Run `npm test`.
- [ ] Run `npm pack --dry-run`, then `npm pack` and inspect that exact tarball.
- [ ] Confirm `dist/index.js`, the internal adapter and required runtime code are present. The entry point must load without a consumer-side build.
- [ ] Confirm package contents are limited to compiled code, intended documentation, package metadata and license. Source/tests/CI/development artifacts need not ship.
- [ ] Inspect contents for credentials, `.env` files, local settings, vessel identifiers and sensitive screenshots; none may ship.
- [ ] Confirm there are no `preinstall`, `install` or `postinstall` hooks. The existing `prepack` build is retained; App Store installations ignore install-time scripts.
- [ ] Confirm project CI and official **SignalK Plugin CI** are green for the release commit. Automatic runs use Node 22/24; armv7 and Signal K integration are disabled.
- [ ] If desired, manually run official integration with `["2.31.0", "latest"]`. Keep these results distinct from live/operator validation.
- [ ] Test the exact tarball on the reference runtime and verify both authentication layers, nine tools, provider projections, text withholding and path diagnoses.

## npm readiness

- [ ] Check package-name availability with `npm view signalk-mcp-ops name version`. An authenticated registry `E404` means no public package was found at that time; network/authentication errors do not establish availability. If a package exists, confirm ownership and that `0.1.0` is unused.
- [ ] Confirm the publishing account and permissions with `npm whoami`, or configure npm trusted publishing for the intended GitHub repository/workflow and verify its prerequisites before release. This branch adds no publish workflow or registry token.
- [ ] Ensure the account's required authentication/2FA or trusted-publisher setup is complete. Never commit registry credentials.
- [ ] Enable private vulnerability reporting on GitHub and finalize SECURITY.md reporting/support instructions.

## Publish only with a release decision

- [ ] Publish the reviewed artifact using the authorized npm account (for example `npm publish ./signalk-mcp-ops-0.1.0.tgz --access public`). This is a manual release step, not a CI action in this branch.
- [ ] Verify the registry version and package contents, then confirm the plugin becomes visible in Signal K App Store after indexing. Do not assume immediate availability.
- [ ] Tag the reviewed release commit `v0.1.0` and push that tag only after publication is verified.
- [ ] Create the GitHub Release for `v0.1.0`, using the consolidated changelog as release notes and stating the exact live-tested runtime and remaining compatibility limits.
- [ ] Install from App Store on the test/reference runtime. Configure the protected environment key and verify authenticated remote MCP access, nine tools and provider diagnostics.
- [ ] Record the install result and any limitations in the release notes. Add a release date only when the release is actually made.

The operator-validated reference is Signal K 2.31.0 / Node.js 22.23.2 on OpenPlotter / Raspberry Pi, accessed by a remote Windows MCP client over existing authenticated HTTPS. Node 22/24 automated tests do not establish support for arbitrary Signal K versions; Signal K latest has not been live-validated.
