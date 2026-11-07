# Foundation Part B independent review

Reviewed the owned diff package against the owner-approved Foundation section 5 and audit, plus current source for the subsequently private VFX pixel-backing factory. Source review only; no source, index, branch or HEAD changes were made by this reviewer. The only authored artifact is this report. No full suite, SDK build, browser UI session, site edit or Fusion inspection was performed.

## Strengths

- Encoded payloads consistently use Foundation values while numerical pixel planes and writable destinations retain their distinct semantics.
- Input/output records are separated where needed (MIDI messages and video track descriptions), without preserving raw-return aliases or overloads.
- Recorder, PDF worker, media block and video backing ownership protocols are separated from application contracts. The VFX pixel factory now stays module-private; clone/transfer/pool callers retain the original reference-count rules.
- Clipboard, file, font, codec and worker bridges convert explicitly. The worker's asynchronous Blob conversion retains abort/dispose ownership until conversion settles.
- The audit now respects constructor privacy and rejects undocumented or stale carve-outs. Focused tests examine actual byte views, rather than treating equality of private-field class instances as content equality.

## Findings

### Important 1 — File-handle MIME metadata was snapshotted by object spread

Original location: `src/SynCloudOS/FilePanels/FileSystemAccessPanelAdapter.ts:185` and `:188`.

`base.mediaType` was a getter over the MIME type populated by `read()`, but both returned variants spread `...base`. The spread evaluated the getter at construction time, leaving a fixed `application/octet-stream` property. After reading a genuine image, `reference.mediaType` therefore remained octet-stream. `NSEOpenPanel` now validates against this property, and `FileMediaProvider` classifies media using it; native image/audio selections could be rejected or omitted.

Resolution: the parent added explicit getters to both returned variants and a parameterised read/readwrite regression. The corrected getters are present in the current source. Parent evidence: `part-b-mime-red.log` (2 expected failures), `part-b-mime-green.json` (focused port/media/NSE panel recheck). Verification is recorded in the parent's final report.

### Important 2 — Dispatch guards reject genuine convertible buffers from another realm

Locations at initial review:

- `src/FX/GraphicsFX/GFXImage.ts:267`
- `src/FX/MediaFX/MEFXBlockBuffer.ts:119` and `:124`
- `src/FX/VideoFX/VFXContainerReader.ts:70`
- Related branch: `src/FX/ImageFX/IFXBarcodeDescriptor.ts:84`.

These APIs advertise `NSEDataConvertible`, and Foundation correctly accepts genuine cross-realm ArrayBuffer/Uint8Array values using intrinsic brands. Their dispatch guards use realm-local `instanceof` before calling `NSEData.from`, however. A foreign ArrayBuffer is misclassified as a callback provider, segment record or iterable. Barcode input has the same realm-local branch followed by a local-prototype requirement.

Read-only reproduction used Vite SSR module loading and `node:vm` (no test/build/source change):

```text
const input = runInNewContext('new Uint8Array([1,2]).buffer');
NSEData.from(input).count                 -> 2
new GFXDataProvider(input)                -> RangeError: Invalid or oversized provider data.
new MEFXBlockBuffer(input)                -> TypeError: Media block segment must be plain data.
new VFXContainerReader(fakeBackend).read(input)
                                          -> TypeError: Video container source must be Uint8Array or AsyncIterable<NSEDataConvertible>.
```

Required correction: use Foundation/intrinsic byte admission before choosing callback/segment/stream alternatives, and cover real cross-realm ArrayBuffer and Uint8Array inputs in a cross-family regression. Numerical pixel-array carve-outs do not need to change.

### Important 3 — New file-byte read escapes native activity observation

Location at initial review: `src/SynCloudOS/FilePanels/FileSystemAccessPanelAdapter.ts:175`.

`handle.getFile()` runs through `invoke`/`observe`, but the newly added `NSEData.read(file)` runs outside that boundary. `File.arrayBuffer()` can still be performing native file I/O after the getFile observer has completed. During that interval `NativeOperationActivity.pendingOperationCount` is zero, so update-readiness observation can report no native work despite the new read being in flight. The existing native-file-work test delays getFile, which does not exercise this added interval.

Required correction: observe the actual byte read as well, retaining the existing post-settlement release/signal fence. Add a regression whose returned File has a delayed `arrayBuffer()` and assert native activity remains pending until it settles, including reference retirement. Review equivalent observation for ephemeral File byte reads when composed with a native activity owner.

## Verification and limits

The parent reports framework typecheck and 371 focused core tests passing before these review fixes; the FX worker reports its focused families and the added private-backing regression green. This reviewer did not repeat those checks. Final package/source stability, packed consumers, complete framework/site suites, site adoption, and the final regenerated inventory remain parent-owned integration gates.

## Verdict

Spec compliance: **with fixes**. The migration and documented carve-outs implement the requested contract; Important 2 remains an admission-contract gap until corrected.

Code quality: **with fixes**. Important 1 has a source correction and regression evidence; Important 2 and Important 3 require correction/recheck before final acceptance. No Critical finding, raw-return compatibility shim, or new public backing-ownership surface was found in the reviewed changes.

## Final source recheck — findings resolved

This section supersedes the initial verdict above. The recheck read the corrected source, targeted diffs and recorded red/green evidence; no source changes or test/build execution were performed by the reviewer.

- **Important 1 resolved:** `ff6eeb8` preserves the live `mediaType` getter on both read-only and readwrite file references. The two access-mode regressions failed before correction; `part-b-mime-green.json` records **66 passed, zero failed, 14 files**, covering file panels and media consumers.
- **Important 2 resolved:** `81e8f7b` normalises byte inputs with Foundation before alternate provider/segment/stream dispatch in all four affected families. Eight real VM ArrayBuffer/bounded Uint8Array cases failed before correction. `part-b-fx-cross-realm-green.log` records **59 passed, seven files**, including bounded segment and asynchronous-fragment checks. The corrections retain callback-provider, numeric-array and stream alternatives without introducing a raw-return compatibility path.
- **Important 3 resolved:** the native file-handle observer now covers `getFile` and its complete `arrayBuffer` acquisition under one activity lease; browser-input references receive the existing native activity owner through mounted composition. Both retain the post-settlement reference/signal fence. Two delayed-arrayBuffer cases failed before correction. The recheck additionally caught an admission interval in the new ephemeral observer: an activity listener could synchronously release the reference before byte I/O began. The parent added an inner live check and a third regression; `part-b-file-admission-red.log` records the real unwanted arrayBuffer invocation before correction. The final `part-b-file-observation-green.log` records **50 passed, three files**, covering both native byte-read intervals, release fences, synchronous admission revocation and the existing write/close semantics.

**Spec-compliance verdict: pass for the reviewed framework source contracts.** No open migration, carve-out, private-port or convertible-input issue remains from this review.

**Code-quality verdict: pass.** All three Important findings have source corrections and relevant red/green evidence. No Critical or Important issue remains open in the reviewed changes. Final SDK/packed-consumer validation, complete framework/site suites and site adoption remain the parent's separate integration gates; this source-review verdict does not assert their results.
