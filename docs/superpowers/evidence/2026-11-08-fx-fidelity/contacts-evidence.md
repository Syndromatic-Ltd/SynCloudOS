# ContactsFX fidelity rebuild evidence

Base: `b74335291fc41fa9a7e1b5af23b680a109c00180` (reviewed Speech). Worktree `framework`, branch `fix/blind-rewrite-friction`; sibling site `prerelease` remains on its previous installed SDK. Root owns PLAN/REPORT. No other family implementation, site config, Fusion, branch/worktree, server, protected port, push, or stash changed.

## Authority and decisions

Read the extracted contacts-task-brief.md, family-task-constraints.md and the review's ten rules/Contacts member list. Consulted Apple's live documentation JSON for CNContact, CNContactStore, CNContactFetchRequest, CNLabeledValue, CNPostalAddress, CNContactFormatter, CNError.Code, CNContactTypeKey, CNContactPickerViewController and CNContactPickerDelegate. Canonical URLs are linked in docs/framework/fx/contacts.md.

- Real Apple classes, one per file; delegate/key-descriptor protocols are interfaces; public.ts contains only explicit named re-exports. Attributed constructors use committed fxRuntimeContracts helpers with private class metadata, pinned sessions and terminal instances. No public factory, capability object, browser options/types, signal parameters, compatibility aliases, inverse formatter or new Foundation subsystem was added.
- Browser selection is limited to the contacts chosen for that request. CNContactStore.requestAccess never opens a picker or claims database authorization. Its completion is queued `(false, CNFXError)`; synchronous database members fail explicitly and never read a picker cache. Static statuses use Apple's cases; only limited is reported after selection, never database authorized. Empty selection cancels without recording a consent grant.
- CNContactPickerViewController genuinely extends NSEViewController. Binding resolves before `super`, and the selected mount signal supplies the inherited NSE owner lifetime. This fixes real after-await construction without ambient ownership. Registry removal is separately observed. Existing NSE presentation adopts it normally, initiates the browser chooser synchronously through a private WeakMap, and suppresses a duplicate host sheet. No public native-present hook, new presentation style, raw UI or artwork. Architecture adds an exact ContactsUI class layer whose only NSE entries are NSEViewController and the private association; only the FX layer admits that class. Host rendering reaches the association through the existing private NSE host interop.
- Shared consent still precedes native access. A pending app-consent prompt may consume browser activation; it is never bypassed. Already authorized action-handler presentation reaches the chooser in the same synchronous activation boundary. Browser secure-context/support and actual native permission are independent constraints.
- Raw NotAllowedError reaches Privacy.request before CNFXError normalization, so refusal replaces a saved grant. Cross-realm DOMException names/messages are read structurally. The deterministic native Contacts denial maps its fake SecurityError to NotAllowedError; actual browser SecurityError continues to represent context/policy restrictions and is not rewritten as a user's refusal.
- Captured generations invalidate pending and queued results through revoke/regrant or replacement. Policy/entitlement loss, signal abort and session registry removal terminate active pickers. Delegates use the exact selected session's main Dispatch queue and recheck authority at delivery. Browser Contact Picker exposes no cancellable session/resource handle: there is no late native handle to release, and dismissal cannot close the browser-owned dialog. Old contact values are dropped while replacements remain unaffected.
- Native display names have no reliable decomposition: preserve the first complete display name in givenName; familyName remains empty/unavailable. No inverse formatter. Native labels are unknown and remain null. Contact/labeled identifiers are NSString-shaped strings, generated for the snapshot and stable across copies, never device database identifiers. No UUID/URL/bytes counterpart is needed for this member set.
- Labeled email/phone/postal values are real classes with immutable arrays/copies. Address lines become street; region/city/dependentLocality/postalCode/country-code map directly. Browser data lacks localized country/sub-administrative-area values. Full-name formatting is a documented given/family-order subset; phonetic formatting fails featureNotAvailable. Other full Apple subsystem features outside the admitted member list (database writes, change tracking, vCards, contact-property delegates) are not claimed.
- CNKeyDescriptor is Apple's marker protocol; key strings and opaque formatter descriptors are validated privately. Fetch request supports predicate via existing NSEPredicate, keysToFetch, mutableObjects, unifyResults and sortOrder. The unimplemented enumeration stop-pointer uses `{ value: boolean }`; no new Foundation machinery.
- useContacts returns a real per-app CNFXContactStore. Exact unique context/mount signal plus runtime/app identity matches the reviewed Speech pattern; no first/latest selection. Insertion lifetime survives StrictMode effect replay and cancels queued completions at actual unmount. Suspended renders perform no native work. Real branded host context, competing mount signals and ambiguous matching aliases are covered. The unrelated known Network hook gap remains for aggregate acceptance.

