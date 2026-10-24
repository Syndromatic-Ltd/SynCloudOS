# 6E design: Cocoa-style controllers, bindings and TSX

Status: proposed for review, 24 October 2026. This is a design, not an implemented API catalogue. Baselines and exact F/S paths are in [README](README.md); Apple evidence and original 6C links are in [research-and-baseline](research-and-baseline.md).

## 1. Intended developer experience

An application declares identity in `Contents/Info.ts`, owns app-wide state in an `NSEApplication`, uses window controllers for window/document policy, and view controllers for meaningful regions. TSX declares composition. Decorators declare observable properties, actions, preferences, outlets and observations. Typed descriptors express bindings and asynchronous tasks. The framework owns connection, lifetime and repeated presentation machinery; the app owns its model, policy and authored effects.

This extends 6C. It preserves React function views and local presentation hooks as a permanent choice. A class-based application is not complete simply because its entry extends `NSEApplication`, and a retained `useLayoutEffect` is not automatically an incomplete migration.

### Target example

The names added by this document are proposed. Existing controls, classes and decorators retain their meanings.

```tsx
import { NSEApplication, NSEViewController, action, actionRef, bind, observable, preference } from "@syndromatic/syncloudos";
import { NSEPushButton, NSESearchField } from "@syndromatic/syncloudos/nse/controls";

class SearchController extends NSEViewController {
  @observable accessor query = "";
  @preference("search.showDetails") accessor showDetails = true;

  @action clearSearch() { this.query = ""; }
  validateClearSearch() { return this.query.length > 0; }
  @action toggleDetails() { this.showDetails = !this.showDetails; }

  renderView() {
    return <section>
      <NSESearchField aria-label="Search" binding={bind(this, "query")} />
      <NSEPushButton action={actionRef(SearchController, "clearSearch")}>Clear</NSEPushButton>
      <NSEPushButton action={actionRef(SearchController, "toggleDetails")}>Details</NSEPushButton>
      {this.showDetails && <p>Search this application's content.</p>}
    </section>;
  }
}

export default class SearchApplication extends NSEApplication {
  static mainViewController = SearchController;
}
```

Production migrations retain existing localization keys and accessible names. The small example's English text demonstrates composition only.

## 2. Scope and authorities

| Behavior | Authority retained |
| --- | --- |
| Bundle identity, admission, services and permissions | Info.ts, bundle discovery, PolicyKit and app-scoped SDK clients |
| Application launch/quit and windows | Existing lifecycle kernel, `ApplicationSession`, `NSEApplication`, window manager |
| Focus, responder ancestry, commands and portals | Existing responder/focus graphs, command dispatcher, overlay hosts |
| Document content, saved identity and history | Existing workspace documents, document editing participants/transactions and storage adapters |
| Preference schema/migration/undo for settings panes | Existing `NSEPreferencesController` |
| Control interactions | Existing NSE controls and their native inputs, keyboard behavior, IME, formatting and accessibility |
| Layout and native DOM ownership | React/TSX and current CSS/layout owners |
| Shared animation and reduced motion | Existing AFX clients, scheduling and NSE animation environment |
| App-specific content/editor/simulation policy | App-owned code; Publisher's composition and Journal contracts remain private |

No parallel runtime store, document model, history, responder registry, renderer or global current application is introduced. All new conveniences route to these owners. Rich APIs and existing function-component entry points remain permanent supported contracts.

## 3. API decisions

