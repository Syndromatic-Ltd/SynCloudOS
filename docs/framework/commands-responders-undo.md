# Commands, responders and undo

Desktop applications route user intent through a shared vocabulary: a menu item, a key press and a toolbar button all ask the application to do the same thing. SynCloudOS provides that vocabulary through three cooperating parts. Commands name the operations, the responder chain decides who handles them, and undo histories record how to reverse them.

## Commands

A command has an identifier, a title, an `execute` function and, when useful, a `validate` function, key bindings and an undo policy. You declare commands with `useSynWareCommands`, which registers them on mount and removes them on unmount.

```tsx
import { useSynWareCommands } from "@syndromatic/syncloudos/sdk";

export function useNoteCommands(notes: { add(): string; remove(id: string): void; count: number }) {
  return useSynWareCommands([
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

The hook returns the command client. Its methods cover the whole lifecycle of a command:

| Method | Purpose |
| --- | --- |
| `dispatch(id, payload?)` | Runs a command and resolves with its result. |
| `validate(id, payload?)` | Returns the presentation of the command: title, icon, `enabled`, `denied` and any disabled reason. |
| `validateMany(requests)` | Validates a batch, useful for refreshing a whole menu or toolbar in one pass. |
| `register(declaration)` | Registers a command directly and returns a handle to `dispose()`. |

Definitions may change between renders. The hook reads the latest handlers through a stable reference, so you can close over component state without re-registering.

### Titles and localisation

A command title is either a string or `{ key, fallback, values }`. The key resolves through the application's locale resources, so menus and toolbars show the user's language. The fallback appears when a key is missing.

### Payloads

A command that takes input declares a `payload` schema with a `description` and a `parse` function. `parse` returns `{ ok: true, value }` or `{ ok: false, issues }`. When it returns issues, the command does not run, and the dispatch reports them.

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

`validate` returns an object with `enabled`, and optionally `denied`, `hidden`, `state` (`"off"`, `"on"` or `"mixed"`, for checkable items), a replacement `title` and a `disabledReason`. Menus and buttons read this result, so a command disables everywhere at once. Validation may be asynchronous and receives the command context, including the payload.

### Execution context

`execute` receives a context with the `commandId`, the `payload`, an `operationId` and `correlationId` for tracing, an `AbortSignal` that fires when the dispatch is superseded or cancelled, and the `source` of the request (menu, key binding, code and so on). Treat an aborted signal as a cancelled operation and skip the late result.

## The responder chain

Every mounted application has a responder, and controls inside it may add their own. When a command has no explicit target, the runtime starts at the focused responder and walks outward until one handles it. A text field that handles Copy sees the command first. If it declines, the surrounding view gets a turn, then the application.

`app.responders` exposes the chain to your code:

```tsx
import { useSynWare } from "@syndromatic/syncloudos/sdk";

export function useEditorFocus() {
  const { responders } = useSynWare();
  return {
    focusEditor: () => responders.requestFocus("com.example.notes.editor"),
    focused: () => responders.getFocusedResponderId(),
  };
}
```

A dispatch that reaches no responder returns an unhandled result. It never throws, and the calling control shows the command as unavailable.

## Key bindings

`defaultKeyBindings` attach shortcuts to a command. Each binding names a `key`, a list of `modifiers` and a `scope`. The runtime resolves bindings against the responder chain, ignores them while an input method is composing text, and treats bindings inside editable fields as opt-in through `allowInEditable`. A binding that would shadow a reserved browser shortcut needs `allowReservedBrowserShortcut: true` on the command.

## Undo

Undo histories belong to an owner, either the application or one document. Get or create the history for an owner, then register an action that knows how to reverse and reapply a change.

```tsx
import { useSynWare } from "@syndromatic/syncloudos/sdk";

export function useRenameWithUndo(documentId: string, setTitle: (title: string) => void) {
  const { undo } = useSynWare();
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

`AppUndoHistory` reports `canUndo`, `canRedo`, `undoTitle` and `redoTitle`, and offers `undo()`, `redo()` and `subscribe()`. Menus read the titles to show entries such as "Undo Rename Note".

For an operation that first has to finish work before it knows what to reverse, call `reserve()`. It returns a reservation you either `commit(action)` or `cancel()`.

Repeated small edits belong in one undo step. Pass `automaticGroup` with a `kind` of `"typing"`, `"drag"` or `"stepper"` and a stable `key`, and the history merges consecutive registrations that share them.

A command can register its undo action for you. Give it an `undo` policy of `{ kind: "register", createAction(context, result) }`, and every execution records an action built from the result. Documents also keep their own history, reached through `documents.workspaceDocuments.getUndoManager(documentId)`. See [Documents](documents.md).

## Accessibility

Commands follow focus on every input method. Menu items expose their disabled state and readable titles before execution. When a control collapses into an overflow menu on a compact layout, keep its keyboard shortcut and its focus restoration in place.
