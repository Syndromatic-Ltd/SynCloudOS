# Open panel review

Read-only review of owned files, followed by focused corrections at `457982c`.

- React batching reproduction: `await present(); await dismiss(id)` now returns `closed` for both compact application and window-sheet bridges. No delegated dismissal, no retained dialog, one close notification.
- Chromium CSS harness, light/dark and DPR 1/2: path cells match `:focus-visible`, with solid 2px rgb(67, 142, 223) outline, -2px offset and rgba(255,255,255,0.2) background. Cell height is 26px. This is a focused control harness, separate from the site's full rendered acceptance screenshots.
- `file:///` and `https://example.test/` have actionable root items, returning the original URL.
- In-memory Vite production build transformed all 30 workspace artwork URLs and retained no unresolved source paths. Installed-site asset verification remains a separate browser/package check.
- No further blocking resource, accessibility or architecture finding in the bounded follow-up.

The review did not modify files. Regression tests for lifetime, special-key equivalents and URL roots are committed alongside the fixes. `open-ui-controls-reviewed.log`: 8 files / 34 tests passed.
