# Portfolio validation — October 8, 2026

Scope: README, static website/case study, optional screenshot and captioned-video publishing,
and capture-review regression coverage. This is not a new mobile release certification.

## Verified locally

- Mobile: **39 suites, 180 tests passed**, including three new capture-review tests.
- Shared core: **33 files, 330 tests passed**.
- API unit tests: **16 files, 111 tests passed** (temporary local sockets enabled).
- iOS release helpers: **6 tests passed**.
- Mobile and API TypeScript checks passed.
- Repository lint passed with **0 errors and 18 pre-existing warnings**.
- All four generated HTML pages passed local link, anchor, and sharing-metadata checks.
- The generated sharing image is 1200×630; inspected for clipping and readable text.
- Homepage and engineering page rendered at 1280px and 390px in headless Chrome with no
  horizontal overflow or broken images. Layout screenshots were inspected.
- In an isolated temporary copy, verified screenshot publication, URL-escaped filenames,
  README gallery generation, and video publication only when captions accompany the MP4.
- `git diff --check` passed.

The capture-review tests use the real grocery parser and rendered component, with native
OCR, authentication, and local persistence mocked. They verify correction/selection before
writes, visible save failures, and no writes when all candidates are excluded. They do not
measure OCR accuracy or exercise device sync.

## Still requires device/media work

- Real screenshots and a captioned app recording.
- The offline restart, two-device reconnect, household join, and session-switch checks in
  `DEMO.md`, recorded against an exact TestFlight build.
- Public URL checks after the static-site changes deploy.

Postgres integration, migration, and generated iOS bundle checks were not run locally in
this pass; the existing GitHub CI jobs cover them. The new site CI job regenerates HTML,
checks links/metadata, and rejects stale generated text. It validates the sharing PNG's
size instead of comparing binary rendering across operating systems.
