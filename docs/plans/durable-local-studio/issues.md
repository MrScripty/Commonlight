# Issues

- DS-001: Closed: hosted Chromium run 37081743869 passed all three scenarios.
- DS-002: Offline expiry cleanup cannot execute until next startup/storage access.
  Disclose explicitly; local retention semantics, no claim of secure physical erase.
- DS-003/004/005: Served/build paths, transient maintenance failure recovery and
  expiry-safe publication repaired; independent re-review accepted and exact hosted build passed.
  Evidence: reports/persistence-review-repairs.md.

- DS-006: Closed: browser trace exposed Next loopback-origin canonicalization;
  fixed in d0c4befe and qualified by 32 tests plus the same three browser scenarios.
