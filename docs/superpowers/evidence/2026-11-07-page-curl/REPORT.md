# NSEPageController page curl — owner decision 8

2026-11-07. Framework branch `fix/blind-rewrite-friction`; site branch `prerelease`, both in the supplied `webspring-folders` worktrees. No push or branch switch. The implementation is landed; the broader shared-worktree validation limits are recorded below.

## Controller contract

```ts
import {
  NSEPageController,
  type NSEPageControllerOptions,
  type NSEPageControllerSnapshot,
  type NSEPageControllerSpineLocation,
  type NSEPageControllerTransitionStyle,
} from "@syndromatic/syncloudos/nse/page";

// Other transition styles remain stackHistory (default) and horizontalStrip.
const options: NSEPageControllerOptions = {
  transitionStyle: "pageCurl",
  spineLocation: "mid", // "min" is the default, for a single page.
};

// A subclass supplies identifierForObject / viewControllerForIdentifier;
// prepareViewController sets each child's representedObject by default.
// Mid turns advance or retreat by two arranged objects.
// navigateForward() / navigateBack() curl to the adjacent page or spread.
// getSnapshot() returns:
// { selectedIndex, count, turnProgress: 0..1,
//   turnDirection: "forward" | "backward" | null }
```

`pageCurl` and `spineLocation: "min" | "mid"` are the owner-approved UIKit naming exceptions (`UIPageViewController.TransitionStyle.pageCurl` and `.SpineLocation`). The owning architecture remains `NSPageController`: arranged objects, child controllers, represented objects and delegate-shaped override methods.

The selected child's view supplies the turning front; adjacent children supply the underneath and reverse faces. Each live child is rendered once. Decorative repeats are inert DOM prints with remapped IDs and retained semantic source identity. A curl retains one child per arranged object; history and strip retain their existing identifier reuse. A private WeakMap bridge keeps engine handles and types out of the public declaration.

Leading/trailing edge and corner drags, dog-ear buttons, content swipes and programmatic navigation use the existing internal engine. Successful completion changes selection and calls `didTransitionToObject`; cancellation does neither. Snapshot progress resets when the completed print commits. Direct `selectedIndex` selection cancels an in-progress gesture. In curl style, `navigateForwardToObject` accepts the next arranged object/spread; use `selectedIndex` for a distant selection. Navigation before mounting selects immediately, since there is no rendered sheet to animate.

The book preset retains its 560 ms turn, 72 px activation area, `.42` spread / `.22` single-page snap thresholds, underside treatment, WebGL geometry, shadows, lighting, haptics and reduced-motion crossfade. Reduced motion comes from the controller's trait collection. Portfolio observes controller progress/direction for scene phases and keeps its own book opening/closing scene, materials, flight geometry and localised labels.

The standalone public `NSEPage`, props/event/handle types, hook/presets and `NSE.Page` facade are removed without aliases or deprecated exports. `/nse/page` has only the controller at runtime and its four public types. Source/public/package tests and counterpart mappings were migrated. `NSEPageHeader` belonged to a separate concurrent decision.

MemoJournal has no live legacy page use. Its only match is the stale explanatory comment at `site/src/SynWare/MemoJournal.app/Contents/Info.ts:11`; that other agent's file was left alone.

## Before and after evidence

Absolute evidence root:

`C:\Users\Kavish Krishnakumar\Developer\SynCloudOS-Workspace\.worktrees\webspring-folders\framework\docs\superpowers\evidence\2026-11-07-page-curl`

- [Before captures](before/): 224 original PNGs, captured before production changes.
- [After captures](after/): 224 final PNGs; eight case manifests and aggregated `results.json`.
- [Interactive side-by-side comparison](comparison/index.html), [committed per-frame pixel measurements](pixel-comparison.json), and full-size `comparison/<case>/side-by-side-<frame>.png`.
- Reproduction: `node capture.cjs after` and `python compare.py` from this directory. Optional third capture argument selects one case. PNGs/comparison output remain local and ignored; scripts, state manifests, logs and this report are committed.

Matrix: Chromium, DPR 1, desktop 1440×900 and phone 390×844; light/dark; normal motion and `emulateMedia({ reducedMotion: "reduce" })`. Every case opens Cirrus Icons, turns forward/back using dog-ear buttons and middle edges, holds a half-width top-corner drag, releases bottom-corner drags below/above the snap threshold, exercises backward corners, and closes with Escape. A half-leaf-width movement is approximately `.25` engine progress because the full sheet travels twice its width; the explicit below/above gestures reach approximately `.04` / `.827`. Each gesture pauses before release so velocity does not hide its threshold behaviour.

