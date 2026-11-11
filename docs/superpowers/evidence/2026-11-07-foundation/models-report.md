# Models and defaults migration evidence

Date: 2026-11-07. Implementation commit: `0cd3962`.

## Mapping decisions

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

## Final entry surface

`Foundation/public.ts` exports these runtime values:

- `NSEIndexPath`, `compareNSEIndexPaths`, `NSEIndexSet`, `NSECountedSet`.
- `NSEFormatter`, `NSENumberFormatter`, `NSEByteCountFormatter`.
- `NSEPredicate`, `NSESortDescriptor`, `NSECharacterSet`.
- `normaliseNSERange`, `NSEEqualRanges`, `NSEIntersectionRange`.
- `NSEUserDefaults`.
- `NSEData`, `NSEDataCompressionAlgorithm` supplied by the other worker.

It also exports `NSERange`, all migrated classes' namespaced support types from the table, `NSEUserDefaultsStore` and `NSEDataConvertible`. `formatterFailure`, collection diff/selection/sorting helpers, transformer helpers, the custom date/decimal models and controller snapshot constructors have no named Foundation or NSE SDK export. Existing controller/control declaration signatures may structurally reference internal helper types without exposing their constructors as named SDK API.

Discovery: the approved plan described most Models types as private, but `sdkPackageEntry.ts` already re-exported a substantial custom helper surface. The migration removes those named exports rather than preserving that accidental exposure. Installed authoring fixture imports now distinguish `foundation`, `nse`, and `nse/controls`.

## Ownership and preservation

Checked `git status --porcelain -- <path>` before each existing file's first mutation. Dirty files outside this worker were skipped. No protected concurrent animation/page/file-panel source needed a Models/defaults edit. The open-panel storage port was edited concurrently by its owner; it is not part of this commit. No undo, CompressionFX, NSEData, packaging, script, framework README or overview files are in this worker's commit.

The broad search encountered and skipped other workers' untracked CompressionFX/data/boundary tests and the dirty navigation plan. Clean historical plans briefly received automatic identifier substitution; that substitution was removed before commit and the plans are absent from this commit. No baseline dirty/staged/untracked work was reset, cleaned or committed by this worker.

Moved Foundation source headers were compared against exact original git source bytes. Existing importer newline conventions were preserved. `git diff --cached --check` passed before commit. Exact-path staging was checked against the complete worker-owned file set before committing; no foreign staged paths were included.

## Verification

- `models-red.log`: new Foundation contract test initially fails because the moved modules do not exist.
- `tree-node-red.log`: new AppKit tree-node test initially fails because the module does not exist.
- `models-focused.log`: 11 test files, 77 tests pass under the default Node environment. Covers model values, formatter parsing, predicates/sort, controller integration, public export removal and real tree-node contracts.
- `models-dom.log`: 5 test files, 103 tests pass under their existing jsdom annotations. Covers table, outline, rule editor, core data views and controls using the migrated formatter contract.
- `tree-node-focused.log`: final mutation-trap simplification recheck, 1 file / 2 tests pass under Node.
- `models-typecheck.log`: `npm run typecheck` passes.

Initial focused failures were importer/test-fixture method remnants and were corrected; final logs above are green. Root owns final architecture boundaries, installed SDK smoke/consumer checks and the full framework suite. These checks do not claim physical-device, GPU or human visual acceptance.

Final root review correction: `PredicateValidationError` is a private implementation diagnostic in Foundation/NSEPredicate.ts, with no SDK export and no invented NSE exception class. The public counterpart catalogue now maps every new Foundation/AppKit class and explicitly explains TypeScript support records/unions that have no separate Cocoa class.
