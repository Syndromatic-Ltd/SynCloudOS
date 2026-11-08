# Aggregate FX hooks evidence — 8 November 2026

Base: accepted XR commit `4d354379c4f865e7e3d013f585d88e7efb7e8c09`, framework `fix/blind-rewrite-friction`. Scope is the seven reviewed families' hook integration. The sibling site retains its previously installed SDK. No family implementation or public class member changed.

## Correction and audit

`SynWareRuntimeMount` adds host branding by spreading its registered context. `useNetwork` previously searched for exact context object identity with `.find`, so the actual mounted hook threw `notRunning`; the direct-context unit fixture missed that production path. It also failed to reject duplicate exact registrations.

The correction follows the already accepted Speech, Contacts, Pass, NFC, Bluetooth and XR hooks: filter the selected app's registrations for exact context identity or matching mount signal plus configured runtime identity; require exactly one match; pin that registration for the object's lifetime. Signal identity distinguishes simultaneous runtimes even when their configured IDs collide. More than one exact match returns `NWFXError.posix(22)` and no match returns `NWFXError.posix(6)`. Existing terminal binding and insertion-effect cleanup remain intact.

All seven conveniences create actual subclasses of the same cached per-app class used by compiled imports. No new helper, facade, public factory, capability object, alias or dispose method was introduced. Insertion lifetime avoids terminal cancellation during StrictMode layout/effect replay. Bluetooth and XR defer lifecycle activation until insertion commit; the other constructors remain passive. Existing family generations, selected-session end observation, privacy refusal handling and resource-release logic were inspected and retained.

| Hook | Actual Apple-shaped result | Lifecycle evidence retained |
|---|---|---|
| `useNetwork()` | `NWPathMonitor` → `NWFXPathMonitor` | Passive construction; one start across replay; queued path suppression, access restoration cannot revive cancelled monitors, native release on actual unmount/session removal. |
| `useSpeech()` | `SFSpeechRecognizer` → `SPFXSpeechRecognizer` | Existing task/delegate generation checks, replay, final-result suppression on cleanup, passive suspended render. |
| `useContacts()` | `CNContactStore` → `CNFXContactStore` | Existing queued access-completion suppression, terminal store, privacy generation and picker tests. |
| `usePayment(request)` | `PKPaymentAuthorizationController` → `PKFXPaymentAuthorizationController` | Existing pending presentation cleanup, stale authorization finalization and terminal controller. The real hook name is `usePayment`; `usePass` is not added. |
| `useNFC(delegate, queue, invalidateAfterFirstRead)` | `NFCNDEFReaderSession` → `NFXNDEFReaderSession`, also `NFXReaderSession` | Existing pending scan release, delegate generation checks, invalidation and terminal session. |
| `useBluetooth(delegate, queue, options)` | `CBCentralManager` → `BTFXCentralManager`, also `BTFXManager` | Deferred activation, existing stale discovery/connection tests, exact owner cleanup, no discarded-render subscription. |
| `useXR()` | `ARSession` → `XRFXSession` | Deferred activation, existing late-session release/natural-end/privacy tests, exact owner cleanup, no discarded-render subscription. |

The new real-runtime test mounts two fully branded `SynWareRuntimeMount` trees with the same app ID and the same configured runtime ID. Both hooks start their own native Network observations, survive two StrictMode setup passes, and return instances of both their compiled-app-equivalent bound classes and public bases. Unmounting one tree releases only its observation and suppresses its queued update; the other continues receiving its own path. All seven old objects remain terminal after unmount. A suspended-render case proves all seven constructors install no component-owned abort subscriptions and perform no native operation. Dispatch's independently owned per-session main queue is initialized before measuring constructor subscriptions.

The real-runtime fixture uses ordinary identity refresh and the accepted optional-authentication public-app test configuration, matching the Bluetooth host-boundary fixture. No production authorization check or entitlement was weakened. The compiled fixture uses the existing `createSynWare` definition helper from `sdk/testing`, not the application SDK entry, and the existing test host; no testing API was added.

