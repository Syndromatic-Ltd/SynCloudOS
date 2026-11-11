# Gallery FX migration evidence

Status: committed on site `prerelease` as `ff0b460e2aaa67382311735f975d31f894fb2a65` after focused and full-site automated validation passed against root's exact clean framework adoption `baacfd06742b86405d1142d5636d42bfcce89ed6`. Re-review closed the Speech finding with no remaining Important findings. Root authorised the explicit-path site commit; live Chromium acceptance remains pending and is not claimed here.

## Scope and authority

The existing Device & Data Capabilities destination (`fx-capabilities`, route `/__syncloudos/nse-gallery`) retains its GalleryGroup, Status, NSEBox, NSEStackView, NSETextField and NSEButton appearance and composition. Existing NSERoutePickerView remains in the unchanged Video example. No artwork, raw elements, appearance override, payment button or VR configuration was added. The supplied GalleryCategoryViewController now reaches FXCapabilitiesSection and ContactsExample; its existing `presentAsSheet` presents the actual contact picker. No new navigation or presentation system was introduced.

The implementation reads the accepted family classes and hook sources, the authoritative review, Gallery task brief, family constraints and SynCloudOS Visual Pass references. Final source ownership is limited to the site Gallery section, Info manifest, catalogue, two focused test files and this evidence. Root owns SDK adoption, broader suites, screenshots, PLAN and REPORT.

## Migrated and added examples

| Family | Actual public objects and operation | User action and browser limit |
|---|---|---|
| Network | `new NWFXPathMonitor`, `pathUpdateHandler`, `start`, `cancel`; `NWFXPath` Apple properties | Monitor/stop; every restart constructs a fresh terminal monitor. Unsupported interface/cost observations display the actual NWFXError. Online status is explicitly not proof of Internet reachability. |
| Speech | `useSpeech` returns SPFXSpeechRecognizer; static `requestAuthorization`; SPFXSpeechAudioBufferRecognitionRequest, AUFXAudioPCMBuffer, recognitionTask result handler | Separate authorisation, supplied-audio recognition and cancellation actions. A 0.1-second silent PCM buffer is supplied, with no microphone request. Results use bestTranscription, segments and isFinal. Browser supplied-audio absence returns SPFXError. AudioFX speech synthesis remains separate and unchanged. |
| Contacts | `useContacts` returns CNFXContactStore; CNFXContactPickerViewController, sender-first picker delegate, CNFXContactFormatter and labelled contact values | Choose contact through the supplied category controller; database access completion shows CNFXError where unavailable. Only name, email and telephone keys are requested. |
| Pass | `usePayment` returns PKFXPaymentAuthorizationController; PKFXPaymentRequest, summary item with NSEDecimalNumber, network and merchant constants, sender-first authorisation/finish delegate | Explicit demonstration sheet attempt with £1.00 total. The demo returns PKFXPaymentAuthorizationResult(failure), never processes a payment, dismisses and creates a fresh request/controller. Browser transport reports its PKFXError and canMakePayments availability. |
| NFC | New NFXNDEFReaderSession per attempt, readingAvailable, begin/invalidate, sender-first active/message/error delegate | Explicit read and stop actions. Read-only NDEF message/record counts; no write entitlement. Invalidation is terminal; restart always constructs a fresh session. Unsupported hosts report NFXReaderError. |
| Bluetooth | `useBluetooth` returns BTFXCentralManager; BTFXUUID, peripheral and service/characteristic delegates | Choose one Battery Service peripheral, connect, discover and explicitly read its Battery Level NSEData, disconnect. Availability uses manager state. Hardware and browser grants remain required. |
| XR | `useXR` returns XRFXSession; XRFXWorldTrackingConfiguration.isSupported, run with resetTracking, pause, sender-first session delegates | Explicit world tracking start/pause. Apple's light-estimation default remains true. Unsupported estimation produces the framework XRFXError. Native frame camera position is read from its AFXTransform3D; no synthetic data or camera rendering. |
| Crypto | CRFXAESGCM, CRFXSymmetricKey(CRFXSymmetricKeySize.bits256), CRFXSHA256 and digest.description | Encrypt/open immutable NSEData and display the real digest description. |
| Compression | CPFXOutputFilter write/finalize closure and CPFXInputFilter readData/read closure | Raw-DEFLATE (`zlib`) round trip with NSEData; actual CPFXFilterError where the codec is absent. |

Removed Gallery consumers: `useNetwork().createMonitor`, callback-parameter start, browser network fields `interfaceType`, `effectiveType`, `saveData`, `CRFXSymmetricKey.generate`, `CRFXAES.GCM` and manual digest byte formatting. Catalogue identifiers now include all nine rebuilt families. No compatibility shim or source alias was introduced. New text follows the existing Gallery adapter's documented unknown-string passthrough; no translation claims or unrelated generated localisation rewrites were made.

