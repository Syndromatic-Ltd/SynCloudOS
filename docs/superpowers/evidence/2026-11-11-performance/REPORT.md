# Performance, lifecycle and structure verification

14 November 2026. Framework source `f6f9c4d6` on `fix/blind-rewrite-friction`. Site vendoring commit `9010f16` on `prerelease`. The report does not alter the packaged source. Measurements use the paired site worktree with its existing caller edits and the vendored SDK. Historical comparisons use the committed evidence in this directory. Host load, the site source and browser session differ between the historical and current measurements.

## Workstream results

| Workstream | Target or reference | Evidence and status |
| --- | --- | --- |
| A. Gallery style | Forced recalc ≤45 ms, mean section style ≤90 ms, cold gallery style ≤480 ms | Historical `90e7fbf9` was 192.6, 356.2 and 1,905.2 ms. The post-PDF dev trace was 34.9, 55.8 and 407.3 ms. The current plain run reached 33.6, 60.7 and 365.2 ms respectively. All three dev-trace medians are inside the targets. [Historical baseline](baseline.json) · [Post-PDF trace](inventory-plain-after-pdf.json) |
| A. Pointer sweep | Cut script time in half from 3,031.7 ms | The post-PDF dev trace reported 62 ms of script and no tasks over 50 ms. The earlier general store change was reverted. The fix now lives in the Webspring hover path. The current plain run measured 45.7 ms of script, 1.2 ms of style and zero tasks over 50 ms. [Historical baseline](baseline.json) · [Post-PDF trace](inventory-plain-after-pdf.json) |
| A. Appearance parity | Zero computed-style differences and a green frozen baseline | The original selector work recorded zero standard computed-style differences across 14,361 specimens. The digest was not repeated in this naming slice. The current full frozen run passed 111 of 177 tests and reproduced the 66 metal-thumb differences from the base. The 2,648 reference images and their manifest are byte-for-byte unchanged. [Selector evidence](README.md) |
| B. Lifecycle | Present before launch did-hooks. Route suspend and quit through class-aware hooks, honour the quit veto and dispose the session | Implemented in the shared base and covered by the launch-order and suspend/terminate suites. The current ten-cycle dev heap run held DOM and listeners flat. [Launch order test](../../../../tests/runtime/launch-lifecycle-order.test.tsx) · [Suspend and terminate test](../../../../tests/runtime/lifecycle-suspend-terminate.test.tsx) |
| C. About launch | Complete in ≤60% of before, longest task ≤50 ms, style ≤60 ms | The earlier cold completion was 188.7 ms (target 113.2 ms). This run was 211.1 ms cold and 122.5 ms warm, with cold first frame at 280.2 ms. The launch trace attributes CSS to bundle loading and shows no separate stylesheet or font wait. The current plain trace measured 124.1 ms for the longest task and 95.0 ms of style. All three performance targets remain open. [Original timeline](launch.md) |
| C. QuickSwitch and return | Each longest task ≤50 ms | Historical values were 62.5, 51.4 and 95.2 ms. Post-PDF values were 89.2, 81.6 and 128.8 ms. The current plain run measured 91.7, 86.2 and 128.5 ms respectively. All three still miss. [Historical baseline](baseline.json) · [Post-PDF trace](inventory-plain-after-pdf.json) |
| D. State machines | One transition table per identified state machine and guards against bypass | Tasks 12–18 were already integrated. The phase guard covers direct assignments. Launch history and page-turn tables retain their existing permissive behaviour. [Guard tests](../../../../tests/runtime/state-machines.test.ts) |
| E. Main-thread computation | No framework-computation task over 100 ms in the interface scenarios, excluding rendering | The committed inventory identified DOM, style and React work, with no rows eligible to move to DispatchFX. The safe-area and PDF slices were addressed separately. The fresh profiled run again shows React rendering and layout on gallery section changes. It attributes 100.2 ms of a 150.3 ms cold-board task to framework code, with 38.0 ms in tooling. The top self-time frame is Vite style injection. The evidence does not isolate a transferable CPU kernel in that task. [Trace inventory](dispatch-benchmarks.md) |
| E. Adoption | Reduce the longest main-thread task by at least 50%, with at most 10% wall-time regression | All four existing workers remain. The application worker path is verified in packed tests. The framework worker binding lacks the entry and transport semantics needed for a comparable migration. Details below. |
| E. About heap | Below 2 MiB from cycle 1 to cycle 10, with flat DOM and listener counts | Current dev run was +2,708,232 bytes (+2.58 MiB), 4,555 DOM nodes at both checkpoints and 929 listeners at both checkpoints. The earlier comparable `heap-after-sol.json` run was +2.51 MiB, 0 nodes and −2 listeners. The older +3.50 MiB run sampled detached nodes and is unsuitable for comparing DOM retention. No fresh production run. [Earlier counters](heap-after-sol.json) |
| F. AppKit naming | Zero unmapped `NSE*` declarations | 694 at handoff, 646 after three families, then zero out of 583 on the integrated branch. The exact-zero guard and packed export comparison are recorded below. |
| G. Structure | Owner review of Tasks 24–27 | The folder and package proposals await approval. |

