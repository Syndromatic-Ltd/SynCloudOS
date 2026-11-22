# Applications

This page covers the classes that make up a class-based application: the application itself, its window controllers and view controllers, and the actions and observable state that connect them to controls. The [class authoring guide](cocoa-authoring.md) covers inline and separate views, automatic root construction, typed action connections, bindings and managed lifetimes.

A class-based app default-exports an `NSEApplication` subclass. The framework creates
one instance per launch (never call `new` on it yourself), opens `static mainWindow` if you set one, and awaits each lifecycle hook in turn:
`applicationWillFinishLaunching`, `applicationDidFinishLaunching`, `applicationDidBecomeActive`,
`applicationWillResignActive` (when the app is suspended), `applicationShouldTerminate`, then
`applicationWillTerminate`. Return `false` (or a promise of it) from `applicationShouldTerminate` to
stop the app quitting; you can present your own confirmation first. The decision must arrive within the close
operation's timeout (`lifecycleHookTimeoutMs`, 5 seconds unless the host raises it). `static routes` and
`static migrations` declare the app's route graph and data migrations, and a `handleBackgroundTask(taskId, { signal })`
method handles background tasks.

`SCOS` is already running when the launch callbacks start, including `applicationWillFinishLaunching`.
Preferences, services, routes and secondary-window creation don't wait for a React view to mount.

The two launch hooks sit on either side of the main window opening:

| Hook | When | Use it for |
| --- | --- | --- |
| `applicationWillFinishLaunching` | Before the main window opens. The window waits for it, including its promise. | Asynchronous setup the windows read: opening the primary document or session, loading content, restoring state. |
| `applicationDidFinishLaunching` | After the launch commits. The main window is open and may already have rendered. | Work that needs the window to exist, or that the window does not depend on. A failure here is reported but does not undo the launch. |

A view that reads state assigned in `applicationDidFinishLaunching` can render before the assignment happens, and fail.

```tsx
import { NSEApplication, NSEWindowController, useObserve } from "@syndromatic/syncloudos";
import { NSEArrayController } from "@syndromatic/syncloudos/nse";

interface Note { readonly id: string }
declare function loadNotes(): Promise<readonly Note[]>;

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

  async applicationWillFinishLaunching() {
    this.notes.setContent(await loadNotes());
  }
  applicationShouldTerminate() { return true; }
}
```

## Window controllers

An `NSEWindowController` represents one window. Its `static view` is a React component that receives
`{ controller }`; or set `contentViewController` to an `NSEViewController` instead. The window
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

You can assign `window.title` before or after the window mounts. `window.id`, `window.isKey`,
`window.isMinimised` and `window.frame` read the managed window. `window.minimise()`, `window.zoom()`,
`window.focus()` and `window.close()` operate on it after it mounts; before it mounts or after it
closes they throw `NSE_VIEW_NOT_LOADED`. `window.close()` resolves with `"closed"`, `"cancelled"` or
`"refused"` (when `windowShouldClose` said no). `windowDidLoad` runs once the window mounts, before any
view loads. `windowShouldClose` may return a promise; returning `false` keeps that window open. It isn't consulted
when the application quits, because `applicationShouldTerminate` decides that.
`windowWillClose` runs when the close can no longer be stopped; `windowDidBecomeKey` and
`windowDidResignKey` report key-window changes. A window controller opened for a document has `document`.

`openWindow(Controller, options)` also accepts `documentId`, `restorationKey`, `mobilePolicy` and
`preferredBounds`. Bounds are `{ x, y, width, height }`, `"centred"` or `"cascaded"`; the named
placements use `width` and `height` (or the app defaults) within the current work area. A document ID
opens a secondary window for a live document the app owns, with the usual document admission checks.
The constructor receives the options, and `openingOptions` keeps them.