All eight final cases close without diagnostic refocusing, with zero page errors, console errors or failed requests. Earlier interrupted attempts, including a desktop aborted image request, are preserved under ignored `probe/stale-attempts`; the final case was repeated successfully. The harness asserts that completed normal-motion leaves lie flat at progress zero.

Initial framework HEAD was `3d14367`; initial site HEAD was `e5825bf`. The original site archive was already dirty (`73a6c54…`) and changed concurrently (`042131f` / `2a00b1…`) during the baseline work. Exact per-case baseline archive receipts were not recorded, so these captures must not be described as one reproducible pristine archive. The core curl source was checked unchanged between `042131f` and `3d14367`.

The final after matrix records framework/archive receipts per case: desktop dark normal/reduced and desktop light reduced use `b9d17a99` / `49ebdce0a7b5a61c1ee7456537bedfefdaed6fb6714def50657de45857def7e1`; desktop light normal and all four phone cases use `9d681d88` / `6e5ca2b8ab79a3d4ab7037e670026ae84d2a9a6eddbc9e96a00de5b4f891bd65`. The split reflects concurrent adoption and retrying cases interrupted by its server restart. Every case includes all functional curl corrections and the site reader focus fix `56bba76`. The page engine/controller and child-renderer source were checked unchanged across those framework commits. The earlier complete `29301a7` matrix is retained locally under `probe/after-29301a7`, with its state records in commit `d5cfa7c`.

[Source continuity](after/source-continuity.json) records identical complete `src/NSE/Page` tree and child-renderer blob hashes across the final full-suite snapshot `57761ff`, both matrix snapshots, clean adoption `a9da6ce`, current installed `118f7ba`, and subsequent HEAD `31b0575`. Later global window/Foundation work is therefore distinguished from this unchanged page implementation.

To survive shared-worktree HMR during held gestures, the after harness pins only Vite's `/@vite/client` reloader in that browser context. Update/reload/prune messages are ignored; app modules, CSS/media queries, renderer, assets and inputs are unchanged. Server restarts can still interrupt an uncached request, and such cases were repeated. This is a development-capture measure, not application behaviour.

### Measured differences

| Frames | Result |
|---|---|
| All 224 pairs | 181 pixel-identical; 43 contain a delta |
| 84 static open/settled pairs | 80 pixel-identical; four intentional phone leading-edge changes |
| 56 held-drag pairs | 48 pixel-identical; four leading-edge changes; four reduced-motion blend differences |
| Remaining 27 changed pairs | Initial/opening, moving or released animation samples |

Every nonzero pair is listed and classified in `pixel-comparison.json`. The four static differences are `phone-*/05-edge-backward-settled.png`: the baseline phone middle-leading-edge drag did nothing; the controller now receives the same drag and returns from page 2 to page 1. Each changes 104,125 pixels (31.633552%). The corresponding held/released frames account for eight more changed pairs. This fixes the required leading-edge navigation path. Subsequent gestures are aligned to the baseline page using the real visible buttons.

The four reduced-motion held differences are phone `10-back-corner-below-held` and `11-back-corner-above-held`, in both appearances. Maximum per-channel deltas are respectively 1 and 2; the paper geometry/content agree. A CSS opacity override initially caused a substantial wrong-page overlay here; it was replaced with visibility and the full matrix was repeated. The retained small deltas reflect blend rasterisation, not an unreported static-content difference.

The other 27 changed pairs sample initial blends or elapsed animation time. They are not pixel-equivalence evidence for the motion trajectory: the harness waits elapsed milliseconds, rather than synchronising the pre/post renderers to the same animation frame. Opening differences can cover almost the entire viewport. Held geometry and settled output provide the stronger comparison. Representative full-size pairs from every size/appearance/motion combination were visually inspected, including front/reverse printing, cast shadows, threshold cancellation and reduced blends. No additional structural difference was observed. This is browser evidence, not owner visual acceptance or physical GPU/device acceptance.

The recorded held direction/progress/corner tuples also match exactly for all gestures except the newly working phone leading edge (baseline backward progress `0.000`, after `0.704`). Normal-motion records exercise the real WebGL curl path; reduced-motion records use the engine's CSS crossfade.

## Validation

Logs are under [logs/framework](logs/framework/) and [logs/site](logs/site/).

