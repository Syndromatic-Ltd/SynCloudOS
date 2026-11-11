# XRFX fidelity evidence — 8 November 2026

Starting commit: `aaa69c0752f22f09445aa2554267b32122b41bf1` (accepted Bluetooth). Worktree: `webspring-folders/framework`, branch `fix/blind-rewrite-friction`. This pass owns XRFX and necessary runtime/hook/test/SDK/document integration only. Root PLAN/REPORT, unrelated files, `.superpowers`, the sibling site's old SDK and protected preview configuration remain outside the commit. No server, branch, worktree, push, VR, payment button, Fusion access or raw Gallery video work was performed.

## Source authority and member mapping

Apple's ARKit documentation was read directly on 8 November 2026: [ARSession](https://developer.apple.com/documentation/arkit/arsession), [delegateQueue](https://developer.apple.com/documentation/arkit/arsession/delegatequeue), [RunOptions](https://developer.apple.com/documentation/arkit/arsession/runoptions), [ARConfiguration](https://developer.apple.com/documentation/arkit/arconfiguration), [WorldAlignment](https://developer.apple.com/documentation/arkit/arconfiguration/worldalignment-swift.enum), [ARRaycastQuery](https://developer.apple.com/documentation/arkit/arraycastquery), [Target](https://developer.apple.com/documentation/arkit/arraycastquery/target-swift.enum), [TargetAlignment](https://developer.apple.com/documentation/arkit/arraycastquery/targetalignment-swift.enum), [ARRaycastResult](https://developer.apple.com/documentation/arkit/arraycastresult), [TrackingState](https://developer.apple.com/documentation/arkit/arcamera/trackingstate-swift.enum), and [ARError.Code](https://developer.apple.com/documentation/arkit/arerror/code). The web reader rejected Apple's Markdown content type; direct HTTPS fetches of Apple's linked `.md` pages supplied the declarations and descriptions.

All class filenames below are under `src/FX/XRFX/`. Every public runtime/type export has an exact counterpart in `docs/framework/appkit-counterparts.json`, also consumed by the developer MCP lookup. There are sixteen runtime exports and one protocol-only export. `public.ts` contains re-exports only.

