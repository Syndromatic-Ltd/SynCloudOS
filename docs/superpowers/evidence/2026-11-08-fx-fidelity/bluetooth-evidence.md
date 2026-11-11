# BluetoothFX fidelity evidence — 8 November 2026

Implemented from approved base `7da1fa16991294d97aa9b7c6f53c641385c679df` in the shared framework worktree on `fix/blind-rewrite-friction`. This family owns only the 57 paths listed below. Root PLAN/REPORT and unrelated evidence remain outside the commit. No branches, pushes, servers, site configuration, Fusion, or unreviewed family implementation changes.

## Authority and API mapping

The authoritative family review and owner correction require CoreBluetooth's delegate/queue/options ordering and sender-first delegates. Primary references: [CBCentralManager](https://developer.apple.com/documentation/corebluetooth/cbcentralmanager), [CBPeripheral](https://developer.apple.com/documentation/corebluetooth/cbperipheral), [CBPeripheralDelegate](https://developer.apple.com/documentation/corebluetooth/cbperipheraldelegate), [CBUUID](https://developer.apple.com/documentation/corebluetooth/cbuuid), [NSUUID](https://developer.apple.com/documentation/foundation/nsuuid), and Apple's own CoreBluetooth SDK header.

RSSI was investigated separately: the current Apple didDiscover web documentation describes a measured number but omits the unavailable sentinel; IOBluetooth's +127 documentation alone was deliberately not used as evidence for CoreBluetooth. The primary Apple-authored `CBCentralManager.h` in the macOS 11.3 SDK explicitly says at lines 275–277 that **127 is reserved and indicates RSSI was not available** for `centralManager:didDiscoverPeripheral:advertisementData:RSSI:`. The same header defines delegate/queue/options at lines 114–129. A verbatim header copy is `bluetooth-apple-CBCentralManager.h`; [its mirrored source](https://raw.githubusercontent.com/phracker/MacOSX-SDKs/master/MacOSX11.3.sdk/System/Library/Frameworks/CoreBluetooth.framework/Versions/A/Headers/CBCentralManager.h) preserves Apple's copyright and API comments. The transport uses 127 as unavailable, never as a measured signal. readRSSI reports the unavailable number together with an explicit operationNotSupported error.

Each following file is under `src/FX/BluetoothFX/` unless noted. `public.ts` only re-exports. Every runtime and protocol/type export is covered by the TypeScript checker plus developer-MCP counterpart lookup; there are 14 runtime exports and two delegate interfaces.

