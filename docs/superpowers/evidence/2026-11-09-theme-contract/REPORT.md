# Theme contract implementation report

Date: 9 November 2026. Work in progress; final Task 19 acceptance has not run.

## Authority and constraints

Worktree: `C:\Users\Kavish Krishnakumar\Developer\SynCloudOS-Workspace\.worktrees\webspring-folders\framework`.
Branch: `fix/blind-rewrite-friction`. Starting commit: `a1c3617015906b4c802bd7ef7f2183062581f3b8`.

The approved spec and plan were read in full. Tasks proceed in order, with a commit after each completed task. No subagents have been used. No pushes, bare stashes, Co-Authored-By trailers, prohibited repository access or access to ports 5210/5387 have occurred.

## Task-by-task delivery

### Task 1 — visual baseline

Completed on the unchanged framework at `a1c3617`. Framework source under `src/` and `scripts/` was unchanged throughout capture and verification.

- Catalogue: `tests/e2e/fixtures/theme-baseline/`.
- Spec: `tests/e2e/theme-baseline.spec.ts`.
- Corpus: **662 cases × light/dark × DPR 1/2 = 2,648 PNGs**.
- Every capture uses `maxDiffPixels: 0`; no masks or control-style overrides.
- Frozen corpus hashes: `baseline-sha256.json` in this evidence directory.
- Two consecutive full comparisons **without snapshot updates passed 80/80 partitions each**. Logs: `theme-baseline-final-1.log` and `theme-baseline-final-2.log`.
- Catalogue TypeScript check and `git diff --check` passed.
- The high-DPR and reduced-motion Playwright project filters include the new specs. Reduced motion uses the existing DPR 1 references.
- Task 1 commit: `af93e18a` — `test(theme): record the Atmo visual baseline`.

**The images are frozen from the Task 1 commit. They must not be updated during Tasks 2–19.**

### Task 2 — geometry types and safe-area model

Added `NSEEdgeInsets`, `NSEEdgeInsetsZero` and `NSEEdgeInsetsMake` to the public layout and NSE entries. Replaced `NSEScrollInsets` at its users, with no alias. The pure model adds physical screen, chrome and additional insets, rejects invalid obstruction thickness and converts ScreenService logical edges for LTR/RTL. It reuses the existing public `NSEScrollRect` rather than introducing an equivalent rect type.

Verification: 17 focused tests passed (12 new safe-area cases plus scroll regressions); framework typecheck passed; obsolete type search and diff check clean. Logs: `task-2-red.log`, `task-2-green.log`, `task-2-typecheck.log`. Task 2 commit: `b3ae1018` — `NSE: NSEEdgeInsets and the safe-area model`.

### Task 3 — window content layout

Commit: `5bc55461` — `NSE: windows report contentLayoutRect and contentLayoutGuide`.

Added the stable `NSEWindow.contentLayoutGuide` and its `contentLayoutRect`. Physical windows and application stages own a geometry model; title bars, toolbars, titlebar accessory rows and content borders register their obstruction. Their measurements share one ResizeObserver per window, publications are batched to one animation frame, and unchanged rects do not notify. The actual content elements publish physical `--nse-content-layout-inset-*` properties. Detachment and disposal release registrations and subscriptions. Navigation strips and source lists are adopted in Task 6 as planned.

Verification: 6 current guide tests pass; the prescribed focused regression command passed 776 tests in 66 files (including the then-five guide tests). Framework typecheck passed. The frozen baseline comparison passed **80/80 partitions, zero differences**, recorded in `task-3-baseline-final.log`; all 2,648 reference hashes are unchanged. The first comparison was interrupted by editing a module while Vite was serving it: a notification-centre capture navigated back to the initial fixture, producing a 300px body instead of its 896px reference. Its failed trace is retained as `task-3-interrupted-trace.zip`. No baseline reference was changed.

### Task 4 — view safe areas

Added `NSEView.additionalSafeAreaInsets`, `onSafeAreaInsetsChange`, physical `--nse-safe-area-inset-*` properties and `useNSESafeArea`. Each view intersects the window guide with its measured bounds; ancestors' additional insets are accumulated separately so chrome is not counted twice. Controller views expose `safeAreaInsets`, `safeAreaRect`, writable `additionalSafeAreaInsets` and `viewSafeAreaInsetsDidChange()`. Measurements use the window's shared observer where available; standalone views use one observer. Controller layout callbacks share that measurement rather than adding another observer.

