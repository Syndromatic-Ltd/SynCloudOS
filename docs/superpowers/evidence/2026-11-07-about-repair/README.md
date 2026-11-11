# About motion repair — 7 November 2026

Preview: **http://127.0.0.1:5199/about**, from the named `webspring-folders/site` worktree. No push, branch switch or new development worktree. Temporary detached SDK build checkouts followed the requested junction cleanup procedure.

The shared default Vite cache had produced persistent 504 Outdated Optimize Dep responses during concurrent preview/adoption work. This task supplied `serve-preview.mjs` to isolate that cache without editing the preview configuration. A concurrent session subsequently replaced 5199 with `../2026-11-07-foundation/open-ui-preview.mjs`, using `node_modules/.vite-open-panel-5199`. Its source confirms the exact named site root and unchanged `vite.claude-5199.config.mts`; all final captures used that server. The final About inspection has zero errors and zero startup retries. Ports 5173 and 5387 retain their original listener PIDs; 5210 was absent at entry and remains absent. An unused first cache at `site/.cache/about-preview-5199` remains after automatic review blocked its optional cleanup; the final server does not use it.

Open [the visual evidence viewer](index.html) for all six baseline comparisons and the normal/reduced frame sequences. The approved references are the supplied desktop/phone PNGs and site `e3c3b39`.

## Why the transitions broke

Several failures compounded:

1. `LayerArtwork` converted every recipe into 61 linear keyframes, excluded the native basic-animation path with backwards fill, and queued implicit model actions that replaced the explicit animation at transaction commit.
2. The keyed presence in the tab container handed the arriving controller between two slots. This destroyed its backing layers and mounted it again; About's sequence guard then suppressed its replacement entrance. A regression captured two `viewDidAppear` calls and no incoming transform animation.
3. `transition()` could mount the destination before the tab selection published. About classified that incoming pane as an outgoing pane and gave it the exit recipe. Roles now publish before any observable write.
4. Identity transform values used `none` while the other spring endpoint used a transform-function string. The frame sampler could only switch discretely between them. A floating-point terminal phase of `0.9999999999999998` could consequently commit the original 78% artwork scale. Recipes now use matching identity strings, and finite timing resolves its exact terminal phase.
5. The browser adapter's completion timer could settle a native effect before its native clock reached the end. The retention hold could therefore remove a pane while it was still fading. Native completion is now authoritative; the timer is a watchdog.
6. Successive swaps also needed controller-identity keys on the transition wrappers, so the incoming pane can become outgoing without replacing its DOM/outlets. Finally, actions-disabled model writes cancelled an unfinished recipe before `AFXLayer` could retarget it. `animateArtwork` now captures the active presentation first and retargets the replacement basic/spring/keyframe objects from it. Properties animated by a recipe are excluded from the controller's preliminary model reset. A regression caught a 5.97 px interruption jump before this fix.

The floor's independent origin/clipping regression was already fixed by Claude in framework `07a4ac3`. The adopted SDK includes that fix, and the explicitly identified temporary About workaround has been deleted.

## Audit results

| Finding | Result |
| --- | --- |
| LayerArtwork resampling | Two-point tracks become `AFXBasicAnimation`; springs become `AFXSpringAnimation`; authored multiple stops remain `AFXKeyframeAnimation` with their key times and segment timing. Model writes disable actions. System reduced motion is used. Delayed entrances use both fill to retain their first pose; ordinary tracks use forwards fill. Native transform and opacity effects are recorded in `motion.json`. |
| Pane choreography | Full baseline pane opacity tracks, slide/scale, artwork settle and heading/caption/lead rises are retained. The controller's `none` effect retains the two views without adding a second fade. Normal exit is 0.55 s; entrance is 0.95 s plus 0.12 s delay. Reduced fades retain 0.18/0.24 s. |
| Endless floor | `iterations: Infinity` and `repeatDuration: Infinity` are supported for nonzero cycles. Iterations/fill reach the native layer compositor. About uses `dots.layer.addAnimation`; no `SCOS.animations.animate` escape hatch or app visibility listener remains. Hidden playback pauses and resumes; explicit pauses preserve phase. |
| Reduced motion | System policy settles spatial/repeating effects while preserving a single non-autoreversing opacity crossfade. Always/never policies are honoured consistently at start and on preference changes. Reduced floor travel stops. |
| Mote sprite | `GFXBitmapContext` plus radial `GFXGradient`; bitmap disposal is in `finally`. A pixel test compares every alpha sample with the old falloff and permits at most one byte of difference. The saturated core is included as an exact gradient stop. |
| Addition blending | Tried the actual API, `new IFXFilterRegistry().create("blend", { mode: "addition" })`; there is no static `IFXFilter.blend` in this SDK. Normal blending was retained because overlapping motes brighten under addition. The fixed-scene comparison changed 17,375 pixels, with maximum summed RGB difference 217. See the two `blend-*.png` stills and `blend-comparison.json`. No experimental filter remains in product code. |
| Particle scheduling | Removed immediate `renderer.render()` after `setParticles`; the layer coalesces the invalidation. The lifecycle test allows that final static draw on the next frame, then verifies that reduced motion stays idle. |
| Full circles | Full pin holes/front head use `GFXPath.ellipse`. Both 1,100-point drawings retain their counts; maximum displacement at a 260 px drawing size is 0.0121 px / 0.0152 px. See `icon-sample-comparison.json`. |
| Scroll/image controls | Retained the existing elements under the task's conditional exception; precise framework gaps are below. |
| Dead images | Deleted `aurore-particle.png`, `syndromatic-chrome.png` and `about-me-icon.png`. `team.svg` describes the original silhouette without referring to a removed bundled image. |
| Room appearance | About's CSS gradients, masks, layout, typography and colours were not edited. |

