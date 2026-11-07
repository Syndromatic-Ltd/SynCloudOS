# Phase 4: device FX, NetworkFX and CryptoFX

The approved phase-4 API work and its NSE Control Gallery adoption are implemented. This report distinguishes source tests, installed-package checks, browser API acceptance and physical-device acceptance. No owner decision remains open. Nothing was pushed.

## Public API and architecture

| Area | Delivered API |
| --- | --- |
| LocationFX | Verified the existing `LFXLocation.speedMetresPerSecond` delivery for stationary, moving and missing readings. No duplicate speed API was added. |
| AudioFX | `AUFXSpeechSynthesizer`, immutable `AUFXSpeechUtterance`, `AUFXSpeechVoice`, `speechVoices()`, `speak()`, `pauseSpeaking()`, `continueSpeaking()`, `stopSpeaking()`, observation and disposal. `AUFXAudioSessionCategory`, session `category`, `setCategory()` and category authorisation, independently of microphone permission. |
| VideoFX | `VFXPictureInPictureController`, `VFXRouteDetector`, explicit route discovery and native chooser requests; `VFXContentFilter` and display-session `setContentFilter()` for restriction, cropping and clearing. Display tracks remain private to the host. |
| NSE | `NSERoutePickerView`, the AVRoutePickerView counterpart, composed from the real Atmo-drawn `NSEButton`. |
| NetworkFX | `NWFXPathClient`, `NWFXPathMonitor`, `NWFXPath`, path status, interface types and explicit nullable browser hints. Monitoring is passive until `start()` and terminal on cancellation/disposal. |
| CryptoFX | `CRFXCapabilities`, `CRFXSymmetricKey`, `CRFXSHA256/384/512`, `CRFXHMAC`, `CRFXAES.GCM` and sealed boxes, `CRFXP256.Signing`, `CRFXP256.KeyAgreement`, `CRFXSharedSecret` and `CRFXHKDF`. |

Mounted SDK sessions expose `.speechSynthesis`, `.network` and `.videoPresentation`; React consumers use `useSpeechSynthesizer()`, `useNetwork()` and `useVideoPresentation()`. Existing audio/video/location clients retain their session patterns, and `useVideo()` accepts the optional content filter. Device-facing services have capability queries, manifest entitlements, authorisation/request operations and mount/component lifetime ownership. The concurrent authorisation job integrated these gates with its shared privacy and configuration-profile owners.

CryptoFX is a standalone value framework with asynchronous WebCrypto operations and Foundation `NSEData` byte results. It needs no device entitlement, mounted session or React hook. Its worker-safe public entry imports nothing from the runtime or UI. Missing transport, network cost, constrained-path and speed information stays unknown; browser guesses are not promoted to native facts.

Public entries include `@syndromatic/syncloudos/fx/network` and `/fx/crypto`, the existing audio/video/location entries, `/sdk` hooks and `/nse/controls` route picker. Package aliases, declaration roots, FX registrations, Apple counterpart lookup and framework guides are updated:

- [AudioFX](../../../framework/fx/audio.md)
- [VideoFX](../../../framework/fx/video.md)
- [LocationFX](../../../framework/fx/location.md)
- [NetworkFX](../../../framework/fx/network.md)
- [CryptoFX](../../../framework/fx/crypto.md)
- [Route picker](../../../framework/nse/route-picker.md)

## Implementation commits

Framework commits, grouped by area:

| Area | Commits |
| --- | --- |
| Location speed | `66cfc2f` |
| CryptoFX | `db872f3`, `550f491`, `d3b5d91` |
| AudioFX | `0e7b23d`, `feeacb5`, `bc3aa4e` |
| VideoFX | `5f12f4e`, `41b4d80` |
| NSE route picker | `9bc5f83` |
| Public entries and package contracts | `bdbeb98`, `7ad7786` |
| SDK wiring and review corrections | `af4d21a`, `189b35d`, `73eb844`, `d962356` |
| Browser and gallery evidence | `63eb448`, `08122bc` |

The NetworkFX files entered history in `8dcfa3e` through a shared-index race with another job's NSE checkpoint. That commit was preserved. Mixed runtime/browser integration was explicitly handed to the phase-5 owner and committed in `089f37a`; this task did not overwrite that owner's integration. Supporting package checkpoints include `76fe376`, `98279d5`, `89f4b74`, `585c4f3`, `0b7c8fd` and `dd1a6dd`, including concurrent owners' package admission and independent-install fixes. Later concurrent authorisation commits supply the shared privacy migration and unavailable-audio inspection correction.

Site commits:

- `32169a5`: Device & Data Capabilities gallery, manifest declarations and destination registration.
- `88e94e0`: wrap audio/network action rows at phone widths using `NSEStackView`.
- `56171cb`: clean framework `546072ab` archive adoption.
- `2a27f96`: re-adopted framework `bcb82970` after the concurrent SDK consumer correction.
- The final shared site receipt is committed by the concurrent authorisation owner as `3dd6db0`, at framework `b0bfc6a7`. It preserves this task's adoption and the later host-overlay work; this task did not stage that owner's repack.

