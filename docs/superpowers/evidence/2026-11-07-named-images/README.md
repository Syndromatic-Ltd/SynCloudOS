# Named navigation images — 7 November 2026

Implementation and adoption are committed on the existing framework `fix/blind-rewrite-friction`
and site `prerelease` branches. No branch switch or push was performed. The only temporary
checkout was the explicitly authorised detached site-adoption checkout. Both unrelated dirty
`JournalWindowController.ts` files remain untouched and unstaged.

## Commits

Framework:

- `d39c1a8` — allow the Foundation base layer in the custom text consumer; make generated helper paths independent of a dependency junction.
- `cde04ac` — retry a pending navigation-chrome claim after the occupying container releases it.
- `74529ed` — named Atmo images, control rendering, navigation adoption, mappings, documentation and tests.
- `1765319` — normalise new source line endings and retain the empty-image-cell behaviour.
- `d7e1b82` — resolve the artwork catalogue only on lookup, preserving unrelated classic-script view imports.
- `ddc2f8b` — link the new guide from the framework documentation index. The later index/evidence commits contain no runtime changes; the site retains the final runtime snapshot `d7e1b829`.

Site:

- `ea85d46` — gallery chrome, Journal/Publisher images, unused locale removal and gallery ownership assertions.
- `0c00bc5` — initial clean `17653194` adoption, superseded by the next adoption.
- `c03f6c7` — final clean framework snapshot `d7e1b829156909ed478ccc3f303724d0887fb78f`.

Archive SHA-256: `8584ad2daa782b4d63fd3b59e1cb5be39ad87839a755582229621fa459691ebb`.
The SDK package version remains `1.0.0-beta.2`.

## Named-image API

`NSEImage` is exported from `@syndromatic/syncloudos/nse` and `/nse/controls`.
It corresponds to `NSImage`, with `NSEImage.named(name)` corresponding to `NSImage(named:)`.
The lookup returns a shared immutable image, or `null` for an unknown name.

- `NSEImage.goBackTemplateName`: `NSGoBackTemplate` (`NSImage.Name`).
- `NSEImage.goForwardTemplateName`: `NSGoForwardTemplate` (`NSImage.Name`).
- Named instances expose `name`, `src`, `size` and `isTemplate`.
- `NSEButton.image` and `NSESegmentedItem.image` accept these images as well as existing URLs and React elements.
- Template drawing masks the image with `currentColor`, inheriting the control's content colour and disabled treatment.
- Atmo owns two distinct assets. Both are 17 × 17 point images in a 24-point view box. Back retains the Preferences path `M15 4 L7 12 L15 20`, round joins/caps and 3-point stroke. Forward has its own path and asset. The CSS reflection is removed.

See [the API documentation](../../../framework/named-images.md) and
[the counterpart map](../../../framework/appkit-counterparts.json). The map includes the class,
lookup and both constant names. Tests cover the lookup, identity, unknown names, forward artwork,
tint, accessible names, disabled segments, mappings and independently installed exports.

## Call sites and sweep

Line numbers refer to the committed source. Framework paths are relative to `framework/`;
site paths are relative to `site/`.

| Repository | File:line | Change |
| --- | --- | --- |
| Framework | `src/Webspring/ApplicationStageView.tsx:302` and `:334` | Both stage titlebar branches use the same internal `ApplicationNavigationBackButton`; the private inline SVG is deleted. |
| Framework | `src/Webspring/ApplicationNavigationBackButton.tsx:30` | Real texturedRounded NSEButton, named back image, imageOnly and accessible label. |
| Framework | `src/NSE/Components/NSEPreferencesToast.tsx:317` | Preferences back uses the named image. |
| Framework | `src/NSE/Components/NSEPreferencesToast.tsx:357` | The row's typed forward chevron uses the named forward template. |
| Framework | `src/NSE/FilePanels/NSEOpenPanelContent.tsx:176` | Phone Sources/Back uses the named back image. |
| Framework | `src/NSE/FilePanels/NSEOpenPanelContent.tsx:189` and `:190` | History segments use distinct named back and forward images. The direct Atmo URL and CSS mirror are removed. |
| Framework | `src/NSE/Chronosphere/ChronosphereStage.tsx:602` and `:606` | Significant-change navigation composes real texturedRounded NSEButtons and named images. The private 3D SVG `ChronosphereArrow.tsx` is deleted; button drawing belongs to Atmo. This deliberately replaces the old sculpted navigation art. |
| Site | `src/SynWare/NSEControlGallery.app/Contents/GalleryViews.tsx:105` | Replaces the typed Sections accessory with a stage-chrome registration. |
| Site | `src/SynWare/Journal.app/Contents/components/JournalPhoneChrome.tsx:29` | Replaces the private inline back SVG with the back template. |
| Site | `src/SynWare/Journal.app/Contents/components/NoteList.tsx:45` | QuickSwitch title composes a small NSEButton with the forward template. |
| Site | `src/SynWare/JournalOld.app/Contents/components/NoteList.tsx:45` | The retained Journal application's QuickSwitch title uses the same control and template. |
| Site | `src/SynWare/JournalPublisher.app/Contents/PublisherSheets.tsx:182` and `:183` | Find Previous/Next use named images with accessible titles, replacing typed glyphs. |

