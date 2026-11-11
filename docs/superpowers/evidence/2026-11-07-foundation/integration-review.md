# Foundation Part A integration review

Read-only review of root-owned packaging, architecture checks, installed-consumer specimens, family-count contracts and framework guide pages. Reviewed against shared worktree HEAD `0cd3962` plus concurrent working-tree changes. No installed tests or SDK build were run by this reviewer, preserving the build owner's receipt/source freeze. Source files were not edited.

## Review status

**Ready. No unresolved findings in the bounded review scope.** The P2 below was fixed and independently rechecked before SDK build. Packaging and browser acceptance still belong to the build owner's fresh runs.

## Resolved finding

### P2 — Foundation's DOM guard accepted DOM-only globals outside its hand-written list

Location: `scripts/quality/architecture-boundaries.mjs:1091` (denylist) and `:1097` (program uses the application's DOM-enabled compiler options).

`validateFoundationEnvironment` rejects named globals such as `document` and `HTMLElement`, but it accepts this Foundation implementation:

```ts
export const style = getComputedStyle(null as never).display;
```

Read-only reproduction: imported the real validator and temporarily overrode `ts.sys.readFile` in a separate Node process for `src/Foundation/public.ts` to provide that source text. Calling `validateFoundationEnvironment({ root: process.cwd(), files: ["src/Foundation/public.ts"] })` returned `[]`. No repository fixture was written or changed. `getComputedStyle` is a Window-only global and is absent in workers. Its inferred exported type is just `string`, so strict worker-lib compilation of installed declarations would not reveal the implementation dependency.

Recommended change: make worker-only source compilation (ES2022 + WebWorker, no ambient package types) part of the permanent Foundation boundary gate, or reject global symbols whose declarations are DOM-only. Add a regression with an implementation-only DOM global such as the source above. Expanding the list by one name would fix that example but leave equivalent gaps such as other Window-only functions and HTML element constructors.

This is an enforcement gap in the new guard; the currently reviewed Foundation implementation has no observed DOM-only dependency. The root's separate whole-Foundation worker compilation can establish current source compatibility but should be retained as an automated gate to enforce the stated boundary over time.

**Resolution independently confirmed:** `validateFoundationEnvironment` now creates its implementation TypeScript program with `lib.es2022.d.ts` and `lib.webworker.d.ts`, `types: []`, and strict checking, and reports syntactic/semantic diagnostics for every candidate Foundation implementation. The original `getComputedStyle` reproduction now returns `Foundation worker contract: Cannot find name 'getComputedStyle'.` A fresh direct validator call over the actual complete Foundation source returned `[]` with exit 0. The implementation-only global is covered by a committed-source regression fixture. Reviewed build-owner evidence records the regression failing before the fix (`boundary-worker-red.log`) and 47 boundary tests passing after it (`boundary-worker-green.log`). No full tests or installed tests were repeated by this reviewer.

## Reviewed contracts that align

- Canonical SDK entries map `foundation` to `src/Foundation/public.ts` and `fx/compression` to `src/FX/CompressionFX/public.ts`. Both TypeScript application/authoring aliases and architecture policy aliases match those entries.
- The package-file allowlist admits only the reviewed `foundation.js`, `foundation.d.ts`, `fx/compression.js`, and `fx/compression.d.ts` artifacts, including their normal reviewed source-map handling. Private package paths remain rejected.
- Package export generation derives both root declaration shims and runtime entry targets from the canonical entries. The installed-resource verifier continues checking exact archive integrity, package resources and source fingerprints.
- The literal required FX matrix, manifest assertion, installed deterministic/browser matrices and source entry contract all retain exactly thirteen families. Compression has explicit deterministic and browser scenarios; other families retain their existing rows.
- The Foundation policy imports only Foundation; FX/NSE/runtime and other higher layers may import downward. The environment validator rejects external package imports, including React, while the general layer validator rejects upward source imports.
- Installed-worker specimens use the actual `NSEData`, `NSEIndexSet`, `NSEUserDefaults`, CPFX capability and filter APIs. The push filter uses `write`/`finalize`; the pull filter uses bounded `readData` with null EOF. The strict worker declaration specimen exercises the actual readonly bytes contract.
- The browser specimen builds a consumer outside the repository through the verified SDK archive, uses a real web worker, iterates actual constructor-probed algorithms, and explicitly verifies gzip plus absence of `document` across Chromium, Firefox and WebKit.
- Foundation documentation export names match the public barrel. It accurately distinguishes Foundation's moved formatters/preferences, NSETreeNode in NSE, deferred undo-manager design, and deferred Part B byte-return changes. Overview and index pages include Foundation and CompressionFX and preserve the lower-layer dependency direction.
- A stale "twelve" in `docs/framework/fx/README.md:3` was observed and reported during review; the concurrent root edit now reads "thirteen", consistent with the table and other guide pages.

## Limits

This review validates source and test shape. It does not claim installed-package, browser-engine or physical-device acceptance; the build owner owns those fresh runs. The known baseline missing `nse/cover-flow` architecture alias is excluded from this review's findings, as instructed.