## Framework gaps retained

`NSEScrollView` owns its internal `scrollRef` and overwrites the host ref. Its props expose neither the scroll element nor an outlet-compatible ref. `controllerRef` is a passive effect, after the pane's appearance and particle anchor binding; replacing the current surface would lose the committed scroll outlet. It also adds a frame/content pair, which needs separate geometry acceptance with About's size container and mask.

`NSEImageViewProps` explicitly omits `ref`; the component wraps an internal image viewport and exposes no image-element outlet. About needs that outlet at appearance time to animate the artwork separately from its stationary particle anchor. Substituting a wrapper or DOM query would not preserve that contract. No shim, alias or public API was added for either case.

## Evidence and limits

- `compare-{desktop,phone}-{company,framework,team}.png`: approved baseline on the left, repaired capture on the right. Desktop 1440×900, phone 390×844, DPR 1. All six were visually inspected. Layout, artwork size, text wrapping and perspective/clipping match; particle/floor phases differ.
- `tab-controlled/00.png` through `19.png`: full-resolution frames at 0, 80, …, 1520 ms. `reduced-controlled/`: 40 ms steps through 320 ms. These use the real app, RAF sampler, renderer and native effects, with the browser clock paused and native effects seeked to matching times so screenshot readback cannot stretch the cadence. `controlled-motion.json` records opacity and geometry.
- `tab-frames/`, `reduced-frames/`, `motion.json`: independent live playback with unmodified clocks, native `getAnimations()` effects and asynchronous CDP capture. Actual capture timestamps are preserved; readback produces fewer unique frames than the requested 80 ms targets. This is the compositor/lifecycle check, separate from the controlled visual sequence.
- `rapid-selection.json`, `rapid-before.png`, `rapid-after.png`: interrupt the Framework entrance at 620 ms with Team. The exact Framework element survives, its position and opacity remain continuous, and it then fades/slides away. This uses the explicitly controlled RAF/native clock. The jsdom counterpart inspects the committed handoff before its immediate no-WAAPI hold settles; a separate real-layer dial regression verifies compensated layout position through an interrupted move.
- `floor-0.png`, `floor-700.png`, `browser.json`: native Infinity travel and 74° floor transform with hidden clipping. `visibility.json` awaits native `ready` before checking suspension: the clock/transform are identical across that settled hidden interval, then advance after visibility resumes. Earlier immediate samples in `browser.json` can include the pending native pause. The visibility notification is synthetic because headless Chromium kept background targets visible; framework tests separately cover the host state changes.
- `desktop-scrolled.png`: scrollTop 650 and the particle field following the section artwork/sigil positions.
- `consumer-probe.json`: browser checks for the Journal, Journal old, MemoJournal, Portfolio collection card and Webspring dial/orb consumers, alongside the shared consumer test suites. Journal's fresh browser context had no readable post option, and the legacy list had no seed posts; their browser checks cover mounting/compact panes, with navigation covered by the runtime tests. MemoJournal's native entrance, shell icon/orb native effects during app launch, and the Portfolio card's spring were exercised.
- Console/page errors are recorded in each final browser JSON. This is headless browser evidence, not physical-GPU, device or owner visual acceptance.

The evidence browser drops Vite HMR update/reload messages only for its own pages. Other agents' changes and tabs continue normally. This prevents unrelated concurrent edits from replacing the loaded app during a capture.

## Commits belonging to this repair

Framework:

- `c0d5ecc` — endless compositor layer animations and fill forwarding.
- `808bcad` — one retained tab slot.
- `5e916c7` — explicit pause during hidden fallback playback.
- `2f0922a` — exact finite terminal timing.
- `29301a7` — authored reduced crossfades and child retention without a system effect.
- `550b183` — native completion watchdog.
- `391ace7` — controller-identity wrapper keys through successive tab changes.

Site:

- `81b27f4` — native artwork recipe objects and identity interpolation.
- `6820fc2` — section and floor choreography.
- `ef72090` — GraphicsFX sprite, particle scheduling, circles and dead resources.
- `eb197cd` — preserve interrupted artwork presentation; About and dial regressions.

SDK adoption, final checks and the evidence commit are recorded in `verification.json` and `adopted-framework-receipt.json`. Concurrent commits are not attributed to this repair.

## Verification record

The command logs retain both regression failures and successful checks. `verification.json` identifies the final revision, counts and any failures in the shared worktrees. Early logs are diagnostic history, not current acceptance. No other agent's failing test or uncommitted file was edited to make the suite green.

Final checks: both `npx tsc -b --pretty false` runs pass; framework animation/controller suites **41 files / 243 tests pass**; site About/artwork consumers **19 files / 129 tests pass**. The full shared site suite reports **398 passing / 3 failing / 401 total**: Gallery's owned window/document-state test and Publisher's imagePopover/publishMenu replacement-anchor tests. Their exact diagnostics remain in `site-suite-final.log`. Consumer tests also emit existing MemoJournal React insertion-effect warnings; those runs still pass.

The final clean detached adoption verified framework `772d20b`, archive SHA-256 `9e54b613c727c3d8e7b09674570a1e5382daac259706a3bde8407dea39d2aa8e`. Both temporary junctions were deleted themselves first, original framework Vitest was checked, and only then were the detached checkouts removed. The later concurrent site adoption `2b77bcd` pins framework `b21cf29`; its change from `772d20b` is documentation only (no `src` differences). That adoption and its package files were preserved. The final independent review has no remaining actionable findings.