| API | Decision |
| --- | --- |
| `@observable` | Retain per-object observation, immutable collection replacement and no automatic deep tracking. |
| `@action` | Retain; add typed results and existing command undo-policy support. No automatic reversal of arbitrary mutations. |
| `@preference` | Add for primitive app-scoped preferences; explicit descriptor form for richer schemas. |
| `@outlet` | Add typed managed DOM/view handles, stable refs and mount-scoped layers. |
| `@observes` | Add scoped method observation. Use this name because the existing `observe(object, listener)` utility already occupies `observe`. |
| `@task`, `@undoable`, `@inject`, `@view` | Do not introduce in this version. Tasks need observable objects; undo belongs to commands/documents; ordinary construction and class members cover the other cases. |
| `own(factory)` | Add to application, window and view controllers; synchronous, evaluated only while owner is live. |
| `managedTask(owner, options)` | Add an observable task descriptor with explicit concurrency/lifetime and guarded application. |
| `bind(owner, key)`, `createNSEBinding(owner, adapter)` | Add simple value bindings and explicit transactional adapters. |
| `actionRef(ControllerClass, method)` | Add typed declaration references that still use canonical responder dispatch. |
| `renderView()` and `static viewDependencies` | Add optional inline TSX and typed explicit external dependencies. |
| `static mainViewController` | Add standard-main-window shorthand. |
| `static contentViewControllerClass` | Add a custom-window content-class declaration; distinct from the existing instance `contentViewController` property. |
| `navigation restoration` descriptor | Add to existing navigation controllers, with explicit schema/key and app policy projection. |
| `AFXTransaction.perform(options, changes)` | Add synchronous scoped layer batching. Existing instance `run` and explicit handles retain their own semantics. |
| `controller.fx.animation.manageRenderer(outlet, options)` | Add a mount-owned AFX renderer projection with view activity and frame scheduling. |

New source files are ordinary internal modules, not new package subpaths. Export reusable authoring APIs from the existing root/SDK/NSE/FX entries as appropriate. Each addition below has real consumers in S. No gallery specimen or Publisher schema is exported.

## 4. Ownership by safe construction

Preserve the tree: application -> windows -> root/child view controllers -> owned controllers/resources. Back references such as a region's `root` do not transfer ownership. `addChild` establishes view containment/responder ancestry; `own` does not replace it.

Public shape on `NSEApplication`, `NSEWindowController` and `NSEViewController`:

```ts
own<T extends { dispose(): void }>(factory: (signal: AbortSignal) => T): T;
```

The zero-argument callback is valid. This form is useful after await:

```ts
const rows = this.own(() => new NSEArrayController<Note>({
  id: "search-results", getId: note => note.id,
}));
```

Required behavior:

1. Check owner authority before calling the factory. A disposed owner raises the existing lifecycle error; the factory is never evaluated.
2. Enter a synchronous construction-owner slot in `try/finally`. Never retain a global ambient owner across await.
3. Forbid async/thenable factory results in type fixtures and runtime checks. Tasks are the asynchronous construction path.
4. Keep framework `pendingSelf` construction separate. Do not pass a parent's scope as a new controller's self scope. `own` handles data controllers and disposables, not application/window/view-controller construction. Reject those return kinds and roll back the factory's resources with a diagnostic directing the author to `addChild` or `openWindow`.
5. Every resource has one disposal registration. Recognize objects already bound to this owner; reject implicit transfer from another live owner. Register a plain disposable only after successful construction and only once by identity.
6. Track resources created during a factory call so a thrown factory rolls back acquisitions from that call in reverse order. Never dispose pre-existing resources of the owner as rollback.
7. If synchronous reentrancy disposes the owner during construction, release the new resource and reject the result. Do not return a live orphan.
8. Owner disposal first revokes new task/publication authority, then preserves 6C's observable child/owner/resource disposal order and reason propagation. Aggregate cleanup failures without skipping later resources.

The runtime boundary error `NSE_CONTROLLER_UNOWNED` remains a defense for raw unsupported construction. Explicit `{ owner: this }`, `{ ownerSignal }` and deliberate `nseUnowned` remain valid. The new path makes common code safer; it does not make ambiguous ownership silently app-global.

Extend the existing `addChild` class overload to accept constructor arguments: `addChild(DetailController, this, item)`. It constructs under a fresh child scope, restores the previous ambient slot in finally, and adopts the resulting child under the parent. Its constructor/field resources therefore belong to that child, not its parent. Keep `addChild(instance)` for an already correctly constructed instance, without pretending that later containment retroactively changes every resource created by its constructor. New app migrations use the class overload, including parameterized region controllers. Windows continue through `app.openWindow` and the root content-class factory.

For custom factory-returned disposables, no rollback can undo arbitrary external effects performed by that factory. Factories are synchronous resource construction; privileged operations belong in explicit actions/SDK clients.

