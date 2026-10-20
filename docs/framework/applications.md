# Applications

Class-based apps export an `NSEApplication` subclass as the module's default. The framework creates
one instance per launch (never call `new` on it), opens `static mainWindow` when present, and awaits each lifecycle hook:
`applicationWillFinishLaunching`, `applicationDidFinishLaunching`, `applicationDidBecomeActive`,
`applicationWillResignActive` (when the app is suspended), `applicationShouldTerminate`, then
`applicationWillTerminate`. Return `false` (or a promise of it) from `applicationShouldTerminate` to
veto quitting; an app can present its own confirmation first. The decision is bound by the close
operation's timeout (`lifecycleHookTimeoutMs`, 5 seconds unless the host raises it). `static routes` and
`static migrations` declare what `createSynWare` took before, and a `handleBackgroundTask(taskId, { signal })`
method handles background tasks.

`SCOS` is running before the launch callbacks, including `applicationDidFinishLaunching`.
Preferences, services, routes and secondary-window creation do not depend on a React view mounting.

```tsx
import { NSEApplication, NSEWindowController, useObserve } from "@syndromatic/syncloudos";
import { NSEArrayController } from "@syndromatic/syncloudos/nse";

interface Note { readonly id: string }

function NotesView({ controller }: { readonly controller: NotesWindow }) {
  const notes = useObserve(controller.app.notes);        // `controller` itself is observed already
  return <h1>{notes.getSnapshot().content.length} notes</h1>;
}

class NotesWindow extends NSEWindowController<NotesApp> {
  static view = NotesView;
}

export default class NotesApp extends NSEApplication {
  static mainWindow = NotesWindow;
  readonly notes = new NSEArrayController<Note>({ id: "notes", getId: (note) => note.id });

  applicationDidFinishLaunching() {
    this.notes.setContent([]);
  }
  applicationShouldTerminate() { return true; }
}
```

## Window controllers

An `NSEWindowController` represents one window. Its `static view` is a React component receiving
`{ controller }`; alternatively set `contentViewController` to an `NSEViewController`. The window
controller exposes its application as `app` and its mounted window as `window`.

```ts
class NotesWindow extends NSEWindowController<NotesApp> {
  static view = NotesView;

  windowDidLoad() {
    this.window.title = "Notes";
  }

  async windowShouldClose() {
    return this.app.notes.getSnapshot().content.length === 0;
  }

  showInspector() {
    return this.app.openWindow(InspectorWindow, { title: "Inspector", width: 420, height: 560 });
  }
}
```

`window.title` can be assigned before or after mounting. `window.id`, `window.isKey`,
`window.isMinimised` and `window.frame` read the managed window. `window.minimise()`, `window.zoom()`,
`window.focus()` and `window.close()` operate on it after it mounts; before it mounts or after it
closes they throw `NSE_VIEW_NOT_LOADED`. `window.close()` resolves with `"closed"`, `"cancelled"` or
`"refused"` (when `windowShouldClose` said no). `windowDidLoad` runs once the window mounts, before any
view loads. `windowShouldClose` may return a promise; returning `false` keeps that window open. During an
application quit it is skipped: `applicationShouldTerminate` decides whether the app closes.
`windowWillClose` runs when the close can no longer be stopped; `windowDidBecomeKey` and
`windowDidResignKey` report key-window changes. A window controller opened for a document has `document`.

`openWindow(Controller, options)` also accepts `documentId`, `restorationKey`, `mobilePolicy` and
`preferredBounds`. Bounds are either `{ x, y, width, height }`, `"centred"` or `"cascaded"`; named
placement uses `width`/`height` (or the app defaults) within the current work area. A document ID
opens a secondary window for a live document owned by the app, with the usual document admission checks.
The constructor receives the options, and `openingOptions` retains them.

Name restorable secondary controllers on the application so a fresh launch can recreate the
correct class, not another instance of the main controller:

```ts
class NotesApp extends NSEApplication {
  static mainWindow = NotesWindow;
  static windowControllers = { detachedNote: DetachedNoteWindow };
  detach(documentId: string) {
    return this.openWindow(DetachedNoteWindow, {
      documentId, restorationKey: `note.${documentId}`, title: "Note",
      width: 640, height: 480, preferredBounds: "centred", mobilePolicy: "sheet",
    });
  }
}
```

## View controllers

