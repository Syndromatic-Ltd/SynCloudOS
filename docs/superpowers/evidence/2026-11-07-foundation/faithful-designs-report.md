# Faithful Foundation designs and About adoption

2026-11-07. Scope: Foundation's date, decimal, transformer and undo designs; NSE scroll/image access; About's adoption. This report supersedes the earlier Part A deferral for these four public designs. The concurrent Authorization/PolicyKit, PWA and FX implementations are not attributed to this task.

## Delivered public API

| Public contract | Apple counterpart and behaviour |
| --- | --- |
| `NSEDateFormatter` | NSDateFormatter: mutable date/time styles, explicit format, locale, time zone and calendar; `string(date)` and `date(text)` on Intl. |
| `NSEDecimalNumber` | NSDecimalNumber: immutable decimal coefficient/exponent arithmetic, comparison, serialisation and rounding. |
| `NSEDecimalNumberHandler` / `NSEDecimalNumberBehaviors` | NSDecimalNumberHandler/Behaviors: scale, plain/down/up/bankers rounding and arithmetic exception policies. |
| `NSEValueTransformer` | NSValueTransformer: subclass transformations, named registration/replacement/removal, reverse-transformation policy and standard boolean/nil transformers. |
| `NSEUndoManager` | NSUndoManager: target/handler inverse registration, nested explicit groups, action names, undo/redo state, history levels and target removal. |
| `NSEScrollViewHandle.contentView` | NSClipView: physical viewport `element`, document-coordinate `bounds`, bounds-change observation and `postsBoundsChangedNotifications`. |
| `NSEScrollViewHandle.documentVisibleRect` | NSScrollView's currently visible document rectangle. |
| `NSEImageViewHandle.layer` with `wantsLayer` | NSView's backing layer: lazy acquisition before parent appearance and release on actual detach, backing-policy or animation-client replacement. Same-turn StrictMode reconnect retains the backing. |

The classes and their supporting types are exported through the Foundation SDK entry, with catalogue entries in `appkit-counterparts.json`. [Foundation guide](../../../framework/foundation.md) and [view-access guide](../../../framework/view-access.md) describe the contracts and examples. Foundation imports nothing upward and remains worker-safe. Existing byte contracts continue to use `NSEData`; no public byte API was renamed.

The internal DateFormatter, DecimalValue and closure ValueTransformer predecessors were removed and their users migrated. ChangeSet and SelectionModel remain private controller implementation models, with no invented public Foundation class. The previous runtime undo history implementation was extracted into Foundation's shared `internal/UndoHistory`; the runtime adapter uses that engine and retains identity, responder routing, partitions, reservations, asynchronous compensation and revocable app leases. NSE controls and mounted histories derive their narrow registration capability from Foundation. The raw manager does not replace an app's mounted lease.

These are bounded JavaScript bridges. Date style parsing supports Gregorian calendars, while Intl formatting supports its calendars; explicit formats support `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss` and quoted literals. Unsupported parsing calendars/tokens reject explicitly. Short-style two-digit years resolve within 2000–2099. Decimal representation is bounded to 38 significant digits and exponents −128…127. Foundation undo groups are explicit and synchronous; throwing handlers can leave a partially changed model and do not acquire the runtime adapter's compensation guarantees. Archive transformers and Objective-C dynamic class lookup are absent. Full semantics and limits are in [values report](faithful-values-report.md), [undo report](faithful-undo-report.md) and [independent review](faithful-review.md).

## About implementation and live verification

Site commit `2611d74` moves AboutPane to the real `NSEScrollView` and `NSEImageView`. Particle scatter reads `documentVisibleRect.y`; formation uses `contentView.element`. Native bounds-change notifications nudge the particle renderer and disconnect on ref replacement/unmount. Artwork uses the image view's backing layer with the existing art entrance recipe. The stationary artwork anchor, authored layout, imagery and shared animation system are preserved.

