# Cocoa-style SynWare Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task after explicit implementation approval. Subagent-driven development is an alternative only when the user authorizes delegation. Steps use checkbox syntax for tracking. Do not execute this document during the planning-only task.

**Goal:** Reduce repeated SynWare connection/lifetime code through Cocoa-style classes, typed bindings and descriptors, while preserving every admitted application's functionality, visuals and FX behavior.

**Architecture:** Extend the existing NSE/SDK/AFX owners and React hosts. Preserve runtime, documents, commands, permissions and rendering authorities. Add safe construction, scoped async work, editor bindings, declaration metadata and shared rendering lifetimes, then migrate applications individually through an installed SDK.

**Tech Stack:** Approved compiler baseline TypeScript 6.0.3, React 19, patched Vite 7 and Vitest 4, with standard decorators throughout. Bun/React 19.3/Vite 8/Vitest 5 remain proposed coordinated upgrades. Native TypeScript 7/API work is a separate deferred phase in the [modernization plan](modernization-implementation-plan.md).

## Global constraints and execution context

- Planning baseline F: `C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/framework`, branch `dev`, commit `a916cea4465d2b2d5ef56b49717b231da6ea02b8`.
- Planning baseline S: `C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/site`, branch `feature/webspring-experiments-folder`, commit `9a78fd30f6b2cab61fcf469a72c37c08ae202b23`.
- S archive SHA-256 `29723f3bc79b14856368514429afe57cf6dc88e9a3d1dff817ea4b42673dede4`; source fingerprint `6735bb3fb73e52dcb8d909144d0b8e7f3516a46f9b05ef0f0885d05435131467`.
- Use patched Node 24.22.1 or a later reviewed supported security release for baseline work. Each checkout uses its own dependencies. Until M02, reproduce with `npm.cmd ci --ignore-scripts`; after the reviewed Bun cutover use `bun install --frozen-lockfile --ignore-scripts`. Do not junction node_modules or alias sibling source.
- Apply the [modernization design](toolchain-modernization.md) and M00-M08 plan alongside these packages. M00 security and P00 repairs precede broad changes; M03A establishes approved TypeScript 6.0.3; M02/M04/M05 establish their separately admitted toolchain behavior. Complete-performance gates remain required; optional M03B native/compiler API work does not block the approved 6.0.3 authoring baseline.
- Read [design](design.md), [application matrix](app-migration-matrix.md) and [research/baseline](research-and-baseline.md) before the first package. The design defines the exact contracts consumed below.
- Classes, decorators, bindings and TSX are the approved direction. Individual new API shapes remain proposed until this handoff is approved. Do not begin implementation merely because this file exists.
- Preserve dirty/staged/untracked work; stop before overwriting concurrent edits. Use an approved isolated pair for execution if other work is active. Do not change another checkout's branch or active preview.
- Preserve identities, routes, query types, preferences/data formats, authentication, permissions, service tokens, control semantics, documents/history, accessibility, responsive layouts and existing visual/FX quality.
- Application behavior belongs in classes/domain owners. Pure React presentation, measurement, refs, effects and function components remain supported. No mandatory conversion of every local visual hook.
- New decorators: preference, outlet, observes. Preserve observe utility and observable/action conventions. No legacy-decorator mode, emitted interface metadata, proxy-based deep reactivity or renderer replacement.
- No public app-specific helpers, no revived public NSEEditor/vendor contract, no Publisher/Journal policy in the framework. No push, merge, release, deployment or production publish action.
- Local commits may be proposed per accepted package during implementation. Planning creates no commits. Serialize framework packaging and installation.

## Commands and baseline

Commands below are future gates unless a row explicitly records a fresh result. Run them from the indicated checkout. A listed command is not evidence it passed.

The npm spellings reproduce the original baseline. After M02, package scripts use `bun run`; retain the focused Vitest `test` script accepting file arguments as well as M06's aggregate `test:all`. Replace `npm.cmd test -- <files>` with `bun run test <files>`, `npm.cmd exec -- vitest run <files>` with `bun run test <files>`, and `npm.cmd run <script>` with `bun run <script>`. P09 supplies `typecheck:authoring` for its new fixture. TypeScript 6.0.3 retains the current JavaScript compiler entrypoint/API; native process changes belong only to deferred M03B. External npm-installed consumer verification remains intentional.

| Location/purpose | Command | Required result |
| --- | --- | --- |
| F ownership baseline | `npm.cmd test -- tests/runtime/nse-control-controller-ownership.test.ts tests/runtime/nse-controller-lifecycle.test.ts tests/runtime/nse-view-controller.test.tsx tests/runtime/application-actions.test.tsx` | Fresh planning result: 94 passing tests; preserve all |
| S class baseline | `npm.cmd exec -- vitest run tests/runtime/journal-class-controller.test.tsx tests/runtime/publisher/publisher-class.test.tsx` | Fresh planning result: 4 pass, 7 fail; P00 resolves causes |
| F typecheck | `npm.cmd run typecheck` | exit 0, no diagnostics |
| F new type fixture | `npm.cmd exec -- tsc -p tests/types/tsconfig.authoring-6e.json --noEmit` | exit 0; every expected error still triggered |
| F existing type fixtures | `npm.cmd run typecheck:contracts` | exit 0 |
| F SDK build | `npm.cmd run sdk:build` | archive created, correct exports/assets/workers |
| F installed consumer | `node scripts/synware/installed-consumer.mjs --check-package` | exit 0 using packed archive |
| F all deterministic FX | `npm.cmd run fx:installed` | exit 0; twelve retained products checked |
| F architecture | `npm.cmd run boundaries:architecture` | exit 0 or explicit pre-existing inventory before broad work; no new violation |
| S install exact F | `npm.cmd run framework:sync -- 'C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/framework'` | immutable archive/receipt/install agree; no source alias |
| S typecheck/boundaries | `npm.cmd run check` then `npm.cmd run check:boundaries` | each exit 0 |
| S all tests | `npm.cmd test` | all existing/new tests pass, no skips introduced |
| S production compile | `npm.cmd run build` then `npm.cmd run build:cloudflare` | both exit 0, no deployment |
| Either source hygiene | `git diff --check` | exit 0 |

The F/S root scripts were inspected. P09 adds the new type fixture to the existing check command after it exists. Do not run future filenames before the package that creates them and interpret no-tests-found as success.

