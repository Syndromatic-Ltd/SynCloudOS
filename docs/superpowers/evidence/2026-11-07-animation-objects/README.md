# Animation objects — owner decisions 5 and 6

The animation part of audit phase 9 is implemented. AppKit supplies the ownership and API shape; the existing Atmo motion recipes supply the appearance. The report below distinguishes automated and Chromium evidence from owner or physical-device acceptance.

## Public contract

- `NSEAnimationContext.current` and `runAnimationGroup(changes, completionHandler?)` scope duration, cubic Bézier timing and implicit-animation transactions. Nested groups inherit values and restore their parent on exit, including exceptions.
- Reduced motion uses the existing `NSEViewController.traitCollection.reducedMotion`, with `traitCollectionDidChange` and the read-only React projection `useNSETraitCollection()`. This fits the existing reactive trait propagation without adding a second workspace singleton or inventing a notification facility. It is the owner-approved trait alternative to AppKit's workspace read. Unhosted shell views follow the live system media query. The environment provider and framework/test overrides stay internal.
- `present(viewController, animator)` accepts an `NSEViewControllerPresentationAnimator` with `animatePresentation(of, from)` and `animateDismissal(of, from)`. The presenter stays mounted underneath. Dismissal retains the presented view until asynchronous motion settles; disposal and failed animation cannot strand it.
- `transition(from, to, options, completionHandler?)` replaces a child's view in its retained slot. `NSEViewController.TransitionOptions` provides crossfade, directional slides, forward/backward and `allowUserInteraction`. Child ownership survives swaps; reduced motion substitutes a short crossfade.
- `view.animator()` and an HTML outlet's `animator()` animate alpha and frame changes. Artwork uses the existing owned `AFXLayer`; Netburst uses `controller.fx.animation.manageRenderer(outlet)` and managed frame callbacks.
- Retired defaults, environment, presence, layout and presentation helper exports are removed from public entrypoints, the registry, counterpart map and pinned export tests. There are no aliases or compatibility re-exports.

See [the API guide](../../../framework/nse/animation.md).

## Migrated callers

| Caller | Final ownership |
| --- | --- |
| `Effects/NetburstIconEffect.tsx` | Controller-owned renderer, frames and outlet; zero-size deferral and GPU-failure cleanup |
| `MemoJournalPreview.tsx`, `MemoJournalViews.tsx`, `MemoJournalViewControllers.tsx`, `memoJournal.transitions.ts` | Retained list with custom editor presentation/dismissal animator; preview cards use owned artwork layers |
| `CentralOrbView.tsx`, `RotaryDialView.tsx`, `WebspringButtonView.tsx`, `WebspringDialView.transitions.ts` | Owned artwork layers; view animator handles layout, AFX preserves spring/jiggle recipes |
| `ConformanceSpecimen.tsx`, `TextTransferMedia.tsx`, `GalleryAnimationSample.tsx` | Live system trait; context groups on owned outlets, no subtree motion override |
| `Journal.app` and `JournalOld.app` transitions, shell and phone chrome | Owned artwork layers with existing pane/chrome recipes; direct-child CSS updated for the owned view outlets |
| `About.app` pane, scene, motion and root | Child-controller crossfade and owned artwork/floor outlets |
| `Portfolio.app/Contents/Library.tsx` | Owned collection-paper layer preserves its entry spring |
| `SynCalViewControllers.tsx` | App-local editor-state method renamed `editEvent` to avoid colliding with controller `present` |

`Effects/LayerArtwork.tsx` is an app-local recipe adapter using real controller outlets and AFX layers. It is not a public framework API. Journal, JournalOld, About and Portfolio were migrated after their navigation-owned folders became clean. Later page-curl work in those apps belongs to the other session.

The gallery's already-declared `conformanceHarness=1` route query now mounts its existing conformance view in the real gallery. Previously that component had no mounted caller. The ordinary gallery still uses its existing navigation.

## Capture protocol and limits

