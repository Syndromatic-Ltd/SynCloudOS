# PolicyKit review and authorisation split

The approved split is implemented in the framework and its site consumers. The review was committed before implementation as `2e418b1`; its baseline and file:line findings remain in [the efficacy review](../../plans/2026-11-08-policykit-review.md). No compatibility shim or alias retains the retired name. A case-insensitive scan of shipping framework/site source, callers, tests, scripts and current framework guides is recorded in `authorization-final-names.log`.

**This remains cooperative authorisation inside one page, not isolation from hostile same-page JavaScript.** Browser permission and secure-context restrictions are browser boundaries. Protected server resources independently authenticate and authorise requests. App visibility and entitlements do not protect downloaded static assets. The audit is bounded, local, clearable diagnostics, not durable or tamper-proof server audit.

## Public API and ownership

| Concern | Shipped API and behaviour |
| --- | --- |
| App declarations | `Info.ts.entitlements`; `runtime.policy.requiredEntitlements` for launch requirements. The old manifest `permissions` key is rejected. Launch captures an immutable entitlement set before app code runs. |
| Site configuration | Boot `configurationProfile: SynCloudOSConfigurationProfile`; host `runtime.configurationProfiles`. Visibility modes, roles, access classes and login requirements remain site configuration. The manifest block is still `runtime.policy`. |
| Named administrative rights | `SCAuthorization`, `SCAuthorizationRights` and `runtime.authorization.copyRights(...)`: `runtime.mutate`, `diagnostics.view`, `plugin.register`. Empty/unknown rights are denied. Plugin registration checks its own right and never manufactures system authority. |
| Privacy | Runtime-owned `runtime.privacy`; host `getSnapshot`, `subscribe`, `setAuthorization` and `revoke`. Records separate app consent from the last browser observation, scoped by canonical user, app and service. Authenticated users use the canonical identity subject, not a displayed email. Session replacement invalidates live authority while preserving the same principal's saved choice. |
| FX consent | Existing FX status/request paths use that store. Location/capture expose `getAuthorizationStatus`; Audio sessions distinguish `recordPermission` from playback category; Motion and MIDI expose authorisation status; Bluetooth, NFC, Speech, Contacts, Payment and XR retain their family-specific status/request APIs. Notifications use the same privacy owner. |
| Privacy UI | Webspring System Preferences → Privacy & Security groups the current user's real records. Its NSE switch changes local consent; Ask again resets it. Revocation cancels live/pending framework work. The pane cannot change browser site settings. |
| Optional app passkeys | `@syndromatic/syncloudos/authentication-services`: `ASAuthorizationController`, `ASAuthorizationPlatformPublicKeyCredentialProvider`, registration/assertion requests, delegate, errors and immutable `NSEData` credential evidence. The app's own server verifies that evidence. |
| Optional system passkeys | `@syndromatic/syncloudos/auth/passkey`: `createPasskeyAuthentication`, `passkeyAuthenticationMethod` and operation/options types. It composes an existing OIDC/local authentication service, verifies through host server operations, then requires a confirmed authenticated server refresh. It preserves the base session adapter. |

Passkeys are absent from the emitted default root, browser, SDK and authentication dependency graphs. They occur only through the two explicit opt-in entries. `authorization-passkey-exclusion.json` records the actual emitted ESM graph check, not a source-only size estimate. Syndromatic does not enable passkeys. Authentication-disabled sites need no sign-in provider; apps that do not import passkeys carry no passkey implementation.

The new code observes the existing layer rule: browser credentials are accessed through the platform adapter, Foundation provides immutable bytes and imports nothing upward, and site roles and identity mappings remain site-owned. No Foundation design, device-family implementation, manifest/service-worker protocol or private system artwork was invented by this job.

## Weakness-to-fix evidence