## 5. Lifetime epochs and managed tasks

### Lifetime vocabulary

`NSETaskLifetime = "owner" | "mounted" | "visible"`.

- `owner`: until the application/window/view controller begins disposal.
- `mounted`: one committed mounted-view epoch. Real unmount ends it. React StrictMode's cleanup/setup replay for the same committed view is normalized by the existing detach-deferral protocol.
- `visible`: one effective view-activity epoch after appearance. It combines presentation, application active/suspended state and browser visibility; optional intersection gating is used for renderers, not for every data task. Ending the epoch cancels its work. Becoming active creates a new epoch; tasks rerun only through an explicit trigger or an initial scoped observation.

Only view controllers accept mounted/visible lifetimes. Application and window controllers use owner lifetime; clients needing a view lifetime choose the relevant view controller as owner. Expose `view.mountSignal` while mounted for integrations; keep lifecycle bookkeeping private and runtime-local.

### Task contracts

```ts
type NSETaskSettlement<T> =
  | { readonly status: "succeeded"; readonly value: T }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "cancelled"; readonly reason: "superseded" | "lifetime-ended" | "owner-disposed" | "explicit" };

interface NSETaskContext {
  readonly signal: AbortSignal;
  readonly generation: number;
  throwIfCancelled(): void;
  commit(change: () => void): boolean;
  own<T extends { dispose(): void }>(factory: (signal: AbortSignal) => T): T;
}

interface NSETaskRun<T> {
  readonly signal: AbortSignal;
  readonly finished: Promise<NSETaskSettlement<T>>;
  cancel(): void;
}

interface NSETaskSnapshot<T> {
  readonly revision: number;
  readonly pending: boolean;
  readonly value: T | undefined;
  readonly error: unknown | null;
}

interface NSEManagedTask<A, T> extends NSEObservable {
  getSnapshot(): NSETaskSnapshot<T>;
  run(argument: A): NSETaskRun<T>;
  cancel(): void;
  dispose(): void;
}
```

`managedTask<A,T>(owner, options)` accepts required `lifetime`, required `policy: "latest" | "serial"`, optional `debounceMs` (latest only; default 0), optional `maximumQueued` (serial only; default 32), required `run(argument, context): Promise<T> | T`, and optional synchronous `apply(value, argument): void`. Descriptor state is read through `getSnapshot()`; the earlier conversational `.value/.pending/.error` shorthand is not part of this contract.

The public options are a discriminated union, so serial/debounce and latest/queue-limit combinations are type errors:

```ts
type NSETaskOptions<A, T> = Readonly<{
  lifetime: NSETaskLifetime;
  run: (argument: A, context: NSETaskContext) => T | Promise<T>;
  apply?: (value: T, argument: A) => void;
}> & (
  | Readonly<{ policy: "latest"; debounceMs?: number; maximumQueued?: never }>
  | Readonly<{ policy: "serial"; maximumQueued?: number; debounceMs?: never }>
);
```

Owner arguments are lifetime-owning NSEApplication/NSEWindowController/NSEViewController instances; type overloads restrict mounted/visible to the view-controller form. Zero-debounce admitted work starts synchronously up to its first await; delayed work uses the injected runtime scheduler. `run` arguments are in-process domain values, not automatically portable command payloads. Task-owned resources returned by run are borrowed during apply and released afterwards; persistent task snapshots must not retain a disposed run-owned resource. Explicit owner construction within commit is the promotion path.

`latest` supersedes queued and running generations immediately. It cancels old handles, keeps the most recently successful value while pending, and never lets a late old success/error overwrite the current snapshot. `serial` starts admitted operations in FIFO order; overflow produces a failed run with a typed queue-full error without calling `run`. New view reads may use latest; writes are never silently given latest or debounced behavior. `run` on an inactive/closed lifetime settles cancelled without invoking application code.

Before apply or publication, verify owner, captured lifetime epoch, run generation and cancellation. `context.commit` repeats those checks immediately before a synchronous change; return false without calling it when stale. Thenable commit/apply callbacks are rejected. Exceptions become a failed current run and enter the existing diagnostic pipeline once; cancellations do not present as operation errors.