## Live verification and browser limits

The source-adapter harness used real browser APIs. A headed Chromium run used its native current-tab capture chooser with automatic source selection; it did not substitute a fake display stream. The installed gallery ran from the exact paired site at `http://127.0.0.1:5199/__syncloudos/nse-gallery`.

| Feature | Chromium 149 on Windows | Firefox on Windows | Playwright WebKit on Windows |
| --- | --- | --- | --- |
| Speech synthesis | Native completion, three voices; gallery Speak/Stop and idle pause/continue exercised | Native completion, five voices arriving asynchronously | Unavailable in this build |
| Audio-session categories | Unsupported; explicit `NotSupportedError` | Unsupported | Unsupported |
| PiP API used by VFX | Native entry/exit, also exercised through installed gallery | This API unavailable; this says nothing about Firefox's separate browser-owned PiP UI | Unavailable in this build |
| Remote Playback API | Discovery accepted; native source harness availability unknown, gallery later reported no routes | Unavailable | Unavailable in this build |
| Element capture | Headed current-tab restriction, cropping and clearing accepted | No restriction/cropping APIs; generic display capture advertised but not accepted through a native chooser in this run | Capture APIs unavailable in this build |
| Network paths | Online/offline/online delivered; Network Information supplied effective connection hints | Online/offline delivered; no Network Information | Online/offline delivered; no Network Information |
| CryptoFX worker | Installed worker AES.GCM, P256 signing/agreement and SHA-256 succeeded; no `document` | Same checks succeeded | Same checks succeeded |

No engine exposed authoritative metered cost, OS Low Data Mode or transport identity. Network status is a connectivity hint, not proof of Internet reachability. A CDP geolocation override supplied **12.5 m/s**, displayed as **45.0 km/h** in the gallery; this is explicitly emulated, not a GPS measurement. Browsers do not supply speed accuracy through this geolocation adapter.

Physical receivers, AirPlay, actual GPS hardware, real audio-session mixing and human audio-quality acceptance were not tested. Chromium's Remote Playback support is not an AirPlay claim. Windows Playwright WebKit is not physical Safari acceptance. Crypto HMAC/HKDF/SHA-384/SHA-512 vectors, tampering, key validation, defensive copies and revocation/ownership edge cases are covered by source tests; the browser worker script exercises the operations listed above.

The gallery's network-offline attempt caused the runtime's offline presentation to replace the gallery. The independent browser harness verified path transitions directly. A previously service-worker-controlled preview context retained old gallery modules; a fresh context with service workers blocked loaded current source without clearing existing site storage. The PWA owner subsequently committed development-cache repairs. Preview authentication is held in memory, so preview restarts invalidate its local sessions. The documented `/__dev/login?to=%2F__syncloudos%2Fnse-gallery` route restored the founder acceptance session. Final gallery speech, native PiP, network and AES.GCM checks passed at `bcb82970` with no page errors. HiDPI captures use a fresh context with the verified local session; all three DPR-2 PNGs are 2720 × 1900.

## UI and screenshots

All new action controls are `NSEButton` or the requested `NSERoutePickerView`, drawn by Atmo. Layout and headings use `NSEBox`, `NSEStackView` and `NSETextField`. The private gallery grouping helper only composes these existing controls. The video element is a media target, not a replacement control. No raw action buttons, typed arrow artwork or new all-caps headings were added.

The only new public control is **NSERoutePickerView**, required by the brief to expose the native playback chooser. It reuses NSEButton appearance and interaction; no private system artwork or device-list control was invented.

Captured and visually inspected at 1360 × 950, DPR 1 and 2, reduced motion, light Atmo:

- [DPR 1 top](fx-phase4-gallery-dpr1-top.png), [video controls](fx-phase4-gallery-dpr1-video.png), [bottom](fx-phase4-gallery-dpr1-bottom.png).
- [DPR 2 top](fx-phase4-gallery-dpr2-top.png), [video and route-picker focus](fx-phase4-gallery-dpr2-video.png), [bottom](fx-phase4-gallery-dpr2-bottom.png).
- 430 × 932 phone: [top](fx-phase4-gallery-phone-top.png), [audio wrapping](fx-phase4-gallery-phone-audio.png), [video](fx-phase4-gallery-phone-video.png), [network wrapping](fx-phase4-gallery-phone-network.png), [bottom](fx-phase4-gallery-phone-bottom.png).

The phone review found and corrected constrained button labels with the existing stack wrapping policy. Leaving the section ended the local preview track and stopped speech; returning recreated the examples. No gallery page errors were observed. These captures demonstrate the new composition using existing Atmo controls, not a new claim of pixel equivalence to Apple's native route-picker artwork.

## Validation