| Apple → ours | File | Exact admitted members and behavior |
| --- | --- | --- |
| CBManager → BTFXManager | BTFXManager.ts | Abstract state; static authorization. Attribution is private runtime metadata. No public capability or authorization request object. |
| CBManagerState → BTFXManagerState | BTFXManagerState.ts | unknown, resetting, unsupported, unauthorized, poweredOff, poweredOn. Browser state remains unknown until a real availability answer; API existence alone does not fabricate radio power. |
| CBManagerAuthorization → BTFXManagerAuthorization | BTFXManagerAuthorization.ts | notDetermined, restricted, denied, allowedAlways. Shared app privacy is authoritative; entitlement/policy restriction is restricted. |
| CBCentralManager → BTFXCentralManager | BTFXCentralManager.ts | constructor(delegate?, queue?, options?), delegate, state, isScanning, scanForPeripherals(withServices, options), stopScan, connect(peripheral, options), cancelPeripheralConnection, retrievePeripherals(withIdentifiers), retrieveConnectedPeripherals(withServices). Queue selection uses dispatchQueueForSession(exactSelectedSession).main. System-wide retrieval and nonempty native options throw operationNotSupported. Local retrieval returns only this central's discovered, consented identifiers. |
| CBCentralManagerDelegate → BTFXCentralManagerDelegate | BTFXCentralManagerDelegate.ts | Required centralManagerDidUpdateState; optional centralManagerDidDiscoverPeripheral(central, peripheral, advertisementData, rssi), centralManagerDidConnect, centralManagerDidFailToConnect, centralManagerDidDisconnectPeripheral. All sender first; error is BTFXError or null. |
| CBPeripheral → BTFXPeripheral | BTFXPeripheral.ts | identifier: NSEUUID; name; state; delegate; services; discoverServices; discoverIncludedServices; discoverCharacteristics; discoverDescriptors; readValue(characteristic) / readValue(descriptor); writeValue(data, characteristic, type) / writeValue(data, descriptor); setNotifyValue; readRSSI; maximumWriteValueLength. Methods return void and update properties/delegates, with no read/write promises. Included-service/RSSI failures use their delegate. MTU/maximum length throws operationNotSupported. |
| CBPeripheralState → BTFXPeripheralState | BTFXPeripheralState.ts | disconnected, connecting, connected, disconnecting. |
| CBPeripheralDelegate → BTFXPeripheralDelegate | BTFXPeripheralDelegate.ts | peripheralDidDiscoverServices; peripheralDidDiscoverIncludedServicesForService; peripheralDidDiscoverCharacteristicsForService; peripheralDidDiscoverDescriptorsForCharacteristic; peripheralDidUpdateValueForCharacteristic; peripheralDidUpdateValueForDescriptor; peripheralDidWriteValueForCharacteristic; peripheralDidWriteValueForDescriptor; peripheralDidUpdateNotificationStateForCharacteristic; peripheralDidReadRSSI. Sender first in every method. |
| CBAttribute → BTFXAttribute | BTFXAttribute.ts | Abstract superclass, readonly uuid: BTFXUUID. |
| CBService → BTFXService | BTFXService.ts | uuid, peripheral, isPrimary, nullable characteristics and includedServices. Actual instances created only by discovery. |
| CBCharacteristic → BTFXCharacteristic | BTFXCharacteristic.ts | uuid, service, value: NSEData or null, properties, isNotifying, nullable descriptors. Copies values; no exposed native wrapper. |
| CBCharacteristicProperties → BTFXCharacteristicProperties | BTFXCharacteristicProperties.ts | Apple option bits: broadcast 1, read 2, writeWithoutResponse 4, write 8, notify 16, indicate 32, authenticatedSignedWrites 64, extendedProperties 128, notifyEncryptionRequired 256, indicateEncryptionRequired 512. |
| CBCharacteristicWriteType → BTFXCharacteristicWriteType | BTFXCharacteristicWriteType.ts | withResponse, withoutResponse. No success write delegate for withoutResponse, matching Apple. |
| CBDescriptor → BTFXDescriptor | BTFXDescriptor.ts | uuid, characteristic, nullable value. Foundation bytes, string or number; browser native DataView does not escape. Standard UUID 2901 decodes UTF-8; 2900/2902/2903 decode little-endian unsigned 16-bit number; other descriptor values remain NSEData. |
| CBUUID → BTFXUUID | BTFXUUID.ts | Constructor overloads from 16/32/128-bit strings, NSEData and NSEUUID; uuidString, data, isEqual. Bluetooth base-UUID equality and immutable snapshots. Invalid strings/lengths use invalidParameters. Browser service aliases are not accepted. |
| CBError → BTFXError | BTFXError.ts | CBErrorDomain; unknown, invalidParameters, invalidHandle, notConnected, outOfSpace, operationCancelled, connectionTimeout, peripheralDisconnected, uuidNotAllowed, alreadyAdvertising, connectionFailed, connectionLimitReached, unknownDevice, operationNotSupported, peerRemovedPairingInformation, encryptionTimedOut, tooManyLEPairedDevices. Raw denial is recorded before conversion; no invented permission error case. |
| NSUUID → NSEUUID | src/Foundation/NSEUUID.ts and public.ts | Required dependency was absent in the repository; owner authorized a minimal genuine immutable Foundation value. Random/default, canonical string and 16-byte initializers, uppercase uuidString, getBytes, isEqual, copy. Defensive byte copies; invalid input throws. No new identity subsystem. |

The admission list does not add peripheral advertising/server roles, background scanning, restoration, pairing administration or L2CAP. The framework's existing prefix and enum representation conventions remain intact.

## Browser limits and decisions

