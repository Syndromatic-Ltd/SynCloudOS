# Foundation Part A report — 2026-11-07

Part A is implemented in the specified shared framework worktree. Part B remains an audit only. No branch/worktree was created or switched, no push was made, and no site adoption was performed. Claude retains integration and push ownership.

Implementation is review-ready. Final whole-SDK acceptance is **not green**: other jobs continue changing AnimationFX/view-transition source during SDK builds, and the existing package provenance guard correctly refuses a new receipt. An earlier verified SDK archive passed actual installed worker/browser checks; that archive predates the final private-predicate-diagnostic/catalogue correction and is not represented as the final package. The source-level checks and exact limits are recorded below.

## Commits

| Commit | Subject |
| --- | --- |
| `8dca9aa` | Foundation: Add immutable NSEData bytes and shared codecs |
| `5ce0402` | Foundation: Add portable SDK entry and dependency boundary |
| `0407c9c` | FX: Add CompressionFX streaming filters and capability probes |
| `0cd3962` | Foundation: Move Cocoa model values into the Foundation layer |
| `53c9bff` | Foundation: Record model mappings and migration validation |
| `78fb63f` | Foundation: Compile implementations against worker libraries |
| `96acd36` | Foundation: Document portable values and the compression layer |
| `e40ea08` | FX: Include CompressionFX in installed acceptance and scaffolding |
| `9a1176d` | Foundation: Guard compression stream admission and await error cleanup |
| `756f9df` | FX: Document compression stream admission and cleanup |
| `17bbe11` | Foundation: Record independent compression lifecycle review |
| `e853a72` | Foundation: Correct NSIndexPath position and empty-path semantics |
| `3bfc9bd` | Foundation: Register Cocoa counterparts and keep predicate diagnostics private |
| `b963a00` | FX: Include compression in package resource fixtures |

A final evidence/report commit follows these implementation commits; its hash is supplied in the task handoff. Concurrent NSE/AnimationFX/About commits are deliberately excluded from this list.

## Apple mapping: every original Models export

The table accounts for every declaration exported by the original `src/SynCloudOS/Models` files. Supporting TypeScript options, schemas and results describe a corresponding class's web API; they do not claim to be additional Apple classes.

