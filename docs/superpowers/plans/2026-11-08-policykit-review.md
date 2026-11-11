# PolicyKit efficacy review and approved replacement

Review baseline: framework `98d7995`, 7 November 2026. Line references below refer to that revision. The owner approved the split on 7 November; the older proposal banner in the capability plan is superseded by its decisions and the task instruction.

## Verdict

**PolicyKit is not a security boundary against code running in the page.** It is a cooperative application/runtime authorisation layer. Applications, runtime, login snapshot, persistence and browser adapters share a JavaScript realm and origin. Page code can call browser APIs directly, alter local storage, or use a leaked host runtime. Renaming this code cannot provide process isolation. Browser secure-context, Permissions Policy and native permission prompts remain browser-enforced boundaries. A server must authenticate and authorise every protected resource independently.

The useful existing protection is narrower: mounted app projections do not expose the host evaluator, and request `subject`, `origin` and `source` do not confer authority. Instance-bound WeakMap grants do. See `PolicyKit.ts:219-254,690-724` and `tests/runtime/policykit-subject-grants.test.ts:50-116`. These protections must survive.

## What the server actually enforces

`src/SynCloudOS/Server/Auth/handler.ts:130-145` reads an opaque cookie through a hashed server-side session, checks expiry and parses server-stored roles. `:168-210` consumes the browser-bound OIDC transaction, validates the provider response, applies admission and creates a fresh session. `:238-250` checks request origin for mutations, authenticates the cookie and checks a resource permission before invoking the handler. `admission.ts:24-31` requires a verified allowlisted email. No browser evaluator decision or browser role is accepted by this path.

The site's `../site/worker/index.ts:48-60` sends `/auth/*` to that handler and `/api/*` through `protect("api.access", ...)`. Everything else is an asset request. App visibility, login-required routes, entitlements, device permission and diagnostics are **not** enforced by this worker. Static bundles must contain no secrets, even if their launcher is hidden. The site profile's founder email/role mapping is a presentation policy, not server authority.

Existing proof: `tests/runtime/auth-backend.test.ts:225-364` covers session hashes, expiry, logout, transaction binding/replay, signature/issuer/audience/nonce rejection, admission, direct API 401/403 and cross-origin mutations. There is no existing test claiming client app visibility protects downloaded assets; it does not.

## Real weaknesses and required repairs

| ID | Concrete failure at baseline | Existing proof? | Replacement and regression proof required |
|---|---|---|---|
| R1 | `PolicyKit.ts:623` allows unknown actions with no requirements. A misspelt privileged action is allowed. | No negative unknown-action test. | Configuration evaluator denies unrecognised actions; named rights reject unknown rights. Explicit capability-bearing extension actions remain possible. |
| R2 | Request `accessMode` overrides boot policy (`:483,517`); developer-origin display bypass (`:300-310,542-544`); `runtime.inspect`, mutation, diagnostics, display and external-route early returns skip some/all collected roles, access classes, capabilities or login requirements (`:546-584`). External app routes return before app login/role checks (`:586-588`). | Subject metadata spoofing is tested, these early-return combinations are not. | Host owns access mode; all declared requirements run before action-specific rules; no diagnostic-origin bypass. Matrix tests cover every branch and protected external apps. |
| R3 | A registered callback can turn a hard deny into allow, change action/resource/subject in the retained decision, or throw before audit (`:626-656`). | Positive callback override tests exist; no monotonic-denial/error test. | Registered restrictions can only narrow permission; exceptions deny and are audited; preserve engine decision identity and trace. |
| R4 | `dispose()` clears policies/capabilities but leaves grant WeakMap live; `authorise/evaluate` do not check disposed (`:762-773,870-875`). A retained system grant can still authorise. | Revocation/foreign-instance tests exist; disposed evaluator test absent. | Revoke all grants and fail closed after disposal. |
| R5 | `requiredBundlePermissions` exists (`policyTypes.ts:65`) but is never evaluated. Bundle permissions mix device declarations and site roles. `mountedLocationClient.ts:51-54` repeats declaration and role checks on every call instead of validating an immutable launch entitlement set. | Individual mounted-device denial tests exist; no required-declaration launch test. | `Info.ts.entitlements`, immutable admission at launch, required entitlements checked before application code. Remove old manifest key, migrate declarations and consumers. |
| R6 | Device access is granted through role capabilities (`mountedLocationClient.ts:54,90`); no shared per-app privacy decision, persistence, revocation or Privacy & Security UI. Browser location status knows nothing about another app's consent. | Browser status, adapter denial, cancellation and lifecycle tests exist. Cross-app consent/revocation tests absent. | One runtime-owned privacy store, scoped by user/app/service; passive status never prompts or grants; browser denial always wins; requests record success/denial; revocation cancels live resources and stale in-flight results. Per-FX status/request paths use it. |
| R7 | Plugin registration with no caller options manufactures a system grant (`PluginRegistry.ts:44-47,89-92`), so an anonymous host caller can register. The overload does not recognise `subjectGrant` alone (`:35-38`). | `policykit-subject-grants.test.ts:119-139` actually expects implicit elevation. | `SCAuthorization` named `plugin.register` right checked against current subject unless the host explicitly supplies an issued grant; no ambient elevation. Update the test to reject anonymous registration. |
| R8 | Audit is a bounded in-memory diagnostic log, not a durable security log. `authorise` audits; `evaluate/explain` do not (`PolicyKit.ts:762-784`). Notification delivery uses `evaluate` (`Runtime/createSynCloudOS.ts:622`). Context strings are copied (`PolicyKit.ts:317-338`) including possible tokens. | Audit bounds/copy isolation tested; evaluation omission explicitly tested. No secret-redaction test. | Keep dry-run explanations explicit, use audited decisions at enforcement sites, redact sensitive context keys and URL credentials/query values. Document retention and trust; never describe this as tamper-proof server audit. |
| R9 | All decisions, role/profile mutation, identity projection and grants are in the page (`Runtime/createSynCloudOS.ts:363-364,442-447`, `Identity/Identity.ts:40-63`). Browser checks cannot protect server data or static assets. | Server direct-access tests exist, but the threat boundary is not reflected in product claims. | Remove security-boundary claims, document cooperative trust and server enforcement; retain/add tests proving forged browser claims do not authorise server requests. True untrusted-code isolation would require a separate origin/process and is outside this approved split. |