Run `node docs/superpowers/evidence/2026-11-07-animation-objects/verify-animations.cjs FLOW STAGE DEVICE SCHEME MOTION` from framework. Flows are `memo`, `dial`, `reorder`, `about`, `journal`, `journal-old`, `portfolio`, `gallery`; stages are `before` / `after`; devices are `desktop` / `phone`; schemes are `light` / `dark`; motion is `no-preference` / `reduce`.

Chromium runs at DPR 1, 100% zoom, 1440×900 and 390×844. Reduced motion is set with `page.emulateMedia({ reducedMotion: "reduce" })`. Every case retains PNGs before, during and after motion, frame measurements, console errors and source/archive identity in `framework/.artifacts/animation-objects/`. The exact stage/device/scheme/motion is encoded in every filename. These ignored local artifacts are intentionally larger than the committed harness and report.

The baseline uses archive commit `042131f` with the 25 affected caller files overlaid from site `e5825bf`, not a claim that the entire site was reverted to that commit. The overlay manifest records both byte hashes. All final caller bytes were restored and reverified, and `.artifacts/animation-baseline-state.json` is inactive. The gallery route wiring was present in both capture stages.

At 390px the declared native shell is Board: phone launch/return captures exercise Board. Phone reorder records explicitly state that Dial is unavailable at this presentation. Desktop captures exercise Dial, including hover Netburst, launch/return and keyboard reorder in edit mode.

JournalOld cannot acquire its content service: `Integrations/Journal.integration.ts` accepts the current Journal and Publisher bundle IDs only. Both stages record its unavailable-content state and folder navigation as **limited**. Opening a legacy note remains unverified; this pass does not expand the service's access policy.

Early cold-navigation failures were rerun with a 15-second navigation timeout. The final result JSON for each case is authoritative; the directory also retains early exploratory captures. Frame sampling measures effective ancestor opacity and geometry; it supplements visual inspection and does not establish physical GPU or owner acceptance.

Two baseline cases remain unsuitable for settled pixel comparison: MemoJournal desktop/dark/normal was still in the shell's opening zoom, and Dial desktop/dark/reduced was still dimmed. The summary excludes those baselines rather than claiming parity from them. Other matched states show the same memo/editor geometry, collection paper, Journal panes and Dial reorder positions. Dynamic particles and different capture times account for some pixel differences; the pixel comparison JSON is diagnostic, not an equivalence score.

## Validation

| Check | Result |
| --- | --- |
| Framework TypeScript | Passed in the active worktree before the concurrent open-panel work; each clean adoption also ran `tsc -b --pretty false` |
| Framework focused animation/public API/counterparts | 26 passed across six files |
| Framework motion/environment integration | 20 passed across two files |
| Packed SDK build | Passed from clean detached committed checkouts; final installed commit `397f881`, archive SHA-256 `121f5b62ec47c0b782137ec0859b3bd9e36909d626fb870e787190e6d2f15a40` |
| Full framework suite, once, clean adoption snapshot `2ae4023` | 7,128 passed; three failed across 850 files. Text performance exceeded 30 s; SystemUI boundary scan exceeded 15 s; generated manifest validator was stale |
| Isolated timeout rerun, unchanged snapshot and default timeouts | Both passed, with one worker. The stale validator is still unresolved |
| Site TypeScript on the final installed SDK | Passed |
| Final focused caller checks after the About repair | 62 passed across seven files; earlier caller coverage also passed 75 tests across nine files |
| Full site suite on the final installed SDK | 392 passed; three failed across 59 files. Gallery editable-window discovery and two Publisher anchor-replacement assertions remain unresolved; the same three failures reproduced in a focused rerun |

Logs are retained in `framework/.artifacts/animation-{framework-full-suite,framework-timeout-rerun,site-full-suite-latest,site-final-focused,site-typecheck-latest,adoption-latest}.log`. `synapp-sdk-package.test.ts` participated in the full framework run after its SDK build. The full run intentionally used the clean committed adoption snapshot while other agents continued editing the active worktree; it is not a claim to validate their subsequent uncommitted changes.

The final capture matrix records 64 cases against the single final archive above: 52 exercised flows pass, eight JournalOld cases are limited by service access, and four phone Dial-reorder cases are not applicable. It covers both sizes, appearances and media settings with no page errors. The baseline has 50 usable comparisons, eight limited cases, four inapplicable cases and the two excluded captures described above. There are 880 retained PNGs including exploratory captures. Run `summarise-evidence.cjs` for the per-case source identity and quality classification in `.artifacts/animation-objects/evidence-summary.json`.