The previous same-site safe-area comparison measured median inclusive hook time of 566.5 → 24.1 ms on cold gallery load, 120.2 → 32.0 ms in Tables & Trees, 139.6 → 7.7 ms in Buttons and 65.1 → 12.4 ms in Menus & Popups. Total style time varied and did not show a consistent gain. TextFX's generated identity test preserved break offsets. Its 100,000-unit case took 2.688 s in the earlier focused run, with eligible shaping calls reduced from 110 to at most five. These numbers come from the previous integration, before this naming slice. [Integration plan and measurements](../../plans/2026-11-11-performance-lifecycle-structure.md)

## Task 23 commits

| Commit | Scope and regression coverage |
| --- | --- |
| `076759a2` | Grouped rows, five names removed (694 → 689). Four suites, 35 tests covering AppKit naming, drawing parts, InterfaceFX contracts and NSE primitives. |
| `3811a5b8` | Virtualisation, 13 names removed (689 → 676). Eleven suites, 182 tests covering AppKit naming and data-view behaviour. |
| `f6f9c4d6` | Smooth surfaces, 30 names removed (676 → 646). Five suites, 56 tests covering AppKit naming, primitives, standard windows, window chrome and Webspring folder tiles. One isolated run of the naming test took 5.14 s and reached its 5 s limit. The combined rerun passed at the original limit. |

The TypeScript language service updated references and imports. Each slice passed typecheck and lowered the inventory ceiling. The guard fails against the preceding count when the corresponding rename is absent. CSS selectors and hooks stayed byte-for-byte the same in the rename diffs. The SDK export scan found no direct exports with the 646 remaining names. Some appear in types reachable from public signatures. The continuation below starts with the private page-curl declarations and reaches the exact-zero assertion.

## Task 21 prerequisites