`context.own` checks before evaluating its factory and binds to the task run. Run-owned resources are disposed at settlement. Resources intentionally promoted into the controller must be constructed with `owner.own` inside a successful synchronous `commit`, not implicitly transferred. This makes after-await creation safe and makes resource lifetime explicit.

Cancellation settles handles promptly and revokes apply/publication even when the underlying promise ignores the signal. It does not block application quit waiting for such a promise. Late acquired resources must be returned through a specified owned acquisition or disposed by the operation. Side effects made directly by arbitrary application code cannot be retroactively prevented. External save/publish/share operations retain their version/idempotency/unknown-outcome contracts.

Do not automatically route all `@action`s through tasks: share, clipboard, audio/camera permission and other user-activation-sensitive SDK calls may need to begin synchronously in the originating action. Debouncing must not consume that activation.

### Example with protected application

```ts
readonly search = managedTask(this, {
  lifetime: "owner",
  policy: "latest",
  debounceMs: 150,
  run: (query: string, context) => this.content.searchPublished(query, { signal: context.signal }),
  apply: ids => { this.searchPostIds = ids; },
});
```

Journal keeps service-replacement and authorization generations in its adapter. A new provider revokes the old operation even if the old provider ignores cancellation. Diagnostics uses the same pattern for trusted-provider replacement; it does not lose redaction validation.

## 6. Class TSX hosting and React coexistence

Add `renderView(): ReactNode` as an optional view-controller method. `static view` remains the separate function-component form. Declaring both is a deterministic definition error before partial hosting. A framework function component invokes the instance method; these are not React.Component subclasses. Hooks cannot be called directly from `renderView`; compose ordinary child function components when local hooks are useful.

The generic `NSEViewControllerClass<TController>` gains `viewDependencies?: (controller: TController) => readonly (NSEObservable | null | undefined)[]`, implemented on a class as a static member. It names extra observed sources. The host observes the controller itself automatically. It subscribes only after commit, deduplicates source identities, compares stable snapshots, and rebinds changing sources after controller notifications without leaking old listeners. It does not recursively observe all children or proxy property reads. Large apps use region-specific dependencies rather than a universal Publisher subscription helper.

Keep function export apps, `static view`, `useObserve`, `useAction`, `useNSEArrayController`, `useNSETreeController`, `useState`, DOM refs, measurement/layout effects, presentation hooks and vendor adapters. A shared component still uses `useSCOS()`; it must not capture an app-bound global from another bundle.

Presentation-local state can remain React-owned if it has no document, command, persistence, cross-region or lifetime authority. Examples: pointer hover, measurement caches, drag geometry, an isolated disclosure. Search, persisted inspector state, document sessions, app navigation and async data operations belong to controllers or canonical services. A view may adapt a controller-owned document session to a DOM editor without becoming a second document owner.

`static mainViewController` creates a standard main window through the existing ApplicationSession/window pipeline. `static mainWindow` remains the form for custom window/document policy. Defining both is an error. A custom window may declare `static contentViewControllerClass`; combining that declaration with `static view` or assigning a different root from its constructor is an error. The existing instance setter remains for intentional later replacement after initialization.

Keep Info.ts's explicit bundle identifier, display name, version, routes, frame, window defaults, permissions and menus. Main-window shorthand must retain window admission, document association, restoration, key/main focus and secondary-controller identity. It cannot collapse distinct windows into one view.

## 7. Bindings and editing

### Contracts

```ts
type NSEBindingValue<T> =
  | { readonly kind: "value"; readonly value: T }
  | { readonly kind: "empty" }
  | { readonly kind: "mixed" }
  | { readonly kind: "unavailable"; readonly reason: string };

interface NSEBindingSnapshot<T> {
  readonly revision: number;
  readonly value: NSEBindingValue<T>;
  readonly readOnly: boolean;
  readonly issues: readonly ControllerValidationIssue[];
}

type NSEBindingCommitResult =
  | { readonly status: "committed" }
  | { readonly status: "invalid"; readonly issues: readonly ControllerValidationIssue[] }
  | { readonly status: "cancelled" };

interface NSEBindingEdit<T> {
  preview(value: T): void;
  commit(value: T): Promise<NSEBindingCommitResult>;
  cancel(): void;
}

interface NSEBinding<T> extends NSEObservable {
  getSnapshot(): NSEBindingSnapshot<T>;
  beginEditing(): NSEBindingEdit<T>;
}
```

