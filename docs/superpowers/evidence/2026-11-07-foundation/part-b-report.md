# Foundation Part B report â€” 2026-11-07

The framework and site now use NSEDataConvertible for public byte inputs and NSEData for delivered payloads. Source, examples, documentation, test hosts and installed consumers are migrated and committed. Both repositories typecheck. Integration acceptance remains limited by the cover-flow architecture alias, two Inspector bundling cases and three site UI cases; the full suites are not green.

Work stayed in the existing shared framework/site checkouts. No named branch or development worktree was created or switched; no push was made. Only the explicitly requested detached temporary checkouts were used for immutable adoption and snapshot verification. Claude retains review/integration/push ownership.

## Public contracts and inventory

The original inventory contains 125 declaration matches in 45 files. Final classification: **99 migrated byte declarations, nine private host/backing declarations excluded, and 17 documented raw carve-outs in seven files**. Six of the nine private rows became private through this work; three PDF snapshot rows were already private and appeared because the original checker traversed private constructors. Counts include containing unions, inline fields and overload implementation signatures, rather than unique method counts. File-only reference reads and test-host outputs were migrated in addition to those 125 raw-type matches.

- [Regenerated raw inventory](public-byte-signatures.json): 17 remaining signatures, each with a reason.
- [Complete before/after migration inventory](part-b-migration-inventory.json): all 125 original rows accounted for.
- [Exact carve-out manifest](public-byte-carve-outs.json) and [readable audit](part-b-audit.md).
- [Original inventory](part-b-original-signatures.json).

Public payload inputs accept NSEDataConvertible; delivered payloads use NSEData without preserving raw-return aliases/shims/overloads. Promise/array/null/stream wrappers remain. Blob and File construction is explicit at native bridges; selected File identity, names, MIME types and native authority remain separate from byte values.

The 17 exceptions are four Foundation web bridges, twelve numerical-buffer declarations and one writable destination. Every exact signature and exposing entry appears in the regenerated inventory. The audit rejects undocumented raw signatures and stale exemptions.

| Declaration | Reason |
| --- | --- |
| `NSEDataConvertible` | Foundation's explicit web-input union admits existing typed arrays and ArrayBuffers. |
| `NSEData.read` | The asynchronous Blob/File bridge creates a Foundation value. |
| `NSEData.bytes` | The explicit web byte view returns a defensive typed-array copy. |
| `NSEData.blob` | The explicit browser-output bridge constructs a Blob. |
| `AUFXAudioAnalyser.spectrum` | FFT magnitudes are numerical Float32 samples; ArrayBuffer describes their backing store. |
| Inferred analyser `magnitudes` field | The same numerical FFT result is separately reachable as a field. |
| `GFXIndexedImageDescriptor.indices` | Palette indexes require numerical 8-bit or 16-bit element semantics. |
| `GFXImageDescriptor.data` | Unencoded pixel channels retain numerical Uint8/Uint8Clamped storage. |
| `bytePixelComponents` | Reads numerical pixel components from an unencoded plane. |
| `GFXImage.copyData` | Copies an unencoded numerical pixel plane; encoded PNG output uses NSEData. |
| `MEFXBlockBuffer.copyTo` | The caller supplies writable storage; immutable data cannot be a copy destination. |
| `VFXPixelBuffer.constructor` | Initialises an unencoded numerical video pixel plane. |
| `VFXPixelBuffer.copyData` | Copies numerical video pixel planes, including layout and padding. |
| `VFXPixelBuffer.copyPlane` | Copies one unencoded numerical plane. |
| `VFXPixelBufferPool.acquire` | Initialises pooled numerical pixel storage. |
| `BrowserWebGPUImageExecutionRequest.pixels` | GPU upload contains unencoded numerical RGBA components. |
| `BrowserWebGPUImageExecutor.execute` | GPU readback returns unencoded numerical RGBA components. |

PCM sample arrays and UMP numerical words retain their element semantics too; they add no raw-payload matches to this inventory. Documentation covers Foundation, pasteboards, documents/assets, file panels and the FX guides, including subordinate GraphicsFX and ImageFX pages. The concurrent dirty AnimationFX guide was preserved.

