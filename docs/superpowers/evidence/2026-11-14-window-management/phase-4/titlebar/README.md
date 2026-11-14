# Phase 4 titlebar visual references

Matrix: Chromium at DPR 1; desktop 1280 × 850 and phone 390 × 844; light/dark; Cumulus/Metal. Images are full viewport captures with reduced motion and hidden caret. `receipt.json` records the source roots, revisions, dirty state, source hashes, browser version, exact URLs, rendered bounds and image hashes.

| Viewport | Scheme | Material | Before | After |
| --- | --- | --- | --- | --- |
| Desktop | Light | Cumulus | [Before](before-desktop-light-cumulus.png) | [After](after-desktop-light-cumulus.png) |
| Desktop | Light | Metal | [Before](before-desktop-light-metal.png) | [After](after-desktop-light-metal.png) |
| Desktop | Dark | Cumulus | [Before](before-desktop-dark-cumulus.png) | [After](after-desktop-dark-cumulus.png) |
| Desktop | Dark | Metal | [Before](before-desktop-dark-metal.png) | [After](after-desktop-dark-metal.png) |
| Phone | Light | Cumulus | [Before](before-phone-light-cumulus.png) | [After](after-phone-light-cumulus.png) |
| Phone | Light | Metal | [Before](before-phone-light-metal.png) | [After](after-phone-light-metal.png) |
| Phone | Dark | Cumulus | [Before](before-phone-dark-cumulus.png) | [After](after-phone-dark-cumulus.png) |
| Phone | Dark | Metal | [Before](before-phone-dark-metal.png) | [After](after-phone-dark-metal.png) |

## Provenance and comparison limits

Before uses the existing `theme-baseline` TopBar catalogue in the `window-transfer-spike/framework` checkout at `1bfc47e9111270069b9f3e99a940e5fd4b231ebb`. Its tracked focus/overlay prototype edits are recorded; its titlebar, toolbar, theme and catalogue files are unchanged. The catalogue presents the old `TopBar` with the Documents title, Home and Settings controls.

Only outer catalogue framing is normalized in the capture browser: 20px margin, zero padding, responsive viewport-minus-40px width and a relative containing block. The original catalogue uses an 800px fixed content width with 80px margin and 48px padding. This framing adjustment avoids treating catalogue clipping as a phone implementation defect; it does not modify legacy source or control CSS.

After uses `tests/e2e/fixtures/window-titlebar-layout.html` in the production framework checkout. It renders the new shared titlebar with a long document title/subtitle, plain fixture Close/Leading/Trailing controls, eight configured toolbar commands and a bottom accessory. Its configured toolbar uses the real `ToolbarView` allocation/overflow renderer; admission requests are recorded without executing application commands.

The two scenes differ in content, controls and composition. These captures therefore establish source-backed visual references, **not pixel-equivalence pairs**, production stage continuity, an installed window-controls-overlay test or human visual approval. Toolbar/accessory height and overflow can be assessed in the after fixture, but there is no equivalent configured toolbar in the before catalogue. The existing frozen theme snapshots were not changed.

The receipt's `sourceStableDuringCapture` must be true before treating this matrix as one consistent after revision. A false value means relevant files changed while screenshots were being captured and requires another run.

## Cumulus paint correction

The initial captures remain unchanged as issue evidence. They revealed that the glass band used a fixed root-relative height: a menu above the title moved content outside that paint. `WindowTitlebarView.css` now anchors attached Cumulus glass and shadow to the actual title-row grid cell, with no palette changes.

[`cumulus-paint-fix/receipt.json`](cumulus-paint-fix/receipt.json) and four images in that directory record the corrected desktop/phone, light/dark titlebars. The corresponding menu recaptures are under Phase 5's `menu/cumulus-paint-fix`. Measured browser tests passed with and without the menu at DPR 1 and 2; the full titlebar geometry matrix passed 34 tests. Subjective appearance and the light bottom-accessory band in dark mode remain for visual review.

## Reproduction

From the production framework root, start `baseline-server.mjs` with Node. It serves the named baseline checkout on port 5422 and puts only its Vite cache in the production checkout's ignored artifacts directory. Serve the current dedicated titlebar fixture on port 5418 with `tests/e2e/window-titlebar-layout.vite.config.ts`, then run `capture.mjs` with Node. Both ports must be free or already owned by those exact servers.
