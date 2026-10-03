# Persistence review repairs

Three findings against e9f24fc4eff45875f2fde6e5d4c12b747ce9bd3d were repaired.

## Served/build-output containment

`lib/storage-paths.ts` owns the supported Next distDir, consumed by both
`next.config.ts` and the storage adapter. Configured and realpath-resolved storage
locations cannot overlap `public`, default/custom Next build output, static export
output, or Vercel build output. Parent aliases and aliases of served roots are
checked before any sensitive file is written. Tests cover direct `.next/static`,
custom distDir and symlink-resolved paths. This is source/real-filesystem evidence,
not a claim that the originally reported static exposure was reproduced over HTTP.

## Recoverable maintenance failures

A previous maintenance exception no longer gates every future transaction.
Each new operation acquires the lock and reruns authoritative validation/cleanup.
The maintenance diagnostic distinguishes invalid/unsupported state from an
operationally unavailable store; successful maintenance clears that diagnostic.
A real lock-contention regression proves later recovery and original-byte
preservation. A corruption regression proves continued rejection until the test
explicitly repairs its own fixture, with no automatic rebuild or data erasure.

## Expiry-safe publication

Publication rejects an expiry crossed while assembling metadata and checks again
immediately before atomic rename. Every metadata writer uses the canonical
runtime validator. Failed writes clean their own temporary files. Stepped-clock
regressions exercise both assembly and commit boundaries, prove unchanged valid
metadata, then expire/clean the record and create/use an unrelated fresh session.

## Verification

Lint, strict TypeScript and 31 tests passed after these repairs. The prior
production build passed before the repairs; the exact repaired build remains
pending a coordinated build window. Hosted Chromium evidence is still pending.
No deployment, real photos or external credentials were used.