Name restorable secondary controllers on the application, so that a fresh launch recreates the
right class instead of another main window:

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
`{ controller }`. Use `addChild(ControllerClass)` to create a child, then place
its view inside yours: `<controller.sidebar.view className="…" />` renders the child's
`view`. `viewDidLoad` runs on first mount, followed by the appear
hooks; the disappear hooks run when the view leaves. Reading `view.layer` or `view.element` before
mounting or after unmounting throws `NSE_VIEW_NOT_LOADED`. `removeFromParent()` disposes a child.

`fx` gives the controller the mounted application's FX services without a hook: `motion`, `location`,
`haptics`, `midi`, `media`, `video` and `lumina`, plus `animation.manageRenderer(outlet)` and
`animation.manageDisplayLink(outlet)` for a canvas whose drawing you own. Each is created the first time you
read it and released with the controller.

`view.layer` backs the view's managed outlet without changing its CSS position or dimensions.
Its bounds follow the outlet's untransformed layout size. Add AnimationFX sublayers in `viewDidLoad`.
The animation system owns opacity and transforms, and unmounting releases the backing layer.

```tsx
import { NSEViewController } from "@syndromatic/syncloudos";
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
  return <main className="workspace-layout">
    <controller.sidebar.view className="workspace-sidebar-region" />
  </main>;
}
```

The optional `className` styles the managed outlet itself; no extra wrapper is added.
Child outlets set no inline display mode, width or height, so the parent can lay them out
as flex or grid items, or leave their height intrinsic inside a scroll area. For example,
`.workspace-sidebar-region { display: flex; flex-direction: column; min-height: 0; }`
lets the parent own the region's layout. Root window frames keep their fill layout.

When a stage becomes key, its managed root view becomes the initial responder, unless the content
marks a `data-nse-initial-focus` target. Focus already inside an editor or a portal is left alone.
Content that arrives after the empty stage took focus inherits that focus directly, without a timer.

`viewWillLayout()` and `viewDidLayout()` run after the view's DOM commits and when its frame resizes.
Read `this.view.element` in these callbacks instead of calling controller layout methods from a React effect.

`traitCollection.reducedMotion` comes from the NSE animation environment, including inherited overrides.
`traitCollection.presentation` is the content-bound `SynCloudOSPresentationTraits` snapshot, or `null`
outside an application. Override `traitCollectionDidChange(previous)` to react; the controller's observers
are notified as well. For example, stop a decorative animation when `this.traitCollection.reducedMotion` is true.

## Controller services

Controllers reach the same services that views use through hooks, without a view passing clients back to them:

```ts
const page = SCOS.routes.state(routes, "catalogue");
const stop = page.subscribe(() => this.refreshResults(page.getQuery()));
page.pushQuery({ search: "Manchester" });       // replaceQuery updates the current history entry
SCOS.routes.isActive(routes, { name: "catalogue" });
const fonts = SCOS.fonts.manager;
this.window.toolbar = new NSEToolbar({ identifier: "notes.toolbar", items, defaultItemIdentifiers, autosavesConfiguration: true });
```

`SCOS.routes.subscribe(listener)` observes committed routing changes. Query clients keep the
route graph's inferred query types and navigate through the same transaction as `useRouteState`.
Keep subscription disposers on the owning controller and call them when it disappears or is disposed.

## Ownership

A controller created while the framework is constructing an application, a window controller or an
`addChild(ControllerClass)` child belongs to that object and is disposed with it. Child view controllers
belong to their parent. When an object is disposed, its child view controllers go first, then the
object itself, then the controllers it owns. Quitting an application therefore disposes the deepest
view controllers first, then the window controllers, then the application, each followed by what it owns.

Calling `new RootController()` yourself inside a window constructor doesn't give Root's own
fields a new owner. Give those fields `owner: this`
(for example, `rows = new NSEArrayController({ ..., owner: this })`) so that replacing Root disposes
them straight away; passing an owner only to Root's constructor doesn't reach its fields.
Use `addChild(ControllerClass)` when you want the framework to construct the child. It can't tell
where an arbitrary JavaScript constructor returns.