| Review item | Repair | Regression evidence |
| --- | --- | --- |
| R1: unknown actions allowed | Unrecognised actions deny without explicit extension requirements; named rights accept only the three registered rights. Known configuration actions cannot masquerade as rights. | `authorization-efficacy.test.ts`, `sc-authorization.test.ts` |
| R2: overrides and early returns skip requirements | Boot access mode belongs to the host and is validated. Login, role, access-class, capability and entitlement requirements run before action-specific returns, including external apps. Developer-origin metadata is not authority. | `authorization-efficacy.test.ts`, `configuration-profiles-hardening.test.ts`, host-profile tests |
| R3: restrictions elevate/mutate/throw before audit | Restrictions only narrow permission. Their request projections are isolated and frozen; throwing callbacks, accessors and proxies deny and produce a redacted audit decision. | `authorization-efficacy.test.ts`, `configuration-profiles-hardening.test.ts` |
| R4: disposed grants still work | Disposal revokes issued grants; disposed evaluation fails closed. Foreign-instance and revoked grants remain invalid. | Efficacy and configuration-profile subject-grant tests |
| R5: unused declaration requirements | Explicit entitlements replace mixed manifest permissions; required declarations are checked before app code and mounted clients retain captured authority. Mutating an author array cannot add an entitlement to a live mount. | `synapp-manifest-schema.test.ts`, efficacy/launch admission tests, mounted privacy/session integration tests |
| R6: no per-app privacy or revocation | One persisted store mediates device families and notifications. A native origin grant alone does not grant another app. Withdrawal, reset, canonical identity/session changes and profile restrictions revoke active/pending work; stale results cannot restore access. | `privacy-store`, `privacy-location-mounted`, `privacy-capture`, `privacy-motion-midi`, `privacy-new-fx`, `privacy-session-integration`, `privacy-system-notifications`, pane/runtime tests |
| R7: implicit system plugin registration | Plugin registration uses the current caller or an explicit issued grant and checks `plugin.register`. No ambient elevation. | Efficacy, named-right and configuration-profile plugin/subject-grant tests |
| R8: audit omissions and secrets | Enforced sites use audited decisions; dry `evaluate`/`explain` remain explicitly dry. Context credential keys and URL credentials/query/fragment values are redacted. Retention/trust limits are documented. | Efficacy redaction/throw tests, `configuration-profiles-audit-diagnostics.test.ts`, hardening tests |
| R9: cooperative checks presented as security | Framework and English product copy state the actual trust boundary. Server authentication and resource permission checks remain independent of browser metadata. Untrusted-code origin/process isolation was not part of this approved split. | `auth-backend.test.ts`: direct 401/403, forged cookies, and a new R9 case proving role/capability claims in headers, query and JSON never reach the protected handler |

The review produced additional real regressions during implementation: named-right validation initially admitted known non-right actions, two principals sharing an email initially shared device authority, and the notification bridge initially retained stale canonical ownership and pending remote association. Each was reproduced and fixed with focused tests; the notification red run was 10 failed / 3 passed, followed by all 13 integration cases passing. See the red/green logs and `privacy-notifications-report.md`.

The full run also exposed an eager audio privacy subscription that threw on an unavailable capture backend. `f0551c2` preserves inspectable unavailable sessions, including a regression with the real browser adapter and privacy store. Lifecycle and readiness fixtures were migrated to explicit plugin authority, entitlements and public app access; a negative share case proves that an entitlement alone never opens a private app. The browser-global audit now recognises only the exact new passkey adapter, consistent with the architecture policy.

## Live UI verification

The sole new UI is Privacy & Security. Its controls are existing **NSEBox, NSEStackView, NSETextField, NSESwitch and NSEButton**, painted by Atmo. **Invented controls/artwork: none.** The first populated screenshot exposed inherited white text and an uppercase box caption; the final implementation uses Preferences colour tokens and a sentence-case NSE text-field heading inside the existing box.

Chromium ran in fresh isolated contexts on the exact site preview at `http://127.0.0.1:5199`. Existing user storage was not cleared. An older service worker initially returned stale development modules; final UI captures used a fresh context with service workers blocked to inspect the installed archive. This is UI evidence, not offline-worker acceptance. Local preview sign-in is the existing development fixture, not production authentication evidence.

| Live check | Evidence |
| --- | --- |
| Open the registered pane through the real app menu; empty state | `authorization-privacy-desktop-empty.png` |
| Existing gallery Request speed invokes real mounted LocationFX with deterministic browser geolocation | `authorization-privacy-desktop-allowed.png` |
| Local denial blocks the next request with `NotAllowedError` despite native `granted` | `authorization-privacy-desktop-denied.png`, `authorization-ui-results.json` |
| Tab reaches the actual NSE switch; Space changes consent | `authorization-privacy-desktop-keyboard.png` |
| Ask again produces prompt and disables the redundant reset | `authorization-privacy-desktop-prompt.png` |
| Re-request succeeds; consent survives full page reload | `authorization-ui-results.json` |
| Dark phone view, DPR 2, touch revocation | `authorization-privacy-phone-dark-allowed.png`, `authorization-privacy-phone-dark-denied.png` |

Desktop: 1365×900, DPR 1, light appearance. Phone: 390×844, DPR 2, dark appearance. The desktop dialog measured 400×471; the phone dialog measured 366×489 at x=12, entirely inside the viewport. Readouts, switch, reset and navigation bounds are recorded in `authorization-ui-results.json`. Screenshots were visually inspected after transitions settled. The measured contexts reported no page errors.

The gallery requests a position without separately querying permission status; the pane therefore honestly shows its last observation as **Not checked**. A separate read-only native Permissions API observation returned `granted`. Local consent and native status are distinct. Dense multi-service/user isolation is covered in store/pane tests; no fake record was injected for a visual claim.