All 20 gallery locale files contained unused `imaging.swipePrev` entries (originally line 221).
The sweep also found the unused matching `imaging.swipeNext` entries (originally line 222).
Neither key had a source consumer. Both keys are deleted from every locale: Base, de-DE, en-GB,
es-ES, fr-FR, hi-IN, id-ID, it-IT, ja-JP, ko-KR, mr-IN, nl-NL, pl-PL, pt-PT, ru-RU,
ta-IN, tr-TR, vi-VN, zh-Hans and zh-TW. Each path is
`src/SynWare/NSEControlGallery.app/Contents/Resources/Localised/<locale>.locale/Localisable.strings:221`.
[locale-removals.json](locale-removals.json) lists every exact original file and line for both keys.

The final text/AST sweep is recorded in `../2026-11-07-foundation/named-images-sweep.json`.
It finds no remaining arrow-glyph button titles or labels. Four suffix matches are Russian
quotation marks around actual quoted words; they remain prose. The retained inline SVG inventory
contains artwork such as colour/font modes, paragraph/flip diagrams, window/popover framing,
folder geometry, checkmarks and app illustrations, rather than private navigation chevrons.
Atmo's own CSS and intrinsic control disclosure drawings remain appearance-owned resources.

## Gallery ownership

The gallery uses the already-public `useNSEApplicationNavigationChrome` hook. Its compact detail
state provides `{ title, back: { label: "Sections", onActivate: browse } }`; browsing and searching
release the claim. `useNSEControllerNavigationChrome` is an internal default-renderer helper,
so no new app API was exposed. The stage draws its standard circular texturedRounded,
image-only button and supplies the accessible name `Sections`. The titlebar accessory is removed.

Browser work exposed a shared claim handover bug: a default split could claim chrome during its
first layout, before its sidebar collapsed. The rejected custom claim was never retried after
that split released the slot. The hook now subscribes while waiting, acquires released chrome
with the latest pending state, and unsubscribes before releasing on unmount. A regression test
fails before this fix and passes after it. Browser Back returns to the category outline at 390 × 844.

## Failure root causes

**Custom text consumer (three recorded failures):** the application import allow-list omitted
`foundation`. The actual TextSystem example now imports `NSEData` from that public base-layer
entry, so source preparation rejected it as nonpublic before installation. `foundation` now belongs
to the application/public entry lists used by the source boundary and installed graph checks.
A positive Foundation import and a negative private Foundation subpath are covered; the existing
host-only browser/bootstrap restrictions remain. All preparation tests now pass.

**Generated manifest validator:** the check already passed in the active checkout. The historical
failure occurred in a junction-backed detached checkout: helper comment labels were computed relative
to that checkout's lexical `node_modules` path while Node resolved the helpers to the shared physical
dependency directory. The generated text therefore acquired checkout-dependent relative paths.
The generator now resolves the dependency root before calculating those labels. Regeneration
produced no change to the current checked-in validator. `--check` passed in the authorised detached
checkout with its junction, confirming the fix without a spurious generated-code update.

**Regression caught during the first broad attempt:** eager catalogue construction resolved both
Atmo URLs when an unrelated NSE view was imported. Classic-script drawing fixtures have no ESM
`import.meta.url` base, so the new top-level lookup prevented their startup. Artwork resolution is
now lazy. The existing real-browser drawing tests pass at DPR 1 and 2, and the four named-image tests
also pass (2 files / 6 tests). The prematurely started broad run was interrupted; its log is retained
as `named-images-framework-interrupted.log`. It also observed a WebKit document-asset reload failure;
that observation is not asserted to be a pre-existing failure. The fresh completed whole-suite run followed the
final repair and installed-package checks; its document-asset cases passed.

Inspector bundling, the cover-flow alias and Publisher anchor behaviour were not modified.

## Screenshots and visual inspection

All final screenshots are in this directory. Files containing `failure` and the early unnumbered exploratory captures are retained unsuccessful/provisional attempts; they are excluded from the acceptance matrix below. `screenshot-manifest.json` records the non-failure image hashes. Prefixes `before-` and `after-`, schemes `light` and
`dark`, and suffixes `dpr1` and `dpr2` pair the same journeys. Captures are CSS-sized; the results
JSON records the actual browser DPR. Full views and `-control.png` crops include:

- `stage-<scheme>-dpr<density>` — actual stage back, reached through gallery section search.
- `preferences-<scheme>-dpr<density>` — Appearance pane back.
- `open-history-<scheme>-dpr<density>` — enabled back/disabled forward.
- `open-history-forward-enabled-<scheme>-dpr<density>` — disabled back/enabled forward.
- `open-phone-<scheme>-dpr<density>` — Sources back at 390 × 844.