Info adds exactly `speech.recognize`, `contacts.select`, `payment.request`, `nfc.read`, `bluetooth.access`, `xr.session`; existing entitlements are retained. The accepted source has no central closed entitlement registry: the canonical authority is each mounted family port plus its guide, as confirmed by root. No consent grant or bypass is added to application code. Test-only fake-host allow calls are explicit fixture setup.

## Preservation

The source-contract test pins canonical-LF hashes of the entire SpeechExample, SessionExample, LocationExample and VideoExample declarations from git `35d43ac`. It needs neither historical Git objects nor a CRLF checkout. The physical worktree retains its original CRLF bytes, verified separately. Extraction uses TypeScript FunctionDeclaration.getStart(sourceFile) through node.end, excluding surrounding blank lines.

- Raw video line SHA-256: `182FBF8F67AE6F7B9528E227F94F66A12A51605CC84CDE551C3431E9E8CB9F43`.
- Complete VideoExample original CRLF SHA-256: `E0E5FC0FEEEEB2F93B02B648A0924022329AA8D57B2E8DC607121E25413FAAD0`.
- Same complete function with repository LF normalisation: `FDC780CBE1B25B27D976B1EA8ED1896344B849F81736C69A54C6D4BBF0F065B9`.
- SpeechExample canonical-LF SHA-256: `9093FD65F2F9DB234967C28567FF8BB0576409089E94B570895359FC903601D0`.
- SessionExample canonical-LF SHA-256: `5966BDB67615443B6ADEBDBEF8DACF354C823569696803FE21E6A80EEA8D9F14`.
- LocationExample canonical-LF SHA-256: `5713DD79C68BB59B27EF76C480B727CFB29802E933FE2BD61D50F9A56D55983E`.
- The earlier `88E2…` derived hash in gallery-preservation-baseline.json was not reproducible from the recorded source. Root pinned the reproducible AST extraction in gallery-preservation-recipe.json; the protected source was not altered to fit the earlier hash.

## Verification and remaining acceptance

- Before implementation, the new Node contract tests passed preservation and failed the missing-family/obsolete-consumer constraints as expected.
- After implementation: `node --test tests/node/gallery-fx-contract.test.mjs` — 3/3 passing. It verifies protected source bytes, all nine reachable public-family examples and no added raw controls or obsolete browser contracts.
- `git diff --check` passes (Git reports the pre-existing LF catalogue checkout convention).
- `npx vitest run tests/runtime/gallery-fx-capabilities.test.tsx --maxWorkers=1` against the adopted package: **12/12 passed** in 10.03 seconds. Cases cover passive StrictMode mount and disabled controls, terminal network restart and section cleanup, supplied-audio task results/cancellation, interleaved recognition/authorisation, missing-launch-entitlement errors/no native requests, NSE contact picker presentation and database error, declined payment and fresh presentation, terminal NFC restart/cleanup, Bluetooth discovery/read/disconnect, retiring a previous Bluetooth connection and rejecting captured stale delegates, XR default and pause, and actual WebCrypto/raw-DEFLATE round trips.
- Focused self-review repairs: each new Bluetooth chooser retires the old selection and connection, detaches its peripheral delegate and clears the characteristic. Gallery identity and generation guards reject captured old peripheral callbacks during reselection, even when the same known peripheral is selected again; central callbacks require a current intended connection. The test directly establishes rejection before reconnecting. The framework's independent per-peripheral generations protect queued central deliveries after reconnecting. Manager-state notifications remain independent. The source guard does not prohibit explicit disabled light-estimation examples; retaining the default is this sample's chosen behaviour.
- Independent review found that checking Speech authorisation advanced the recognition generation without cancelling its task. The repair gives authorisation its own generation and invalidates both generations on component unmount. On the installed SDK, the single regression was run with a reversible minimal mutation replacing the authorisation button's independent generation with the shared recognition generation. It failed at the expected `Final transcription: Still recognised` assertion (1 failed, 11 skipped). A `finally` block restored the exact frozen source bytes and verified full-file SHA-256 `B6E86C197F022721D92E72F238F2012BAFD37A95092E52A38D20668872186209`; the restored source then passed all 12 cases. No pre-install runtime execution is claimed.
- The first installed run passed 11/12 cases; its added unavailable-profile fixture was invalid. The existing Speech fake maps every non-allow control mode, including failure, to denied authorisation, which intentionally invalidates callbacks; it cannot model BrowserSpeechAdapter's `unavailable` authorisation. The Contacts fake also remains available and maps its asynchronous failure to picker cancellation. The corrected case keeps native fake services allowed but removes the six family launch entitlements from the test manifest: it verifies six actual family errors and zero native calls. Actual browser unavailability remains a separate Chromium acceptance gate, rather than an invented fake API or a weakened callback/privacy rule.
- Site `npx tsc -b --pretty false` passed after adoption. Root's full-site Vitest run passed **413 tests in 62 files**, 22.44 seconds, exit 0 (`site-final-full.log`, `site-final-full-exit.txt`). Root's full Node suite passed **24/24**, exit 0 (`site-final-node.log`, `site-final-node-exit.txt`). This agent inspected those completed logs and did not duplicate the full suites. The final independent Gallery contract recheck passed 3/3 before commit.
- Root owns Chromium 1440×900 and 390×844, light/dark screenshots, console and control inspection. Physical Bluetooth/NFC devices, native contact chooser, actual payment transport, native supplied-audio speech backend and AR hardware are not yet verified. Fake-host tests do not establish hardware compatibility.

