# Commands, responders and undo

A menu item, a key press and a toolbar button can all ask the application to do the same thing. SynCloudOS routes these requests through three parts: commands name the operations, the responder chain decides who handles them, and undo histories record how to reverse them. The [class authoring guide](cocoa-authoring.md#actions-and-undo) covers typed action references and declaring undo on actions.

## Commands

A command has an identifier, a title and an `execute` function, and optionally a `validate` function, key bindings and an undo policy. In a function component, declare commands with `useCommands`, which registers them on mount and removes them on unmount. Class-based applications use `@action` instead; see [Actions on class-based applications](#actions-on-class-based-applications).

```tsx
import { useCommands } from "@syndromatic/syncloudos/sdk";

export function useNoteCommands(notes: { add(): string; remove(id: string): void; count: number }) {
  return useCommands([
    {
      id: "com.example.notes.add",
      title: { key: "notes.add", fallback: "Add Note" },
      menuCategory: "edit",
      defaultKeyBindings: [{ key: "n", modifiers: ["primary"], scope: "application" }],
      validate: () => ({ enabled: notes.count < 100, disabledReason: "A notebook holds up to 100 notes." }),
      execute: () => notes.add(),
    },
  ]);
}
```

The hook returns the command client:

| Method | Purpose |
| --- | --- |
| `dispatch(id, payload?)` | Runs a command and resolves with its result. |
| `validate(id, payload?)` | Returns the presentation of the command: title, icon, `enabled`, `denied` and any disabled reason. |
| `validateMany(requests)` | Validates a batch, useful for refreshing a whole menu or toolbar in one pass. |
| `register(declaration)` | Registers a command directly and returns a handle to `dispose()`. |
| `subscribePresentation(listener)` | Calls `listener` whenever command presentation may have changed (registry, responder or focus changes), and returns a disposer. |
| `createPayload(...)`, `createPayloadArray(...)` | Build portable payload records and arrays. See [Applications](applications.md#actions-and-validation). |

Definitions can change between renders. The hook always calls the latest handlers, so you can close over component state without re-registering.

### Titles and localisation

A command title is either a string or `{ key, fallback, values }`. The key resolves through the application's locale resources, so menus and toolbars show the user's language, and the fallback appears when a key is missing.

### Payloads

A command that takes input declares a `payload` schema with a `description` and a `parse` function. `parse` returns `{ ok: true, value }` or `{ ok: false, issues }`. If it returns issues, the command doesn't run and the dispatch reports them.

```ts
const payload = {
  description: "A numeric delta.",
  parse(value: unknown) {
    const delta = (value as { delta?: unknown } | null)?.delta;
    return typeof delta === "number"
      ? { ok: true as const, value: { delta } }
      : { ok: false as const, issues: ["delta must be a number"] };
  },
};
```

### Validation

`validate` returns an object with `enabled`, and optionally `denied`, `hidden`, `state` (`"off"`, `"on"` or `"mixed"`, for checkable items), a replacement `title` and a `disabledReason`. Menus and buttons read this result, so a command disables everywhere at once. Validation can be asynchronous, and receives the command context, including the payload.

A synchronous validator finishes within the event that triggered it, so closing a picker afterwards doesn't undo a check that already passed. An asynchronous check is cancelled if what it was checking changes. Standard controls, pickers and callback menus take their focus context from their class controller, including inside modals, so you don't supply it yourself. Activating a command from the UI also respects `hidden` from the validation that admitted it, but `hidden` is only about presentation: direct API calls are admitted on `enabled` and `denied` alone.

### Execution context

`execute` receives a context with the `commandId`, the `payload`, an `operationId` and `correlationId` for tracing, an `AbortSignal` that fires when the dispatch is superseded or cancelled, and the `source` of the request (menu, key binding, code and so on). Treat an aborted signal as a cancelled operation and skip the late result.

## The responder chain

Every mounted application has a responder, and controls inside it can add their own. When a command has no explicit target, the runtime starts at the focused responder and works outward until one handles it. A text field that handles Copy sees the command first; if it declines, the surrounding view gets a turn, then the application.

`app.responders` exposes the chain to your code:

```tsx
import { useSCOS } from "@syndromatic/syncloudos/sdk";

export function useEditorFocus() {
  const { responders } = useSCOS();
  return {
    focusEditor: () => responders.requestFocus("com.example.notes.editor"),
    focused: () => responders.getFocusedResponderId(),
  };
}
```

A dispatch that reaches no responder returns an unhandled result instead of throwing, and the control that sent it shows the command as unavailable.

## Actions on class-based applications

An application written as classes (see [Applications](applications.md)) declares commands as methods. `@action` registers a command on the object that owns the method, which makes that object (an `NSEApplication`, `NSEWindowController` or `NSEViewController`) a responder.

```ts
import { NSEWindowController, action } from "@syndromatic/syncloudos";

class NotesWindowController extends NSEWindowController<NotesApp> {
  @action newNote() { this.app.notes.add(createNote()); }
  validateNewNote() { return !this.app.readOnly; }

  @action rename(payload: { title: string }) { this.app.notes.selection.title = payload.title; }
  @action("document.save") save() { return this.app.save(); }
}
```

- The command ID is the method name, scoped to the bundle identifier (`newNote` becomes `<bundleIdentifier>.newNote`). `@action("document.save")` answers a standard command ID instead, so the standard menu items and key bindings reach it. `@action({ id, title, payload })` also sets the menu title and a payload schema.
- A method named `validate<Name>()` (`validateNewNote` for `newNote`) validates the action. It returns a boolean or a validation object (`{ enabled, state, title, hidden, disabledReason }`) and can be asynchronous.
- A method takes at most one parameter, the payload. A method with no parameters rejects a payload (one with a default or rest parameter accepts it). Pass a `payload` schema to check what arrives.
- Controls and menu items send actions by name: `<NSEButton action="newNote" title="New Note" />`, `NSESegmentedControl` items with `action`, and menu items `{ action: "newNote" }`. The payload goes in `actionPayload` on a control, segmented item or `NSEMenuItem` (or `payload` on a low-level `MenuActionEntry`). A name containing a dot, such as `document.save`, is used as written. Each control takes its enabled state and checkmark state from the action's validation, so one `validateNewNote()` greys out the menu item and every button.
- Dispatch walks the responder chain: the focused view controller first, then its window controller, then the application. The first object that declares the action runs it.
- `useAction` and action controls revalidate when focus, focus scopes or the active responders change, even if no command was registered or removed, so you don't need to schedule menu validation yourself. A newly mounted action control stays unavailable until its asynchronous validation result arrives, including actions in segmented-control overflow menus.
- Hot reload re-reads a replaced class's actions and validation without re-registering the application.
- An action's availability follows observable changes on its controller and the objects that own it, including application state that a window's validator reads. Disposing the controller removes its registrations and stops delayed work from running through them.
- A declared `validate<Name>` must be a method. An invalid declaration reports an error instead of silently enabling the action, and a failed registration or hot refresh removes all the commands that object registered.
- Standard controls check the action at the moment they're activated, and drop value or selection callbacks that arrive after they unmount or are rebound.

`useCommands` stays the way to declare commands in a function-component application.

## Key bindings

`defaultKeyBindings` attach shortcuts to a command. Each binding names a `key`, a list of `modifiers` and a `scope`. The runtime resolves bindings against the responder chain and ignores them while an input method is composing text. Inside editable fields a binding fires only if it sets `allowInEditable: true`. A binding that would override a shortcut the browser reserves needs `allowReservedBrowserShortcut: true` on the command.

## Undo

An undo history belongs to an owner: the application or one document. Get or create the history for an owner, then register an action that knows how to reverse and reapply a change.

```tsx
import { useSCOS } from "@syndromatic/syncloudos/sdk";

export function useRenameWithUndo(documentId: string, setTitle: (title: string) => void) {
  const { undo } = useSCOS();
  const owner = { kind: "document", id: documentId } as const;
  const history = undo.get(owner) ?? undo.create(owner);

  return (previous: string, next: string) => {
    setTitle(next);
    history.register({
      name: "Rename Note",
      asyncPolicy: "forbid",
      undo: () => setTitle(previous),
      redo: () => setTitle(next),
    });
  };
}
```

`AppUndoHistory` reports `canUndo`, `canRedo`, `undoTitle` and `redoTitle`, and has `undo()`, `redo()` and `subscribe()`. The titles are complete menu titles with the verb included, such as "Undo Rename Note" (or "Undo" when nothing can be undone), so use them as they are without adding "Undo". The standard Edit menu commands already show them.

For an operation that has to finish some work before it knows what to reverse, call `reserve()`. It returns a reservation that you later `commit(action)` or `cancel()`.

Repeated small edits belong in one undo step. Pass `automaticGroup` with a `kind` of `"typing"`, `"drag"` or `"stepper"`, a stable `key` and a `boundaryId`, and the history merges consecutive registrations that share them.

A command can register its undo action for you. Give it an `undo` policy of `{ kind: "register", createAction(context, result) }`, and every execution records an action built from the result. Documents also keep their own history, reached through `documents.workspaceDocuments.getUndoManager(documentId)`. See [Documents](documents.md).

## Accessibility

Commands follow focus whatever the input method. Menu items expose their disabled state and readable titles before they run. When a control collapses into an overflow menu on a compact layout, keep its keyboard shortcut and its focus restoration working.
