# Execution ledger

2026-10-02: Parent authorized dependent persistence/recovery slice and hosted
browser acceptance. Baseline PR1/head27d6655 remains unchanged. Local browser is
not used; tests will run in authorized hosted CI. Current disk headroom 4.3 GB.

2026-10-02 23:35 UTC: Implemented versioned private local persistence, authenticated
listing and reload/session recovery. Atomic staged image directories and locked
metadata changes preserve exact originals and explicit publication authority.
Actual disk tests cover reopen, concurrent adapters, partial staging, corruption,
unsafe paths, expiry and owner isolation. Hosted Chromium scenarios are added but
not yet executed. Baseline review-only commit eb306d5 was published separately;
its CI37077744402 passed and its pinned actions/telemetry correction are inherited.

2026-10-02 23:39 UTC: Full local aggregate passed: format, ESLint, strict TypeScript,
26 unit/actual-route/actual-filesystem tests, and final Next production build.
Production audit found zero vulnerabilities. Playwright enumerates three Chromium
scenarios but execution remains pending hosted CI, not replaced by unit evidence.
Cancellation now owns private staging cleanup; Back/Forward restoration reconciles
session-owned state. The root merged baseline PR1 at51f1ef9; this new milestone
will target main without rewriting earlier history. Ready for independent review.

2026-10-02 23:59 UTC: Independent review found static/build-output containment,
maintenance failure latching and a publication/expiry boundary hazard. Repaired
all three and added source/real-filesystem fault regressions. Lint, types and
31 tests pass. See reports/persistence-review-repairs.md. Exact repaired build
is deferred while the foreground mobile work owns resource priority; hosted
browser execution remains pending. Ready for narrow independent re-review.

2026-10-03 00:19 UTC: Published reviewed milestone575eed7 as draft PR2. Hosted
run37081179610 passed the exact production build,31tests, audit and Chromium setup,
then all browser scenarios exposed same-origin403 at session creation. The trace
shows Origin/Host127.0.0.1:3100; NextURL source canonicalizes its URL to localhost.
Corrected validation to preserve actual loopback Host/Origin equality while rejecting
cross-host, scheme, port and forwarded-header substitutions. Added focused route
regression; browser scenarios are unchanged and must pass the next hosted run.
