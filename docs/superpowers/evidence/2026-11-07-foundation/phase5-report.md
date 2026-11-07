# PWA phase 5: six FX families

Status at 22:14 UTC: all six families and integration corrections are committed. Source tests, recorded framework/authoring typechecks, SDK builds and independent package checks pass. The full framework run was incomplete because the disk filled. A final committed site adoption remains blocked by concurrent ownership: other jobs continue replacing the dirty package/vendor files, including during the final site check. Phase 5 has requested their commit or explicit handoff and has not overwritten or staged them. This task is not being declared fully complete while that requirement remains open.

## Public API

All entries are below `@syndromatic/syncloudos/fx/`. Hooks come from `@syndromatic/syncloudos/sdk`; each client is also projected through `useSCOS()`. Device construction and capability inspection are passive. Active device operations check captured bundle entitlements and current lifecycle access; browser permission remains independently enforced. The authorization job owns the privacy-store migration and its concurrent changes are preserved.

| Entry | Prefix and principal public API | Hook / SCOS client | Info.ts entitlement |
| --- | --- | --- | --- |
| `bluetooth` | `BTFXCentralManager`, `BTFXPeripheral`, `BTFXService`, `BTFXCharacteristic` | `useBluetooth()` / `bluetooth` | `bluetooth.access` |
| `nfc` | `NFXNDEFReaderSession`, `NFXNDEFMessage`, `NFXNDEFPayload` | `useNFC()` / `nfc` | `nfc.read`, `nfc.write` |
| `speech` | `SPFXSpeechRecognizer`, recognition request/result/task, `SPFXTranscription` | `useSpeech()` / `speech` | `speech.recognize` |
| `contacts` | `CNFXContactStore`, `CNFXContact`, `CNFXContactPickerViewController` | `useContacts()` / `contacts` | `contacts.select` |
| `pass` | `PKFXPaymentRequest`, `PKFXPaymentAuthorizationController`, summary items, payment response | `usePayment()` / `payment` | `payment.request` |
| `xr` | `XRFXSession`, `XRFXConfiguration`, `XRFXFrame`, `XRFXAnchor` | `useXR()` / `xr` | `xr.session` |

Every family exposes a passive `getCapabilities()` query, a scoped `getAuthorizationStatus()` and explicit request operations. NFC's hook permits explicitly owned reader sessions; Payment's hook creates controllers that capture a payment request. Public device bytes use immutable Foundation `NSEData`; payment method BufferSources are copied back into native browser buffers only at the transport boundary. Native-only facilities are omitted and documented in each framework guide.

Package roots, exact TypeScript and architecture aliases, counterpart lookup, framework guides and independent packed-consumer coverage were added. No Foundation upward imports were introduced.

## Live Chromium evidence

`phase5-browser.mjs` imports the actual framework browser adapters from this worktree through Vite. It uses an isolated Chromium profile and an allocated non-preview port. It does not replace browser device APIs. Native capabilities that support emulation use CDP; mounted entitlement/profile enforcement is verified separately with the real runtime in `phase5-real-authority.test.ts`.

Chromium `149.0.7827.55`; checked 2026-11-07 20:30:54 UTC against source commit `bfcfb32`. Full headless Chromium uses SwiftShader WebGL for this test. Machine-readable result: `phase5-browser-results.json`; no page errors were recorded.

