# Development fixture boundary repair — 7 November 2026

Framework: `SynCloudOS-Workspace/.worktrees/webspring-folders/framework`, branch `fix/blind-rewrite-friction`. Starting commit: `54a9970268a05fa9e63059e7ed0d0eee3eba949d`.

**Partial repair, stopped on the geometry specimen under the owner's explicit stopping rule.** The navigation fixture's two private imports are removed. The window fixture's private renderer remains because the existing public operation cannot reproduce its forced anchored presentation. The final boundary check exits **1**, identifying only `src/FrameworkTests/Windows/WindowManagementFixture.tsx:29`. This is not an all-boundaries-passing claim.

## Commits

- `b7c6a8f` — **NSE: derive mounted traits from presented window bounds**. The existing host uses `resolveWindowPresentation(...).bounds`, preserving stored desktop geometry while projecting the displayed compact or constrained window. Its compact regression failed before the change; the read-only/revocation regression remains passing.
- `be52818` — **Foundation: mount adaptive navigation as an application**. The development host reuses the ordinary application-window renderer. The adaptive specimen registers a real SynWare bundle and renders its controller inside the mounted application. Its options are a presented view controller with `title`, `preferredContentSize`, `presentAsPopover` and `dismiss`.

No package export, SDK capability, architecture checker, policy, consumer list or allow-list changed. The adaptive file now carries the neighbouring framework AGPL licence header. No source or tests from the window experiment were retained in the implementation.

## What the specimens prove

The navigation specimen still contains all seven destinations, the Search selection veto, editable drafts, source-list/tab/rail projections, constrained content width, RTL control, retained scroll content and its options field. Host controls resize the real application window through WindowManager; no fixture creates a presentation service or writes `nseUpdateTraits`. Two added browser cases prove a real options window, stable window and field identities, retained editor/options values through four viewport transitions, Escape dismissal and focus return, with and without reduced motion. Both passed.

The previous navigation assertions remain in place. Four fail against the current five-slot More policy: the two motion variants expect a direct History tab, RTL expects History at End, and sidebar transfer expects a direct Sharing tab. The direct-History failure was reproduced against the original `54a9970` sources and original test using a Vite source overlay, without switching branches or editing the live source. That baseline is in `fixture-boundaries-baseline-browser.log`. A later attempt to reproduce the other two baseline cases timed out during page navigation, so it does not establish their baseline assertion results. No tests were skipped or timeouts increased.

`WindowManagementFixture.tsx` and `geometry-continuity.spec.ts` are unchanged in Git from their starting versions. The original specimen retains its normal desktop bounds, unsaved parent and popover drafts, DOM identity, invalid-geometry retention, compact/shallow containment, anchor-scroll following, dismissal/focus return and CSS-pixel DPR assertions.

## Why the window migration stopped

The original renderer sets `presentation={{ mode: "anchored" }}`. The public `NSEViewController.presentAsPopover` accepts the positioning element/rectangle, preferred edge, behaviour and background drawing; it has no presentation-mode override. Its existing host renderer supplies automatic presentation. In a real mount, the 720-pixel-wide parent yields compact presentation traits, and the popover is drawn as a sheet even after the browser returns to a wide viewport.

The public-path experiment registered the specimen as a normal application and presented the geometry content with a view controller. It preserved the geometry assertions, changing only the identity lookup to the physical window host and adding a public WindowManager parent probe. In the reduced-motion case the unchanged anchor-scroll assertion expected **y=652** after scrolling 40 CSS pixels, but received **y=692**. The public popover remained fixed as a sheet. The ordinary-motion case additionally failed the original exact bounding-box retention assertion during invalid geometry.

Continuing would require exposing or bypassing the automatic presentation decision, changing the existing 720×520 specimen, or weakening its assertions. The owner expressly disallowed those remedies. The attempted migration was therefore restored rather than committed. See `fixture-boundaries-window-public-attempt.patch`, `fixture-boundaries-window-browser.log` and its browser traces. Nine other window cases passed during that experiment; the two continuity variants failed.

`fixture-boundaries-green.log` records an experimental checker exit 0 before that rollback. It is not the accepted final state. The first exploratory combined browser run recorded 8 passes and 7 failures while the application-registration StrictMode race was being corrected; it is retained in `fixture-boundaries-browser.log`, but the later stable runs below are the conformance evidence.

## Focused verification

