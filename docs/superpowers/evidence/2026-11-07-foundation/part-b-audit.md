# Foundation Part B: final byte audit

The owner approved breaking public byte returns on 2026-11-07. The original checker inventory had 125 declaration matches in 45 files; its unmodified rows are preserved in [part-b-original-signatures.json](part-b-original-signatures.json).

The regenerated checker inventory classifies 99 original declarations as migrated, 9 as private host/backing protocols, and 17 as retained carve-outs. Counts are declaration matches, including overloaded implementation signatures, containing unions and inline fields; they are not unique method counts. The complete before/after mapping is [part-b-migration-inventory.json](part-b-migration-inventory.json). The current raw inventory is [public-byte-signatures.json](public-byte-signatures.json).

Inputs accept NSEDataConvertible; delivered payloads use NSEData with Promise, array, nullable and stream wrappers preserved. MIME type, name and dates are metadata. File selection identity and native getFile/File results remain File where appropriate; reference byte-read methods deliver NSEData. Encoded payloads have no raw-return compatibility overloads.

## Retained raw signatures

The manifest [public-byte-carve-outs.json](public-byte-carve-outs.json) records each exact signature and reason. The audit rejects missing and stale exemptions.

| Declaration | Category | Reason |
| --- | --- | --- |
| `src/Foundation/NSEData.ts:25` — `NSEDataConvertible` | web-bridge | Foundation input union explicitly bridges existing web buffers to NSEData. |
| `src/Foundation/NSEData.ts:50` — `NSEData.read` | web-bridge | The explicit asynchronous Blob/File read bridge constructs NSEData. |
| `src/Foundation/NSEData.ts:74` — `NSEData.bytes` | web-bridge | A defensive read-only typed-array copy is the explicit Foundation web byte view. |
| `src/Foundation/NSEData.ts:97` — `NSEData.blob` | web-bridge | The explicit web output bridge constructs a Blob for native browser APIs. |
| `src/FX/AudioFX/AUFXAudioAnalyser.ts:28` — `AUFXAudioAnalyser.spectrum` | numeric-buffer | FFT magnitudes are floating-point numerical samples; ArrayBuffer describes their backing store. |
| `src/FX/AudioFX/AUFXAudioAnalyser.ts:46` — `__object.magnitudes` | numeric-buffer | FFT magnitudes are Float32 numerical samples, not encoded bytes; ArrayBuffer is backing-store typing. |
| `src/FX/GraphicsFX/GFXFloatImage.ts:38` — `GFXIndexedImageDescriptor.indices` | numeric-buffer | Palette index planes contain numerical pixel indexes with 8-bit or 16-bit element semantics. |
| `src/FX/GraphicsFX/GFXImage.ts:38` — `GFXImageDescriptor.data` | numeric-buffer | Unencoded pixel component planes retain numeric Uint8Array/Uint8ClampedArray storage. |
| `src/FX/GraphicsFX/GFXImage.ts:69` — `bytePixelComponents` | numeric-buffer | Numerical pixel-component access operates on an unencoded plane. |
| `src/FX/GraphicsFX/GFXImage.ts:149` — `GFXImage.copyData` | numeric-buffer | Copies an unencoded numeric pixel component plane; encoded PNG results use NSEData. |
| `src/FX/MediaFX/MEFXBlockBuffer.ts:261` — `MEFXBlockBuffer.copyTo` | writable-destination | The caller supplies writable storage; immutable NSEData cannot be a copy destination. |
| `src/FX/VideoFX/VFXPixelBuffer.ts:66` — `VFXPixelBuffer.constructor` | numeric-buffer | Initialises an unencoded numerical video pixel plane. |
| `src/FX/VideoFX/VFXPixelBuffer.ts:141` — `VFXPixelBuffer.copyData` | numeric-buffer | Copies unencoded numeric video pixel planes, not a container or encoded chunk. |
| `src/FX/VideoFX/VFXPixelBuffer.ts:145` — `VFXPixelBuffer.copyPlane` | numeric-buffer | Copies one unencoded numerical video pixel plane. |
| `src/FX/VideoFX/VFXPixelBuffer.ts:231` — `VFXPixelBufferPool.acquire` | numeric-buffer | Pool acquisition accepts initial numerical pixel-plane storage. |
| `src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend.ts:36` — `BrowserWebGPUImageExecutionRequest.pixels` | numeric-buffer | GPU execution uploads unencoded numerical RGBA pixel components. |
| `src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend.ts:42` — `BrowserWebGPUImageExecutor.execute` | numeric-buffer | GPU readback returns an unencoded numerical RGBA component plane. |

## Native port separation

- AUFXAudioRecorder has a private constructor; its Blob events/decode protocol is reachable only through the module-local host composition factory, not the app entry.
- GFXPDFDocument's private constructor keeps raw PDF worker snapshots private. The scanner's delivered string and stream payloads use NSEData.
- MEFXBlockBuffer no longer exposes its BlockBacking construction/copy protocol. A module-private factory constructs VFX pixel backings; callers cannot supply ref counts or onZero callbacks.
- File-handle references expose checked operations without their native file handle. Public file writers accept convertible data. Browser-native file/directory protocols and writable conversions live in nativeFilePanelBridge; cached wrappers retain native directory authority for structured-cloned bookmarks privately.
- Runtime image/IFX resource ports carry NSEData, while the native browser image platform bridges its native buffers privately. Font persistence similarly stores native ArrayBuffers privately and delivers NSEData.

The checker follows public call/construct signatures, members, aliases and callback shapes. It now excludes private/protected construct signatures in both traversal paths, matching emitted TypeScript declarations. This avoids counting private constructor ports as app API. Private-port emitted-declaration tests cover the boundary.
