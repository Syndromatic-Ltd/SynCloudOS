# FX fidelity execution plan

The owner-approved specification is `docs/superpowers/reviews/2026-11-08-fx-device-families.md`, supplemented by the owner's instructions in this chat. Work stays on `fix/blind-rewrite-friction` and `prerelease`; no branches, pushes or extra worktrees.

## Sequence and gates

- [x] Inspect both repository logs/status; preserve pre-existing untracked files. Framework starts at `c50049b`. C: initially has 235,064,766,464 bytes free.
- [x] Study AnimationFX's per-class files, re-export entry and host adoption, plus `fxRuntimeContracts.ts`.
- [x] Reproduce the zlib wrapper bug with header/independent decoder and fixed raw-vector regressions, change only the format mapping, run focused tests and both typechecks, commit independently (`de51ac9`).
- [ ] CompressionFX: verify Apple's five types. Replace public web-stream parameters with read/write closures. Correct Foundation's algorithm enum. Migrate consumers, guides, scaffolder and counterpart registry. Test end of input, buffering, backpressure, failures, unsupported codecs and packed worker declarations. Run both typechecks and commit.
- [ ] CryptoFX: mirror CryptoKit hashes/digests, generic HMAC/HKDF, keys, nonces, boxes and signatures; document asynchronous Web Crypto members. Migrate consumers and registry, test vectors and packed entries, typecheck both repositories and commit.
- [ ] NetworkFX: establish internal mounted-session/lifetime resolution before constructor changes. Mirror PathMonitor/Path/Interface and Apple's enums; remove authorisation/browser facts. Migrate consumers, test updates/filtering/cancellation and packed entries, both typechecks; commit.
- [ ] SpeechFX: privately resolve session without weakening consent. Mirror recogniser/request/task/result/transcription/delegates. Migrate consumers, test revocation/stale results/denial and packed entries, both typechecks; commit.
- [ ] ContactsFX: mirror Contacts/ContactsUI classes, labelled values and picker presentation/delegates. Keep documented errors for unavailable database methods. Migrate consumers, test picker/consent and packed entries, both typechecks; commit.
- [ ] PassFX: mirror PassKit controller/request/payment/value classes with NSEDecimalNumber and delegate handlers. Leave payment-button artwork pending. Migrate consumers, test denial/completion and packed entries, both typechecks; commit.
- [ ] NFCFX: mirror reader sessions, delegate, tag protocol, messages/payloads/formats/errors. Migrate consumers, test detect/connect/read/write/invalidate, revocation/stale results and packed entries, both typechecks; commit.
- [ ] BluetoothFX: mirror central/peripheral/attribute classes, enums and delegates. Migrate consumers, test complete discovery/connect/GATT/read/write/notify/disconnect, revocation/denial/stale results and packed entries, both typechecks; commit.
- [ ] XRFX: mirror ARKit configurations/session/frame/camera/anchors/raycast; use AFXTransform3D, keep VR out. Migrate consumers, test delegates/revocation/denial/stale frames and packed entries, both typechecks; commit.
- [ ] Hooks return/dispose Apple-shaped objects. Update Gallery using existing NSE controls and retain its raw video unchanged.
- [ ] Run architecture boundaries, both typechecks, framework full suite once serially, full site suite. Monitor free space; stop below 20 GB.
- [ ] Adopt final framework SHA using the exact temporary detached checkout/junction workflow; verify original vitest survives junction deletion before removing checkout.
- [ ] Inspect Chromium Gallery at desktop 1440×900 and phone 390×844 in light/dark; capture four screenshots and audit controls. Commit REPORT.md with mappings, removed names, deviations, commits, counts and owner questions.

Stop and report any unresolvable mounted-session requirement, weakened privacy/entitlements or design-changing conflict with Apple. No invented factories, VR configurations or artwork. Historical evidence stays historical; active consumers and documentation are migrated.
