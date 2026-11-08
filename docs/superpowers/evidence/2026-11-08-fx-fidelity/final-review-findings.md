# Combined FX fidelity review

Review target: framework `c50049b..f2cd9dfc268fd700f3ee3b9d375c5f5f09a3689a` and the five-path staged Gallery packet based on site `35d43ac`. This report concerns that frozen implementation, before final correction, SDK adoption and acceptance. Read-only review; this report is the only file written. No suites, servers, ports, staging, commits or worktrees were started or changed by the reviewer.

## Strengths

- The option A implementation separates stable compiled application identity from authority. `bindFXFamily.ts` caches a subclass per canonical application/base class, leaves pure values alone and preserves base `instanceof`. `fxSessionBinding.ts` pins the first selected session and detects abort/removal; the generated application module and private runtime are packaged in the same SDK graph. The documented unsupported separate-copy/non-plugin cases do not introduce ambient context, provenance checks or registry sharing.
- The integrated device surface uses Apple classes/protocols, sender-first delegates and Dispatch delivery. The shared runtime, SCOS facade, browser environment and context types remove the old client properties rather than retain aliases. Mounted ports and native adapters are privately associated. The final hook receipt reports eleven declaration roots with zero reachable family-internal modules and real compiled/installed execution; the review inspected the owning resolver/build and host-association source rather than relying only on export names.
- Lifetime and privacy coverage is substantive: the family correction evidence records denial after prior grant, revoke/regrant generations, stale native completions, replacement operations and resource cleanup. The aggregate hook test actually mounts branded contexts in two runtimes with duplicate configured IDs, checks class identity and StrictMode replay, and measures owner-specific Network disposal. It is not merely a mocked hook-shape test.
- Foundation and pure-family changes have independent interoperability evidence, notably raw DEFLATE decoding rather than only a symmetric round trip. Crypto has typed hashes/keys/signatures and the later specialisation-identity correction. Dispatch Tasks 1–6 retain the explicit in-realm scope, including real per-session delivery and target-lifetime checks; no worker performance or later adoption is claimed.
- The Gallery uses the existing NSE controls, supplied controller presentation and real public family objects. Fresh terminal Network/NFC objects, independent speech operation generations, declined payment demonstration and Bluetooth stale-selection guards are explicit. The reviewed diff leaves the complete existing VideoExample, Audio examples and Location example unchanged. The protected framework Location/Motion/MIDI/Haptics/Video directories have no changes in the reviewed range.

## Issues

### Critical

None found in this combined review.

### Important

#### I1 — A throwing session-end callback leaves later families and Dispatch live

- **Location:** `src/SynCloudOS/AppSDK/scos/scosSessionRegistry.ts:52` (with the observer map removed at line 51).
- **Problem:** The unregister function invokes its observers in one unguarded loop. If one cleanup throws, every later observer is skipped. The session has already left `sessionsByApp`, and its observer set has already been deleted from `removalObservers`, so calling unregister again does not finish the skipped cleanup.
- **Concrete consequence:** Registry removal is explicitly a terminal event even without `AbortSignal.abort()`. A previously registered cleanup can throw, for example through an NSE contact-picker subclass disposal hook or a native subscription disposer. The later Dispatch lifetime then never becomes ended, and pending work can execute after its session has been removed. This defeats the shared terminal-lifetime guarantee despite the per-family checks being individually correct.
- **Read-only reproduction:** Bundled the actual registry, binder and `DFXQueue` source with esbuild using `write:false`, imported the output through an in-memory data URL, registered a session, installed an earlier throwing end observer, constructed the bound `DFXQueue.main`, enqueued work, removed the session without aborting and drained the held scheduler callback. Result: `queuedWorkExecutedAfterRegistryRemoval: 1`, `remaining: 0`, `signalAborted: false`. A simpler two-observer probe produced only `events: ["first"]`; the second callback never ran.
- **Fix:** Attempt every observer independently, preserving/reporting cleanup errors only after all terminal notifications have been attempted. Keep removal idempotent and ensure a reentrant observer cannot prevent the remainder from being notified. Add a focused regression with an earlier throwing observer, actual queued Dispatch work and a later cleanup; verify no stale work runs and the error remains observable. Recheck affected lifetime/host integration and the final packaged graph after the correction.