`bind(owner, writableKey)` only accepts observable owners and writable properties; infer the property value type. Cache the descriptor by owner/key. Creating it during render is an inert lookup, not a subscription. Descriptors hold no mounted editor/DOM state; each control obtains its own editor lease.

Simple `bind` is continuous for transient/UI/preference state: preview updates the property through its declared setter. It has no implicit document undo. Cancel restores the opening value only if the binding still owns the latest edit revision; a concurrent external change is not overwritten.

`createNSEBinding(owner, adapter)` is the explicit transaction/selection form. Its adapter supplies `source: NSEObservable`, `read(): NSEBindingSnapshot<T>` and `beginEditing(): NSEBindingEdit<T>`. `read` is pure, snapshots are stable until revision changes, and editor methods go through the app's existing controller/document transaction. Cache these descriptors on the region/model controller. Do not cache a selected document forever; read and edit admission bind to the current document/revision.

Transactional previews remain drafts or use the existing document preview transaction. Commit produces one canonical edit/undo group; invalid data leaves the editor active and the committed model unchanged. Escape/cancel restores the canonical opening value/selection. Multiple-value edits apply to the admitted selection atomically and expose mixed/empty states instead of inventing a default zero/string.

Recheck editability and document/selection admission at commit, including after asynchronous preparation. Unexpected storage/document errors reject the commit promise and enter the existing error presentation path; do not recast a write with an unknown outcome as a harmless cancelled edit or roll back an external write by assertion.

An optional binding configuration may use the existing `Formatter<T>` and validation types; conversion failures become binding issues, not forced model writes. Preserve IME composition boundaries, marked text, native input selection/caret, preview/commit/cancel phases, accessible invalid messages, and async commit lifetime checks.

### Control integration

Add `binding?: NSEBinding<T>` to value-control families using a shared internal `useNSEValueBinding` adapter. Binding mode excludes `value`, `defaultValue`, mutating `onValueChange`, and separate `undoManager` ownership. Existing controlled/uncontrolled callbacks remain a permanent alternative. Ambiguous combinations are compile-time errors and runtime definition errors for JS consumers. Native notification callbacks that do not write the value may remain where already meaningful.

Cover search/text/password/secure fields, text areas/numeric fields, checkbox/toggle, sliders/circular sliders/steppers, segmented choices, existing pickers and token/completion fields. Retain each control's recents, debounce, native form, focus, keyboard and accessibility behavior. Search is debounced exactly once: use the field's query mechanism or a managed task, not both. Suppress new queries during composition as the current field does.

Data views already consume controllers. Add selection/value binding adapters to their existing selection models where apps need them; do not replace NSETable/Outline/Collection with generic list widgets or remove virtualization. Custom Journal and Publisher components can consume `useNSEBinding(binding)` (public React adapter returning snapshot/editor lease) without inventing a second binding contract.

## 8. Preferences, observations and restoration

`@preference(key)` decorates a non-static accessor on an application/window/view controller. The primitive initializer supplies default and primitive-kind validation; numbers must be finite. The key is explicit and app-scoped. App context is injected by the existing owner/session path, never by an unbound module global. Hydrate after construction completes and before launch/load callbacks; constructor reads see the initializer default. A pre-hydration explicit write wins over stored data, is persisted after attachment, and cannot be overwritten by hydration.

For complex settings, `@preference(descriptor)` accepts the following typed descriptor; the accessor initializer remains the single source of its default. It adapts the existing preferences/storage authority. It may not overwrite a newer unsupported schema. Existing `NSEPreferencesController` remains the owner of grouped/undoable settings panes; bind to it rather than creating independently persisted decorators for every draft field.

