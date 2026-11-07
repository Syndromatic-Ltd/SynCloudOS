# Foundation Part B: FX migration report

Implemented in the existing shared framework worktree. No branch/worktree was created or switched, no push, no site/Fusion edit, and no AnimationFX/About/page-curl/page-header file was changed by this worker. The parent owns framework-wide validation, canonical inventory generation, site adoption and read-only Fusion inventory.

## Commits

| Commit | Change |
| --- | --- |
| `c9d3957` | Encoded audio files, WAV inputs/results, streams, recordings and native codec bridges |
| `db8aaab` | ICC, PNG, PDF, providers/consumers and scanner payloads |
| `991044f` | MIDI encoder/parser/packets/scheduler and native MIDI bridge |
| `0021371` | Barcode, RAW, image resources, media block inputs and font inputs/results |
| `6ddb3c1` | Encoded video, container input/fragments, track descriptions and cross-family contracts |
| `800185b` | Encoded worker abort/dispose lifetime and remaining installed/E2E/font/recorder consumers |
| `7bee8b7` | Module-private pixel backing construction, retaining public numeric pixel APIs |

Exact changed source, documentation, examples, tests and consumer scripts: [part-b-fx-files.json](part-b-fx-files.json).

## Signature accounting

The original audit contains **89 FX declaration matches**. Of those, **69 payload declarations migrated**, **9 native/private backing declarations no longer form app-facing contracts**, and **11 numeric/copy declarations remain as documented carve-outs**. Counts refer to audit declaration matches, including containing unions and their member fields, rather than unique methods.

The browser image-processing worker additionally migrates its two encoded-result matches from `{ blob: Blob, metadata }` to `{ data: NSEData, metadata }`. Its native worker message remains Blob-based privately. Both WebGPU execution matches are numeric pixel carve-outs.

Inputs accept `NSEDataConvertible`; encoded results, callback delivery, PCM16 encoded chunks, scanner string/stream contents, MIDI packets and container fragments deliver `NSEData`, preserving Promise, array, nullable and stream wrappers. Barcode constructors retain their existing numeric-array alternative. `MIFXMessageInput` separates supplied SysEx bytes from parsed `MIFXMessage.data: NSEData`. `VFXContainerTrackInput` separates supplied codec descriptions from delivered `VFXContainerTrack` metadata. These are input/output contracts, with no raw-return overload or compatibility alias.

## Each remaining FX carve-out

| Declaration | Reason |
| --- | --- |
| `AUFXAudioAnalyser.spectrum` | Numeric FFT magnitudes use `Float32Array`; ArrayBuffer names only its backing-store type. |
| inferred `AUFXAudioAnalyser` result `magnitudes` | Same numeric result, separately matched by the audit's inferred-field traversal. |
| `GFXIndexedImageDescriptor.indices` | Numeric palette indices require element access and Uint8/Uint16 precision. |
| `GFXImageDescriptor.data` | Numeric pixel channel storage, including Uint8ClampedArray clamping semantics. |
| `bytePixelComponents` | Reads numeric pixel channels by element index and declared pixel/alpha format. |
| `GFXImage.copyData` | Numeric pixel plane copy, corresponding to a Core Graphics sample buffer rather than an encoded file. |
| `MEFXBlockBuffer.copyTo` | Explicit writable destination; immutable NSEData cannot be a mutable copy target. |
| `VFXPixelBuffer.constructor` | Numeric pixel planes with stride/layout, matching Core Video pixel-buffer backing storage. |
| `VFXPixelBuffer.copyData` | Numeric full-plane copy, including row padding. |
| `VFXPixelBuffer.copyPlane` | Numeric individual-plane copy, including row padding. |
| `VFXPixelBufferPool.acquire` | Supplies numeric pixel planes to pooled Core Video style storage. |
| `BrowserWebGPUImageExecutionRequest.pixels` | Numeric GPU upload channels, not encoded image payload. |
| `BrowserWebGPUImageExecutor.execute` | Numeric GPU readback channels, not encoded image payload. |

PCM Float32/Int16/Int32 sample arrays and UMP Uint32 words retain their numerical semantics. They do not directly name the audit's three raw payload types except backing-store generics. Foundation's own bridges are outside this worker's source ownership and covered by the parent report.

## Port separations