No control was invented. No raw button, typed arrow, private system-art copy or new label was added. The added CSS adapts the existing decorative composition to the shared scroll frame and transparent image view.

Evidence is compared with `../2026-11-07-about-repair` and the raw-element baseline captured before adoption. Six paired desktop/phone stills cover Company, Framework and Team at 1440×900 and 390×844, DPR 1. All measured pane, artwork, image, hero and viewport rectangles and scroll heights match the baseline exactly. Additional captures cover desktop DPR 2, scroll position 650, rapid tab changes and reduced motion. Browser reports contain no page/console errors.

The controlled sequences contain 20 standard-motion and nine reduced-motion samples. Against the same-SDK raw-element A/B run, reduced-motion pane/artwork geometry and opacity match exactly. Standard-motion maximum artwork differences are x 0.077759, y 0.165848, width 0.155457 and height 0.155472 CSS pixels, with opacity difference 0.004925. Pane x matches; pane opacity differs by at most 0.010379. All 12 native animation recipes match after excluding invocation timestamps. Both original and migrated artwork use the frame-driven spring, so zero native artwork effects is not a missing animation.

The six still pairs and motion sheets were visually inspected; no composition or trajectory regression was found. Random particle/floor phases differ. These captures do not establish identical scene pixels, numerically identical standard-motion frames, physical-device timing or physical GPU acceptance. Controlled timing combines Playwright clock advancement with native timeline seeking; the separate live capture records compositor playback.

Key evidence: [verification summary](faithful-verification-summary.json), [browser measurements](faithful-about-browser.json), [controlled motion](faithful-controlled-motion.json), [same-SDK raw motion](faithful-current-raw-controlled-motion.json), [standard motion comparison](faithful-current-motion-standard-comparison.png), [reduced motion comparison](faithful-current-motion-reduced-comparison.png), and `faithful-compare-{desktop,phone}-{company,framework,team}.png`.

## Commit record

Framework implementation commits, grouped by area:

- Transformers: `dad243c`, `cbc82e5`; integration `a592dab`.
- Date and decimal designs/migrations: `863bb1b`, `7543de3`, `f25c6c0`.
- Undo engine and authority-preserving adapter extraction: `34cc0ef`, `a321cd5`; test licence `dc92ac2`.
- Public integration and documentation: `0f442ee`, `0b415c0`; Claude's docs index line `a3717bf`.
- View access and native scroll latency: `a339909`, `1cbbc58`.
- Image StrictMode backing lifetime: `b00567a`.
- Public-seam import correction: `0c2bb71`.

An earlier shared-index collision produced `8dcfa3e` with this task's NSE subject but another job's staged NetworkFX files. The explicit-path staging command had failed on the index lock, and a following commit incorrectly continued. History and the other job's work were preserved. NetworkFX is not claimed as this task's implementation. Later commits stop on staging failure and use `--only` with explicit paths.

Site source: `2611d74`; first owned adoption: `ecebac4`; final owned adoption: **`a0b618b`**. Concurrent adoptions `2a27f96`, `3dd6db0` and `c424b3e` were preserved in history. The final clean adoption pins framework `c9529d1182f16d3a620ab68f3f7ff24c528f7cc4`, whose shipped source is identical to tested code commit `b0bfc6a`. The final archive SHA-256 is `92f1a6d14767ae6d38fefcec6d801354cb10ee1f93f8b0525671dec3a31c1b7b`. [Final integrity check](faithful-final-package-integrity.json) independently verifies the archive and all 2,336 installed resources against the receipt; its dirty flag is false. [Repack comparison](faithful-final-repack-comparison.json) confirms that the final build changes only source maps and `tooling/build-receipt.json` from the preceding committed build; executable code, styles, artwork and declarations match.

