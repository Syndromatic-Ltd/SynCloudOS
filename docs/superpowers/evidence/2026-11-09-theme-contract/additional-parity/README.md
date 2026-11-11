# Additional immutable-source comparisons

These are separate engineering evidence, not Task 1 screenshot references. No frozen reference was added or replaced.

The driver compares ten additional states in light/dark at DPR 1/2: Quick Switch (normal and another selection, with a disabled entry), recovery alerts (collapsed/disclosed details), stage/status-bar key state, and combined/range date pickers (text/graphical styles). Each capture is repeated in its own document and must be byte-identical. The current and reference images must also be byte-identical.

Reference source: detached `a1c3617015906b4c802bd7ef7f2183062581f3b8` at `.artifacts/theme-contract-reference-a1c3617`. The driver verifies `src` and `scripts` remain unchanged. Its dependency junction uses this framework's installed modules. The preserved `reference-fixture` is copied only into that reference checkout; it uses the API at a1c3617 and is not a compatibility layer for the current SDK.

The driver uses ports 5378 and 5379 and distinct Vite caches. Run `node scripts/synware/compare-theme-additional.mjs` after preparing the detached checkout and its node_modules junction. Windows checkout needs `git -c core.longpaths=true worktree add --detach .artifacts/theme-contract-reference-a1c3617 a1c3617` because historical evidence paths exceed the old Windows path limit.

`results.json` records source authority, the current source patch hash, fixture hashes and all 40 comparisons. `results.before-date-metadata.json` retains the first accepted comparison before the AppKit property-name correction. Existing reference evidence is never overwritten by the driver.
