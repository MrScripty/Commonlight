# Issues

- CL-001 / acceptance blocker: cloud browser localhost prohibited. Owner: maintainer.
  Camera, focus, navigation and visual QA require a permitted browser before release.
- CL-002 / deferred: memory store is single-process, ephemeral, max 12 records.
  Owner: maintainer. Replace with private object storage/database and production
  authentication before deployment; add provider privacy/retention evaluation.
- CL-003 / deferred: deterministic global grade cannot fix directional lighting,
  severe clipping, focus or unsuitable crop. Owner: maintainer. Request better
  source photo; do not introduce identity-changing generation as silent fallback.
- CL-004 / fixed, pending independent re-review: preserve exact uploaded originals,
  constrain portrait/public lifetime to owner authority, and admit uploads before
  reading bodies. See reports/review-repairs.md for ownership and regression evidence.