At the start of every package run `git status --short` and `git rev-parse HEAD` in each affected repository, followed by the corresponding drift check below. Narrow the path set to the package's listed files when inspecting the diff. Read any changed source before continuing. New unrelated failures, incompatible API assumptions or an unapproved scope expansion are stop conditions; do not weaken tests or broaden a private API to keep moving.

```powershell
# F
git diff --stat a916cea4465d2b2d5ef56b49717b231da6ea02b8..HEAD -- src/NSE src/SynCloudOS/AppSDK src/FX scripts/synware tests docs
# S
git diff --stat 9a78fd30f6b2cab61fcf469a72c37c08ae202b23..HEAD -- src/SynWare src/Integrations tests scripts docs
```

## P00. Establish and repair the existing class-host baseline

**Priority/risk:** prerequisite; high integration risk. **Produces:** a proven existing feature baseline and precise root-cause notes before refactoring.

**Files:** inspect F `src/SynCloudOS/AppSDK/testing/createSynWareTestHost.tsx`, `testHostTypes.ts`, `applicationHosting.tsx`, `applicationSession.ts`, `actions.ts`; S `tests/runtime/journal-class-controller.test.tsx`, `tests/runtime/publisher/publisher-class.test.tsx`, Journal detached-note/projection files and Publisher region/action files. Modify only a demonstrated cause and its regression. Source of failure is not preassigned to the app or test host.

Current excerpts:

```ts
// S/tests/runtime/publisher/publisher-class.test.tsx:70
expect(await host.appContext.commands.dispatch("com.syndromatic.journal-publisher.openPost", "post"))
  .toMatchObject({ status: "executed" });
// S/tests/runtime/journal-class-controller.test.tsx:87
await expect.poll(() => host.application?.windows.some(candidate =>
  candidate instanceof JournalDetachedWindowController)).toBe(true);
```

- [ ] Reproduce the eleven cases with the exact baseline command. Record the seven failures and `act` warnings, current package receipt and whether each failing assertion reaches its intended feature.
- [ ] For Publisher, compare root/window/region action registration, focused responder and mounted-surface IDs between the test host and real browser path. Verify when commands become available; inspect the unknown-command result and the template candidate validation. Do not replace dispatch with a direct method call to pass the tests.
- [ ] For Journal, trace the clicked entrypoint through canonical action dispatch, projection admission, app.openWindow and rendered secondary-controller association. Inspect close/restoration and document ownership before changing a poll timeout.
- [ ] Add a failing narrow regression in F if the failure is a host/runtime contract, or S if application-owned. Keep the original feature assertions. A regression must distinguish a missing registration from delayed readiness and from wrong app/window authority.
- [ ] Implement only the proven repair, rerun both original S files plus the narrow F regression, then the 94-test F baseline. Wrap genuine test-driven updates in the correct act scope; do not globally suppress warnings.
- [ ] Run S check/boundaries and record remaining broader failures with causes. Before feature migrations, all eleven focused S cases must pass. Broader pre-existing failures must have an explicit repair owner and must not disappear through filtering.

**Exit:** both S class files green with original feature assertions; F ownership/action baseline retained; root causes documented. If P00 requires an unrelated document-engine redesign or a new public API, stop and revise the scoped repair before proceeding.

## P01. Add safe construction and lifetime epochs

**Consumes:** existing NSEOwnershipScope/NSEObjectLifetime, controller disposal reasons, committed view mounting. **Produces:** `own(factory)`, parameterized `addChild`, internal owner/mounted/visible authority epochs and public mounted view signal.

**Modify F:** `src/NSE/Controllers/ownership.ts`, `src/NSE/Application/objectLifetime.ts`, `NSEApplication.ts`, `NSEWindowController.ts`, `NSEViewController.ts`, `src/SynCloudOS/AppSDK/applicationHosting.tsx` and existing lifecycle contracts only where a new typed error requires it.
**Create F:** `src/NSE/Application/ownedFactory.ts`, `src/NSE/Application/viewActivity.ts`, `tests/runtime/nse-owned-factory.test.ts`, `tests/runtime/nse-view-activity.test.tsx`.
**Existing tests:** controller ownership/lifecycle/view-controller/window-class/application ownership suites.

Regression example for the new factory file (imports are source-relative from tests/runtime):

```ts
import { describe, expect, it } from "vitest";
import { NSEArrayController } from "../../src/NSE/Controllers/NSEArrayController";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";

describe("owned construction", () => {
  it("owns a controller constructed after await", async () => {
    const owner = new NSEViewController({ owner: nseUnowned });
    await Promise.resolve();
    const rows = owner.own(() => new NSEArrayController<{ id: string }>({ id: "late", getId: row => row.id }));
    owner.dispose();
    expect(rows.isDisposed).toBe(true);
  });
  it("does not evaluate a factory after owner disposal", () => {
    const owner = new NSEViewController({ owner: nseUnowned });
    owner.dispose();
    let calls = 0;
    expect(() => owner.own(() => { calls++; return { dispose() {} }; })).toThrow();
    expect(calls).toBe(0);
  });
});
```

- [ ] Write and run the new tests first. Extend them for nested scopes, synchronous throw rollback, reentrant disposal, duplicate registration, async-result rejection, explicit different owner rejection and no global ambient leakage after factory return.
- [ ] Implement a synchronous ambient-owner operation separate from framework pendingSelf. Save and restore both slots in finally; use a per-call acquisition journal for rollback. `own` checks live state before evaluation, registers plain disposables once, and delegates already-owned NSE data controllers without duplicate disposal.
- [ ] Reject application/window/view-controller factory returns and clean their acquisitions. Direct authors to `openWindow` or `addChild(Class, ...args)`; those construct a fresh self scope. Extend addChild's constructor tuple overload and preserve the existing instance overload.
- [ ] Test a parameterized child with its own array controller: removing the child disposes its array while a sibling and the parent remain alive. Test constructor throw and parent disposal during construction. This verifies real nested ownership, not just an error disappearing.
- [ ] Introduce private per-owner/view activity epochs. Revoke authority at the beginning of disposal; preserve existing teardown reasons/order. Normalize StrictMode replay using the existing detach token rather than treating it as a fresh visibility epoch.
- [ ] Integrate browser/application activity and animation environment signals in the mounted host. Test two runtimes, an unrelated function app with supported owned hooks, suspension, document-hidden, actual unmount/remount and no duplicate listeners. Use real page-state adapters/fakes already supplied by the runtime.
- [ ] Run `npm.cmd test -- tests/runtime/nse-owned-factory.test.ts tests/runtime/nse-view-activity.test.tsx tests/runtime/nse-control-controller-ownership.test.ts tests/runtime/nse-view-controller.test.tsx tests/runtime/nse-window-controller-class.test.tsx`, then F typecheck/diff check. Update applications guide with supported examples; propose one local commit.