## Export mapping (all runtime and type exports)

| Apple | SynCloudOS | Owning file |
|---|---|---|
| `CNContactStore` | `CNFXContactStore` | `src/FX/ContactsFX/CNFXContactStore.ts` |
| `CNContact` | `CNFXContact` | `src/FX/ContactsFX/CNFXContact.ts` |
| `CNMutableContact` | `CNFXMutableContact` | `src/FX/ContactsFX/CNFXMutableContact.ts` |
| `CNContactPickerViewController` | `CNFXContactPickerViewController` | `src/FX/ContactsFX/CNFXContactPickerViewController.ts` |
| `CNLabeledValue` | `CNFXLabeledValue` | `src/FX/ContactsFX/CNFXLabeledValue.ts` |
| `CNPhoneNumber` | `CNFXPhoneNumber` | `src/FX/ContactsFX/CNFXPhoneNumber.ts` |
| `CNPostalAddress` | `CNFXPostalAddress` | `src/FX/ContactsFX/CNFXPostalAddress.ts` |
| `CNContactFormatter` | `CNFXContactFormatter` | `src/FX/ContactsFX/CNFXContactFormatter.ts` |
| `CNContactFetchRequest` | `CNFXContactFetchRequest` | `src/FX/ContactsFX/CNFXContactFetchRequest.ts` |
| `CNError` | `CNFXError` | `src/FX/ContactsFX/CNFXError.ts` |
| `CNAuthorizationStatus` | `CNFXAuthorizationStatus` | `src/FX/ContactsFX/CNFXAuthorizationStatus.ts` |
| `CNEntityType` | `CNFXEntityType` | `src/FX/ContactsFX/CNFXEntityType.ts` |
| `CNContactType` | `CNFXContactType` | `src/FX/ContactsFX/CNFXContactType.ts` |
| `CNContactFormatterStyle` | `CNFXContactFormatterStyle` | `src/FX/ContactsFX/CNFXContactFormatterStyle.ts` |
| `CNContactSortOrder` | `CNFXContactSortOrder` | `src/FX/ContactsFX/CNFXContactSortOrder.ts` |
| `CNContactPickerDelegate` | `CNFXContactPickerDelegate` | `src/FX/ContactsFX/CNFXContactPickerDelegate.ts` |
| `CNKeyDescriptor` | `CNFXKeyDescriptor` | `src/FX/ContactsFX/CNFXKeyDescriptor.ts` |
| `CNContactIdentifierKey` | `CNFXContactIdentifierKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactTypeKey` | `CNFXContactTypeKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactGivenNameKey` | `CNFXContactGivenNameKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactFamilyNameKey` | `CNFXContactFamilyNameKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactOrganizationNameKey` | `CNFXContactOrganizationNameKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactEmailAddressesKey` | `CNFXContactEmailAddressesKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactPhoneNumbersKey` | `CNFXContactPhoneNumbersKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactPostalAddressesKey` | `CNFXContactPostalAddressesKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNLabelHome` | `CNFXLabelHome` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelWork` | `CNFXLabelWork` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelOther` | `CNFXLabelOther` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberMobile` | `CNFXLabelPhoneNumberMobile` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberiPhone` | `CNFXLabelPhoneNumberiPhone` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberMain` | `CNFXLabelPhoneNumberMain` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberHomeFax` | `CNFXLabelPhoneNumberHomeFax` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberWorkFax` | `CNFXLabelPhoneNumberWorkFax` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberOtherFax` | `CNFXLabelPhoneNumberOtherFax` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberPager` | `CNFXLabelPhoneNumberPager` | `src/FX/ContactsFX/CNFXLabels.ts` |

## Members and availability

- CNFXContact: identifier, contactType, givenName, familyName, organizationName, emailAddresses, phoneNumbers, postalAddresses, isKeyAvailable, copy and mutableCopy. CNFXMutableContact adds setters for every supported field except identifier. Default empty values are distinguished from unavailable data by isKeyAvailable.
- CNFXContactStore: no-argument constructor; static authorizationStatus(entityType); requestAccess(entityType, completion); unifiedContacts(predicate, keysToFetch); enumerateContacts(fetchRequest, block). Database access is authorizationDenied when refused, otherwise featureNotAvailable. Ended attribution uses CNFXError.communicationError. Invalid entity type uses validationTypeMismatch.
- CNFXContactPickerViewController: no-argument constructor, delegate, displayedPropertyKeys and inherited NSE presentation/disposal. Delegate sender-first methods: contactPickerDidSelectContact, contactPickerDidSelectContacts and contactPickerDidCancel. Plural method determines multi-selection. Async cancellation/failure uses Apple's cancellation delegate when live, with no invented error delegate; revocation/termination drops callbacks.
- CNFXLabeledValue: label, value, identifier, settingLabel, settingValue and settingLabelValue preserve immutable identity. CNFXPhoneNumber: stringValue. CNFXPostalAddress: street, subLocality, city, subAdministrativeArea, state, postalCode, country, isoCountryCode. CNFXContactFormatter: style, static/instance string, descriptorForRequiredKeys. CNFXContactFetchRequest: constructor(keysToFetch), mutable keysToFetch/predicate/mutableObjects/unifyResults/sortOrder. Unsupported key descriptors: unauthorizedKeys. Unsupported phonetic/browser fields: featureNotAvailable. Native failures normalize to the CNErrorDomain error wrapper.

## Removed names and consumer migration

Removed CNFXContactDescriptor, CNFXCapabilities, CNFXContactProperty, CNFXContactRequest, CNFXContactsClient, getCapabilities, getAuthorizationStatus, createContactStore, browser-shaped requestAccess, displayNames, store/request picker constructor and standalone zero-argument picker.present. The inherited NSE `present(controller, animator)` remains legitimate. Deleted mountedContactsClient.ts; replaced it with private mountedContactsPort.ts.

Removed factory reachability from SynWareContextValue, bound/unbound SCOS, inferred browser runtime environment, runtime environment types and testing declaration graphs. Mounted environment registry retains only private service types; context and environment associations are WeakMaps. Browser/test environments privately associate their adapter; test adapters expose deterministic controls without select/native handles. System capability report reads the private association. SDK's existing contacts entry remains stable, now class-based and explicit; all counterpart/developer lookup mappings updated.

Migrated existing adapter, actual runtime authority, hook/StrictMode, mounted SDK, packed six-family and shared-privacy consumers. The old generic Contacts branch in privacy-new-fx tested a nonexistent persistent browser-authorization/dispose contract; its five guarantees are preserved in Contacts-specific flow/UI/adapter tests (passive no-consent, pre-denial, grant/revoke, native denial after saved grant, pending stale suppression). Other families' test branches stay intact. Site source search found no direct Contacts consumers; site adoption/Gallery remain deferred with no shim.

## Test-first and investigation record

- contacts-initial-red.log: 2/2 tests fail for absent class/value surface; implemented values then fixed the independently exposed class import cycle through a private mutable-constructor registry.
- contacts-flow-red.log: missing private Contacts service module plus the still-missing store class; flow test specification preceded service/picker implementation.
- contacts-hook-red.log: 2/2 tests fail on the old factory facade; new real-object/exact-mount hook passes.
- contacts-migration-green.log is an INTERMEDIATE FAILED RUN despite its filename: 32 passed / 2 failed; migrated real-runtime tests still expected Promise rejection whereas native NSE needs synchronous preflight errors. Corrected assertions; contacts-authority-green.log is 2/2 passed.
- contacts-nse-green.log is an INTERMEDIATE FAILED RUN despite its filename: 18 passed / 1 failed. The failing shared-consent regression exposed cross-realm DOMException normalization; structural error access fixed it. Ordinary NSE tests passed throughout. contacts-ui-mapping-green.log: 3/3 passed.
- contacts-plugin-first.log: plugin rejected star exports, so public.ts now uses explicit named re-exports. contacts-plugin-green.log is an INTERMEDIATE FAILED RUN: 0/2 passed because NSE ambient ownership was unavailable after await. The constructor now uses the selected mount's ownerSignal. contacts-plugin-ownership.log: 1/2 passed; native denial fixture used SecurityError, which correctly was not persisted as user refusal. Corrected only the deterministic native-denial mapping. contacts-plugin-final.log: 2/2 passed.
- contacts-boundary-first.log: 2 passed / 1 failed for missing counterpart mappings; added every runtime/type export mapping. Public source types and host boundary checks already passed.
- contacts-empty-red.log: 12 passed / 1 failed because empty selection incorrectly reported limited; empty native results now cancel before Privacy.request can record a grant. contacts-empty-green.log: 13/13 passed. Additional passive/no-consent/pre-denial preservation regression: contacts-privacy-final.log 14/14 passed.

## Pre-freeze verification

- contacts-focused.log: `npx vitest run` with the 24 focused/affected paths printed in that log, **171/171 tests, 24/24 files, exit 0**. Includes API/flow/consent/native presentation, normal NSE presentation, real branded hook/mounted authority, complete counterpart/public source boundaries, attribution/plugin transforms, Dispatch binding, Speech shared-context regressions, browser/host environment and class test host. Subsequent one-test privacy preservation addition passes in contacts-privacy-final.log (14/14 flow).
- contacts-framework-typecheck.log and contacts-site-typecheck.log: exact `npx tsc -b --pretty false` in framework and sibling site, **both exit 0**. No full framework suite.
- contacts-architecture.log and contacts-architecture-narrow.log: `node scripts/quality/architecture-boundaries.mjs`, **1,721 files / 7,828 edges validated**.
- Source Unicode/line-ending audit before SDK freeze restored accidental Windows write_text CRLF to the original LF or new-file LF. Existing pre-family CRLF is retained only in phase5-mounted.test.tsx and checked with a scoped cr-at-eol rule; all remaining owned files use the default whitespace check. UTF-8 strictly decoded, no CRCRLF or mojibake copyright sequence; staged bytes must equal worktree bytes. A transient Windows file-open failure during this local normalization succeeded on immediate isolated retry; no test/compiler failure remains unresolved.
- Last C: free space: 274,264,899,584 bytes (above 20 GB).

## Exhaustive owned inventory

The following 65 implementation/documentation/test paths are the complete family delta; this evidence file is additional. Existing unrelated PLAN/REPORT and untracked evidence are excluded.

- `docs/framework/appkit-counterparts.json`
- `docs/framework/authorization.md`
- `docs/framework/fx/README.md`
- `docs/framework/fx/contacts.md`
- `scripts/quality/architecture-boundaries.json`
- `src/FX/ContactsFX/CNFXAuthorizationStatus.ts`
- `src/FX/ContactsFX/CNFXContact.ts`
- `src/FX/ContactsFX/CNFXContactFetchRequest.ts`
- `src/FX/ContactsFX/CNFXContactFormatter.ts`
- `src/FX/ContactsFX/CNFXContactFormatterStyle.ts`
- `src/FX/ContactsFX/CNFXContactKeys.ts`
- `src/FX/ContactsFX/CNFXContactPickerDelegate.ts`
- `src/FX/ContactsFX/CNFXContactPickerViewController.ts`
- `src/FX/ContactsFX/CNFXContactSortOrder.ts`
- `src/FX/ContactsFX/CNFXContactStore.ts`
- `src/FX/ContactsFX/CNFXContactType.ts`
- `src/FX/ContactsFX/CNFXEntityType.ts`
- `src/FX/ContactsFX/CNFXError.ts`
- `src/FX/ContactsFX/CNFXKeyDescriptor.ts`
- `src/FX/ContactsFX/CNFXLabeledValue.ts`
- `src/FX/ContactsFX/CNFXLabels.ts`
- `src/FX/ContactsFX/CNFXMutableContact.ts`
- `src/FX/ContactsFX/CNFXPhoneNumber.ts`
- `src/FX/ContactsFX/CNFXPostalAddress.ts`
- `src/FX/ContactsFX/internal/contactValues.ts`
- `src/FX/ContactsFX/internal/contactsPort.ts`
- `src/FX/ContactsFX/internal/contactsSessionBindings.ts`
- `src/FX/ContactsFX/internal/keyDescriptors.ts`
- `src/FX/ContactsFX/public.ts`
- `src/NSE/Application/NSEViewController.ts`
- `src/NSE/Application/nativePresentation.ts`
- `src/NSE/applicationHostInterop.ts`
- `src/SynCloudOS/AppHosting/applicationHosting.tsx`
- `src/SynCloudOS/AppSDK/appContextTypes.ts`
- `src/SynCloudOS/AppSDK/appRuntimeFacade.ts`
- `src/SynCloudOS/AppSDK/createSynWareContextValue.ts`
- `src/SynCloudOS/AppSDK/hooks/useContacts.ts`
- `src/SynCloudOS/AppSDK/mountedContactsClient.ts`
- `src/SynCloudOS/AppSDK/mountedContactsPort.ts`
- `src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts`
- `src/SynCloudOS/AppSDK/scos/scosFacade.ts`
- `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`
- `src/SynCloudOS/AppSDK/testing/testHostTypes.ts`
- `src/SynCloudOS/InstalledApplications/capabilityReport.ts`
- `src/SynCloudOS/PlatformAdapters/BrowserContactsAdapter.ts`
- `src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts`
- `src/SynCloudOS/Runtime/runtimeInstanceTypes.ts`
- `tests/fixtures/contacts-attribution/consumer.test.tsx`
- `tests/fixtures/contacts-attribution/public-types.ts`
- `tests/fixtures/contacts-attribution/src/SynWare/First.app/Contents/Info.ts`
- `tests/fixtures/contacts-attribution/src/SynWare/First.app/Contents/index.tsx`
- `tests/fixtures/contacts-attribution/vitest.config.mjs`
- `tests/runtime/fx/contacts-apple.test.ts`
- `tests/runtime/fx/contacts-counterparts.test.ts`
- `tests/runtime/fx/contacts-flow.test.ts`
- `tests/runtime/fx/contacts-host-boundary.test.ts`
- `tests/runtime/fx/contacts-packed.test.ts`
- `tests/runtime/fx/contacts-presentation.test.tsx`
- `tests/runtime/fx/contacts-public-types.test.ts`
- `tests/runtime/fx/phase5-contacts.test.ts`
- `tests/runtime/fx/phase5-mounted.test.tsx`
- `tests/runtime/fx/phase5-packed.test.ts`
- `tests/runtime/fx/phase5-real-authority.test.ts`
- `tests/runtime/fx/phase5-speech-contacts-hooks.test.tsx`
- `tests/runtime/privacy-new-fx.test.ts`

## Initial frozen SDK acceptance (superseded by review correction)

- `npm run sdk:build` → contacts-sdk-build.log: **exit 0**, the single staged/frozen SDK rebuild. Source fingerprint assertion passed. The build reports the existing runtime/browser circular-chunk warnings; actual installed entry/runtime execution below passes. No implementation, shipped documentation or build-input bytes changed after freeze.
- `npx vitest run tests/runtime/fx/contacts-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → contacts-packed.log: **3/3 tests, 3/3 files, exit 0**. The Contacts proof contains **2/2 nested actual installed plugin `.app` tests**, constructing after await/timer/callback, selecting real class values through NSE presentation, refusing database authorization, exercising saved-consent native denial, policy revoke/regrant replacement and teardown.
- The independent consumer is npm-installed outside the repository with no link back to source. Vite production build and import tests pass; exactly one shared attribution-runtime module is present. The actual Contacts entry has all 33 runtime exports; hidden ports, factories, attribution markers, native presentation association and private package routes are absent/blocked.
- Strict installed `public-types.ts` passes with skipLibCheck:false. The declaration graphs from root, `/sdk`, `/sdk/testing`, `/browser`, and `/fx/contacts` each contain **zero Contacts internal modules**. Direct class declarations contain no private ports, attribution metadata, old clients, browser options, request signals or invented promises.
- Installed resource hashes remain identical after app behavior, production build/import, type and declaration-graph proof. contacts-installed.json records the result. A subsequent `node scripts/synware/installed-consumer.mjs --verify` → contacts-frozen-verification.json reports currentSourceMatches true (that command verifies identity only; behavioral acceptance is the installed test above).
- Archive SHA-256: `f75ce77d1622578b157381ed76aa0b3e2b0cf0664e676f838918c2bd07a42bd8`.
- Source SHA-256: `fdfbe256f21a434c25e545d49e62adcdfdbe59db6f2e5d7f256f287859123f65`.
- Resources SHA-256: `fe069bcfc6b9fefd0b67e9da52b0cc9d36186c9ba21b28d83339bf3b011f017f`.
- C: free after independent installations: 273,969,455,104 bytes. Physical-device/native-dialog acceptance, complete locale-specific name formatting, final site SDK adoption/Gallery and aggregate full-suite acceptance remain deferred as scoped.
- Browser contacts retain CNContact's default person contactType; the web picker provides no authoritative organization/person classification. This is a default value, not inferred native contact metadata. Mutable local contacts can explicitly select organization. No device database identity or full native classification is claimed.