- Final focused framework source run: **79/79 tests, eight files**, including controller, semantic print key, internal engine, cylinder, tear, navigation Back, public surface and AppKit counterpart checks (`pagecurl-source-last-focused.log`).
- Portfolio focused run after the focus fix: **21/21 tests, three files** (`pagecurl-portfolio-focus-final.log`).
- Installed SDK/package boundary run on clean `2ae4023`: **9/9**, including actual installed page exports, consumer compilation and negative legacy type imports. Subsequent task changes are private renderer/gesture corrections. Clean later SDK builds also succeeded.
- Extra real-browser interaction run: desktop/phone × normal/reduced motion; three ArrowRight/ArrowLeft round trips, ordinary content swipes both ways, Tab staying in live non-inert content, Escape and focus return to the shelf all passed (`after/interaction-results.json`).
- The same four interaction cases passed at **DPR 2** after adopting `57761ff` (`after/interaction-final-dpr2-results.json`). A direct installed runtime import exposes exactly `NSEPageController`; an external TypeScript probe compiled the new API and verified missing legacy exports with `@ts-expect-error` (`pagecurl-installed-types.log`, `after/installed-runtime-exports.json`).
- Clean committed `57761ff` framework typecheck and SDK build passed during site adoption. The dirty shared framework later failed typechecking in the concurrent Foundation byte migration; exact diagnostics are retained, without modifying that job's files.
- Earlier full framework run on clean `53d75c1`: **846 files passed / four failed; 7,128 tests passed / four failed** in 990 seconds. Failures: text performance 30 s timeout, product-name scan 5 s timeout, singleton-boundary scan 5 s timeout, stale generated manifest validator. An isolated tear rerun passed 13/13 after a separate load-related timeout. These are historical results, not the final snapshot's full-suite result.
- A later full site run at archive `893325…` typechecked and returned **395 passed / three failed**, across 61 files. Failures were Gallery's editable-window admission assertion and Publisher's two replacement-popover-anchor assertions. At `57761ff`, concurrent Gallery callers started using the newly committed window-toolbar API; that then-older archive produced four type errors and **378 passed / 21 failed**. Both runs are retained; the earlier pass is not presented as the final current-site typecheck.
- Final full framework run on clean `57761ff`: **863 files passed / two failed; 7,219 tests passed / three failed**, 1,104 seconds (`pagecurl-framework-final-full.log`). The failures are the two `heritage-inspector-dev` bundle probes (missing asset/WASM loaders and Node built-ins in their browser esbuild configuration) and the stale generated manifest validator. A diagnostic build reproduced the same nine bundle errors without resolving any page-curl module (`after/inspector-isolation.json`, `inspector-isolation.mjs`). The page controller/renderer composition was already present in the earlier full-suite snapshot; no unrelated source was patched to turn this result green.
- The final own adoption `b9d17a9` passed a clean framework typecheck and SDK build. Portfolio again passed **21/21**, and the installed public API/type probe passed. Its first full site run returned **378 passed / four failed, plus two worker-exit errors**; it also found 13 type errors in the concurrently migrating Gallery/Publisher Foundation callers. Those errors are preserved as that snapshot's result. After the other owners' caller fixes, **both current worktrees passed `npx tsc -b --pretty false`** (`pagecurl-working-tree-final-typecheck.log` in each log directory).
- The refreshed two-worker site suite at the `9d681d8` archive returned **396 passed / three failed**, all 61 files completed (`pagecurl-final-two-worker-suite.log`). Failures: Gallery editable-window admission, and the two Publisher replacement-anchor assertions.
- A final clean current-HEAD adoption of `a9da6ce` also typechecked and built successfully (`pagecurl-adoption-delivered.log`). The subsequent site typecheck passed. Another session replaced that archive with `118f7ba` while validation ran; the last run returned **378 passed / 21 failed**, all 61 files completed (`pagecurl-delivered-suite.log`). Nineteen Gallery failures report `GallerySectionBackAccessory` created outside an owner; two remain the Publisher anchor assertions. These are concurrent titlebar/overlay integration results, not a green full-site claim. No Portfolio test failed.
- A first extra browser run during that adoption timed out and is retained (`pagecurl-delivered-browser.log`). After the current server/package settled, the complete desktop/phone × normal/reduced interaction check **passed all four cases** on installed `118f7ba` (`after/interaction-final-preview-results.json`, `pagecurl-final-preview-browser.log`). This verifies the current preview's keyboard turns, ordinary content swipes, modal focus, Escape and shelf focus return. No failed or manually rescued attempt is counted as a pass.