A disposed owner rejects new controllers, including during teardown. A window's root view controller can't also
be another window's root or a child view controller; if such an assignment is rejected, the
previous content stays. If construction fails while the framework controls it, the resources acquired so far are released
and you see the original error. A disposed controller revokes its actions and tells its managed
views, which unmount.

The disposal reason says what triggered it, and every object in the tree records the same one:
`application-closed` when the application quits, `window-closed` when a window closes while the
application keeps running, `removed-from-parent` for a view controller removed with
`removeFromParent()` or replaced as a window's `contentViewController`, and `explicit` when you call
`dispose()`. Read it from `disposalReason`, or from the argument of `onDispose(listener)`.

A controller you create later (in a method, in a callback or after an `await`) has no automatic owner while a
class-based application is running, and the check applies to the whole page, not only the owning app. Pass
`owner: this` to tie it to the current application, window controller or view controller. Use
`ownerSignal` when an abort signal defines its lifetime, and `owner: nseUnowned` (from
`@syndromatic/syncloudos/nse`) only for a controller you will dispose yourself. Without one of these,
construction throws `NSE_CONTROLLER_UNOWNED`. The same rule covers view controllers, including the
split, tab-bar and navigation-stack controllers.
Function-component apps can keep using `useNSEArrayController` and the related hooks.

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
`view.layer` with `addSublayer` and it takes on the view's surface and scheduler. A layer
added to a detached parent stays detached until the parent joins an attached tree. Property writes made
before attachment are kept and applied when it attaches. Hosts building their own rendering surface
use `createAFXLayer(surface, scheduler)` from `@syndromatic/syncloudos/sdk/animation-host`.

## Function-component shortcut

An app that doesn't need application or window classes can default-export a function
component. The framework wraps it in a single-window application that renders the component, and
hooks such as `useCommands`, `useStrings()` and `useNSEArrayController` work as before. Because the app isn't
class-based, controllers it builds with hooks keep the ownership their hooks give them. Class apps
can still use function components as the views of their windows and view controllers.

## Actions and validation

`@action` on a method registers a command on the object that owns it, which makes the object a responder. The command ID is the method name, scoped to the application. `@action("document.save")` answers a standard command instead. A method named `validate<Name>` validates the command and returns a boolean or a validation object.

```ts
class NotesWindowController extends NSEWindowController<NotesApp> {
  static view = NotesView;

  @action newNote() { this.app.notes.add(createNote()); }
  validateNewNote() { return !this.app.readOnly; }          // greys out menu items and buttons

  @action rename(payload: { title: string }) { this.app.selection.title = payload.title; }
  @action("document.save") save() { return this.app.save(); }
}
```

Controls and menus send the action by name and the responder chain finds the handler: the focused view controller first, then its window controller, then the application.

Application actions are available from the main surface and from every secondary window the app owns, without
you writing controller or responder IDs. Closing a secondary window removes that window's action
bindings but leaves the application actions in the other windows; reopening it creates a new
window controller.

```tsx
<NSEButton action="newNote" title="New Note" />
<NSEButton action="rename" actionPayload={SCOS.commands.createPayload("title", "Receipts")} title="Rename" />
```