| Family | Verified live | Verified only in tests / remaining acceptance |
| --- | --- | --- |
| BluetoothFX | Native Chromium chooser grant, connection, service/characteristic discovery, read `[42]`, write `[17]`, notification start/stop and owner disconnect through the real adapter; CDP peripheral emulation | Physical peripherals, radio/device interoperability and actual notification value delivery |
| NFCFX | Desktop Chromium correctly reports unsupported; status is unavailable and scan rejects `NotSupportedError` | Real/native-shaped NDEF payloads, ordinary/nested record conversion, write/read-only operations, permission checks, aborts and hook lifetime; physical NFC requires a supported mobile host |
| SpeechFX | Browser recognition API is present and its failure reaches the recognizer as `OperationError` / `audio-capture` | Successful transcription, recognition results, authorization, stopping after policy revocation, cancellation and StrictMode lifetime; microphone/service acceptance remains open |
| ContactsFX | Desktop Chromium correctly reports unsupported; status is unavailable and selection rejects `NotSupportedError` | Immutable contacts, picker presentation/cancellation, late-result suppression, per-request access, real runtime entitlement/profile checks and StrictMode lifetime; native mobile picker remains unverified |
| PassFX | A real SPC credential was enrolled with a virtual WebAuthn authenticator. PassFX constructed the native Payment Request, presented with SPC auto-accept, returned immutable credential/assertion bytes and completed successfully; 32-byte credential ID and 72-byte signature | Merchant/provider verification and settlement, real payment instruments and ordinary merchant payment handlers. No money moved in emulation |
| XRFX | Real inline WebXR session, owned detached WebGL layer, 31 actual frames, copied viewer matrix, no fabricated anchors, orderly pause/end | Immersive AR/VR devices, physical tracking and real tracked anchors; unsupported native ARKit facilities remain omitted |

The Bluetooth and SPC research scripts document the installed Chromium's actual emulation surfaces: BluetoothEmulation belongs to the browser CDP session; SPC automation belongs to a page CDP session in full Chromium, not the default headless shell. These research probes verify the native browser; `phase5-browser.mjs` verifies the framework adapters.

No product UI or controls were added. The contact/payment chooser remains browser-owned; XR's canvas is detached and has no presented UI. There are no custom buttons, copied artwork, typed arrow glyphs or invented controls to screenshot.

## Owner question

Should `PKPaymentButton` receive a separately approved NSE counterpart? Options: keep payment initiation as an action on the existing `NSEButton`, or approve a dedicated Atmo-rendered counterpart as separate control work. No payment button was invented or implemented in phase 5.

## Verification

| Check | Result |
| --- | --- |
| Initial framework and site `tsc -b` | Passed before concurrent migrations |
| Initial architecture check | Exactly the known WindowManagementFixture leftover |
| Latest phase-5 focused tests | Passed: 59 tests in 13 files, including real mounted authority and StrictMode hooks; `phase5-resume-final-focused.log` |
| Real-runtime entitlement/profile regression | Passed: entitled picker request succeeds, later profile restriction blocks a retained store, missing entitlement never reaches the picker |
| Framework and authoring typechecks | Passed at the recorded checkpoints: `npx tsc -b --pretty false` and `npm run typecheck:authoring`; the final clean `43237d3` checkpoint also typechecks. Later concurrent commits are not a sealed phase-5 checkpoint. An initial mistaken invocation named a nonexistent root tsconfig; the TS5083 log is retained separately from the corrected passing command |
| Architecture check | Only the owner's known `WindowManagementFixture.tsx:29 -> NSEPopover.tsx` edge remains; no new phase-5 edge. Exit 1 is expected while that leftover remains |
| SDK build | Passed on isolated clean checkpoints `585c4f3`, `dd1a6dd`, `41a47de`, `d79d0d1` and `43237d3`; final build log is `phase5-final-adoption-build.log` |
| Independent installed package checks | Passed all 21 FX runtime import gates and strict NodeNext/Bundler declarations with `skipLibCheck:false`, 1230 declaration modules each, on clean `dd1a6dd`. Receipt: `phase5-final-strict-package-receipt.json` |
| Six-family packed consumer | Passed in the serial suite after allowing ten minutes for a cold independent npm install (130 seconds on the passing run). Runtime and strict type assertions remain intact |
| Required `synapp-sdk-package.test.ts` | 8 passed, 1 failed: the concurrent browser export list omits the new `SCAuthorization` and `SCAuthorizationRights` exports. Reported to its owner; that file was left unchanged |
| Framework docs / browser boundary recheck | Passed: 12 tests across the two files after the authorization owner fixed the three documentation links and registered the explicit passkey browser boundary. Earlier 2/4 docs failures remain in historical logs |
| Full framework suite, `--maxWorkers=1 --no-file-parallelism` | Attempted on clean `dd1a6dd`; incomplete due ENOSPC. Later failed imports and package-fixture git errors occurred after the disk filled. No completed JSON result exists; the stale shell exit 0 is invalid and must not be interpreted as a pass |
| Site typecheck | Passed against the current installed SDK |
| Full site suite, initial serial check | 398 passed, 3 failed (61 files): two Publisher anchor replacement tests and one Gallery window-state test. See `phase5-site-tests.log`; phase 5 did not edit those site sources |
| Full site suite, final serial check | 395 passed, 6 failed (61 files): the same three failures plus three Gallery preview-policy entitlement expectations. The package changed from `43237d3` to `44826f7` during the run (`archiveStable:false`), so this is not stable adoption acceptance. See `phase5-final-site-results.json`, `phase5-final-site-tests.json` and the log. Typecheck exited 0 |