**Exit:** factories never run for dead owners; after-await ownership and nested containment are correct; existing React/explicit-owner forms still work. Stop if a solution requires browser AsyncLocalStorage, a global owner across await, or silently assigning raw unowned controllers to the current app.

## P02. Add inspectable owner-bound tasks

**Consumes:** P01 authority epochs and synchronous factory construction. **Produces:** `managedTask`, `NSEManagedTask`, context/run/settlement/snapshot types exactly as design section 5.

**Create F:** `src/NSE/Tasks/taskTypes.ts`, `managedTask.ts`, `index.ts`, `tests/runtime/nse-managed-task.test.ts`, `tests/runtime/nse-managed-task-activity.test.tsx`.
**Modify F:** authoring exports and test-only clock/activity adapters where necessary; reuse runtime scheduler/error diagnostics.

Regression body, inside the task test file with the same owner fixture as P01:

```ts
import { expect, it } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { managedTask } from "../../src/NSE/Tasks/managedTask";

it("refuses a stale result from work that ignores abort", async () => {
  const owner = new NSEViewController({ owner: nseUnowned });
  const resolve: Array<(value: string) => void> = [];
  const applied: string[] = [];
  const task = managedTask(owner, {
    lifetime: "owner", policy: "latest",
    run: () => new Promise<string>(done => resolve.push(done)),
    apply: value => { applied.push(value); },
  });
  const first = task.run(undefined);
  const second = task.run(undefined);
  await Promise.resolve();
  resolve[1]("new");
  expect(await second.finished).toEqual({ status: "succeeded", value: "new" });
  resolve[0]("old");
  expect(await first.finished).toMatchObject({ status: "cancelled", reason: "superseded" });
  expect(applied).toEqual(["new"]);
  owner.dispose();
});
```

- [ ] Add the stale-result regression plus owner-close-before-start, close-after-await, failed promise, synchronous throw, refused commit, run-owned resource cleanup, already-inactive epoch and serial ordering/overflow cases. Use the supplied clock instead of real sleeps.
- [ ] Implement admission: capture owner/epoch/run generations; for latest, cancel older handles and debounce one queued start; for serial, admit FIFO up to maximumQueued. An inactive run gets a cancelled handle without invoking app code.
- [ ] Implement signal composition, deterministic settlement and error reporting. Attach rejection handlers immediately, keep finished non-rejecting, and prevent a late old error from replacing a current success. Do not register cancellation as an operation failure.
- [ ] Implement guarded synchronous `context.commit`, `context.own` and optional `apply`. Check authority before the callback/factory, reject thenables, and recheck before task publication. Release run-owned resources at settlement; promote intentionally controller-owned resources only through owner.own inside a live commit.
- [ ] Expose stable immutable snapshots with revision/pending/value/error. Keep the last successful value during a newer pending run. Preserve unknown errors without turning them into fake success values.
- [ ] Run `npm.cmd test -- tests/runtime/nse-managed-task.test.ts tests/runtime/nse-managed-task-activity.test.tsx tests/runtime/nse-owned-factory.test.ts`; F typecheck/diff check. Document that arbitrary JS and committed network effects cannot be forcibly cancelled; propose one local commit.

**Exit:** cancelled work loses framework publication authority even when abort is ignored; no owner leaks or unhandled promise rejection. Stop if implementation waits indefinitely for an uncancellable promise during app quit or automatically debounces write/share actions.

## P03. Host inline class TSX and reduce empty window wrappers

**Consumes:** P01 lifetimes and existing application/window pipeline. **Produces:** optional renderView, typed viewDependencies, mainViewController and contentViewControllerClass.

**Modify F:** `src/NSE/Application/NSEApplication.ts`, `NSEViewController.ts`, `NSEWindowController.ts`, `src/SynCloudOS/AppSDK/applicationClass.ts`, `applicationSession.ts`, `applicationHosting.tsx`, `applicationHotReload.ts` and export entries.
**Create F:** `tests/runtime/application-inline-view.test.tsx`, `tests/runtime/application-view-dependencies.test.tsx`.

Target fixture shape:

```tsx
class InlineController extends NSEViewController {
  @observable accessor title = "Original";
  renderView() { return <h1>{this.title}</h1>; }
}
class InlineApplication extends NSEApplication {
  static mainViewController = InlineController;
}
```

- [ ] Render the fixture through the existing class test host, change title under act, and verify one mounted view updates. Add definition errors for both render forms, both main declarations, and conflicting content declarations.
- [ ] Extend class interfaces and definition validation before session construction. Synthesize the standard main window through the existing window class/admission/restoration path, preserving manifest defaults and app/window responders. Keep custom secondary controllers distinct.
- [ ] Add a small function host for renderView, preserving hook rules, mounted traits, ref commit order and action scopes. The method must not become a React class component or be called from a lifecycle side effect.
- [ ] Implement viewDependencies aggregation with a single fixed hook topology. Normalize sources, deduplicate identities, preserve stable snapshots and subscribe only after commit. Test replacement of a source, no rerender for unchanged snapshots, region isolation and actual unsubscribe.
- [ ] Test existing function exports and static function views inside a class app, including a local useState/useLayoutEffect child. Do not call hooks from renderView itself.
- [ ] Run `npm.cmd test -- tests/runtime/application-inline-view.test.tsx tests/runtime/application-view-dependencies.test.tsx tests/runtime/nse-application.test.tsx tests/runtime/nse-window-controller-class.test.tsx tests/runtime/application-module-definition.test.ts`; F typecheck/diff check; propose one local commit.

**Exit:** shortcuts preserve real windows and ownership; no synthetic app IDs or dropped lifecycle guards. Existing function/static-view authoring remains supported.

## P04. Implement binding values and editor leases

**Consumes:** P01 ownership, existing controller/document transaction and formatter contracts. **Produces:** NSEBinding types, bind, createNSEBinding, public useNSEBinding adapter and shared internal control adapter.

