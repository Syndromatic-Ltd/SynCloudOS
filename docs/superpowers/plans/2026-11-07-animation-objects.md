# Animation objects implementation plan

Owner decisions 5 and 6, 7 November 2026, approve this implementation. Execute inline in the supplied shared worktrees; do not create a branch. Temporary detached adoption checkouts are permitted only by the owner's archive-adoption procedure.

**Architecture:** `NSEAnimationContext` owns scoped duration, timing function and implicit-animation transactions. Controllers read the existing reactive `traitCollection.reducedMotion`; React views receive the same read-only trait through `useNSETraitCollection`. The animation environment and its test/host overrides remain internal. Custom presentations belong to `NSEViewController.present(_:animator:)`; child replacements belong to `transition(from:to:options:completionHandler:)`. A view's animator owns movement between layout positions.

**Ownership:** Animation files, controller presentation support, their host adapter, public exports/registry/docs/tests; site MemoJournal, dial, Netburst and the conformance specimen first. Journal, JournalOld, About and Portfolio last, only when their folders are clean. Never touch navigation, split or container implementation. Preserve every unrelated dirty file and stage explicit paths only.

- [x] Add failing tests for nested animation groups, validation, completion and cleanup after exceptions. Implement context transactions and read-only reduced-motion traits; run focused tests and commit.
- [x] Add failing controller tests for custom presentation/dismissal, retained underlying content, animator failure/disposal, and child transition options. Implement the host and view animator without changing sheet/popover/modal behaviour; typecheck, test and commit.
- [x] Capture the current site at 5199, desktop 1440×900 and phone 390×844, light/dark and normal/reduced motion. Exercise MemoJournal open/close, card entrance, dial launch/return/reorder, Netburst and the live gallery specimen. Capture intermediate frames and stable states with source/archive identity.
- [x] Adopt committed framework from a clean detached checkout. Delete its node_modules junction first, verify the shared Vitest binary, then remove the checkout.
- [x] Migrate unblocked callers with the existing AFX layer/managed renderer routes, preserving curves, delays, interruption and reduced motion. Test, inspect browser frames, commit explicit paths.
- [x] Recheck navigation-owned app folders. Migrate each only once clean; otherwise wait at intervals up to 60 minutes, keeping required exports if still blocked.
- [x] Remove retired exports, registry entries, counterpart entries and pinned lists; update NSE/controller docs and mark the animation portion of phase 9 Landed only when its consumers have moved.
- [x] Build the SDK, typecheck both repositories, run relevant packed/API/runtime tests, full site tests and one full framework suite. Inspect captures and console errors. Record all failures and unverified states honestly.

QA includes mid-transition input, repeated open/close and disposal while moving. Verify that no intermediate frame is blank, the list remains mounted under the memo editor, completion runs once, late settlements cannot remove a replacement, and media changes update existing views without remounting. Browser evidence is separate from physical-device/owner acceptance.

Execution and remaining evidence limits are recorded in [the verification report](../evidence/2026-11-07-animation-objects/README.md). Checked items record work performed; the full test suites are not wholly green.
