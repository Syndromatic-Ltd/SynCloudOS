# NSIndexPath follow-up review and correction

Implementation commit: `e853a72`. Source and HEAD frozen after this commit; this evidence is intentionally uncommitted for the parent's final evidence commit.

Independent mapping review identified two Foundation contract defects:

1. `indexAtPosition` delegated to `Array.at`, so negative positions indexed from the end and fractional/NaN values were coerced into valid positions.
2. `indexPathByRemovingLastIndex` returned `null` for an empty path, while the modern NSIndexPath contract returns an empty path for original lengths zero or one.

The focused red run added only two regressions before production changes. It reported 2 failures and 3 passes: `-1` selected the final index `4` instead of returning `undefined`; removing the last index from an empty path returned `null`. See `index-path-review-red.log`.

The bounded correction validates positions with `Number.isSafeInteger` and a nonnegative check before direct indexed access. Both invalid and out-of-range positions return `undefined`, preserving the existing web sentinel and documenting the adaptation explicitly. Removing the last index now always returns a new `NSEIndexPath` and has a nonnullable return type. Empty and single-index paths yield empty paths, with original values unchanged.

Only `src/Foundation/NSEIndexPath.ts`, `tests/runtime/model-indexes.test.ts` and `docs/framework/foundation.md` were committed. The source and documentation were clean before mutation; the test file contained only this worker's previously authorized red regressions. Exact-path staging/commit preserved concurrent work.

Validation: `npm.cmd test -- tests/runtime/model-indexes.test.ts tests/runtime/foundation-models.test.ts` passes 2 files and 10 tests. See `index-path-review-green.log`. `git diff --check` passed for the three owned paths before commit. Root owns the subsequent SDK rebuild and broader checks. No further source edit or commit was made after `e853a72`.
