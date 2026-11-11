# NFCFX fidelity evidence — 8 November 2026

Base: `62fd7af65d5ffdd397959937b9ae8c6884b75c56` (reviewed Pass prerequisite), framework branch `fix/blind-rewrite-friction`. NFC only. The parent owns PLAN/REPORT; neither is staged here. Sibling site branch `prerelease` remains on its installed SDK. No branch, push, stash, new worktree, server, protected-port operation or unrelated family implementation was changed.

## Authority and decisions

Read nfc-task-brief.md, family-task-constraints.md and the review's ten rules. Apple sources consulted directly:

- https://developer.apple.com/documentation/corenfc/nfcndefreadersession (initializer delegate, queue, invalidateAfterFirstRead; connect completion; polling)
- https://developer.apple.com/documentation/corenfc/nfcreadersession-swift.class (abstract base, readingAvailable, delegate and sessionQueue)
- https://developer.apple.com/documentation/corenfc/nfcndefreadersessiondelegate (required invalidation callback and optional detect/activity callbacks)
- https://developer.apple.com/documentation/corenfc/nfcndeftag (status/capacity/error; message/error; write/error and lock/error completion signatures)
- https://developer.apple.com/documentation/corenfc/nfcndefpayload (Foundation byte fields, URI and text helpers; tuple locale result)
- https://developer.apple.com/documentation/corenfc/nfcreadererror-swift.struct (Apple reader/tag/session error cases)
- https://developer.apple.com/documentation/corenfc/nfctypenameformat and nfcndefmessage/length.
- Web NFC parsing algorithm, https://w3c.github.io/web-nfc/, and current Chromium NdefMessageUtils.java, https://chromium.googlesource.com/chromium/src/+/lkgr/services/device/nfc/android/java/src/org/chromium/device/nfc/NdefMessageUtils.java (snapshot nfc-chromium-ndef.java). Chromium copies MIME/external type strings and opaque payloads, splits text into exact ASCII lang and unchanged body, and expands URI records through Android toUri().

Routine decisions follow Apple and preserve privacy. Owner-requested default queue is the selected app's Dispatch main queue for null/omitted queue, rather than Apple's fresh internal serial queue for nil. No app-ID reselection occurs during delivery. Default invalidateAfterFirstRead is true; callers use positional `(delegate, null, false)` for a continuing reader. Successful first message or explicit tag read delivers before terminal first-read invalidation. The required invalidation callback is checked at construction. An already-connected tag connect is a queued no-op. The abstract base is represented by an abstract TypeScript class.

All byte values use NSEData. Global URL and Intl.Locale are the available Foundation-equivalent values; there is no NSELocale to invent. `wellKnownTypeTextPayload()` returns Apple's tuple as `[string|null, Intl.Locale|null]`. Missing language decodes to null locale; malformed matching well-known payloads throw NFC errors, and a nonmatching record type returns null values. Independent vectors cover URI prefix 0x02, UTF-8 status/language/body, UTF-16BE BOM/body, malformed prefixes/language/encodings and unpaired Unicode surrogate rejection. Original bytes are never validated by roundtrip alone.

## Public Apple → framework → file mapping

All files below are under `src/FX/NFCFX/`; public.ts contains only re-exports. All nine runtime/type root names are mapped in appkit-counterparts.json and verified through developer MCP lookup plus the TypeScript export graph. Seven are runtime exports; the delegate/tag protocols are type-only. The inline `NFXReaderError["code"]` union carries `NFCReaderError.Code` cases, following the established framework error-class pattern.