**Create F:** `src/NSE/Bindings/bindingTypes.ts`, `propertyBinding.ts`, `createNSEBinding.ts`, `useNSEBinding.ts`, `index.ts`, `src/NSE/Controls/Core/useNSEValueBinding.ts`, `tests/runtime/nse-bindings.test.ts`, `tests/nse/controls/nse-bound-values.test.tsx`.
**Modify F:** `src/NSE/Controls/Core/controlTypes.ts`, `Controls/Fields/NSEFields.tsx`, `NSEFieldVariants.tsx`, `NSESearchField.tsx`, `NSESecureTextField.tsx`, `NSEPasswordField.tsx`, `Controls/Buttons/NSEButtons.tsx`, `Controls/Values/valueControlTypes.ts`, `NSESlider.tsx`, `NSECircularSlider.tsx`, `NSEStepper.tsx`, `NSESegmentedControl.tsx`, token/completion and existing picker families, and corresponding public exports. Follow the actual props declarations rather than assuming all controls use the same old callback signature.

Regression fixture and interaction:

```tsx
class BoundController extends NSEViewController {
  @observable accessor query = "";
  renderView() {
    return <NSESearchField aria-label="Search" binding={bind(this, "query")} />;
  }
}
// In an existing class-host test fixture:
fireEvent.change(screen.getByRole("searchbox"), { target: { value: "receipts" } });
expect(controller.query).toBe("receipts");
expect(bind(controller, "query")).toBe(bind(controller, "query"));
```

- [ ] Add failing primitive-binding and editor-lease tests for two controls sharing a value, equality suppression, lifetime end, cancel-versus-external-update and descriptor identity. Add explicit adapter tests for invalid commits, mixed/empty/unavailable selection and one canonical undo group.
- [ ] Implement stable descriptor caches and selected-property revision checks without subscriptions during render or deep proxies. Define property binding as continuous UI state, and transactional adapters as explicit begin/preview/commit/cancel delegates.
- [ ] Integrate `useNSEBinding` leases into the shared control adapter. A lease owns draft/format/composition state and rejects a late commit after unmount or source replacement. Use existing Formatter and ControllerValidationIssue types.
- [ ] Add a binding-only props branch excluding value/defaultValue/mutating callbacks/second undoManager. Preserve the existing callback/uncontrolled branch. Reject ambiguous JS combinations with a clear definition error instead of silently choosing one.
- [ ] Integrate fields/search first, then buttons/selection, then value controls and pickers/completion. Retain recents, native forms, keyboard actions, aria state, detents and feedback. Test search IME and exactly one debounce path. Preserve slider drag grouping and cancel behavior.
- [ ] Add existing data-view selection adapters only where real Journal/Publisher/Gallery consumers need them, retaining controllers and virtualization. Do not add a generic new list abstraction.
- [ ] Run `npm.cmd test -- tests/runtime/nse-bindings.test.ts tests/nse/controls/nse-bound-values.test.tsx tests/runtime/nse-controls-interactions.test.tsx tests/nse/controls/nse-value-control-transaction.test.ts`; run affected field/selection/picker suites discovered through imports; F typecheck/diff check. Propose commits by coherent control family.

**Exit:** bindings preserve edit/undo/IME/focus semantics and old consumption forms. Stop if a binding needs to mutate workspace document snapshots directly or register a second history.

## P05. Add preferences, observations and restoration descriptors

**Consumes:** P01-P04, current preferences/SCOS context and navigation controllers. **Produces:** preference/outlet-independent observes decorators and reusable restoration.

**Create F:** `src/NSE/Objects/preference.ts`, `observes.ts`, `src/NSE/Navigation/navigationRestoration.ts`, `tests/runtime/nse-preference-accessor.test.ts`, `nse-observes.test.tsx`, `nse-navigation-restoration.test.ts`.
**Modify F:** `src/NSE/Objects/index.ts`, owner finalization hooks in applicationSession/applicationHosting, existing `NSEPreferencesController` only when its public adapter is insufficient, `NSETabBarController.ts`, `NSENavigationStackController.ts`, public exports and docs.

Fixture shape:

```ts
class PreferencesController extends NSEViewController {
  @preference("sidebar.visible") accessor sidebarVisible = true;
  @observable accessor query = "";
  readonly queries: string[] = [];
  @observes("query", { lifetime: "visible", initial: true })
  queryChanged(value: string) { this.queries.push(value); }
}
```

- [ ] Add tests before implementation: defaults and stored values, pre-hydration write precedence, invalid values, failed storage/no publication, equal echoes, two windows and two unrelated apps/runtimes. Structured settings require schema migration/newer-version non-overwrite cases.
- [ ] Implement primitive decorators with owner-injected app context and accessor-initializer defaults. Hydrate at the documented post-construction/pre-lifecycle point; never invoke per-app SCOS at module decoration time. Preserve declared keys exactly.
- [ ] Implement typed explicit schema descriptors as adapters to existing preference authority. Keep grouped settings drafts/undo in NSEPreferencesController; no second independent store for those fields.
- [ ] Implement observes metadata with direct property keys and typed source factories/projections. Subscribe at the requested epoch, deduplicate/coalesce changes, fence ended-epoch deliveries and fire initial at the specified lifecycle boundary. Test source replacement and external locale/provider changes.
- [ ] Add restoration adapters with explicit key/version/parser/capture/restore/migrations. Test tabs retitle without writes, invalid destination fallback, hierarchy path validation, explicit-route precedence and dynamic collection removal. Do not copy a stale snapshot into a second route store.
- [ ] Run `npm.cmd test -- tests/runtime/nse-preference-accessor.test.ts tests/runtime/nse-observes.test.tsx tests/runtime/nse-navigation-restoration.test.ts tests/runtime/nse-preferences-controller.test.ts tests/runtime/nse-navigation-controllers.test.ts`; F typecheck/diff check; propose one commit per contract.

**Exit:** preference writes are truthful, observation lifetimes deterministic, restoration schema preserved, existing observe utility unchanged.

## P06. Complete action declarations and typed connections

**Consumes:** canonical commands/responders/payload/undo authority. **Produces:** NSEActionReference, actionRef, typed useAction/control/menu/toolbar paths, options/result forwarding.