The adopted receipt records archive `syndromatic-syncloudos-1.0.0-beta.2-61999236adfaad4b23694182d48ad1931956fe6ae1ee75e13a845a9c5b035a48.tgz`, SHA-256 `61999236adfaad4b23694182d48ad1931956fe6ae1ee75e13a845a9c5b035a48`, 2,630 resource files and source SHA-256 `00451c7747dddc2a6bb477801c03a2d2146f4065e5acb9ddec9ed4303491f9bb`. This agent independently recomputed the archive SHA, verified the receipt commit/resource count and confirmed the package/lock refer to that archive. Root owns the clean-checkout adoption proof; the receipt has no separate clean boolean. Only root changed adoption files and the package junction. The final source file still hashes to `B6E86C197F022721D92E72F238F2012BAFD37A95092E52A38D20668872186209`; protected hashes remain unchanged. C: had 272,634,761,216 bytes free at commit preparation. Browser evidence remains pending.

## Site commit

`ff0b460e2aaa67382311735f975d31f894fb2a65` — `FX: migrate Gallery device and data examples to Apple-shaped families`.

Exactly ten authorised paths were verified with rename detection disabled and committed using an explicit-path `git commit --only`. Git presents the two archive paths as one 74% rename, hence nine displayed file entries. The only remaining site status entry is the untouched, untracked `vite.claude-5199.config.mts`.

```text
package.json
package-lock.json
src/SynWare/NSEControlGallery.app/Contents/Gallery/FXCapabilitiesSection.tsx
src/SynWare/NSEControlGallery.app/Contents/Gallery/catalogue.ts
src/SynWare/NSEControlGallery.app/Contents/Info.ts
tests/node/gallery-fx-contract.test.mjs
tests/runtime/gallery-fx-capabilities.test.tsx
vendor/framework-receipt.json
vendor/syndromatic-syncloudos-1.0.0-beta.2-4d2d55fcd91df2578b59e4c49950495d4df7de2c00030c589d15eb55aa933861.tgz (deleted)
vendor/syndromatic-syncloudos-1.0.0-beta.2-61999236adfaad4b23694182d48ad1931956fe6ae1ee75e13a845a9c5b035a48.tgz (added)
```

## Final coordinator acceptance

The final implementation is framework `5286513`, adopted cleanly in site `6857d2b` with archive `eb4fe13bac3036d077e0b8558b7e7f2ccbf2545c6e4993f1ddedea2750170d9e`, source `a99970151f276d4bdd65e9fd2450aac9b1e3b82520f09a497b01eb998a9959f0` and 2,630 verified resources. The prescribed junction was deleted with `.Delete()` and original Vitest checked before/after checkout removal. Earlier development-graph and host-dependency failures were corrected in the owning plugin, without editing the protected preview config.

Phone acceptance exposed the last result behind compact navigation. Site `c74d8c2` adds only the existing navigation-scroll marker to `GalleryViews.tsx`'s NSEScrollView, activating canonical trailing clearance. The result now ends at709.61px before the bar's762px top. No control, artwork, appearance override or guessed inset was added. The protected FX source still hashes to `b6e86c197f022721d92e72f238f2012bafd37a95092e52a38d20668872186209`.

Final site typecheck passes; full Vitest413/62files (35.95s) and full Node24/24 pass. Chromium desktop1440x900 and phone390x844, DPR1, both appearances were inspected and captured. Four primary and six supplementary screenshots,14 recorded final actions,13 groups and34 existing NSE buttons are pinned in `gallery-browser-acceptance.json`. Zero horizontal/button overflow, page/console errors, failed requests or optimised SDK requests. Four GPU ReadPixels warnings remain recorded. Real crypto/compression results verify; monitor cleanup and unavailable/restricted service errors remain readable. Pairing/physical native backends are explicitly unverified. Browser closed after acceptance;5199 preview remains available.