- Web Bluetooth's chooser is one scan and yields one chosen peripheral. The adapter maps each requested UUID to an alternative service filter, preserving Apple's any-service semantics. A null UUID list accepts a device without inventing service grants. GATT service access remains limited to what the chooser/browser granted.
- Advertisement data is an empty dictionary. Device names, requested filters and subsequently discovered services are not presented as advertisement packet observations. RSSI is the documented CoreBluetooth unavailable sentinel, and readRSSI returns operationNotSupported through its delegate.
- The public synchronous scan method cannot return the browser chooser's promise, and CoreBluetooth has no scan-error delegate. Cancel/rejection stops scanning with no discovery; no false peripheral or invented scan delegate is created. Current native denial still revokes shared access. Unsupported state/options fail synchronously before presenting a chooser. This asynchronous browser limitation is documented per member.
- retrievePeripherals synchronously returns this central's authorized discovered cache. It never calls browser getDevices or elevates origin-level grants into app consent. System-wide retrieveConnectedPeripherals fails explicitly. Persistent/cross-process identifier recovery is not claimed.
- Opaque browser IDs are keys in a private per-Bluetooth-object map to new NSEUUID values. They are never cast or parsed as UUIDs. Stable mapping is scoped to the current browser Bluetooth object's process lifetime.
- Native browser GATT objects are shared per device. Private serialization holds the next connection until a retired pending connect resolves and the old native handle is disconnected. This prevents old cleanup from disconnecting a replacement connection. Other controllable native ports preserve their own exact handle ownership too.
- No guessed MTU or maximum write size. Included-service discovery and RSSI measurement fail with Apple-shaped errors. Nonempty manager/scan/connect options fail rather than silently dropping native semantics.
- Notifications are generation-bound. Late enable after a newer disable is explicitly stopped again; late enable after a newer enable cannot stop the replacement. Disabling/disconnecting removes listeners.

## Attribution, consent, queues and hooks

`internal/bluetoothPort.ts`, `bluetoothBindings.ts` and `bluetoothObjects.ts` contain all private associations, transports, metadata and object records. The mounted authority lives in `mountedBluetoothPort.ts`. Existing private environment/context association timing is used before session registration; no ambient app selection, early-service infrastructure or public port factory was added.

Central construction pins the exact selected FXAppSession. Constructor-time state and later queued successes/errors recheck session identity and captured access generation. `observeFXSessionEnd` catches registry removal and abort; access/session/state observers are installed once and released once. Dispatch's per-session main queue owns its separate observer. Revocation, policy/entitlement loss or selected-session end is terminal for the old manager even after consent is restored. Native late successes and failures are dropped; stale raw denial cannot revoke a replacement. Both pending success and rejection are tested for scan, connect, services, characteristics, descriptors, characteristic/descriptor read/write, notify and disconnect. Current native SecurityError/NotAllowedError at every boundary is recorded through privacy.observe before conversion, including disconnect finalization. Connected native handles are released before dropping.

`useBluetooth` returns the actual attributed class. A private deferred-construction marker activates its observers only when React commits through insertion effect, making discarded StrictMode renders passive. Actual unmount disposes the terminal manager. Exact-context matching also supports branding clones by signal plus configured runtime ID; ambiguous duplicate exact mounts are rejected. Another runtime with the same configured ID but different signal is not selected. No old facade or revival shim remains.

A narrow existing test-host control was added: allow/deny/fail/interrupt via the existing generic control plus emitValue and activeConnectionCount. Its native transport is private. createSynWareTestHost's implementation and public entry flow were unchanged. The actual plugin `.app` fixture constructs its attributed central after native await, a timer and callback, then performs the full central/peripheral/service/characteristic/descriptor read/write/notification/disconnect flow and tests native read/disconnect refusal after saved consent.

## Removed API and migrated consumers

Deleted BTFXAuthorizationStatus, BTFXCapabilities, BTFXPeripheralRequest, BTFXBluetoothClient, createMountedBluetoothClient and mountedBluetoothClient.ts. Removed old capability/status/requestAuthorization/createCentralManager/dispose API, browser filters/optionalServices/acceptAllDevices/AbortSignal, string peripheral identifier, isConnected and promise methods on peripheral/service/characteristic. No aliases.