**Modify F:** `src/SynCloudOS/AppSDK/actions.ts`, its public entry exports, `src/NSE/Controls/Core/controlTypes.ts`, `useNSEControlAction.ts`, action-capable controls and existing menu/toolbar types/adapters.
**Create F:** `src/SynCloudOS/AppSDK/actionReference.ts`, `tests/runtime/application-action-references.test.tsx`, `tests/runtime/application-action-results.test.ts`.
**Retain:** `application-actions`, `portable-action-payload`, `application-action-registration-order`, modal/native-stage/window-responder and undo-ownership tests.

Target declaration/reference:

```ts
class ItemController extends NSEViewController {
  @action chooseItem(id: string) { return id; }
  validateChooseItem(id: string) { return id !== "forbidden"; }
}
const choose = actionRef(ItemController, "chooseItem");
```

- [ ] Write a test with child/window/app responders answering the same action identity. Send the typed reference from a control/menu and assert the focused responder wins; changing focus changes the winner. A reference must never call a captured instance directly.
- [ ] Add tests that preserve awaited primitive method results, route them through canonical command result admission, and register optional command undo once. Verify an already undoable document edit does not acquire a second undo registration.
- [ ] Extend NSEActionOptions generics with Result and the existing SynWareCommandUndoPolicy. Replace the hardcoded no-undo/result-discard adapter with the declared policy and actual return value, preserving defaults.
- [ ] Implement immutable class/method references from metadata with stable identity and HMR refresh. Infer method payload/result types; validate decorated status when preparing a reference. Extend useAction and action props with typed overloads while retaining meaningful dynamic strings.
- [ ] Keep portable payload validation and explicit mounted builders. Test invalid object/DOM/File/function payload rejection, async validator invalidation, different-app reference rejection, portal focus ancestry, reserved shortcuts, mixed state and localization.
- [ ] Run `npm.cmd test -- tests/runtime/application-action-references.test.tsx tests/runtime/application-action-results.test.ts tests/runtime/application-actions.test.tsx tests/runtime/application-action-registration-order.test.tsx tests/runtime/portable-action-payload.test.tsx tests/runtime/application-undo-ownership.test.ts`; F typecheck/diff check; propose a local commit.

**Exit:** a typed reference changes declaration typing only; all dispatch/validation/undo/authority remains canonical. No weakening of payload boundaries to make JSX shorter.

## P07. Add managed outlets and scoped AFX layer transactions

**Consumes:** P01 mounting, P03 pure rendering and existing AFX layers. **Produces:** outlet decorator/NSEViewOutlet and static AFXTransaction.perform.

**Create F:** `src/NSE/Application/viewOutlet.ts`, `tests/runtime/nse-view-outlet.test.tsx`, `tests/runtime/fx/animation-scoped-transaction.test.ts`.
**Modify F:** `src/NSE/Application/NSEViewController.ts`, `src/SynCloudOS/AppSDK/applicationHosting.tsx`, `src/FX/AnimationFX/AFXTransaction.ts`, root/NSE/FX public exports and animation docs. Keep FX -> NSE dependency direction absent.

Fixture shape:

```tsx
class OutletController extends NSEViewController {
  @outlet accessor artwork!: NSEViewOutlet<HTMLDivElement>;
  renderView() { return <div ref={this.artwork.ref}>Artwork</div>; }
}
```

- [ ] Test stable ref/handle identity, absent/current/element behavior, root commit order, conditional detach, replacement nodes, StrictMode replay, real remount and two-live-node rejection. A stale ref cleanup must not release a new element.
- [ ] Initialize accessor handles through standard decorators and attach only after DOM commit. Keep element/layer/signal getters mount-bound, current nullable, and optional declared actions reapplied on every genuine binding epoch.
- [ ] Use the mounted application's existing bindLayer and animation environment; preserve CSS layout/position/dimensions and canonical reduced motion. Ensure hidden/detached layers and old clients release before new bind.
- [ ] Test scoped transactions before implementation: nested inheritance/overrides, one commit on success and throw, invalid options before begin, thenable callback rejection, no action/no animation, disabled actions and explicit handles still working.
- [ ] Implement perform as synchronous validate/begin/configure/try/finally/commit over existing static layer transactions. Do not redirect to the existing instance animator-proxy run. No model rollback or implicit all-property animation promise.
- [ ] Run `npm.cmd test -- tests/runtime/nse-view-outlet.test.tsx tests/runtime/fx/animation-scoped-transaction.test.ts tests/runtime/nse-view-controller.test.tsx tests/runtime/fx/animation-layer-transaction.test.ts`; F typecheck/diff check; propose one commit per outlet/transaction unit.

**Exit:** mounting and actual visual layer behavior agree; repeated remount never reuses a revoked backing layer.

## P08. Integrate managed AFX renderers and preserve all twelve FX frameworks

**Consumes:** P01-P02 lifetimes/tasks, P07 outlets/AFX and current mounted animation client. **Produces:** `fx.animation.manageRenderer` with the exact observable/activity/frame contract in design section 10.

**Create F:** `src/NSE/Application/managedAnimationRenderer.ts`, `tests/runtime/nse-managed-animation-renderer.test.tsx`.
**Modify F:** `src/NSE/Application/viewControllerFX.ts`, `NSEViewController.ts`, `src/SynCloudOS/AppSDK/applicationHosting.tsx`, existing mounted animation clients only as needed; use the existing AFXRenderer rather than a second rendering backend.

Target usage:

```ts
const managed = this.fx.animation.manageRenderer(this.canvas, { maximumQuads: 4096 });
const sprite = managed.renderer.makeLayer();
sprite.opacity = 0.75;
const stop = managed.onFrame(frame => {
  sprite.opacity = 0.5 + Math.sin(frame.time) * 0.25;
}, { reducedMotion: "static" });
```

The frame example uses an existing animatable property. Actual sprites/particles/media keep their real content and authored simulation; a canvas renderer does not paint a contentless layer merely because opacity changes. The acceptance test supplies a real drawable image/particle fixture.