Verification: all 33 focused tests in four files passed, including five new safe-area cases and the controller/drawing regressions. Typecheck passed. The initial 80-partition screenshot check passed; the further full comparison after observer consolidation also passed **80/80, zero differences** (`task-4-baseline-final.log`). The prior regression assertion that a released FX layer leaves no inline style now checks that FX dimensions are removed and the view's four required safe-area properties remain. No drawing was changed.

### Tasks 5–19

Pending. Final split-suite and packed SDK acceptance remain for Task 19.

## Initial capture correction and retained evidence

The first full zero-update comparison passed 79/80 partitions. The dark DPR 2 folder presentation differed by 75 pixels. Three diagnostic captures produced the same actual PNG, SHA-256:

`be75b60569bfbf64479f270f92027c9b82f57067cfe342c16fefacfbc388d907`

The owner explicitly approved replacing **only that initial reference**, on unchanged `a1c3617`, as a capture correction rather than a parity exception. Original SHA-256:

`6c5bd4603eb1cc6996554beba72f60d24b132229d2f053efe54497c24e4c4e5e`

Retained unchanged: `task-1-folder-expected.png`, `task-1-folder-diff.png`, `task-1-folder-trace.zip`, `task-1-folder-repetitions.json`, and the stable `task-1-folder-actual.png`. The original blocker report is retained as `REPORT.task-1-blocker.md`.

Further diagnostic runs exposed folder-only capture interference and source-paint timing. The fixture now gives the folder a fresh document, decodes CSS artwork, waits for finite animations, and waits for measured SVG geometry before the presentation freezes a DOM copy. These are fixture-only waits. Twelve focused repetitions then passed, followed by the two complete 80/80 comparisons. **No additional reference images were replaced.** Intermediate diagnostic logs/evidence remain available alongside this report.

## Owner clarifications

- Baseline the existing ornamented login only. The later `presentation.login: "plain"` disables the existing ornament effect, adds no new design, and receives a separate review image under this evidence directory. It has no frozen parity reference.
- Journal is outside this job because its site repository is excluded. It was not accessed and is not in this catalogue.
- Continue autonomous implementation. Stop an affected slice only for an unavoidable visible difference or a genuine spec/plan contradiction affecting public API; commit passing work and continue independent tasks.

## Calls made by Codex

1. The folder's capture gets a fresh document so prior catalogue surfaces cannot leave queued document work in the stage being copied. Its source CSS resources, finite animations and measured geometry settle before cloning. No framework rendering or artwork changed.
2. The reduced-motion project compares the DPR 1 references, avoiding a third set of initial images that Task 1 never requested.
3. Task 2 reuses the existing public `NSEScrollRect`, as the plan explicitly allows an equivalent existing rect type. The inset factory preserves finite signed geometry; safe-area resolution clips actual safe insets to view extents.

4. Screen safe-area strips are intersected with a physical window’s bounds; floating windows away from the screen edge do not inherit a notch or home-indicator inset.

## Public API accounting

Added: `NSEEdgeInsets`, `NSEEdgeInsetsZero`, `NSEEdgeInsetsMake`. Removed: `NSEScrollInsets` (no compatibility alias). Task 3 adds `NSELayoutGuide`, `NSEWindow.contentLayoutRect`, `NSEWindow.contentLayoutGuide` and `useNSEWindowChromeObstruction`.

Task 4 adds the `NSESafeArea` result type, `useNSESafeArea`, the two view props and three controller-view properties described above, and `NSEViewController.viewSafeAreaInsetsDidChange()`.

Part-name mappings, semantic colour values without Atmo precedent and Beta 2 removals will be recorded as their tasks are completed. No visual design decision has been made.

## Test accounting

| Check | Result |
| --- | --- |
| Final full baseline comparison 1, no updates | 80 passed, 0 failed |
| Final full baseline comparison 2, no updates | 80 passed, 0 failed |
| Focused settled-paint folder repetitions | 12 passed, 0 failed |
| Catalogue TypeScript check | Passed |
| `git diff --check` | Passed |
| Full framework Vitest suite | Not run; reserved for Task 19 |
| Packed SDK tests | Not run |

Historical capture/diagnostic failures are retained as evidence and are not counted as final acceptance passes.