| Apple member | Our member | Owning file |
| --- | --- | --- |
| `ARSession.init()` | `new XRFXSession()` | `XRFXSession.ts` |
| `ARSession.delegate`, `.delegateQueue` | `delegate`, `delegateQueue: DFXQueue | null` | `XRFXSession.ts` |
| `ARSession.currentFrame`, `.configuration` | `currentFrame`, `configuration` | `XRFXSession.ts` |
| `ARSession.run(_:options:)`, `.pause()` | `run(configuration, options)`, `pause()` | `XRFXSession.ts` |
| `ARSession.add(anchor:)`, `.remove(anchor:)` | `add(anchor)`, `remove(anchor)` | `XRFXSession.ts` |
| `ARSession.raycast(_:)` | `raycast(query): Promise<readonly XRFXRaycastResult[]>` | `XRFXSession.ts` |
| `ARSessionDelegate.session(_:didUpdate:)` frame | `sessionDidUpdateFrame(session, frame)` | `XRFXSessionDelegate.ts` |
| `ARSessionDelegate.session(_:didAdd:)` anchors | `sessionDidAddAnchors(session, anchors)` | `XRFXSessionDelegate.ts` |
| `ARSessionDelegate.session(_:didUpdate:)` anchors | `sessionDidUpdateAnchors(session, anchors)` | `XRFXSessionDelegate.ts` |
| `ARSessionDelegate.session(_:didRemove:)` | `sessionDidRemoveAnchors(session, anchors)` | `XRFXSessionDelegate.ts` |
| `ARSessionObserver.session(_:didFailWithError:)` | `sessionDidFailWithError(session, error)` | `XRFXSessionDelegate.ts` |
| `ARSessionObserver.sessionWasInterrupted(_:)` | `sessionWasInterrupted(session)` | `XRFXSessionDelegate.ts` |
| `ARSessionObserver.sessionInterruptionEnded(_:)` | `sessionInterruptionEnded(session)` | `XRFXSessionDelegate.ts` |
| `ARConfiguration.isSupported`, `.worldAlignment`, `.isLightEstimationEnabled` | Same members on abstract `XRFXConfiguration` | `XRFXConfiguration.ts` |
| `ARWorldTrackingConfiguration.isSupported` | `XRFXWorldTrackingConfiguration.isSupported: Promise<boolean>` | `XRFXWorldTrackingConfiguration.ts` |
| `AROrientationTrackingConfiguration.isSupported` | `XRFXOrientationTrackingConfiguration.isSupported: Promise<boolean>` | `XRFXOrientationTrackingConfiguration.ts` |
| `ARConfiguration.WorldAlignment.gravity`, `.gravityAndHeading`, `.camera` | Same cases on `XRFXWorldAlignment` | `XRFXWorldAlignment.ts` |
| `ARSession.RunOptions.resetTracking`, `.removeExistingAnchors`, `.stopTrackedRaycasts`, `.resetSceneReconstruction` | Same cases on `XRFXSessionRunOptions`, bit values 1/2/4/8 | `XRFXSessionRunOptions.ts` |
| `ARFrame.timestamp`, `.camera`, `.anchors` | Same members on `XRFXFrame` | `XRFXFrame.ts` |
| `ARCamera.transform`, `.projectionMatrix`, `.trackingState` | Same members; both matrices are `AFXTransform3D` | `XRFXCamera.ts` |
| `ARCamera.TrackingState.notAvailable`, `.normal`, `.limited(_:)` | Same cases on `XRFXTrackingState` | `XRFXTrackingState.ts` |
| `ARCamera.TrackingState.Reason.initializing`, `.excessiveMotion`, `.insufficientFeatures`, `.relocalizing` | Same cases on `XRFXTrackingStateReason` | `XRFXTrackingStateReason.ts` |
| `ARAnchor.init(transform:)`, `.init(name:transform:)` | `new XRFXAnchor(transform)`, `new XRFXAnchor(name, transform)` | `XRFXAnchor.ts` |
| `ARAnchor.identifier`, `.name`, `.transform` | Same members; identifier reuses Foundation `NSEUUID` | `XRFXAnchor.ts` |
| `ARRaycastQuery.init(origin:direction:allowing:alignment:)` | `new XRFXRaycastQuery(origin, direction, target, targetAlignment)` | `XRFXRaycastQuery.ts` |
| `ARRaycastQuery.origin`, `.direction`, `.target`, `.targetAlignment` | Same members | `XRFXRaycastQuery.ts` |
| `ARRaycastQuery.Target.existingPlaneGeometry`, `.existingPlaneInfinite`, `.estimatedPlane` | Same cases on `XRFXRaycastTarget` | `XRFXRaycastTarget.ts` |
| `ARRaycastQuery.TargetAlignment.horizontal`, `.vertical`, `.any` | Same cases on `XRFXRaycastTargetAlignment` | `XRFXRaycastTargetAlignment.ts` |
| `ARRaycastResult.worldTransform`, `.anchor`, `.target`, `.targetAlignment` | Same members; immutable snapshots | `XRFXRaycastResult.ts` |
| `ARError.errorDomain`, `.code` | `XRFXError.errorDomain = ARErrorDomain`, `.code` with Apple's documented cases | `XRFXError.ts` |

## Behavior, unsupported promises and decisions

Option A attribution is reused through `fxRuntimeContracts`, with private stable per-app subclasses. No ambient state, public factory, shim, FX-to-AppSDK/PlatformAdapters import or public static symbol member was added. Construction pins a unique selected session; the object remains terminal after selected registry removal, signal abort or privacy/access withdrawal. Delegates use actual `DFXQueue` work and `dispatchQueueForSession(selectedSession).main` for a null queue. Every queued delivery checks the captured run/access generation and selected session again.

`XRFXConfiguration` remains abstract. Concrete classes keep Apple's `gravity` and light-estimation-enabled defaults. Static support is asynchronous because the browser query is asynchronous; it is passive and does not imply app consent or support for every configuration property. Static query observers are released on completion or selected-session end; a late refusal cannot poison a replacement.