A menu item is `{ kind: "command", id: "new", action: "newNote" }`. Every control and menu item that names the action follows its validation, so one `validateNewNote()` disables them all. [Commands, responders and undo](commands-responders-undo.md#actions-on-class-based-applications) lists the rules: payloads, validation results, standard command IDs and how names resolve.

Action payloads go through the same checks as any command payload; an action callback doesn't skip them.
A portable payload is a primitive, or an immutable value built with the mounted application's
`SCOS.commands.createPayload("key", value, ...)` and `SCOS.commands.createPayloadArray(value, ...)`.
Write known fields explicitly, and build nested records and arrays with the same builders.
Raw objects are accepted only where the host supplies a native `isProxy` probe that proves their
identity; without one, an arbitrary object is rejected before any of its properties are read.
The builders reject duplicate or non-string keys, unpaired fields and raw nested objects. Keys must
be short identifiers that start with a letter. Don't serialise, clone, spread or enumerate an
unknown object to get it accepted as a payload.

`@action({ menuCategory: "edit", keyBindings: [{ key: "f", modifiers: ["primary"], scope: "application" }], allowReservedBrowserShortcut: true })`
follows the same menu and keyboard rules as a command definition. `keyBindings` is a list of ordinary
key-binding declarations, and shortcuts the browser reserves need the explicit opt-in.

When Webspring presents an application stage as key, keyboard focus moves into the application from that runtime's launcher or previous stage. A control that already has focus inside the application (or one of its registered portals) keeps it. Views that aren't key don't take focus, and another runtime's focus is left alone.

`NSEActionOptions<Payload>.title` also accepts the command title resolver:
`({ payload, runtime }) => ({ key, fallback, values? })`. The payload has the action's declared
type. Use `runtime.locale.t(...)` for a translated fallback. The resolver runs for each payload,
and `validate<Name>()` can still override the title that is shown.

```ts
const headingAction: NSEActionOptions<{ readonly level: number }> = {
  title: ({ payload }) => ({ key: "commands.heading", fallback: `Heading ${payload.level}` }),
};
```

`useAction(name, payload?)` returns `{ perform, enabled, state }`, where `state` is `"off"`, `"on"` or
`"mixed"`. Use it for custom links or artwork. It validates and dispatches through the responder chain:

```tsx
const activation = useAction("openNote", SCOS.commands.createPayload("id", note.id));
return <a href={note.url} aria-disabled={!activation.enabled} onClick={event => {
  event.preventDefault();
  void activation.perform();
}}>{note.title}</a>;
```

`perform(payload?: unknown)` returns a promise of the dispatch result, or `null` when
preparation is rejected or cancelled. `perform()` uses the payload bound by `useAction`; passing
an argument, even `perform(undefined)`, overrides it. Each payload you pass is parsed and
validated again against the focused responder chain before it runs. A pending preparation is
rejected if the command or responder changes, the application is disposed or the hook unmounts.

`enabled` and `state` always describe the bound payload, not the value a future event will carry. For a selection,
search or drop callback, call `perform(eventPayload)` directly. A disabled bound `undefined`
doesn't stop a valid event payload from running, but the event payload must still pass the
action's payload schema and `validate<Name>()` on its own.

```tsx
const selection = useAction("selectNote");
return <NoteList onSelectionChange={id => {
  void selection.perform(SCOS.commands.createPayload("id", id));
}} />;
```

`NSEButton`, `NSESegmentedControl`, `NSEPopUpButton`, `NSEPathControl` and `NSEMenu` items accept `action` and `actionPayload`, with the same validation as push buttons, so nothing needs to call action methods directly. Without `actionPayload`, segmented controls send the activated segment's ID, path controls send the clicked item, and a pop-up button trigger sends its menu model's ID or item value. Each candidate choice is validated on its own, and an explicit `actionPayload` (even `undefined`) overrides these defaults. Cover Flow (`NSECollectionView` with `createCoverFlowCollectionLayout`) uses `onSelectionChange` and `onActivate`.

Send a primitive ID when that's all the action needs. For richer data, build each level:

```tsx
const notes = SCOS.commands.createPayloadArray(
  SCOS.commands.createPayload("id", firstNote.id),
  SCOS.commands.createPayload("id", secondNote.id),
);
const activation = useAction("openNotes", SCOS.commands.createPayload("notes", notes));
```

DOM nodes, `File` objects or `File[]`, and functions can't be command payloads.
Keep them in outlets or domain callbacks, or send a primitive descriptor that the
owning controller resolves. Arguments to `perform(...)` follow the same rules as bound
payloads and `actionPayload` values.

Leave out `parentResponderId` on an `NSEPopup` that a class controller renders. The popup inherits the
controller's responder chain through its portal, so actions in a focused editor fall back to the
parent controller's actions while the popup keeps its modal focus scope. Pass an explicit parent
only when you want to change the popup's focus parent.

A sheet, popover or modal window also takes the nearest mounted controller as its focus parent.
An input or button inside a child controller's modal therefore reaches that
child's actions before its ancestors'. An explicit `parentResponderId` takes precedence, but
it still goes through the application's normal focus rules and can't point at
another application's responder. Closing the scope returns focus to the previous responder if it is still live and enabled,
or else to its owning parent.

`useCommands` stays the way to declare commands in a function-component application.

## Observable properties

`@observable accessor` on an `NSEApplication`, window controller, view controller or `NSEObject` publishes a change on that object whenever the property is set to a different value. Values are compared with `Object.is`, so setting a property to the value it already has does nothing.

```ts
import { NSEObject, observable } from "@syndromatic/syncloudos";

class Note extends NSEObject {
  @observable accessor title = "";
}
```

Notification is per object, not per property. Nothing tracks which property a view read, and there are no proxies. Keep collections immutable (replace the array rather than pushing into it) or use an `NSEArrayController`. For a change that isn't an accessor write, call `this.notifyObservers()`.

A view hosted as a controller's `static view` re-renders when its own controller changes. To read another object, call `useObserve(object)`: it re-renders the view when that object changes and returns the object. It works for any `NSEObject` and every NSE controller, and accepts `null` or `undefined` to observe nothing.

```tsx
function NotesView({ controller }: { controller: NotesWindowController }) {
  const title = controller.title;                          // `controller` is observed already
  const folder = useObserve(controller.app.folder);        // another object this view reads
  return <h1>{folder.name}: {title}</h1>;
}
```

Setting a property to a different value publishes one change, and React batches the re-renders of a view observing several objects into one commit.

## Decorators toolchain

SynCloudOS uses standard (TC39) decorators. TypeScript compiles them without a flag as long as the project doesn't set `experimentalDecorators`. Three tools in the build chain need a setting (esbuild, the React plugin's Babel pass and Vitest), and the `synCloudOS()` Vite plugin supplies it:

