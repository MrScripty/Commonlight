# Commonlight

**Working name · private-source local prototype for BC + AI member portraits.**

A shared frame and restrained colour grade, with the actual person preserved.
Built with Next.js, React, TypeScript and Sharp. No image model, inference account,
application analytics, remote font, or uploaded real-person fixture is included.
Next.js itself enables anonymous CLI/build usage telemetry by default. To opt out
for one run, set `NEXT_TELEMETRY_DISABLED=1` for that command; see the
[official Next.js telemetry documentation](https://nextjs.org/telemetry).

## Run locally

Node 22.13+ (Node 24 LTS recommended):

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Development and production launchers bind only to
127.0.0.1; API routes reject non-loopback origins. This is intentionally **not a
production deployment**. Start production locally with `npm run build && npm start`.

## Try the workflow

1. Read and select capture/processing permission.
2. Upload a still JPEG/PNG/WebP (up to 10 MB, 40 megapixels), or grant the browser
   camera permission. Camera permission is requested only by the camera button.
3. Optionally add a name and/or BC + AI text mark. Prepare the portrait.
4. Compare the full-frame cleaned preview and processed 4:5 portrait. Download the exact original or prepared JPEG. Inspect framing carefully: center cropping does not detect faces.
5. Separately check subject consent to create a gallery link. The link exposes
   only the processed JPEG. Revoke it or delete both images from the review page.

All tests generate geometric solid-colour fixtures, not portraits of real people.
The hero is an abstract CSS silhouette, not an example processing result.

## What the baseline actually does

- Sharp decodes and checks still raster images; malformed, unsupported and overly
  large inputs fail closed. EXIF orientation is applied before metadata stripping.
- The exact validated uploaded bytes are retained privately with their correct
  JPEG/PNG/WebP media type and download extension. Original metadata is preserved
  only in this private download. A separate full-frame JPEG preview and final
  processed JPEG are re-encoded with EXIF/GPS/XMP stripped.
- Center crop to 576 × 720; +3.5% global brightness and 96% saturation; optional
  escaped text overlay; final 8-bit sRGB JPEG. This does not restore missing detail
  or make an 8-bit source into a higher-dynamic-range photograph.
- No face/body/age edits, generated details, background replacement or relighting.
  Poor exposure, clipping, focus, and unsuitable framing need a better source.

## Privacy and deliberate prototype limits

Images are retained in a private local filesystem directory, `.local-data` by
default (or an operator-selected `COMMONLIGHT_DATA_DIR` outside all served/build paths). The
root is owner-only and files are 0600; do not put this directory in a static file
server, shared drive or source control. Storage is not encrypted by this app. Filesystem behavior is qualified on the
Linux runner; macOS and Windows persistence are not yet qualified.
Only a single local server is supported, with at most 12 portraits and two
upload/processing operations. Admission precedes request-body reads.

Every portrait expires no later than its owning session (24 hours from session
creation), so late-session uploads have shorter lifetimes. Reads fail after expiry.
Running-server maintenance removes expired files approximately once per minute,
and each storage operation cleans expired records. If the server is stopped,
expired bytes remain private on disk until its next storage access. Deletion is
ordinary filesystem deletion, not a claim of secure erase from backups or SSDs.

Original and derived bytes survive a restart. Complete staged records are
atomically renamed into place; sharing/revocation metadata uses atomic file
replacement under a filesystem lock. Unknown versions, malformed state and unsafe
paths fail closed without an in-memory fallback or destructive rebuild.

Private access requires an expiring server-issued HttpOnly/SameSite=Strict session
cookie. Public links use distinct random capabilities and cannot access originals
or administration. No permanent credentials or service accounts are created.
Sharing is an explicit second action; unguessability is not a substitute for
subject consent. Revocation cannot erase copies viewers have already downloaded.
Gallery links are local and useful only on the same reachable local server.

Reloading restores saved portraits and their review/revoke/delete controls through
an authenticated private listing. Retain the same browser cookie: clearing it or
letting it expire loses owner access. Downloads are needed for longer retention.
A cancelled/disconnected upload that finished before cancellation may still exist
privately; reload recovers it. Cancellation observed before storage publication
removes staged files. No processing publishes a public link automatically.

## Architecture and future integrations

- `lib/contracts.ts`: size, consent, options, client response decoders.
- `lib/processor.ts`: `PortraitProcessor` and deterministic Sharp implementation.
- `lib/store.ts`: storage/session contracts and in-memory unit-test adapter.
- `lib/local-store.ts`: versioned private files, atomic updates, expiry and locks.
- `lib/service.ts`: processing admission, cancellation fence, creation/publication.
- `lib/http.ts` and `app/api`: loopback/origin enforcement, auth and bounded bodies.
- `lib/camera.ts`: camera permission/stream ownership and cleanup.
- `app/page.tsx`: capture, review and separate publication user experience.

A hosted processor can implement `PortraitProcessor`; a private object store plus
transactional metadata store can implement `PortraitStore`. Remote adapters are not configured.
Before deployment: supply authorized identity/storage, review provider consent and
retention, add durable cancellation/job reconciliation, rate limits and deployment
resource boundaries, and run real-browser acceptance. Do not run this local prototype through multiple workers/serverless instances or remove loopback guards
without revisiting the threat model.

## Verify

```sh
npm run check
```

Unit and route integration tests cover dimensions/encoding, metadata, deterministic
output, input/consent rejection, ownership, expiry, sharing/revocation/deletion,
concurrency reservations, cancellation and delayed camera permission cleanup.
`npm run test:browser` adds hosted Chromium checks for synthetic upload, reload,
actual server restart, owner recovery, explicit sharing/revocation, repeated and
interrupted requests, fake-camera cleanup/capture, keyboard use and mobile bounds.
CI installs Chromium and uploads synthetic traces/screenshots; no real photos are
used. Local browser access is prohibited in the development environment, so
browser execution evidence must come from the hosted run before acceptance.
See `docs/plans/durable-local-studio/` for current acceptance and limitations.

## Visual reference

Read-only observation of [bc-ai.ca](https://bc-ai.ca/) on 2026-10-02: near-black
`#0a0d12`, lime `#dfe250`, muted `#b8bcc4`, rounded panels and compact uppercase
labels. No BC + AI organization repository/site was modified or people imagery
copied. The optional mark is plain text, pending brand approval for official assets.

## Dependency ownership

Next/React own application routing/rendering (MIT), TypeScript/tsx static/build
execution (Apache-2.0/MIT), Sharp raster decoding/encoding (Apache-2.0; its bundled
native dependencies carry their own notices), ESLint/TypeScript/React Hooks/Next plugins own static checks; Prettier formatting.
Versions and integrity are locked in package-lock.json. Maintain with tests/build
and dependency audit; a clean audit is not a security guarantee.

`proper-lockfile` (MIT) owns cross-process local mutation exclusion. Playwright
(Apache-2.0) owns hosted browser tests; its browser binaries are installed only in
the hosted runner. The browser harness sets a command-scoped telemetry opt-out.

The supported Next `distDir` is defined once in `lib/storage-paths.ts` and used by
Next configuration and privacy containment. Both configured paths and resolved
symlink paths are checked against public/static/build output roots. Do not bypass
that shared configuration or serve the private directory through another server.