#### I2 — An XR availability rejection now rejects the entire capabilities report

- **Location:** `src/SynCloudOS/InstalledApplications/capabilityReport.ts:42` (the new special cases occupy lines 42–45); downstream consumer `src/Webspring/Preferences/Capabilities.prefPane/index.tsx:34`.
- **Problem:** The migrated XR/Bluetooth/NFC/Pass queries execute before the existing per-family `try/catch`. In particular, `BrowserXRAdapter.isSupported` at `BrowserXRAdapter.ts:97` forwards the native `isSessionSupported` promise directly. A native failure, including a permissions-policy `SecurityError`, rejects `Promise.all` instead of becoming the XR row's error value.
- **Concrete consequence:** The Capabilities preference pane installs only a success continuation on `systemCapabilityReport`. One unavailable/refused XR query therefore leaves the complete FX table empty and creates an unhandled rejection; unrelated families' successful rows are lost. The previous generic query path isolated failures per family.
- **Read-only reproduction:** Bundled the actual report, XR adapter association and `BrowserXRAdapter` in memory. Associated a secure browser adapter whose native `isSessionSupported` rejected with `DOMException("XR policy denied", "SecurityError")`, then called `systemCapabilityReport` with that environment. Result: `wholeReportRejected: true`, `errorName: "SecurityError"`, `error: "XR policy denied"`.
- **Fix:** Put all migrated passive-query branches under the existing per-row error boundary, retaining the appropriate Apple query label and error text. Add a targeted rejection regression proving that the XR error row and the other family rows are all returned. This needs no new public capability API or unrelated UI redesign.

Both Important findings were sent to the coordinator immediately with their source-backed reproductions. They remain open against the reviewed SHA; this report does not anticipate a future fix.

### Minor

#### M1 — Two renamed mounted ports escaped their intended architecture classification

- **Location:** `scripts/quality/architecture-boundaries.json:399` and `:400`.
- **Problem:** The `app-sdk-host` includes still name deleted `mountedBluetoothClient.ts` and `mountedNFCClient.ts`. The actual `mountedBluetoothPort.ts` and `mountedNFCPort.ts` consequently match the broader `app-sdk` rule instead. The other migrated family ports were updated correctly.
- **Impact:** The check can pass while these two host authority files are outside the intended restricted host-entry import rule. No current public declaration leak was demonstrated; this is a guard migration gap, not evidence that app code currently receives a native adapter.
- **Fix:** Replace the two stale paths with the corresponding port paths and run the architecture check. This is a narrow correctness adjustment, not a new architecture exception.

#### M2 — Shared FX guide retains obsolete hook/manifest guidance

- **Location:** `docs/framework/fx/README.md:69`, `:74`, `:77`.
- **Problem:** `useNFC` is still described as a session factory, the hook table has no `useNetwork` row, and the manifest instruction names `permissions` rather than `entitlements`.
- **Impact:** This contradicts the new object-returning hooks and can send authors toward a removed API or the wrong manifest field.
- **Disposition:** Already identified and assigned to the coordinator before this review; apply the narrow documentation correction after the current source freeze. The per-family guides and mounted ports remain the authority; there is no central closed entitlement registry to invent.

## Required triage of the existing Minor ledger

Every entry in `minor-findings.md` was considered:

