# Durable local studio

Status: Verifying. Operation: verify. Current phase: final source/integration review.
Acceptance: reviewed persistence repairs and all hosted gates pass; final source/integration review remains. Next slice: review the origin follow-up and qualification evidence before integration.
Base: merged main commit 51f1ef9b3e404ad588606d6a9e270c47eea8481e, including baseline review fixes eb306d5.
Publication: new development branch/PR targeting main; baseline PR 1 is already merged.

## Objective and exact write set

Keep validated originals, derivatives, expiry and explicit sharing state across
local server restart; recover owner review/revoke/delete controls after reload
without extending access lifetime. Add synthetic-only hosted browser acceptance.
Write set: lib/, app/, tests/, browser-tests/, Playwright/config/package/CI files,
README and this plan. No other repository, real photograph, deployment, hosted
provider account or permanent credential.

## Binding design

- Version-1 private filesystem adapter, default .local-data outside public, 0700
  root and 0600 files. Untrusted IDs validated; no original/static public path.
- Exact original and derived image files are immutable. A complete staged folder
  becomes authoritative through same-filesystem rename. Session and publication
  metadata updates use fsync plus atomic replace under an established filesystem
  lock. No memory fallback for corrupt/unavailable/unsupported storage.
- An operation holds the adapter's process-shared lock; metadata reads and writes
  cannot lose concurrent revocation/publication/deletion. Staging files and delete
  tombstones are never readable through application APIs. Startup reopens v1;
  incomplete staging is disposable, unrecognized records fail closed.
- Session capabilities stay bounded to their original 24-hour deadline. Portrait
  and public expiry cannot exceed it. Only session-authenticated listing returns
  owned review identifiers and publication state; no public listing endpoint.
- Expiry is checked before every read/action. Running-server maintenance removes
  expired records; while the server is stopped, expired bytes remain on private
  disk until the next storage operation. This is retention-limited durability,
  not backup or permanent hosting. Losing the browser cookie loses owner access.
- Private list hydration owns cancellation and generation authority. Reloading
  restores controls; no cookie/token is put in localStorage or a public URL.
- Browser evidence runs Chromium in hosted CI against a loopback server, using
  generated synthetic fixtures and browser fake-camera support only. No local
  browser workaround around the existing localhost denial.

## Milestones and gates

1. Persistence/recovery (Verifying): unit/actual-adapter reopen, atomic mutation,
   corruption, expiry, ownership and route tests; strict/lint/build checks;
   independent review before dependent PR publication.
2. Browser evidence (Accepted): hosted Playwright baseline/upload/reload/revoke/
   delete, camera close/capture, repeated/interrupted actions and keyboard flows.
   Uploaded synthetic test artifacts only; no production deployment.

## Standards and composed-design review

Baseline standards plus Persistence, Contract Evolution and Resilience apply.
One local app, one private storage owner and existing service boundaries; composed
platform design review not-applicable. No migration from memory-only baseline is
possible or needed: its runtime state remains ephemeral, and no durable v0 exists.

## Blockers and replan triggers

One heavy build at a time; parent coordinates shared RAM/disk. Local browser access
is denied, so hosted evidence is required. Replan for multi-worker serving,
longer-lived authority, remote hosting, disk encryption or provider integration.
See execution-ledger.md and issues.md.

## Qualified evidence

Exact application head d0c4befe passed hosted run 37081743869, including 32 tests,
production build/audit and all three Chromium scenarios. See
[hosted qualification](reports/hosted-qualification.md). The earlier checkpoint
reports retain their historical pending status; this section owns current gates.