```ts
interface NSEPreferenceDescriptor<T> {
  readonly key: string;
  readonly version: number;
  readonly parse: (value: unknown) =>
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly issues: readonly string[] };
  readonly migrations: readonly Readonly<{
    from: number; to: number; migrate: (value: unknown) => unknown;
  }>[];
}
```

Contiguous migrations are checked before write-forward. Parse outputs and defaults enter the existing immutable-value validation path; do not enumerate arbitrary raw values to force acceptance. These descriptors do not serialize functions, DOM values or live leases.

Persist before publishing a committed preference change. A refused/failed synchronous write throws `PreferencePersistenceError` and retains the prior value. Binding editors convert that error into presentation issues. Store echoes of an equal value produce no extra notification. Multiple windows of the same application observe the same scoped value; different apps/runtimes do not share state accidentally. Preserve every existing key/envelope/migration during app adoption.

`@observes(key, { lifetime, initial })` observes one direct property of its owning object; compare the projected value with Object.is. The method receives `(newValue, previousValue)`; previous is undefined on initial delivery. Also support a typed source factory `(owner) => NSEObservable` plus a `select(snapshot)` option for SCOS locale/routes/services and canonical controllers. Resolve factories after construction, never at module decoration time. Dynamic sources rebind on owner changes.

`NSEObservationOptions` requires lifetime and optionally initial (default false). The property overload constrains the decorated method's value parameters to that property's type; the source-factory overload infers its snapshot and selected value. Standard method-decorator metadata supplies the method name. Reject static/private/symbol methods and async observer methods through the authoring definition check; runtime also diagnoses a thenable result. `observe(object, listener)` keeps its existing public signature and disposer semantics.

An initial mounted observation runs once after refs and viewDidLoad are ready. An initial visible observation runs after effective activity begins. Each new epoch gets its own optional initial delivery. Coalesce synchronous source changes into one microtask delivery; ended epochs invalidate pending callbacks. Effects that write back to their own source must converge; detect/report repeated non-converging delivery through diagnostics rather than silently dropping values. Async observer methods are not the work runner: they schedule a managed task explicitly.

Navigation controllers accept an optional `restoration` descriptor with `key`, `version`, `parse(unknown)`, `capture(snapshot)`, `restore(controller, value)` and `migrations`. The restore callback receives the fully constructed canonical controller and invokes its existing restoration API; it does not replace arbitrary snapshots. Connect persistence only after construction and app-owner context attachment. Outside such a context an explicit preferences adapter is required, with a definition error at connection if neither is available. Never infer another app's store from a module global.

A simple tab selection convenience validates the selected ID against current destinations and falls back to `initialSelectedId`. A re-title/locale change does not persist a new navigation value. Route authority wins when an explicit route is present; restoration only supplies absent state. Hierarchy stacks validate destinations/path order, and stale invalid IDs are removed by app policy. Dynamic Portfolio collections and Journal routes retain their app-specific projections.

## 9. Actions, typing and command behavior

Extend `NSEActionOptions<Payload, Result>` with `undo?: SynWareCommandUndoPolicy<Payload, Result>`. Forward the actual synchronous/awaited method result through the canonical command pipeline and its existing admission/result boundary. Methods remain at most one payload argument. The undo policy is optional and defaults to none. Document/text actions that already register canonical undo do not also register a command undo action.

`actionRef(ControllerClass, methodName)` returns immutable `NSEActionReference<P,R>` holding a stable declaration identity, not an instance. Infer a real callable public method's parameter/result types. Confirm decorated status from metadata at preparation/build time. Standard IDs from the decorator are preserved; bare names remain app-scoped at the mounted sender. HMR updates implementations without leaving stale function pointers.

Typed references work with `useAction`, action-capable controls, menu items and toolbar items. `useAction(reference, payload?)` exposes typed perform arguments and `CommandDispatchResult<R> | null`; validation, payload admission, focus/responder generation, cancellation and source scope remain canonical. An action reference does not bypass a disabled state, capture another app's object or execute a method directly.

Existing string action IDs remain meaningful for dynamic plugin/menu contributions; they are not temporary aliases. Preserve the portable payload builders. Do not spread/clone/enumerate an unknown object to manufacture an accepted payload, and do not pass DOM/File/function values through commands. Outlets and domain callbacks carry such values. Runtime schemas remain required at data boundaries; a TypeScript annotation alone is not a runtime parser.

