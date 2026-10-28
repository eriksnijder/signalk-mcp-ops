# Path to 1.0

The candidate is **1.0.0-rc.1**. The intended stable scope is the existing nine read-only operations/diagnostic tools, existing two-header authentication and explicit compatibility boundaries. Logs remain an investigation, not a tenth tool. No promise of OAuth, arbitrary config access, control commands or broad server compatibility is implied by 1.0.

## Implemented preparation

- MCP SDK 1.32.2, Zod 4.6.7 and refreshed compatible dependencies address the audit findings recorded on 2026-10-26. The audit must be repeated on the release commit.
- Express minimum version advances to 4.22.3. Plugin-owned malformed JSON errors return generic responses; pre-parsed oversized bodies are still rejected. Host parsing limits remain a deployment responsibility.
- Package version is the single source for MCP/OpenAPI metadata.
- Automated clean consumer installation checks the tarball without install scripts or a consumer build, then exercises MCP discovery/authentication and a telemetry call.
- Private vulnerability reporting is enabled; SECURITY.md defines the reporting route and support scope.
- A development-only log-access probe and source analysis are documented in [SERVER-LOGS.md](SERVER-LOGS.md). No raw log contents are printed or exposed through MCP.

The candidate's initial automated checks passed; exact commits and run links are in [COMPATIBILITY.md](COMPATIBILITY.md). The checklist below still applies to the final reviewed release commit.

## Evidence required before stable 1.0

- [ ] Review and merge candidate changes; record the final commit.
- [ ] Node 22/24 project and official Signal K CI pass on that commit.
- [ ] Explicit Signal K 2.31.0 and 2.35.1 integration runs pass; record exact versions and run links.
- [ ] Test the exact candidate tarball on the operator's reference server over authenticated HTTPS. Record server, Node, platform and client versions without hostnames or secrets.
- [ ] Verify missing/wrong/non-admin Signal K credentials and missing/wrong MCP keys are rejected independently. A mocked Express host does not validate Signal K's admin layer.
- [ ] Confirm nine tool schemas, allowed/denied paths, provider availability/unsupported states, bounded output and withheld status text.
- [ ] Confirm disable/re-enable, restart/key rotation and representative reverse proxy/ingress limits.
- [x] Restore npm authentication and confirm package ownership (verified 2026-10-26).
- [ ] Reconfirm authentication and any required 2FA at publication time.
- [ ] Approve stable 1.0 with documented limitations; rebuild and validate the final versioned artifact.
- [ ] Verify npm contents and App Store installation after publication.

Live candidate checks on 2026-10-27–28 verified all nine tools on Signal K 2.31.0, independent missing/invalid credential rejection, unapproved Origin rejection, allowed/denied path behavior and admin WebSocket log access. See [LIVE-ACCEPTANCE.md](LIVE-ACCEPTANCE.md) for the observed results and remaining gaps. The operator currently has only an admin account, so valid non-admin rejection remains untested. The checklist stays open where only part of a requirement has been verified. Historical v0.1.0 evidence remains separate.

## Separate log investigation

Source verification confirms admin WebSocket log access on 2.31.0 and 2.35.1. A live 2.31.0 probe on 2026-10-28 received a log record without printing or saving its contents; an invalid token was rejected. Run `npm run verify:logs` to reproduce the check on another installation; an empty observation is inconclusive. Also check rejection with a non-admin credential if available. A future log MCP tool requires a separate scope and disclosure-policy decision. Neither raw log export nor successful log verification is a requirement for the nine-tool 1.0 scope.
