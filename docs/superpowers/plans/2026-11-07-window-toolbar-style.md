# Window toolbar style implementation

The owner-approved scope is audit decision 3 (2026-11-07), Main.dc.html, Phone.dc.html and Prefs.dc.html. The rejected ContentPlate board has no authority. Work stays in the supplied framework/site worktrees; only the separately authorised detached adoption checkout is temporary.

- [x] Trace title propagation, existing subtitle/accessory APIs and compact More state.
- [x] Test `NSEWindow.toolbarStyle` before implementation; preserve the existing subtitle and accessory APIs.
- [x] Draw the expanded window title outside scroll content, with the root split providing its main-pane slot. Keep the sidebar and its section headers unchanged.
- [x] Move the Preferences cap's plate into Atmo, retain title/pane presence and use a leading titlebar accessory.
- [x] Present compact More's localised title internally; restore the app's latest title on close, hiding, unmount and wide layouts.
- [x] Remove NSEPageHeader and its exports, registry entry, counterpart and CSS; migrate gallery callers to window titles and ordinary secondary-colour text fields.
- [x] Verify focused tests, SDK exports, typecheck and a full framework test run; commit explicit owned paths.
- [x] Adopt the committed SDK through the specified detached checkout and junction lifecycle; typecheck and run the site suite.
- [x] Compare Chromium gallery/Preferences captures at 1440×900 and 390×844 in light/dark against the boards; verify Software/gallery More and return paths.
- [x] Record final commits, tests, limitations, screenshots and read-only Fusion search in the evidence report; mark the audit decision landed.

The final evidence inventory also covers expanded-title position while scrolling, duplicate-title absence, subtitle case, Preferences push/Back/Escape, More-to-overflow-detail, compact-to-wide resize, retained hidden hierarchies and screenshot bounds. Human visual acceptance remains the owner's review.

Results and limitations are recorded in [the evidence report](../evidence/2026-11-07-page-header/REPORT.md). Full-suite execution is complete; the repository-wide suites remain red as reported there.