| Original declarations | Actual Apple counterpart | Final disposition and semantic assessment |
| --- | --- | --- |
| `IndexPath`, `compareIndexPaths` | Foundation `NSIndexPath` | `Foundation/NSEIndexPath.ts`: `NSEIndexPath`, `compareNSEIndexPaths`. Immutable ordered indexes and lexicographic comparison; derivation uses `indexPathByAddingIndex`, `indexPathByRemovingLastIndex`, `indexAtPosition`, `isEqual`. Static construction and JSON helpers are JavaScript conveniences. |
| `IndexSet`, `IndexRange` | Foundation `NSIndexSet`, `NSRange` | `Foundation/NSEIndexSet.ts`, `NSERange.ts`: `NSEIndexSet` consumes the common `NSERange` shape. Changed `start` to `location`; coalescing, cardinality and range-backed set operations preserve index semantics without materializing large ranges. There is no second `NSEIndexRange` alias. |
| `CountedSet` | Foundation `NSCountedSet` | `Foundation/NSECountedSet.ts`: `count` is unique object count; `countForObject` is multiplicity, with `contains`, `addObject`, `removeObject`, `removeAllObjects`. Iteration enumerates unique objects. Additional count-aware conveniences are explicit extensions. |
| `RangeValue`, `normaliseRange`, `rangesEqual`, `intersectRanges` | Foundation `NSRange`, `NSEqualRanges`, `NSIntersectionRange` | `Foundation/NSERange.ts`: `NSERange`, `normaliseNSERange`, `NSEEqualRanges`, `NSEIntersectionRange`. Disjoint intersection now returns the Cocoa zero range instead of `null`. The normalizer is a web validation convenience, not another Apple class. |
| `Formatter`, `FormatterContext`, `FormatterError`, `FormatterResult`, `formatterFailure` | Foundation `NSFormatter` | `Foundation/NSEFormatter.ts`: the old arbitrary protocol became the abstract `NSEFormatter` class. Its operations are `string`, `editingString`, `getObjectValue`, `isPartialStringValid`; old method names were removed and all consumers updated. `NSEFormatterContext/Error/Result` are TypeScript support types. Parse results encode Cocoa output/error parameters; locale/time-zone context is explicit. `formatterFailure` remains a module helper and is not exported by `foundation`. |
| `NumberFormatter`, `NumberFormatterOptions` | Foundation `NSNumberFormatter` | `Foundation/NSENumberFormatter.ts`: `NSENumberFormatter` extends `NSEFormatter`. Locale-aware number display/parsing, bounds, grouped digits, percent and currency affixes retain real number-formatter responsibilities. `NSENumberFormatterOptions` uses web `Intl` configuration. Unsupported parse forms remain structured failures; this is not a claim of the entire NSNumberFormatter selector surface. |
| `ByteCountFormatter`, `ByteCountFormatterOptions`, `ByteUnitSystem`, `DecimalByteUnit`, `BinaryByteUnit`, `ByteUnit` | Foundation `NSByteCountFormatter` | `Foundation/NSEByteCountFormatter.ts`: `NSEByteCountFormatter` extends `NSEFormatter`; all option/unit types receive the `NSE` prefix. Decimal/binary counts, allowed units, optional count/unit/actual count retain byte-formatter semantics. |
| `DateFormatter`, `DateFormatterOptions`, `DateFormatterValue`, `DateFormatterValueType` | Candidate: Foundation `NSDateFormatter` | **Retained internal in `Models/DateFormatter.ts`; removed named SDK exports.** Display uses arbitrary localized `Intl.DateTimeFormat` output, but parsing accepts only explicit ISO dates or epoch milliseconds. It cannot parse its own localized display, and value type depends on an application option. Renaming it `NSEDateFormatter` would misstate NSDateFormatter's date/string conversion contract. It consumes the corrected `NSEFormatter` contract internally. |
| `Predicate`, `PredicateValidationError`, `PredicateScalar`, `PredicateLiteral`, `PredicateComparisonOperator`, `PredicateTextOptions`, `PredicateExpression`, `PredicateField`, `PredicateSchema` | Foundation `NSPredicate` | `Foundation/NSEPredicate.ts`: `NSEPredicate` supports actual block construction through `withBlock` and object evaluation through `evaluate`. The existing bounded schema/AST compiler remains an explicitly restricted construction/serialization extension, not a Cocoa predicate-format interpreter. Public support declarations have `NSE` prefixes; compiler validation errors remain private. Block predicates reject JSON serialization because no expression tree exists. |
| `SortDescriptor`, `SortDescriptorOptions`, `SortComparator`, `SortDirection`, `SortNulls` | Foundation `NSSortDescriptor` | `Foundation/NSESortDescriptor.ts`: `NSESortDescriptor` compares selected values and returns `reversedSortDescriptor`; supporting types gain the `NSE` prefix. Typed selector callbacks bridge key selection into JavaScript; explicit comparator/collator and null policies remain documented options. |
| `sortWithDescriptors` | Collection sorting operation, not an `NSSortDescriptor` class | **Retained internal** in `Models/Sorting.ts`, importing only the Foundation comparator type. Removed named SDK export. |
| `UnicodeCharacterSet`, `UnicodePropertyName` | Foundation `NSCharacterSet` | `Foundation/NSECharacterSet.ts`: `NSECharacterSet` and support type `NSEUnicodePropertyName`. Membership and union/intersection/inversion operate on Unicode scalars, including supplementary-plane characters; invalid multi-scalar or surrogate inputs reject. Property/scalar factories are web construction conveniences; no bitmap/archiving API is claimed. |
| `DecimalValue`, `DecimalDivisionOptions`, `DecimalRoundingMode` | Candidates: Foundation `NSDecimal`, `NSDecimalNumber` | **Retained internal unchanged.** Arbitrary-bigint coefficient/scale arithmetic has different precision, exponent and overflow behavior from NSDecimal's bounded decimal representation; it is not a faithful NSDecimalNumber replacement. No new NSE decimal class or public alias was introduced. |
| `ValueTransformer`, `ValueTransformerRegistry`, `createValueTransformer`, `composeTransformers`, `negateBooleanTransformer`, `isNullTransformer`, `isNotNullTransformer` | Candidate: Foundation `NSValueTransformer` | **Retained internal unchanged; removed named SDK exports.** These are closure records with per-instance IDs, optional reverse closures and instance-scoped registries, unlike NSValueTransformer's subclass/class-method and named registry contract. Publishing the record protocol as `NSEValueTransformer` would be misleading. |
| `ItemIdentity`, `CollectionChange`, `ChangeSet`, `MAX_INCREMENTAL_COLLECTION_CHANGES`, `emptyChangeSet`, `diffCollection` | No Foundation class with this revisioned incremental-patch contract | **Retained internal unchanged** in `Models/ChangeSet.ts`; removed named SDK exports. Stable-ID collection patches are application/controller implementation data. |
| `SelectionModel`, `SelectionModelOptions`, `SelectionSnapshot`, `SelectionChange` | No Foundation class with this anchor/focus/subscription contract | **Retained internal unchanged** in `Models/SelectionModel.ts`; removed named SDK exports. This includes controller selection policy, not only an NSIndexSet. |
| `TreeNode`, `TreeNodeInit` | AppKit `NSTreeNode`, not Foundation | The old type is an immutable ID/value/loading/error controller snapshot and cannot truthfully become NSTreeNode. It moved to NSE's internal `treeControllerSnapshot.ts` as `TreeControllerNodeSnapshot` / `TreeControllerNodeSnapshotInit`; removed the old named SDK exports. Separately, `NSE/Controllers/NSETreeNode.ts` now implements the actual AppKit responsibilities: mutable `representedObject`, parent-aware child arrays, derived index paths, descendant lookup, and cycle/duplicate checks. Exported as `NSETreeNode` from NSE; never from Foundation. |