Migrated runtime environment construction, private mounted registry, runtime facade, context assembly, SCOS facade, useBluetooth, capability report, deterministic test adapters/control types, the installed SDK strict type probe and runtime-entry gate, counterpart/developer-MCP lookup, browser tests, mounted/hook tests, generic privacy regression coverage and packed tests. The old six Bluetooth client-based generic privacy cases are replaced by the 48-case central/port flow suite plus native/browser and compiled app tests; XR generic tests retain their behavior. Negative public type tests intentionally mention deleted names. SDK entry/manifest already maps fx/bluetooth to public.ts, so no alias or new subpath is needed.

A scoped search found no current BTFX/useBluetooth/SCOS.bluetooth consumer in the sibling site's src tree. Its old installed SDK typecheck passes. Final SDK adoption and Gallery rewriting belong to the parent aggregate task; no interim shim was added. Physical hardware and native chooser UI acceptance remain unclaimed.

## Test-first and pre-freeze verification

- bluetooth-values-red.log: 3 missing-class/value failures. bluetooth-flow-red.log: 20 missing-class flow failures. bluetooth-browser-red.log: 4 missing scan transport failures. bluetooth-hook-red.log: 2 facade/ambiguity failures. bluetooth-boundary-red.log: 3 public environment/runtime-entry/probe failures. bluetooth-plugin-red.log: 3 missing narrow test-control failures. bluetooth-public-first.log: counterpart mapping failure, while source public types already passed.
- bluetooth-initial-state-red.log reproduced a constructor state callback lost when chooser consent completed before queue drain; repaired while preserving revocation generation checks.
- bluetooth-notify-red.log reproduced a late native notification enable surviving a newer disable; repaired with desired-state/generation checks and replacement-enable protection.
- bluetooth-availability-red.log reproduced an environment-long browser availability listener; observer-counted attachment now removes it exactly once with the last central observer.
- Full focused command is recorded at the top of bluetooth-focused.log: **96/96 tests, 14 files, exit 0**. Includes source TypeScript/public API boundary guard and all runtime/type counterpart exports.
- Affected host command in bluetooth-affected-host.log: browser runtime, contributions, host integration/composition, class test host and attribution package resources: **22/22, 6 files, exit 0**.
- `npx vitest run --config tests/fixtures/bluetooth-attribution/vitest.config.mjs` → bluetooth-plugin.log: **3/3 real compiled app scenarios**.
- Framework and sibling site `npx tsc -b --pretty false` → bluetooth-framework-typecheck.log and bluetooth-site-typecheck.log: both exit 0. Site retains its old SDK.
- `node scripts/quality/architecture-boundaries.mjs` → bluetooth-architecture.log: **1,774 files / 8,073 edges validated**.
- No full suite. C: has over 273 GB free, above the 20 GB floor.

## Exact file inventory

