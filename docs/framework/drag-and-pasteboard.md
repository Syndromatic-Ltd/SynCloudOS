# Drag and pasteboard

This page covers copy and paste and drag and drop. Both rest on one idea: a pasteboard holds the same content in several typed representations, and any application that understands one of them can take it. SynCloudOS gives you named pasteboards and a drag session that moves content between responders, windows and applications.

Both clients belong to your session, so your application only ever transfers content through its own mounted endpoints.

## Pasteboards

`usePasteboard()` returns the pasteboards your application can use:

| Pasteboard | Purpose |
| --- | --- |
| `system` | The general pasteboard, used by Copy and Paste. |
| `drag` | Content in flight during a drag. |
| `find` | The shared find text. |
| `named(name)` | A pasteboard of your own, for private transfers between your windows. |

Each pasteboard offers `write(values)`, `read(types)`, `readFirst(types)`, `snapshot()` and `clear()`. Reads take the types you understand, in order of preference. Every operation accepts an `AbortSignal`, and `changeCount` increases with each write so you can tell whether the content changed since you last looked.

```tsx
import { usePasteboard } from "@syndromatic/syncloudos/sdk";

export function CopyTitle({ title }: { title: string }) {
  const pasteboards = usePasteboard();

  async function copy() {
    await pasteboards.system.write([{ type: "text/plain", value: title }]);
  }

  async function paste() {
    return pasteboards.system.readFirst(["text/plain"]);
  }

  return (
    <>
      <button onClick={() => void copy()}>Copy</button>
      <button onClick={() => void paste()}>Paste</button>
    </>
  );
}
```

The system pasteboard reaches the browser clipboard, which needs a user gesture and may prompt for permission. A read or write the browser refuses rejects, so keep the interface working without it.

Write several representations of the same content, richest first, for example an internal type, then `text/html`, then `text/plain`. The receiving application picks the first type it accepts.

When you write binary content, you can pass any `NSEDataConvertible` (`NSEData`, `Uint8Array` or `ArrayBuffer`), including a lazy provider. Reads and snapshots give you immutable `NSEData`, and the representation's `type` holds its MIME type. Only the browser clipboard adapter deals with `Blob`s.

```ts
import { NSEData } from "@syndromatic/syncloudos/foundation";

await pasteboards.system.write([{ type: "image/png", value: pngData }]);
const image = await pasteboards.system.readFirst(["image/png"]);
if (image?.value instanceof NSEData) {
  const download = image.value.blob(image.type); // explicit browser bridge
}
```

## Drag sessions

`useDrag()` returns the drag client. A drag moves between endpoints, each identified by an application, a window and a responder. `endpoint()` creates one for the current responder, or for the responder you name with `{ responderId }`.

```tsx
import { useDrag } from "@syndromatic/syncloudos/sdk";

export function useNoteDrag() {
  const drag = useDrag();

  return {
    start(noteId: string) {
      return drag.begin({
        source: drag.endpoint(),
        representations: [{ type: "application/x-note-id", value: noteId }],
        operations: ["copy", "move"],
      });
    },

    async dropOnto(session: ReturnType<typeof drag.begin>) {
      const result = await drag.updateDestination(session, {
        endpoint: drag.endpoint(),
        operations: ["move"],
        accept: () => true,
      });
      if (result.operation === "none") return drag.cancel(session, "refused");
      drag.claimDrop(session);
      return drag.performDrop(session);
    },
  };
}
```

The lifecycle runs in order:

1. `begin` creates a session with the representations and the operations the source allows (`copy`, `move` or `link`).
2. `updateDestination` reports the current target. The destination lists the operations it supports and may veto through `accept`. The result names the operation that would happen, or `none`.
3. `claimDrop` marks the session as taken by one destination, and `performDrop` completes it, resolving with whether the drop was accepted.
4. `cancel` ends the session at any point, and `cancelUnclaimed` cleans up a session that no destination claimed.

`readPayload(session, types, signal)` returns the representations a destination understands, and `active()` returns the session in progress, if there is one. A session is an opaque token that works only with the client that created it.

## Data views and drag

NSE data views handle these steps for you. Give `NSETableView`, `NSEOutlineView` or `NSECollectionView` a `dragBinding`, a `dragEndpoint`, and `onValidateDrop` and `onAcceptDrop` handlers, and the view starts sessions, shows insertion feedback and reports drop proposals. Create the binding with `createSynWareNSEDataViewDragBinding({ drag, representations, operations?, ownerSignal? })` from the SDK entry. `createSynWareNSEDragCommandPort(commands)` routes the keyboard drag commands through your application's command client.

## Keyboard

Every pointer drag in NSE has a keyboard route through three drag commands, `nse.drag.begin`, `nse.drag.drop` and `nse.drag.cancel`. In the data views, Alt+D picks up the selection, Alt+Enter drops it on the focused row and Escape cancels. If you build your own drag source, give it the same keyboard route: a drag that only works with a mouse shuts out many people.
