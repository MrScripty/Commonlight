# Commonlight implementation and privacy reference

[Back to the README](../README.md) · [Run and host Commonlight](hosting.md)

## Processing

`lib/processor.ts` implements the `PortraitProcessor` contract with Sharp. It accepts still JPEG, PNG and WebP, checks decoding, rejects animated/malformed/oversized input, applies EXIF orientation and flattens transparency against a light background.

The exact validated uploaded bytes are retained as the private original, with their correct format and download extension. Original metadata remains only in that download. A separate full-frame preview and the final portrait are re-encoded as JPEG with EXIF, GPS and XMP stripped.

The final portrait is a centered 576 × 720 crop, with brightness multiplied by 1.035 and saturation by 0.96. Optional escaped name/BC + AI text is overlaid; output is 8-bit sRGB JPEG. There is no face detection, face/body/age editing, generated detail, background replacement, relighting or high-dynamic-range reconstruction.

The landing-page hero is an abstract CSS silhouette, not a processing example. Tests generate geometric solid-colour fixtures rather than using real people. The optional mark is plain text; official brand assets still need approval.

## Storage and ownership

`lib/local-store.ts` stores images in a private local directory, `.local-data` by default. `COMMONLIGHT_DATA_DIR` can select another directory. It must stay outside all public/static/build output paths, including resolved symlink paths. Never serve it through another server, put it on a shared drive or commit it.

The storage root is owner-only and files are 0600. The app does not encrypt storage. Linux filesystem behavior is qualified; macOS and Windows persistence remain unqualified.

An expiring, server-issued HttpOnly/SameSite=Strict cookie grants private owner access. Hosted cookies are Secure. Public links use separate random capabilities and cannot retrieve originals or administer portraits. They require a second, explicit subject-consent action. Unguessability does not replace consent.

Retain the browser cookie to recover your private listing after reload/restart. Clearing it or allowing it to expire loses owner access; download for longer retention.

## Expiry, cancellation and recovery

Every portrait expires no later than its session, 24 hours after session creation. An upload near the end of a session has a shorter lifetime. Reads fail after expiry. Running maintenance cleans approximately once a minute; storage operations also clean expired records. Stopped servers retain expired private bytes until the next storage access.

Deletion uses ordinary filesystem deletion. Neither delete nor link revocation can erase external copies, backups or SSD remnants.

Complete staged records are atomically renamed into place. Share/revoke metadata uses atomic replacement under a filesystem lock. Unsupported versions, malformed state and unsafe paths fail closed, without destructive rebuilding or fallback to transient storage.

A cancelled/disconnected upload may already have finished and exist privately. Reload to recover it. Cancellation observed before storage publication removes staged files. Processing never creates a public link automatically.

## Deployment boundary

The development and production npm launchers bind to 127.0.0.1. Without `COMMONLIGHT_ORIGIN`, the API accepts only loopback hosts and same-origin writes. Hosting requires an explicit public HTTPS origin; forwarded headers are not authority.

Gallery links use the studio's origin. Localhost links work only on that computer; viewers need access to the configured hosted HTTPS server.

The supported deployment is one Node server or one container with persistent private disk. Admission limits are two active upload/processing operations and 12 portraits; admission occurs before reading upload bodies. Multiple workers/replicas and serverless instances require shared storage and admission first.

A remote `PortraitProcessor` or `PortraitStore` adapter can be implemented, but none is configured. A hosted app needs operator rate limits, provider/retention review and browser acceptance for its actual TLS/proxy setup. The [hosting guide](hosting.md) covers those checks.

## Source map

- `lib/contracts.ts`: consent, limits, dimensions, options and response decoders
- `lib/processor.ts`: deterministic Sharp processor
- `lib/store.ts`: storage/session contracts and in-memory test adapter
- `lib/local-store.ts`: versioned persistent files, atomic updates, expiry and locks
- `lib/service.ts`: admission, cancellation fence, creation and publication
- `lib/deployment.ts`, `lib/http.ts`, `app/api/`: origin enforcement, authentication and bounded bodies
- `lib/storage-paths.ts`: shared build/storage path containment
- `lib/camera.ts`: permission, stream ownership and cleanup
- `app/page.tsx`: capture, review, downloads and separate sharing

## Checks

`npm run check` runs Prettier, ESLint, TypeScript, unit/route integration tests and the production build.

`npm run test:browser` covers upload, reload, actual server restart, owner recovery, sharing/revocation, repeat/interrupted requests, fake-camera cleanup/capture, keyboard interaction and mobile bounds. CI installs Chromium and retains synthetic browser evidence. These checks do not qualify a real camera, real portrait framing or an operator's hosted deployment.

The acceptance history is under [durable-local-studio](plans/durable-local-studio/) and [portrait-baseline](plans/portrait-baseline/).

## Dependency and visual provenance

Next/React own routing and rendering (MIT); TypeScript/tsx provide static/build execution (Apache-2.0/MIT); Sharp owns raster decoding/encoding (Apache-2.0, with separate notices for native dependencies). proper-lockfile (MIT) owns cross-process local mutation exclusion. ESLint and its TypeScript, React Hooks and Next integrations supply static checks; Prettier supplies formatting. Playwright (Apache-2.0) owns browser testing. Browser binaries are installed in the CI runner, and the browser harness uses a command-scoped telemetry opt-out.

Versions and integrity are locked in `package-lock.json`. Maintain with tests, builds and dependency audit; a clean audit is not a security guarantee.

The existing visual reference was a read-only observation of [bc-ai.ca](https://bc-ai.ca/) on 2026-10-02: near-black `#0a0d12`, lime `#dfe250`, muted `#b8bcc4`, rounded panels and compact uppercase labels. No BC + AI site/repository was changed and no people imagery copied. The text mark is pending approval for official assets.

## Telemetry

No application analytics, remote fonts or remote image processor are configured. Next.js itself enables anonymous CLI/build telemetry by default. Set `NEXT_TELEMETRY_DISABLED=1` for a command to opt out; see the [official telemetry documentation](https://nextjs.org/telemetry).
