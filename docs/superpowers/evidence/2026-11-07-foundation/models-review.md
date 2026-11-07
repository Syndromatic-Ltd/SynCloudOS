# Independent model migration review

Scope: commit `0cd3962`, the supplied `models-review.diff`, current Foundation/NSE model implementations and export surfaces, `models-report.md`, and `docs/framework/foundation.md`. Read-only on source. No reported tests were rerun. This review excludes the reviewer's NSEData/CPFX implementation.

## Review status

**Ready. No unresolved findings in the bounded model-migration scope.** Both P2 findings below were fixed in `e853a72` and independently re-reviewed from source, documentation, regression tests and recorded red/green evidence. No source edits, commits or test repeats were made during the resolution review; SDK HEAD remains frozen for the build owner.

## Resolved findings

### P2 — Renamed index lookup still accepts Array.at negative/coerced positions

Location: `src/Foundation/NSEIndexPath.ts:51`.

`indexAtPosition(position)` currently forwards directly to `this.indexes.at(position)`. Consequently `NSEIndexPath.from(2, 4).indexAtPosition(-1)` returns `4`; fractional positions and `NaN` also coerce to valid positions. These inputs can select a real node even though they are not valid zero-based index-path positions. The method has acquired the Cocoa selector name without its positional contract.

Apple documents `index(atPosition:)` as returning the indexed node or the not-found sentinel when the position is out of range; node numbering starts at zero: <https://developer.apple.com/documentation/foundation/nsindexpath/index%28atposition%3A%29>.

Recommended change: explicitly check that positions are nonnegative safe integers and below `length`, then use indexed access. Preserve/document `undefined` as this web API's missing-position sentinel, or consistently reject invalid numeric inputs; do not let negatives/fractions/NaN select another valid node. Add edge coverage for negative, fractional, nonfinite and out-of-range positions.

**Resolution confirmed in `e853a72`:** the method rejects non-safe-integer and negative positions with `undefined`, then performs direct zero-based indexed access, which returns the same sentinel for positions past the end. The guide documents the web sentinel. Regression coverage includes normal indexes, negative/fractional values, NaN, infinities, unsafe integers and positions beyond the length.

### P2 — Removing an index from an empty path incorrectly returns null

Location: `src/Foundation/NSEIndexPath.ts:59`.

`indexPathByRemovingLastIndex()` returns `null` for an empty path, retaining the old custom `parent()` helper's behavior under the Apple method name. Apple's method returns an empty index path when the receiver has zero or one index and has never returned nil on macOS 10.5 or later: <https://developer.apple.com/documentation/foundation/nsindexpath/removinglastindex%28%29>.

Recommended change: return `NSEIndexPath` unconditionally, with an empty path for empty and one-element receivers, and add those two edge cases. Existing optional chaining in migrated callers/tests can then be simplified. This matters for tree code that repeatedly removes path components: the Cocoa operation remains closed over index-path values.

**Resolution confirmed in `e853a72`:** the return type is now nonnullable `NSEIndexPath` and construction from `this.indexes.slice(0, -1)` yields an empty immutable path for both empty and single-index receivers. The guide documents this behavior. Regression coverage verifies both receiver lengths and that the original path is preserved.

Recorded evidence reviewed: `index-path-review-red.log` shows both new regressions failing against the previous implementation; `index-path-review-green.log` records two focused files / ten tests passing after the fix. These are the build owner's runs, inspected without rerunning them.

## Other requested checks

- The reported mapping is coherent: moved public classes have actual Foundation counterparts, and namespaced option/schema/result types are support types rather than invented Apple classes. `NSECountedSet.count` now counts unique objects and `countForObject` counts multiplicity; common `NSERange` uses location/length and disjoint intersection returns a zero range.
- DateFormatter, DecimalValue, closure/registry ValueTransformer helpers, change sets and selection models are retained internally with specific semantic reasons. This avoids presenting custom protocols as NSDateFormatter/NSDecimalNumber/NSValueTransformer. Their old named SDK exports are removed; retained public controller signatures may structurally reference helper types without re-exporting constructors.
- Foundation's public barrel exposes the new names. The NSE SDK entry, NSE controls entry, Controllers barrel and NSE namespace no longer export the moved defaults/formatters or old model names. Searches found no compatibility alias modules/imports referring to the deleted moved Models paths.
- `NSEUserDefaults` matches the previous implementation exactly after newline normalization. Its storage port, independent volatile default domain, and injected store preserve behavior without importing browser storage, React or runtime services. NSEUserDefaultsController remains in NSE and imports the moved class.
- Controllers, fields, table/rule-editor/data-view types, virtualisation, text layout, toolbars and window chrome import the new Foundation definitions. Retained internal sorting/selection/change helpers remain in Models. No stale moved-file import locations were found in source/tests/examples/scripts.
- `NSETreeNode` is a separate AppKit class with mutable represented objects, parent-aware child mutation, derived index paths and descendant lookup. The immutable ID/value/loading/error controller records are separately named TreeControllerNodeSnapshot and remain internal. The tree controller's snapshots were not incorrectly renamed into the public NSTreeNode analogue.
- Documentation accurately distinguishes NSETreeNode in NSE, formatters/defaults in Foundation, and the explicitly deferred dependency-free undo-manager work. The model exception report is materially consistent with source. No Part B byte-return migration was included.

The reported model/DOM/typecheck results remain implementation evidence supplied by the owning worker; this review makes no additional test-pass or browser/device acceptance claim.

## Final counterpart-catalogue follow-up

Read-only review of `3bfc9bd` confirms the Foundation/AppKit additions are registered in `docs/framework/appkit-counterparts.json`. Actual classes map to their Cocoa classes; the explicit non-counterpart records explain the TypeScript byte-unit/input/context/error/schema/option policies without claiming additional Apple classes. The existing catalogue test discovers public names through TypeScript's real module export graph and also rejects stale catalogue entries.

The schema compiler's exception is now a module-private `PredicateValidationError`, with no `export` declaration. `Foundation/public.ts` consequently exposes neither the previous `NSEPredicateValidationError` name nor the private implementation class. All schema/shape/depth/literal validation throw sites still use that private Error subclass; bounded validation behavior was not removed to hide the extra export. The new Foundation-surface regression asserts that the invented public class is absent, while existing invalid-expression/schema tests retain failure assertions.

Reviewed `counterpart-red.log`: the catalogue coverage and new absence regression fail before correction. Reviewed `counterpart-green.log`: three targeted files / 19 tests pass after correction. No tests were rerun by this reviewer. The original `models-report.md` describes its earlier commit `0cd3962`; its listed NSEPredicateValidationError export is superseded by this final correction.

**Final status remains ready, with no unresolved findings in this bounded follow-up.** No source edits or commits were made; the build owner retains the final settled-snapshot build and full-suite acceptance.
