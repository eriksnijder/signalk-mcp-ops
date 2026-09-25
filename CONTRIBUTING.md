# Contributing

Use Node.js 22 or newer. Run `npm ci --ignore-scripts` and `npm test` before submitting a change. Keep fixtures synthetic. Include tests for behavior and security boundaries rather than snapshots of implementation details.

Keep v0.1 read-only. Do not add arbitrary code execution, control commands, raw config/log exports or vessel-specific defaults. Any internal Signal K adapter needs a documented supported-version range, field allowlist, realistic sanitized fixtures, failure behavior and secret-leak regression tests.

Use small pull requests describing the user-visible behavior, compatibility impact and validation. Report vulnerabilities privately as described in SECURITY.md.