`NSEUserDefaults` maps to Foundation `NSUserDefaults` and moved byte-for-byte from `NSE/Controllers` to `Foundation/NSEUserDefaults.ts`. Its injected store and volatile default domain remain intact. `NSEUserDefaultsStore` is a TypeScript storage port. All imports use Foundation; the Controllers barrel, NSE namespace object and NSE SDK entry provide no compatibility export. `NSEUserDefaultsController` remains AppKit/NSE.

`NSEUndoManager` is outside this worker's ownership and remains runtime-owned under the parent's approved fallback. No undo alias is exported from Foundation.

Final correction: the schema compiler's `PredicateValidationError` is private in `Foundation/NSEPredicate.ts`, with no SDK export. It is not an invented Foundation class. The counterpart catalogue maps each public Cocoa class and explains TypeScript-only support records and unions. The detailed implementation and test account is [models-report.md](models-report.md).

## Final public entries and exports

`@syndromatic/syncloudos/foundation` maps to `src/Foundation/public.ts`. Runtime exports:

`compareNSEIndexPaths`, `normaliseNSERange`, `NSEByteCountFormatter`, `NSECharacterSet`, `NSECountedSet`, `NSEData`, `NSEDataCompressionAlgorithm`, `NSEEqualRanges`, `NSEFormatter`, `NSEIndexPath`, `NSEIndexSet`, `NSEIntersectionRange`, `NSENumberFormatter`, `NSEPredicate`, `NSESortDescriptor`, `NSEUserDefaults`.

Additional type-only exports:

`NSEBinaryByteUnit`, `NSEByteCountFormatterOptions`, `NSEByteUnit`, `NSEByteUnitSystem`, `NSEDataConvertible`, `NSEDecimalByteUnit`, `NSEFormatterContext`, `NSEFormatterError`, `NSEFormatterResult`, `NSENumberFormatterOptions`, `NSEPredicateComparisonOperator`, `NSEPredicateExpression`, `NSEPredicateField`, `NSEPredicateLiteral`, `NSEPredicateScalar`, `NSEPredicateSchema`, `NSEPredicateTextOptions`, `NSERange`, `NSESortComparator`, `NSESortDescriptorOptions`, `NSESortDirection`, `NSESortNulls`, `NSEUnicodePropertyName`, `NSEUserDefaultsStore`.

Classes and algorithm objects also provide their corresponding TypeScript types. The exact value/type flags are in [public-entry-exports.json](public-entry-exports.json).

`@syndromatic/syncloudos/fx/compression` maps to `src/FX/CompressionFX/public.ts`. Runtime exports:

`CPFXAlgorithm`, `CPFXCapabilities`, `CPFXCompress`, `CPFXDecompress`, `CPFXInputFilter`, `CPFXOutputFilter`.

Additional type-only exports: `CPFXCapabilitySnapshot`, `CPFXOperation`. `CPFXAlgorithm` is also a type.

The entry allowlist accepts `foundation.(js|d.ts)` and `fx/compression.(js|d.ts)`, including their reviewed source maps. It rejects fabricated subpaths and CSS entries for these modules. Package validation and installed acceptance now cover thirteen FX families. Scaffolding includes a direct, permission-free compression capability recipe.

Foundation imports only its own modules. The architecture layer rejects upward imports, React/package dependencies, and DOM-only globals. The environment gate compiles **implementations** using ES2022 + WebWorker libraries and no ambient types, so implementation-only DOM calls cannot hide behind portable declaration signatures. NSE, FX and runtime consumers may import Foundation. New source headers match the framework's AGPL convention; existing SDK-facing source headers retain their directory conventions.

