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
<NSEPushButton action="rename" actionPayload={{ title: "Receipts" }}>Rename</NSEPushButton>
```

A menu item is `{ kind: "command", id: "new", action: "newNote" }`. Every control and menu item that names the action follows its validation, so one `validateNewNote()` disables them all. [Commands, responders and undo](commands-responders-undo.md#actions-on-class-based-applications) lists the rules: payloads, validation results, standard command IDs and how names resolve.

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