| Ledger entry | Disposition and reason |
| --- | --- |
| Contacts/other family SDK circular-chunk and execution-order warnings | Retain as known build debt and a limitation of the build claim. `hooks-sdk-build.log` still contains these warnings, including re-export cycles. Existing installed production/PWA proofs exercise the relevant new graph and have passed; no new execution-order failure was established here. Do not demand an unrelated bundling refactor, and do not describe the SDK log as warning-free. Final browser/installed acceptance still matters. |
| Speech header mojibake | Closed by `b743352` and scoped re-review. The inspected current Speech/hook sources contain normal copyright text. No new finding. |
| Dense NFC flow/packed scenarios (`tests/runtime/fx/nfc-flow.test.ts:77`, `nfc-packed.test.ts:19`) | Confirmed readability debt. These lines make sequencing and localisation harder but are not by themselves a functional defect. Defer formatting under the owner's correctness/API-only scope; preserve the meaningful tests. |
| Dense Bluetooth lifecycle/adapter statements | Remaining density is visible, especially in `BrowserBluetoothAdapter.ts` and the unchanged compact parts of `BTFXCentralManager.ts`. The corrected connection/retirement blocks are materially clearer. Retain as nonblocking readability debt; no broad reformat is needed for acceptance. |
| Broad aggregate non-Network unmount assertions (`hooks-runtime-mount.test.tsx:90–92`) | Those `toThrow` assertions alone cannot establish that operations succeeded before unmount, because the fixture has not granted every native operation. Treat them as supplemental only. The same test's actual identity/replay/passive-render and measured Network ownership assertions are meaningful; accepted family flow/installed tests supply other families' operational and terminal evidence. No duplicate all-family aggregate suite is required solely for this wording weakness. |
| Twenty supplemental shared-helper TypeScript diagnostics | Retain as disclosed baseline test-typing debt. The coordinator established identical baseline locations/codes and helper bytes, and zero owned-file diagnostics after fixture typing. This does not invalidate the required repository typechecks, but it is not a clean supplemental test-file typecheck. This reviewer did not rerun either check. |

## Scope and evidence limitations

The complete change inventory has **542 framework paths**: 262 FX paths, 56 other source paths, 131 test paths, 16 shipped documentation paths, nine scripts, three configuration paths and 65 evidence/plan paths. The site packet covers five paths. The review used the whole-range log/stat/inventory and bounded diff/source reads for the integrated compiler/binder, package resources, SCOS registry, runtime/context/environment migration, hooks, Dispatch lifetime/scheduler, Contacts presentation, capability report, Foundation additions, metadata/guards and the entire staged Gallery implementation/test diff. The earlier independent family reviews, correction evidence and immutable installed proofs provide the detailed family-member review coverage; this is not a claim to have independently reread every line of every family implementation or rerun every suite. Truncated bulk output was not treated as complete evidence.

Authority used: `docs/superpowers/reviews/2026-11-08-fx-device-families.md`; immutable Dispatch design and Tasks 1–6; option A decisions and deviations in this directory's PLAN/REPORT and `option-a-implementation.md`; the ledger; family correction/review records; `hooks-root-acceptance.json`; Gallery evidence and preservation recipe. The intentional omissions of Speech OperationQueue, payment button/artwork, VR and Dispatch Tasks 7+ are accepted owner decisions, not missing-work findings.

The accepted hook receipt pins framework `f2cd9df`, nine frozen files and archive `c3b2fa369b26da1cf0cf533a40284a2e8671977c79828a59767ab0d986e20306`. It records source fingerprint `26cc6f90c8eb3cc663668253651e8da8f8bc01fd887b33785b43e061644ecf5e`, real outside-repository installation, three compiled app tests, strict installed types, production execution and resource integrity. During the ongoing full run, the mutable `hooks-installed.json` had a different archive/resource hash with the same source fingerprint. That later mutable receipt is not silently substituted for the accepted frozen receipt; the final implementation/adoption must receive its own exact receipt.

Gallery preservation uses the reproducible whole-FunctionDeclaration extraction from `35d43ac`: LF VideoExample `fdc780cbe1b25b27d976b1ea8ed1896344b849f81736c69a54c6d4bbf0f065b9`, original CRLF `e0e5fc0feeeeb2f93b02b648a0924022329aa8d57b2e8dc607121e25413faad0`, raw-video line `182fbf8f67ae6f7b9528e227f94f66a12a51605cc84cde551c3431e9e8cb9f43`. The earlier derived `88E2…` hash was not reproducible and is not used as acceptance evidence. No content exception was granted.

## Recommendations and remaining gates