- esbuild leaves decorators in the output for `esnext` targets, which no browser or Node release parses yet. The plugin marks the feature unsupported, so esbuild lowers it for every target. The dev server, the application build and Vitest (which reads the project's Vite configuration) all go through this.
- `@vitejs/plugin-react` runs a Babel pass over `.tsx` files in the dev server for Fast Refresh. The plugin adds the `decorators` and `decoratorAutoAccessors` parser plugins to that pass, so a decorated class in a `.tsx` file parses.

If your application uses a different Vite setup, apply the same helpers from `scripts/synware/decorators.mjs`: `decoratorEsbuildOptions` for the `esbuild` option and `addDecoratorParserPlugins` for `api.reactBabel`.

## Hot reload

In the dev server, an application module that default-exports an `NSEApplication` is a hot-reload boundary, so editing it never restarts the host. The plugin compares each class in the module with its previous version using a signature of the parts a method swap can't repair: field declarations and their initialisers (instance and static, with decorators), the constructor, the `extends` clause and class decorators. Methods aren't part of the signature.

- Methods changed, fields the same: live instances of the changed classes (the application, its window controllers and view controllers) get the new class's prototype. Methods, actions and validation update immediately, state is kept, and observers are notified. Views re-render through React Fast Refresh.
- A field added, removed or given a different initialiser: that application, and only that one, relaunches with a "Reloaded Notes" notice. The framework doesn't try to migrate field values, and the rest of the system keeps running.
- Private members (`#field`, `#method`) or a static block: a private member's brand belongs to the class that declared it, so these classes sign their whole source and any edit relaunches the application.
- Shell or framework changes: the whole host restarts.

A module whose default export is a function component, or an update that also touches a module that isn't an application, takes the dev server's ordinary update path.
