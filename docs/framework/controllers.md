# Controllers

NSE separates views from controllers. A view draws and handles input. A controller owns the content, the selection and the editing rules, and publishes immutable snapshots that any number of views can read. This page covers the controllers for collections, trees and preferences, and the navigation view controllers. The view controllers for toolbars and menus are described with their views in the [control catalogue](nse-controls.md). For class view ownership, value bindings, tasks and observation lifetimes, see [class authoring](cocoa-authoring.md).

The controllers come from `@syndromatic/syncloudos/nse`, except `NSEPageController` (`@syndromatic/syncloudos/nse/page`) and the `NSEUserDefaults` store (`@syndromatic/syncloudos/foundation`).

View controllers present retained overlays with `present(viewController, animator)` and dismiss them with `dismiss`. An `NSEViewControllerPresentationAnimator` animates presentation and dismissal once both views have mounted. To swap children, use `transition(from, to, options, completionHandler?)`; `view.animator()` and outlet animators apply alpha and frame changes in an `NSEAnimationContext` group. See [animation objects](nse/animation.md) for ownership, transition options and reduced motion.

## Shared behaviour

Every collection controller follows the same rules:

- You construct it with a stable `id`, and its owner disposes it when the owner goes away. [Controller lifetimes](#controller-lifetimes) describes the kinds of owner.
- `getSnapshot()` returns the current immutable snapshot, and `subscribe(listener)` reports changes and returns an unsubscribe function. `subscribeChanges(listener)` delivers each bounded change record.
- Presentation operations such as selection, filtering, sorting and expansion apply immediately.
- Content changes happen inside an edit transaction, which either commits or discards as a unit.
- Items carry a stable identity that you supply. Array position never serves as identity, and duplicate identities are rejected before anything publishes.

A snapshot is a value the controller owns. Plain objects and arrays inside it are frozen, and unchanged items keep their reference across edits, so React components can skip work when nothing they read has changed.

React components read a controller through `useSyncExternalStore`:

```tsx
import { useSyncExternalStore } from "react";
import type { NSEArrayController } from "@syndromatic/syncloudos/nse";

interface Note {
  readonly id: string;
  readonly title: string;
}

export function NoteCount({ controller }: { controller: NSEArrayController<Note, string> }) {
  const snapshot = useSyncExternalStore(controller.subscribe, () => controller.getSnapshot());
  return <output>{snapshot.arranged.length} notes</output>;
}
```

`useObserve(controller)` does the same in one line and returns the controller, so the view can read it directly. It works for every controller here, for any `NSEObject`, and for application, window and view controllers (see [Observable properties](applications.md#observable-properties)):

```tsx
import { useObserve, type NSEArrayController } from "@syndromatic/syncloudos/nse";

export function NoteTitles({ controller }: { controller: NSEArrayController<Note, string> }) {
  const notes = useObserve(controller).getSnapshot().arranged;
  return <ul>{notes.map((note) => <li key={note.id}>{note.title}</li>)}</ul>;
}
```

## Controller lifetimes

A controller lives as long as its owner. Choose the owner by asking who needs the controller:

| Owner | Create it with | Disposed when | Use it for |
| --- | --- | --- | --- |
| The module | `new NSEArrayController(...)` at module scope | Never | Shared, app-wide data that outlives every view, such as a catalogue every window reads. |
| A component | `useNSEArrayController(options, deps)` or `useNSETreeController(options, deps)` | The component unmounts | Data that belongs to one mounted view, such as the rows of a sheet or a sidebar. |
| The application session | `new NSEArrayController({ ..., ownerSignal: useSCOS().signal })` | The application session ends | Data several components of one running application share, created once per session. |
| An application, window or view controller | Construct it in a field initialiser or constructor, or pass `owner: this` | Its owner is disposed | Controllers in a class-based application. See [Applications](applications.md#ownership). |

### Component-owned controllers

The hooks create the controller on the first render and dispose it when the component unmounts:

```tsx
import { useEffect } from "react";
import { NSETableView, useNSEArrayController, type NSETableColumn } from "@syndromatic/syncloudos/nse";

interface Account {
  readonly id: string;
  readonly name: string;
}

const columns: readonly NSETableColumn<Account, string, unknown>[] = [
  { id: "name", title: "Name", value: (account) => account.name, width: { min: 120, ideal: 220, max: 480 } },
];

export function AccountList({ accounts }: { accounts: readonly Account[] }) {
  const controller = useNSEArrayController<Account, string>({
    id: "open-account",
    getId: (account) => account.id,
    content: accounts,
    selection: { mode: "single", allowsEmpty: true },
  });
  useEffect(() => { controller.setContent(accounts); }, [controller, accounts]);
  return (
    <NSETableView
      aria-label="Accounts"
      adapter={{ controller, idForItem: (account) => account.id, labelForItem: (account) => account.name }}
      columns={columns}
    />
  );
}
```

The options are read only when the controller is created. Later renders keep the same controller, so update its content through the controller, as `setContent` does above. To replace the controller with one built from the current options, change `options.id`, `options.responderId` or an entry of the `deps` array; the previous controller is then disposed.

Don't build a controller with `useMemo` and dispose it in a `useEffect` cleanup. React StrictMode runs every effect's cleanup and setup a second time while the component stays mounted, so that pattern disposes the controller the component is still showing, and the next click fails with `NSE_CONTROLLER_DISPOSED`. The hooks wait a microtask before releasing, which StrictMode's replay cancels. When the component really unmounts, its controller is disposed with the reason `"owner-unmounted"`.

### Session-owned controllers

Every controller accepts `ownerSignal?: AbortSignal` and disposes itself when the signal aborts. Passing the application's `useSCOS().signal` ties the controller to the running application, so it is released when the session ends (the application closes, its bundle is replaced or the runtime shuts down) even if nothing disposes it explicitly. It then records the reason `"application-closed"`; any other signal records `"owner-signal-aborted"`. Construction fails with the abort reason if the signal has already aborted.

### Disposal state and errors

`isDisposed` turns true as soon as disposal starts, and `disposalReason` reports why: `"explicit"` for `dispose()`, `"owner-unmounted"`, `"owner-signal-aborted"` or `"application-closed"`. `onDispose(listener)` calls the listener once with that reason and returns an unsubscribe function. On a controller that is already disposed it does nothing, so check `isDisposed` first.

Calling an operation on a disposed controller throws `SynCloudOSLifecycleError`, which `@syndromatic/syncloudos/nse` exports:

| Field | Value |
| --- | --- |
| `name` | `"SynCloudOSLifecycleError"` |
| `code` | `"NSE_CONTROLLER_DISPOSED"` |
| `resource` | `{ kind, id }`, for example `{ kind: "NSEArrayController", id: "open-account" }` |
| `operation` | The method that was refused, such as `"select"` |
| `disposal` | `{ reason, stack? }`; development builds record the stack that disposed the controller |
| `creationStack`, `ownerStack` | Development builds only: where the controller was created, and the React component stack that created it (or, outside a render, the one that raised the error) |

The message says only what couldn't run, for example `Cannot call NSEArrayController.select() after disposal.` The code, resource and disposal reason are in the fields above, and the fix is in the `NSE_CONTROLLER_DISPOSED` catalogue hint; see [error reports](errors.md#error-reports). Data views never let this error escape an event handler: a view whose controller is disposed stops responding, as the [data views guide](data-views.md#controller-lifetime) describes.

### Other resources a component owns

`useNSEDeferredDisposal(resource, scheduler?)` disposes any `{ dispose(): void }` value when its component unmounts, with the same StrictMode-safe delay as the controller hooks. Use it for resources that have no hook of their own, such as a navigation controller or a window surface bridge built with `useMemo`. The default scheduler releases the resource in a microtask; pass an `NSEDisposalScheduler` only to release it on another clock, such as a test's timers.

## Array controller

`NSEArrayController` manages an ordered collection with filtering, sorting and selection.

```ts
import { NSEArrayController } from "@syndromatic/syncloudos/nse";

interface Note {
  readonly id: string;
  readonly title: string;
}

const notes = new NSEArrayController<Note, string>({
  id: "notes",
  getId: (note) => note.id,
  content: [
    { id: "a", title: "Welcome" },
    { id: "b", title: "Shopping" },
  ],
  selection: { mode: "single", allowsEmpty: false },
});

notes.select(["a"]);
notes.selectNext();

notes.beginEditing({ id: "rename", actionName: "Rename Note" });
notes.update("a", (note) => ({ ...note, title: "Hello" }));
const result = notes.commitEditing(); // { status: "committed", ... }
```

The snapshot separates `content` (the source), `arranged` (filtered and sorted) and `selection`. It also carries an `arrangementRevision` and a `selectionRevision`. A change of selection leaves `content`, `arranged` and the change set untouched, so a table can skip re-arranging when only the selection moved.

| Operation | Effect |
| --- | --- |
| `setContent(items)` | Replaces the content. |
| `select(ids)`, `toggleSelection(id)`, `extendSelection(id)` | Selection by identity, with anchor and focus tracking for range extension. |
| `selectNext()`, `selectPrevious()` | Keyboard-style navigation. |
| `insert(item, { beforeId, afterId, select })` | Adds an item at a position. |
| `remove(ids)` | Removes items. When the selection is required, the nearest survivor becomes selected. |
| `update(id, updater)` | Replaces an item with the updater's result. |
| `beginEditing`, `commitEditing`, `discardEditing` | The edit transaction. |

The selection options are `mode` (`"single"` or `"multiple"`), `allowsEmpty`, `preservesSelection` (keep items selected when a filter hides them) and `selectsInsertedObjects`.

## Tree controller

`NSETreeController` does the same for hierarchies. Describe the shape with `getId`, `getChildren` and `withChildren`, and the controller manages expansion, selection and edits.

```ts
import { NSETreeController } from "@syndromatic/syncloudos/nse";

interface Folder {
  readonly id: string;
  readonly name: string;
  readonly children: readonly Folder[];
}

const folders = new NSETreeController<Folder, string>({
  id: "folders",
  getId: (folder) => folder.id,
  getChildren: (folder) => folder.children,
  withChildren: (folder, children) => ({ ...folder, children }),
  content: [{ id: "root", name: "Notebook", children: [] }],
});

folders.expand("root");
```

Filtering keeps an ancestor visible when a descendant matches, and sorting among siblings is stable. `move(ids, destination)` refuses a destination inside the subtree being moved. Supply `loadChildren(item, signal)` to load children on demand; each load gets its own `AbortSignal`, stale results are ignored, and disposal aborts every outstanding load. The controller checks hierarchies up to a depth of 512 and reports a structured error for a cycle or anything deeper.

## Edit transactions

Changing content requires a transaction. Presentation changes never do.

```ts
import type { NSEArrayController } from "@syndromatic/syncloudos/nse";

export function removeNotes(controller: NSEArrayController<{ id: string }, string>, ids: string[]) {
  controller.beginEditing({ id: "remove", actionName: "Remove Notes" });
  controller.remove(ids);
  const result = controller.commitEditing();
  if (result.status === "invalid") console.warn(result.issues);
}
```

`commitEditing()` returns `{ status: "committed" }`, `{ status: "invalid", issues }` or `{ status: "not-editing" }`. A commit publishes one immutable snapshot and registers at most one undo action. `discardEditing()` restores the committed content and selection. When you pass an `undoManager` in the transaction, undo and redo publish through the same path as ordinary edits.

## User defaults controller

`NSEUserDefaultsController` keeps typed, versioned settings in an `NSEUserDefaults` store. `new NSEUserDefaults(SCOS.preferences)` stores them with the application's preferences; `new NSEUserDefaults()` keeps them in memory only.

```ts
import { SCOS } from "@syndromatic/syncloudos";
import { NSEUserDefaults } from "@syndromatic/syncloudos/foundation";
import { NSEUserDefaultsController } from "@syndromatic/syncloudos/nse";

interface EditorPrefs {
  theme: string;
  lineNumbers: boolean;
}

const preferences = new NSEUserDefaultsController<EditorPrefs>({
  namespace: "com.example.notes.editor",
  defaults: new NSEUserDefaults(SCOS.preferences),
  schema: {
    version: 2,
    defaults: { theme: "light", lineNumbers: false },
    fields: {
      theme: { validate: (value): value is string => typeof value === "string" },
      lineNumbers: { validate: (value): value is boolean => typeof value === "boolean" },
    },
    migrations: [
      { from: 1, to: 2, migrate: (value) => ({ ...value, lineNumbers: false }) },
    ],
  },
});

preferences.set("theme", "dark");
```

The schema gives each field a default and a validator, plus a version and an unbroken chain of migrations. On load, the controller repairs invalid fields and writes migrated data back. A record written by a newer schema version is left alone, so an older build never overwrites data it can't read. Outside an edit, `set` and `reset` write immediately. Inside an edit they change a draft, and the commit writes once and can register one undo action. Store writes are synchronous. On its own, `NSEUserDefaults` reads and writes single values with `object(forKey)`, `set(value, forKey)` and `removeObject(forKey)`.

For simple settings, `useSCOS().persistence` (or the `@preference` decorator) needs no controller. Use the user defaults controller when you want schemas, migrations and undoable settings panes.

## Navigation view controllers

`NSETabViewController` owns `NSETabViewItem`s and their child view controllers. Select with `selectedTabViewItemIndex` or `selectTabViewItem(identifier)`, and override `shouldSelect`, `willSelect` and `didSelect` to take part. `segmentedControlOnTop`, `segmentedControlOnBottom`, `toolbar` and `unspecified` are fixed tab styles. `sidebarAdaptable` chooses a sidebar, bottom tabs or a rail (in short landscape layouts) from the trait collection and the space the view actually has. The standard About window uses fixed bottom tabs. Restoration stores the selected identifier, so renaming or translating a tab doesn't affect it.

`NSESplitViewController` owns `NSESplitViewItem`s (`behavior`, `canCollapse`, `isCollapsed`, thickness constraints and holding priority). At a compact size it shows one item at a time: `compactItem` chooses which, and `showDetail(viewController)` moves to an existing detail. The theme draws the Back control, and going back returns focus to where it started. A subclass can override its static view for an app-specific look while the controller keeps managing traits, geometry and the compact selection.

`NSEPageController` handles page navigation; an app can combine it with a split controller, for example a page history of folders and lists beside a note detail.

### Page controller

Import `NSEPageController` and its options, snapshot, transition-style and spine-location types from `@syndromatic/syncloudos/nse/page`. Place it with `<pages.view />`. The controller owns `arrangedObjects`, `selectedIndex`, `navigateForwardToObject`, `navigateBack` and `navigateForward`.

`transitionStyle` is `"stackHistory"` (the default), `"horizontalStrip"` or `"pageCurl"`. `stackHistory` keeps a drill-in history: navigating forward to an object drops the history after the selected page and appends the object. `horizontalStrip` slides between adjacent pages. `pageCurl` prints the selected child controller's view on a turning sheet and reveals the next or previous page underneath; a drag from the leading or trailing edge, a horizontal swipe, or `navigateForward` and `navigateBack` turn the page.

For `pageCurl`, `spineLocation: "min"` (the default) shows one page and `"mid"` shows two-page spreads.

Override `identifierForObject`, `viewControllerForIdentifier` and `prepareViewController` to supply pages, and create children with `this.addChild(...)`. By default `prepareViewController` sets the child's `representedObject`. In `stackHistory` and `horizontalStrip`, pages with the same identifier reuse one child controller. In `pageCurl`, an identifier names the kind of page, and each arranged object keeps its own child, because several printed pages may need their `representedObject` and live view at once. Each live child view is mounted once; the repeated paper faces are inert copies.

The observable snapshot has `selectedIndex`, `count`, `turnProgress` (`0..1`) and `turnDirection` (`"forward"`, `"backward"` or `null`). An app can observe progress to drive its own scene, such as a book opening and closing around the pages. In `pageCurl`, `didTransitionToObject(object)` runs only after a curl completes. A cancelled turn leaves the selected page unchanged and doesn't call it.

Set `selectedIndex` to jump to a distant page without a turn. In curl style, `navigateForwardToObject` accepts only the next arranged page (or spread) and rejects a distant or unarranged object. Navigation before the view loads completes immediately, since there's no sheet to animate.

The curl renderer, its hook, geometry, presets and leaf types are internal, and the standalone `NSEPage` component and `NSE.Page` facade have been removed. The controller draws the curl with WebGL, falls back to CSS, and crossfades under reduced motion. See the [page implementation notes](../../src/NSE/Page/README.md) for the rendering model.

See [source-list windows](nse/source-list-chrome.md) for outline groups, the host's rail seam and window bottom-bar accessories.

## Where to go next

- [Structured data views](data-views.md) bind these controllers to tables, outlines, collections and browsers.
- [Commands, responders and undo](commands-responders-undo.md) explains the undo histories that transactions register with.