| Apple → framework/file | Members and behavior |
|---|---|
| NFCReaderSession → NFXReaderSession.ts | Abstract base; static readingAvailable; delegate, sessionQueue, isReady, alertMessage, begin, invalidate. Availability is passive and scoped to selected app authority. |
| NFCNDEFReaderSession → NFXNDEFReaderSession.ts | `(delegate, queue?, invalidateAfterFirstRead?)`; inherits the above. begin starts asynchronously, DidBecomeActive and all callbacks use Dispatch; connect(tag, completionHandler) retains Apple completion semantics; restartPolling retires old tag references; invalidate is terminal. |
| NFCNDEFReaderSessionDelegate → NFXNDEFReaderSessionDelegate.ts | readerSessionDidInvalidateWithError required; readerSessionDidBecomeActive, readerSessionDidDetectNDEFs and readerSessionDidDetectTags optional, sender first. Tag delegate takes precedence. |
| NFCNDEFTag → NFXNDEFTag.ts | isAvailable; queryNDEFStatus(status, capacity, error), readNDEF(message, error), writeNDEF(message, completion), writeLock(completion), on sessionQueue. Native private capable ports prove full live operation sequence. Unconnected tags give readerTransceiveErrorTagNotConnected. |
| NFCNDEFStatus → NFXNDEFStatus.ts | notSupported/readWrite/readOnly; separate byte capacity. |
| NFCNDEFMessage → NFXNDEFMessage.ts | records and unchunked encoded length; defensive asynchronous record snapshots. |
| NFCNDEFPayload → NFXNDEFPayload.ts | constructor(format, type, identifier, payload); typeNameFormat and three NSEData fields; static/instance URI and text helpers, mutable Apple value surface. |
| NFCTypeNameFormat → NFXTypeNameFormat.ts | Numeric empty/nfcWellKnown/media/absoluteURI/nfcExternal/unknown/unchanged values. |
| NFCReaderError → NFXReaderError.ts | errorDomain, code and Apple's reader/session/tag cases; no authorization or browser error enum. Native raw denial is classified before conversion. |

## Browser support and explicit errors

`BrowserNFCAdapter` delivers real scan messages. It does not expose public browser record/reader/message types. Web NFC has no addressed connection, capacity query or identity-safe write/lock operation: its detected protocol objects are unavailable, connect gives readerErrorUnsupportedFeature, and session tag operations before a connection give readerTransceiveErrorTagNotConnected. The underlying addressed transport operations also fail unsupported. Neither browser write nor makeReadOnly is called as an unsafe substitute; a cached event message is never passed off as a fresh readNDEF result.

`alertMessage` cannot be displayed in native Web NFC UI. Getter returns the initial empty value; setter throws readerErrorUnsupportedFeature. invalidate(errorMessage) still ends scanning and reports unsupported native text via its required invalidation delegate. No UI or artwork was invented.

Supported browser fields are lossless projections for compliant records, with exact source limitations:

| Browser record | Returned NDEF fields / refusal |
|---|---|
| text | TNF 1, T; rebuild only status encoding bit + ASCII language length (reserved bit 6 is zero in a compliant record), preserve native language casing and text body/BOM bytes. Never normalize via Intl.Locale or re-encode text. Spec utf-16be and Chromium utf-16 both restore the same original encoding bit without modifying the body. Unsupported encoding/malformed metadata fails. Language may be empty. |
| mime | TNF 2, exact exposed ASCII media type bytes and opaque DataView byte-range payload. |
| smart-poster | TNF 1, Sp, opaque original payload. No nested decode/re-serialization. |
| external | TNF 4, exact valid exposed ASCII type and opaque payload. Unsupported names fail. |
| unknown / empty | TNF 5 / 0 with validated fields. |
| url / absolute-url | readerErrorUnsupportedFeature: browser URI expansion/normalization loses original prefix/type bytes. Author-created URI helpers remain supported. |

Browser identifiers must roundtrip losslessly through UTF-8 and contain no replacement characters; non-UTF-8/opaque identifiers cannot be recovered and fail. Physical chunk framing is not exposed by Web NFC; the API uses logical records and computes unchunked length. Text reserved-bit violations discarded by the browser itself cannot be reconstructed; support is explicitly limited to compliant records. Readingerror becomes readerTransceiveErrorTagResponseError. No hardware, native permission UI or physical interoperability acceptance is claimed.

## Private authority, lifetime and hook ownership

