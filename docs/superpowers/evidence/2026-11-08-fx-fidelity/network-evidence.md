# NetworkFX fidelity evidence - 8 November 2026

## Scope and provenance

Worktree: `C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/framework`, branch `fix/blind-rewrite-friction`. Starting reviewed commit: `8d517c4f43946eac23b8de46424fd48d0f71b98a`. Option A and Dispatch 1-6 were already complete. Root owns PLAN/REPORT. No other family implementation, site source, protected config, Fusion, branches, pushes, stashes, worktrees or servers were changed.

Apple primary pages were read directly as Markdown from developer.apple.com on this date: [NWPathMonitor](https://developer.apple.com/documentation/network/nwpathmonitor), [NWPath](https://developer.apple.com/documentation/network/nwpath), [NWInterface](https://developer.apple.com/documentation/network/nwinterface), [NWError](https://developer.apple.com/documentation/network/nwerror), [NWPath.Status](https://developer.apple.com/documentation/network/nwpath/status-swift.enum), [NWPath.UnsatisfiedReason](https://developer.apple.com/documentation/network/nwpath/unsatisfiedreason-swift.enum), [NWInterface.InterfaceType](https://developer.apple.com/documentation/network/nwinterface/interfacetype), and Monitor cancel/currentPath. The browser search connector identified the pages but could not fetch their Markdown content type; direct HTTPS fetched the primary Markdown successfully.

## Public export and member mapping

Seven named public exports; each is a real runtime value. The three case objects also export their same-named TypeScript union types. The counterpart test enumerates actual module exports via both runtime import and the TypeScript checker and requires the exact mapping. public.ts contains re-exports only.

All files in this table are under src/FX/NetworkFX.

| Apple type/member | Our type/member | File | Support/error |
|---|---|---|---|
| NWPathMonitor.init(), init(requiredInterfaceType:), init(prohibitedInterfaceTypes:) | NWFXPathMonitor constructor overloads | NWFXPathMonitor.ts | Real attributed class, passively captures one app session; EACCES for denied launch entitlement, ENXIO/ EINVAL/ ECANCELED for missing/ambiguous/ended session. |
| NWPathMonitor.pathUpdateHandler | NWFXPathMonitor.pathUpdateHandler | NWFXPathMonitor.ts | Nullable handler; initial and update events execute as Dispatch items and recheck lifetime/access at delivery. |
| NWPathMonitor.currentPath | NWFXPathMonitor.currentPath | NWFXPathMonitor.ts | Latest delivered actual Path; ENOTSUP before first observation, fails after cancellation/revocation. |
| NWPathMonitor.queue, start(queue:) | NWFXPathMonitor.queue, start(queue) | NWFXPathMonitor.ts | Readonly queue, null before start; null/omitted start queue uses the selected app main queue. Repeated live start is idempotent. Required/prohibited filters need observed transport or fail ENOTSUP. |
| NWPathMonitor.cancel() | NWFXPathMonitor.cancel() | NWFXPathMonitor.ts | Terminal, idempotent cancellation; removes native subscription, drops pending delivery. |
| NWPath.status | NWFXPath.status | NWFXPath.ts | Coarse browser online satisfied/unsatisfied hint; does not establish endpoint reachability. |
| NWPath.unsatisfiedReason | NWFXPath.unsatisfiedReason | NWFXPath.ts | Observed reason or ENOTSUP; filtering a known excluded transport produces notAvailable. |
| NWPath.availableInterfaces | NWFXPath.availableInterfaces | NWFXPath.ts | Actual issued Interface instances only; browser inability to enumerate names/indices gives ENOTSUP. |
| NWPath.isExpensive | NWFXPath.isExpensive | NWFXPath.ts | Explicit cellular or reliable metered observation; otherwise ENOTSUP. |
| NWPath.isConstrained | NWFXPath.isConstrained | NWFXPath.ts | Save-Data mapping; missing observation gives ENOTSUP. |
| NWPath.supportsIPv4, supportsIPv6, supportsDNS | NWFXPath.supportsIPv4, supportsIPv6, supportsDNS | NWFXPath.ts | Actual host routing/configuration observations only; browser adapter supplies none, so all three throw ENOTSUP. |
| NWPath.usesInterfaceType(_:) | NWFXPath.usesInterfaceType(type) | NWFXPath.ts | Actual observed transports only; unknown transport gives ENOTSUP. |
| NWInterface.type, name, index | NWFXInterface.type, name, index | NWFXInterface.ts | Frozen issued class instance without public initializer; browser adapter never fabricates interfaces. |
| NWPath.Status cases | NWFXPathStatus value/type | NWFXPathStatus.ts | Frozen satisfied, unsatisfied, requiresConnection cases; browser emits first two only. |
| NWPath.UnsatisfiedReason cases | NWFXPathUnsatisfiedReason value/type | NWFXPathUnsatisfiedReason.ts | Frozen notAvailable, cellularDenied, wifiDenied, localNetworkDenied, vpnInactive; current primary docs include vpnInactive. |
| NWInterface.InterfaceType cases | NWFXInterfaceType value/type | NWFXInterfaceType.ts | Frozen other, wifi, cellular, wiredEthernet, loopback. Effective speed never establishes transport. |
| NWError.posix, dns, tls, wifiAware | NWFXError.posix, dns, tls, wifiAware | NWFXError.ts | Associated numeric cases use static constructors and readonly code/error. Darwin POSIX values: EACCES 13, ENOTSUP 45, ECANCELED 89, ENXIO 6, EINVAL 22, EMFILE 24, EIO 5. |

NWPath and NWInterface are Swift structures; immutable TypeScript classes provide the required runtime identities without host snapshot initializers. The agreed member list is implemented. Connection/listener APIs, gateways/endpoints, new link-quality members, async iterator and ethernetChannel are outside this pass.

## Authority, lifetime and browser decisions

- Network has no consent API. Attribution remains necessary because network.read is an existing launch entitlement and host access/lifetime must remain mandatory. No authorization enum, capability object, public client or factory is introduced.
- Context-construction timing is retained. createSynWareContextValue already obtains private environment clients; it now associates its frozen context with its Network port before publishing the SCOS session. No early-process/services infrastructure was added.
- Construction uses Option A createFXSessionBinding through fxRuntimeContracts. The base class reports the plugin/application-bundle requirement. Missing/ambiguous/ended sessions use NWFXError. A captured session cannot move to another runtime.
- Object.defineProperty installs the attributed marker; no public computed static member exposes metadata. ECMAScript private fields keep runtime metadata/context/port imports out of class declarations.
- The private port tracks an access generation. Runtime observers cover store, configuration profiles and canonical identity. Existing injected test permission/policy gates expose internal observation for deterministic false-then-true tests. Access loss immediately cancels subscriptions and invalidates older instances; restoration cannot validate an older generation.
- Active monitors observe observeFXSessionEnd and access loss. Registry removal without abort is terminal. Native callbacks and Dispatch closures each recheck access and cancellation. The eight-monitor bound remains for active native observations; construction starts no subscription.
- The hook binds to its actual React context's registered session, even when another runtime mounts the same app ID. Its private per-class binding is nonambient. useInsertionEffect owns actual unmount/context replacement; layout replay does not cancel the terminal monitor. Discarded render instances acquire no native subscriptions.
- currentPath throws ENOTSUP until the first queued observation rather than inventing an initial route. It rejects reads after cancellation/revocation. Paths update just before handlers. The affected member documents this timing limitation.
- Save-Data maps to isConstrained. Explicit cellular maps to expensive; otherwise a reliable metered boolean is used. Unknown cost, constrained state, interface enumeration, IP routing, DNS or unsatisfied reason throws ENOTSUP on the Apple member. No probes, polling or background network requests were added.
- Filtering an observed but excluded transport gives unsatisfied/notAvailable and empty allowed transports/interfaces. If filtering becomes unobservable, the monitor fails terminally and discards older queued paths.

## Removed names and migrated consumers

Removed public NWFXAuthorizationStatus, NWFXCapabilities, NWFXPathClient; removed NWFXNetworkPathAdapter from the former public class module. Removed authorizationStatus, requestAuthorization, capabilities, createMonitor, dispose, and callback-taking start(listener) from the public Network surface. Removed path interfaceType, effectiveType, downlinkMegabitsPerSecond, roundTripTimeMilliseconds, saveData, source.

Removed SynWareContextValue.network, bound/unbound SCOSFacade.network forwarders, and the frozen context's network property. Deleted mountedNetworkClient.ts and its factory, replacing it with private mountedNetworkPort. Internal MountedAppEnvironmentClients.network now holds NetworkPort. SynCloudOSRuntimeEnvironment no longer has a networkPaths property; native adapters are held in a private WeakMap keyed by the environment object.

Migrated useNetwork to a real monitor; browser observations; old Network tests; strict packed public type probe; empty-entry package gate; network.md and FX README; counterpart JSON/developer lookup verification. Existing SDK/compiler registration already points at NetworkFX/public.ts; no new subpath or alias was needed. Architecture configuration replaces the deleted mountedNetworkClient path with mountedNetworkPort; no exception was added.

Site deferral: sibling site remains on prerelease with its old installed SDK and passes its typecheck. `site/src/SynWare/NSEControlGallery.app/Contents/Gallery/FXCapabilitiesSection.tsx` lines 71-79 still use old useNetwork/createMonitor/start(listener) and render interfaceType/effectiveType/saveData. Migrate atomically with final SDK adoption/Gallery work: construct a fresh NWFXPathMonitor on each Start, assign pathUpdateHandler, start on queue/default, cancel on stop/unmount, catch unsupported Apple observations. Terminal monitors cannot restart after Stop. No shim was added. Gallery browser validation remains with that adoption task.

## Verification receipts

- network-initial-red.log: both original RED failures reproduced (missing constructor; stale false-to-true callback).
- network-adapter-red.log: five expected browser/package runtime gate failures before migration.
- network-hook-red.log: old frozen facade could not accept pathUpdateHandler.
- network-plugin-red.log: actual fixture exposed the missing fake Network port; sensitive test-host gates also correctly required explicit allow.
- network-counterparts-red.log: missing NWInterface mapping.
- network-edge-red.log: four expected failures for terminal unobservable-filter update, invalid filter, vpnInactive and wifiAware; resolved without weakening assertions.
- network-core-green.log: 20 tests in four files before final edge additions.
- network-hook-green.log: StrictMode root, two layout setups, one native subscription, immediate actual-unmount cleanup, another same-app runtime present.
- network-plugin-first-green.log: two source-entry plugin-compiled app tests passed using the normal test-host API.
- network-focused.log: 95 tests across 13 files passed, covering Network, context/SCOS/test-host, Option A and Dispatch app binding.
- network-framework-typecheck.log and network-site-typecheck.log: both repository npx tsc -b checks passed.
- network-architecture.log: 1,682 files / 7,655 edges validated without exceptions.
- network-sdk-build.log is NOT an acceptance receipt: initial build correctly rejected its changed-source fingerprint after final byte cleanup. Windows writes initially introduced CRLF/ANSI bytes in rewritten Network files; these were repaired to UTF-8/LF before replacement build. Large integration files retain narrow Network hunks. Both staged and working diff checks passed, including every new file, before replacement build. Source/shipped-doc/build inputs then froze.

The final frozen-byte checks and commit receipt are recorded below.

### Public host boundary correction after focused review

Review of 91eda3e found an Important rule-1 violation: the existing `/browser` export `createSynCloudOSHostContribution(id, source, prepare)` inferred a full `SynCloudOSRuntimeEnvironment` for prepare's argument, whose optional networkPaths member exposed NetworkPathAdapter.currentPath/subscribe and NetworkPathSnapshot. A second real public route was `/sdk/testing.createDeterministicRuntimeEnvironment().environment.networkPaths`. The earlier direct Network/SCOS declaration checks did not cover these signatures. The initial host-visibility caveat is superseded by this correction.

The adapter is now privately associated with its environment identity in `src/FX/NetworkFX/internal/networkPort.ts` using a WeakMap. `SynCloudOSRuntimeEnvironment.networkPaths` is deleted entirely, rather than hidden behind one callback alias. `createBrowserRuntimeEnvironment` and the deterministic testing environment register the same native adapters in that private association without putting a property on their returned objects. The mounted runtime uses networkAdapterFor(runtime.environment), then the existing mountedNetworkPort authority path. InstalledApplications/capabilityReport uses the same internal lookup. No generic host callback or other family contract was narrowed or redesigned. Context-to-authorized-port association, permission/generation checks, exact-session queues, and native subscription teardown are unchanged.

Both confirmed inferred routes are therefore closed, including indexed type extraction. Runtime tests also check that the key is absent on browser/test/contribution environment objects while private observations still deliver and dispose. Public testing retains only its intended Network control: allow/deny/fail/reset, setStatus and activeMonitorCount, with no native currentPath/subscribe surface. The public-types fixture additionally rejects Network factories through root SCOS, SDK SCOS, SynWareContextValue and test-host appContext, and confirms positive unrelated environment.now and fake setStatus typing.

`network-boundary-installed-red.log` proves the old immutable installed SDK failed the strict regression with four TS2578 unused-expect-error errors, specifically the direct/indexed browser callback and exported testing environment routes. `network-boundary-runtime-red.log` proves both old environment objects exposed the property. The fixed source compile uses the same strict fixture and the normal source ambient declarations; no diagnostics are filtered or suppressed. The final immutable installed check repeats that exact fixture against `/browser`, `/sdk/testing`, `/sdk`, root and Network entry declarations.

Raw module-load scans can still include unrelated runtime declarations because existing fontAccess or host files contain internal signatures. They are not used as a substitute for the inferred-public-signature regression. No Network adapter remains on the environment model to extract through those signatures. The public Network class graph remains seven type files plus public.d.ts with no private metadata, port or browser-fact API.

### Initial acceptance before boundary review (superseded below)

- network-focused-final.log: **95/95 tests, 13/13 files**, passed on final staged source bytes.
- network-framework-typecheck-final.log: **npx tsc -b passed** after byte cleanup. Site's unchanged installed SDK remains covered by network-site-typecheck.log.
- network-sdk-build-final.log: SDK archive build passed against the frozen input fingerprint.
- network-packed.log: **1/1 packed integration test passed**, including **2/2 actual installed plugin-compiled app tests**, Vite production build, actual family entry import, one attribution runtime graph, strict installed TypeScript probe, declaration checks and post-proof SDK resource integrity.
- network-installed.json: archive SHA-256 `0fe9addc76709ec8bf15b5698e5f6d743d49569c98c87da3fb0e53d59d9f13d4`; source SHA-256 `a5608b2de269050653950fc76aec9fa911b3ddd38b2cead2523be2846ca4b74d`; resources SHA-256 `862eadd708d2999b71354e6628c519517ca5f38db19509687bda0c4d3ab80262`. Consumer installed outside repository without links; temporary consumer cleaned by the standard harness.
- Full suite deliberately not run; final serial acceptance belongs to root after all families.
- Last C: measurement: 274,058,117,120 bytes free, comfortably above the 20 GB floor.

Commit: one explicit-path commit titled **FX: rebuild NetworkFX with attributed Apple path monitors**. Exact SHA and staged inventory are returned to root and written in network-commit.txt after committing; this avoids a self-referential commit hash in its own content. The commit contains only the inventory below and this evidence file.

## Exhaustive file inventory

The list below is the explicit-path source/test/doc inventory. This evidence file is also included. Root PLAN/REPORT and unrelated untracked evidence are excluded. New runtime files are Error/Interface/three cases, three internal helpers and mountedNetworkPort. Path/Monitor/public replace their old interface-only contents. New tests are seven network-* files and the five fixture files; existing networkPaths/package-gate tests are migrated. The two inherited RED files now exercise actual implementations; network-revocation-red no longer imports the deleted factory.
- docs/framework/appkit-counterparts.json
- docs/framework/fx/README.md
- docs/framework/fx/network.md
- scripts/quality/architecture-boundaries.json
- scripts/synware/installed-consumer.mjs
- src/FX/NetworkFX/NWFXError.ts
- src/FX/NetworkFX/NWFXInterface.ts
- src/FX/NetworkFX/NWFXInterfaceType.ts
- src/FX/NetworkFX/NWFXPath.ts
- src/FX/NetworkFX/NWFXPathMonitor.ts
- src/FX/NetworkFX/NWFXPathStatus.ts
- src/FX/NetworkFX/NWFXPathUnsatisfiedReason.ts
- src/FX/NetworkFX/internal/networkPort.ts
- src/FX/NetworkFX/internal/networkSessionBindings.ts
- src/FX/NetworkFX/internal/pathValues.ts
- src/FX/NetworkFX/public.ts
- src/SynCloudOS/AppSDK/appContextTypes.ts
- src/SynCloudOS/AppSDK/appRuntimeFacade.ts
- src/SynCloudOS/AppSDK/createSynWareContextValue.ts
- src/SynCloudOS/AppSDK/hooks/useNetwork.ts
- src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts
- src/SynCloudOS/AppSDK/mountedNetworkClient.ts
- src/SynCloudOS/AppSDK/mountedNetworkPort.ts
- src/SynCloudOS/AppSDK/scos/scosFacade.ts
- src/SynCloudOS/AppSDK/testing/fakeAdapters.ts
- src/SynCloudOS/AppSDK/testing/testHostTypes.ts
- src/SynCloudOS/PlatformAdapters/BrowserNetworkPathAdapter.ts
- src/SynCloudOS/Runtime/runtimeInstanceTypes.ts
- tests/fixtures/network-attribution/consumer.test.tsx
- tests/fixtures/network-attribution/src/SynWare/First.app/Contents/Info.ts
- tests/fixtures/network-attribution/src/SynWare/First.app/Contents/index.tsx
- tests/fixtures/network-attribution/vitest.config.mjs
- tests/runtime/fx/network-apple.test.ts
- tests/runtime/fx/network-counterparts.test.ts
- tests/runtime/fx/network-hook.test.tsx
- tests/runtime/fx/network-packed.test.ts
- tests/runtime/fx/network-revocation-red.test.ts
- tests/runtime/fx/networkPaths.test.ts
- tests/runtime/fx/phase5-package-gate.test.ts

### Boundary correction final acceptance

The family commit is amended to retain one Network commit. Earlier archive hashes above describe the superseded pre-review artifact, not the boundary-corrected build.

- `network-boundary-installed-red.log`: strict old installed SDK fails with exactly four TS2578 unused-expect-error errors for direct/indexed callback and testing environment adapter routes.
- `network-boundary-runtime-red.log` then `network-boundary-runtime-green.log`: both runtime property-exposure regressions fail before, then **2/2 pass** with internal adapter delivery/disposal retained.
- `network-boundary-source-types.log`: **1/1 pass**, the same strict public-types fixture compiled against source entries and the repository's normal ambient declarations.
- `network-boundary-focused.log`: **111/111 tests in 18/18 files pass**, including the original Network/Option A/Dispatch/context tests plus boundary regressions and host-contribution integration.
- `network-boundary-plugin.log`: **2/2 source plugin-compiled .app tests pass** after private association, including awaited/timer/callback construction, permission revocation/restoration, stale delivery rejection and teardown.
- `network-boundary-framework-typecheck.log`, `network-boundary-site-typecheck.log`: both repository **npx tsc -b pass**. Root confirmed no site source/test/script use of networkPaths or adapter types requiring migration.
- `network-boundary-architecture.log`: **1,682 files / 7,658 edges validated**, no exceptions.
- All 12 amendment files were staged and UTF-8/LF validated; both working and staged diff checks passed before the single boundary-correction SDK freeze/rebuild. Disk remained over 274 billion bytes free.

- `network-boundary-sdk-build.log`: the single boundary-correction rebuild **passed** on the staged, frozen inputs; no source, shipped-documentation or build-input changes followed it.
- `network-boundary-packed.log`: **2/2 packed tests passed**, comprising the real installed plugin .app flow (2/2 nested tests, await/timer/callback/denial/revocation/teardown), production bundle/import/declaration/resource checks, and the new strict installed browser/testing/root/SDK inference regression. The same four directives that were unused in RED are now required type errors. Installed package resources remained immutable after both consumers.
- `network-boundary-declaration-graph.json`: root, /sdk, /sdk/testing, /browser and /fx/network declaration graphs each contain **zero Network internal modules**; semantic checker also confirms no networkPaths property on the inferred contribution environment. This complements the actual-signature compiler tests.
- Corrected immutable archive SHA-256: `16b694bccb3fc8402f62c3de25754591558f2582932576f5528d8214cad4db90`.
- Corrected source fingerprint: `feaf64f24db11553d2418a3f30052a7762e78cd787cf1e3f925d2df56189e507`.
- Corrected resources fingerprint: `43c47a3b1ca147906a253dec3a25b0bc7056de8b5b248b5a60fdbfda6ef1118d`.
- Working/staged diff checks pass again before amendment. The fingerprint is compared after amendment as well; evidence-only edits are outside SDK inputs. The amended family commit includes 45 explicit files, and its exact SHA is recorded in network-commit.txt and returned to root.

No Network public-host declaration caveat remains. Gallery still waits for final SDK adoption, and full-suite acceptance remains intentionally deferred to the final serial family gate.

Additional files for the boundary correction:

- src/SynCloudOS/InstalledApplications/capabilityReport.ts - migrate only its Network adapter lookup.
- src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts - privately associate browser adapter; no public environment field.
- tests/fixtures/network-attribution/public-types.ts - strict actual inferred public routes across browser/testing/root/SDK.
- tests/runtime/fx/network-host-boundary.test.ts - missing environment key, retained native delivery/disposal and contribution callback coverage.
- tests/runtime/fx/network-public-types.test.ts - compile the strict fixture against source SDK entries with normal ambient declarations.
