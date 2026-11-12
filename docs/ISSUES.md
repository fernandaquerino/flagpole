# Planned issues

These are local issue drafts, not issues posted to an external tracker. All are **planned / not implemented**. They expand the [roadmap](../ROADMAP.md); each can be copied into an issue when its work is authorized.

## FP-001: Publish the JavaScript and React SDKs

**Status:** Planned

**Problem:** Consumers outside the workspace cannot install released packages from npm.

**Scope:** Add Changesets, package export verification, release automation, and npm provenance for sdk-js and sdk-react.

**Acceptance criteria:**

- [ ] A changeset versions each affected package and updates its changelog.
- [ ] A clean external React project installs both packages from npm and passes a smoke test.
- [ ] Release provenance is verifiable, and publishing credentials use narrowly scoped automation.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-002: Stream changes with server-sent events

**Status:** Planned

**Problem:** Polling delays propagation and repeats requests when flags have not changed.

**Scope:** Add authenticated environment-scoped SSE and SDK reconnection with polling fallback.

**Acceptance criteria:**

- [ ] A saved config reaches connected clients without waiting for a polling interval.
- [ ] Reconnects recover missed versions and do not duplicate subscriptions.
- [ ] Disallowed origins and wrong-environment keys cannot subscribe; contexts are not persisted.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-003: Node server SDK with local evaluation

**Status:** Planned

**Problem:** Server applications must currently implement their own raw-config fetching and cache.

**Scope:** Build a Node SDK using server SDK keys, ETags, cached definitions, and the shared evaluator.

**Acceptance criteria:**

- [ ] Local evaluations match evaluator golden fixtures.
- [ ] The SDK handles 304, initial fetch failure, refresh failure, and graceful shutdown.
- [ ] Server keys stay on the server and evaluation contexts are never transmitted or stored by the local evaluation path.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-004: Reusable targeting segments

**Status:** Planned

**Problem:** Teams repeat the same clauses across multiple flags.

**Scope:** Add environment/project-scoped segments and references from targeting rules, with explicit missing-segment behavior.

**Acceptance criteria:**

- [ ] A segment can be reused by at least two flags with identical matching results.
- [ ] Edits and deletions are audited and invalidate affected definitions.
- [ ] Cross-project references and cycles are rejected, and missing references have tested behavior.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-005: Scheduled flag changes

**Status:** Planned

**Problem:** Operators must be online at the moment a release should start or stop.

**Scope:** Schedule config changes with timezone-aware input, UTC storage, cancellation, and a durable execution worker.

**Acceptance criteria:**

- [ ] A scheduled change runs once despite worker retries or restarts.
- [ ] The UI displays local time and UTC clearly, including daylight-saving transitions.
- [ ] Cancellation, stale-version conflicts, and execution results are audited.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-006: Multi-user roles and production approvals

**Status:** Planned

**Problem:** A shared admin password cannot identify individual changes or enforce review.

**Scope:** Introduce user sessions, viewer/editor/admin roles, environment permissions, and production approval workflows.

**Acceptance criteria:**

- [ ] Viewers cannot mutate flags; editors and admins follow documented permissions.
- [ ] Production changes requiring approval cannot be applied through direct API calls without approval.
- [ ] Audit entries identify requester, reviewer, and applied version; role changes and session revocation are tested.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-007: Flag prerequisites

**Status:** Planned

**Problem:** Dependent features need consistent behavior when a supporting feature is disabled.

**Scope:** Allow same-project prerequisite references with defined evaluation order and failure reasons.

**Acceptance criteria:**

- [ ] Cycles and cross-project prerequisites are rejected.
- [ ] A failed prerequisite produces a deterministic documented result.
- [ ] Deep dependency chains, missing flags, and environment isolation have evaluator tests.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-008: Stale flag detection with anonymous counters

**Status:** Planned

**Problem:** Teams cannot identify flags that have gone unused for 30 days.

**Scope:** Add aggregated per-flag counters and a stale view, without recording contexts or per-user events.

**Acceptance criteria:**

- [ ] Flags with no evaluations for 30 days appear in the stale view.
- [ ] Only anonymous aggregate counts and time windows are persisted, with a documented retention policy.
- [ ] The feature distinguishes newly created flags from inactive existing flags and has clock-controlled tests.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-009: Webhooks on flag changes

**Status:** Planned

**Problem:** External systems cannot react to completed flag changes.

**Scope:** Add project webhook subscriptions, signed event payloads, a transactional outbox, retries, and delivery history.

**Acceptance criteria:**

- [ ] Only committed changes produce events; rolled-back changes do not.
- [ ] Recipients can verify signatures and deduplicate event IDs.
- [ ] Failures retry within a defined bound, and payloads contain no SDK keys or evaluation contexts.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-010: Import and export flags between environments

**Status:** Planned

**Problem:** Moving a known configuration between environments requires repetitive edits.

**Scope:** Add JSON export, validated import, conflict preview, and atomic application into a target environment.

**Acceptance criteria:**

- [ ] An export/import round trip preserves variation indexes, rules, and rollout weights.
- [ ] Invalid input or a stale target version causes no partial changes.
- [ ] Preview explains overwrites; imported changes are audited and secrets/history are excluded from exports.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-011: OpenFeature provider for JavaScript

**Status:** Planned

**Problem:** Applications using OpenFeature cannot adopt Flagpole through a standard provider.

**Scope:** Implement an OpenFeature provider over sdk-js, including context mapping, readiness events, reasons, and errors.

**Acceptance criteria:**

- [ ] Boolean and string resolutions match the Flagpole client and respect caller defaults.
- [ ] OpenFeature conformance tests cover initialization, context changes, errors, and disposal.
- [ ] Unsupported value types fail with documented standard error codes.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-012: SDK endpoint rate limiting

**Status:** Planned

**Problem:** A noisy client can consume unbounded evaluation capacity.

**Scope:** Add configurable per-key limits for SDK routes with bounded storage and explicit proxy/IP handling.

**Acceptance criteria:**

- [ ] Over-limit requests return 429 and Retry-After without evaluating contexts.
- [ ] Limits isolate keys/environments and recover after the configured window.
- [ ] Tests cover spoofed forwarding headers, concurrent requests, and accepted-traffic overhead.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-013: Measure 1,000 evaluations per second

**Status:** Planned

**Problem:** There is no reproducible evidence of throughput or latency under load.

**Scope:** Add a synthetic load harness and report for 1,000 evaluations/s with a target p95 below 20 ms.

**Acceptance criteria:**

- [ ] The report states hardware, runtime versions, dataset, payload sizes, duration, and measurement boundaries.
- [ ] A sustained run measures throughput, p50/p95/p99, error rate, and resource use; success requires p95 below 20 ms at 1,000 evaluations/s.
- [ ] The harness uses made-up opaque contexts and does not enable request-body logging.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.

## FP-014: Docker images and deployment guide

**Status:** Planned

**Problem:** Operators lack a documented reproducible deployment path for the API and dashboard.

**Scope:** Provide multi-stage images, health checks, migration startup guidance, TLS/proxy configuration, and backup/restore instructions.

**Acceptance criteria:**

- [ ] Images run as non-root with no build-time secrets baked in.
- [ ] A fresh installation and an upgrade preserve data and run migrations exactly as documented.
- [ ] A clean-machine exercise verifies HTTPS cookies, exact CORS origins, backups/restores, and application rollback.

**Completion evidence:** Link the implementation, relevant automated tests, and usage documentation. Record any compatibility or migration impact before closing.