`NSEViewController` manages a React view and owns child view controllers. `static view` receives
`{ controller }`; use `addChild(ControllerClass)` to create a child under its parent, then render
that child with `NSEViewControllerView`. `viewDidLoad` runs on first mount, followed by the appear
hooks; the disappear hooks run when the view leaves. Reading `view.layer` or `view.element` before
mounting or after unmounting throws `NSE_VIEW_NOT_LOADED`. `fx` gives the controller the FX services
of the mounted application (`motion`, `location`, `haptics`, `midi`, `media`, `video`, `lumina`)
without a hook; each is created on first read and released with the controller. `removeFromParent()`
disposes a child.

```tsx
import { NSEViewController, NSEViewControllerView } from "@syndromatic/syncloudos";
import { AFXShapeLayer } from "@syndromatic/syncloudos/fx/animation";

class SidebarController extends NSEViewController {
  static view = SidebarView;
  viewDidLoad() {
    this.view.layer.addSublayer(new AFXShapeLayer());
  }
}

class WorkspaceController extends NSEViewController {
  static view = WorkspaceView;
  readonly sidebar = this.addChild(SidebarController);
}

function WorkspaceView({ controller }: { readonly controller: WorkspaceController }) {
  return <main><NSEViewControllerView controller={controller.sidebar} /></main>;
}
```

A child's frame imposes no width or height: its parent lays it out, including inside scroll areas.
`viewWillLayout()` and `viewDidLayout()` run after the view's DOM commits and when its frame resizes.
Read `this.view.element` in these callbacks rather than calling controller layout methods from a React effect.

`traitCollection.reducedMotion` comes from the NSE animation environment, including inherited overrides.
`traitCollection.presentation` is the content-bound `SynCloudOSPresentationTraits` snapshot, or `null`
outside an application. Override `traitCollectionDidChange(previous)` to react; controller observers
are notified too. For example, stop a decorative animation when `this.traitCollection.reducedMotion` is true.

## Controller services

Controllers use the same services as thin views, without passing clients back from hooks:

```ts
const page = SCOS.routes.state(routes, "catalogue");
const stop = page.subscribe(() => this.refreshResults(page.getQuery()));
page.pushQuery({ search: "Manchester" });       // replaceQuery updates the current history entry
SCOS.routes.isActive(routes, { name: "catalogue" });
const fonts = SCOS.fonts.manager;
const toolbar = new NSEToolbarController({ owner: this, configuration, items, preferences, runtime: SCOS.menus.runtime });
```

`SCOS.routes.subscribe(listener)` observes committed routing changes. Query clients retain the
route graph's inferred query types and use the same canonical navigation transaction as `useRouteState`.
Keep subscription disposers on the owning controller and release them when it disappears or is disposed.

## Ownership

Controllers created in an application's, window controller's or view controller's field
initialisers or constructor are owned by that object and disposed with it. Child view controllers
are owned by their parent. When an object is disposed, its child view controllers go first, then the
object itself, then the controllers it owns. Quitting an application therefore disposes the deepest
view controllers first, then the window controllers, then the application, each followed by what it owns.

The disposal reason says what triggered it, and every object in the tree records the same one:
`application-closed` when the application quits, `window-closed` when a window closes while the
application keeps running, `removed-from-parent` for a view controller removed with
`removeFromParent()` or replaced as a window's `contentViewController`, and `explicit` when you call
`dispose()`. Read it from `disposalReason`, or from the argument of `onDispose(listener)`.

Creating a controller later—in a method, callback or after an `await`—has no ambient owner while a
class-based application is running (the check covers the whole page, not just the owning app). Pass
`owner: this` to tie it to the current application, window controller or view controller. Use
`ownerSignal` when an abort signal defines its lifetime, or `owner: nseUnowned` (from
`@syndromatic/syncloudos/nse`) only for a controller that the caller will dispose itself. Otherwise
construction throws `NSE_CONTROLLER_UNOWNED`. The same rule covers view controllers, and the
split, tab-bar and navigation-stack controllers, which are view controllers too.
`useNSEArrayController` and related hooks remain available to function component apps.

```ts
import { NSEArrayController } from "@syndromatic/syncloudos/nse";

class NotesApp extends NSEApplication {
  createSearchController() {
    return new NSEArrayController({ id: "search", getId: (item: Note) => item.id, owner: this });
  }
}
```

## AnimationFX layers

`new AFXLayer()` (and the layer subclasses) creates a detached layer. Add it to an attached
`view.layer` with `addSublayer`; it adopts the view's surface and scheduler at that point. A layer
added to a detached parent stays detached until the parent joins an attached tree. Writes made
before attachment are kept and applied when it attaches. Hosts building their own rendering surface
use `createAFXLayer(surface, scheduler)` from `@syndromatic/syncloudos/sdk/animation-host`.

## Function-component shortcut

