# Phase 5 menu semantic visual references

Matrix: Chromium at DPR 1; desktop 1280 × 850 and phone 390 × 844; light/dark; Cumulus/Metal. Each combination has a closed menubar and an open Edit menu. See `receipt.json` for source provenance, rendered geometry, browser errors and image hashes.

| Viewport | Scheme | Material | Closed | Edit open |
| --- | --- | --- | --- | --- |
| Desktop | Light | Cumulus | [Closed](closed-desktop-light-cumulus.png) | [Open](open-desktop-light-cumulus.png) |
| Desktop | Light | Metal | [Closed](closed-desktop-light-metal.png) | [Open](open-desktop-light-metal.png) |
| Desktop | Dark | Cumulus | [Closed](closed-desktop-dark-cumulus.png) | [Open](open-desktop-dark-cumulus.png) |
| Desktop | Dark | Metal | [Closed](closed-desktop-dark-metal.png) | [Open](open-desktop-dark-metal.png) |
| Phone | Light | Cumulus | [Closed](closed-phone-light-cumulus.png) | [Open](open-phone-light-cumulus.png) |
| Phone | Light | Metal | [Closed](closed-phone-light-metal.png) | [Open](open-phone-light-metal.png) |
| Phone | Dark | Cumulus | [Closed](closed-phone-dark-cumulus.png) | [Open](open-phone-dark-cumulus.png) |
| Phone | Dark | Metal | [Closed](closed-phone-dark-metal.png) | [Open](open-phone-dark-metal.png) |

This is the actual `NSEMenuBar`, `NSEMenu`, menu overlay and menu-item renderer, mounted in the shared titlebar's menu slot inside `StandaloneControlHost`. The fixture supplies Window Lab/File/Edit/View menus and a bounded command-validation port. Undo is enabled and Redo is intentionally disabled; selecting commands records admission and does not execute an application operation.

These are current-source semantic fixture captures. They do not claim production `NSEApplication.mainMenu` ownership, application-menu population, person/gear toolbar-trigger behavior, compact host collapse, native menus or visual sign-off. The phone matrix deliberately exposes the full `NSEMenuBar` for inspection; the runtime host's compact presentation is a separate integration check. No app-icon menu trigger is present.

The companion Phase 4 `capture.mjs` produces these images using the `menu` query parameter on `tests/e2e/fixtures/window-titlebar-layout.html`. The same after-source stability condition applies to both receipts.

## Corrected Cumulus paint

The original eight Cumulus closed/open captures are retained as issue evidence: the menu occupied the top of a fixed-height glass band while the title row extended below it. The geometry-only correction in `WindowTitlebarView.css` makes the glass follow the actual title row. Eight [corrected captures](cumulus-paint-fix/receipt.json) in `cumulus-paint-fix` cover desktop/phone, light/dark and closed/Edit-open states. Their receipt also records the settled menu bounds and item labels. Metal was not changed or recaptured for this correction.
