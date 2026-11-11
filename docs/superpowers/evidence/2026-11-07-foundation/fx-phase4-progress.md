# FX phase 4 ledger
Active worktree: framework fix/blind-rewrite-friction. Base 98d7995. No branch switches or feature worktrees. Approved PWA/Foundation plans read in full. User forbids editing other uncommitted work; preserving all unrelated files/evidence.

Completed source areas:
- Location: existing speed verified end-to-end (17 focused tests), no invented speed API/accuracy estimate. Commit 66cfc2f.
- CRFX: db872f3,550f491, reviewer fix af4d21a. Pure WebCrypto/NSEData, worker consumer ready, no device entitlement/session needed.
- NWFX: initial sources accidentally included in concurrent commit 8dcfa3e after shared-index race; no history rewrite. Network report records this. Root integrated exports/context/hook.
- Audio: 0e7b23d review + feeacb5 stopping after revocation; bc3aa4e category authorisation. Speech class/queue, category arbitration and unsupported microphone independence. Dedicated mountedAudioSpeechClient avoids recognition job collision.
- Video: 5f12f4e,41b4d80 and review af4d21a; PiP/route ownership, element filter private display track, capability flags and lifecycle guards. NSERoutePickerView 9bc5f83: real NSEButton/Atmo, no artwork invention.
- Registries bdbeb98,7ad7786: package entries network/crypto, aliases, literal 21 family package tests, docs/Apple counterparts.
- Root SDK wiring 189b35d: context fields/getters, mounted registry, hooks, boundary aliases and host seams. Last focused 42 tests passed.

Currently pending source integration:
- appRuntimeFacade.ts + BrowserRuntimeEnvironment.ts have ROOT edits mixed with PHASE-5 edits. Do not commit/overwrite other's edits; waiting for their checkpoint. Root environment fields are speechSynthesis/networkPaths/videoPresentation; source imports present and runtime factory calls present.
- Entitlements job removed manifest.permissions. Root factory callbacks still use permissions in mixed dirty appRuntimeFacade; must change to entitlements once other job commits. Existing runtime other sites similarly migrating. Current source-wide typechecks are blocked by concurrent entitlement migration; no new root API errors except outdated factory reads.
- Final architecture must report known WindowManagementFixture violation plus any concurrent leftover honestly. Last run has many concurrent new violations outside this task; root-owned seams registered with no new own violations.

Site prepared (uncommitted owned files): Gallery/FXCapabilitiesSection.tsx, Gallery/catalogue.ts, Gallery/sections.ts, Contents/Info.ts. New section Device & Data Capabilities, actual NSE controls only, own media video target; uses entitlements. Unmounts examples when section inactive. Need safe temporary-checkout adoption, tsc+vitest, screenshots, commit only own site paths and actual adoption outputs. Protect 5173/5210/5387. 5199 listener originally PID75496,5387 PID69072; do not touch others.

Live source-browser evidence:
- fx-phase4-browser-results.json: Chromium PiP true/native match then exit; speech completed with3 voices; network sat/unsat/sat+effective4g; unknown interface/cost. Route availability unknown, no receiver accepted. Audio Session absent. Headless element getDisplayMedia unsupported.
- Firefox speech completed (voices arrive asynchronously5), status changes; no Network Information/PiP/Remote Playback/category/element APIs.
- Playwright WebKit on Windows has no speech/media/canvas capture/these PiP or route APIs; status changes work. Do not present as real Safari device results.
- Headed Chromium retry with native current-tab autochooser and COOP/COEP currently running exec session62982.
- Persistent node_repl Playwright import failed ESM/CJS export interop; CLI Playwright used successfully instead. Browser harness uses real browser APIs and source adapters/mounted clients, not installed-package or full app acceptance yet.

Remaining: clean up integration after checkpoint, typechecks, sdk build+package tests+packed consumers, Crypto installed worker consumer (all3 engines), full framework suite ONCE --maxWorkers=1 --no-file-parallelism, site adoption via approved temp detached checkout/junction workflow, tests and live gallery captures at1x/2x, report+commit own evidence only. Final adoption must use framework HEAD that typechecks and re-adopt if another adoption supersedes.

Coordination resolved via explicit ownership handoff appended to phase5-shared-integration-handoff.md: phase5 now owns/stages both mixed runtime files including preserved phase4 hunks and migration of their obsolete permission suppliers. Root must not edit them until committed. Headed Chromium real tab capture + RestrictionTarget/restrictTo succeeded (fx-phase4-browser-results-headed.json). Earlier headless failure is display chooser environment limitation, not lack of target APIs.

Resumed per owner after proxy cooldown. Rechecked git logs/status in BOTH repos; current framework a3717bf + root 73eb844/d962356, site c9d77c4. Mixed integration 089f37a already committed, own factory callbacks now d962356 checks host app access. Do not edit appRuntimeFacade further: authorization owner has migration ownership. Browser in-flight rerun passed via real headed Chromium (speed emulated12.5, native PiP/speech/network, element restrict/crop/clear). Last focused95/95 then new speech retained-host test + related28/28. Typechecks fail ONLY concurrent old permission reads and MotionFX readonly assignments; architecture aliases currently inconsistent in other job's dirty registry. SDK declaration build failed same old permission reads. No framework final full-suite run yet; keep it for end. Still need safe clean-checkout SDK+site adoption, packed consumers and Crypto worker test, source full suite once, site tsc/tests/live screenshots, commit own site/evidence/report only.


Final delivery checkpoint: implementation and both-repository commits are complete. Latest source checks at b0bfc6a7 pass both typechecks and retain only the known architecture violation. Focused 96/96, recovered failed-file checks 386/386, final external SDK consumer and isolated Chronosphere consumers pass. Final site assertions and the preserved same-commit peer archive are documented in fx-phase4-report.md. All task-owned temporary worktrees have been removed safely; shared framework Vitest is intact. No push or branch switch occurred.