## NSEData and compression design

`NSEData.from` copies Uint8Array subviews, ArrayBuffers and other NSEData values. Instances are frozen; `bytes` returns a defensive copy with a read-only TypeScript view, so index assignment, typed-array mutation methods, subviews and the returned buffer cannot mutate internal storage. Blob reads are asynchronous. Ranges use the shared location/length `NSERange`, with strict safe-integer and bounds validation. Base64 is canonical padded RFC 4648. Equality, Blob construction, empty values, corrupt inputs and unsupported algorithms are covered.

One codec factory and one-shot collector live in `Foundation/internal/compression.ts`. NSEData uses them directly; CPFX builds on Foundation, preserving the dependency direction and a single codec implementation. The algorithms are zlib, gzip, brotli and zstd; zlib maps to wrapped web deflate. Capabilities construct both native codec directions independently and include only formats that support both. There is no assumed codec, silent substitute or WASM fallback.

Named `CPFXCompress` / `CPFXDecompress` functions follow the FX prefix convention and translate Compression's buffer operations into asynchronous typed values. `CPFXInputFilter` supplies pull-based `readData`; `CPFXOutputFilter` supplies push-based `write` / `finalize`. Both support compression and decompression. Pipelines preserve native backpressure, propagate failures and reject locked-stream admission. Cancellation waits for asynchronous upstream cleanup even after codec failure. Output finalization waits for destination closure. Native codecs may buffer internally; no fixed memory ceiling is claimed.

The guide is [foundation.md](../../../framework/foundation.md), with [CompressionFX](../../../framework/fx/compression.md) alongside the thirteen-framework overview. Foundation and formatters/defaults are no longer NSE compatibility exports. `NSETreeNode` is AppKit/NSE; controller snapshots have an explicit internal name.

## Undo and notifications

Undo uses the task's expressly permitted fallback. There was no existing `NSEUndoManager` class to move in this checkout. The actual `UndoManager` interface carries branded runtime identity, owner records, registration partitions, responder routing and kernel lifecycle controls. `NSEUndoManagerPort` and `SynWareUndoManager` are restricted capabilities; the mounted facade guards revocation and in-flight inversion. Moving only the name would retain a runtime dependency or expose kernel authority through an alias.

[undo-decision.md](undo-decision.md) identifies each contract with file:line and specifies a dependency-free Foundation manager design with runtime-owned routing/leases around it. No undo alias or deprecated forwarder was added. Existing user-notification delivery maps to UserNotifications rather than an in-process Foundation notification centre; no new notification-centre class was invented.

## Part B audit

[part-b-audit.md](part-b-audit.md) contains 125 reachable raw-type declaration matches across 45 source files, with exact file:line, full signatures, exposing SDK entries and proposed replacements. [public-byte-signatures.json](public-byte-signatures.json) is the machine-readable inventory, and [audit-public-bytes.mjs](audit-public-bytes.mjs) regenerates it from the canonical entries using the TypeScript checker. The traversal follows aliases, generics/constraints, public constructors, static/instance members, callbacks, unions and inferred public object fields.

Inputs become `NSEDataConvertible`; delivered byte values become `NSEData`, preserving Promise/array/null/stream wrappers. The audit separately flags explicit Foundation web bridges, writable copy destinations and numeric typed-array backing types, which are not ordinary immutable payload migrations. Seven additional File-only panel/share surfaces are included because File inherits Blob. Host-native ports structurally exposed through public declarations are reported rather than silently omitted; Part B should separate those ports from app-facing data contracts.

No pasteboard/document/panel/share/FX reader byte signature was migrated in Part A. TextFX and other importer edits only redirect moved model/geometry types.

## Concurrent files preserved

No protected source required a pending Models/defaults import fix. The migration found no renamed imports that had to be left unresolved in a protected dirty file. The following running-job areas were left to their owners:

- `src/NSE/Animation/**`, `src/FX/AnimationFX/**`, NSE view-controller presentation/transition code, and browser animation adapters/layer hosts.
- `src/NSE/Page/**`, `NSEPageController`, and page-curl tests/evidence.
- `src/NSE/FilePanels/**`, `src/SynCloudOS/FilePanels/**`, BrowserOpenPanelStoragePort and BrowserFileSystemAccessPanelPort.
- The initially dirty navigation-controller plan and other agents' root page-curl logs/evidence.

Observed concurrent edits also included About/tab-slot lifetime work and window chrome styles. None was reset, stashed, cleaned, staged or committed by this task. See [initial-status.txt](initial-status.txt) and [final-status.txt](final-status.txt) for the preserved worktree snapshots.