`comparison.json` records identical bounds for all 16 paired controls (four controls × two schemes
× two DPRs). Stage, Preferences and phone crops show at most tiny raster differences; history
retains its geometry while the disabled arrow now follows the control's content tint instead of
remaining an untinted white image. Captures and bounds were visually inspected. Back/forward,
return-to-Sources, Preferences dismissal and gallery return-to-outline were exercised. All final
cases report zero page errors. Reduced-motion Chromium captures do not establish human/device
motion or physical-GPU acceptance.

`gallery-software-light-comparison.png` and `gallery-software-dark-comparison.png` place the
390 × 844 gallery beside the actual Software More → MediaSonic screen. **Limitation:** that Software
route exposes no back control in this checkout, before or after adoption, so these captures cannot
prove a match against an existing Software back button. Its adaptive overflow renderer does not
supply an application-chrome owner. That separate behaviour was not invented or silently repaired
for this comparison. The named stage button itself is proved by the actual before/after captures.

Supplementary Journal phone/nested and desktop captures record the adopted controls; they also
include the other session's retained window-controller edits and are not isolated proof of those
unrelated edits. The compact count controls use the small band; expanded-arrow CSS targets the
framework image slot directly. Both schemes show a 24px desktop count band and a named phone back;
the expanded QuickSwitch image rotates by 90 degrees in both schemes (`journal-expanded-results.json`).

## Verification

- Framework `npx tsc -b --pretty false`: passed, including the clean adoption build.
- Site `npx tsc -b`: passed on the installed snapshot.
- Focused framework controls/chrome/panels/Chronosphere/mappings: 13 files, 99 tests passed.
- Final `npm run sdk:build`: passed.
- SDK/package/packed consumers before the lazy-only correction: 5 files, 29 tests passed, including `synapp-sdk-package`, named image/path installed consumer, Foundation packed consumer, custom text preparation and manifest freshness.
- Final delivery snapshot: the affected real-browser drawing and named-image files passed (6 tests); independently installed `synapp-sdk-package` and named-image/path consumer passed (2 files / 10 tests). The final SDK build and both typechecks passed again. All four core after-capture cases were refreshed against receipt `d7e1b829`.
- Architecture boundaries: failed on the pre-existing cover-flow alias (`configured alias @syndromatic/syncloudos/nse/cover-flow replacement escapes or is absent`).
- Final site suite: 59 files passed, 2 failed; 398 tests passed, 3 failed (401). The same recorded failures remain: one gallery owned-window-state assertion and two Publisher anchor-replacement assertions. Gallery tests were updated for controller browse state and removal of the former accessory; browser evidence verifies the actual stage button.
- The initial site validation caught two introduced duplicate imports in Journal/JournalOld; these were fixed before the final passing typecheck and final site suite. The initial run also contained two stale accessory assertions, updated as above. The unsuccessful and final logs are retained separately.
- Completed whole-framework suite at the final runtime snapshot: **872 files passed / 2 failed (874), 7,286 tests passed / 3 failed (7,289)**, exit 1, 788.83 seconds. Failures: the two pre-existing Inspector bundling assertions, and one introduced documentation-index assertion (the new guide was not linked). The missing index link was then corrected in `ddc2f8b`; its focused file passed all four tests (`named-images-doc-links-final.log`). The full suite was not rerun after that documentation-only correction. The two Inspector failures remain; the completed full-run result is still reported as 3 failures.
- The final full run includes passing Foundation/custom-text preparation, manifest freshness, installed consumers, browser drawing and document-asset cases. The earlier interrupted run and its observed failures remain separately recorded; it is not counted as a passing/completed run.

Logs and harnesses use the `named-images-` prefix in `../2026-11-07-foundation/`.

## Adoption and preview

The final clean detached checkout was pinned to `d7e1b829`. Its `node_modules` junction was removed
with `(Get-Item <scratch>\node_modules).Delete()` first; the main framework Vitest executable
was verified to survive. Git then hit Windows' filename-length limit while removing the checkout,
removing its registration but leaving the residual source/artifact directory. A long-path Git retry
confirmed it was no longer a registered worktree.

**Cleanup limitation:** automatic approval review rejected both guarded native PowerShell recursive
cleanup attempts with `blocked by policy`, without another stated reason. The dependency junction
is gone, the framework dependencies survived, and the residual directory remains at
`C:\Users\Kavish Krishnakumar\AppData\Local\Temp\syncloudos-named-images-final-9662639db0e54e108eedd0af0e22b5d1`.
The first adoption checkout was fully removed. Both receipts and cleanup attempt logs are retained
under `../2026-11-07-foundation/named-images-adoption*.json` and `named-images-checkout-cleanup*.log`.

Preview: <http://127.0.0.1:5199/__dev/login?to=%2F__syncloudos%2Fnse-gallery>, from the named sibling
`webspring-folders/site` checkout. Only the process on 5199 was restarted. The original 5173 and
5387 listener PIDs remain 72912 and 69072; 5210 had no listener. The local preview configuration is
unstaged. Fusion was not inspected or modified.