## Commits and adoption

Framework task commits:

| SHA | Subject |
|---|---|
| `f3bcd2e` | NSE: confine page curl to the page controller |
| `a6536c1` | NSE: turn child pages with the existing book curl |
| `2ae4023` | NSE: publish page controller curl styles |
| `53d75c1` | NSE: complete page curl navigation across view mounts |
| `ec1b424` | NSE: lay curled pages flat after the print commits |
| `bbc1ceb` | NSE: retain curl gesture ownership and printed page identity |
| `fffaa26` | NSE: preserve curl layer opacity in single-page readers |
| `57761ff` | NSE: document spread page controller ownership |
| `d5cfa7c` | NSE: record Portfolio page curl comparison |

Site task commits:

| SHA | Subject |
|---|---|
| `c0b0dd8` | Portfolio: read books with the page curl controller |
| `8683b86` | Portfolio: expose the leading page drag edge |
| `8d6da8b` | Portfolio: adopt the committed page curl framework |
| `599d125` | Portfolio: let page navigation take over a corner peek |
| `56bba76` | Portfolio: retain modal focus after page swaps |
| `41d0f73` | Portfolio: adopt the verified page curl archive |
| `76896cd` | Portfolio: refresh the shared framework adoption |

The audit D4 bullet and phase 9 Landed wording were included in the concurrent audit commit `397f881`. The navigation-plan update is in `57761ff`.

Shared-index provenance: `fffaa26` inadvertently also committed another session's staged Open panel evidence batch (51 files total; this task owned only the curl CSS and controller regression in that commit). Those contents were preserved, the owner was informed, and `cfbdfd3` records the evidence provenance. History was not rewritten. Subsequent commits use `git commit --only -- <explicit owned paths>`.

Adoption uses a detached, clean temporary checkout and the prescribed dependency junction. The junction itself is deleted first with `Get-Item(...).Delete()`, shared `node_modules/.bin/vitest.cmd` is verified, then the named scratch worktree is removed. No recursive deletion of a dependency junction is used. The temporary checkout and final archive receipts are recorded in the adoption logs.

The latest own committed adoption is `b9d17a99`, archive SHA-256 `49ebdce0a7b5a61c1ee7456537bedfefdaed6fb6714def50657de45857def7e1`. Earlier clean attempts were stopped before changing the site archive: `991044f` had Foundation byte-contract errors in output/Opus/image-worker consumers; `800185b` still had image-resource/font/output byte-contract errors. Those diagnostics are retained. Another session subsequently adopted `9d681d8` / `6e5ca2b8ab79a3d4ab7037e670026ae84d2a9a6eddbc9e96a00de5b4f891bd65`; its package/vendor changes were preserved. This task did not patch or revert the other owners' source files.

Following the prescribed refresh, this task built/adopted clean `a9da6ce1def0dd10d800e6db3d1fa36b85d1b101` / `9ae1f427ed16…`. Another session then adopted `118f7ba8133c121227942ede906f0105a355a0ac` / `3a38277ebed5cea4b167d9fabf4a65179058a497af740577050609e4b4ea9b5f` before the former adoption could be committed. Those current package/vendor files belong to that session and were left unstaged by this task. All page-curl source commits are included in both archives. All task-created scratch checkouts were removed in the safe order, and shared Vitest dependencies were verified intact.

## Remaining review and preview

Fusion was searched read-only at `C:\Users\Kavish Krishnakumar\Developer\SynCloudOS-Fusion`, HEAD `6b2cf0c29f2ae9390c7eb6f42d847b7ca31b6583`. There are **no** `NSEPage`, legacy page types/hook or `/nse/page` call sites in its source/tests/docs. No Fusion file was changed.

No page-curl API decision remains open. Owner visual acceptance of the book animation is still a human review; the frame captures do not certify every animation frame or physical-device behaviour. The Inspector/generated-validator failures and the current Gallery titlebar ownership/Publisher anchor failures remain with their respective owners. Concurrent work can change shared validation and adoption after the snapshots reported here.

Preview: `http://127.0.0.1:5199/portfolio`, served from the supplied site worktree. Only 5199 was restarted. The unrelated 5173/5387 listener PIDs were checked unchanged; 5210 had no listener at that check. The local Vite config is neither staged nor committed.