World tracking privately maps to immersive AR and orientation tracking to inline. Gravity uses native local coordinates and camera alignment uses viewer coordinates. `gravityAndHeading`, enabled light estimation and `resetSceneReconstruction` fail with `XRFXError(unsupportedConfiguration)`. No compass alignment, lighting estimate, native tracking confidence or plane classification is invented. Snapshot cameras report `notAvailable` because the native API does not expose ARKit tracking quality. Missing pose/projection observations produce no fabricated frame. The other Apple tracking-state cases/reasons remain real Apple-shaped values for the admitted type contract.

`run`, `pause`, `add`, and `remove` retain Apple's void/delegate shape. Native acquisition and failures are asynchronous. A repeated identical active configuration preserves its native session. A changed or resumed configuration requires explicit `resetTracking`; losing known anchors also requires `removeExistingAnchors`. Unsupported preservation fails rather than silently discarding state. A failed first acquisition clears pending-run state so it can be retried. `stopTrackedRaycasts` has no active tracked-raycast objects to stop because that API is outside the admitted list.

Actual native anchor creation occurs inside the browser frame callback; non-rigid transforms or absent anchor support produce `unsupportedConfiguration`. Anchor identifiers are real `NSEUUID`s. Native anchor creation finishing after cancellation/removal is deleted, and cannot delete a replacement creation. Actual native tracked anchors supply anchor snapshots. No plane-detection adapter path is admitted, therefore `XRFXPlaneAnchor` is excluded as the brief permits. No fake planes or VR configuration exists.

`raycast(query)` is necessarily asynchronous for hit-test-source acquisition plus the next frame. Only `estimatedPlane` and `any` alignment are supported. Plane-specific targets/alignment fail with `unsupportedConfiguration`. Result matrices are copied during the native callback; source cancellation completes before results settle, so cancellation refusal remains authoritative. No plane anchor/classification is fabricated. Translation, rotation and projection conversion are tested independently through known transformed points, in addition to immutability after source-array mutation and expired native getters.

`cameraUnauthorized` represents raw SecurityError/NotAllowedError or missing launch authority. `sensorUnavailable` represents missing native support/rendering or the mounted session limit. `invalidConfiguration` covers invalid matrices/query/options. `requestFailed` represents ended ownership, cancellation, requests before running and duplicate pending anchor creation. Raw native refusal is observed through the existing privacy path before conversion at acquisition, add/remove, raycast, frame callback and pause/finalization boundaries. Cleanup continues even if hit-source cancellation refuses during pause. Stale refusal is scoped to the old operation and cannot revoke a replacement.

The mounted host observes `runtime.privacy.subscribe` independently of `bindResource`, protecting denied construction and subsequent withdrawals before any native use. Each class owns one access and one selected-session observer; activation does not overwrite releases. Resource leases and native handles are released once. The hook defers activation until insertion-effect commit, so discarded StrictMode renders remain passive; replay retains the real class and genuine unmount ends it. Exact context, branding clones and duplicate-runtime ambiguity are covered.

## Removed names and migrated consumers

Deleted `XRFXClient`, `XRFXCapabilities`, `XRFXAuthorizationStatus`, `XRFXSessionMode`, `XRFXReferenceSpace`, `XRFXConfigurationOptions`, `createMountedXRClient`, and `mountedXRClient.ts`. Deleted the old `getCapabilities`, `getAuthorizationStatus`, instance `isSupported`, listener argument to `run`, public `dispose`, string anchor identifiers, `viewerTransform`, array transforms, mode/reference-space/feature options and public SCOS/context/runtime-environment `.xr` factory. Negative type/API tests intentionally retain these names as forbidden assertions. The host-private mounted association retains its private `xr` slot; no public declaration graph may reach that transport.

Migrated context assembly, SCOS facade, runtime facade/types, mounted service association, browser runtime construction, capability report, hook, deterministic test adapters and controls, shared privacy regressions, source/plugin fixtures, immutable installed consumer, public type probe and runtime entry gate, counterpart lookup, phase-5 mounted/packed checks and shipped XR documentation. The SDK entry and manifest already map `fx/xr` to the public barrel, so no alias or new subpath was added. Existing meaningful privacy cases were rewritten to the new boundary, not skipped. A scoped search of sibling `site/src` found no current XR consumer; its old-SDK typecheck passes. Gallery/adoption and physical hardware acceptance remain parent aggregate work.

