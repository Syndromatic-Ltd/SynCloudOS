# Windows

A SynWare appears either as a full stage application or as one or more floating windows. The host owns the window system: it creates windows, orders them, keeps track of which one is key, restores them after a reload and adapts them to small screens. Your application describes what it wants and observes what it gets.

## Window defaults

The manifest's `windowDefaults` block sets the first window the host creates for your application.

```ts
export default {
  schemaVersion: 1,
  id: "com.example.notes",
  version: "1.0.0",
  title: "Notes",
  windowDefaults: {
    title: "Notes",
    width: 920,
    height: 680,
    minimumWidth: 360,
    minimumHeight: 460,
    resizable: true,
    role: "standard",
    chrome: "system",
  },
} as const;
```

The [manifest reference](synware-manifest.md#windows-and-frame) lists every field. Sizes are CSS pixels.

## Roles

A window's role describes what it is for, and the host picks the matching presentation.

| Role | Purpose |
| --- | --- |
| `standard` | A primary application or document window. It can own panels, sheets and popovers. |
| `panel` | An inspector or palette that floats beside its owner. |
| `hud` | A compact, translucent heads-up utility. |
| `modal` | A blocking decision or workflow. |
| `sheet` | A modal workflow attached to a parent window. |

A panel can become key, which makes it the target of keyboard commands, without replacing its parent as the main window. The host keeps the two states apart, as Cocoa does.

## Observe your windows

`useWindow()` returns the window client and a live snapshot of the windows your application owns.

```tsx
import { useWindow } from "@syndromatic/syncloudos/sdk";

export function WindowStatus() {
  const { client, snapshot } = useWindow();
  return (
    <p>
      {snapshot.owned.length} window(s) open. Key window:{" "}
      {snapshot.owned.find((window) => window.isKey)?.title ?? "none"}.
      <button onClick={() => snapshot.current && void client.close(snapshot.current.id)}>Close this window</button>
    </p>
  );
}
```

The snapshot's `state` is `"open"` or `"closed"`, `current` is the window that hosts this session, and `owned` lists every window your application has open. Each entry reports its `title`, `bounds`, `state` (`"opening"`, `"open"`, `"minimised"` or `"closing"`), the document it shows, whether it is `isKey` or `isMain`, and its mobile policy.

## Open a window for a document

```tsx
import { useWindow } from "@syndromatic/syncloudos/sdk";

export function useOpenNoteWindow() {
  const { client } = useWindow();
  return (documentId: string) =>
    client.openDocumentWindow({
      documentId,
      title: "Welcome Note",
      restorationKey: `notes.${documentId}`,
      preferredBounds: { x: 120, y: 90, width: 640, height: 520 },
      mobilePolicy: "fullscreen",
    });
}
```

The `restorationKey` is how the host recognises the same window after a reload. Give each durable window a unique key. `focus(windowId)` brings an existing window forward, and `close(windowId)` asks the host to close one. Closing is asynchronous and can be cancelled or refused, so `close` resolves to `{ outcome: "closed" | "cancelled" | "refused" }`.

## Compact screens

On a phone or a narrow tablet the host presents each window according to its `mobilePolicy`. Your saved desktop geometry stays intact, because compact presentation is a projection of the window and never edits its bounds.

| Policy | Result on a compact screen |
| --- | --- |
| `fullscreen` | The window fills the screen, inside the safe areas. |
| `sheet` | The window appears as a bottom sheet. |
| `popover-to-sheet` | An anchored popover becomes a sheet. |
| `hidden` | The window does not appear. |

## Custom title bars

Set `windowDefaults.chrome` to `"custom"` and export a named `windowChrome` component from the application entry to draw the title bar yourself. The component receives the window's state and actions.

```tsx
import type { PointerEvent } from "react";
import type { AppWindowChromeProps } from "@syndromatic/syncloudos/sdk";

function Chrome(props: AppWindowChromeProps) {
  const move = props.createMoveRegionProps();
  const onPointerDown = (event: PointerEvent<HTMLElement>) =>
    move.onPointerDown({
      button: event.button,
      isPrimary: event.isPrimary,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target as Element,
      currentTarget: event.currentTarget,
    });

  return (
    <header onPointerDown={onPointerDown} data-key={props.isKey}>
      <button aria-label="Close" onClick={() => void props.close()} disabled={!props.closable} />
      <button aria-label="Minimise" onClick={props.minimise} disabled={!props.minimisable} />
      <button aria-label="Zoom" onClick={props.zoom} disabled={!props.zoomable} />
      <h1 id={props.titleId}>{props.title}{props.dirty ? " (edited)" : ""}</h1>
    </header>
  );
}

export const windowChrome = Chrome;
export default function App() { return <main>Application content</main>; }
```

`createMoveRegionProps()` returns the pointer handler that drags the window. The handler takes a plain structural event, so a React component forwards the fields it needs, as the example shows. Use `"frameless"` when the application draws no title bar at all. Give every custom control a label and a touch target of at least 44 by 44 CSS pixels, even when the painted glyph is smaller.

## Key, main and focus

Four states stay separate so that commands reach the right place:

- The key window receives keyboard commands.
- The main window is the primary standard window of an application.
- The focused responder is the command and undo target inside the window.
- The z-order is the visual stacking of windows, which respects parent and child relationships.

Window commands (`window.close`, `window.minimise`, `window.zoom`, `window.move-by`, `window.resize-by`, `window.cycle-forward` and `window.cycle-backward`) follow the focused responder and then the key window.

## Closing and documents

Closing a window that shows a dirty document starts the document review: the user can save, discard or cancel. Closing an application closes every window and document it owns as one operation, and reports `closed` only once nothing remains open. Returning to the launcher only changes what the shell shows. It never closes a window or discards a document.

## Restoration

The host saves each window's bounds, minimised and zoomed state, order and document association under its `restorationKey`. On the next load it restores parents before children, and it reports the windows it could not restore instead of dropping them silently.

## Accessibility

System title bars use labelled buttons with hit targets of at least 44 by 44 CSS pixels. Modal windows and sheets expose the dialog role, trap focus and make the content behind them inert. Reduced motion removes transform travel without changing ordering, focus or completion, and forced colours mode draws visible outlines around controls and focus.