Keep `validate<Name>` conventions, async validation, mixed/on/off state, hidden/disabled reasons and payload-dependent/localized titles. Missing validation means enabled when the responder handles the command, so unconditional true validators can be removed. Menu order/group layout remains authored; metadata does not silently invent menus. Preserve all reserved-browser-shortcut opt-ins and application/window/view hierarchy rules.

## 10. Outlets and AFX integration

### Managed outlet

```ts
interface NSEViewOutlet<T extends HTMLElement> {
  readonly ref: (element: T | null) => void;
  readonly current: T | null;
  readonly element: T;
  readonly layer: AFXLayer;
  readonly mountSignal: AbortSignal;
}
```

`@outlet` decorates a typed accessor, creating its stable handle during initialization. `@outlet({ actions })` optionally declares AFX layer actions to reapply at each real bind. A controller can write `@outlet accessor artwork!: NSEViewOutlet<HTMLDivElement>` and attach `ref={this.artwork.ref}`. `element`, `layer` and `mountSignal` throw `NSE_VIEW_NOT_LOADED` when absent; `current` is the intentional nullable query for conditional content. No ownership of the React node is implied by retaining the outlet.

The decorator uses standard ClassAccessorDecoratorContext/Result and is constrained to a non-static, public, string-named accessor of NSEViewOutlet<T>. The generic element type supplies compile-time ref typing; it is not runtime type reflection. Runtime connections require an HTMLElement from the correct mounted document/runtime and reject a second live connection.

Refs acquire authority only after DOM commit. Normalize callback-ref replay, conditional detach, replacement nodes and actual unmount; never let an old ref's cleanup release a newer node. Release layers/renderers before clearing their mount resources. An outlet cannot simultaneously bind two live elements; repeated list items use app-local keyed handles with explicit removal, not one shared field. Portal outlets inherit the current appearance/focus runtime without taking over portal placement.

### Layer transactions

Add static `AFXTransaction.perform(options, changes): void`; options are `duration?`, `delay?`, `timing?`, `disableActions?`, validated before beginning. The callback is synchronous. An async function/thenable result is a definition error detected by the authoring check/runtime; the transaction still closes in finally. Start from inherited outer options, apply overrides, run changes, commit exactly once and rethrow application errors. Commit batches changes; it is not model rollback.

Retain begin/commit/flush, existing instance run, layer actions and explicit AFXAnimationHandles. Do not manufacture implicit animation for properties with no applicable action. Do not conflate responder `@action` with a layer's implicit animation actions.

### Managed renderer projection

Add `animation` to `NSEViewControllerFX` through its existing mounted host binding. `animation.manageRenderer(canvasOutlet, options)` returns a cached mount-specific `NSEManagedAFXRenderer`; it does not construct an AFXRenderer directly or import NSE from the FX engine. It delegates to the current scoped animation client and canonical AFXRenderer, preserving session quotas and capability errors.

```ts
interface NSEManagedAFXRenderer extends NSEObservable {
  readonly renderer: AFXRenderer;
  getSnapshot(): Readonly<{
    revision: number; active: boolean; reducedMotion: boolean;
    width: number; height: number; pixelRatio: number;
  }>;
  onFrame(callback: (frame: Readonly<{ time: number; delta: number; reducedMotion: boolean }>) => void,
    options: Readonly<{ reducedMotion: "static" | "continue" }>): () => void;
  dispose(): void;
}
```

Time/delta are monotonic seconds from the existing scheduler. No callback runs for an inactive view. Resuming starts with delta 0 rather than simulating the hidden interval. `static` delivers a frame when reduced motion begins/state changes, then stops continuous ticking; application simulation determines the static pose. `continue` is an explicit authored choice, not a silent policy override. Media timebases retain their own actual time authority.

