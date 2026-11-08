# Task 2: exact application process and early construction authority

Base: `4722c02`. Scope: private process membership, mounted facade association, application/session construction, and the actual BundleLoader definition boundary. Dispatch, Network, general lifecycle/action/control callback wrapping, SDK packaging, and browser deployment remain later tasks.

## Ownership and admission

`applicationProcessAuthority.ts` keeps authentic records in WeakMaps keyed by runtime objects and exact process objects. Foreground membership is shared only for the current canonical registration authority and exact bundle. Membership release is idempotent; final release retires the process and removes its five event observers plus abort listeners. Runtime abort, manager/registration removal or replacement, bundle replacement, and accepted close revoke authority. A synchronous retirement guard spans both process and transfer revocation before closed state publication. A close veto preserves the process.

The mounted facade captures process identity, exact mount/process/runtime/bundle lifetime and its existing liveness validator. Device entitlement/privacy closures are unchanged. The private port map is intentionally empty at this stage. The facade-to-context WeakMap retains the original terminal association until GC, allowing departing presentation/control lookup to distinguish a revoked mount from a never-issued object. It cannot select a replacement context or mint authority.

Sessions now use `WeakMap<SynCloudOSRuntime, Map<appId, ApplicationSession>>`; diagnostic runtime IDs are not authority. Internal class lifecycle hooks receive the exact runtime separately from their unchanged public context. Session reuse validates captured execution authority, including a replacement whose event has not yet published. Old disposal deletes only its own map entry.

Application-services preparation precedes `new AppClass()`. A root NSE scope receives its context before field initialisers; explicit window and content-view construction inherits recorded parent scopes. Preparation validates responder ancestry, owns generation-aware handles, rejects duplicate/reentrant preparation, and rolls back only its own responder leases/membership. Borrowed application responders remain intact. Services and multiple presentation members share a process while preserving narrower owner lifetimes.

## Production-path corrections to the accepted preflight

The real `SynWareRuntimeMount` deliberately nulls the public `SynCloudOSRuntimeContext`. Consequently, its internal application root cannot obtain the kernel from that public context. A new private `ApplicationHostRuntimeContext` carries the exact runtime only to internal root/hosting code, including presented content; it is absent from public SDK exports. The public kernel provider remains null. The existing render fallback location is preserved, with exact canonical host input and closed/aborted admission guards. Real `createSynWareTestHost` rendering proves that app consumers still see null, while a StrictMode presentation-only render exercises fallback without a preceding lifecycle launch.

BundleLoader retains its exact optional runtime input. An actual runtime creates a separate handler/load process and dedicated responder, then narrower task contexts. Handler state is shared across task calls; each task retires on settlement. Load cancellation/replacement disposes the temporary class app even if its handler never settles, and late settlements remain observed. The explicitly events-only isolated loader continues to run pure callbacks under explicit null context; it cannot borrow application authority. A real closed or denied runtime never falls back to that isolated path.

The architecture policy classifies the two new private AppSDK modules as host code and admits only the exact process entry from runtime plus the pure definition lifecycle helper from host code. Other imports use existing sanctioned contracts. Public SDK symbol checks cover the new issuers, association, preparation, and private React context; no package entry was added.

## Integration correction to Task 1 cleanup reporting

Actual host tests exposed secondary constructor/resource cleanup errors discarded by `instantiateInOwnerScope` and `constructNSEOwnedResource` while preserving the primary exception. The controller explicitly authorised a narrow correction. A reporting-only helper looks up the authentic scope's captured parent context without acquiring live authority. Rollback finishes every cleanup, then reports each secondary aggregate through that captured parent under null execution, preserving the primary exception. A live ancestor retains its existing error aggregation policy. Standalone scopes without a host sink retain their prior behavior and never borrow an outer application's context.

The initial constructor and `own(factory)` host regressions failed because no secondary error reached the runtime reporter; both passed after the correction. Additional primitive regressions verify exactly-once cleanup/reporting, null reporting context, restoration of a different live outer context, and unchanged standalone behavior.

## Verification and limits

Test-first failures also identified missing early field authority, pre-client facade preparation membership leakage, background callbacks lacking ownership, a cancelled temporary class application remaining structurally alive, reentrant session reuse during accepted close, and session reuse before replacement event publication. The broader interaction regression caught a changed revoked colour-panel error message; the existing facade check precedence was restored before the process validator.

Existing mixed line endings were preserved on an explicit owned path list using baseline line-byte matching. Every conversion asserted identical normalized bytes; unchanged lines retain baseline bytes. Root PLAN/REPORT/design and unrelated evidence were not staged.

Final command outcomes are recorded after the last source change below. No full suite, SDK build, packed consumer, browser/device, server, port, branch/worktree, push, Fusion, or other FX-family work was performed. Physical device/GPU, WebKit, raw callback propagation, and packaging acceptance are not claimed by this stage.

- Final related run: **18 files, 251 tests passed**, including all migrated existing test files, 24 new actual-host/background cases, the 68 primitive/NSE cases (65 existing plus three new rollback cases), and 36 architecture-policy tests. This is one unique run, not a sum of overlapping passes. Command and output: `task-2-host-final.log`.
- The focused cleanup integration pass before the last session validator regression: **4 files, 91 tests passed**, recorded in `task-2-cleanup-integration.log`.
- Framework `npx tsc -b --pretty false`: passed after the last source change (`task-2-framework-typecheck.log`).
- Sibling site `npx tsc -b --pretty false`: passed against its existing dependency state after the last source change (`task-2-site-typecheck.log`).
- `node scripts/quality/architecture-boundaries.mjs`: passed; **1,621 files, 7,374 edges** (`task-2-architecture.log`).
- `git diff --check`: passed. C: free space remained over **234 GB**. No root/source overlap was staged; the branch remained `fix/blind-rewrite-friction`.

The full final test command was:

```text
npx vitest run tests/runtime/application-fx-execution-context.test.tsx tests/runtime/nse-application.test.tsx tests/runtime/application-authoring-6e-host.test.tsx tests/runtime/nse-controller-ownership-hardening.test.tsx tests/runtime/class-session-operation-lifetime.test.tsx tests/runtime/synapp-production-entry-host.test.tsx tests/runtime/application-inline-view.test.tsx tests/runtime/class-logout-session.test.tsx tests/runtime/managed-observation.test.ts tests/runtime/nse-preference-session.test.tsx tests/runtime/nse-window-controller-class.test.tsx tests/runtime/mounted-app-policy-authority.test.ts tests/runtime/mounted-app-interaction-authority.test.tsx tests/runtime/mounted-runtime-dom-ownership.test.tsx tests/runtime/owned-execution-context.test.ts tests/runtime/nse-owned-factory.test.ts tests/runtime/nse-ownership.test.tsx tests/runtime/architecture-boundaries.test.ts --maxWorkers=1 --reporter=dot
```