## Files and removals

Owned paths, exhaustive:

- M `src/SynCloudOS/AppSDK/hooks/useNetwork.ts` — unique clone-safe exact-mount selection; unchanged public signature.
- M `tests/runtime/fx/network-hook.test.tsx` — reject duplicate exact mounted registrations.
- A `tests/runtime/fx/hooks-runtime-mount.test.tsx` — two real branded runtimes, all seven class identities, StrictMode, owner-specific actual unmount, passive discarded renders.
- M `tests/runtime/fx/phase5-bluetooth-hook.test.tsx` — remove unused obsolete `SCOS.bluetooth.createCentralManager` mock.
- M `tests/runtime/fx/phase5-xr-hook.test.tsx` — remove unused obsolete `SCOS.xr.createSession` mock.
- M `tests/fixtures/network-attribution/src/SynWare/First.app/Contents/index.tsx` — compiled `NetworkHookProbe` with the actual `useNetwork` import.
- M `tests/fixtures/network-attribution/consumer.test.tsx` — real compiled hook returns the imported bound class and base class, survives replay, and drops queued delivery on true unmount.
- M `tests/runtime/fx/network-packed.test.ts` — existing consumer scenario count changes from two to three; no assertion removed.
- A `tests/runtime/fx/hooks-packed.test.ts` — independently installed immutable compiled fixture, production bundle/import/shared-runtime identity, all seven hook signatures and eleven public declaration graphs.
- A `docs/superpowers/evidence/2026-11-08-fx-fidelity/hooks-evidence.md` — this evidence.

No Apple class or protocol was added, removed, renamed or altered. No counterpart or developer lookup mapping changes are needed. Public SCOS/context factories for all seven families were already removed by the accepted family commits. The two dead test mocks above were the remaining obsolete hook setup. Active source/framework-guide/tooling searches find no old positive consumer; the remaining installed-consumer occurrence explicitly rejects removed XR exports. Negative type/export assertions and historical evidence retain removal names intentionally. `speechSynthesis` belongs to the separate AudioFX family and is unchanged.

## Test-first and source gates