Real hardware prompts, physical geolocation, microphone/camera capture, Bluetooth/NFC/XR/payment devices, real push delivery/VAPID acceptance and platform passkey authenticators were not acceptance-tested. Passkey controller/provider tests use injected browser seams and a real HTTP authentication client against an in-memory server fixture. A client abort cannot roll back a server mutation already accepted; servers must enforce their own association/session transaction rules.

## Owner questions and deployment choices

No unresolved owner decision blocks the approved split. All approved visibility/authentication choices were retained without re-asking them.

Passkey relying-party deployment remains deliberately opt-in: an app may supply only its own registration/assertion endpoints, or the site may supply server challenge/verification/credential storage and compose the additional system sign-in method. Keeping Syndromatic on its existing OIDC/local setup is the current choice. No server, secret or automatic passkey enablement is implied by shipping the API.

The capability plan's remaining compression question belongs to the concurrent Foundation/FX work: Foundation byte-value compression (`NSEData`, after `NSData.compressed(using:)`) and a separate streaming Compression framework are the Apple shapes; `CPFX` is the plan's suggested free FX prefix. This job changes neither that design nor its naming.

## Commit inventory

Framework commits, grouped by area:

- Review/schema: `2e418b1`, `f7df0ef`, `e3171de`, `66dfd59`, `e393cb8`.
- Evaluator/callers and named rights: the split portion of `074b4b4`, then `61ad80d`, `1297759`, `e744dd6`.
- Privacy/store/pane/integration: `406d617`, `cb86196`, `863f946`, `377a1da`, `689f21e`, `80598c8`, `ce1fb9e`, `5c4ec31`, `14a8bd5`, `014c6d0`, `e373389`, `8c78a91`, `41a47de`.
- Optional passkeys: `92ca874`, `2e8d39a`, `6a7f91a`, `e8dfe5a`, `7d3e347`.
- Documentation/server-boundary regression: `1156d1e`, `1c0b169`, `43237d3`, `546072a`.
- Final regressions/fixture migration: `8109692`, `189e8d0`, `f0551c2`, `44826f7`, `bcb8297`.

`074b4b4` also contains another job's FX entry registration after a shared-index race. History was preserved; subsequent commits use explicit owned paths and `git commit --only` to avoid sweeping a shared index.