The evidence logs keep these failures separate from the passing phase-5 source checks. Initial checks also captured temporary concurrent migration/type failures and an active-worktree SDK build race; clean isolated builds avoid the shared artifact directory. No failed or incomplete check is presented as passing. Rollup reports existing circular chunk warnings; type-only Bluetooth, Speech and Network entries intentionally have empty runtime chunks.

## Commits and adoption

Family commits: `47a0b2d`, `1b821d8`, `716759a`, `7dcbec0`, `f72c1af`, `5225188`.

Corrections and shared integration: `c1cca47`, `86aeed6`, `feeacb5`, `f0787e8`, `074b4b4`, `1f6ea20`, `30ad047`, `df11e1e`, `089f37a`, `4d20b9f`, `b4617dd`, `76fe376`, `98279d5`, `89f4b74`, `585c4f3`, `0b7c8fd`, `dd1a6dd`, `c2ad83a`. The shared phase-4 package contract correction `7ad7786` is also relevant to the final SDK inventory.

Verification evidence: `dd36f41` records the native browser harness/results, strict package receipts, source checks, cleanup receipts and historical failures.

`074b4b4` encountered a shared-index race and included the authorization job's already-staged files. That commit is preserved without history rewriting. Subsequent phase-5 commits use `git commit --only` with explicit paths. The phase-4 job explicitly handed over the mixed runtime/environment integration before `089f37a`; its additions were preserved.

Phase-5 site commit: none. The six roots are installed in the site, but the package/vendor adoption is another job's uncommitted work. Related concurrent site commits include `32169a5` and `88e94e0` (phase-4 gallery integration), and `f3a49f6` (authorization visibility). These are not presented as phase-5 commits.

At 22:10 UTC the site's concurrent `43237d3` archive was independently reproduced exactly by phase 5: SHA-256 `b2f03824f8a8fd67d97c03682f0f8992f8d4baadd16aa62977c16e302ec00ef5`. All 2336 installed resource hashes matched, with no errors (`phase5-site-installed-integrity.json`). Phase 5 used the required detached checkout and node_modules junction solely for this adoption verification. It did not rerun the site mutation helper over someone else's dirty paths.

During the final site check another job replaced the receipt with `44826f7`, archive SHA-256 `ca2550127922532f65a1d6e4e30e457812146284ea90a80fc7a068f8b91aab92`. Framework HEAD then advanced to `9364eec`, another host title-bar appearance change. These changes need a coordinated final HEAD adoption and stable site checks after the current owner commits or explicitly releases package.json, package-lock.json and vendor. Elapsed time is not being treated as permission to take those files.

All phase-5 temporary checkouts have been removed with junction-first cleanup and original framework vitest verification. No development branch/worktree, push, merge, history rewrite or deployment was performed. The 5199 preview responded HTTP 200; phase 5 did not restart any listener. No Fusion worktree was inspected or touched.
