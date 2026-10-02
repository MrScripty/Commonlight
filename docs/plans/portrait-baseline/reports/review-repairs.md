# Review repairs — 2026-10-02

## Exact original preservation

`PortraitImages` now distinguishes exact uploaded bytes plus original format from
the normalized preview and processed JPEG. Originals are privately downloaded as
attachments with validated JPEG/PNG/WebP MIME and matching extension. The review UI
uses the metadata-stripped preview; public routes still return only processed bytes.
Tests recover exact JPEG, PNG and WebP inputs, inspect response MIME/extension,
check metadata stripping for derivatives, and reject unauthorized private access.

## Owner authority lifetime

`OwnerAuthority` explicitly carries the authenticated session's absolute deadline.
Every portrait expires at the earlier of 24 hours after creation or that deadline.
Processing that finishes after authority expiry cannot retain an inaccessible
record. Staggered-upload tests exercise creation one second before expiry,
publication/revocation while live, expiry of session and public image together,
and authority expiring during processing. UI/README disclose shorter late-session
retention. No session-lifetime extension or persistent credentials were introduced.

## Admission before upload allocation

The service admits an operation before invoking its body loader. It validates
options first, reserves one of two slots for the complete upload/processing
lifetime, and releases the slot in `finally`. Request cancellation cancels the body
reader, observes cleanup, and prevents committing a result. Route tests launch six
incomplete streams, prove only the first two are read, reject the rest with 503,
prove invalid consent does not read a body, and verify slot reuse after cancellation
and repeated reader errors.

## Final verification

`npm run check` passed on 2026-10-02 after all source changes: Prettier, ESLint,
strict TypeScript, 18 domain/route tests, and production build using Next 16.3.8 and
Sharp 0.35.5. `npm audit --omit=dev --audit-level=high` found zero vulnerabilities.
Real-browser and listening-server evidence remain unavailable; route tests execute
actual route handlers in process. Independent re-review is pending.

Memory-only retention, reload loss of controls, uncertain completion of an upload
cancelled immediately after server commit, local-only links, and no durable storage
or hosted inference remain deliberate, documented prototype limitations.