- Internal files `nfcPort.ts`, `nfcSessionBindings.ts` and `ndefEncoding.ts` hold native contracts, association/binding and encoding helpers. `mountedNFCPort.ts` owns per-app permission and immutable launch entitlement checks (`nfc.read`, separately `nfc.write`), native refusal and captured generations.
- Context/environment private WeakMap associations replace the old factory. Public SCOS, SynWareContextValue, runtime environment, browser contribution environment and test environment have no NFC adapter/client. The capability-report consumer now uses the private association and Apple's readingAvailable name.
- Each reader pins the exact selected FXAppSession; queue selection uses dispatchQueueForSession(selectedSession).main. observeFXSessionEnd catches registry removal as well as abort. Queued work rechecks captured generation, session and access, including error completions before begin. Every reader access/session observer is installed once and released once. Dispatch's independent per-session queue observer is owned by Dispatch.
- Every native open/connect/status/read/write/lock/restart/finalization boundary preserves NotAllowedError/SecurityError before Apple conversion. Current denial revokes shared access even after a saved grant. Stale denial after revoke/regrant cannot revoke a replacement. Late native handles are closed exactly once and only by their old owner. Reentrant synchronous finalization denial is covered.
- useNFC(delegate, queue?, invalidateAfterFirstRead?) returns the actual class, binds exact context or branding clone by mount signal plus configured runtime ID, rejects ambiguous duplicates, and uses insertion-effect cleanup so StrictMode replay cannot revive an ended instance. Uncommitted/suspended renders remain passive; actual unmount drops deliveries and closes resources.
- Narrow existing test-host NFC controls were necessary for actual installed plugin proofs: allow/deny (existing generic control shape), emitText and activeSessionCount. Native ports remain private. No createSynWareTestHost implementation/API flow was changed.

## Removed names and migrated consumers

Deleted NFXAuthorizationStatus, NFXCapabilities, NFXNDEFPayloadDescriptor, NFXNDEFReading, NFXNFCClient, createMountedNFCClient and the mountedNFCClient.ts file. Removed scan/write/makeReadOnly/dispose browser surface, createReaderSession, public AbortSignal/overwrite, recordType/mediaType/id/encoding/lang/data descriptors, SCOS.nfc and context/environment.nfc factory exposure. No aliases or shims.

Migrated app runtime/context assembly, mounted registry, browser runtime, deterministic adapters, SCOS facade, useNFC, capability report, public docs, counterpart map, phase5 mounted/packed/browser/hook tests. The old generic privacy tests' five NFC authorization-client cases are replaced by 29 focused reader/tag lifetime cases and three compiled app flows; Bluetooth/XR tests retain their original behavior. Negative public type tests intentionally mention removed names to prove rejection. Developer MCP lookup consumes the changed counterpart map; SDK entry/manifest already maps fx/nfc to public.ts and requires no new route.

The site typecheck passes with its old installed SDK; no current NFC consumer source was found by the scoped source search. Gallery/new adoption remains the parent's later task. No compatibility API is retained to bridge that deferral.

## Test-first and pre-freeze verification

- nfc-values-red.log: initial API/helper shape, 3 failures. nfc-flow-red.log records missing new private flow modules. nfc-browser-red.log: 9 old-adapter failures. nfc-hook-boundary-red.log: 3 old-hook/public-host failures. nfc-plugin-red.log: 3 missing test-control failures. nfc-counterparts-red.log: missing counterpart mapping.
- nfc-byte-ui-red.log: 3 failures for byte normalization and silent native UI; nfc-core-green.log: 30 tests after correction.
- nfc-lifetime-red.log: native invalidation reentrancy reproduced; observer test was corrected to exclude Dispatch's separately owned constructor-time queue observer. nfc-lifetime-green.log: 26 passes.
- nfc-fidelity-edge-red.log: already-connected no-op and locale-free decoding failures; nfc-fidelity-edge-green.log: 32 passes. nfc-first-read-red.log proves explicit tag read auto-invalidation regression before repair.
- `npx vitest run tests/runtime/fx/nfc-apple.test.ts tests/runtime/fx/nfc-flow.test.ts tests/runtime/fx/nfc-counterparts.test.ts tests/runtime/fx/nfc-public-types.test.ts tests/runtime/fx/nfc-host-boundary.test.ts tests/runtime/fx/phase5-nfc.test.ts tests/runtime/fx/phase5-nfc-hook.test.tsx tests/runtime/fx/phase5-mounted.test.tsx tests/runtime/fx/phase5-counterparts.test.ts tests/runtime/fx/app-attribution.test.ts tests/runtime/fx/app-attribution-plugin.test.ts tests/runtime/privacy-new-fx.test.ts tests/runtime/privacy-store.test.ts` → nfc-focused.log: **87/87, 13 files, exit 0**. Includes strict source public declarations and all runtime/type counterpart exports.
- Affected host command printed in nfc-affected-host.log: browser runtime, browser contributions, host integration/composition, class test host, attribution package resources: **22/22, 6 files, exit 0**.
- `npx vitest run --config tests/fixtures/nfc-attribution/vitest.config.mjs` → nfc-plugin.log: three real compiled app scenarios (full flow plus native read/finalization denial).
- Framework and sibling site `npx tsc -b --pretty false` → nfc-framework-typecheck.log / nfc-site-typecheck.log: both exit 0.
- `node scripts/quality/architecture-boundaries.mjs` → nfc-architecture.log: **1,754 files / 7,968 edges validated**.
- nfc-chromium-encoding-red.log: 1 failing independent-vector case proves Chromium utf-16 label handling was initially missing; final focused run includes both native labels without changing bytes.
- No full suite was run. C: free space before freeze exceeds 273 GB (20 GB floor).

