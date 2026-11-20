# Contributing

Use Node.js 22 or newer. Run `npm ci --ignore-scripts` and `npm test` before submitting a change. Keep fixtures synthetic. Include tests for behavior and security boundaries rather than snapshots of implementation details.

Keep the 1.0 scope read-only. Do not add arbitrary code execution, control commands, raw config/log exports or vessel-specific defaults. Any internal Signal K adapter needs a documented supported-version range, field allowlist, realistic sanitized fixtures, failure behavior and secret-leak regression tests.

Authentication/permission changes also require `npm run test:integration` with an isolated Signal K runtime selected by `SIGNALK_TEST_SERVER_DIR`; see [native user tests](docs/READ-ONLY-USERS.md#compatibility-and-verification). CI covers Signal K 2.31.0/2.35.1 on Node 22/24. Keep development fixtures out of production authorization paths.

Use small pull requests describing the user-visible behavior, compatibility impact and validation. Report vulnerabilities privately as described in SECURITY.md.