## Tests and pre-freeze gates

- `xr-initial-red.log`: 27 missing-class/flow failures before production implementation.
- `xr-browser-red.log`: 8 missing transport failures before native rewrite.
- `xr-boundary-red.log`: 4 actual-class/ambiguity/private-environment failures before hook/runtime migration.
- `xr-plugin-red.log`: 3 missing actual test-host XR control failures before adding the narrow private adapter.
- `xr-edge-red.log`: 4 regressions for option preservation, pending anchor removal, hit-cancellation refusal and support completion after registry removal; then `xr-edge-green.log`: 38/38.
- `xr-counterparts-red.log`: missing runtime enums and counterpart exports; `xr-package-red.log`: missing installed session runtime gate/probe. `xr-public-green.log`: all source type/counterpart/gate tests pass.
- `xr-runtime-route-red.log`: removing only the real XR route's privacy subscription makes the denied → grant → withdrawal test fail. The exact source bytes were restored immediately; no production privacy weakening remains.
- `xr-finalization-red.log`: hit cancellation refusal initially prevented native cleanup; `xr-finalization-green.log`: 39/39 core/native cases after cleanup continues and propagates the refusal.
- `xr-retry-red.log`: dead pending-run retry failed; `xr-retry-green.log`: 31/31 flow cases. The stale-query setup was corrected to a fresh privacy fixture because a previous native denial correctly survives an app-only regrant.
- Focused command is printed at the top of `xr-focused.log`: **85/85 tests, 14 files, exit 0**. It covers values, full session/delegate flow, all raw operation boundaries, pending resolve/reject after revoke/regrant/replacement, queued stale frames/errors, subscription ownership, hook lifecycle, actual mounted privacy routing, attribution and shared privacy.
- Affected host command is printed in `xr-affected-host.log`: **22/22 tests, 6 files, exit 0** (browser environment/contributions, host integration/composition, class test host, attribution package resources).
- `npx vitest run --config tests/fixtures/xr-attribution/vitest.config.mjs` → `xr-plugin.log`: **3/3 actual plugin-compiled .app scenarios**. Constructors after native await, timer and callback perform complete frame/camera/anchor/raycast flows; native raycast/pause refusal overrides saved consent.
- Framework and sibling old-SDK site `npx tsc -b --pretty false` → `xr-framework-typecheck.log` and `xr-site-typecheck.log`: **both exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` → `xr-architecture.log`: **1,795 files / 8,169 edges validated**.
- `xr-covering.log` confirms a final **32/32 tests, 2 files** covering flow and public types after the private support-observer ordering check; framework typecheck and architecture gates were repeated successfully. No full framework suite was run. C: remains over 254 GB free, above the 20 GB floor.

## Exact file inventory

- M `docs/framework/appkit-counterparts.json`
- M `docs/framework/fx/README.md`
- M `docs/framework/fx/xr.md`
- A `docs/superpowers/evidence/2026-11-08-fx-fidelity/xr-evidence.md`
- M `scripts/quality/architecture-boundaries.json`
- M `scripts/synware/installed-consumer.mjs`
- A `src/FX/XRFX/XRFXAnchor.ts`
- A `src/FX/XRFX/XRFXCamera.ts`
- A `src/FX/XRFX/XRFXConfiguration.ts`
- A `src/FX/XRFX/XRFXError.ts`
- A `src/FX/XRFX/XRFXFrame.ts`
- A `src/FX/XRFX/XRFXOrientationTrackingConfiguration.ts`
- A `src/FX/XRFX/XRFXRaycastQuery.ts`
- A `src/FX/XRFX/XRFXRaycastResult.ts`
- A `src/FX/XRFX/XRFXRaycastTarget.ts`
- A `src/FX/XRFX/XRFXRaycastTargetAlignment.ts`
- A `src/FX/XRFX/XRFXSessionRunOptions.ts`
- A `src/FX/XRFX/XRFXSession.ts`
- A `src/FX/XRFX/XRFXSessionDelegate.ts`
- A `src/FX/XRFX/XRFXTrackingState.ts`
- A `src/FX/XRFX/XRFXTrackingStateReason.ts`
- A `src/FX/XRFX/XRFXWorldAlignment.ts`
- A `src/FX/XRFX/XRFXWorldTrackingConfiguration.ts`
- A `src/FX/XRFX/internal/xrBindings.ts`
- A `src/FX/XRFX/internal/xrObjects.ts`
- A `src/FX/XRFX/internal/xrPort.ts`
- A `src/FX/XRFX/internal/xrSupport.ts`
- M `src/FX/XRFX/public.ts`
- M `src/SynCloudOS/AppSDK/appContextTypes.ts`
- M `src/SynCloudOS/AppSDK/appRuntimeFacade.ts`
- M `src/SynCloudOS/AppSDK/createSynWareContextValue.ts`
- M `src/SynCloudOS/AppSDK/hooks/useXR.ts`
- M `src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts`
- D `src/SynCloudOS/AppSDK/mountedXRClient.ts`
- A `src/SynCloudOS/AppSDK/mountedXRPort.ts`
- M `src/SynCloudOS/AppSDK/scos/scosFacade.ts`
- M `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`
- M `src/SynCloudOS/AppSDK/testing/testHostTypes.ts`
- M `src/SynCloudOS/InstalledApplications/capabilityReport.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserXRAdapter.ts`
- M `src/SynCloudOS/Runtime/runtimeInstanceTypes.ts`
- A `tests/fixtures/xr-attribution/consumer.test.tsx`
- A `tests/fixtures/xr-attribution/public-types.ts`
- A `tests/fixtures/xr-attribution/src/SynWare/First.app/Contents/Info.ts`
- A `tests/fixtures/xr-attribution/src/SynWare/First.app/Contents/index.tsx`
- A `tests/fixtures/xr-attribution/vitest.config.mjs`
- M `tests/runtime/fx/phase5-mounted.test.tsx`
- M `tests/runtime/fx/phase5-package-gate.test.ts`
- M `tests/runtime/fx/phase5-packed.test.ts`
- A `tests/runtime/fx/phase5-xr-hook.test.tsx`
- M `tests/runtime/fx/phase5-xr.test.ts`
- A `tests/runtime/fx/xr-apple.test.ts`
- A `tests/runtime/fx/xr-counterparts.test.ts`
- A `tests/runtime/fx/xr-flow.test.ts`
- A `tests/runtime/fx/xr-host-boundary.test.ts`
- A `tests/runtime/fx/xr-packed.test.ts`
- A `tests/runtime/fx/xr-public-types.test.ts`
- M `tests/runtime/privacy-new-fx.test.ts`

## Frozen source and package proof

All 59 owned paths are explicitly staged after source/test/shipped-document gates. Original line endings, strict UTF-8, no BOM/mojibake, scoped working/staged whitespace, and working/index byte identity are audited in `xr-format-audit.json` and `xr-staged-checks.json`. `xr-frozen-inputs.json` records every frozen implementation/test/shipped-document hash. Root PLAN/REPORT and unrelated files are not staged. A single SDK build and independent immutable installed proof run after the frozen milestone. Any source correction invalidates those receipts and requires a new freeze/build/proof.

The exact final FX commit SHA is recorded in `xr-commit.txt` and the parent's final report, avoiding a self-referential hash inside this committed evidence. Successful archive/entry/graph receipts and committed-byte verification will be appended after the frozen package gates.

## Independent review correction wave

The first frozen archive (`9a4dd370b330505b4e307dd555e9fb4854fe27ec00078d817180ef69e165dbbb`, source `ca24a57908b371a2bf3f409350ec450b3555f19e79ceeb324da03782122fddc6`, resources `0fde456eaa5c8b00f6d1446895e344b914c3b5ef30cd2185757284fc0ea70404`) passed one SDK build and all three immutable packed gates, including three nested installed application scenarios. It is superseded by this correction; no commit used that draft receipt.

The combined review identified two Important findings and the implementation audit identified a precise asynchronous resource handoff race. All are corrected together before a replacement freeze:

1. **Option-set naming:** Apple's primary documentation declares `ARSession.RunOptions` with preciseIdentifier `c:@E@ARSessionRunOptions`. The framework prefix rule therefore yields `XRFXSessionRunOptions`, now used by its filename, class signatures, barrel, tests, strict installed consumer, guide and counterpart mapping. The draft shorter name is removed with no alias; only a negative export assertion retains it.
2. **Spontaneous native end:** the browser previously disposed its local layer but did not release the mounted session slot or clear the real session's active-run state. A private `ended` callback now carries the actual native lifecycle through the mounted port to `XRFXSession`. It removes only that run's slot, invalidates queued/in-flight frame/raycast/anchor work, clears current run/frame state and permits explicit tracking-reset restart. The native-ended transport is not paused/ended again, and old callbacks cannot affect a replacement. No invented public `sessionDidEnd` delegate is added. End during startup handoff is covered.
3. **Resource ownership handoff:** abort could run after `browserDeviceOperation` resolved but before `start` assigned its session/layer field. Since stop had already cached an empty close, the late assignment leaked. The adapter now checks stopped/signal state while each acquired handle is still a local value and releases that exact value before dropping it. Native-session and render-layer microtask-gap regressions use resolve → queued abort → awaiting continuation, rather than only abort-before-resolution.

`xr-review-red.log` reproduced **8 failures** before these changes (43 previous tests remained green). `xr-review-green.log` confirms **51/51 tests across 3 files**. Natural-end coverage includes three consecutive starts beyond the two-slot limit, queued stale frames, old rejection/duplicate end isolation, pending raycast invalidation, end during startup and exact-once layer cleanup. The plugin fixture is extended with the narrow test-only `endSessions` control and exercises three consecutive natural-end/restart cycles through the actual compiled `.app`. `xr-review-plugin-red.log` records the missing-control failure before its addition.

All implementation changes remain within the original 59 owned paths, with the option-set filename replaced. The original six CRLF files retain their newline convention. Final correction source gates, encoding/index audit, frozen hashes, package proof and exact commit verification follow below. No additional feature or polish work was introduced.

### Corrected source gates and replacement freeze

- `xr-review-focused.log`: **92/92 tests, 14 files, exit 0**; full command is printed at the top of the log.
- `xr-review-affected-host.log`: **22/22 tests, 6 files, exit 0**, covering the same affected public runtime/host integrations.
- `npx vitest run --config tests/fixtures/xr-attribution/vitest.config.mjs` → `xr-review-plugin.log`: **3/3 real compiled application scenarios, exit 0**, now including repeated natural-end/restart flow.
- Framework and old-SDK sibling site `npx tsc -b --pretty false` → `xr-review-framework-typecheck.log`, `xr-review-site-typecheck.log`: **both exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` → `xr-review-architecture.log`: **1,795 files / 8,169 edges validated**.

