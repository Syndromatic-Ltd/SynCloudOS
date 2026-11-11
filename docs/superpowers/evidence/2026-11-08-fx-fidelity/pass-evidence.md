# PassFX fidelity rebuild evidence

Base: `b0861c5d9ef44448bc3cc8d8d833e205b159a7d2` on framework `fix/blind-rewrite-friction`. Sibling site remains `prerelease` with its old installed SDK. Scope: approved PassKit member subset only, with the genuine Foundation name-component and payment-method-type dependencies. Root owns PLAN/REPORT; no other family implementation, Fusion, server, branch, worktree or preview configuration changed.

## Decisions and Apple authority

Consulted Apple primary documentation on 2026-11-08: [controller](https://developer.apple.com/documentation/passkit/pkpaymentauthorizationcontroller), [request](https://developer.apple.com/documentation/passkit/pkpaymentrequest), [summary item](https://developer.apple.com/documentation/passkit/pkpaymentsummaryitem), [delegate](https://developer.apple.com/documentation/passkit/pkpaymentauthorizationcontrollerdelegate), [payment](https://developer.apple.com/documentation/passkit/pkpayment), [token](https://developer.apple.com/documentation/passkit/pkpaymenttoken), [method](https://developer.apple.com/documentation/passkit/pkpaymentmethod), [method type](https://developer.apple.com/documentation/passkit/pkpaymentmethodtype), [contact](https://developer.apple.com/documentation/passkit/pkcontact), [result](https://developer.apple.com/documentation/passkit/pkpaymentauthorizationresult), [status](https://developer.apple.com/documentation/passkit/pkpaymentauthorizationstatus), [network](https://developer.apple.com/documentation/passkit/pkpaymentnetwork), [merchant capability](https://developer.apple.com/documentation/passkit/pkmerchantcapability), [contact field](https://developer.apple.com/documentation/passkit/pkcontactfield), [shipping method](https://developer.apple.com/documentation/passkit/pkshippingmethod), [PKPassKitError.Code](https://developer.apple.com/documentation/passkit/pkpasskiterror/code), [NSPersonNameComponents](https://developer.apple.com/documentation/foundation/nspersonnamecomponents), and [merchant validation](https://developer.apple.com/documentation/applepayontheweb/providing-merchant-validation). Apple Markdown endpoints were fetched directly after the web connector could not consume text/markdown.

Apple Pay on the Web requires a merchant-validation event, a merchant-server request to Apple's validation URL, and a single-use merchant session passed back to the native session. Those values cannot be inferred from the approved request/two-delegate subset. Root explicitly approved the faithful unsupported production branch: BrowserPaymentAdapter always returns false from network/general availability and fails presentation, rather than inventing gateway options or silently claiming Apple Pay support. Its insecure-context SecurityError is classified as native denial before conversion into PKFXError. Complete positive payment flow is a deterministic private-port proof, never a real financial transaction.

The owner-approved exclusion remains: PKFXPaymentButton, PKFXPaymentButtonType and PKFXPaymentButtonStyle await artwork. No control, artwork, custom sheet, Wallet/pass subsystem, merchant-session update delegate, recurring-payment subsystem, native merchant configuration or browser gateway API was added.

Foundation had NSEData and NSEDecimalNumber but no person-name component value. Root authorized the small genuine NSEPersonNameComponents counterpart, exported through Foundation and mapped in developer lookup. Contacts' existing CNFXPhoneNumber/CNFXPostalAddress/CNFXContact are reused. No guessed split of display names occurs. PKFXPaymentMethodType is the actual type required by PKPaymentMethod.type.

## Complete Apple -> public member -> file mapping

All Pass public files live under `src/FX/PassFX/`; each named export is in its own same-named `.ts` file. `public.ts` contains only re-exports. Runtime/type exports are exhaustively checked by TypeScript symbol inspection and developer-MCP counterpart lookup: 16 runtime exports and one delegate interface. Every enum/option value also has its matching type export. Foundation dependency lives in `src/Foundation/NSEPersonNameComponents.ts`.

| Apple | Ours/file | Members | Support/error mapping |
|---|---|---|---|
| PKPaymentRequest | PKFXPaymentRequest | merchantIdentifier, countryCode, currencyCode, supportedNetworks, merchantCapabilities, paymentSummaryItems, requiredBillingContactFields, requiredShippingContactFields, shippingMethods, applicationData | Mutable request values copied at controller construction; invalid values fail invalidDataError. |
| PKPaymentSummaryItem | PKFXPaymentSummaryItem | init(label, amount, type=final); label, amount: NSEDecimalNumber, type | Exact Foundation decimal retained and validated via decimal toString, never Number. |
| PKPaymentSummaryItemType | PKFXPaymentSummaryItemType | final, pending | Runtime constants and type union. |
| PKPaymentNetwork | PKFXPaymentNetwork | Current documented network constants, including visa/masterCard/amex | Runtime constants/type union; existence makes no capability claim. |
| PKMerchantCapability | PKFXMerchantCapability | threeDSecure, emv, credit, debit, instantFundsOut | Option bits; no gateway configuration. |
| PKContactField | PKFXContactField | emailAddress, name, phoneNumber, phoneticName, postalAddress | Runtime constants/type union; request uses ReadonlySet. |
| PKShippingMethod | PKFXShippingMethod | inherits summary item; identifier, detail | No unrelated delivery-date subsystem added. |
| PKPaymentAuthorizationController | PKFXPaymentAuthorizationController | init(paymentRequest), static canMakePayments()/canMakePayments(usingNetworks), delegate, present(completion), dismiss(completion) | Real attributed class; selected-session main queue; production availability false/presentation unknownError; entitled capable-port flow proven. |
| PKPaymentAuthorizationControllerDelegate | PKFXPaymentAuthorizationControllerDelegate | paymentAuthorizationControllerDidAuthorizePayment(controller,payment,handler), paymentAuthorizationControllerDidFinish(controller) | Interface; sender first; handler takes PKFXPaymentAuthorizationResult and single-use result snapshot. |
| PKPayment | PKFXPayment | token, billingContact, shippingContact, shippingMethod | System-supplied read-only properties; no complete/details/methodName/payer fields. |
| PKPaymentToken | PKFXPaymentToken | paymentMethod, transactionIdentifier, paymentData: NSEData | Read-only immutable Foundation token data; no SPC/browser credential projection. |
| PKPaymentMethod | PKFXPaymentMethod | displayName, network, type, billingAddress: CNFXContact\|null | Read-only system attributes; Wallet pass subsystem excluded. |
| PKPaymentMethodType | PKFXPaymentMethodType | unknown, debit, credit, prepaid, store, eMoney | Small genuine enum dependency required by PKPaymentMethod.type. |
| PKContact | PKFXContact | emailAddress, name, phoneNumber, postalAddress, supplementarySubLocality | Reuses CNFXPhoneNumber/CNFXPostalAddress; name uses Foundation counterpart. |
| PKPaymentAuthorizationResult | PKFXPaymentAuthorizationResult | init(status, errors), status, errors | Handler value copied at invocation before queued delivery. |
| PKPaymentAuthorizationStatus | PKFXPaymentAuthorizationStatus | success, failure, invalidBillingPostalAddress, invalidShippingPostalAddress, invalidShippingContact, pinRequired, pinIncorrect, pinLockout | Apple status cases; this is payment-result status, never privacy authorization. |
| PKPassKitError | PKFXError | domain PKPassKitErrorDomain; code/message | unknownError, invalidDataError, unsupportedVersionError, invalidSignature, notEntitledError; actual Apple error counterpart rather than nonexistent PKError. |
| NSPersonNameComponents | NSEPersonNameComponents | namePrefix, givenName, middleName, familyName, nameSuffix, nickname, phoneticRepresentation, copy() | One Foundation class with nullable explicit components and value copy; no formatter, parser or other subsystem. |

## Runtime authority and lifecycle

Option A uses the committed fxRuntimeContracts binding/attribution helpers, selected-session DispatchFX main queue, and private WeakMap port associations. No FX file directly imports AppSDK or PlatformAdapters. Binding/import does not resolve sessions; controller construction resolves once and pins the chosen session. Missing/ended/ambiguous sessions use PKFXError; unbound base construction keeps the plugin/application-bundle message. No public computed-symbol member leaks attribution into declarations.

The launch payment.request entitlement and host authorization remain mandatory. Existing shared native-denial and resource lifetime tracking are preserved without a public privacy enum or consent method. Native NotAllowedError is recorded by the shared store before error normalization, including over saved grant. A captured generation remains invalid after revoke/regrant, policy/entitlement restoration and replacement presentation. Native response release is scoped to its old sheet: unfinished/late responses finish with failure once, and the replacement sheet remains live.

The native port opens synchronously before any main-queue hop when the existing shared host gate permits it; any existing host consent prompt still follows the shared gate's async contract. present completion, authorized-payment delegate, later merchant handler work, finish delegate and dismiss completion are selected-session queue work with delivery checks. The merchant result is copied when the handler is called. A handler can be used once. Dismiss is terminal. Registry removal and signal abortion both end resources. The controller installs session/access observers once on first work and releases them exactly once; idle/abandoned hook renders install no native resource subscriptions. Queue-only idle dismissal binds the privacy generation before enqueueing, so pre-native revocation also drops it.

usePayment(request) returns an actual attributed controller and uses the existing insertion-effect ownership pattern. StrictMode effect setup/cleanup replay does not terminate the retained object, true unmount does. Hook selection matches the actual context or its branding clone by shared lifetime signal and runtime ID, demands exactly one matching session, and rejects duplicate configured-runtime-ID aliases.

## Removed APIs and every migrated consumer

Removed public names: PKFXAuthorizationStatus, PKFXPaymentCompletion, PKFXPaymentData, PKFXPaymentValue, PKFXCapabilities, PKFXPaymentMethodData, PKFXPaymentRequestDescriptor, PKFXPaymentClient. Removed browser members: request descriptor constructor, string amount/pending flag, paymentMethodData/supportedMethods, requestPayerName/requestPayerEmail/requestPayerPhone, requestId/methodName/details/payerName/payerEmail/payerPhone, payment.complete, controller getAuthorizationStatus/canMakePayments instance/promise present/dispose, client getCapabilities/createAuthorizationController, SCOS.payment, SynWareContextValue.payment and RuntimeEnvironment.payment. No aliases remain.

- public.ts moved all true classes/protocols/enums into individual files; old internal/paymentData.ts and AppSDK/mountedPaymentClient.ts deleted.
- appRuntimeFacade, mountedEnvironmentClientRegistry, createSynWareContextValue and runtime/context types now use private adapter/environment/context associations. scosFacade removes both bound and unbound factories. BrowserRuntimeEnvironment associates its private unsupported adapter; InstalledApplications/capabilityReport now reports the genuine passive boolean query.
- usePayment now takes a request and returns the real controller. phase5-mounted and phase5-packed migrated accordingly.
- fakeAdapters/testHostTypes expose payment state controls, never a native open/client. The actual `.app` fixture proves allowed native-port presentation, real typed payment graph, handler/result completion, live policy loss, teardown, and native denial.
- The old phase5 payment hook test is replaced by pass-hook: StrictMode plus true unmount, native response failure, suspended render, branding clone, exact session ambiguity. phase5-payment now verifies explicit unsupported/insecure browser paths. Old gateway/SPC descriptor and WebAuthn credential tests represent removed browser-only behavior and are retired, not shimmed.
- payment's old generic privacy-new-fx probe is moved to the Apple controller flow: passive inspection, predenial, missing entitlement/host policy, saved-grant native denial, revocation/regrant, live/late release and replacement lifetime are covered in pass-flow and the real `.app` consumer. The other family probes remain unchanged.
- docs/framework/fx/pass.md, fx/README.md, authorization.md and synware-manifest.md remove incorrect client/privacy claims and document the supported subset and browser failure. appkit-counterparts.json and developer lookup cover every public export; SDK fx/pass entry already points at public.ts and remains correct.
- Repository/site source scans found no current site PKFX/usePayment caller to edit. The sibling site's installed SDK intentionally stays old until final adoption/Gallery work. That final gate must consume this new request/controller/hook surface with explicit production unavailability and no compatibility shim. No site files changed here.

## TDD and verification before SDK freeze

- pass-initial-red.log: four expected failures for absent classes/value types.
- pass-flow-red.log: new private runtime route not implemented yet; after implementation pass-core-green.log: 17/17.
- pass-hook-boundary-red.log: three expected real-object/exact-session/private-environment failures. pass-hook-boundary-green.log: 20/20 across core/hook/boundary.
- pass-counterparts-red.log: expected missing mapping; source migration group later 19/19.
- pass-handler-red.log: later merchant handler incorrectly executed immediately; also the first observer-count probe included Dispatch's own main-queue observer. The probe was narrowed to the controller observer installed before first queue creation. pass-handler-green.log: 17/17 with native handler execution on selected main queue and exact controller-owned observer release.
- pass-result-red.log: mutation of a handler result before queue delivery changed authorization; snapshot fix gives pass-result-green.log: 18/18.
- Final focused command is printed in pass-focused.log: `npx vitest run` over 23 named Pass/affected privacy, attribution, Dispatch, runtime environment, test-host, Foundation decimal and prior Contacts/Speech files. **183/183 tests in 23/23 files, exit 0.** No full framework suite.
- `npx vitest run --config tests/fixtures/pass-attribution/vitest.config.mjs` -> pass-plugin.log: **2/2, exit 0**, native await/timer/callback plugin flow through the existing class test host.
- `npx tsc -b --pretty false` in framework -> pass-framework-typecheck.log: **exit 0**.
- Same command in sibling site -> pass-site-typecheck.log: **exit 0**, current installed SDK untouched.
- `node scripts/quality/architecture-boundaries.mjs` -> pass-architecture.log: **1,742 files / 7,914 edges validated, exit 0**.
- UTF-8/format audit -> pass-format-audit.json: all owned files decoded strictly, no BOM, replacement characters or copyright mojibake. Existing LF files stay LF; existing pass.md and phase5-mounted.test.tsx retain their original CRLF. New source/tests/fixtures are LF. Default whitespace checks apply to all other paths; only these two proven legacy CRLF paths use the narrowly scoped cr-at-eol check. No global whitespace setting is changed.
- C: remained above 274 GB free, exceeding the 20 GB floor.

## Exhaustive file inventory

The following explicit paths are the complete family commit scope (A=new, M=modified, D=deleted). `pass-owned-paths.json` is the machine-readable staging list. Parent PLAN/REPORT and all unrelated artifacts remain unstaged.

- M `docs/framework/appkit-counterparts.json`
- M `docs/framework/authorization.md`
- M `docs/framework/fx/README.md`
- M `docs/framework/fx/pass.md`
- M `docs/framework/synware-manifest.md`
- A `docs/superpowers/evidence/2026-11-08-fx-fidelity/pass-evidence.md`
- M `scripts/quality/architecture-boundaries.json`
- A `src/FX/PassFX/PKFXContact.ts`
- A `src/FX/PassFX/PKFXContactField.ts`
- A `src/FX/PassFX/PKFXError.ts`
- A `src/FX/PassFX/PKFXMerchantCapability.ts`
- A `src/FX/PassFX/PKFXPayment.ts`
- A `src/FX/PassFX/PKFXPaymentAuthorizationController.ts`
- A `src/FX/PassFX/PKFXPaymentAuthorizationControllerDelegate.ts`
- A `src/FX/PassFX/PKFXPaymentAuthorizationResult.ts`
- A `src/FX/PassFX/PKFXPaymentAuthorizationStatus.ts`
- A `src/FX/PassFX/PKFXPaymentMethod.ts`
- A `src/FX/PassFX/PKFXPaymentMethodType.ts`
- A `src/FX/PassFX/PKFXPaymentNetwork.ts`
- A `src/FX/PassFX/PKFXPaymentRequest.ts`
- A `src/FX/PassFX/PKFXPaymentSummaryItem.ts`
- A `src/FX/PassFX/PKFXPaymentSummaryItemType.ts`
- A `src/FX/PassFX/PKFXPaymentToken.ts`
- A `src/FX/PassFX/PKFXShippingMethod.ts`
- D `src/FX/PassFX/internal/paymentData.ts`
- A `src/FX/PassFX/internal/paymentPort.ts`
- A `src/FX/PassFX/internal/paymentRequestSnapshot.ts`
- A `src/FX/PassFX/internal/paymentSessionBindings.ts`
- A `src/FX/PassFX/internal/paymentValues.ts`
- M `src/FX/PassFX/public.ts`
- A `src/Foundation/NSEPersonNameComponents.ts`
- M `src/Foundation/public.ts`
- M `src/SynCloudOS/AppSDK/appContextTypes.ts`
- M `src/SynCloudOS/AppSDK/appRuntimeFacade.ts`
- M `src/SynCloudOS/AppSDK/createSynWareContextValue.ts`
- M `src/SynCloudOS/AppSDK/hooks/usePayment.ts`
- M `src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts`
- D `src/SynCloudOS/AppSDK/mountedPaymentClient.ts`
- A `src/SynCloudOS/AppSDK/mountedPaymentPort.ts`
- M `src/SynCloudOS/AppSDK/scos/scosFacade.ts`
- M `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`
- M `src/SynCloudOS/AppSDK/testing/testHostTypes.ts`
- M `src/SynCloudOS/InstalledApplications/capabilityReport.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserPaymentAdapter.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts`
- M `src/SynCloudOS/Runtime/runtimeInstanceTypes.ts`
- A `tests/fixtures/pass-attribution/consumer.test.tsx`
- A `tests/fixtures/pass-attribution/public-types.ts`
- A `tests/fixtures/pass-attribution/src/SynWare/First.app/Contents/Info.ts`
- A `tests/fixtures/pass-attribution/src/SynWare/First.app/Contents/index.tsx`
- A `tests/fixtures/pass-attribution/vitest.config.mjs`
- A `tests/runtime/fx/pass-apple.test.ts`
- A `tests/runtime/fx/pass-counterparts.test.ts`
- A `tests/runtime/fx/pass-flow.test.ts`
- A `tests/runtime/fx/pass-hook.test.tsx`
- A `tests/runtime/fx/pass-host-boundary.test.ts`
- A `tests/runtime/fx/pass-packed.test.ts`
- A `tests/runtime/fx/pass-public-types.test.ts`
- M `tests/runtime/fx/phase5-mounted.test.tsx`
- M `tests/runtime/fx/phase5-packed.test.ts`
- D `tests/runtime/fx/phase5-payment-hook.test.tsx`
- M `tests/runtime/fx/phase5-payment.test.ts`
- M `tests/runtime/privacy-new-fx.test.ts`

## Frozen SDK and commit record

All source, shipped documentation, tests and fixture bytes are finalized before explicit staging and the single SDK build. The immutable actual-entry installed proof must run `pass-packed.test.ts`, `phase5-packed.test.ts` and `packed-fx.test.ts`; it installs outside the repository, executes the real compiled `.app` flows, checks strict public types, checks one attribution runtime instance, rejects source links/private subpaths, traverses root/sdk/testing/browser/fx-pass declaration graphs for any Pass internal module, and verifies installed resource integrity. Exact result, archive/source/resource hashes and the final commit are appended here after those gates; machine receipts are pass-installed.json, pass-frozen-verification.json and pass-commit.txt.


### Final frozen proof (completed)

- Single `npm run sdk:build` -> pass-sdk-build.log: **exit 0**. Existing Rollup circular chunk warning `browser -> syncloudos-runtime -> browser` remains an aggregate ledger item; no unrelated refactor. No implementation/shipped-documentation/build-input bytes changed after the freeze.
- `npx vitest run tests/runtime/fx/pass-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` -> pass-packed.log: **3/3 tests in 3/3 files, exit 0**. Pass's installed actual-entry specimen additionally runs **2/2 nested real plugin .app flow tests**. It proves both production bundle/import behavior and strict installed TypeScript, all 16 runtime exports, the Foundation name-component copy, real payment/token/method/contact/NSEData values, blocked private subpaths and one shared attribution runtime module.
- Actual declaration graph traversal from package root, `/sdk`, `/sdk/testing`, `/browser` and `/fx/pass` reaches **zero PassFX internal modules in every graph**. Direct emitted public declarations contain no private ports, browser descriptors, legacy factories, attribution symbols or host/runtime imports. Installed resource bytes remain intact after all proof work.
- `node scripts/synware/installed-consumer.mjs --verify` -> pass-frozen-verification.json: **currentSourceMatches true**, separately from the installed behavioral proof. Post-commit verification is written to pass-postcommit-verification.json.
- Archive SHA-256: `d353ce812db6392513450db8763749079fbdd371d41921071cacb240ef80e0bd`.
- Frozen source SHA-256: `a261a449e6edbcfe3c64ca12efcdf2ee38aad361efac40ea5705d4af28b4e96a`.
- Installed resources SHA-256: `6ec3aeabe575156269997039a60ced1895e885a3c9f2f947410a116ed149051e`.
- Pass JS entry SHA-256: `40a79117b17228aa21776c9ca3645ff172e4810e8b8374ecb4d2bbe48181a62a`.
- Pass declaration entry SHA-256: `c6fca9c197a7bdfbd39a9b3cd328e9065568ea5e265689110bda4a4a1594902e`.
- Explicit staging covered exactly **63 owned paths**, preserving root PLAN/REPORT and unrelated files. Default nonlegacy and scoped legacy-CRLF staged checks pass; index/worktree bytes match (pass-staged-checks.json).

The single explicit-path family commit is titled **FX: rebuild PassFX with attributed PassKit payment objects**. Its exact SHA is written immediately afterward to pass-commit.txt and returned to root, avoiding a self-referential hash inside committed evidence. Site adoption/Gallery and physical/native payment acceptance remain deferred; the production transport explicitly remains unavailable, and payment button/type/style remain excluded.


## Review correction: native completion denial

Review of initial commit `3126f575b7b09aa94c4fa001cbbf2e25e58799b7` found one Important issue (pass-review-findings.md): the native response completion boundary converted rejection into PKFXError before recording native denial. An existing shared grant could therefore continue to authorize availability and another presentation. A synchronous native completion throw bypassed error conversion as well.

The completion boundary now awaits native finish in a try/catch, classifies NotAllowedError/SecurityError while its captured generation and operation signal are still current, records authoritative shared browser denial, and only then converts to PKFXError. Shared local choice deliberately remains granted; browserStatus/authorizationStatus become denied, matching the existing privacy observation contract. That observation immediately invalidates resource generations and callbacks. Changing the saved local choice back to granted does not override native denial. Completion's successful awaited return also rechecks access and its operation signal.

A completion from an already dismissed, revoked, unmounted or ended operation cannot change shared state or release a replacement sheet. The current generation and operation signal must both match before recording a new native observation. Ended operations still fail with PKFXError and their queued callbacks remain suppressed. A native response is completed only once even when completion denial triggers revocation/cleanup.

Correction ownership is limited to these six original family paths:

- `src/SynCloudOS/AppSDK/mountedPaymentPort.ts`: classified synchronous and asynchronous completion errors with the captured-lifetime guard.
- `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`: existing payment deny control can also deny native completion; no public test or Apple API was added.
- `tests/runtime/fx/pass-flow.test.ts`: eight regressions covering both raw denial names, saved grant/shared availability/generation, queued idle-dismiss/finish callbacks, synchronous conversion, and delayed denial after dismissal or revoke/regrant while a replacement completes successfully.
- `tests/fixtures/pass-attribution/consumer.test.tsx`: actual plugin app runs both presentation-denial and completion-denial flows; the native control is restored afterward to prove the shared denial is authoritative.
- `tests/runtime/fx/pass-packed.test.ts`: requires all three actual installed app scenarios and records that count.
- This evidence file.

Correction TDD and pre-freeze validation:

- `npx vitest run tests/runtime/fx/pass-flow.test.ts` -> pass-review-red.log: **4 failed / 22 passed**, reproducing the two missing shared-denial cases and two raw synchronous exceptions. All four replacement-isolation cases already pass and constrain the correction.
- `npx vitest run tests/runtime/fx/pass-flow.test.ts tests/runtime/fx/pass-hook.test.tsx tests/runtime/fx/phase5-payment.test.ts tests/runtime/privacy-store.test.ts` -> pass-review-covering.log: **44/44 in 4/4 files, exit 0**.
- The actual `.app` completion-denial fixture first fails availability (`true` instead of `false`) in pass-review-plugin-red.log: **1 failed / 2 passed**. The private native fake completion then honors the already-existing deny control. Final `npx vitest run --config tests/fixtures/pass-attribution/vitest.config.mjs` -> pass-review-plugin.log: **3/3, exit 0**.
- Complete original 23-file focused command is printed in pass-review-focused.log, including all eight new regressions: **191/191 tests, 23/23 files, exit 0**.
- Framework and sibling site `npx tsc -b --pretty false` -> pass-review-framework-typecheck.log / pass-review-site-typecheck.log: **both exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` -> pass-review-architecture.log: **1,742 files / 7,914 edges validated**.
- All six correction files preserve strict UTF-8 and original LF, with no BOM/mojibake. Default working/staged whitespace checks and exact index/worktree bytes are verified before the one correction freeze/build. The full original family diff retains the same two narrowly scoped legacy CRLF files and no new CRLF file.

The single correction SDK rebuild and installed proof follow the frozen six-path staging. Their final receipts and amended SHA are recorded below. This section supersedes the initial build hashes/counts above once the correction proof completes. No public authorization enum, new gateway/merchant flow, financial transaction or unrelated bundler change is introduced.


### Correction frozen proof and amendment

- One correction `npm run sdk:build` -> pass-review-sdk-build.log: **exit 0**. The existing browser/syncloudos-runtime circular-chunk warning remains visible and unchanged in scope.
- `npx vitest run tests/runtime/fx/pass-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` -> pass-review-packed.log: **3/3 in 3/3 files, exit 0**. Pass's independently installed actual-entry test runs **3/3 real plugin app scenarios**, including native completion denial followed by restoring the fake native control; shared denial still blocks availability/new presentation and drops the queued finish delegate.
- Strict installed types, production bundle/import behavior, all 16 runtime exports, one shared attribution runtime, blocked private paths, and installed resource integrity pass. All five root/sdk/testing/browser/fx-pass declaration graphs again reach **zero Pass internals**. The public Pass declaration entry hash remains unchanged, confirming no public signature was added or changed.
- `node scripts/synware/installed-consumer.mjs --verify` -> pass-review-frozen-verification.json: **currentSourceMatches true**. This identity check is separate from the three installed behavioral proofs above.
- Corrected archive SHA-256: `6cebecdf307674abf7b25296fc916aa171e48a7e2d052db48ee3f9ada210bf4b`.
- Corrected source SHA-256: `4be1b1eee2ddab004a0ed9ec2388c46c80299421db00356125e73e91c60a5068`.
- Corrected resources SHA-256: `71c57f2c519d1bf15884b563763b752edc9368b70be79c987b4b598f751fd1f4`.
- Corrected Pass JS entry SHA-256: `813de7f5b1a8153ad16353fd4ffb5823be328978c75e2472c30ec7ef8c046a08`.
- Unchanged Pass declaration entry SHA-256: `c6fca9c197a7bdfbd39a9b3cd328e9065568ea5e265689110bda4a4a1594902e`.

The initial family commit 3126f57 is amended with only the six correction paths listed above. Its new exact SHA is recorded in pass-review-commit.txt and pass-commit.txt and returned for scoped re-review. Post-amend verification is pass-review-postcommit-verification.json. Root PLAN/REPORT and unrelated files remain unstaged. The full family still touches the same 63 paths; no source bytes changed after the correction freeze.
