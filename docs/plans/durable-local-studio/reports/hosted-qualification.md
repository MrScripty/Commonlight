# Hosted qualification — 2026-10-03

Qualified application source: d0c4befe1774e4c099ab7c8dc627d4d96d8fa874.
[Hosted run 37081743869](https://github.com/MrScripty/Commonlight/actions/runs/37081743869)
completed successfully on the exact PR head. Evidence includes formatting, ESLint,
strict TypeScript, 32 unit/route/filesystem tests, the production build, a clean
production dependency audit and all three Chromium scenarios (16.2 seconds total).

## Browser observations

- Subject permission gates camera/processing and separate sharing consent.
- Exact original download, reload and actual server restart preserve owner access.
- Public viewing does not authorize original access; revocation works after restart.
- Repeated preparation stays single-flight. A completed upload whose response was
  interrupted is recovered through the private listing after reload.
- Back navigation restores state; keyboard activation reaches the expected action.
- Closing pending fake-camera permission stops late tracks. Capture also releases
  live tracks; the resulting synthetic image can be processed.
- Mobile bounds assertion passed and the full-page synthetic review screenshot was
  inspected. This is not a claim of complete accessibility or cross-browser coverage.

[Browser evidence artifact 11259092287](https://github.com/MrScripty/Commonlight/actions/runs/37081743869/artifacts/11259092287)
contains the HTML report and synthetic mobile screenshot; retention expires
2026-10-10. No real photographs were used.

## Failure found and repaired

The first browser run 37081179610 passed build/static/domain checks but rejected
session creation with 403. Its trace showed browser Host/Origin 127.0.0.1:3100;
NextURL normalized the internal URL hostname to localhost. The fix preserves the
actual, validated loopback transport Host and exact Origin equality. Forwarded
headers cannot substitute authority. Added regressions reject cross-host, scheme,
port and non-loopback substitutions. The same unweakened browser scenarios then
passed in run 37081743869.

## Remaining scope

Final source/integration review remains separate from hosted qualification. The
prototype stays local-only, with private unencrypted disk, unchanged 24-hour session
expiry and offline cleanup at next access. No deployment or merge is implied.
