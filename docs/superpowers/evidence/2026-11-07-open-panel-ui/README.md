# Open panel NSE / Atmo rebuild

The panel now composes NSE push, tool, segmented, search, outline, collection, image and path controls. Cancel and Open retain Atmo's small rounded push drawing; Open has the Return equivalent and Cancel has Escape. System Chooser uses the glossy texturedRounded tool bezel. No panel CSS repaints those buttons.

## Commits and scope

Framework implementation commits:

- `5b86c6b` — standard path control and workspace artwork lookup, exports, mappings, documentation and tests.
- `eef4ed8` — panel control composition, image decoding, source artwork and compact popup presentation.
- `e2ef0f2` — packaged consumer coverage and neighbouring source licence headers.
- `9d681d8` — bounded compact sheet and path cell geometry.
- `6bc7eb1` — full-density collection artwork.
- `118f7ba` — Return/Escape key equivalence and panel cancellation coverage.
- `457982c` — bridge lifetime, visible path focus, URL roots, asset integration and compact label/inset corrections.
- `a51bbf3` — installed-consumer test timeout, confirmed by an independent installed run.
- `35b91dc` — MIME-based image detection, including image files without extensions.
- `36a5705` and `772d20b` — provider image URLs/readable native references, with cell-owned cancellation.

Site adoption commits: `ce55b37` initially adopted `35b91dc`; `3839d10` adopts the final clean `c4f9adf` snapshot, including all subsequent provider-image changes and the other agents' committed framework work. The archive SHA-256 is `1efd58d8cf08ba3c2ea09f7aad078a0f98a6a0dd1124229fc06e67ae2d72b22f`. Framework commits after this snapshot contain evidence/documentation only, so no runtime update was omitted. The site remains on `prerelease`.

Work remained on the existing `fix/blind-rewrite-friction` branch in the named webspring-folders framework worktree. Only explicitly owned paths were staged. The detached temporary checkouts were used exclusively for the authorised adoption/validation procedure; their node_modules junctions were deleted before checkout removal. No push was performed. Foundation byte/result files, Page, PreferencesToast and the concurrent site header/About source files were not edited by this task.

## Public APIs

See [path-control-and-workspace.md](../../../framework/path-control-and-workspace.md).

- `NSEPathControl`: `url`, explicit `pathItems`, `pathStyle="standard"`, `isEnabled`, `action`/`actionPayload`, and `onAction(sender)`. A ref supplies `url`, `pathItems` and `clickedPathItem`. Explicit items support real browser directory handles without fabricated OS paths. URL-derived paths include an actionable root.
- `NSEPathControlItem({ title, image?, url? })`: the component of a path, corresponding to NSPathControlItem.
- `NSEWorkspace.shared.icon(contentType, size?, scale?)`: the NSWorkspace `icon(for: UTType)` lookup, accepting UTI or MIME content types.
- `NSEWorkspace.shared.iconForFile(pathOrMetadata, size?, scale?)`: the `icon(forFile:)` lookup. A path ending in a slash or `{ name, kind: "directory" }` denotes a directory. Both lookups return image-source strings accepted by NSEImageView. Size is 24/48/96 points; scale is 1/2. These are artwork lookups, with no ambient file-system access.

The APIs are exported from `nse` and `nse/controls`; counterparts are registered in `docs/framework/appkit-counterparts.json`.

## Artwork and remaining inventions

Documents, Downloads and Music use `DocumentsSyn.png`, `DownloadsSyn.png` and `musicSyn.png` from `E:\Cirrus Icons\Folders`. Sharp Lanczos3 produced 24/48/96-point PNG representations at 1x/2x. Source/output SHA-256 values and the reproducible resizing script are in `../2026-11-07-foundation/open-ui-assets.json` and `open-ui-assets.mjs`. Collection cells use the 192-pixel representation for their 64/72-point boxes.

Two semantic artwork slots await the owner's art:

- `src/NSE/Themes/Atmo/Resources/workspace/folder-ordinary-*` — ordinary folders; provisionally Documents art.
- `src/NSE/Themes/Atmo/Resources/workspace/document-generic-*` — the single generic-document family, with size/density variants; also provisionally Documents art. This is an explicit temporary fallback, not newly drawn document artwork. Replace the PNGs at these paths without changing runtime code.

Application Support uses the supplied Documents art. Source media folders and Add Folder use the ordinary-folder fallback. Permission state is conveyed by the text “Access required”; no replacement lock illustration was drawn.

The necessary new drawing is Atmo's standard path-control bezel and cell/focus recipe, because NSE had no NSPathControl. The compact Open sheet adds bounded height and a bottom-edge continuation to the existing menu frame. Both are implementations of the requested controls/presentation. The back image externalises the existing NSEPreferencesToast BackArrow geometry; forward mirrors that same image. There are no new chevron drawings or folder/document vectors.

## Browser evidence

Chromium: desktop 1440x900, phone 390x844, light/dark, DPR 1 and 2. Both final runs capture the adopted `c4f9adf` snapshot. Top-level screenshots are CSS-sized; `dpr-2/` repeats the capture with deviceScaleFactor 2, also saved at CSS size. Browser results record the actual DPR, image dimensions, controls, physical bounds and adopted archive receipt. Logs: `open-ui-browser-c4-ready.log` and `open-ui-browser-c4-dpr2.log`, both exit 0.

For each colour scheme:

