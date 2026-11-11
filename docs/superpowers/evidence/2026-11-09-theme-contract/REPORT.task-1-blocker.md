# Theme contract delivery report — blocked at Task 1

Date: 9 November 2026.

## Status

**Implementation has not started. Task 1 has not passed its deterministic-baseline gate. Tasks 2–19 remain unstarted. This is a blocker report, not a completed Task 19 acceptance report.**

Worktree: `C:\Users\Kavish Krishnakumar\Developer\SynCloudOS-Workspace\.worktrees\webspring-folders\framework`.
Branch: `fix/blind-rewrite-friction`.
HEAD remains `a1c3617015906b4c802bd7ef7f2183062581f3b8`.

Both the approved spec and the implementation plan were read in full before changes. No subagents were used. No source files under `src/` or `scripts/` have changed. No prohibited repository or preview port was accessed. No commit or push has been made.

## Task 1 work prepared

- Added the catalogue under `tests/e2e/fixtures/theme-baseline/`, with real NSE components and real Webspring/notification runtime surfaces. It includes controls and variants, window chrome and toolbar styles, overlays, login, Board, folders, notifications, About and Settings, colour/font panels and file-panel drawings.
- Added `tests/e2e/theme-baseline.spec.ts`, with separate zero-tolerance screenshots per catalogue case, light/dark, at DPR 1 and 2. The corpus contains 2,648 PNGs, still uncommitted.
- Added an independent catalogue TypeScript check.
- Enabled the new specs in the existing high-DPR and reduced-motion projects. The reduced-motion project reuses the DPR 1 baseline, as Task 1 records two projects and Task 19 runs three.
- Fixed fixture-only setup errors and added a condition-based wait for the folder tile's measured SVG geometry before the folder presentation freezes its DOM copy.

Initial capture commands used `--update-snapshots` on the unchanged framework tree while the catalogue was being constructed. Those captures are baseline candidates, not parity acceptance. The last complete capture regenerated the two DPR 2 folder candidates. **No baseline image has been changed after the first zero-update verification failure.**

## Blocking result

The complete capture passed **80/80 execution partitions**. The subsequent run **without** `--update-snapshots` passed **79/80**, with this failure:

- Project: `chromium-high-dpr`.
- Case: `dark folder-presentation`.
- Reference: `tests/e2e/theme-baseline.spec.ts-snapshots/dark-folder-presentation-chromium-high-dpr-win32.png`.
- Difference: **75 pixels** under Playwright's comparator, with `maxDiffPixels: 0`.
- The difference is confined to the opened folder tile's drawing in the frozen backdrop.

A fixture-only geometry wait was then added. Three isolated repeats, without snapshot updates, produced **three identical actual PNGs**, each still differing from the reference by 75 pixels. Their SHA-256 is:

`be75b60569bfbf64479f270f92027c9b82f57067cfe342c16fefacfbc388d907`

The captured geometry confirms DPR 2, a source tile measuring `90.53125 × 90.53125` CSS pixels, and measured SVG artwork of `91 × 91`. The cloned tile carries the same measured path and SVG dimensions. The earlier reference visually contains a smaller clipped drawing. That is consistent with a capture made before measured artwork settled, but the original candidate has no corresponding geometry trace, so the exact initial cause is not proven.

The owning source is unchanged: `WebspringFolderTile.tsx` measures its artwork with a layout effect and ResizeObserver; `WebspringFolderSplitPresentation.tsx` freezes a clone of the stage. Waiting after the clone cannot refresh artwork already copied into it.

## Concrete owner decision

The user's instruction says: **“Never update a baseline image to make a test pass.”**

The proposed resolution is narrowly limited to Task 1: authorise replacing **only the dark DPR 2 folder-presentation candidate** with the three-times-identical actual image above, while the framework is still unchanged at `a1c3617`. Preserve the original reference, diff, trace and geometry evidence, then run the entire baseline twice without updates before committing Task 1 or starting Task 2.

No framework rendering change, CSS override, screenshot mask, increased tolerance or new design is proposed.

## Other owner questions

- The current login component exposes only its ornamented `atmoPlacard` look; there is no separate existing plain login design to baseline. A new plain design has not been invented.
- Journal belongs to the excluded site repository. Its source was not accessed and it is not in this framework-only catalogue. The plan's Task 1 list names About and Settings; the spec also mentions Journal.

## API and task accounting

- Public APIs added: **none**.
- Public APIs removed: **none**.
- Commits: **none**; Task 1's required gate has not passed, so it has not been committed as complete.
- Task 1: catalogue prepared; baseline acceptance blocked as described above.
- Tasks 2–6: layout guides and inset adoption **not started**.
- Tasks 7–11: drawing hooks, semantic colours and generated contract **not started**.
- Tasks 12–13: bundle validation, discovery, loading and selection **not started**.
- Tasks 14–15: Atmo migration and framework style adoption **not started**.
- Tasks 16–18: tooling and documentation **not started**.
- Task 19: final acceptance **not run**; this report preserves the earlier blocker.
- Part-name mapping, new colour values and breaking changes: **none yet**.
- Visual decisions made: **none**.

## Verification results

| Check | Result |
| --- | --- |
| Complete initial capture, Chromium + high DPR | 80 partitions passed; capture mode, not parity proof |
| First full comparison without updates | 79 passed, 1 failed; 75-pixel folder mismatch |
| Folder repeats after measured-geometry wait | 3 failed against preserved reference; actual PNGs identical |
| Catalogue TypeScript check | Passed |
| `git diff --check` | Passed |
| Framework typecheck and focused feature tests | Not run; Task 2 has not started |
| Full Vitest suite | Not run, reserved for Task 19 |
| Packed SDK tests | Not run |
| Second full zero-update baseline comparison | Not run; first gate failed |

## Retained evidence

- `task-1-folder-expected.png`: preserved candidate.
- `task-1-folder-actual.png`: stable actual proposed for initial baseline acceptance.
- `task-1-folder-diff.png`: exact comparator difference.
- `task-1-folder-trace.zip`: browser trace.
- `task-1-folder-repetitions.json`: all three image hashes and source/clone geometry.
- `theme-baseline-complete-capture.log`.
- `theme-baseline-verify-1.log`.
- `theme-baseline-folder-diagnosis.log`.
- `theme-baseline-typecheck.log`.