The corrected 59-path inventory is `xr-owned-paths.json`. `xr-review-format-audit.json`, `xr-review-staged-checks.json` and `xr-review-frozen-inputs.json` replace the first freeze's byte receipts. A fresh SDK build and immutable installed proof will use only these corrected bytes; read-only re-review overlaps that proof. The packed declaration/runtime assertions explicitly reject the old draft option-set name as well as the original browser-shaped API. No source changes are permitted after this replacement freeze.

### Final natural-end refusal correction

The second candidate archive (`a168c07ddb907477a053fae9767e26bccd73a7c113781fe2f1ba0e8d1d864896`, source `62c2743a2690cfa0089cfec1b408a292614f7e5df02a468b5d6c8a3535ef40b7`, resources `bb515db422238e8f8c050f4de8984475f99f1a6487e06b8f6aab8f0f495620dd`) also passed its single build and all three immutable gates. Final review found one remaining Important privacy issue: natural-end cleanup could reject with a native refusal after the private ended callback had already retired authority, and the adapter swallowed that rejection. This second candidate is superseded as well; no draft candidate was committed.

The final correction changes only the browser adapter, its direct regression test, and this evidence. Natural-end finalization is synchronous because it does not call native `end()`. Its raw cleanup refusal now travels through the existing failure/privacy path synchronously before `ended` retires authority. Closing state is published before cleanup or callbacks, preserving exact-once cleanup when privacy withdrawal re-enters stop. Normal natural end still immediately invalidates old work. A fresh grant and replacement started before old cleanup microtasks drain remain isolated from the old refusal and resources.

