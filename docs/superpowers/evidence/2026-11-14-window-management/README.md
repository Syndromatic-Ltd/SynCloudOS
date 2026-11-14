# Window redesign evidence

Framework baseline: webspring-folders/framework at 1bfc47e9. Site baseline: webspring-folders/site at 0472a7c
with the site checkout's installed Beta 2 SDK and existing local work.

- captures: 20 Chromium reference images from the framework specimens at 1280 × 850 and 390 × 844,
  light and dark. These are fixture captures.
- phase-1: eight captures of the content-border specimen replacing AppFrame, covering both key states.
- site: twelve baseline captures of About, Software and NSE Control Gallery.
- Chrome accepted temporary-profile PWA installation, but testing could not obtain a live
  window-controls-overlay rectangle. The overlap hypothesis is still open.

The browser fixture at http://127.0.0.1:5557/tests/e2e/fixtures/theme-additional/index.html?surface=stage-status-key
renders the Phase 1 specimen from the framework worktree. All seven existing Chromium window-management
and mobile tests passed after the changes. The frozen theme snapshots were left as the comparison reference.

The separate codex/window-transfer-spike worktree contains three passing Chromium tests. The third test
first reproduced Escape leaving a popover open in the child document. It passed with listeners bound
to the presenting document and realm-safe overlay origin checks. This is prototype evidence for shared
authority and document-local overlays. Production Webspring continuity and native detach remain to be tested.

The focused Phase 1 run passed 1,090 tests in 35 files. Framework and site typechecks passed. The first
full runtime run overlapped source changes and failed package integrity checks. A stable-source rerun
logs to .artifacts/window-redesign-baseline/runtime-phase-1-final.log.
