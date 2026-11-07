# Windows

A SynWare appears either as a full stage application or as one or more floating windows. The host owns the window system: it creates windows, orders them, keeps track of which one is key, restores them after a reload and adapts them to small screens. Your application describes what it wants and observes what it gets.

## Window defaults

The manifest's `windowDefaults` block sets the first window the host creates for your application.

```ts
export default {
  schemaVersion: 1,
  bundleIdentifier: "com.example.notes",
  version: "1.0.0",
  displayName: "Notes",
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

## Alerts and sheets

An alert is an object, after `NSAlert`. Configure it, present it as a sheet on a window, and await the response:

```ts
const alert = new NSEAlert();
alert.messageText = `Delete “${post.title}”?`;
alert.informativeText = "You cannot undo this action.";
alert.addButton("Delete").hasDestructiveAction = true;
alert.addButton("Cancel");
if (await alert.beginSheetModal(this.window) === NSEModalResponse.alertFirstButtonReturn) this.delete(post);
```

| Member | Purpose |
| --- | --- |
| `messageText`, `informativeText` | The title and the text under it. `messageText` is required to present. |
| `alertStyle` | `"warning"` (default), `"informational"` or `"critical"`. |
| `addButton(title)` | Adds a button and returns it (`NSEAlertButton`: `title`, `keyEquivalent`, `hasDestructiveAction`). The first button takes Return; a button titled "Cancel" takes Escape. With none, the alert shows OK. |
| `buttons` | The buttons in the order they were added. |
| `beginSheetModal(window)` | Attaches the alert to `window` as a sheet, which blocks the window as any sheet does, and resolves with `NSEModalResponse.alertFirstButtonReturn + index` of the chosen button. Escape, or closing the window, chooses the Escape button, else the last. |

`NSEModalResponse` names AppKit's responses: `OK`, `cancel`, `stop`, `abort`, `continue` and `alertFirstButtonReturn`, `alertSecondButtonReturn`, `alertThirdButtonReturn`. `window.endSheet(alert, returnCode?)` ends a presented alert (`NSWindow.endSheet(_:returnCode:)`); its promise resolves with `returnCode`, or the Escape response when omitted.

A window controller passes `this.window`; a view controller passes `this.view.window` (`NSView.window`), which follows its parents and presenters to the window, or is `null` before it is in one. Present an alert from an action and return; do not await the alert inside the action. An action that fails after an `await` should show its alert once it has finished.

### Sheets

Custom content is a view controller presented as a sheet, after `NSViewController.presentAsSheet(_:)`:

```ts
const sheet = this.presentAsSheet(LinkSheetViewController, this);   // or presentAsSheet(instance)
sheet.preferredContentSize = { width: 480, height: 0 };
// later
this.dismiss(sheet);   // or, inside the sheet, this.dismiss()
```

The sheet attaches to the window: it slides down from the top edge of the window's content, under the title bar, toolbar and accessory row, and is drawn on the alert panel. While it is attached the rest of the window takes no input (the toolbar, accessories and content are inert) and the close button and Close command are refused, as `performClose(_:)` refuses with a sheet attached. Its actions reach its presenter after itself. Its `title`, when set, is drawn above it, and `preferredContentSize.width` sets its width (capped to the window). Escape and the backdrop send the sheet `cancelOperation()` when it defines one, and otherwise dismiss it. The presenter owns its sheets: `dismiss` disposes the sheet, and disposing the presenter disposes them. `presentedViewControllers` and `presentingViewController` report the relationship.

### Modal windows

A view controller can also be presented as an application-modal window, centred over the application, after `NSViewController.presentAsModalWindow(_:)`. Use it for a panel that is not tied to one window's content, such as preferences or Jump To:

```ts
@action showPreferences() { this.presentAsModalWindow(PreferencesViewController); }
```

The window takes the controller's `title` as its title and `preferredContentSize.width` as its width; without one it sizes to its content. Atmo draws it on the modal plate. The rest of the application takes no input until it is dismissed. Escape sends the controller `cancelOperation()` when it defines one, and otherwise dismisses it. Its actions reach its presenter after itself, and the presenter owns it: `dismiss` disposes it.

### Popovers

A popover is a view controller presented next to an element, after `NSViewController.present(_:asPopoverRelativeTo:of:preferredEdge:behavior:)`:

```ts
// In a button's click handler:
const popover = this.presentAsPopover(PublishOptionsViewController, { of: event.currentTarget }, this);
```

| `NSEPopoverPositioning` | Meaning |
| --- | --- |
| `of` | The element the popover points at (NSPopover's positioning view). Required. |
| `relativeTo` | Optional `{ x, y, width, height }` positioning rectangle in `of`'s local coordinates. Omit it to use the whole view. Coordinates follow the view as it moves or scrolls. |
| `preferredEdge` | The edge of `of` it opens from: `"maxY"` (below, the default), `"minY"` (above), `"minX"` or `"maxX"`. It moves to the other side when there is no room. |
| `behavior` | `"transient"` (the default) closes on Escape or a click elsewhere; `"semitransient"` closes on Escape only; `"applicationDefined"` closes only when dismissed. |
| `drawsBackground` | `true` (default) draws Atmo's standard Aqua plate. `false` lets the content view paint its own plate, using the `NSScrollView` / `NSTextField.drawsBackground` idiom. Geometry, outline, shadow, clipping, animation and interaction remain framework-owned. |

The popover takes the controller's `title` as its accessible name and `preferredContentSize` as its size. On a compact display it is presented as a sheet. It closes when `of` leaves the document. Closing dismisses (disposes) the controller, so a controller that tracks whether its popover is open does so in `didDispose`. To toggle a popover from its button, dismiss the open one rather than presenting a second.

An anchored popover has an arrow aimed at the positioning view or rectangle's centre, clamped clear of the rounded corners. It flips to the opposite edge when necessary, shifts along that edge, and limits its content to the overlay region or visible work area. Oversized content scrolls inside the plate. Compact sheets have no arrow and retain the same content view when their presentation changes.

Opening scales from 0.85 around the arrow tip, with an AnimationFX spring sampled into CSS `linear()` easing: a subtle overshoot settles in 320 ms. Closing fades and scales down in 150 ms. Repositioning does not restart the animation. The existing animation environment's reduced-motion preference, and the system media query, select a short cross-fade without scale.

For a paper surface, present the controller with `drawsBackground: false` and set `--nse-popover-content-fill` on its content view's root. This custom property is a CSS **colour**, matching the paper at its edge; the framework uses it for the arrow, including in dark appearance. Paint textures or other artwork in the content view itself. The framework supplies the rounded clip and shadow; content-painted popovers have no standard interior padding.

```ts
this.presentAsPopover(CollectionViewController, {
  of: event.currentTarget,
  preferredEdge: "maxY",
  drawsBackground: false,
}, this);
```

```css
.collection-popover {
  --nse-popover-content-fill: #efe2c6;
  background: #efe2c6;
  color: #55462d;
  padding: 22px;
}
```

The internal `NSEPopover` component takes the same `drawsBackground` and `relativeTo` options. Anchored and content-painted popovers stay in the canonical overlay stack, including when a generic physical-window bridge is available, so their frame and interaction have one owner. The physical-window bridge remains available for unanchored standard surfaces. `NSEPopover` is not a new public SDK export; applications present their view controllers through `presentAsPopover`.