## Exhaustive owned file inventory

- M `docs/framework/appkit-counterparts.json`
- M `docs/framework/fx/nfc.md`
- A `docs/superpowers/evidence/2026-11-08-fx-fidelity/nfc-evidence.md`
- A `src/FX/NFCFX/NFXNDEFMessage.ts`
- A `src/FX/NFCFX/NFXNDEFPayload.ts`
- A `src/FX/NFCFX/NFXNDEFReaderSession.ts`
- A `src/FX/NFCFX/NFXNDEFReaderSessionDelegate.ts`
- A `src/FX/NFCFX/NFXNDEFStatus.ts`
- A `src/FX/NFCFX/NFXNDEFTag.ts`
- A `src/FX/NFCFX/NFXReaderError.ts`
- A `src/FX/NFCFX/NFXReaderSession.ts`
- A `src/FX/NFCFX/NFXTypeNameFormat.ts`
- A `src/FX/NFCFX/internal/ndefEncoding.ts`
- A `src/FX/NFCFX/internal/nfcPort.ts`
- A `src/FX/NFCFX/internal/nfcSessionBindings.ts`
- M `src/FX/NFCFX/public.ts`
- M `src/SynCloudOS/AppSDK/appContextTypes.ts`
- M `src/SynCloudOS/AppSDK/appRuntimeFacade.ts`
- M `src/SynCloudOS/AppSDK/createSynWareContextValue.ts`
- M `src/SynCloudOS/AppSDK/hooks/useNFC.ts`
- M `src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts`
- D `src/SynCloudOS/AppSDK/mountedNFCClient.ts`
- A `src/SynCloudOS/AppSDK/mountedNFCPort.ts`
- M `src/SynCloudOS/AppSDK/scos/scosFacade.ts`
- M `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`
- M `src/SynCloudOS/AppSDK/testing/testHostTypes.ts`
- M `src/SynCloudOS/InstalledApplications/capabilityReport.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserNFCAdapter.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts`
- M `src/SynCloudOS/Runtime/runtimeInstanceTypes.ts`
- A `tests/fixtures/nfc-attribution/consumer.test.tsx`
- A `tests/fixtures/nfc-attribution/public-types.ts`
- A `tests/fixtures/nfc-attribution/src/SynWare/First.app/Contents/Info.ts`
- A `tests/fixtures/nfc-attribution/src/SynWare/First.app/Contents/index.tsx`
- A `tests/fixtures/nfc-attribution/vitest.config.mjs`
- A `tests/runtime/fx/nfc-apple.test.ts`
- A `tests/runtime/fx/nfc-counterparts.test.ts`
- A `tests/runtime/fx/nfc-flow.test.ts`
- A `tests/runtime/fx/nfc-host-boundary.test.ts`
- A `tests/runtime/fx/nfc-packed.test.ts`
- A `tests/runtime/fx/nfc-public-types.test.ts`
- M `tests/runtime/fx/phase5-mounted.test.tsx`
- M `tests/runtime/fx/phase5-nfc-hook.test.tsx`
- M `tests/runtime/fx/phase5-nfc.test.ts`
- M `tests/runtime/fx/phase5-packed.test.ts`
- M `tests/runtime/privacy-new-fx.test.ts`

