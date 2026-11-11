# Final combined FX correctness fixes

Base: `f2cd9dfc268fd700f3ee3b9d375c5f5f09a3689a` on `fix/blind-rewrite-friction`. This packet addresses I1/I2 and M1/M2 from `final-review-findings.md`, plus the seven stale Dispatch fixture failures from the coordinator's completed serial suite. It does not change any accepted family implementation or public API.

## Corrections

- **I1 - session removal:** the registry removes the exact session and detaches its observer set before notification, snapshots the callbacks, attempts every callback independently, then rethrows the original single failure or an `AggregateError` containing every failure. Reentrant and repeated unregister calls remain harmless. A real bound `DFXQueue.main` regression queues stale work after an earlier throwing/reentrant observer and before a later observer; only the other exact session's queued work survives. A second regression checks multiple failures, including a non-Error throw, and exactly-once notification.
- **I2 - capability rows:** XR/Bluetooth/NFC/Pass passive queries now run inside the existing row exception boundary. The error row retains the Apple query label and native message while the other rows survive. The regression uses the actual `BrowserXRAdapter` and a native `isSessionSupported` SecurityError; a direct adapter call still rejects with that exact native refusal. Three synchronous-query cases cover the other migrated branches. No adapter or attributed family operation changed.
- **M1 - architecture classification:** the two stale Bluetooth/NFC client paths now name their mounted ports. No allowlist, layer rule or exception widened.
- **M2 - guide:** `useNFC` returns a real component-owned `NFXNDEFReaderSession`; `useNetwork` returns `NWFXPathMonitor` with `network.read`; manifest guidance names `entitlements`. `usePayment` remains unchanged, with no `usePass` alias and no invented closed entitlement registry. The hook signatures, mounted Network entitlement check and manifest type were inspected directly.
- **Seven fixture failures:** both independent family literals include Dispatch. The package-entry test retains exact equality, independent enumeration, aliases and rejection cases and now says twenty-two roots. The resource fixture generator consequently includes Dispatch JavaScript, maps, declarations, exports, resources and manifest entries. Corruption, traversal, old-manifest, source-mutation and closed-export guards remain intact. The installed-consumer diagnostic is count-free; its enforcement is byte-for-byte unchanged apart from the message.

## Test-first evidence

1. `npx vitest run tests/runtime/fx/dispatch-app-binding.test.tsx tests/runtime/system-capability-report.test.ts --maxWorkers=1` -> `final-fix-red.log`: **6 failed / 30 passed**, two files, 14.34 s. The two lifetime cases failed because stale work executed/later cleanup never ran; native XR and all three synchronous passive queries rejected the report. Existing production source was unchanged for this RED run.
2. `npx vitest run tests/runtime/fx/dispatch-app-binding.test.tsx tests/runtime/system-capability-report.test.ts tests/runtime/fx/fx-entry-contract.test.ts tests/runtime/fx/package-resources.test.ts --maxWorkers=1` -> `final-fix-green.log`: **50 passed / 4 files**, 17.38 s, exit 0. Both source fixes and every fixture rejection test passed. A test-only NFC fixture member was corrected from `scan` to its actual internal adapter member `open`; it did not affect the RED failure mechanism.
3. `node node_modules/vitest/vitest.mjs run <the 86 exact paths in final-fix-covering-files.json> --maxWorkers=1` -> `final-fix-covering.log`: **766 passed / 86 files**, 183.92 s, exit 0. This includes all Dispatch unit/app binding, attribution, seven affected device families/hooks, privacy suites, SCOS/session lifetime and selected host/boundary regressions. Immutable packed tests are deliberately deferred until the source freeze.
4. `npx tsc -b --pretty false` -> `final-fix-framework-typecheck.log`: **exit 0**.
5. `npm run boundaries:architecture` -> `final-fix-architecture.log`: **1,795 files / 8,169 edges validated**, exit 0.

## Owned paths and exact bytes

`final-fix-format-audit.json` records before/after byte counts and SHA-256, strict UTF-8, no BOM or detected mojibake, and preserved LF for all nine source/config/guide/test paths. No whole-file newline conversion occurred. All owned edits are staged by explicit path; root PLAN/REPORT, older receipts and unrelated files stay outside this commit. Working/index and whitespace checks are recorded at freeze below.

| Path | SHA-256 |
| --- | --- |
| `src/SynCloudOS/AppSDK/scos/scosSessionRegistry.ts` | `f6d1f22083ae08ec121fc7679d1057ec090bb4c3c19f379ee720d3fe18c941f1` |
| `src/SynCloudOS/InstalledApplications/capabilityReport.ts` | `eb86d5317fc8c661c4b15c8018e7b8cab178cc8769d4cf0cfeb08c4856bc1744` |
| `scripts/quality/architecture-boundaries.json` | `b874e0eb075f578c0dea18af0849f666352aff4a2d35af99c597338029ea21df` |
| `docs/framework/fx/README.md` | `4ac5b2932d43987f4c89d4052ff333c56a0ed1dbf8652c25adfa985763f3bb2f` |
| `tests/runtime/fx/fx-entry-contract.test.ts` | `3ffa85298a462591e438f73e75d78695691d305ce351487ce7c58d8953872747` |
| `tests/runtime/fx/package-resources.test.ts` | `a51c6ee5ce723e0b0174e0699f597081b2f7bff1ce6e9e014f06d11b1c473433` |
| `scripts/synware/installed-consumer.mjs` | `1dbce4325f1f664f421c16b1f8e8ef41d31428f9958a0259b5a36bd56c2fae6a` |
| `tests/runtime/fx/dispatch-app-binding.test.tsx` | `44188135391a902ebbd846c05ef362e0df83dc2e8352bd1cd9ec1a5435f978b4` |
| `tests/runtime/system-capability-report.test.ts` | `ea4b338a6aab14694aee96d1acb12375186ff47b4742fb6fc8431921a81785cb` |