## Verification

| Check | Result and evidence |
| --- | --- |
| Baseline `npx tsc -b --pretty false` | Passed: [baseline-typecheck.log](baseline-typecheck.log) |
| Final source `npx tsc -b --pretty false` | Passed after final Foundation source changes: [final-current-typecheck.log](final-current-typecheck.log) |
| Architecture command | Fails on the same pre-existing absent `nse/cover-flow` alias as baseline; [baseline-boundaries.log](baseline-boundaries.log), [final-boundaries.log](final-boundaries.log) |
| Foundation worker implementation gate | Passed with no errors: [final-foundation-worker-gate.log](final-foundation-worker-gate.log) |
| Final focused checks | 129 tests passed across 12 files: [final-focused.log](final-focused.log) |
| Model/controller integration | 77 Node tests passed: [models-focused.log](models-focused.log) |
| Existing DOM consumers | 103 tests passed across 5 existing jsdom files: [models-dom.log](models-dom.log) |
| Counterpart/private-diagnostic correction | 19 tests passed across 3 files: [counterpart-green.log](counterpart-green.log) |
| Thirteen-family resource fixture | 9 tests passed: [resource-fixture-green.log](resource-fixture-green.log) |
| SDK build | One accepted earlier build: [sdk-build-accepted.log](sdk-build-accepted.log). Subsequent final-source attempts bundle successfully but reject changed source/HEAD before receipt publication; see `sdk-build-final-current.log`, `sdk-build-settled.log`, `sdk-build-settled-retry.log` |
| SDK package + all packed-consumer files | Ran all 14 files: 27 passed, 13 failed; changed-source receipts/build guards, [sdk-packed-tests.log](sdk-packed-tests.log) |
| Verified frozen archive: Node worker + strict installed declarations | Passed on archive `2698225e…`: [frozen-foundation-artifact-final.log](frozen-foundation-artifact-final.log). This predates the final private diagnostic/catalogue change, not a final-source receipt |
| Actual installed browser workers | Passed in Chromium / Firefox / WebKit on that same archive: [compression-installed-browser.json](compression-installed-browser.json). zlib/gzip in all three; Brotli additionally in Firefox. No document global in workers |
| Full suite, run once | **7,190 passed / 24 failed**, 846 passed / 17 failed files, 863 total files: [full-suite.log](full-suite.log) |
| Text-layout timeout recheck | Passed alone in 17.32s with the unchanged 30s timeout: [text-performance-recheck.log](text-performance-recheck.log) |

The full run overlapped shared work and this task's corrections; it is not a green final-suite claim. Its 24 failures divide into seven corrected catalogue/private-export/resource-fixture failures (all covered by green focused rechecks), fourteen package receipt/build-guard failures, two Inspector bundling failures, and one text-layout timeout that passed on isolated recheck. No timeout was increased. The original full result is retained; the entire suite was not rerun to replace it.

The two Inspector failures reproduce using a read-only source overlay at the starting commit `ba7d226`, including the same HarfBuzz fs/path/url, WASM and asset-loader failure families. [heritage-baseline-final.log](heritage-baseline-final.log) records starting/current comparisons for both graphs. This is baseline bundling evidence, not a full baseline suite claim. Only the absent architecture alias was directly recorded before implementation; no unverified failure is called pre-existing.

Independent review found and corrected the worker-global enforcement gap, post-codec-error cancellation cleanup, locked-stream admission, and NSIndexPath invalid-position/empty-removal semantics. See [integration-review.md](integration-review.md), [models-review.md](models-review.md), [data-review.md](data-review.md) and their red/green logs. No unresolved code-review findings remain for this task's source.

## Open work and questions

- A final whole-SDK receipt and successful receipt-gated packed test run require the other source jobs to settle. Keep the source guard intact; rebuild and rerun affected package consumers then. No final-source archive acceptance or release is claimed here.
- Correct the pre-existing cover-flow alias independently of Foundation, and repair the Inspector test's browser bundling fixture/asset boundary in its own scope.
- Decide faithful NSDateFormatter, NSDecimalNumber and NSValueTransformer designs before making those internal helpers public Foundation classes; current semantic mismatches are explicit above.
- Implement the separate Foundation undo contract/runtime lease extraction before exporting `NSEUndoManager`.
- Execute Part B after the concurrent panel/page/animation work lands. The owner still controls the Beta 2 cut line.

There is no permission or owner-design question blocking the implemented Part A source. No merge, site adoption or push was attempted.
