# Controllers

NSE follows the Cocoa split between views and controllers. A view draws and handles input. A controller owns the content, the selection and the editing rules, and it publishes immutable snapshots that any number of views can read. The controllers here cover collections, trees and preferences. The view controllers for navigation, tabs, toolbars, split views and menus are described with their views in the [control catalogue](nse-controls.md).

All controllers come from `@syndromatic/syncloudos/nse`.

## Shared behaviour

Every collection controller shares one contract:

- You construct it with a stable `id`, and its owner disposes it when the owner finishes. [Controller lifetimes](#controller-lifetimes) describes the three kinds of owner.
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

`useObserve(controller)` does the same in one line and returns the controller, so a view can read it directly. It works for every controller here, for `NSEObject`s and for application, window and view controllers (see [Observable properties](applications.md#observable-properties)):

```tsx
import { useObserve, type NSEArrayController } from "@syndromatic/syncloudos/nse";

export function NoteTitles({ controller }: { controller: NSEArrayController<Note, string> }) {
  const notes = useObserve(controller).getSnapshot().arranged;
  return <ul>{notes.map((note) => <li key={note.id}>{note.title}</li>)}</ul>;
}
```

## Controller lifetimes

A controller lives exactly as long as its owner. Choose the owner by asking who needs the controller:

| Owner | Create it with | Disposed when | Use it for |
| --- | --- | --- | --- |
| The module | `new NSEArrayController(...)` at module scope | Never | Shared, app-wide data that outlives every view, such as a catalogue every window reads. |
| A component | `useNSEArrayController(options, deps)` or `useNSETreeController(options, deps)` | The component unmounts | Data that belongs to one mounted view, such as the rows of a sheet or a sidebar. |
| The application session | `new NSEArrayController({ ..., ownerSignal: useSCOS().signal })` | The application session ends | Data several components of one running application share, created once per session. |

### Component-owned controllers

The hooks create the controller on the first render and dispose it when the component unmounts:

```tsx
import { useEffect } from "react";
import { NSETable, useNSEArrayController, type NSETableColumn } from "@syndromatic/syncloudos/nse";

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
    <NSETable
      aria-label="Accounts"
      adapter={{ controller, idForItem: (account) => account.id, labelForItem: (account) => account.name }}
      columns={columns}
    />
  );
}
```

The options are read only when a controller is created. Later renders keep the same controller, so update its content through the controller itself, as `setContent` does above. To replace the controller with a new one built from the current options, change `options.id`, `options.responderId` or an entry of the `deps` array. The previous controller is then disposed.

Do not build a controller with `useMemo` and dispose it in a `useEffect` cleanup. React StrictMode runs every effect's cleanup and setup a second time while the component stays mounted, so that pattern disposes the controller the component is still showing, and the next click fails with `NSE_CONTROLLER_DISPOSED`. The hooks defer their release by a microtask, which StrictMode's replay cancels, and an unmounted component's controller is disposed with the reason `"owner-unmounted"`.

### Session-owned controllers

Every controller accepts `ownerSignal?: AbortSignal`. When the signal aborts, the controller disposes itself. Passing the application's `useSCOS().signal` ties the controller to the running application, so a controller the application never disposes is still released when its session ends: the application closes, its bundle is replaced or the runtime shuts down. The controller then records the reason `"application-closed"`. Any other signal records `"owner-signal-aborted"`. A signal that has already aborted is refused at construction with its abort reason.

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

The message states only what could not run, for example `Cannot call NSEArrayController.select() after disposal.` The code, resource identity and disposal reason are the fields above, and the remedy is the `NSE_CONTROLLER_DISPOSED` catalogue hint; see [error reports](errors.md#error-reports). Data views never let this error escape an event handler: a view whose controller is disposed turns inert, as the [data views guide](data-views.md#controller-lifetime) describes.

### Other resources a component owns

`useNSEDeferredDisposal(resource, scheduler?)` disposes any `{ dispose(): void }` value when its component unmounts, with the same StrictMode-safe deferral as the controller hooks. Use it for resources that have no managed hook, such as a navigation controller or a window surface bridge built with `useMemo`. The default scheduler releases the resource in a microtask. Pass an `NSEDisposalScheduler` only to release it on a different clock, such as a test's timers.

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
| `selectNext()`, `selectPrevious()` | Keyboard style navigation. |
| `insert(item, { beforeId, afterId, select })` | Adds an item at a position. |
| `remove(ids)` | Removes items. When the selection is required, the nearest survivor becomes selected. |
| `update(id, updater)` | Replaces an item with the updater's result. |
| `beginEditing`, `commitEditing`, `discardEditing` | The edit transaction. |

The selection options are `mode` (`"single"` or `"multiple"`), `allowsEmpty`, `preservesSelection` to keep filtered out items selected, and `selectsInsertedObjects`.

## Tree controller

`NSETreeController` does the same for hierarchies. You describe the shape with `getId`, `getChildren` and `withChildren`, and the controller manages expansion, selection and edits.

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

Filtering keeps an ancestor visible when a descendant matches, and sibling sorting is stable. `move(ids, destination)` refuses a destination inside the moved subtree. Supply `loadChildren(item, signal)` to load children on demand. Each load owns an `AbortSignal`, stale completions are ignored, and disposal aborts everything outstanding. The controller validates hierarchies iteratively up to a depth of 512 and reports a structured error for cycles or excess depth.

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

## Preferences controller

`NSEPreferencesController` keeps typed, versioned settings behind an adapter that you provide.

```ts
import { NSEPreferencesController } from "@syndromatic/syncloudos/nse";

interface EditorPrefs {
  theme: string;
  lineNumbers: boolean;
}

const preferences = new NSEPreferencesController<EditorPrefs>({
  namespace: "com.example.notes.editor",
  adapter: {
    read: (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    write: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
    remove: (key) => localStorage.removeItem(key),
  },
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

The schema gives each field a default and a validator, plus a version and a contiguous chain of migrations. On load, the controller repairs invalid fields and writes migrated data forward. A record written by a newer schema version is left untouched, so an older build never overwrites data it cannot read. Outside an edit, `set` and `reset` write immediately. Inside an edit they change a draft, and the commit writes once and can register one undo action. The adapter is synchronous by contract.

Applications reach per-application settings through `useSCOS().persistence`, which needs no controller. Use the preferences controller when you want schemas, migrations and undoable settings panes.

## Where to go next

- [Structured data views](data-views.md) bind these controllers to tables, outlines, collections and browsers.
- [Commands, responders and undo](commands-responders-undo.md) explains the undo histories that transactions register with.