## Freeze, installed proof and commit

All source, tests, fixture bytes and shipped documentation are finalized before explicit staging and a single SDK build. Existing CRLF remains only in the two original CRLF owned files (NFC guide, phase5 mounted test); new files use LF. Strict UTF-8, no BOM/mojibake, scoped working/staged whitespace checks and index/worktree identity are audited in nfc-format-audit.json / nfc-staged-checks.json. Root PLAN/REPORT and unrelated files remain unstaged.

The frozen proof runs nfc-packed.test.ts, phase5-packed.test.ts and packed-fx.test.ts against an immutable independently installed archive, including three actual plugin .app scenarios, production bundling/import, strict installed public types, all seven NFC runtime exports and both protocol exports, one shared attribution runtime, blocked private subpaths, and complete root/sdk/sdk-testing/browser/fx-nfc declaration graph traversal with zero NFC private modules. Receipts and exact commit SHA are appended after those gates; no source bytes may change without a fresh build/proof.


### Pre-emission build boundary correction

The first SDK build attempt (nfc-sdk-build-initial-red.log) stopped at the public API guard **before fingerprinting, declaration emission, bundling or output cleanup**. The optional merged `NFXReaderError.Code` type namespace caused the guard to inspect TypeScript's declaration-less synthetic `prototype` export as an unresolved API edge. `nfc-boundary-namespace-red.log` reproduces it directly through the real guard. The error uses the same inline code-union pattern as existing PKFXError/CNFXError; public types refer to `NFXReaderError["code"]`. No error case changes, extra export, alias, guard weakening or bundler edit. The public types test now calls the actual SDK boundary inspector. A fresh staged-byte audit, relevant checks and one successful SDK build/proof follow this repair; the first attempt produced no new SDK archive.


### Final successful frozen proof

- Fresh successful `npm run sdk:build` → nfc-sdk-build.log: **exit 0**. Existing Rollup circular-chunk/execution-order warnings remain visible and are already carried by the aggregate minor-findings ledger; no unrelated bundler refactor. This follows the pre-emission guard failure recorded above, so there was one successful SDK archive build after the repair freeze.
- `npx vitest run tests/runtime/fx/nfc-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → nfc-packed.log: **3/3 tests, 3 files, exit 0**. NFC's independent installed actual-entry test additionally runs **3/3 nested plugin app scenarios** (full tag flow and authoritative raw read/finalization denial).
- Installed production bundle/import behavior, strict installed TypeScript, all seven runtime exports, both protocols, shared attribution runtime identity, blocked private package paths and resource integrity pass. Root, sdk, sdk/testing, browser and fx/nfc declaration graphs each reach **zero NFCFX internal modules**; emitted public class declarations contain no private attribution symbols/ports/browser record types.
- `node scripts/synware/installed-consumer.mjs --verify` → nfc-frozen-verification.json: **currentSourceMatches true**. This is separate from the actual installed behavior proof. Every frozen source/test/shipped-documentation SHA-256 still matches its staged bytes after the proof; no source bytes changed after the repaired freeze.
- Archive SHA-256: `a46f3c44fd0d4d99e2ea624217fe4cfceb1fa7e255cc46017fb323f33c830ba1`.
- Frozen source SHA-256: `4ff35831ae2e68b9b94236dfa33b4ab0ac85fd800f28327d6069ac5ac1419061`.
- Resources SHA-256: `31b292c0bf6f3695c455d5ab96bbc3374253260230ce2aed49c610f3211af3bc`.
- Exact NFC entry hashes and the five graph counts are in nfc-installed.json. The explicit-path family commit is **FX: rebuild NFCFX with attributed CoreNFC reader sessions**; its exact SHA is written immediately afterward to nfc-commit.txt and returned to the parent, avoiding a self-referential hash in committed evidence. Post-commit identity verification is nfc-postcommit-verification.json.
- Exactly 46 owned paths are staged. Root PLAN/REPORT, unrelated source/untracked evidence, and the site remain outside the commit. C: remains above 273 GB free. Physical NFC acceptance and final Gallery/SDK adoption remain deferred.