Commit uses one explicit-path `FX:` commit titled **FX: rebuild ContactsFX with attributed contacts and NSE picker**. Exact SHA is recorded after commit in contacts-commit.txt and returned to root, avoiding a self-referential hash.


## Review correction: picker observer cleanup and store-only revocation

Scoped review of initial commit `44bf3a081f412943c75044ee02648e09b7bcd97b` found two Important bugs (contacts-review-findings.md). The picker constructor and presentation each registered a session-end callback, overwriting the first disposer. Ordinary selection/cancellation/dismissal therefore left one callback retaining the picker and its delegate until app end. Separately, store-only requestAccess queued a completion without registering the mounted port's privacy generation invalidation; revoke/regrant before the first picker, or after a prior resource was revoked, could deliver that stale completion.

The picker now owns exactly the constructor's session-end registration. Presentation does not replace it. Disposal invokes and clears both the session and access disposers. Regression cases complete selection, cancel selection and dismiss a pending picker, then unregister the still-live app session: none can invoke the disposed picker again. The real plugin fixture additionally observes successfully completed pickers through actual host teardown and proves they receive no further disposal callback.

The private ContactsPort now has bindAccessLifetime(generation), which asserts captured authority and binds the existing shared privacy lifetime lease. CNContactStore.requestAccess uses this path before queueing its unavailable-database completion. It does not call Privacy.request/requestAuthorization, ask for consent, open a native picker, mark consent granted, or add public members. A later privacy revocation invalidates the captured generation even when no picker has ever existed. After a prior revocation, a fresh store reacquires the observation lease independently of native selection. Old completions remain invalid after regrant while a newly created store can deliver its own featureNotAvailable completion. The observation retains only the mounted port, not a queued store callback; the existing app signal releases it at teardown.