1. Correct I1 and I2 with focused regressions, and apply the narrow guard/documentation corrections after the coordinator's active source freeze. Review the resulting deltas; do not extend the work into other families or artwork.
2. Reconcile the required serial full framework result. At dispatch to this reviewer it was still running on `f2cd9df`, with one Chromium document-asset case failing under investigation and the remaining five cases in that file passing. Neither an unresolved failure nor an incomplete run is a pass; this reviewer has not assigned that failure to FX without evidence.
3. Freeze the final implementation SHA and archive after corrections. Perform the prescribed clean SDK adoption, exact receipt checks and original dependency-junction cleanup procedure; earlier family archives do not prove later source bytes.
4. Run the required adopted-site typecheck and full site suites. The prepared twelve Gallery runtime cases, including the new speech interleaving fix, were not executed against the old SDK and remain unvalidated here. The three passing Node source-contract cases establish preservation/import constraints, not runtime acceptance.
5. Inspect the actual adopted Gallery in Chromium at 1440×900 and 390×844 in light/dark, capture all four requested views and inspect console/control behaviour. No screenshots were supplied to this reviewer; this source review does not approve visual/browser acceptance. Physical Bluetooth/NFC, native contacts/payment/supplied-audio speech backends and AR hardware remain separate unverified limits.
6. Update PLAN/REPORT with the exact final deltas, failure disposition, results, adopted SHA, archive receipt and site commit. Keep historical failed runs and scoped/browser/hardware limits explicit.

## Assessment

**Ready to merge/accept: No, at the reviewed SHA.** Two confirmed Important integration defects remain: shared teardown can permit stale Dispatch execution after registry removal, and a passive XR query can erase the whole capabilities report. The architecture and API migration otherwise have strong scoped and installed evidence. A positive final verdict is conditional on the fixes, delta review and the still-pending final framework/adoption/site/Chromium gates above.

## Frozen correction delta re-review

This section supersedes the open-finding status and implementation verdict above for the reviewed correction packet. It does not erase the original findings or convert the historical full run into a pass.

Target: the complete `final-fix-review-frozen.diff` from `f2cd9df` to the staged corrections, together with `final-fix-task-brief.md`, `final-fix-evidence.md`, the owning source/tests, frozen byte manifest and validation logs. Source fingerprint: `00451c7747dddc2a6bb477801c03a2d2146f4065e5acb9ddec9ed4303491f9bb`. The reviewer independently hashed all nine named source/config/guide/test files and their staged blobs: every working and index hash matches `final-fix-frozen-inputs.json`. The correction evidence record can still receive package/commit appendices. No suites were rerun by the reviewer.

### Finding closure

| Finding | Status | Evidence and assessment |
| --- | --- | --- |
| I1: interrupted terminal notification | **Closed** | The registry detaches the exact observer set, snapshots it, catches each callback failure independently and only then rethrows the original single failure or an AggregateError containing all failures. The regression uses actual bound main queues, an earlier reentrant throwing observer and a later observer; the removed session's work is dropped while a surviving exact session's work runs. A second regression checks multiple failures, a non-Error throw, complete cleanup and idempotence. The RED log shows the prior stale-work/lost-cleanup behaviour and GREEN confirms the correction. |
| I2: report-wide failure from one passive query | **Closed** | All four migrated passive-query branches execute inside the per-row exception boundary; their Apple query label is set before calling the adapter and retained on failure. The real BrowserXRAdapter regression first verifies that direct native SecurityError rejection is preserved, then verifies every report row survives. Synchronous Bluetooth/NFC/Pass failures are covered too. No family adapter refusal was swallowed or public API added. |
| M1: stale architecture paths | **Closed** | Exactly the two stale client filenames now identify `mountedBluetoothPort.ts` and `mountedNFCPort.ts`. No layer permission or exception widened. The architecture log validates 1,795 files / 8,169 edges. |
| M2: obsolete shared guide | **Closed** | The guide describes the actual component-owned NDEF session, includes Network's monitor/entitlement row and uses the manifest `entitlements` field. No usePass alias or closed entitlement registry was introduced. |

No new Critical or Important issue was found in the correction delta. One nonblocking evidence-only encoding issue was sent to the coordinator: the reviewed `final-fix-evidence.md` text contains mojibake in some dash/arrow characters. It is outside the nine frozen implementation/config/guide/test paths and can be corrected while appending evidence; it does not require implementation changes or a test rerun.