- `desktop-*-sheet.png`, `desktop-*-collection.png`, `desktop-*-thumbnails.png`.
- `phone-*-sources.png`, `phone-*-collection.png`, `phone-*-thumbnails.png`.
- `phone-*-menu-sheet.png` and `phone-*-comparison.png` show the real NSEMenuOverlay sheet beside the Open sheet.
- `gallery/desktop-*-gallery-buttons.png` shows the gallery's actual push-button specimen in both colour schemes. JSON records the default rounded medium and affirmative drawing. The panel uses the same NSEButton/Atmo recipes at `controlSize="small"`; the gallery's regular buttons are 52px high.

The phone Open surface is x=8, y=204, width=374, height=640, bottom=844. The comparison menu ends at 836, retaining its 8px bottom gap. Both use rgba(0,0,0,0.26) dimming, the same plate gradient, and `drop-shadow(rgba(0,0,0,0.42) 0px 10px 18px)`. Three actual OPFS PNGs decode through the mounted ImageFX client in every case; their natural dimensions and blob URLs are recorded. Folder icons were checked for successful image loading. All eight browser cases have zero page and console errors.

The screenshots were visually inspected. Phone cases launch the real gallery at desktop width and then resize before opening the panel. A separate cold-phone attempt captured Sources, collection and thumbnails, but its later gallery-menu navigation failed; that partial run is in `cold-phone/` and is not a passing full journey. Earlier attempts also encountered a local-auth timeout and overlapping gallery search pointer rows. The final harness uses the actual outline's keyboard navigation and a fresh page for the comparison menu, without editing/intercepting gallery source or forcing DOM clicks. The final eight cases and both gallery references have zero page/console errors. Captures use reduced motion and do not establish human/device motion acceptance; sheet motion is provided by the reused NSEPopup presentation.

## Source grep

Command:

```text
rg -n '<button|‹|›|<svg|appearance="aqua"' -- 'src/NSE/FilePanels/NSEOpenPanelContent.tsx' 'src/NSE/FilePanels/NSEOpenPanelSources.tsx' 'src/NSE/FilePanels/NSEOpenPanelCollection.tsx' 'src/NSE/FilePanels/NSEOpenPanelItemImage.tsx' 'src/NSE/FilePanels/NSEFilePanelView.tsx'
exit: 1
No matches.
```

The full command/result is `../2026-11-07-foundation/open-ui-grep.txt`. Artwork SVG exists only as the external, reused arrow resource; panel views contain no inline SVG.

## Confirmed validation

- Final scoped controls: 8 files / 36 tests passed (`open-ui-controls-final.log`). The subsequent reference-union guard passed TypeScript and the 13 image/panel interaction tests (`open-ui-provider-image-green.log`).
- Clean installed SDK tests at `772d20b`: 2 files / 10 tests passed, including `synapp-sdk-package.test.ts` and `nse-file-browser-packed.test.ts` (`open-ui-delivery-sdk/sdk-consumers.log`). Its cleanup receipt confirms the junction was deleted, the main Vitest survived and the temporary checkout was removed. Earlier independent installed path/workspace coverage also passed (`open-ui-packed-consumer.log`). The committed test has a 120-second allowance for installation.
- Read-only follow-up review: lifetime, URL roots, all 30 Vite artwork URLs, and visible path focus in light/dark at DPR 1/2 passed (`open-ui-review.md`).
- Clean framework TypeScript and SDK builds passed in the authorised adoption checkouts. Site TypeScript passed on the reviewed adoption.
- Architecture boundaries still fail with `configured alias @syndromatic/syncloudos/nse/cover-flow replacement escapes or is absent`; this was recorded before the final changes and remains outside the owned files.
- Site checks against the final `c4f9adf` adoption: TypeScript passed; 59 test files passed / 2 failed, 398 tests passed / 3 failed (401). Failures are the gallery window-state assertion and two Publisher anchor-replacement assertions (`open-ui-final-source-validation/site-vitest.log`).
- Final whole-framework run at `c4f9adf`: 863 files passed / 10 failed, 7,269 tests passed / 13 failed (7,282), exit 1. Six 120-second installed-consumer timeouts: managed typography, file browser, Chronosphere, LuminaFX, MediaFX and VideoFX capture. The new file-browser consumer therefore passes in the isolated clean 10-test run but times out in this full run. Remaining failures: developer MCP `afterEach` cleanup hook timeout (1), Inspector production graph build/loaders (2), stale generated manifest validator (1), and custom text consumer rejecting the Foundation entry (3). The log also records a browser-global-boundary worker-termination timeout. These are reported as failures without assuming that every timeout is unrelated to this task. See `open-ui-final-source-validation/frozen-framework-vitest.log`.
- The earlier completed whole-framework run at `35b91dc`: 870 files passed / 3 failed, 7,274 tests passed / 6 failed (7,280). Failures: Inspector production graph (2), generated manifest validator (1), and custom text packed-consumer source boundary (3). This precedes the final provider-reference changes; it is not presented as final-source full-suite acceptance.

The final adoption/validation cleanup receipt (`open-ui-final-source-validation/site-adoption.json`) records successful adoption, both typechecks, both failing full suites, junction deletion, survival of the framework's Vitest executable, and removal of the temporary checkout. No owned temporary checkout remains.

All command logs, including the initial concurrent byte-migration errors and unsuccessful/interrupted attempts, are retained under `../2026-11-07-foundation/` with the `open-ui-` prefix. Full-suite and final adoption receipts are recorded there separately; a focused pass is not a whole-suite pass.

Preview: [http://127.0.0.1:5199/__dev/login?to=%2F__syncloudos%2Fnse-gallery](http://127.0.0.1:5199/__dev/login?to=%2F__syncloudos%2Fnse-gallery), served from the named sibling `webspring-folders/site` checkout with an isolated Vite dependency cache. The preview launcher and logs are in the foundation evidence directory. Ports 5173 and 5387 were preserved; 5210 had no listener.