Correction inventory (7 existing owned paths; public API/NSE integration unchanged):

- src/FX/ContactsFX/CNFXContactPickerViewController.ts
- src/FX/ContactsFX/CNFXContactStore.ts
- src/FX/ContactsFX/internal/contactsPort.ts
- src/SynCloudOS/AppSDK/mountedContactsPort.ts
- tests/runtime/fx/contacts-flow.test.ts
- tests/fixtures/contacts-attribution/consumer.test.tsx
- docs/superpowers/evidence/2026-11-08-fx-fidelity/contacts-evidence.md

Verification before the correction freeze:

- `npx vitest run tests/runtime/fx/contacts-flow.test.ts` → contacts-review-red.log: **5 failed / 14 passed**. Three failures observe leaked post-disposal session callbacks; two observe stale store-only completions after revoke/regrant (fresh app and previously revoked picker resource).
- `npx vitest run tests/runtime/fx/contacts-flow.test.ts tests/runtime/fx/contacts-presentation.test.tsx tests/runtime/fx/phase5-speech-contacts-hooks.test.tsx` → contacts-review-covering.log: **23/23 passed in 3/3 files**. Native presentation, consent sequencing and real-object StrictMode/unmount remain covered.
- Full required 24-file focused command printed in contacts-review-focused.log: **177/177 tests, 24/24 files, exit 0**. This is the original focused group with the complete passive pre-denial and five review regressions now included, preserving normal NSE presentation and the other reviewed-family context/binding checks.
- `npx vitest run --config tests/fixtures/contacts-attribution/vitest.config.mjs` → contacts-review-plugin.log: **2/2 passed**, including the added actual host-teardown disposal observation.
- `npx tsc -b --pretty false` in framework and sibling site → contacts-review-framework-typecheck.log / contacts-review-site-typecheck.log: **both exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` → contacts-review-architecture.log: **1,721 files / 7,828 edges validated**.
- All correction files preserve explicit UTF-8 and LF, with default whitespace checking. The whole intended amended family diff retains its single pre-existing CRLF exception in phase5-mounted.test.tsx, checked only with scoped cr-at-eol. Exact staged/worktree byte comparison precedes the single correction SDK rebuild. No other family or root PLAN/REPORT is staged.
- The SDK's existing Rollup circular-chunk/execution-order warnings remain recorded for aggregate triage. They are not fixed by this scope and build logs are not claimed pristine.

### Correction frozen acceptance

- `npm run sdk:build` → contacts-review-sdk-build.log: **exit 0**, one correction rebuild after staging/freezing. Existing Rollup warnings remain visible; no source/shipped-documentation/build-input changes followed the correction freeze.
- `npx vitest run tests/runtime/fx/contacts-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → contacts-review-packed.log: **3/3 tests in 3/3 files, exit 0**. This repeats the independent installed actual-entry proof, including **2/2 nested real plugin `.app` flow tests** with the new completed-picker disposal observation at actual host teardown.
- Strict installed public types, production bundle/import behavior, all 33 runtime exports, blocked private paths, one shared attribution-runtime module and resource integrity all pass again. Actual declaration graphs from root, `/sdk`, `/sdk/testing`, `/browser`, and `/fx/contacts` again reach **zero Contacts internal modules**. The Contacts declaration entry hash is unchanged: `db78581e8a77b072621fe0fe389b3ba508616c39b14c1a851d564027211b0177`.
- `node scripts/synware/installed-consumer.mjs --verify` → contacts-review-frozen-verification.json: **currentSourceMatches true** after the installed checks. Behavioral acceptance is recorded separately by the installed test; the verifier checks immutable identity.
- Corrected archive SHA-256: `0098af7d67e7384ebe98e5d4963d4f6afb563a5e2cb86bca716578ebcdb35577`.
- Corrected source SHA-256: `230f7a3043649a973ba5e29989edf5c53490b19df46b93bb1e066889eed881cb`.
- Corrected resources SHA-256: `5c22c3eebe977b16b35ab4287e936f3def0860bd4cbd7e9acd0cf25587e929a4`.
- contacts-review-installed.json and contacts-installed.json identify this corrected archive; the initial hashes earlier in this report are superseded. All seven corrected paths are again checked for exact index/worktree bytes, explicit UTF-8, LF and default whitespace before amendment. The complete amended family diff passes the existing narrowly scoped CRLF check for phase5-mounted.test.tsx.
- C: free after reproof: 274,118,037,504 bytes. Site remains unchanged on its previous installed SDK. No full suite, other family, new public/native UI route or bundler refactor was introduced.
- The initial own Contacts commit 44bf3a0 is amended with only these seven paths. The new SHA is written to contacts-commit.txt and contacts-review-commit.txt after amendment and returned for scoped independent re-review. Root PLAN/REPORT remain unstaged.