### Full-run and follow-up evidence assessment

The two package-fixture corrections are appropriate. They add Dispatch to independent literal inventories and update the twenty-two-root description. Exact family equality, rejected extra/private exports, resource/hash/archive checks, traversal, corruption, old-manifest and source-mutation rejection remain intact. The production closed guards were not relaxed; the installed-consumer change only removes an outdated count from its error message.

The original full result remains **991 files: 988 passing / 3 failing; 8,205 passing / 8 failing tests out of 8,213**. Inspection of its JSON identifies exactly the reported failures: two cases in `fx-entry-contract.test.ts`, five in `package-resources.test.ts`, and the initial Chromium navigation case in `document-asset-browser.test.ts`. The JSON's `num*TestSuites` fields count nested suites rather than test files; use the file summary, not those nested-suite totals, when reporting the 991 files.

The focused post-fix log reports **50 passing tests / four files**, including both fixture files and all six new source regressions. The broader serial post-fix log reports **766 passing tests / 86 files** and its explicit file inventory covers Dispatch, app attribution, affected family flows/hooks, privacy, SCOS and relevant host boundaries. Framework typechecking and architecture pass. These are meaningful checks for this narrow correction; they are not a second complete framework run and should not be presented as one.

The unchanged-source cold diagnostic log records the formerly failing browser case passing in 17.51 s; its five filtered cases are correctly shown as skipped by selection, not removed. The subsequent unchanged whole-file log records **all six browser cases passing in 31.01 s**. The coordinator also records a warm case pass. No timeout, assertion, skip or browser source change appears in the frozen correction diff. This supports treating the original initial-navigation timeout as a transient test-run failure rather than an unresolved demonstrated FX regression. The original failure stays in the record. A second complete 37-minute run is not required by this review solely to relabel that history; the focused and broad follow-up evidence is proportionate to the actual fixes and the owner requested one serial complete run.

### Current conditional verdict

**Implementation delta: approved. I1/I2/M1/M2 are closed.** At re-review, the one new SDK build and four immutable packed gates were in progress; their final success, frozen archive/source integrity and committed-byte verification remain conditions for accepting the final implementation commit. The reviewer has not asserted those pending results.

**Overall job acceptance: still conditional.** The coordinator must finish the exact-SHA clean SDK adoption, adopted-site typecheck/full suites and all twelve Gallery runtime cases, then inspect/capture Chromium desktop and phone in both appearances. The original review's SDK warning, shared-helper typing, readability and physical-backend limitations remain accurately triaged. Final PLAN/REPORT must distinguish the original failed full run, the resolved failures and successful post-fix coverage, and identify the actual final commit/archive/adoption results. This correction approval does not substitute for those remaining gates.

## Coordinator completion of conditional gates

All remaining conditions above are now completed. The approved integration fix committed as `baacfd0` with four immutable packed gates. Subsequent real development-browser findings were fixed in the owning plugin through `a4a929f`, `4be4c68` and final implementation `5286513`. Root reviewed their scoped source/frozen hashes; final exact-host installed Chromium/HMR1/1, packed3/3, focused75, both typechecks and architecture1795files/8169edges pass. No global registry or protected-config workaround was added.

The exact-SHA clean adoption, safe junction deletion/original Vitest preservation, adopted-site typecheck/full suites and Chromium four-view acceptance are complete. Final site is `c74d8c2`;413 Vitest tests/62files (35.95s) and24 Node tests pass. The one-attribute Gallery scroll marker fixes the demonstrated phone bottom-bar occlusion using existing NSE behaviour. `final-acceptance-summary.json`, `gallery-browser-acceptance.json` and REPORT.md pin final counts, sources, archives and ten screenshots. This is the coordinator's verification and acceptance, not a claim that the earlier reviewer reran these suites.

No Critical/Important finding remains open within the approved scope. The historical full framework run remains failed as recorded, with every affected check subsequently passing; it is not relabelled a green complete run. Known build warnings, shared-helper typing/readability debt and physical-backend limitations remain disclosed.