- M `docs/framework/appkit-counterparts.json`
- M `docs/framework/fx/bluetooth.md`
- A `docs/superpowers/evidence/2026-11-08-fx-fidelity/bluetooth-evidence.md`
- M `scripts/synware/installed-consumer.mjs`
- A `src/FX/BluetoothFX/BTFXAttribute.ts`
- A `src/FX/BluetoothFX/BTFXCentralManager.ts`
- A `src/FX/BluetoothFX/BTFXCentralManagerDelegate.ts`
- A `src/FX/BluetoothFX/BTFXCharacteristic.ts`
- A `src/FX/BluetoothFX/BTFXCharacteristicProperties.ts`
- A `src/FX/BluetoothFX/BTFXCharacteristicWriteType.ts`
- A `src/FX/BluetoothFX/BTFXDescriptor.ts`
- A `src/FX/BluetoothFX/BTFXError.ts`
- A `src/FX/BluetoothFX/BTFXManager.ts`
- A `src/FX/BluetoothFX/BTFXManagerAuthorization.ts`
- A `src/FX/BluetoothFX/BTFXManagerState.ts`
- A `src/FX/BluetoothFX/BTFXPeripheral.ts`
- A `src/FX/BluetoothFX/BTFXPeripheralDelegate.ts`
- A `src/FX/BluetoothFX/BTFXPeripheralState.ts`
- A `src/FX/BluetoothFX/BTFXService.ts`
- A `src/FX/BluetoothFX/BTFXUUID.ts`
- A `src/FX/BluetoothFX/internal/bluetoothBindings.ts`
- A `src/FX/BluetoothFX/internal/bluetoothObjects.ts`
- A `src/FX/BluetoothFX/internal/bluetoothPort.ts`
- M `src/FX/BluetoothFX/public.ts`
- A `src/Foundation/NSEUUID.ts`
- M `src/Foundation/public.ts`
- M `src/SynCloudOS/AppSDK/appContextTypes.ts`
- M `src/SynCloudOS/AppSDK/appRuntimeFacade.ts`
- M `src/SynCloudOS/AppSDK/createSynWareContextValue.ts`
- M `src/SynCloudOS/AppSDK/hooks/useBluetooth.ts`
- D `src/SynCloudOS/AppSDK/mountedBluetoothClient.ts`
- A `src/SynCloudOS/AppSDK/mountedBluetoothPort.ts`
- M `src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts`
- M `src/SynCloudOS/AppSDK/scos/scosFacade.ts`
- M `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`
- M `src/SynCloudOS/AppSDK/testing/testHostTypes.ts`
- M `src/SynCloudOS/InstalledApplications/capabilityReport.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserBluetoothAdapter.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts`
- M `src/SynCloudOS/Runtime/runtimeInstanceTypes.ts`
- A `tests/fixtures/bluetooth-attribution/consumer.test.tsx`
- A `tests/fixtures/bluetooth-attribution/public-types.ts`
- A `tests/fixtures/bluetooth-attribution/src/SynWare/First.app/Contents/Info.ts`
- A `tests/fixtures/bluetooth-attribution/src/SynWare/First.app/Contents/index.tsx`
- A `tests/fixtures/bluetooth-attribution/vitest.config.mjs`
- A `tests/runtime/fx/bluetooth-apple.test.ts`
- A `tests/runtime/fx/bluetooth-counterparts.test.ts`
- A `tests/runtime/fx/bluetooth-flow.test.ts`
- A `tests/runtime/fx/bluetooth-host-boundary.test.ts`
- A `tests/runtime/fx/bluetooth-packed.test.ts`
- A `tests/runtime/fx/bluetooth-public-types.test.ts`
- A `tests/runtime/fx/phase5-bluetooth-hook.test.tsx`
- M `tests/runtime/fx/phase5-bluetooth.test.ts`
- M `tests/runtime/fx/phase5-mounted.test.tsx`
- M `tests/runtime/fx/phase5-package-gate.test.ts`
- M `tests/runtime/fx/phase5-packed.test.ts`
- M `tests/runtime/privacy-new-fx.test.ts`

## Freeze and installed proof

All implementation, tests, fixtures and shipped documentation are finalized before explicit-path staging. Six original CRLF files retain their original line endings and headers: Bluetooth guide, Bluetooth public barrel, useBluetooth, browser Bluetooth adapter, original browser test and phase5 mounted test. New files use LF. Strict UTF-8 decoding, BOM/mojibake rejection, working/staged whitespace checks (cr-at-eol only for those six legacy paths), and staged/worktree byte identity are recorded in bluetooth-format-audit.json and bluetooth-staged-checks.json. The source/test/document hashes are frozen in bluetooth-frozen-inputs.json before a single successful SDK build and immutable independent installed proof.

Installed proof and exact commit receipts are appended only after those gates succeed. No frozen source bytes may change without rebuilding/reproving. Root PLAN/REPORT and unrelated files are never staged. Existing Rollup circular-chunk warnings, if emitted, remain in the aggregate warning ledger; there is no unrelated bundler or readability cleanup.

### Successful frozen SDK and installed proof