Adoption used clean detached checkouts, never the shared worktree's dirty source. An initial Windows npm package-file collision was retained in `faithful-head-adoption.log`; a retry after stopping only the verified 5199 Vite process succeeded. A later provenance check caught a concurrent older `5a7a857` install; this task waited for the package owner's commit and then adopted the current clean tip. That incident is retained in [regression receipt comparison](faithful-adoption-regression.json). The first final-tip build used Windows's short TEMP alias and failed the SDK stylesheet guard before package changes. Repeating the same clean commit through its full canonical pathname succeeded; both logs are retained as `faithful-final-tip-adoption.log` and [canonical adoption log](faithful-final-tip-canonical-adoption.log). No SDK source was changed for this invocation correction. The preview was restarted with the specified config and `--force`.

The live preview remains `http://127.0.0.1:5199/__dev/login?to=%2Fabout`, served from the paired `webspring-folders/site` worktree. Protected ports 5173, 5210 and 5387 were not stopped. [Final browser capture](faithful-final-browser.log) passed against the final archive, with no page/console errors and zero measured rectangle/scroll-height delta in all seven applicable records. The earlier controlled A/B evidence remains applicable: there are no Foundation, image/scroll-view or AnimationFX source changes between frozen full-suite commit `43237d3` and adopted `c9529d1`.

## Verification status

Focused checks already completed:

- Values: 31 tests in five files; date hour-cycle regression 10 tests; strict worker declarations passed.
- Undo: 42 focused tests, undo type contract, worker compilation and installed Node worker checks passed.
- View/image integration: 18 tests after the StrictMode fix; public-seam undo check 24 tests passed.
- About/artwork: 13 tests in four files passed after clean adoption, including clip/image handles before appearance, active image transform/opacity tracks and disposal.
- Both typechecks and SDK build passed for clean framework `95414a2` and its installed site consumer.
- The [final main-worktree architecture check](faithful-final-main-boundaries.log) reports only the known `WindowManagementFixture.tsx:29` private-popover import (exit 1). A check inside a junctioned temporary checkout also emits external-node_modules resolution findings caused by that junction; the main-worktree result is the source boundary authority. No new boundary violation was added.

Historical broad check: the site full suite recorded 395 passed / 3 failed / 398 total, plus a worker-start error and teardown warnings. Failures were Gallery's owned window/document-state assertion and Publisher's two replacement-anchor assertions; all three also appear in the earlier About-repair report. An earlier SDK package run passed the installed Foundation consumer but failed the host-export expectation for concurrent Authorization additions. Authorization subsequently committed that expectation update as `bcb8297`; final checks use that clean commit.

Earlier full-framework attempts were interrupted or exhausted disk space and have no valid completion totals. Their logs are retained as diagnostic history. Final full-framework, latest SDK and site results are recorded separately below; no historical partial run is presented as a green gate.

Final installed checks:

- [SDK package and Foundation installed consumer](faithful-head-sdk-consumer.log): **2 files / 10 tests passed** at clean `bcb8297`, including actual installed Node worker execution and strict WebWorker declarations. This supersedes the earlier Authorization export-list failure.
- [Site full suite](faithful-site-final-full.log), with one worker and no file parallelism: **59 files passed / 2 failed; 398 tests passed / 3 failed / 401 total**. The same Gallery window/document-state and Publisher replacement-anchor tests fail. [JSON details](faithful-site-final-full.json). Existing React insertion-effect/act warnings remain in the log. This final run has no worker-start error.
- [Final site typecheck](faithful-final-tip-site-typecheck.log): **passed** against the final archive. The framework typecheck and SDK build passed in the clean `c9529d1` [canonical adoption build](faithful-final-tip-canonical-adoption.log). The preceding source-identical [About/artwork focused run](faithful-last-focused.log) reports **4 files / 13 tests passed**.
- The completed `b0bfc6a` [browser capture](faithful-last-browser.log) passed with no recorded page or console errors; all seven measured section/viewpoint records had zero rectangle and scroll-height delta from the applicable baseline. The final-archive capture is retained separately above.