- [ ] Test viewport sizing at DPR 1/2 and zero size, one batched resize, visibility/suspension/tab-hidden behavior, reduced-motion modes, error/unavailable state, quotas, unmount/remount and detached-window clients. Assert observer and scheduler resource counts return to baseline.
- [ ] Add the animation client through the existing mounted host binding. ManageRenderer accepts a live canvas outlet from the same runtime/controller; reject cross-runtime or detached handles before acquiring a renderer. Cache by outlet and mount generation, not for the whole controller forever.
- [ ] Derive size from untransformed CSS layout and content-bound pixel ratio. Batch ResizeObserver updates, avoid write-measure feedback loops and wait at zero size. Preserve AFX backend/surface capability errors and maximumQuads.
- [ ] Use one shared activity owner for scheduling. Pause inactive views and reset delta on resume; preserve media timebase ownership. Implement static reduced-motion delivery without reducing authored quality. Dispose frame callbacks, renderer and observers at real unmount.
- [ ] Retain all existing controller FX clients and import paths. Add signal-combination tests for Motion/Location/Haptics/MIDI/Media/Video/Lumina projections and pure Graphics/Image/Text/Audio computations as appropriate. Permission-requiring work must remain explicit and user-activation aware.
- [ ] Run `npm.cmd test -- tests/runtime/nse-managed-animation-renderer.test.tsx tests/runtime/synware-fx-authoring.test.ts`; then F's existing affected FX lifecycle/layer/renderer/media tests, `npm.cmd run fx:installed`, typecheck/diff check. Record real GPU/media checks separately. Propose a local commit.

**Exit:** convenience removes lifecycle plumbing while preserving render quality, supported surfaces, media timing, cancellation and errors. Stop if the implementation needs a reduced-quality substitute for an existing effect.

## P09. Verify toolchain, public entries, HMR and installed authoring

**Consumes:** each preceding public contract. **Produces:** package-complete types/runtime/docs/scaffolds; this gate precedes any app migration and is repeated after later framework changes.

**Modify F:** `src/SynCloudOS/AppSDK/rootPackageEntry.ts`, `sdkPackageEntry.ts`, `src/NSE/sdkPackageEntry.ts`, `src/NSE/Application/index.ts`, FX public entries, `scripts/synware/sdk-entries.mjs`, `build-sdk.mjs`, `decorators.mjs`, `hot-applications.mjs`, `create-synware.mjs`, installed-consumer checks and `package.json` type fixture wiring only as required.
**Create F:** `tests/types/authoring-6e.test-d.ts`, `tests/types/tsconfig.authoring-6e.json`, a complete installed consumer fixture under `tests/fixtures/synware-authoring/6e`, and `tests/runtime/application-authoring-6e-toolchain.test.ts`.

Representative negative type assertions:

```ts
const query = bind(controller, "query");
const clear = actionRef(SearchController, "clearSearch");
// @ts-expect-error a missing member is not a binding target
bind(controller, "missingProperty");
// @ts-expect-error a real method name is required
actionRef(SearchController, "clearSerach");
```

Define the fixture's SearchController/query class in that same test file; do not depend on an application class in S. Add readonly-property, incompatible bound control value, wrong action payload/result, async owned factory, and ambiguous controlled-plus-binding props assertions. Use existing tests/types compiler configuration as the base, not a weakened isolated tsconfig that omits public declarations.

- [ ] Compile the type fixture before exporting completed contracts and observe the intended missing-API failures. Implement only documented public exports and accurate generic declarations; no private wildcard exports.
- [ ] Run decorated TSX in dev transform, Vitest, SDK build and an installed consumer on TypeScript 6.0.3. Preserve standard semantics through M04 if Vite 8 is adopted; replace the old esbuild/reactBabel implementation deliberately in that phase. No experimentalDecorators or emitted metadata is introduced. Add `typecheck:authoring` using the selected stable compiler.
- [ ] Add HMR signatures/refresh handling for renderView, dependencies and the new descriptors. Test method edits preserving state, descriptor/field changes relaunching only that app, and existing private-brand relaunch rules. Check old task/outlet callbacks cannot publish into a replacement epoch.
- [ ] Make the test host install identical action/FX/persistence lifetimes and focus ancestry as the browser. Retain P00's real command/window feature assertions; do not expose a production test bypass.
- [ ] Update scaffold and applications/controllers/commands/FX docs with both inline and separate-view patterns, React-local examples, explicit after-await ownership and cancellation limitations. Migrate any public example that now demonstrates an obsolete pattern.
- [ ] Run new toolchain tests, existing application hot reload/toolchain/test-host suites, F typecheck, both type fixture commands, SDK build and installed-consumer check. Run package omission and architecture checks. Build the archive once, then install it into S using framework:sync; compare package.json/lock/receipt/installed package provenance.

**Exit:** source, packed declarations and consumer runtime agree. No new public contract is declared complete solely because an internal alias-based test passes.

## P10. Migrate About, Software, Diagnostics and Chronosphere

**Consumes:** P03-P09 installed into S. **Produces:** four accepted app conversions to the new contracts, each with a preserved feature/authority ledger.

**Files:** exact existing edit scopes and tests are in the four named sections of [application matrix](app-migration-matrix.md). New tests: `tests/runtime/about-fx-lifetime.test.tsx`, `tests/runtime/chronosphere-class.test.tsx`. Do not edit authored content/assets/locales except to preserve an existing key lookup.

- [ ] For each app separately, record original class/state/resource tree, persisted keys, test results and desktop/compact screenshots from the matching archive. Count handwritten plumbing including app-local helpers.
- [ ] About: migrate page outlets, tab restoration, locale/selection observations and renderer/frame activity. Keep AboutParticleField and its geometry/motion. Use parameterized addChild classes so each page/scene owns its own resources.
- [ ] Software: replace restore/write/unsubscribe machinery with the validated navigation descriptor; preserve retitling, chapter actions and scroll/focus behavior. Choose mainViewController only after confirming the old window adds no policy.
- [ ] Diagnostics: replace refresh orchestration with an owner-lifetime latest task plus provider-revocation admission. Keep redaction/export validators, previous-snapshot-on-error behavior and existing section/outline controllers.
- [ ] Chronosphere: simplify only empty wrappers and action adapters. Preserve framework-owned archive behavior and authored history; do not create redundant app controllers for its internal timeline.
- [ ] Run each app's existing tests after its individual migration, plus the new tests. After the group run `npm.cmd exec -- vitest run tests/runtime/about-app.test.tsx tests/runtime/about-fx-lifetime.test.tsx tests/runtime/software-app.test.tsx tests/runtime/diagnostics-app.test.tsx tests/runtime/chronosphere-class.test.tsx tests/runtime/chronosphere-public-components.test.tsx`, S check/boundaries/build/diff check.
- [ ] Perform the matrix's browser cases; record actual appearance/motion deltas and unresolved risks. Propose app-scoped local commits only after each passes.