The manager resolves canvas CSS size and current content-bound DPR, defers allocation at zero size, batches resize notifications, avoids writes that cause ResizeObserver loops, pauses frames when offscreen/suspended/browser-hidden, and releases observers, loops, renderer and borrowed presentation leases on real unmount. It must recover when the same controller remounts with a fresh outlet/client generation. Application-owned media caches may outlive a view; frame/outlet leases do not.

Expose options matching current `maximumQuads`/render error hooks. Errors stay explicit so the app can offer its existing unavailable/recovery UI. Bound DOM layers and canvas layers keep their actual different key paths/content support. Do not downgrade DPR, video LOD, particle counts, shader/effect paths, camera behavior, reflections or interruption semantics to make the convenience work.

### Other FX

Keep all twelve framework imports and public APIs. Existing `fx.motion/location/haptics/midi/media/video/lumina` projections remain controller-owned and lazy, and request hardware only when explicitly asked. Mounted tasks can combine their signal with those clients where a shorter lifetime is intended. Audio/Graphics/Image/Text/PDF/computation APIs stay in their frameworks. No new SCOS mega-namespace, permission bypass, automatic microphone/location request or new public scene API is introduced.

## 11. Documents and application migration rules

Bindings, actions and tasks do not introduce a second document class or a replacement editor. Reuse `ApplicationDocument`, workspace document clients, `DocumentEditTransaction`, `DocumentEditingParticipants`, `TextEditingSession`, resource retention, printing/export and existing undo. Keep Publisher's composition engine private and Journal as the content adapter.

Journal: move its view-created text-session lifetime to the appropriate detail/detached-note controller or an explicitly mounted editor adapter. Preserve projection identity and detached document admission. Publisher: each region owns its UI state; the post/document controller owns the canonical editing session/history. Narrow dependencies and remove forwarding setters only when their callers migrate to real region bindings. DOM measurement and IME adapters remain local when they carry no competing authority.

Every application gets a before/after class tree, state/command/resource ownership map, persistence map and behavior ledger. The [migration matrix](app-migration-matrix.md) is the minimum inventory. Preserve application IDs, routes and query semantics, service replacement, localizations, date/time behavior, import/export, shortcuts, responsive layouts, focus return, accessibility, visible effects and unavailable states. Report all visible changes; the target is no intentional visual change.

## 12. Toolchain, acceptance and rollout

Use standard TC39 decorators throughout. The existing baseline uses esbuild/Babel lowering; the [modernization design](toolchain-modernization.md) replaces the Vite 7-specific implementation with an explicit standard-decorator transform for Vite 8. Native TypeScript 7 compiler/API migration, Bun and complete-test performance work follow the separate [implementation plan](modernization-implementation-plan.md). None changes the intended application syntax or browser/worker authority. The new metadata must be discovered in source and installed-package tests without requiring legacy experimentalDecorators, emitDecoratorMetadata or a new language. Teach application HMR about new declarations, but keep the current private-member-brand rule: edits to classes with private brands may relaunch only that app. Resource descriptor edits relaunch the app safely; method-only compatible changes refresh actions/views without losing state. Never swap a stale task/outlet callback into a new lifetime generation.

Scaffold both inline and separate-view examples. The test host must expose the same app/window/commands/persistence/FX clients and responder installation order as browser hosting. No test-only production API is added to manufacture acceptance.

Keep framework packaging serial and S installed from exact content-addressed archives. Verify version/provenance/assets/workers and clean installed consumers without sibling source aliases. Run focused contracts, type fixtures, package tests, all existing app suites, then browser acceptance at 1440x1000 and 390x844 plus desktop DPR 1 and 2. AFX media tests include their existing high-detail paths and interrupted close/reopen behavior.

Measure authored nonblank lines and tokens/bytes for app plumbing, number of manual subscriptions/listeners, duplicate action adapters, and duplicated authority. Include shared helpers introduced by the migration and report generated outputs separately; moving code into another handwritten helper is not a reduction. Preserve comparable feature scope and avoid promising a percentage in advance.

Implementation is complete only when every admitted migration wave passes its preserved contract tests, static/package checks and human visual acceptance. Current red baseline tests are resolved with their causes documented; none may be deleted, weakened, skipped or hidden by changing preview selection. Production authentication/device acceptance and deployment remain separate.