- `AUFXAudioRecorder` now has a private constructor; `createHostAUFXAudioRecorder` lives only in its implementation module, absent the public SDK barrel. Native Blob events, final native Blob assembly and optional native decode remain host-only. Apps receive `AUFXAudioRecording.data: NSEData` through their scoped audio session. Existing tests that explicitly exercise host construction use the internal factory.
- `MEFXBlockBuffer` no longer admits `InternalView` in its public constructor type. Its module-owned token and backing/refcount callbacks remain internal; ordinary input segments accept convertible bytes, and slices still share the backing with the existing lifetime and budget rules.
- `VFXPixelBuffer.fromBacking` moved to a module-private function. Apps cannot inject raw `VFXPixelBacking`, reference counts or release callbacks. Pixel reads and pool behaviour remain numeric.
- PDF worker snapshot Uint8Arrays remain native structured-clone transport behind the already-private `GFXPDFDocument` constructor. The scanner converts native snapshots to public `NSEData` strings, encoded streams and decoded-stream results. The audit previously traversed private constructor signatures; the parent corrected that traversal to respect declared visibility. Emitted-declaration tests verify private constructors omit their arguments.
- Native browser MIDI, WebCodecs, FontFace, PDF.js, Blob and worker protocols bridge at their adapters. Public FX backends that are app-facing use Foundation data contracts rather than exposing those native payloads.
- New asynchronous worker Blob-to-data conversion keeps the pending map and abort listener live until conversion settles. Abort/dispose reject immediately and ignore late bytes. Native recording decode starts alongside conversion, preserving finalisation/cancellation behaviour.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Initial cross-family contracts, before migration | 3 expected failures | [part-b-fx-contract-red.log](part-b-fx-contract-red.log) |
| Migrated focused audio/graphics/image/MIDI/video/media tests | **171 passed, 22 files** | [part-b-fx-focused-green.log](part-b-fx-focused-green.log) |
| Private constructor and affected audio/MIDI/container recheck | **76 passed, 10 files** | [part-b-fx-ports-green.log](part-b-fx-ports-green.log) |
| Broader non-animation/non-package FX subset | **1008 passed, 4 failed; 163 files** | [part-b-fx-broad.log](part-b-fx-broad.log) |
| All four broader-run fixture failures after migration | **58 passed, 3 files** | [part-b-fx-broad-recheck.log](part-b-fx-broad-recheck.log) |
| Abort/dispose during worker data bridging, before repair | 2 expected timeout failures | [part-b-fx-bridge-lifetime-red.log](part-b-fx-bridge-lifetime-red.log) |
| Final worker/font/recorder/PDF consumers | **68 passed, 5 files** | [part-b-fx-final-consumers.log](part-b-fx-final-consumers.log) |
| Public pixel backing port, before separation | 1 expected failure | [part-b-fx-backing-red.log](part-b-fx-backing-red.log) |
| Pixel backing/pool/frames/containers/processing after separation | **35 passed, 5 files** | [part-b-fx-backing-green.log](part-b-fx-backing-green.log) |

The four broader-run failures were one old Blob-shaped worker expectation and three font-loader fixtures still returning raw bytes; all are covered by the green focused rechecks. No timeout was increased. The complete 163-file subset was not repeated merely to replace its recorded result. The two bridge-lifetime timeouts were deliberate red tests proving unsettled cancellation, followed by the green final-consumer run. DOM tests retain their existing jsdom directives. `git diff --check` passed on owned changes before each final commit.

Framework source typechecking, architecture, SDK build/package/packed consumers and the full framework/site suites belong to the parent. No browser E2E execution or physical device/GPU acceptance is claimed here; E2E and installed-consumer source was migrated for those checks.

## Integration notes and open questions

No owner-design question blocks the FX implementation. Parent integration covers `mountedMediaClient`, `useMedia`, `MIDIService`, font resource loading, runtime image services and app facades. Parent was also notified to migrate the two native-recorder constructions in `framework-settlement.test.ts`. FX source is frozen after `7bee8b7`; only this report/evidence commit follows. Canonical inventory must be regenerated against the final combined framework commit.

## Review follow-up: genuine cross-realm convertible inputs

The reviewer reproduced valid foreign ArrayBuffer/Uint8Array rejection in provider, media-segment and container-source dispatch. The same pre-normalisation gate existed in barcode payload construction. All four used realm-local instanceof/prototype checks before Foundation's intrinsic validation.

Eight new cases use `vm.runInNewContext` to create actual foreign ArrayBuffers and bounded Uint8Array subviews. They failed before the fix (two cases per family), then passed after each dispatch attempted `NSEData.from` before interpreting callback, segment-record or async-stream alternatives. Media segment records and async-stream fragments are covered too. No prototype swapping or mocked foreign brands are used.

The remaining FX instanceof checks were inspected: payload methods normalise into local Foundation views first; raw numeric pixel/index destinations and native private transfer protocols retain their documented checks. No further app-facing convertible-input gate was found.

Validation: **59 passed across 7 files**, covering Foundation byte contracts, graphics providers, media blocks/mounted media, container I/O and both barcode suites. Evidence: [part-b-fx-cross-realm-red.log](part-b-fx-cross-realm-red.log), [part-b-fx-cross-realm-green.log](part-b-fx-cross-realm-green.log). `git diff --check` passed. No SDK build or full suite was run by this follow-up; parent retains aggregate validation ownership. This follow-up supersedes the earlier source freeze point without changing public signatures or carve-out accounting.