**Exit:** four app ledgers accepted; no renamed persisted keys or missing/unavailable features disguised by the new presentation.

## P11. Migrate Portfolio and AnimationFX

**Consumes:** P10 patterns and all FX/type/package gates. **Produces:** dynamic containment and advanced FX integration with unchanged functionality.

**Files:** matrix's Portfolio and AnimationFX existing scopes. New tests `tests/runtime/animationfx-lifetime.test.tsx` and targeted additions to Portfolio's existing class suite.

- [ ] Inventory dynamic readers/editors, navigation rebuilds, pending service work, media caches, frame leases and all scene handles before editing. Record current rendering/LOD settings; no performance or quality change is implicit in this migration.
- [ ] Portfolio: use class/argument containment for late-created reader/editor regions, safe resource factories, scoped service observations and typed region bindings/actions. Preserve rich library-state parsing and explicit route precedence.
- [ ] AnimationFX: migrate renderer viewport/activity ownership and repeated AFX transaction blocks. Keep scene simulation, selection/drag/dismissal choreography and media/LOD/frame-matching algorithms in their existing units. Assign application/cache versus mounted/frame lifetimes explicitly.
- [ ] Test provider replacement, close during await, detach/reopen, interruption and real remount. Keep custom DOM/gesture adapters outside portable command payloads and maintain user activation for media operations.
- [ ] Run `npm.cmd exec -- vitest run tests/runtime/portfolio-app.test.tsx tests/runtime/portfolio-library-state.test.ts tests/runtime/animationfx-app.test.ts tests/runtime/animationfx-showcase.test.tsx tests/runtime/animationfx-dismissal.test.tsx tests/runtime/animationfx-lifetime.test.tsx`; run existing scene/media helper tests; S check/boundaries/build/diff check.
- [ ] Browser-test book flight/origin/focus, dynamic collection permissions/conflicts and restoration. Test AnimationFX lead-in, camera/selection, pause/reflections, hide/resume, HD detail at DPR 2 and interrupted close/reopen. Record unavailable external media/GPU checks honestly; propose one app-scoped commit each.

**Exit:** advanced scene/media behavior remains authored and fully accessible; managed wrappers do not reset caches, clocks, camera or quality unexpectedly.

## P12. Finish Journal and Publisher ownership, bindings and acceptance

**Consumes:** P00 repairs plus P01-P11. **Produces:** meaningful region ownership and complete acceptance for both apps, not merely class exports.

**Files:** the detailed matrix scopes, especially Journal `components/JournalBody.tsx`, detached notes and root/window controllers; Publisher `PublisherWindowController.tsx`, `PublisherViewControllers.tsx`, `PublisherPostController.ts`, `PublisherCanvas.tsx` and region binding adapters.
**Create S tests:** `tests/runtime/journal-session-ownership.test.tsx`, `tests/runtime/publisher/publisher-binding-ownership.test.tsx`.

Current ownership excerpt:

```ts
// S/src/SynWare/Journal.app/Contents/components/JournalBody.tsx:13-18
useEffect(() => {
  const lifetime = new AbortController();
  const textOwner = createInMemoryNSETextOwner({ content: post.body, flowId: "body", editable: false });
  const reader = new TextEditingSession({ id: `journal-reader:${post.id}`, ownerSignal: lifetime.signal, textOwner, editable: false });
  setSession(reader);
  return () => { lifetime.abort(); reader.dispose(); textOwner.dispose(); };
}, [post.id, post.body]);
```

- [ ] Add regression tests for separate main/detached read-only sessions, replacement of post content, StrictMode replay and teardown ordering. Classify the session as mounted presentation state; avoid inventing another persistent document.
- [ ] Move Journal's read-only session lifetime to the detail/detached controller boundary or an explicit managed editor adapter. Keep font/attachment resolution and native text-view attachment local. Bind query/UI preferences and use a provider-aware latest task for search. Preserve route and document projection authorities.
- [ ] Replace Journal custom callbacks with typed action connections only where they represent commands. DOM events, File values, geometry and share activation remain domain/outlet inputs. Verify author permission changes and no stale provider result after close.
- [ ] For Publisher, map every forwarding property to its real region/document owner. Migrate callers to region bindings and narrower dependencies, then remove the forwarding wrapper. Keep canonical text/document sessions, toolbars, color/font services, preferences and synchronization in their existing proper owners.
- [ ] Add transactional binding regressions for title/body/selected attributes, invalid/mixed/empty selection, one undo group, formatter errors and composition. Preserve TextEditingSession/DocumentEditingParticipants; no public editor resurrection or duplicate history.
- [ ] Retain DOM layout effects for page/comment measurement and editor adapters when local; convert only state that carries command/persistence/cross-region authority. Protect preview/version read-only session release, image/resource leases and close-during-async paths.
- [ ] Run `npm.cmd exec -- vitest run tests/runtime/journal-class-controller.test.tsx tests/runtime/journal-session-ownership.test.tsx tests/runtime/journal-reader-integration.test.tsx tests/runtime/journal-lumina-reader.test.ts tests/runtime/publisher/publisher-class.test.tsx tests/runtime/publisher/publisher-binding-ownership.test.tsx tests/runtime/publisher/publisher-image.test.ts tests/runtime/publisher/publisher-version-diff.test.ts`; run remaining matrix tests and S check/boundaries/build/diff check.
- [ ] Browser-test detached windows through both entrypoints, movement/keep/close/quit/reopen; Publisher real editing, IME, templates, inspector/phone layouts, preview, export and conflict UI. Restore a historical page with selected-page flight and a separate fading current page. Use controlled providers, not real production publish actions.

**Exit:** no original feature lost, all original class cases green, explicit authority map, no shared mutable editing session between unrelated windows, no undocumented visible changes. One app-scoped commit per accepted app.

## P13. Migrate the three historically exempt applications

**Prerequisite:** explicitly admit this later wave when approving implementation. The latest request asks for a complete plan; it does not retroactively mark the old exemptions completed. **Produces:** real class application ownership for SynCal, MemoJournal and Gallery while keeping allowed React integration.