- Framework `npx tsc -b --pretty false`: passed in the clean shipping checkout and at current source `b0bfc6a7`.
- Authoring typecheck: passed at `b0bfc6a7`. Architecture check: only the owner's known `WindowManagementFixture.tsx:29` violation; no new task-owned violation.
- Focused phase-4 contracts: **96 passed in 14 files**.
- `npm run sdk:build`: passed in the clean same-volume adoption checkout. A D: checkout with a C: dependency junction correctly failed the source-map absolute-path leakage gate; the same-volume retry passed.
- Required serial full framework suite, at `8c78a917`, with `--maxWorkers=1 --no-file-parallelism`: **7,348 passed, 23 failed; 896 passed files, 30 failed files**. Disk exhaustion caused load/copy failures; other assertions involved concurrent authorisation/public-export/documentation expectations. This was not a clean full-suite pass.
- Following disk recovery and concurrent fixes, the non-package failed-file recheck: **386 passed in 22 files**, including documentation links, browser/architecture guards, runtime fixtures and mounted audio recording.
- The earlier six-file package run had **25 passed, 4 failed**: three timeouts plus the external consumer's unexpected `SCAuthorization`/`SCAuthorizationRights` browser exports. The full serial run subsequently passed the Foundation and typography consumers and declaration derivation. The recovered eight-file package recheck had **14 passed, 2 failed**: the same external-consumer export expectation and a 120-second Chronosphere consumer timeout. VideoFX, MediaFX, value foundations, LuminaFX, repaired public APIs and the file-browser consumers passed. The authorisation owner corrected the export expectation in `bcb8297`; the external consumer then passed its targeted recheck (**1 passed, 8 skipped**). The Chronosphere consumer also passed its isolated recheck (**1 passed**) against a byte-for-byte frozen SDK archive. Every original full-run failure has a passing follow-up check; the original full-suite result remains recorded as failed, and no second full-suite pass is claimed.
- Installed CryptoFX worker checks against archive `ca2550127922532f65a1d6e4e30e457812146284ea90a80fc7a068f8b91aab92`: passed in Chromium, Firefox and WebKit.
- Site typecheck after adoption: passed. Both the stable `bcb82970` run and the final shared `b0bfc6a7` run had **398 passed, 3 failed in 2 files**: the editable-window title expectation in `gallery-atmo-surfaces.test.tsx` and Publisher popover/menu anchor identity assertions in `publisher/product-controller.test.tsx`. The final archive stayed unchanged throughout the run. These files were not changed by this task; no pre-task baseline claim is made for them. Earlier concurrent installs also caused transient suite-load failures, which are preserved in their separate logs.

Authoritative results: [focused contracts](fx-phase4-focused-latest.json), [full-suite summary and failure details](fx-phase4-framework-full-summary.json), [recovered non-package checks](fx-phase4-failure-recheck.json), [recovered package checks](fx-phase4-package-recheck.json), [external SDK recovery](fx-phase4-sdk-external-final-recheck.log), [Chronosphere recovery](fx-phase4-chronosphere-final-recheck.log), [stable site run](fx-phase4-last-site-tests.json), [source browser results](fx-phase4-browser-results.json), [headed capture and speed](fx-phase4-browser-results-headed.json), [installed worker results](fx-phase4-crypto-final-browser.json), [gallery interactions](fx-phase4-gallery-live.json).

## Adoption, cleanup and outstanding decisions

Adoption used only authorised detached temporary checkouts, with node_modules junctions to the shared framework dependencies. Every task-owned temporary checkout is removed. Each cleanup first deleted the junction itself, proved the shared framework Vitest still existed, and only then removed the named checkout. No dependency tree was manually deleted. Only port 5199 was restarted; the protected 5387 listener remained PID 69072, and 5173/5210 were not touched. The private Vite configuration was never staged.

After a newer peer adoption, this task built and re-adopted clean framework HEAD **`b0bfc6a7715844bd6a50f6194a40df1f556a9e64`**, archive **`6b2d2400abfaac1bdf983ac13cee1c0cc4b9565b23647a89ddbcf10181f41ece`**. A concurrent owner then repacked the **same commit** as **`aff87137ffafa10c04bcac4d27cb99fd737eb4fa947c282703558d43a5c4f881`** and committed it in the site as `3dd6db0`. Both have source fingerprint **`176e69a02850093cc8db0371aa5260fbec78d8b2ce129fbca90fea15781f7a6e`**. The later repack was preserved. [Delivery provenance](fx-phase4-adoption-delivery-provenance.json) records both; [the successful re-adoption log](fx-phase4-overlay-readoption.log) records this task's actual install. An earlier overlapping npm install returned `ENOTEMPTY`; waiting for the other install and retrying the normal workflow succeeded, without manually removing dependencies.

The final shared-receipt site run is recorded in [delivery site results](fx-phase4-delivery-site-results.json) and [its test report](fx-phase4-delivery-site-tests.json). Source checks are in [delivery source results](fx-phase4-delivery-source-results.json); [last checkout cleanup](fx-phase4-last-checkout-cleanup.json) proves the final junction-safe cleanup. No owner question is outstanding. The full-run and site failures remain visible in the evidence rather than being presented as successful validation. No push, branch switch, feature worktree or history rewrite was performed.