## Full-suite disposition and limits

The coordinator's original once-only serial framework run is preserved: **991 files, 988 passing / 3 failing; 8,205 passing / 8 failing tests**. Seven failures were the stale independent Dispatch fixture literals corrected here. The remaining Chromium initial page navigation reached its default 30 s timeout. Before authorising this packet's source edits, the coordinator confirmed unchanged-source warm and fresh-cache reruns of that case both passed (17.51 s each), then all six cases in the browser file passed (31.01 s). No browser timeout, assertion or source changed. This packet does not mislabel the original full run as passing or automatically rerun the complete suite.

Site typechecking and full site/runtime/Chromium acceptance belong to the coordinator after clean adoption of the final SDK. The frozen Gallery still uses an old installed SDK during this correction, so no alias or shim was added. Physical hardware/backend limitations, known SDK circular-chunk/execution-order warnings, supplemental shared-helper TypeScript debt and deferred readability findings remain as disclosed in the combined review. No branch, push, stash, worktree, server, protected-port, Fusion or site-configuration operation occurred. C: had over 264 GB free at entry, well above the 20 GB floor.

## Frozen package and review gates

The final source/test/shipped-guide freeze, one SDK build, immutable packed proofs and independent delta review are recorded below as they complete. Only this evidence record may be appended after the freeze. The final commit identifier is recorded in `final-fix-commit.txt` and the coordinator's report, avoiding a self-referential commit hash in this committed evidence.

### Source freeze

- Comprehensive covering result: **766/766 tests, 86/86 files, exit 0**; all required pre-package gates passed.
- Source fingerprint: `00451c7747dddc2a6bb477801c03a2d2146f4065e5acb9ddec9ed4303491f9bb` (2182 SDK source paths).
- Nine-path frozen byte inventory digest: `6c3e6c19a95999e4b14edb3a20bb1dd1ff8e67a3d216110f2b47c11b329521bc`; individual hashes are recorded above and in `final-fix-frozen-inputs.json`.
- `git diff --check -- <owned paths>` and `git diff --cached --check -- <owned paths>` passed. Every explicitly staged file matches its working-tree bytes; all nine implementation/config/guide/test paths retain their audited encoding/line endings.
- Source, tests and shipped documentation are now frozen. One SDK build and four immutable packed gates follow; read-only delta review may run concurrently. The evidence record alone may receive result appendices. Current C: free space exceeds 273 GB.

### Final immutable proof and review

- `npm run sdk:build` -> `final-fix-sdk-build.log`: **exit 0**, exactly one build after freeze. Existing circular-chunk/re-export execution-order warnings remain visible and are not represented as a warning-free build.
- `node node_modules/vitest/vitest.mjs run tests/runtime/fx/dispatch-packed.test.ts tests/runtime/fx/hooks-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts --maxWorkers=1` -> `final-fix-packed.log`: **4/4 gates, 4 files, 89.69 s, exit 0**.
- Dispatch proof includes two real plugin-compiled installed application scenarios, one authoring 6E scenario, production bundle/import execution, one shared SDK graph, separate-copy registry isolation, strict installed types, private-helper exclusion and installed resource integrity.
- Hook proof includes three real compiled installed application scenarios, all seven hook signatures under strict installed TypeScript, production bundle/import execution and eleven declaration roots with no reachable private family/port/adapter declarations. The other packed gates exercise family exports/signatures and substantive installed FX operations.
- Original mutable Dispatch/hook receipts were overwritten by their existing proof tests with the coordinator's authorisation and remain outside this commit. Complete final copies are `final-fix-dispatch-installed.json`, `final-fix-hooks-installed.json` and `final-fix-packed-specimen.json`; `final-fix-build-manifest.json` pins the build manifest. All three receipts match the archive, source, resources and npm integrity below.
- Archive SHA-256: `674d38b85da0346be68b55ea995a330f41cb797f0b610ca8a23b05716b9cb9e8`.
- Source SHA-256: `00451c7747dddc2a6bb477801c03a2d2146f4065e5acb9ddec9ed4303491f9bb`.
- Resources SHA-256: `828f853adf92025a56292f08ea5b6d655e6245dfa9393395ad8a127b13433826`.
- npm integrity: `sha512-RsTLj9ogydie6Wihi8kt3Lnxmtz9bUW5WszQ3FVPrCwqK2/JM1IcCyUe146Xwb4/CG1St2JCSHO4acIZjChs5g==`.
- `final-fix-package-verification.json` records complete receipt byte hashes and the unchanged nine-path working/index verification. The full current SDK source fingerprint still equals the frozen build source.
- The coordinator reported the independent final delta review **approved**: I1/I2/M1/M2 closed, no Critical or Important findings, and all nine source/index hashes independently matched. The evidence-only punctuation mojibake found during review was corrected to ASCII with explicit UTF-8 writes; the complete final evidence record is verified ASCII, UTF-8 without BOM. No source/test/shipped-guide byte changed after freeze.
- The coordinator authorised the explicit ten-path `FX:` commit after these package gates. The commit and post-commit byte verification are recorded in `final-fix-commit.txt` and `final-fix-postcommit-verification.json`. Root PLAN/REPORT and prior mutable receipts remain excluded.