**Create S:** `src/SynWare/SynCal.app/Contents/SynCalApplication.ts`, `SynCalWindowController.ts`, `SynCalViewControllers.tsx`; equivalent `MemoJournalApplication.ts`, `MemoJournalWindowController.ts`, `MemoJournalViewControllers.tsx`; `NSEControlGallery.app/Contents/GalleryApplication.ts`, `GalleryWindowController.ts`, `GalleryViewControllers.tsx`.
**Modify S:** each existing entry plus actual region/command adapters listed in the matrix. Preserve all domain models, fixtures, Info.ts identities and serialization unless a narrowly specified migration is required.
**Create tests:** `tests/runtime/syncal-class.test.tsx`, `memo-journal-class.test.tsx`, `gallery-class.test.tsx`.

- [ ] Before splitting each large entry, enumerate all state/effects/commands/resources and record its existing model/serialization and browser behavior. New region controllers must correspond to actual responsibilities, not arbitrary equal-size file chunks.
- [ ] SynCal: retain SynCalDocumentController/model/service authority; move app selection/navigation/preferences and event-editor behavior to application/window/regions. Preserve recurrence, occurrence versus series edits, timezones/DST/local input, calendar colors/visibility and import/export behaviors actually present.
- [ ] MemoJournal: retain MemoDocument and saved formats; move memo collection/search/edit/delete/session/undo/close logic to owners. Keep preview export deterministic and separate from real persistence; preserve jiggle/entry/close motion and interruption.
- [ ] Gallery: migrate application navigation/search/settings/restoration and resource disposal. Keep specimen/demo components as valid React and controlled/uncontrolled examples. No public gallery fixture API is introduced.
- [ ] Run the three new class suites plus `syncal-model.test.ts`, `memo-journal-model.test.ts` and all gallery suites listed in the matrix. Add lifecycle/close/reopen and stale-operation cases. Model-only success is insufficient.
- [ ] Run S check/boundaries/build/diff check and browser cases for each app. Compare persisted formats and sample/preview behavior. Propose one app-scoped local commit per acceptance.

**Exit:** all eleven bundles have a truthful application-layer ownership map and admitted migration status. If P13 is not approved, final delivery must explicitly state these three remain deferred and cannot claim all-app migration completion.

## P14. Complete cross-app, package, browser and human acceptance

**Consumes:** all admitted packages. **Produces:** exact-source evidence, public docs/examples, preserved features and quantified authoring improvements.

**Modify:** docs/framework guides, scaffold/examples, S/HANDOFF.md and documentation/evidence inventories; changes to code only for bounded regressions discovered by these gates. Evidence belongs in `S/validation/cocoa-authoring/` or an approved equivalent, not the public SDK.

- [ ] Run F full tests, typecheck, existing/new type contracts, architecture/SDK omission checks, SDK build, installed consumer and all deterministic FX checks through the accepted complete M06 plan. Close M03A/M08 compiler/security/performance gates before claiming the admitted modernization complete; M03B is deferred unless separately admitted. Capture any pre-existing broad failure separately; none can be erased through excludes/skips. Serialize all packaging operations.
- [ ] Install the final immutable archive in S. Verify package.json/lock/receipt/archive bytes/installed exports/assets/workers agree; no framework source alias/junction. Run S full tests, check/boundaries, production and Cloudflare compile. Do not deploy.
- [ ] Run installed-consumer tests from a clean independent validation checkout without sibling framework source access. Confirm new decorators, binding/action types, tasks, HMR and FX imports work there. Inspect renderer quotas/error paths and release counts.
- [ ] Start/reuse a preview from this exact S checkout and report its path, actual PID/address and package receipt. Inspect port occupancy before choosing an explicit strict port; never use another checkout's server as evidence. For the current nine-bundle preview use `npm.cmd run dev:preview -- --port 5199 --strictPort`; after package refresh restart only that owned session with --force. For Publisher/MemoJournal create an explicit local acceptance selection that includes their real entries without changing production admission or permanently weakening .env.preview.
- [ ] Capture 1440x1000 and 390x844 interactions and desktop DPR 1/2 for affected controls/effects. Exercise launch/return/menu/portal focus, all app-specific matrix cases, mixed function/class apps, multiple runtimes/windows, browser visibility, reduced-motion overrides and close/reopen/interruption. Inspect stable post-transition geometry and console errors. No source screenshot alone counts as behavioral acceptance.
- [ ] Ask for human visual/motion acceptance of actual captures after automated checks. Keep device/GPU/media unavailable checks explicitly open. Production authentication/runtime readiness is a separate recorded gate, not inferred from the preview bypass.
- [ ] Measure authored code with the same baseline and feature scope: nonblank lines, bytes/tokens, manual subscriptions/listeners, action adapters and total handwritten shared-helper costs. Report generated artifacts separately. No predetermined percentage is promised.
- [ ] Update HANDOFF and docs around final behavior, preserved keys/contract choices and actual evidence. Run git diff --check, inspect staged scope, and leave work local for review. Do not push, merge, release or publish.

**Exit:** every admitted feature row passes automated, static/package and human visual acceptance. Remaining device/auth/production or intentionally deferred-wave limits are stated explicitly; none is relabeled complete.

## Review and stop rules

Each package ends at a reviewable/testable boundary. Reconcile actual file paths with the pinned tree before editing; a new file above is labeled create, an existing one modify. If source has drifted, an owner contract cannot be upheld, public naming needs an unapproved capability, an existing app feature has no preservation path, or a test is being weakened to proceed, stop that package and report the concrete conflict.

For new public API changes, verify two real consuming applications or a documented platform-wide responsibility. Validate the implementation against its ordinary React consumption and installed-package behavior as well as its class use. Keep the source owners and native behavior described in the design; never substitute a smaller feature set to achieve a code-size target.

## Plan self-review record

The original pack was a planning artifact. Inline review covers local Markdown links outside code examples, P00-P14 and M00-M08/M03A/M03B coverage, all eleven application sections, edit scopes, source/package baselines and failure inventories. It checks fenced examples, whitespace, proposed-name consistency and placeholders. Later explicit M00 security and M03A TypeScript 6.0.3 authorization permits those bounded source/config changes and refreshed archives; native M03B and the authoring/app work remain deferred or proposed. Current execution evidence belongs to site validation reports. No future API/app acceptance gate is claimed passed by compiler checking alone.
