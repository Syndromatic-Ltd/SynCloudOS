# Foundation Part B progress

Start: framework `e410c76`, branch `fix/blind-rewrite-friction`, 2026-11-07. Work in the existing shared checkouts. Do not switch branches or push. Only the explicitly required clean temporary adoption checkout is permitted.

## Tasks

- [x] Framework baseline and byte-contract regression tests.
- [x] App-facing pasteboard, documents, file panels, share, image services and font library; host port separation.
- [x] FX byte inputs, outputs, streams, readers and consumers (delegated; brief below).
- [x] Framework docs/examples; regenerate and classify every remaining raw signature.
- [x] Framework typecheck, boundaries, focused tests; small explicit-path commits.
- [x] Clean committed-source site adoption and complete site consumer migration.
- [x] SDK build/package and packed consumer checks; framework/site full suites once, with failures retained.
- [x] Final report with commits, inventory, exceptions, ports, consumers, evidence and limits.

## FX worker brief

Read section 5 of `docs/superpowers/plans/2026-11-07-foundation-layer.md`, Part A `README.md`, `part-b-audit.md`, `public-byte-signatures.json` and `audit-public-bytes.mjs` in this evidence directory first. Owner approved breaking changes before Beta 2: no aliases, shims or overloads preserving raw byte returns.

Ownership: `src/FX/**` except `src/FX/AnimationFX/**`; FX-related platform adapters under `src/SynCloudOS/PlatformAdapters` for Audio, MIDI, Video, Text, PDF and image-processing (including BrowserImageProcessingWorker and BrowserWebGPUImageProcessingBackend); FX-specific tests, fixtures, scripts, examples, docs/framework FX pages. Do not edit runtime image service/types (`src/SynCloudOS/Images/**`, BrowserImageAdapter), NSE, other app SDK/services, site, Foundation, or shared audit outputs. Send integration needs to the parent. You are not alone in the codebase: preserve all others' edits, do not revert them, and leave any already-dirty file you don't own alone.

Migrate audited payload inputs to NSEDataConvertible and delivered bytes to NSEData preserving wrappers (including stream chunks). Numeric pixel/index/PCM arrays, writable copy destinations and native host bridges can remain raw, each with an explicit reason. Separate structurally leaked native host ports from app contracts; do not publish raw backend ports. Preserve native codec protocols privately. Update every FX consumer including packed checks/examples. New source/test files copy the neighbouring licence header; DOM tests use the jsdom directive first. Use test-first contract checks, run focused relevant tests, do not run the full suite or SDK builds (parent owns those). Commit small groups with explicit paths only, Foundation:/FX:/NSE: subjects and a short body, no attribution. Never push, branch, create worktrees, stash, reset, delete node_modules, or inspect SynCloudOS-Fusion-gemini. Avoid About animation adapters, page headers and Page/**.

Report to `part-b-fx-report.md` in this directory: signatures changed, each carve-out, ports separated, file list, commits, exact focused tests/results and integration concerns. Return only status, commits, test summary and concerns. Parent handles site/Fusion read-only inventory and final aggregate checks.

## Baseline concurrent state

Framework tracked dirty file: navigation-controller plan. Other jobs have untracked page-curl/About evidence. Site tracked dirty paths: About app/artwork and tests, Journal/JournalOld window controllers, package manifests and vendor receipt/archive. These are preserved. No AGENTS.md found in the checkout or its ancestors.

## Checkpoint before immutable adoption

Core contracts and browser checks:371 passing tests; integration56 passing; MIME/panels66 passing; latest native observation50 passing. FX source fixes and consumer checks are recorded in part-b-fx-report.md. Framework typecheck passes. Architecture boundary failure is a pre-existing absent nse/cover-flow target (confirmed in starting e410c76). Review found and resolved MIME accessor capture, cross-realm input dispatch, native read observation/admission; independent spec and quality verdicts pass. Final raw count17:99 migrated and9 hidden from the original125 matches.

This checkpoint predates final adoption. Its provisional package status is superseded by the final state below.

## Final state

The task's final clean adoption is framework `b21cf29`, site commit `2b77bcd`; six site consumer/test files landed in `bdf62e8`. SDK build and immutable adoption succeeded. The clean `35b91dc` package/installed-Foundation run passed ten tests; the repaired FX, MIDI/Location and file-browser packed run passed three. The final `b21cf29` installed byte smoke and site typecheck passed. A concurrent session later adopted framework `c4f9adf`; its package/vendor changes were preserved and both repositories typechecked again. `part-b-report-state.json` records the observed receipt and installed-resource checks.

Full suites ran once each: framework **7,244 passed / 29 failed, 873 files**; site **396 passed / three failed, 61 files**. Subsequent bounded checks resolved the missed byte consumers, documentation link, performance timeout and file-browser timeout; the generated validator passed natively after identifying junction-only comment-path drift. Two Inspector bundling cases still fail. The cover-flow architecture alias remains absent, as at the task's starting commit. The final-package site UI recheck reproduces the same three title/anchor failures. No full-suite pass is claimed.

The regenerated audit reports **99 migrated, nine private host/backing declarations and 17 documented carve-outs**, accounting for the original 125 rows. All five task scratch checkouts were removed after unlinking their node_modules junctions and verifying the original vitest executable. No branch switch or push occurred. The port-5199 restart attempt was blocked before execution by automatic approval review; a concurrent session refreshed the verified listener, which was preserved.

The [final report](part-b-report.md) supplies the full commit list, each carve-out, port separations, site/Fusion call sites, validation evidence and unresolved integration ownership. No Part B API-design question remains. Claude retains review and push ownership.