- `npm run sdk:build` → bluetooth-sdk-build.log: **exit 0**, one build after final explicit staging. Existing Rollup circular-chunk/execution-order warnings remain visible for the aggregate ledger; no bundler changes.
- `npx vitest run tests/runtime/fx/bluetooth-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → bluetooth-packed.log: **3/3 tests, 3 files, exit 0**. Bluetooth's independent installed actual-entry proof additionally runs **3/3 nested plugin app scenarios**, including full GATT flow and native read/disconnect denial after consent.
- The package installs independently outside the repository, with immutable archive integrity, no linking or source alias, a real plugin-transformed production app bundle/import, strict installed TypeScript and a single shared attribution runtime. All fourteen Bluetooth runtime exports, both protocol exports and Foundation UUID value behavior are validated.
- Root, SDK, SDK/testing, browser and fx/bluetooth declaration graph traversals each reach **zero BluetoothFX internal modules**. Public class declarations have no private attribution symbol, port/native transport or browser client/request/signal/promise API. Private package subpath imports fail with ERR_PACKAGE_PATH_NOT_EXPORTED. Installed resources still match the immutable manifest after the proof.
- `node scripts/synware/installed-consumer.mjs --verify` → bluetooth-frozen-verification.json: **currentSourceMatches true**, separately from the actual installed behavior proof. Every frozen source/test/shipped-document hash still matches the staged bytes. Evidence-only receipt text is outside the SDK source fingerprint.
- Archive SHA-256: `f293918fb397e9c0c59a80596c0f32acea4f3a83c2be7f80cacddbd54b11a0ab`.
- Frozen source SHA-256: `27f4ee1e52831f9570a6c4c66927162613060d0d1b955ec4b47cf981b1901669`.
- Resources SHA-256: `8d2775b2908699ae7fffa984b00be403f9ca0ac6e808f3fbc922bb9dd24e9a08`.
- Entry-specific JS/declaration hashes and all five graph counts are in bluetooth-installed.json. The explicit-path commit message is **FX: rebuild BluetoothFX with attributed CoreBluetooth classes**. Its exact SHA is written to bluetooth-commit.txt and returned immediately afterward, avoiding a self-referential hash in committed evidence. Post-commit frozen identity is recorded in bluetooth-postcommit-verification.json.
- Exactly 57 owned files are committed. Root PLAN/REPORT, unrelated files and site work remain outside the commit. C: remains above 273 GB free. Physical hardware acceptance, full serial suite and final Gallery/SDK adoption remain with the parent aggregate work.

## Independent review correction wave

Review of the initial unshared commit `7a6321eb97829bba521ea6e2f1688267f5198973` identified three Important lifetime findings. They are repaired together before amending that commit; this correction freeze supersedes the initial SDK receipt above.

1. **Denied construction and later privacy withdrawal:** `PrivacyStore.bindResource` refuses a lease while denied, so the central previously had no privacy transition observer. The Bluetooth mounted runtime now includes `runtime.privacy.subscribe` in its independently owned access observation. `mountedBluetoothPort` tracks authorization changes and retires captured generations on withdrawal even when no resource lease was acquired, or a previous lease was revoked. Constructor behavior remains passive while denied. Successful grant does not terminate that manager; current-state delivery is described below.
2. **Stale spontaneous disconnect:** the native disconnect path captures its new peripheral generation and rechecks it inside queued delegate work. Reconnection before queue drain invalidates that old callback, equivalent to explicit cancellation.
3. **Retained notification state:** each peripheral records characteristics with pending/active notification requests. Both disconnect paths retire notification flags and generations for the old connection only, including a retained characteristic after service rediscovery. Late old notification callbacks cannot change a replacement; new connection notification state remains intact.

The owner also requested a related state-flow check before another SDK freeze. It reproduced missed `centralManagerDidUpdateState` callbacks after denied construction became granted, both before and after the first queue drain. The mounted port now propagates changes to manager state from privacy access observation as well as native availability. The central coalesces pending state notifications and reads the current state at delivery, guarded by its selected session and access generation. The obsolete captured-authorization equality filter is removed. This gives unauthorized → poweredOn delivery on a grant while still dropping all work from a revoked terminal instance.

Touched connect/disconnect, subscription, invalidation, notification and error-handling blocks were expanded for readability as requested by the Minor review. No unrelated formatting, APIs or implementations changed. The correction touches seven existing source/test files plus this evidence file; the complete original 57-file family ownership is unchanged. Exact correction paths are `bluetooth-review-amend-paths.json`.

### Correction test evidence and final source gates

- `bluetooth-review-red.log`: **4 failing regressions**, reproducing denied-construction terminality, queued spontaneous disconnect, and retained notification flags for explicit and spontaneous disconnects; 48 earlier tests remained green.
- `bluetooth-review-green.log`: **52/52** central/port flow cases after the three repairs. Retained-characteristic coverage includes rediscovery before disconnect and a live replacement afterwards.
- `bluetooth-review-runtime-route-red.log`: the stable real mounted-runtime regression fails when only `runtime.privacy.subscribe` is temporarily removed; source was restored immediately. This validates the actual host wiring instead of only the unit fixture. The integration setup awaits canonical identity refresh, matching the existing privacy integration fixture; its earlier premature-mount test setup was corrected without changing production identity behavior.
- `bluetooth-review-state-red.log`: **2 failures** for denied → grant state delivery, before and after the first state callback.
- `npx vitest run tests/runtime/fx/bluetooth-flow.test.ts tests/runtime/fx/bluetooth-host-boundary.test.ts tests/runtime/fx/phase5-bluetooth-hook.test.tsx tests/runtime/fx/phase5-bluetooth.test.ts` → `bluetooth-review-covering.log`: **64/64, 4 files, exit 0**.
- Full focused command printed in `bluetooth-review-focused.log`: **103/103, 14 files, exit 0**. This includes all source public types, public-boundary inspection, counterparts, hook and privacy regression gates.
- Affected host command printed in `bluetooth-review-affected-host.log`: **22/22, 6 files, exit 0**.
- `npx vitest run --config tests/fixtures/bluetooth-attribution/vitest.config.mjs` → `bluetooth-review-plugin.log`: **3/3 actual compiled application scenarios, exit 0**.
- Framework and old-SDK sibling site `npx tsc -b --pretty false` → `bluetooth-review-framework-typecheck.log` and `bluetooth-review-site-typecheck.log`: **both exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` → `bluetooth-review-architecture.log`: **1,774 files / 8,073 edges validated**.