## Audit content and limits

Each enforced decision records action, allow/deny, reason, timestamp, subject role/id, session authorisation, access class, app/route/href, origin/source, matched/missing capabilities/roles/classes and evaluation trace (`PolicyKit.ts:465-510`). Context retains up to twenty summarised values, with strings cut to 120 characters. `Diagnostics/runtimeDiagnostics.ts:97-110` retains at most 200 decisions / 512 KiB by default and projects oversized traces. Inspection returns copies; `clearAuditLog` can erase the log. It records attempted checks, not browser calls which bypass the framework, server decisions, hardware activity or proof of user identity. The replacement must retain useful diagnostics while removing secrets and describing these limits honestly.

## Execution order

1. Commit this review and baseline evidence; add failing regressions for R1-R4, R7-R8.
2. Make the small shared Info.ts schema change separately; migrate declarations and launch admission (R5).
3. Move site profiles/evaluator and introduce named rights; migrate all callers with no old-name exports.
4. Add shared privacy store and mounted FX integration, then Privacy & Security using existing NSE controls (R6).
5. Add opt-in AuthenticationServices passkeys and the optional system sign-in provider. Server verifies credentials; client success never establishes a system session on its own.
6. Run focused and package checks, adopt framework HEAD into site using the expressly authorised temporary detached adoption checkout, capture every added UI, run serial full suite and report residual limits.

No owner decision blocks the approved split. Compression naming belongs to another job. Passkey relying-party deployment/credentials are opt-in host configuration, not required to ship the API or turn it on for Syndromatic.

## Closing evidence added during implementation

The implementation also reproduced two follow-on gaps rather than treating a rename as a repair: named-right validation initially accepted known non-right configuration actions, and distinct authenticated principals sharing a displayed email initially retained the same device scope. `sc-authorization.test.ts` now rejects configuration actions as rights. `privacy-session-integration.test.ts` proves canonical subject/session invalidation and separate consent for distinct principals sharing an email, while retaining saved consent when only the session changes for the same principal.

The notification bridge has matching canonical ownership and pending-registration regressions. `auth-backend.test.ts` additionally proves that system-role/capability claims in headers, query parameters and JSON cannot authorise a protected server handler, with or without an authenticated reader's real cookie. Existing lifecycle fixtures now declare public access independently of entitlements and supply explicit plugin authority; the share regression retains a private-app denial.

The baseline references above remain pinned to the reviewed revision. The final commit inventory, weakness-to-test mapping, live screenshots, full-suite outcome and remaining trust/acceptance limits are in `../evidence/2026-11-07-foundation/authorization-report.md`.
