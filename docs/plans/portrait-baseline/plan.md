# Commonlight portrait baseline

Status: Verifying. Operation: verify. Current phase: independent review.
Acceptance: partially satisfied. Next slice: independently verify the three review repairs against the final build.

## Objective and scope

Build a private-source, local-only Next.js member-photo prototype. Capture/upload,
consented deterministic processing, before/after review, optional name and text
BC + AI mark, explicitly consented revocable public-by-link output. No deployment,
provider account, inference API, generated identities or real-person fixture data.
Write set: this new repository, excluding unrelated sibling workspaces.

## Binding decisions

- App/server deploy atomically. `lib/contracts.ts` owns operation bounds.
- Deterministic Sharp adapter owns metadata-free 8-bit sRGB JPEG output, centered
  4:5 crop at 576 × 720, modest global exposure/saturation only. No ACES or image
  reconstruction claim. Crop can exclude part of a face; review is mandatory.
- Memory adapter owns private originals/outputs and unguessable, expiring link
  capabilities. Max 12 records; two concurrent upload/processing jobs admitted before body reads. No disk writes of
  photos. Restart deletes every image/link; expiry is capped at the owning session deadline (at most 24h), enforced on
  reads and swept. This is a bounded ephemeral prototype, not durable production
  storage. Exact validated uploaded bytes are retained privately with their original format.
  A separate metadata-stripped full-frame JPEG preview is used for review.
- Session cookie is HttpOnly/SameSite strict, short-lived, server-issued. Gallery
  tokens are separate and confer only processed-image access. No list endpoint.
- Consent is required before camera and processing; separate unchecked subject
  sharing consent before publication. Revocation cannot erase downloaded copies.
- One request owns each processing job; disconnect/cancel fences publication of
  its result. UI owns camera tracks, object URLs and AbortController lifecycles.
- Hosted processing is unavailable until provider/privacy review and credentials
  are supplied by authorized operator. An interface, not a pretending API stub.

## Milestones and gates

1. Backend and UI (Verifying): app/, lib/, tests/, configs. Gates: strict typecheck,
   synthetic-fixture domain/HTTP tests, production build, scoped source review.
2. Browser acceptance (Verifying): camera permissions, cancellation/navigation,
   keyboard/focus, mobile layout, before/after and publish/revoke flows. Browser
   localhost is currently blocked; no claim of real GUI verification.

## Acceptance claims

- Invalid/oversized/unsupported images rejected; metadata stripped; JPEG8 and
  maximum dimensions proven by decoded output metadata.
- Consent, ownership, expiration, cancellation, publication and revocation tested
  at domain/HTTP boundaries. Originals never reachable by gallery token.
- Real browser behavior requires browser evidence, not build or unit substitution.

## Standards and design review

Uses MrScripty/Coding-Standards dcc56f26e884ade260770beceba2501d3746200d:
Core/Router; planning, implementation, verification, commit, build, tooling;
contracts, security, concurrency, accessibility; frontend, TypeScript/async.
Composed-design review: not-applicable: one small atomic app with a single domain
service and direct adapters; no orchestration framework or layered platform.

## Blockers and triggers

Browser localhost access unavailable. Durable storage/identity, hosted provider,
production hardening and deployment deferred to separately authorized next phase.
Replan if intended retention, subject consent, or deployment requirements change.
See [ledger](execution-ledger.md), [issues](issues.md).