## Native ports

Recorder Blob events/decode and PDF worker snapshot protocols are private constructor details and absent from app declarations. MEFX backing construction and VFX pixel backing ownership factories are private. Public file-handle references no longer expose native file handles; their writers bridge convertible values inside the browser boundary. Native directory wrappers retain structured-cloneable bookmark authority privately. Image/IFX ports and delivered stored-font records use NSEData; native image/IndexedDB buffers remain private bridges. SDK testing delivers immutable captured export records and normalises convertible clipboard inputs.

## Site adoption and call sites

Task-owned final adoption: framework **`b21cf2975212cf91ed0cb19f93165b586468b4c2`**, installed by `node scripts/use-framework.mjs <scratch>` from a clean detached checkout using the requested node_modules junction. [Build receipt](part-b-final-build-receipt.json):

| Item | Verified value |
| --- | --- |
| Archive SHA-256 | `1aa562bc384ea5218e25c846a1e4435bb9eae7224b1d21cf399185f9e3c6cdd1` |
| Source SHA-256 | `ed8f99a23be7e870669aab112e0068763ec4aee42b4e0756ce3a83d54895a8ad` |
| Resource SHA-256 | `c8ff8f43de2ae0132cf8f6f12731c40363bade8636b19c9a5abada6b9d306df9` |
| Resource count | 2,167 |

All five task-created scratch checkouts were removed. Each cleanup first deleted the junction itself, verified the original framework `.bin/vitest`, then removed the verified scratch worktree. [Cleanup receipt](part-b-cleanup-receipt.json) and [final state check](part-b-report-state.json) record the result.

A concurrent session subsequently adopted `c4f9adf`, which descends from `b21cf29`, while this report was being finalised. Its package/vendor changes were preserved. The final state check records that receipt separately, verifies its archive and installed resources, and accompanies fresh framework/site typechecks. It does not relabel earlier suites/package checks as runs against the later snapshot.

Six site files changed:

| File | Migration |
| --- | --- |
| src/SynWare/JournalPublisher.app/Contents/PublisherWindowController.tsx | Export text as convertible UTF-8 data with separate file/MIME metadata. |
| src/SynWare/NSEControlGallery.app/Contents/Gallery/WindowSections.tsx | Export sample text through FilePanelExportPayload.data. |
| src/SynWare/NSEControlGallery.app/Contents/GalleryTextImport.tsx | Read NSEData, check count, decode its byte view, retain reference name/MIME metadata. |
| src/SynWare/NSEControlGallery.app/Contents/TextTransferMedia.tsx | Acquire the sample PNG using data():Promise<NSEData> plus type/size metadata. |
| tests/runtime/publisher/product-controller.test.tsx | Inspect captured export data through an explicit Blob bridge. |
| tests/runtime/publisher/publisher-file-image-ui.test.tsx | Inspect recorded output data through explicit web bridges. |