The correction is explicitly staged only after these source gates. UTF-8, original six CRLF paths, new LF paths, scoped working/staged whitespace and exact index/worktree bytes are audited again in `bluetooth-review-format-audit.json` and `bluetooth-review-staged-checks.json`. All implementation/test/shipped-document bytes are frozen in `bluetooth-review-frozen-inputs.json` before one fresh SDK build and the same three immutable installed gates. No source changes are permitted during the overlapping read-only review. New package/commit receipts follow those gates.

### Approved correction and replacement immutable receipt

The frozen correction re-review passed with no remaining Critical/Important findings. No implementation, test or shipped-document bytes changed during that review or the subsequent package proof.

- One fresh correction `npm run sdk:build` → `bluetooth-review-sdk-build.log`: **exit 0**. Earlier initial receipt remains historical; this archive supersedes it. Existing SDK cycle warnings remain in the aggregate ledger.
- `npx vitest run tests/runtime/fx/bluetooth-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → `bluetooth-review-packed.log`: **3/3 packed gates, 3 files, exit 0**, including **3/3 nested actual installed Bluetooth app scenarios**.
- Independent production bundling/import, strict installed types, all public exports, Foundation UUID behavior, shared attribution runtime identity, blocked private paths and unchanged installed resource inventory pass. All five declaration graphs again reach **zero Bluetooth private modules**.
- `bluetooth-review-installed.json` contains the corrected archive/entry/resource hashes and graph counts. `bluetooth-review-frozen-verification.json` reports **currentSourceMatches true**. All corrected frozen source/test/shipped-document hashes match working and index bytes before amendment.
- Corrected archive SHA-256: `4c2b793119e0a4aed910a3d69228cbf4eb0813137dea1143b8e102f7af9e20a9`.
- Corrected source SHA-256: `82011b34063a5997d0b29b670f9251767eadfd4ce1b560950229c78b88f5eb6e`.
- Corrected resources SHA-256: `bcd9542c866d0c9111bcbd3175663cdcf9e8decc2f8697121e92bcf5dc48a5b8`.
- The original unshared Bluetooth commit is amended with the same FX commit message after these gates. Exact amended SHA is recorded in `bluetooth-review-commit.txt`; `bluetooth-review-postcommit-verification.json` verifies the committed bytes and current source fingerprint. The family still owns exactly 57 committed paths; only eight paths changed in this review wave. Root PLAN/REPORT and unrelated files remain unstaged.