`systemDispatch()` binds queues to `systemLifetime`, whose `appId` is null. `resolveDispatchChunkURL` returns no worker URL for that lifetime. The Vite closure converter also requires a discovered SynWare bundle, and the SDK build lacks a framework closure-conversion pass. In Chromium an explicitly annotated closure submitted to the current system queue completed in the window even though module workers were available. [Queue routing](../../../../src/FX/DispatchFX/DFXQueue.ts#L56) · [System lifetime](../../../../src/FX/DispatchFX/internal/lifetime.ts#L16) · [Vite extraction](../../../../scripts/synware/vite-plugin.mjs#L954) · [SDK build](../../../../scripts/synware/build-sdk.mjs#L127)

The existing ImageFX and VideoFX transports send owned data, including pixel buffers and frame resources, and provide request cancellation. PDF separates parser and page work and can terminate a disposable worker with bounded input. Lumina owns worker-local database state, transactional cancellation and timed idle release. The pool can transfer results. Its request path clones captures, and its protocol provides no per-job cancellation message. The internal dedicated-worker helper needs an explicit call and does not supply Lumina's idle policy. [Image transport](../../../../src/SynCloudOS/PlatformAdapters/BrowserImageProcessingWorker.ts#L234) · [Video transport](../../../../src/SynCloudOS/VideoFX/VideoWorkerTransport.ts#L163) · [PDF workers](../../../../src/FX/GraphicsFX/pdf/BrowserPDFDocumentWorker.ts#L169) · [Lumina worker ownership](../../../../src/SynCloudOS/PlatformAdapters/WorkerLuminaIndexBackend.ts#L313) · [Pool protocol](../../../../src/FX/DispatchFX/internal/pool/protocol.ts#L48)

Proposed first slice. Emit an internal framework-owned worker entry from the SDK build and bind it to the runtime-owned system lifetime. Validate that an installed SDK runs a framework job off the main thread with two concurrently busy worker lanes, and that runtime teardown clears all jobs and worker resources. Follow with explicit ownership of transferable inputs, cooperative per-job cancellation and terminal handling for already-posted work. Retain dedicated isolation where state or parser bounds require it. Before replacing any worker, run the real workload against both paths and compare longest task, input delay, wall time and process memory. A transport migration only lands once its output, cancellation and performance match the agreed bar. The Chromium fixture measured the existing 200-page PDF path at 89.2 ms median and the 5,000-document Lumina replacement at 425.7 ms median, with no main-thread long tasks detected in any of their three runs (Long Tasks API, 50 ms threshold). The 12-megapixel Gaussian case is outside the four-million-pixel ImageFX destination limit. A four-megapixel Gaussian and a 1080p video Gaussian also exceeded their graph sample budgets. The synthetic Task 7 figures use different workloads. A fair follow-up needs a supported tiled image workload and a video workload with validated bounds. A 256×256 Gaussian smoke probe completed in 1,311.2 ms median with no detected long task. Its expanded output was 262 pixels wide. The 300-frame 1080p identity-graph probe did not complete before the six-minute bound, so it supplied no video timing. No DispatchFX candidate was benchmarked.

## Task 28 package and site provenance

The SDK source commit is `f6f9c4d6e9083fcfbdf1473e942eb758ab0b328b`. The SHA-256 of the installed archive is `bc4b31b42afe7715e1d6bfede1104343e22ca828b53e6401b7ab34d94783d5be`. The receipt records 2,344 SDK inputs and has no `dirty` key. The live preview remains on port 5387.

The vendoring command was `npm run framework:sync -- <shared framework checkout> --skip-build`. It used the archive built from the same commit. The existing untracked evidence was moved temporarily into the checkout's ignored artefact directory, Git status was verified empty, and all 1,460 files were restored. The site commit stages the manifest, lock, receipt and archive only. The committed site source still contains callers of removed SDK exports such as `atmoMotion` and `atmoAppearance`. Site verification used the existing local caller edits, including `src/Effects/motionCurves.ts`. Those edits are needed before an independent checkout of the site commit can pass its checks.

After the crash, the installed package contained NUL bytes and site Vitest failed to load several files. The immutable archive still matched its digest. Reinstalling it with `npm install --ignore-scripts --no-audit --no-fund` restored all 2,619 installed hashes. The site Vite process was restarted with `node node_modules/vite/bin/vite.js --config vite.local-auth.config.mts --host 127.0.0.1 --port 5387 --strictPort --force`. Chromium mounted the gallery through the local sign-in route.

## Verification

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed after each rename and on the final source. |
| `npm run typecheck:authoring` | The npm wrapper exited with Windows status `-1073741819`. The direct command `node node_modules/typescript/bin/tsc -p tests/types/tsconfig.authoring-6e.json --noEmit` with a 4 GiB Node heap passed after the restart. |
| `npm run typecheck:contracts` | Passed. |
| `npm run boundaries:architecture` | Passed, 1,830 files and 8,370 edges. |
| `npm run sdk:build` | The npm wrapper exited with Windows status `-1073741819`. Direct `node scripts/synware/build-sdk.mjs` succeeded and produced the archive above. |
| `node --test tests/packaging/*.test.mjs` | Passed, eight tests across the framework asset, attribution, Webspring and retired-effect suites. |
| `node node_modules/vitest/vitest.mjs run` | 9,965 of 9,967 tests passed across 1,041 files (24 min 03 s). Chromium document assets timed out in `page.goto` at 30 s. The resource-count test, which creates 4,097 fixture files, hit its 5 s limit. Fable recorded the same two failing cases on `1ca29e01`. The earlier run was stopped after a Windows SDK build crash left it using stale package output. |
| `node node_modules/playwright/cli.js test theme-baseline theme-nesting --workers=1 --trace off --retries=0 --update-snapshots=none --output .artifacts/single-tree-frozen-rebuilt-results` | 111 passed, 66 failed in 13 min 12 s, all on 11 known metal-thumb surfaces in light and dark across the three projects. Zero retries. All 2,648 image hashes matched and the manifest had no diff. The earlier run had one additional mount timeout that passed on its own and in this rerun. |
| `node scripts/synware/check-developer-mcp-consumer.mjs` | Failed on existing `theme.undrawn-part` conformance diagnostics. |
| `node scripts/synware/check-fx-pdf-consumer.mjs`, `check-fx-text-consumer.mjs`, `check-text-system-consumer.mjs`, `check-fx-video-consumer.mjs`, `check-fx-video-encode-consumer.mjs`, `check-omitted-products-consumer.mjs` | All six passed. |
| `node scripts/fx/check-installed-fx.mjs --mode deterministic` and `--mode browser --base /nested/product/` | Both stopped at the existing 13-family acceptance list versus the 22-family manifest. Browser workloads did not run. |
| Site `npm run check`, `npm run check:boundaries`, `npm test` | Passed with the existing caller edits. Boundaries checked 385 files. All 24 Node and 414 Vitest tests passed across the site suites. |
| `node scripts/perf/launch-timeline.mjs --base http://127.0.0.1:5387 --runs 3 --json .artifacts/single-tree-launch-after.json` | Passed. Cold/warm completion in ms: About 211.1/122.5, Journal 195.3/76.7, gallery 496.2/320.1. |
| `node scripts/perf/heap-cycles.mjs --base http://127.0.0.1:5387 --cycles 10 --json .artifacts/single-tree-heap-after.json` | Completed without detached-node sampling. Heap gate missed, DOM and listeners flat. |
| `node scripts/perf/style-recalc.mjs --base http://127.0.0.1:5387 --runs 3 --cpu --json .artifacts/single-tree-site-after.json` | Chromium lost its execution context during a navigation. The fresh unprofiled run `node scripts/perf/style-recalc.mjs --base http://127.0.0.1:5387 --runs 3 --json .artifacts/single-tree-site-after-plain.json` passed and supplied the reported timing medians. A rerun with `--cpu` passed after the dependency cache was warm. Profiled task lengths are reported separately from plain timing medians. |

Raw local logs are under `.artifacts/single-tree-*`. The frozen baseline manifest and the tracked DispatchFX Task 6 receipt have no diff. The fixture server on port 5377 was stopped after the serial verification and browser probes. The site preview on 5387 remains live.

### Browser worker probe commands

Ran `node .artifacts/single-tree-adoption-server.mjs` serially against the Vite fixture on port 5377. The system-queue probe completed in the window. The bounded run produced PDF and Lumina measurements. The final smoke run produced ImageFX timings before the video workload hit the overall bound. Per-workload outcomes are listed above.

## MotionFX audit and proposed Core Motion alignment

Source reviewed at `f6f9c4d6`, including the browser authorisation fix in `ec6a5609`. The current branch keeps the shipped API and app permissions.

| Surface | Current implementation | Proposal |
| --- | --- | --- |
| Accelerometer | `MFXAccelerometerData.acceleration`, `accelerometerData`, `accelerometerUpdateInterval` and `start/stopAccelerometerUpdates` already match Apple's names. The interval is changed by a setter method. The manager uses `accelerationIncludingGravity` when available and falls back to linear acceleration with `includesGravity: false`. | Keep the names. If the owner approves Swift-style parity, replace the setter method with a writable seconds property and consider a handler-free start for polling. Keep the browser fallback explicit. The SDK uses m/s² and Apple uses g, so a unit change requires a separate migration. |
| Gyro | `MFXGyroData.rotationRate`, `gyroData`, `gyroUpdateInterval` and `start/stopGyroUpdates` already match Apple. The adapter maps beta/gamma/alpha to x/y/z and converts degrees per second to radians per second. | Apply the same interval and polling decisions to both streams. Derive `isAccelerometerActive` and `isGyroActive` from manager subscriptions if consumers need them. Keep delivery, staleness and visibility separate. A DOM constructor shared by both streams cannot establish hardware availability for either. |
| Recorder | `createRecorder()` starts a bounded history of fused `MFXDeviceMotion` in the active app session. Apple's `CMSensorRecorder` starts a timed accelerometer recording and retrieves data by date. | If renamed, use `MFXDeviceMotionRecorder` and `createDeviceMotionRecorder()`. Reserve `MFXSensorRecorder` for a host with Apple's timed historical contract. |
| Authorisation | The manager exposes a browser-gesture `requestAuthorization()`. Its `authorizationStatus` shares `MFXAvailability`, combining consent with hardware availability, suspension and disposal. The mounted facade adds an app privacy grant. Apple's `CMAuthorizationStatus` has four consent cases and its motion manager has no matching request method. | Preserve the gesture path and per-app grant. If approved, introduce a consent-only `MFXAuthorisationStatus` with `notDetermined`, `restricted`, `denied` and `authorised` where each can be established. Keep availability, delivery and lifetime separate. A rename of `requestAuthorization` or the manifest key needs its own migration decision. |

Source anchors are `src/FX/MotionFX/MFXMotionManager.ts:35`, `src/FX/MotionFX/MFXMotionCapabilities.ts:21`, `src/FX/MotionFX/MFXMotionRecorder.ts:23`, `src/SynCloudOS/MotionFX/ScopedMotionManager.ts:308`, `src/SynCloudOS/PlatformAdapters/BrowserMotionAdapter.ts:236` and `src/SynCloudOS/AppSDK/mountedMotionClient.ts:82`.

The browser adapter accepts a finite event payload as evidence of host availability without checking event trust. The mounted app privacy grant is separate. Verify the owner-confirmed Android path with real delivered samples, then cover synthetic events, orientation-only delivery, missing axes and a permission promise settling after a sample. Keep units and axes explicit for each source.

- [Apple CMMotionManager](https://developer.apple.com/documentation/coremotion/cmmotionmanager)
- [Apple CMAcceleration](https://developer.apple.com/documentation/coremotion/cmacceleration)
- [Apple CMSensorRecorder](https://developer.apple.com/documentation/coremotion/cmsensorrecorder)
- [Apple CMAuthorizationStatus](https://developer.apple.com/documentation/coremotion/cmauthorizationstatus)
- [W3C Device Orientation and Motion](https://w3c.github.io/deviceorientation/)

For the login plate, reuse the shell's `NSEMaterialLighting` port and treat its current attitude as rest when the opening presentation completes. Keep the plate artwork and rings fixed. Drive the highlight with a bounded displacement around the baked ring centre. Release on close, interruption or reduced-motion changes. Verify a stable first frame after opening, tilt on the owner's phone and unchanged login behaviour.

## Integrated verification on 14 November

The verified framework source is `a366c561`. The clean archive SHA-256 is `35222f3190a16c58cae93f68372c0cfc17daab5b0656a2318543e76f55c4bcd1` and the source fingerprint is `e6c4d547e304e20f476141b1df70b7b6e84e2f96361b7a6a57247bb96aea5d06`. Comparing it with the SDK previously installed on the site found the same 53 package entries and all 3,244 named declarations across 48 typed entry points. The first comparison caught a public name lost in the colour cleanup. `4dc09f8e` restored it and adds a regression assertion.

Task 23 reached zero unmapped declarations out of 583 prefixed declarations. The guard now compares the remaining list with an empty array and reports names on failure. The inventory skips TypeScript parsing only when the source text cannot contain an applicable identifier. Its output matched the all-files AST inventory exactly.

### Task 23 continuation

| Commit | Change | Focused verification |
| --- | --- | --- |
| 7d0fb5fa | page curl internals lose the prefix | 8 files, 82 tests |
| 53bc3919 | overlay internals lose the prefix | 33 files, 480 tests |
| d0ea608d | tooltip internals lose the prefix | 5 files, 61 tests |
| 3d59daa3 | tab bar internals lose the prefix | 10 files, 98 tests |
| cc4304bd | chrome internals lose the prefix | 13 files, 112 tests |
| 9d322779 | window view internals lose the prefix | 10 files, 110 tests |
| 84ab84d9 | colour internals keep only AppKit names | 6 files, 81 tests |
| c01371c2 | menu internals lose the prefix | 15 files, 136 tests |
| 1b0a2f4f | toolbar internals lose the prefix | 9 files, 123 tests |
| 4f15b366 | date and time internals lose the prefix | 11 files, 123 tests |
| 66853b16 | data view internals keep only AppKit names | 13 files, 191 tests |
| bdc29482 | overlay surface internals keep only AppKit names | 32 files, 1716 tests |
| 0272bdf3 | navigation internals lose the prefix | 10 files, 127 tests |
| e2e96c20 | animation internals keep only Core Animation names | 33 files, 293 tests |
| afa471c3 | view layout and drawing internals lose the prefix | 10 files, 85 tests |
| 3e1b2d93 | application mounting internals lose the prefix | 29 files, 977 tests |
| b57b2020 | control action and runtime internals lose the prefix | 16 files, 274 tests |
| 79e5c4da | button and value-control internals lose the prefix | 15 files, 165 tests |
| 0b983ac1 | fields and image internals lose the prefix | 18 files, 203 tests |
| 8c0c39b6 | typography and text view internals lose the prefix | 38 files, 295 tests |
| bf0cec2d | appearance and material internals lose the prefix | 11 files, 71 tests |
| 3a26e758 | file and media panel internals lose the prefix | 10 files, 55 tests |
| 8739cad4 | dialog and preference internals keep only AppKit names | 19 files, 185 tests |
| 48ea1dce | drag and pointer internals keep only AppKit names | 5 files, 49 tests |
| e56138d5 | scroll and focus internals keep only AppKit names | 10 files, 39 tests |
| f75fa9a3 | controller ownership internals keep only AppKit names | 9 files, 149 tests |
| 728e270a | control catalogue and container internals lose the prefix | 14 files, 184 tests |
| bd5ac3d0 | host service internals lose the prefix | 10 files, 94 tests |
| 164f97ce | every prefixed declaration has a counterpart | 2 files, 12 tests |
| 4dc09f8e | the colour preferences factory keeps its public name | 3 files, 28 tests |
| b189c668 | runtime fixtures follow the internal focus and drawing names | 27 focused tests, including Chromium drawing at DPR 1 and 2. The packed suite also checks that the replacements remain private. |
| d6636307 | authoring guides describe the exposed control contracts | Reviewed the affected public entry points, plus full packaged verification below. |

`478f1bd1` corrects the internal NSE namespace assertion after the full suite caught it. The 30 focused tests passed across the namespace, Chronosphere and drawing files. The final full and frozen reruns include that test-only commit. The focused counts overlap across families. The overlay surface suite caught the tooltip fixture recursively invoking itself after the rename. Renaming the fixture function restored the rendered contract and all 1,716 tests passed without increasing the original heap limit.

### Installed FX review

Both Gemini commits were picked after source and receipt review. `41bd1af9` → `d59dc580` adds actual installed browser consumers for DispatchFX and seven device or system families. The Dispatch probe verifies an off-window worker result, capture ownership, immutability, ordering and disposal. Device probes assert mounted attribution, lifecycle and the supported or unavailable cases exposed by the browser. Physical-native acceptance is still open. `b2bd45fd` → `c8ff5c5b` derives the family list from the package manifest, wires substantive checks in both modes and fails the acceptance receipt for missing evidence. Its three packaging tests passed on Gemini's branch and again after the pick. The reviewed reference archive matched both of Gemini's 22-family receipts, and Chromium, Firefox and WebKit passed at both routes for the new consumers. The shared installer was still deleting retained consumers when the process exited. `a366c561` makes the browser harness own cleanup after installation. A child-process test first reproduced the missing logs for a failed probe and the missing retained path for a successful kept probe, then passed both cases. The kept run mounted and verified its fixture in all three engines.

### Integrated checks

| Command | Result |
| --- | --- |
| `npm run typecheck`, direct authoring typecheck and `npm run typecheck:contracts` | Passed. |
| `node scripts/quality/architecture-boundaries.mjs` and `node scripts/quality/check-product-name-hygiene.mjs` | Passed. Architecture checked 1,830 files and 8,370 edges. |
| `node scripts/synware/build-sdk.mjs` and `node --test tests/packaging/*.test.mjs` | Passed. Packaging was 11/11. |
| `node node_modules/vitest/vitest.mjs run` | At `478f1bd1`, 9,968 passed and one failed across 1,042 files (27 min 55 s). The only failure is the Chromium IndexedDB document-asset timeout recorded on the base. The integrated run before the final test fix had 9,967 passes and also failed on the stale internal system UI assertion. Neither run failed on the theme resource-count case. |
| `node node_modules/playwright/cli.js test theme-baseline theme-nesting --workers=1 --trace off --retries=0 --update-snapshots=none` | At `478f1bd1`, 111 passed and 66 failed in 14 min 25 s. The 66 mismatches are the same 11 metal-thumb surfaces across light, dark and three projects as the base. Zero retries. All 2,648 image hashes matched and 5377 was released. The first integrated run had the same result. |
| `node scripts/fx/check-installed-fx.mjs --mode deterministic` | 22/22 installed and deterministic family rows passed. All 16 commands exited 0 in 12 min 26 s. |
| `node scripts/fx/check-installed-fx.mjs --mode browser --base /nested/product/` | 22/22 installed and browser family rows passed. All 16 commands exited 0 in 12 min 19 s. The new DispatchFX and device consumers passed at both deployment bases in Chromium, Firefox and WebKit. |
| `node scripts/synware/check-developer-mcp-consumer.mjs` | Failed at the existing Atmo `theme.undrawn-part` warnings. |
| `node scripts/synware/check-text-system-consumer.mjs` | Passed. |
| `node scripts/synware/check-fx-pdf-consumer.mjs`, `check-fx-text-consumer.mjs`, `check-fx-video-consumer.mjs`, `check-fx-video-encode-consumer.mjs` and `check-omitted-products-consumer.mjs` | All five passed. |
| `node --test scripts/synware/dispatch/__tests__/closureConversion.test.mjs` | 48/48 passed. |

### Clean site installation

Site commit `0472a7c` on `prerelease` vendors `a366c561`. `npm run framework:sync -- <shared framework checkout> --skip-build` used the exact archive that passed both installed gates. The receipt has no `dirty` key and all 2,619 installed files matched their hashes. All 1,460 untracked framework evidence paths were restored. The site lock diff changes only the SDK reference and integrity. The framework test and report commits after the archive have identical published inputs. Vitest rebuilt the SDK at `478f1bd1`: its SHA-256 is `1ab59e9563496c7f44e21347c2755fa8a74411864e5cd6c470ac48addaac2f2b`. Comparing the two resource manifests found 2,618 identical files and one change in `tooling/build-receipt.json`, which names the later commit.

Site `npm run check`, `npm run check:boundaries` (385 files) and `npm test` (24 Node and 414 Vitest) passed with the existing caller edits. The vendor commit contains only the manifest, lock, receipt and archive. A clean site checkout still needs the owner's caller edits for removed exports such as `atmoMotion` and `atmoAppearance`. Vite restarted at `127.0.0.1:5387` with `--force`, returned HTTP 200 and loaded the gallery through local sign-in in Chromium with zero page errors.

The local dev harness was repeated against that vendor archive. Other local validation was active during timing measurements, so these are observations and no new speed comparison is claimed.

| Command | Result |
| --- | --- |
| `node scripts/perf/launch-timeline.mjs --base http://127.0.0.1:5387 --runs 3 --json .artifacts/single-tree-final-launch.json` | Passed. Cold and warm completion in ms was 400.7 and 160.2 for About, 284.5 and 150.3 for Journal, and 869.9 and 481.2 for the gallery. |
| `node scripts/perf/heap-cycles.mjs --base http://127.0.0.1:5387 --cycles 10 --json .artifacts/single-tree-final-heap.json` | +2.59 MiB (+2,720,604 B) from cycle 1 to cycle 10, with 4,555 DOM nodes and 929 listeners at both checkpoints. The 2 MiB target still misses. No detached-node sampling. |
| `node scripts/perf/style-recalc.mjs --base http://127.0.0.1:5387 --runs 3 --json .artifacts/single-tree-final-style.json` | The three gallery style targets passed at 33.3 ms forced recalc, 61.1 ms mean section style and 365.2 ms cold gallery style. The pointer sweep used 41.2 ms of script with no long tasks. About still misses its style and longest-task targets at 92.2 and 122.5 ms. QuickSwitch open, select and return still miss their 50 ms targets at 95.5, 91.2 and 135.1 ms. |

Task 21 remains an open design proposal. The system binding and the transport prerequisites are unchanged by the installed consumer coverage. The performance numbers earlier in this report describe the earlier site archive.
