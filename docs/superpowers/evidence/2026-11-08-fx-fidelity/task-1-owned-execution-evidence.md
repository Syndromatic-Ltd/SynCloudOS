# Task 1: exact owned execution context and NSE bridge

Base: `82a9357`. Scope: the neutral context primitive and NSE ownership/resource bridge. The mounted FX issuer and production callback/facade integration remain task 2.

The dependency-free neutral module keeps authentic opaque contexts and their process, copied symbol-port map, liveness checks and registration callbacks in a private WeakMap. The internal NSE and FX runtime contracts forward the same implementation. Synchronous entry restores its predecessor in `finally`, including explicit null entry, throws and Promise returns. Narrowing preserves the exact process and private ports, combines both signals and liveness checks, and uses the child registration route. Issuer inputs are validated before publication; callback identities are captured.

Real NSE scope identities receive one context attachment. Construction, `own`, and the private owner-callback entry use recorded scope identities. Application getters do not select authority. Unknown and deliberately unowned owners enter null. Explicit recorded owner signals can narrow authority; arbitrary owner getters supply teardown only. `addChild(Class)` and class presentation pass the recorded parent scope before derived field initializers execute. This keeps pending-self consumption, acquisition rollback and structural adoption independent.

`own<T extends object>` now preserves the exact synchronous returned object type while still excluding thenables. Runtime admission rejects primitives, unregistered plain objects, controllers and foreign/inactive registrations. Exact private registrations are admitted before reading public `dispose`; ordinary disposables still use a callable `dispose`. This supports Apple cleanup names such as `cancel` without a public alias. Existing disposable type aliases remain available to their internal consumers.

Resource registration has one idempotent cleanup wrapper. Parent/child signal abort, recorded owner cleanup and acquisition rollback all use it. Cancellation removes the abort listener and the recorded registration. Manual unregister removes those without invoking cleanup. Revocation during synchronous registration disposes once and removes the registration after its unregister callback becomes available.

Ordering is explicit: authority revocation immediately stops context-registered resources, before structural child/owner teardown. Ordinary NSE resources retain the existing child, owner, resources order. Both orders have regression coverage.

Verification:

- Initial test-first run: 18 failures and 2 passes, with missing issuer/bridge semantics. Later regression runs independently caught missing callback validation, immediate parent/child cancellation, synchronous-registration revocation and authority derived from an unrecorded owner's getter before their fixes.
- `npx vitest run tests/runtime/owned-execution-context.test.ts tests/runtime/nse-owned-factory.test.ts tests/runtime/nse-ownership.test.tsx --maxWorkers=1 --reporter=dot`: 3 files, 54 tests passed. The new file contributes 29 cases, including the public SDK symbol/declaration-surface and shared neutral implementation assertions.
- Framework `npx tsc -b --pretty false`: passed.
- Sibling site `npx tsc -b --pretty false`: passed against its existing dependency state.
- `node scripts/quality/architecture-boundaries.mjs`: passed, 1,617 files and 7,339 dependency edges.
- `git diff --check`: passed. C: free space remained above 234 GB.

Limits: native await, timers and raw React callbacks receive no automatic context propagation. A raw nested `new Child()` keeps the caller's active context for unwrapped field initializers; its recorded lifetime and `this.own` use the child's scope. Use the explicit framework class-construction boundaries or `this.own` for child-owned resources. This is SDK-private capability isolation, not a hostile-code sandbox for code sharing browser globals. No full suite, SDK build, packed-consumer test, browser runtime, server, branch, worktree, push, Fusion access or other FX-family implementation was part of task 1.