The full framework command completed on the frozen clean `43237d31000055c2d1ee8372d38dab8da0a40dc3` snapshot with `--maxWorkers=1 --no-file-parallelism`: **922 files passed / 4 failed / 926 total; 7,637 tests passed / 6 failed / 7,643 total**, in 2,494.13 seconds. [Full log](faithful-full-framework-final-result.log), [JSON](faithful-full-framework-final-result.json). This is a completed non-green run, not a full-suite success claim. No owned Foundation/view-access test failed. Failures:

- Three `host-update-readiness.test.ts` mounted share, picker and file-write assertions: native work was not admitted/counted as the tests expected. These belong to concurrent runtime/PWA/Authorization work; this task did not edit them or establish a pre-task baseline for them.
- `fx/packed-lumina.test.ts` and `fx/packed-media.test.ts` each exceeded their 120-second test timeout during installed-package acceptance.
- `synapp-sdk-package.test.ts` expected an export list without the new `SCAuthorization` and `SCAuthorizationRights` names. The newer clean-commit SDK run above passes after Authorization's expectation update.

Foundation's semantics were exercised through tests, worker compilation/execution and installed-package consumers. They were not tested through a newly added application UI; no such UI was introduced.

The focused [final-snapshot failure recheck](faithful-last-failure-recheck.log) runs all 28 host-readiness cases and both previously timed-out packed consumers on clean `b0bfc6a`: **3 files / 30 tests passed**. Combined with the newer passing SDK package run, every failure from the frozen full-framework run has a passing focused recheck. This does not replace that run with a claim that a complete suite passed on the newer commit. No concurrent implementation was edited to obtain these results.

The [full site suite on the final source commit](faithful-site-last-full.log) also completes: **58 files passed / 3 failed; 397 tests passed / 4 failed / 401 total**, with **two unhandled errors**, in 180.71 seconds. It includes the earlier Gallery owned window/document-state and two Publisher anchor failures, plus a Gallery document-bound text-editing failure. [Final source-commit JSON](faithful-site-last-full.json). All About tests pass. The extra Gallery text assertion expects an owned window titled “Attributed editor specimen” but receives undefined; its [isolated recheck](faithful-site-gallery-recheck.log) passes. The two uncaught exceptions originate in Gallery's `FXLayerSpecimen.tsx:193`, where `AFXEmitterLayer.emitterCells` rejects the supplied cells with “Emitter cells require at most 64 AFXEmitterCell values.” This task did not change that fixture or the FX implementation. The full-run result and errors remain non-green evidence; no whole-suite success is inferred from the isolated recheck.

All temporary checkouts created by this task have been removed. For each, the physical absolute target was checked, nested `node_modules` directories were checked without following reparse points, the top junction itself was deleted, source `node_modules/.bin/vitest` was verified, and only then was `git worktree remove --force` run. Source Vitest was verified again afterwards. [Cleanup record](faithful-junction-cleanups.log). The paired development worktrees and other jobs' dirty files remain intact; nothing was pushed.

The final full site run, against the canonical-path `c9529d1` archive, supersedes the intermediate site results: **59 files passed / 2 failed; 398 tests passed / 3 failed / 401 total**, in 147.88 seconds, with **no unhandled errors**. [Final log](faithful-site-tip-full.log), [JSON](faithful-site-tip-full.json). Its only failures are the three pre-existing Gallery owned window/document-state and Publisher replacement-anchor assertions. About, the Gallery text case and the earlier uncaught Gallery FX paths do not fail in this final run. Both broad suites retain their actual non-green outcomes; no whole-suite success is claimed.

## Owner questions

No unresolved owner decision remains within this scope. The bounded parsing/arithmetic/undo semantics above are explicit implementation limits, not deferred approval requests. Concurrent product-family decisions remain with their owning jobs.