Site source commits: `c9d77c4` (Info declarations), `e684749` (configuration profile/named rights), `556e90e` (service entitlement consumers), `5faef77` (copy/localised name migration), `f3a49f6` (keep public visibility out of the gallery's entitlements), **`3dd6db0` (final verified framework adoption)**. Concurrent site commit `2a27f96` also retained a verified shared adoption during delivery.

## Verification record

**The single full framework run was not green.** At `41a47de`, it completed with 866 passed / 60 failed files, 6,231 passed / 19 failed tests. Fifty-one files could not import because the shared disk filled (`ENOSPC`). The other failures exposed stale fixtures, the missing exact browser-adapter audit entry, the unavailable-audio regression, documentation links, the concurrent retained-device expectation and a text-layout timeout. They were investigated rather than waived.

Every one of those 60 failed files is covered by subsequent passing results. `authorization-full-recovery.json` maps each original failure and assertion to the retained follow-up evidence; its unrecovered-file list is empty. This is a recovery record across focused runs, **not a claim that a second full suite passed**. New regressions and fixture changes were checked directly; the full suite was not run again after them.

| Check | Result / evidence |
| --- | --- |
| Framework `npx tsc -b --pretty false` | Passed, including the clean delivery build. `authorization-delivery-framework-typecheck.log`; the prescribed adoption also runs framework typecheck before SDK build. |
| Architecture command in the actual shared worktree | Only the owner's known `src/FrameworkTests/Windows/WindowManagementFixture.tsx:29` → private `NSEPopover` import. Exit 1 is retained honestly in `authorization-final-main-boundaries.log`; no new violation. The temporary junction checkout additionally produces outside-repository dependency-path diagnostics, so it is not used to claim a clean architecture scan. |
| Efficacy, role/profile, named-right and device/privacy regressions | Red/green evidence retained by area, plus coverage in the full run and follow-ups. The final legacy-fixture group passed 81 tests; readiness passed 28; unavailable audio/privacy/recovery/documentation passed 20. |
| Disk-affected suites and recovered regressions | 50 files / 1,322 tests passed in `authorization-recovered-suites.json`. |
| Browser-global boundary | 8 passed with the exact lazy passkey adapter registered; `authorization-browser-boundary-final.log`. |
| Server boundary | 27 passed, including R9 forged browser claims; `authorization-server-claims-tests.log`. |
| Optional passkeys | 17 focused controller/provider/entry tests passed. Real emitted default/opt-in graphs pass in `authorization-passkey-exclusion.json`. No physical authenticator or real RP acceptance claim. |
| Counterpart metadata | 6 passed across the complete public NSE mapping and new authorisation lookup tests; `authorization-final-counterparts-tests.log`. |
| Retained six-family authority and large text layout | 3 passed. Text layout completed in 23.2 s under its unchanged 30 s test limit, after timing out in the contended full run; `authorization-last-failures-recheck.json`. |
| `npm run sdk:build` | Passed in the clean detached delivery checkout, through `scripts/use-framework.mjs`; `authorization-shared-head-adoption.log`. |
| SDK package / independent packed consumers | The recovery batch passed 91/92 tests across 8 files. Its sole failure was the strict browser export inventory missing the two newly approved SCAuthorization exports. The corrected packed export check passed; the failed external consumer then compiled, bundled and mounted successfully at `bcb8297` (1 passed, 8 deliberately unselected cases already passed in the earlier batch). The combined evidence covers all 9 package-test cases. See `authorization-package-recheck.json`, `authorization-packed-exports-recheck.log`, `authorization-sdk-consumer-final.json`. |
| Final shared-source delta | Browser-overlay, new counterpart and privacy-pane checks passed 11 tests at `b0bfc6a`; `authorization-shared-head-focused.log`. |

Earlier failed attempts remain visible: the initial six-file package attempt and the first site run encountered `ENOSPC`; a source-wide catalogue scan exceeded its five-second test deadline under contention, then passed all three cases with a longer runner timeout. A shared main-worktree SDK build hit `EPERM`, and the initially unreviewed FX artifact allowlist was repaired by the concurrent FX job (`89f4b74`). Clean checkout builds and the focused recovery runs replaced those failed attempts. No user's files or shared `node_modules` were deleted to recover space.

## Site delivery and live limits

The delivered framework source is `b0bfc6a7715844bd6a50f6194a40df1f556a9e64`, including the newer shared browser-overlay fix. Its archive is `aff87137ffafa10c04bcac4d27cb99fd737eb4fa947c282703558d43a5c4f881`. The framework was adopted from the prescribed clean detached checkout with a `node_modules` junction, and the script verified the archive and installed resource checksums.

After site commit `3dd6db0`, a concurrent job regenerated the package/vendor files again for the **same `b0bfc6a` source**, with archive `6b2d2400abfaac1bdf983ac13cee1c0cc4b9565b23647a89ddbcf10181f41ece`. Its source checksum matches the committed delivery. Those other-job changes were preserved, not staged or reverted. The actual installed dependency graphs and a fresh real location/pane interaction were checked against that variant; see `authorization-installed-passkey-exclusion.json`, `authorization-delivery-state.json` and the final desktop screenshot. The subsequent framework HEAD change was evidence only, with no shipped source delta.

Site typecheck passed. Full site checks retain three failures already present in independent earlier site evidence (`boundary-repair-site-full.json` and `faithful-site-full.json`):

- `tests/runtime/gallery-atmo-surfaces.test.tsx`: the owned window/document focus, minimisation, zoom and dirty-history case.
- `tests/runtime/publisher/product-controller.test.tsx`: replacing the image-popover anchor.
- The same Publisher file: replacing the publish-menu anchor.

The delivery run before the final shared-source delta was 398 passed / 3 failed tests across 61 files. The final shared-HEAD run recorded 390 passed / 3 failed assertions, plus one typography import failure during a concurrent SDK replacement (58 passed / 3 failed files). Its exact results are retained in `authorization-shared-head-site-tests.json` and `authorization-shared-head-results.json`. After re-adopting the verified archive, all eight typography tests passed; the final typography/profile/gallery batch passed 19 tests and site typecheck passed again (`authorization-site-final-recovery.json`, `authorization-completion-site-results.json`). No privacy/entitlement/profile site regression or unresolved import failure remained. The transient About failures in the first disk-affected run did not recur after the concurrent About changes landed.

The screenshot matrix and final live recheck are in `authorization-ui-results.json`. The final preview is on **5199**, from the named site worktree. Runtime loading and pane interaction reported no page, console or failed-network errors. Vite did emit URL-resolution warnings during dependency optimisation; no failed resource request was observed in the pane recheck. Port **5387** retained PID **69072**; 5173 and 5210 were not stopped or restarted.

The final receipt is committed in site `3dd6db0`. Junction cleanup is recorded in `authorization-checkout-cleanup.json`; the junction itself was deleted first, the real framework Vitest executable was checked, and only then was the temporary checkout removed. No branch was created or switched, no history was rewritten, and nothing was pushed. Temporary detached checkouts were used only for the expressly prescribed adoption/verification workflow. Other jobs' source, evidence and untracked preview configuration were preserved.
