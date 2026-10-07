# Controllers

NSE follows the Cocoa split between views and controllers. A view draws and handles input. A controller owns the content, the selection and the editing rules, and it publishes immutable snapshots that any number of views can read. The controllers here cover collections, trees and preferences. The view controllers for navigation, tabs, toolbars, split views and menus are described with their views in the [control catalogue](nse-controls.md).

All controllers come from `@syndromatic/syncloudos/nse`.

## Shared behaviour

Every collection controller shares one contract:

- You construct it with a stable `id` and dispose it with `dispose()` when its owner finishes.
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

Applications reach per-application settings through `useSynWare().persistence`, which needs no controller. Use the preferences controller when you want schemas, migrations and undoable settings panes.

## Where to go next

- [Structured data views](data-views.md) bind these controllers to tables, outlines, collections and browsers.
- [Commands, responders and undo](commands-responders-undo.md) explains the undo histories that transactions register with.