`xr-native-end-denial-red.log` reproduces **2 failures** with saved granted consent, a pending native hit source and SecurityError from cancellation on native end. The replacement variant restores native/app consent and starts the new run before old cleanup microtasks drain. `xr-native-end-denial-green.log` then passes **53/53 tests, 3 files**, including the exact native/privacy path and the actual host boundary.

Final source gates on these bytes:

- `xr-final-focused.log`: **94/94 tests, 14 files, exit 0**; command printed in the log.
- `xr-final-affected-host.log`: **22/22 tests, 6 files, exit 0**.
- `xr-final-plugin.log`: **3/3 real compiled application scenarios, exit 0**.
- `xr-final-framework-typecheck.log`, `xr-final-site-typecheck.log`: framework and old-SDK site `npx tsc -b --pretty false`, **both exit 0**.
- `xr-final-architecture.log`: **1,795 files / 8,169 edges validated**.

The final 59-path source/index freeze is recorded in `xr-final-format-audit.json`, `xr-final-staged-checks.json` and `xr-final-frozen-inputs.json`. These supersede earlier freeze receipts. Only this final fingerprint is eligible for the accepted immutable proof and commit.

## Approved final immutable receipt and commit

The final focused re-review is **PASS / Approved**, with no remaining Critical, Important or Minor findings. No source/test/shipped-document bytes changed during re-review or final package proof.