Site grep also checked pasteboards, share, container readers, images and fonts. Existing container-reader Uint8Array inputs remain valid convertible inputs; numerical pixel arrays remain numerical. Journal/JournalOld controllers, About/artwork, Page/**, Portfolio reader and concurrent gallery/header files were preserved.

## Fusion (read only)

Only the explicitly named SynCloudOS-Fusion checkout was searched. No Fusion file was edited; SynCloudOS-Fusion-gemini was not inspected.

- src/platform/files.ts: 57â€“60: readTextFile uses reference.read(), File.size and File.text(); it needs the new data count/view bridge.
- src/platform/files.ts: 102â€“106: writeTextFile sends blob; it needs convertible data with existing name/MIME metadata.
- FieldLab callers in src/SynWare/FieldLab.app/Contents/index.tsx: 181 (configuration import),204 (JSON export),231 (CSV export),252 (SVG export) use those helpers. Its browser-only downloadBlob fallback is already a native bridge.

## Validation

[Validation summary](part-b-validation-summary.json) preserves counts and individual failures from the original runs. Raw runner JSON remains in this local evidence directory; committed logs and the summary retain the results without adding the multi-megabyte full-run JSON.

| Check | Result and evidence |
| --- | --- |
| Framework `npx tsc -b --pretty false` | Passed, including the final report-state check: [log](part-b-report-framework-typecheck.log). |
| Site `npx tsc -b --pretty false` | Passed after task adoption and again against the concurrent final receipt: [log](part-b-report-site-typecheck.log). |
| Public byte audit | 17 raw signatures, all documented; 99 migrated and nine private: [log](part-b-final-audit.log). |
| Core byte/document/pasteboard checks | 371 passed, including real Chromium, Firefox and WebKit document-asset checks: `part-b-core-focused.json`. |
| Document-output/settlement/media integration | 56 passed: `part-b-integration-focused.json`. |
| MIME/reference/panels | 66 passed: `part-b-mime-green.json`. |
| Native read observation/admission | 50 passed: [log](part-b-file-observation-green.log). |
| Captured exports/clipboard/test host | 46 passed: [log](part-b-captured-output-green.log). |
| FX source and consumers | 171 initial passes; 68 final affected consumers; 35 pixel/backing checks; 59 cross-realm checks. The broader subset had 1,008 passes and four fixture failures, all fixed and covered by bounded rechecks. [FX report](part-b-fx-report.md). |
| Independent source review | Spec-compliance and quality verdicts pass after corrections: [review](part-b-review.md). |
| Post-full TextSystem follow-up | All 17 TextSystem tests passed after fixing the missed example/fixture consumers. The same attempt's two packed cases hit the source guard before execution; later immutable package checks passed. [Log](part-b-fx-packed-text-recheck.log). |
| Post-full browser/reflection/docs follow-up | 20 passed: [log](part-b-last-byte-fixtures.log). |
| FX documentation | Four link tests passed; 13 complete edited byte examples typechecked against source without emitting files. [FX report](part-b-fx-report.md). |
| SDK build and adoption | Passed from clean source, including final `b21cf29` documentation adoption: [log](part-b-complete-site-adoption.log). |
| SDK package and installed Foundation/CPFX | Ten passed on clean `35b91dc`: nine package tests plus the installed consumer. [Results](part-b-sdk-final.json), [log](part-b-sdk-final.log). |
| Repaired packed FX, MIDIFX/LocationFX and file browser | Three passed on clean `35b91dc`: [results](part-b-packed-final.json), [log](part-b-packed-final.log). |
| Final installed `b21cf29` bytes | Data provider, PNG, WAV and MIDI outputs verified as NSEData: [smoke log](part-b-final-site-byte-smoke.log). |
| Architecture boundaries | Fails on the absent `@syndromatic/syncloudos/nse/cover-flow` target. Both aliases and the missing `src/NSE/public/cover-flow.ts` existed at initial `e410c76`. [Log](part-b-boundaries-final.log). |
| Framework full suite, once | **7,244 passed, 29 failed, 873 files**, pinned to clean `31b0575`: [log](part-b-framework-full.log). See classification below. |
| Site full suite, once | **396 passed, three failed, 61 files**: [log](part-b-site-full.log), [summary](part-b-validation-summary.json). |
| Final-package site UI recheck | 13 passed, the same three failed: [results](part-b-site-complete-ui.json). |

The framework full run's 29 failures divide into:

- **23 missed byte consumers/fixtures:** six TextSystem cases, one file-picker expectation, fourteen reflection cases and two packed specimens. These were fixed and rechecked; the original full-run result remains unchanged.
- **One documentation index link:** fixed and covered by the documentation checks.
- **One performance timeout:** passed in isolation with the existing timeout.
- **One installed file-browser timeout:** its owner corrected the affected code; the final immutable packed recheck passed.
- **One generated-validator check:** the junction changed exactly three generated comment paths. Native-worktree tests passed **2/2** without regenerating schema code. [Junction diagnosis](part-b-validator-junction-diagnosis.log), [native check](part-b-validator-native-check.log).
- **Two Inspector bundling failures:** still reproduce on current source, with raw-asset loaders and Node `fs`/`path`/`url` resolution errors. The bounded recheck has five passes and two failures. [Log](part-b-inspector-final.log). This task did not change unrelated Inspector code.

The three site failures remain unresolved:

1. Gallery's editable-window test cannot find the exact expected owned-window title before byte operations execute. Its final runtime cause remains uncertain and intersects concurrent title/window ownership.
2. Publisher's image popover anchor assertion expects an arbitrary fixture button; production layout reanchors to the canonical toolbar button.
3. Publisher's publish popover has the same anchor mismatch.

[Read-only UI diagnosis](part-b-site-ui-diagnosis.md) traces the Publisher implementation to unchanged 2 November code and identifies the Gallery ownership boundary. Repeated current failures establish reproducibility, not a measured pre-migration failing baseline. No assertions were relaxed and no UI architecture was changed to make the byte migration pass.

Early package attempts during source changes correctly failed fingerprint/provenance guards. The final clean-snapshot passes supersede those attempts for package acceptance; the guards remain intact. The complete framework/site suites were not repeated to replace their historical results.

## Commits

Framework implementation/evidence commits:

| Commit | Subject |
| --- | --- |
| `c9d3957` | FX: Return Foundation data from audio files and recordings |
| `db8aaab` | FX: Use NSEData for graphics providers and encoded documents |
| `991044f` | FX: Carry MIDI messages and packets as Foundation data |
| `0021371` | FX: Adopt Foundation payloads across image media and text APIs |
| `6ddb3c1` | FX: Deliver immutable encoded video and container fragments |
| `800185b` | FX: Preserve encoded worker lifetime and migrate remaining consumers |
| `7bee8b7` | FX: Keep pixel backing ownership private |
| `81e8f7b` | FX: Normalise foreign byte buffers before contract dispatch |
| `1c9e68b` | Foundation: Record Part B FX migration and byte exceptions |
| `9682f38` | Foundation: Accept genuine cross-realm byte buffers |
| `f5d8295` | Foundation: Deliver pasteboard data and prepare native share files |
| `648b291` | Foundation: Use NSEData for document resources and assets |
| `b9d17a9` | Foundation: Bridge file panels images fonts and mounted byte clients |
| `ff6eeb8` | Foundation: Preserve native file MIME metadata after byte reads |
| `6f67e0a` | Foundation: Migrate document panel font and image consumers |
| `24802a6` | Foundation: Observe native file byte reads through settlement |
| `d5663a9` | Foundation: Revalidate input file reads at native admission |
| `a9da6ce` | Foundation: Account for every public byte declaration |
| `31b0575` | Foundation: Deliver immutable captured test exports |
| `5b9bb7b` | Foundation: Migrate packed FX and TextSystem byte consumers |
| `de26031` | Foundation: Finish browser and reflection byte fixtures |
| `b21cf29` | Foundation: Complete FX byte signatures throughout the guides |

The [machine-readable commit list](part-b-framework-commits.json) contains these 22 implementation/evidence commits. The final evidence-only commit contains this report, current inventory and receipts; its hash is available from the log for this file. Concurrent intervening commits belong to their respective owners.

Site task commits:

| Commit | Subject |
| --- | --- |
| `bdf62e8` | Foundation: Adopt data values in site imports and exports |
| `2b77bcd` | Foundation: Adopt the completed byte API guides and package |

Concurrent site `ce55b37` previously carried the verified `35b91dc` archive. The task's `2b77bcd` superseded it with `b21cf29`; another session's later package changes remain theirs.

## Preview

The preview is `http://127.0.0.1:5199`, using the exact paired site root and its configured development gate. [Preview receipt](part-b-preview-receipt.json) records HTTP 200 and the concurrent server refresh. Protected listeners 5173 and 5387 remained unchanged; 5210 had no listener. No other preview was restarted by this task.

Automatic approval review rejected this task's combined port-5199 restart attempt before execution with only “blocked by policy”. No process was stopped by that attempt. A concurrent session refreshed 5199 afterwards, and this task preserved the verified listener.

## Open questions and acceptance limits

No API-design question remains for Part B. Remaining integration work belongs to the cover-flow alias owner, Inspector bundling owner and Gallery/Publisher UI owners. Fusion adoption remains a separate read-only handoff. Browser, Node, jsdom and installed-package checks do not establish physical-device/GPU or human visual acceptance. This report makes no Beta 2 release/publication claim. Claude retains review and push ownership.
