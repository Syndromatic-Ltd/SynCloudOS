# Open panel NSE/Atmo rebuild

**Goal:** Apply the owner's approved correction brief in the shared webspring-folders checkout.

**Architecture:** NSE owns control semantics; Atmo owns drawing. Keep Foundation byte contracts and all concurrent files intact. Use the existing sheet/window ownership and focus boundary, with compact geometry and paint matching NSEMenuOverlay's sheet. This is an inline execution of the supplied design; no new development branch or worktree.

- [x] Add tested NSEWorkspace icon lookup and NSEPathControl standard path items, URL, clicked item and action. Export through clean public entry files; defer any dirty SDK entry until its owner commits. Add counterpart mappings and API documentation.
- [x] Downsample the three supplied Cirrus folders with Sharp Lanczos3 at 24/48/96 points, 1x/2x. Preserve source hashes and explicit provisional ordinary-folder/generic-document slots. Reuse the Preferences arrow geometry as an Atmo resource; mirror it for forward.
- [x] Replace panel navigation, source icons and collection presentation; load file thumbnails with the existing image pipeline, keeping fallback artwork until ready and releasing owned resources on unmount/replacement. Remove custom button painting; retain small rounded Cancel/Open and texturedRounded System Chooser/navigation.
- [x] Present compact content as a bounded bottom sheet with dimming, shadow and the shared sheet motion. Keep Sources/collection navigation, centred title, leading Cancel/back, trailing Open and search under the bar. Retain desktop layout and capital source headings.
- [x] Run focused interaction and icon/path tests, TypeScript, architecture boundaries, SDK build/package/packed-consumer tests and the full framework suite. Record baseline/concurrent failures under the foundation evidence directory. Executed: focused and SDK checks pass; architecture and whole-suite failures remain and are enumerated in the report.
- [x] Commit only owned paths. Adopt the committed framework using the explicitly authorised detached scratch checkout and junction procedure; typecheck/test site, preserve others' adoption changes, commit only adoption outputs.
- [x] Capture Chromium light/dark desktop 1440x900 and phone 390x844 sources, collection, real thumbnails and comparison menu. Inspect screenshots and geometry, grep panel source, and write the evidence report. Final adoption captured at DPR 1 and 2, plus light/dark gallery push-button references; no page/console errors in those completed cases.

Evidence: screenshots in `docs/superpowers/evidence/2026-11-07-open-panel-ui/`; logs and asset provenance in `docs/superpowers/evidence/2026-11-07-foundation/`.