- Baseline framework TypeScript build passed; baseline boundaries reported the specified three edges.
- Final framework TypeScript project build and authoring typecheck passed.
- Focused Vitest: **16 files / 153 tests passed**, including presentation, navigation, popover hosting, FrameworkTests settlement and architecture-checker contracts.
- SDK build passed.
- Navigation/document FrameworkTests browser run: **19 passed / 4 failed**. Both added mounted-navigation cases and all 17 document/storage cases passed. The four navigation assertion failures are described above.
- Final architecture command: **exit 1, one remaining edge**. `git diff --check` passed.

- SDK package and packed consumers, serial run: **12 files passed / 3 files failed; 38 tests passed / 4 failed**. The standalone SDK package file passed **9/9**. All four failures reported the existing 120-second test timeout: Location/MIDI, Chronosphere and both discovery-plugin variants in project conventions. Logs show wall times of 342, 406, 572 and 159 seconds respectively because these cases perform synchronous subprocess work. This is not a passing packed-consumer claim. The previous pass also recorded packed-consumer timeouts, but those historical results do not prove the current failures' cause.
- The preserved window suites were run again after the SDK build: **9 passed / 2 failed**. Normal-motion continuity failed its exact bounding-box retention check; reduced-motion continuity reached the original `data-window-id` assertion and threw `Cannot read properties of null (reading 'timeout')`. The fixture and tests were not changed to hide either result. An earlier restored-window run had 11 failures during page navigation or initial visibility; it is retained separately in `fixture-boundaries-preserved-window-browser.log` rather than presented as useful geometry proof.
- A separate baseline rerun for RTL/sidebar focus hit page-navigation timeouts. Only the earlier direct-History reproduction establishes that specific baseline failure.

Automated Chromium evidence does not constitute human visual acceptance or cross-engine acceptance.

## Site adoption

Site commit: **`64b8ace` — Build: adopt mounted navigation fixture hosting**. Only the package manifests, SDK archive and receipt were staged. The source commit is `be52818bf3d4248f58487684e4086f6af45073e0`; archive SHA-256 is `3ffc552ef5783e4d639fa21ddc8378fd0378c40664f3b277a2f1b0770b1c5050`; source fingerprint is `981e3071edee2891e917eae6e091e25bc51962c2e96d55e077e26f9604deb452`.

The requested clean detached checkout and node_modules junction were used only for adoption. An early adoption invocation was rejected by the clean-tree guard before checkout population finished; it made no adoption changes. The subsequent clean invocation built, installed and verified the archive successfully. The installed package is a real installation, not a link.

Site TypeScript passed. The initial default-worker Vitest run recorded **289 passed tests and 15 worker-exit errors**, leaving suites unexecuted. A serial rerun completed **59 passed / 2 failed files; 398 passed / 3 failed tests**. The three failure titles match the preceding adoption's recorded failures: Gallery owned window/document state, Publisher imagePopover anchor replacement and Publisher publishMenu anchor replacement. The current failure inventory and title comparison are in `fixture-boundaries-site-results.json`; the full serial result remains in its JSON/log.

Cleanup deleted the junction itself with `DirectoryInfo.Delete()`, verified framework `node_modules/.bin/vitest`, removed the detached checkout, and verified Vitest again. The scratch path is gone. The cleanup receipt is `fixture-boundaries-adoption-cleanup.json`.

Only port 5199 was restarted, from this site worktree with the requested config and `--force` (PID 54300 → 75496). `/` and `/auth/methods` returned HTTP 200. Ports 5173 and 5387 retained PIDs 72912 and 69072; 5210 remained absent. The local preview is **http://127.0.0.1:5199/**. The local config was not staged.

## Final framework suite

The full framework suite ran **once at the end** against `be52818`, using `--maxWorkers=1 --no-file-parallelism`: **874 files / 7,291 tests passed, zero failed or skipped, exit 0**, in **1,753.81 seconds**. The SDK package tests passed 9/9 again. The four cases that timed out in the earlier isolated packed run all passed in this full run; the earlier failures remain recorded above. Native document-asset cases passed in Chromium, Firefox and WebKit.

Raw results are `fixture-boundaries-framework-full.log` and `fixture-boundaries-framework-full.json`; the compact inventory is `fixture-boundaries-framework-results.json`. No implementation changed after the run started. The subsequent report/plan update does not change shipped source or require another site adoption.

Both tracked worktrees were clean after the implementation/adoption commits. The evidence logs remain beside the earlier agents' evidence, which was not staged or edited. Nothing was pushed. No branch was created or switched; the only temporary checkout was the specifically authorised detached adoption checkout, now removed. Final architectural acceptance remains **blocked by the single preserved window-fixture import**, despite the passing framework suite.