- `npx vitest run tests/runtime/fx/hooks-runtime-mount.test.tsx tests/runtime/fx/network-hook.test.tsx` → `hooks-selection-red.log`: **3 failing / 1 passing** before the correction: two real-mount `notRunning` failures and the missing ambiguity rejection.
- Same targeted runtime files → `hooks-runtime-green.log`: **4/4 tests, 2 files, exit 0** after the correction and normal fixture identity bootstrap.
- Focused seven-family flow/lifecycle/host/public-declaration integration command is recorded verbatim on line 1 of `hooks-focused.log`: **276/276 tests, 41 files, exit 0**. This includes all seven focused hook files, existing privacy/revocation and stale-work tests, public type boundaries, mounted SDK integration and the new real-mount regressions. No full framework suite was run.
- `npx vitest run --config tests/fixtures/network-attribution/vitest.config.mjs` → `hooks-plugin-green.log`: **3/3 compiled application scenarios, exit 0**, covering after-await, timer and callback construction, denial, and hook identity/replay/unmount.
- Framework `npx tsc -b --pretty false` → `hooks-framework-typecheck.log`: **exit 0**.
- Old-SDK sibling site `npx tsc -b --pretty false` → `hooks-site-typecheck.log`: **exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` → `hooks-architecture.log`: **1,795 files / 8,169 edges validated, exit 0**.

An extra direct TypeScript check of the new test/fixture files also exposed pre-existing diagnostics in the shared, normally uncompiled `tests/runtime/helpers.ts` plus an inferred recursive fixture type in the new test. The new fixture now has an explicit return type. `hooks-test-types-final.log` records **20 baseline helper diagnostics / 20 current diagnostics / zero new diagnostic code-locations / zero owned-file diagnostics**, comparing diagnostic file, location, length and code (TypeScript displays two union-property orders differently between entrypoints). `hooks-final-runtime.log` confirms the final typed test bytes still pass **4/4 tests**. This extra check does not replace either passing repository typecheck or the strict installed consumer check.

## Frozen proof and commit

All implementation and test paths are staged explicitly after the source gates. `hooks-format-audit.json`, `hooks-staged-checks.json` and `hooks-frozen-inputs.json` record strict UTF-8, original line-ending preservation, scoped whitespace checks, source/index equality and immutable hashes. Root PLAN/REPORT and all unrelated paths remain unstaged. No implementation/test/shipped-document byte may change during review or the SDK build/proof.

The final immutable proof uses `npm run sdk:build`, then `npx vitest run tests/runtime/fx/hooks-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts`. Results and archive/source/resource hashes are appended after proof. The final `FX:` commit SHA is recorded in `hooks-commit.txt` and the parent report rather than embedded self-referentially in this committed evidence. Final full-suite acceptance and Gallery/SDK adoption remain with the parent task. No server, branch, push, stash, worktree, Fusion, protected port or site configuration operation occurred. C: remains over 250 GB free.

### Final immutable proof

- `npm run sdk:build` → `hooks-sdk-build.log`: **exit 0**, one build after freeze. Existing SDK circular-chunk/execution-order warnings were not changed by this hook correction.
- `npx vitest run tests/runtime/fx/hooks-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → `hooks-packed.log`: **3/3 packed gates, 3 files, exit 0**, including **3/3 nested actual compiled installed application scenarios**.
- `hooks-installed.json`: independent installation outside the repository, no links, actual plugin transformation and production bundling/import, one shared attribution runtime, all seven hook return signatures under strict installed TypeScript, and unchanged installed resource integrity. All **eleven** declaration roots (`index`, `sdk`, `sdk/testing`, `browser` and the seven family entries) reach **zero** private family, mounted-port/client or browser-adapter modules.
- `hooks-frozen-verification.json`: **currentSourceMatches true**. No implementation/test/shipped-document bytes changed after the freeze.
- Archive SHA-256: `c3b2fa369b26da1cf0cf533a40284a2e8671977c79828a59767ab0d986e20306`.
- SDK source SHA-256: `26cc6f90c8eb3cc663668253651e8da8f8bc01fd887b33785b43e061644ecf5e`.
- SDK resources SHA-256: `fb5ab5b91fe9a090083228545e5cec319b44ad1d6f68af3328ac7a667b6df73f`.
- Nine-path implementation/test freeze SHA-256: `beefedbaa76804e65132b98951ef715942bf4739870eadcb9be55622d6236ce9`.

Only this unshipped evidence document is updated after proof to record its outcome. Final review disposition, explicit-path commit receipt and committed-byte/source verification are recorded with the aggregate handoff.

### Independent review and explicit-path commit

Independent review: **PASS / Approved**, no Critical or Important finding. One minor evidence qualification is retained: the aggregate real-mount test establishes a working Network observation before cleanup, while its other six cleanup assertions use broad throws or `isAvailable === false` without establishing an operational native prestate. Those assertions alone do not prove live-resource cleanup for the other families; their existing focused hook/flow/privacy tests in the passing 276-test run supply that evidence. The aggregate adds real branding, duplicate-runtime selection, class identity, replay and discarded-render coverage rather than replacing those family tests.

The supplemental TypeScript experiment's 20 helper diagnostics are unchanged from the hook base; the shared helper bytes also match `c500`. They are outside the required repository `tsc -b` scope, and there are zero diagnostics in the owned files. Both required repository typechecks passed; no shared helper refactor was made.

The explicit ten-path commit is **FX: verify hook ownership across branded runtime mounts**. `hooks-commit.txt` records the actual SHA; `hooks-postcommit-verification.json` records the committed owned-path hashes and final SDK/source identity checks. `hooks-final-format-audit.json` records the final evidence and source/test bytes. Only the unshipped evidence gained these final review/receipt paragraphs after proof; all nine frozen implementation/test paths remain byte-identical. Root PLAN/REPORT and unrelated files remain outside the commit.