An app that does not need application or window classes can keep a default-exported function
component. The framework wraps it in a single-window application whose window renders that component, and existing function-component
hooks such as `useCommands`, `useStrings()` and `useNSEArrayController` remain available. Such an app is not
class-based, so controllers it builds with hooks keep the ownership their hooks give them. Class apps
can still use function components for their window and view-controller views.

## Actions and validation

`@action` on a method registers a command on the object that owns it, so the object becomes a responder. The command ID is the method name, scoped to the application. `@action("document.save")` answers a standard command instead. A method named `validate<Name>` supplies the command's validation, and may return a boolean or a validation object.

```ts
class NotesWindowController extends NSEWindowController<NotesApp> {
  static view = NotesView;

  @action newNote() { this.app.notes.add(createNote()); }
  validateNewNote() { return !this.app.readOnly; }          // greys out menu items and buttons

  @action rename(payload: { title: string }) { this.app.selection.title = payload.title; }
  @action("document.save") save() { return this.app.save(); }
}
```

Controls and menus send the action by name; the responder chain does the rest: the focused view controller answers first, then its window controller, then the application.

```tsx
<NSEPushButton action="newNote">New Note</NSEPushButton>
<NSEPushButton action="rename" actionPayload={SCOS.commands.createPayload("title", "Receipts")}>Rename</NSEPushButton>
```