- `npm run sdk:build` → `xr-final-sdk-build.log`: **exit 0**, one build for the final freeze. The two superseded candidate freezes are documented above. Existing SDK circular-chunk/execution-order warnings remain in the aggregate warning ledger; this family made no bundler changes.
- `npx vitest run tests/runtime/fx/xr-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → `xr-final-packed.log`: **3/3 packed gates, 3 files, exit 0**, including **3/3 nested actual installed XR application scenarios**.
- Independent installation outside the repository, production bundle/import, strict installed TypeScript, sixteen runtime exports and the protocol, actual Foundation UUID/AFX matrix types, and shared attribution-runtime identity pass. The original browser API and draft shorter option-set spelling have no aliases.
- All five actual declaration graphs (`index`, `sdk`, `sdk/testing`, `browser`, `fx/xr`) reach **zero XR internal, mounted transport or browser adapter modules**. Private package subpaths remain blocked. Installed resource integrity remains unchanged after proof.
- `xr-final-installed.json` contains exact archive/entry/declaration/resource hashes and graph counts. `xr-final-frozen-verification.json` reports **currentSourceMatches true**, separately from the actual installed behavior proof. Frozen source/test/shipped-document hashes still match both working and index bytes.
- Final archive SHA-256: `5d4d57e0566f91f7c5a78d3a1159d503cee3181ef4e8d5b794648d3b31400fd4`.
- Final SDK source SHA-256: `ced5ae1aec20711ecc072e297ac43ca3cc71ca0d75652859213109e8d50a01cd`.
- Final resources SHA-256: `9b1bc3d4dee2e1cc48e543d33ff380576320df09341c5cb537a6bd51f7f712a5`.
- Final owned-source freeze SHA-256: `1a3c4e17173048d0e5158cb07ec1a9980ceb1178f230cf80bb3e4b4e0a5ada4a`.

The approved explicit-path commit is **FX: rebuild XRFX with attributed ARKit classes**. `xr-commit.txt` records its exact SHA; `xr-postcommit-verification.json` verifies the committed 59-path byte inventory and final SDK source fingerprint. This evidence file is included in that commit, so its own final commit hash is kept in the companion receipt rather than embedded self-referentially. Root PLAN/REPORT, unrelated files and sibling site work remain unstaged. Full serial framework acceptance, final SDK adoption/Gallery work and physical-device validation remain with the parent aggregate task. C: remains over 254 GB free.
