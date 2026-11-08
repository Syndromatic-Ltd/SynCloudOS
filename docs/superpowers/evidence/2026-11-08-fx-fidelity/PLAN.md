# FX fidelity execution plan

The owner-approved specification is `docs/superpowers/reviews/2026-11-08-fx-device-families.md`, supplemented by the owner's instructions in this chat. Work stays on `fix/blind-rewrite-friction` and `prerelease`; no branches, pushes or extra worktrees.

The owner's revised decision is **option A: per-app FX entry modules bound at load time**. Attributed constructors read their own per-app binding and resolve that app's live session when needed, including after native await, in timers and in third-party callbacks. This is cooperative attribution in the shared JavaScript realm. There is no ambient execution context, public client factory, or fallback app selection. Base entries outside application bundles reject construction of attributed classes clearly. Pure classes may be re-exported unchanged. Per-app bindings remain instances of the base class, with one stable binding per app/type.

The ambient contexts, branded records, process authority and NSE bridge from `79fa0ab`, `1e4f90a`, `4722c02`, `5cedae2`, `e94cea2` and `d3255ce` were reverted with Git. None of that infrastructure is retained. Callback-wrapping tasks and DispatchFX are cancelled. Zlib, CompressionFX, CryptoFX and the documentation/scaffold guard corrections are preserved.

## Sequence and gates

- [x] Inspect both repository logs/status; preserve pre-existing untracked files. Framework starts at `c50049b`. C: initially has 235,064,766,464 bytes free.
- [x] Study AnimationFX's per-class files, re-export entry and host adoption, plus `fxRuntimeContracts.ts`.
- [x] Reproduce the zlib wrapper bug with header/independent decoder and fixed raw-vector regressions, change only the format mapping, run focused tests and both typechecks, commit independently (`de51ac9`).
- [x] CompressionFX complete in `d0a16e9`: closure filters, Apple algorithms/errors, Foundation correction, migrated consumers/docs/metadata, focused and packed/browser checks.
- [x] CryptoFX complete through `dd86dbc`, singleton coverage `cf97e85`; HMAC/HKDF specialisation identity corrected in `a99ba91`. Nine identity/error regressions, 113 Crypto tests, both typechecks and independent review pass.
- [x] Documentation/scaffold guards corrected in `982ab04` / `82a9357`; 10 focused tests and both typechecks pass.
- [x] Revert the six rejected infrastructure commits; discard only audited owned WIP. Both typechecks, 31 focused ownership/application/singleton tests and architecture (1,615 files / 7,330 edges) pass. The source comparison with `82a9357` contains only the Crypto identity correction and this revised plan; no ambient infrastructure is retained.
- [x] **Feasibility first — STOP:** routes 1 (first-party) and 3 (packed plugin consumers) support the extension; route 2 needs the requested compiled fixture/test-host wiring. Route 4's arbitrary precompiled/no-plugin loader contract cannot guarantee per-app imports or a shared session-registry graph. [Source-backed audit](option-a-feasibility.md). No option A source or later family was implemented; stop under the owner's explicit gate.
- [ ] Implement option A by extending the existing Vite per-app virtual module resolution for `@syndromatic/syncloudos/fx/<family>`, using internal stable binders and existing live app-session mechanisms. Preserve consent, entitlements, terminal instance lifetimes, revocation and browser denial. Test first-party and packed third-party compilation, construction after await/in timers/callbacks, base-import rejection, test-host per-app entries and HMR. Both typechecks, architecture and explicit-path commit before families.
- [ ] NetworkFX: mirror PathMonitor/Path/Interface and Apple's enums; remove authorisation/browser facts. Preserve entitlement/lifetime guarantees. Source any required Apple dependencies without adding the cancelled DispatchFX; report a genuine unresolved design conflict. Migrate consumers, test the Apple flow/filtering/cancellation and packed entry, both typechecks; commit.
- [ ] SpeechFX: use its per-app entry without weakening consent. Mirror recogniser/request/task/result/transcription/delegates. Migrate consumers, test the Apple flow, revocation/stale results/denial and packed entry, both typechecks; commit.
- [ ] ContactsFX: mirror Contacts/ContactsUI classes, labelled values and picker presentation/delegates. Keep documented errors for unavailable database methods. Migrate consumers, test picker/consent and packed entries, both typechecks; commit.
- [ ] PassFX: mirror PassKit controller/request/payment/value classes with NSEDecimalNumber and delegate handlers. Leave payment-button artwork pending. Migrate consumers, test denial/completion and packed entries, both typechecks; commit.
- [ ] NFCFX: mirror reader sessions, delegate, tag protocol, messages/payloads/formats/errors. Migrate consumers, test detect/connect/read/write/invalidate, revocation/stale results and packed entries, both typechecks; commit.
- [ ] BluetoothFX: mirror central/peripheral/attribute classes, enums and delegates. Migrate consumers, test complete discovery/connect/GATT/read/write/notify/disconnect, revocation/denial/stale results and packed entries, both typechecks; commit.
- [ ] XRFX: mirror ARKit configurations/session/frame/camera/anchors/raycast; use AFXTransform3D, keep VR out. Migrate consumers, test delegates/revocation/denial/stale frames and packed entries, both typechecks; commit.
- [ ] Hooks create/dispose per-app Apple-shaped objects and return those objects. Update Gallery using existing NSE controls and retain its raw video unchanged.
- [ ] Run architecture boundaries, both typechecks, framework full suite once serially, full site suite. Monitor free space; stop below 20 GB.
- [ ] Adopt final framework SHA using the exact temporary detached checkout/junction workflow; verify original vitest survives junction deletion before removing checkout.
- [ ] Inspect Chromium Gallery at desktop 1440×900 and phone 390×844 in light/dark; capture four screenshots and audit controls. Commit REPORT.md with mappings, removed names, deviations, commits, counts and owner questions.

Stop and report any unresolvable mounted-session requirement, weakened privacy/entitlements or design-changing conflict with Apple. No invented factories, VR configurations or artwork. Historical evidence stays historical; active consumers and documentation are migrated.