About's first migrated version replayed an entrance during the retained tab-slot handoff. A frame probe exposed the nearly transparent page. The app now leaves crossfade opacity to the controller, preserves its slide artwork, and avoids replaying entrance on the same selection. The final eight About captures assert at least 0.48 effective opacity on one pane throughout the swap. Repeated tab input is refused during movement and normal input works again afterward. Three early MemoJournal open/dismiss cycles retained exactly one list and left no editor behind. Disposal/cancellation contracts are additionally covered by the controller tests.

Representative local captures, relative to the framework worktree:

- `.artifacts/animation-objects/memo-after-desktop-light-no-preference-{list,open-1,editor,close-1,closed}.png`
- `.artifacts/animation-objects/memo-after-phone-dark-reduce-editor.png`
- `.artifacts/animation-objects/dial-after-desktop-light-no-preference-{idle,netburst,launch-1,app,return-1,returned}.png`
- `.artifacts/animation-objects/reorder-after-desktop-dark-no-preference-{editing,move-1,moved,finished}.png`
- `.artifacts/animation-objects/about-after-phone-dark-no-preference-{company,swap-1,framework}.png`
- `.artifacts/animation-objects/journal-after-phone-light-no-preference-{list,folder-swap-1,swap-1,note}.png`
- `.artifacts/animation-objects/portfolio-after-desktop-dark-no-preference-{closed,open-1,open,dismissed}.png`
- `.artifacts/animation-objects/gallery-after-phone-dark-reduce-{idle,run-1,settled}.png`
- `.artifacts/animation-objects/system-motion-live-toggle.png`, `memo-interruption.json`, `about-interrupted-and-return.png`

The deliverable preview is `http://127.0.0.1:5199`, from the named site worktree. Only that listener was restarted. The original 5173 and 5387 listeners remained up, and no 5210 listener was changed. Adoption junctions were deleted before their detached worktrees, and the framework's shared `.bin/vitest` was verified afterward. The temporary Vite configuration is untracked and was never staged. No branch was created or switched, and nothing was pushed.

## Commits from this task

Framework:

- `ab76983` NSE: plan animation object migration
- `6308e36` NSE: scope animation context groups
- `c016bd6` NSE: add controller animators and child transitions
- `44bd67c` NSE: normalise animation trait source endings
- `4fa4c48` NSE: host static controller presentations in previews
- `042131f` NSE: hand child transitions between retained view slots
- `3bc9c44` NSE: keep animation environment and presence internal
- `3ba377b` NSE: read system motion in standalone shell views
- `dad2c5a` NSE: record landed animation object contracts

Site:

- `4398873` SynCal: distinguish editor state from presentation
- `c3b6c79` NSE: own site artwork with view controllers and layers
- `b6fc6af` MemoJournal: present the editor with a controller animator
- `b138f39` Webspring: animate dial artwork through owned views
- `c2b5c35` Gallery: show system motion through animation objects
- `2674977` Journal: animate panes with owned view layers
- `08b683d` About: transition sections through view controllers
- `adfea67` Portfolio: animate collection paper on its view layer
- `d1b6a41` Gallery: mount the system motion evidence harness
- `24f7c97` About: keep the pane visible across the tab handoff
- `6742520` NSE: adopt committed animation objects and shared hosts

## Fusion and remaining acceptance

Read-only searches found no retired-animation API code call sites in `SynCloudOS-Fusion/src` or `SynCloudOS-Fusion-gemini/src`. `SynCloudOS-Fusion/FRICTION-OPUS.md:228–229` contains stale decision notes about the provider and MemoJournal; Fusion was not edited.

Open questions: whether JournalOld should be authorised as a content-service consumer; the stale generated validator; the gallery editable-window discovery failure; and the two Publisher anchor-replacement failures. Physical-device and owner visual acceptance remain separate from this browser evidence. Other agents' dirty files and commits remain their responsibility.
