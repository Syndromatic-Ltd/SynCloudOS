# Drag and pasteboard

Copy, cut, paste and drag and drop share one idea from Cocoa: a **pasteboard** holds typed representations of some content, and any application that understands a representation can take it. SynCloudOS provides named pasteboards and a drag session that moves content between responders, windows and applications.

Both clients belong to the session, so an application only ever transfers content through its own mounted endpoints.

## Pasteboards

`useSynWarePasteboard()` returns the pasteboards your application can use:

| Pasteboard | Purpose |
| --- | --- |
| `system` | The general pasteboard, used by Copy and Paste. |
| `drag` | Content in flight during a drag. |
| `find` | The shared find text. |
| `named(name)` | A pasteboard of your own, for private transfers between your windows. |

Each pasteboard offers `write(values)`, `read(types)`, `readFirst(types)`, `snapshot()` and `clear()`. Reads take the types you understand, in order of preference. Every operation accepts an `AbortSignal`, and `changeCount` increases with each write so you can tell whether the content changed since you last looked.

```tsx
import { useSynWarePasteboard } from "@syndromatic/syncloudos/sdk";

export function CopyTitle({ title }: { title: string }) {
  const pasteboards = useSynWarePasteboard();

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

## Drag sessions

`useSynWareDrag()` returns the drag client. A drag moves between **endpoints**, each identified by an application, a window and a responder. `endpoint()` creates one for the current responder.

```tsx
import { useSynWareDrag } from "@syndromatic/syncloudos/sdk";

export function useNoteDrag() {
  const drag = useSynWareDrag();

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

`readPayload(session, types, signal)` returns the representations a destination understands. A session is an opaque token that works only with the client that created it.

## Data views and drag

NSE data views handle these steps for you. Pass a `dragBinding` and `onValidateDrop` and `onAcceptDrop` to `NSETable`, and the table starts sessions, shows insertion feedback and reports drop proposals. `createSynWareNSEDataViewDragBinding` and `createSynWareNSEDragCommandPort` from the SDK entry connect a data view to your session.

## Keyboard and touch

Every pointer drag has a keyboard route through three generic drag commands, and touch uses a long press to lift. When you build custom drag sources, provide the same alternatives, since a drag that only works with a mouse excludes many users.