A menu item is `{ kind: "command", id: "new", action: "newNote" }`. Every control and menu item that names the action follows its validation, so one `validateNewNote()` disables them all. [Commands, responders and undo](commands-responders-undo.md#actions-on-class-based-applications) lists the rules: payloads, validation results, standard command IDs and how names resolve.

Actions use the ordinary command payload boundary; an action callback does not bypass it.
Portable payloads are primitives or immutable values constructed by the mounted application's
`SCOS.commands.createPayload("key", value, ...)` and `createPayloadArray(value, ...)`.
Write known fields explicitly, and build nested records and arrays with the same mounted scope.
Raw objects are supported only where the host supplies a native `isProxy` probe that proves their
identity; without it, arbitrary objects fail closed before their properties are inspected.
Builders reject duplicate or non-string keys, unpaired fields and raw nested objects. Keys must
be bounded identifiers beginning with a letter. Do not serialise, clone, spread or enumerate an
unknown object to try to make it an accepted command payload.

`@action({ menuCategory: "edit", keyBindings: [{ key: "f", modifiers: ["primary"], scope: "application" }], allowReservedBrowserShortcut: true })`
uses the same menu and keyboard rules as a command definition. `keyBindings` is a list of the usual
key-binding declarations; browser-reserved shortcuts require the explicit opt-in.

`NSEActionOptions<Payload>.title` also accepts the command title resolver:
`({ payload, runtime }) => ({ key, fallback, values? })`. The payload has the action's declared
type. Use `runtime.locale.t(...)` for a translated fallback; the command pipeline evaluates the
resolver for each payload, and `validate<Name>()` can still override the presented title.

```ts
const headingAction: NSEActionOptions<{ readonly level: number }> = {
  title: ({ payload }) => ({ key: "commands.heading", fallback: `Heading ${payload.level}` }),
};
```

`useAction(name, payload?)` returns `{ perform, enabled, state }`, where `state` is `"off"`, `"on"` or
`"mixed"`. Use it for custom links or artwork; it validates and dispatches through the responder chain:

```tsx
const activation = useAction("openNote", SCOS.commands.createPayload("id", note.id));
return <a href={note.url} aria-disabled={!activation.enabled} onClick={event => {
  event.preventDefault();
  void activation.perform();
}}>{note.title}</a>;
```

`perform(payload?: unknown)` returns a promise of the canonical dispatch result, or `null` when
preparation is rejected or cancelled. `perform()` uses the payload bound by `useAction`; supplying
an argument overrides it, including `perform(undefined)`. Each supplied payload is parsed and
validated afresh against the focused responder chain before execution. Pending preparation is
rejected if command or responder authority changes, the application is disposed, or the hook unmounts.

`enabled` and `state` always describe the bound payload, not a future event's value. For a selection,
search or drop callback, call `perform(eventPayload)` directly: an unavailable bound `undefined`
does not prevent a valid event payload from being prepared. The event payload must still pass the
action's payload schema and `validate<Name>()`; it does not inherit the bound payload's acceptance.

```tsx
const selection = useAction("selectNote");
return <NoteList onSelectionChange={id => {
  void selection.perform(SCOS.commands.createPayload("id", id));
}} />;
```

Segmented controls, popup/picker controls and cover-flow activation also accept `action` and
`actionPayload`, with the same validation as push buttons. They do not call action methods directly.
Without `actionPayload`, segmented controls and cover flow send the activated item's ID, pickers
send the chosen option's value, and a popup-button trigger sends its menu model's ID. Candidate
choices are validated individually. An explicitly supplied payload, including `undefined`, overrides
these defaults; use `actionPayload={undefined}` for a no-argument action.

Prefer a primitive ID when that is all the action needs. For richer, known data, build each level:

```tsx
const notes = SCOS.commands.createPayloadArray(
  SCOS.commands.createPayload("id", firstNote.id),
  SCOS.commands.createPayload("id", secondNote.id),
);
const activation = useAction("openNotes", SCOS.commands.createPayload("notes", notes));
```

DOM nodes, `File` objects or `File[]`, and transformation functions are not command payloads.
Keep those arguments in outlets or domain callbacks, or send a primitive descriptor that the
owning controller resolves. Event-time `perform(...)` arguments follow the same rules as bound
payloads and control `actionPayload` values.

Omit `parentResponderId` on an `NSEPopup` rendered by a class controller. It inherits that
controller's responder ancestry through its portal, so focused editor actions can fall back to the
parent controller's actions while the popup keeps its modal focus scope. Use an explicit parent
only when you intend to change the popup's focus parent.

`useCommands` stays the way to declare commands in a function-component application.

## Observable properties

`@observable accessor` on any `NSEApplication`, window controller, view controller or `NSEObject` publishes a change on that object when the property is set to a different value. Values are compared with `Object.is`, so setting a property to the value it already has does nothing.

```ts
import { NSEObject, observable } from "@syndromatic/syncloudos";

class Note extends NSEObject {
  @observable accessor title = "";
}
```

Notification is per object, not per property: nothing tracks which property a view read, and there are no proxies. Keep collections immutable (replace the array, do not push into it) or use an `NSEArrayController`. For a change that is not an accessor write, call `this.notifyObservers()`.

A view hosted as a controller's `static view` re-renders when its own controller changes. To read another object, call `useObserve(object)`, which re-renders the view on that object's changes and returns the object. It works for `NSEObject`s and for every `NSEController`, and accepts `null` or `undefined` to observe nothing.

```tsx
function NotesView({ controller }: { controller: NotesWindowController }) {
  const title = controller.title;                          // `controller` is observed already
  const folder = useObserve(controller.app.folder);        // another object this view reads
  return <h1>{folder.name}: {title}</h1>;
}
```

Setting a property to a different value publishes one change, and React batches the re-renders of a view observing several objects into one commit.

## Decorators toolchain

Decorators are standard (TC39) decorators. TypeScript compiles them without a flag because the project does not set `experimentalDecorators`. Three tools in the chain need a setting, and the `synCloudOS()` Vite plugin supplies it:

- esbuild leaves decorators in the output for `esnext` targets, which no browser or Node release parses yet, so the plugin marks the feature unsupported and esbuild lowers it for every target. The dev server, the application build and Vitest (which reads the project's Vite configuration) all go through this.
- `@vitejs/plugin-react` runs a Babel pass over `.tsx` files in the dev server for Fast Refresh. The plugin adds the `decorators` and `decoratorAutoAccessors` parser plugins to that pass, so a decorated class in a `.tsx` file parses.

An application that uses a different Vite setup calls the same helpers from `scripts/synware/decorators.mjs` (`decoratorEsbuildOptions` for the `esbuild` option, `addDecoratorParserPlugins` for `api.reactBabel`).

## Hot reload

In the dev server, an application module that default-exports an `NSEApplication` is a hot-reload boundary: editing it never restarts the host. The plugin compares each class in the module with its previous version, by a signature of what a method swap cannot repair: field declarations and their initialisers (instance and static, with decorators), the constructor, the `extends` clause and class decorators. Methods are not part of the signature.

- **Methods changed, fields the same.** Live instances of the changed classes (the application, its window controllers and view controllers) are given the new class's prototype. Methods, actions and validation update immediately, state is kept, and observers are told. Views re-render through React Fast Refresh.
- **A field added, removed or given another initialiser.** That application, and only that application, relaunches with a "Reloaded Notes" notice. The framework does not try to migrate field values. The rest of the OS keeps running.
- **Private members (`#field`, `#method`) or a static block.** A private member's brand belongs to the class that declared it, so these classes sign their whole source: any edit relaunches the application.
- **Shell or framework changes.** Today's whole-host restart is the fallback.

A module whose default export is a function component, or whose update also touches a module that is not an application, takes the dev server's ordinary update path.
