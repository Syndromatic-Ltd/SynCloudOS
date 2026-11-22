# Windows

A SynWare appears either as a full-stage application or as one or more floating windows. The host owns the window system: it creates windows, orders them, tracks which one is key, restores them after a reload and adapts them to small screens. Your application says what it wants and observes what it gets.

## Window title and toolbar style

`NSEWindowController.window` owns `title`, `subtitle`, `toolbarStyle`, `toolbar` and its title bar accessory controllers. `subtitle` is a string, empty by default, for optional document information.

| `toolbarStyle` | Atmo presentation |
| --- | --- |
| `automatic` (default) | The existing title bar. |
| `expanded` | A large title on its own row below the toolbar items, outside the scrolling content. In a split view it sits above the main pane, leaving the sidebar unchanged. It stays put at compact widths instead of collapsing. |
| `preference` | A centred title on the panel, with equal space for leading and trailing accessories. System Preferences uses it, titled after the selected pane, with Back as a leading accessory. |
| `unified` | The existing title bar, as `automatic`. |
| `unifiedCompact` | The existing title bar, as `automatic`; Atmo uses the same density. |

```ts
this.window.title = "Buttons";
this.window.toolbarStyle = "expanded";
this.window.subtitle = "";
```

The theme draws each style. For a section description under the title, use an ordinary `NSETextField` label with `textColour="secondaryLabelColour"` in the scroll content. While compact adaptive tabs show their More list, the window displays the localised title "More"; `window.title` isn't changed, and your title returns when the list closes or the window leaves compact presentation.

Title bar accessories use `NSETitlebarAccessoryViewController.layoutAttribute` (`leading`, `trailing` or `bottom`), `window.addTitlebarAccessoryViewController(controller)` and `window.removeTitlebarAccessoryViewController(index)`. The window owns and disposes its accessories. See [Title bars and accessories](nse/menus-toolbars-and-inspectors.md#the-title-bar-title-subtitle-and-accessories).

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
  },
} as const;
```

The [manifest reference](synware-manifest.md#windows-and-frame) lists every field. Sizes are in CSS pixels.

## Roles

A window's role describes what it is for, and the host picks the matching presentation.

| Role | Purpose |
| --- | --- |
| `standard` | A primary application or document window. It can own panels, sheets and popovers. |
| `panel` | An inspector or palette that floats beside its owner. |
| `hud` | A compact, translucent heads-up utility. |
| `modal` | A blocking decision or workflow. |
| `sheet` | A modal workflow attached to a parent window. |

A panel can become key, which makes it the target of keyboard commands, without replacing its parent as the main window. The host tracks the two states separately.

## Window identity

In a function component rendered by an application, use `useNSEWindow()` and `useNSEApplication()`; a window controller uses `this.window`. An application shown on Webspring's stage has a real window ID, and moving that window to the floating layer keeps its controller and rendered content.

`window.toggleFullScreen()` asks the host to change presentation, and `window.isFullScreen` changes once the host confirms. The window's regular bounds and zoom state survive the round trip. A standard window with `collectionBehavior = ["fullScreenPrimary"]` can enter full screen.

Override `windowWillEnterFullScreen`, `windowDidEnterFullScreen`, `windowWillExitFullScreen` and `windowDidExitFullScreen` on the window controller to coordinate content with each transition. A refused request calls `windowDidFailToEnterFullScreen` or `windowDidFailToExitFullScreen`. Changes the host starts itself use the same callbacks.

`window.standardWindowButton(kind)` returns the mounted HTML button for `"closeButton"`, `"miniaturizeButton"` or `"zoomButton"`, or `null` when the current presentation doesn't draw that button. The zoom button may toggle full screen.

## Open a window for a document

```tsx
import { useSCOS } from "@syndromatic/syncloudos/sdk";

export function useOpenNoteWindow() {
  const { windows } = useSCOS();
  return (documentId: string) =>
    windows.openDocumentWindow({
      documentId,
      title: "Welcome Note",
      restorationKey: `notes.${documentId}`,
      preferredBounds: { x: 120, y: 90, width: 640, height: 520 },
      mobilePolicy: "fullscreen",
    });
}
```

The `restorationKey` is how the host recognises the same window after a reload, so give each durable window a unique key. `focus(windowId)` brings an existing window forward, and `close(windowId)` asks the host to close one. Closing is asynchronous and can be cancelled or refused, so `close` resolves to `{ outcome: "closed" | "cancelled" | "refused" }`.

## Compact screens

On a phone or a narrow tablet, the host presents each window according to its `mobilePolicy`. Your saved desktop geometry stays intact, because compact presentation never edits the window's bounds.

| Policy | Result on a compact screen |
| --- | --- |
| `fullscreen` | The window fills the screen, inside the safe areas. |
| `sheet` | The window appears as a bottom sheet. |
| `popover-to-sheet` | An anchored popover becomes a sheet. |
| `hidden` | The window does not appear. |

## Layout guides and safe areas

A window's bars (title bar, toolbar, bottom bar and the screen's own edges) change with the theme, the window's style and the screen. Lay content out against the guides the framework measures, not against a bar height that happens to be right today.

| API | What it gives you |
| --- | --- |
| `NSEWindow.contentLayoutRect`, `NSEWindow.contentLayoutGuide` | The part of the window not covered by its title bar and toolbar. The guide's `frame` is always current, and `observe(listener)` reports changes. |
| `useNSESafeArea()` | The current view's insets and the rectangle inside them, accounting for every bar that overlaps it. |
| `NSEView` `additionalSafeAreaInsets` and `onSafeAreaInsetsChange` | Adds insets for your own overlays, and reports when the view's insets change. |
| `NSEViewController.safeAreaInsets` and `viewSafeAreaInsetsDidChange()` | The same values from the controller, and a callback when they change. |
| `NSEScrollView` `automaticallyAdjustsContentInsets` (on by default), `contentInsets` and `scrollerInsets` | Scrolls content under translucent bars while keeping the first and last rows reachable. |
| `useNSEWindowChromeObstruction(edge, thickness, translucent)` | Registers chrome you draw yourself, such as a custom title bar, so every safe area accounts for it. |

In CSS, each view publishes its insets as `--nse-safe-area-inset-top`, `--nse-safe-area-inset-left`, `--nse-safe-area-inset-bottom` and `--nse-safe-area-inset-right`:

```css
.floating-controls {
  position: absolute;
  inset-block-end: calc(var(--nse-safe-area-inset-bottom) + 12px);
  inset-inline: var(--nse-safe-area-inset-left) var(--nse-safe-area-inset-right);
}
```

The Developer MCP reports `idiom.layout-guide` for a raw `env(safe-area-inset-*)` in application CSS, or for a fixed or sticky element offset by a known system bar height.

## Frame appearance

The system draws each title bar. Set `window.titleVisibility`, `window.titlebarAppearsTransparent` or the `fullSizeContentView` style bit to change how chrome sits against content. The layout guide and `window.contentLayoutRect` describe the content area left below the chrome.

`window.titlebarPresentation = "floating"` detaches the title bar of a glass (Cumulus) window, in every toolbar style; the default is `"attached"`. Windows with `texturedBackground` use the Metal material and keep their bars attached. A subclass of `NSEWindowFrameView` can set the title bar's height with `static override titlebarHeight = 28`. To paint the frame, assign an app theme to `window.appearance`; a window whose own appearance is `null` uses its application's. See [App themes](themes.md#app-themes).

## Key, main and focus

Four states are tracked separately so that commands reach the right place:

- The key window receives keyboard commands.
- The main window is the primary standard window of an application.
- The focused responder is the command and undo target inside the window.
- The z-order is the visual stacking of windows, which respects parent and child relationships.

Window commands (`window.close`, `window.minimise`, `window.zoom`, `window.move-by`, `window.resize-by`, `window.cycle-forward` and `window.cycle-backward`) follow the focused responder and then the key window.

## Closing and documents

Closing a window that shows a dirty document starts the document review, where the user can save, discard or cancel. Closing an application closes every window and document it owns as one operation, and reports `closed` only once nothing is left open. Returning to the launcher only changes what the shell shows; it never closes a window or discards a document.

## Restoration

The host saves each window's bounds, minimised and zoomed state, order and document under its `restorationKey`. On the next load it restores parents before children, and reports any window it couldn't restore instead of dropping it silently.

## Accessibility

System title bars use labelled buttons with hit targets of at least 44 by 44 CSS pixels. Modal windows and sheets expose the dialog role, trap focus and make the content behind them inert. Reduced motion removes transform travel without changing ordering, focus or completion, and forced colours mode draws visible outlines around controls and focus.

## Alerts and sheets

An alert is an object: configure it, present it as a sheet on a window, and await the response.

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
| `addButton(title)` | Adds a button and returns it (`NSEAlertButton`: `title`, `keyEquivalent`, `hasDestructiveAction`). The first button responds to Return and a button titled "Cancel" to Escape. With no buttons, the alert shows OK. |
| `buttons` | The buttons in the order they were added. |
| `beginSheetModal(window)` | Attaches the alert to `window` as a sheet, which blocks the window like any sheet, and resolves with `NSEModalResponse.alertFirstButtonReturn` plus the chosen button's index. Escape, or closing the window, chooses the Escape button, or else the last button. |

`NSEModalResponse` has the values `OK`, `cancel`, `stop`, `abort`, `continue`, `alertFirstButtonReturn`, `alertSecondButtonReturn` and `alertThirdButtonReturn`. `window.endSheet(alert, returnCode?)` ends a presented alert, and its promise resolves with `returnCode`, or with the Escape response if you leave it out.

A window controller passes `this.window`. A view controller passes `this.view.window`, which follows its parents and presenters up to the window and is `null` until the view is in one. Present an alert from an action and return, rather than awaiting the alert inside the action. If an action fails after an `await`, show its alert once the action has finished.

### Sheets

For custom content, present a view controller as a sheet:

```ts
const sheet = this.presentAsSheet(LinkSheetViewController, this);   // or presentAsSheet(instance)
sheet.preferredContentSize = { width: 480, height: 0 };
// later
this.dismiss(sheet);   // or, inside the sheet, this.dismiss()
```

The sheet slides down from the top of the window's content, below the title bar, toolbar and accessory row, and is drawn on the alert panel. While it is attached the rest of the window takes no input (the toolbar, accessories and content are inert), and the close button and Close command are refused. Actions go to the sheet first, then its presenter. Its `title`, if set, is drawn above it, and `preferredContentSize.width` sets its width (up to the window's width). Escape and clicking the backdrop call the sheet's `cancelOperation()` if it defines one, and otherwise dismiss it. The presenter owns its sheets: `dismiss` disposes the sheet, and disposing the presenter disposes its sheets too. `presentedViewControllers` and `presentingViewController` report the relationship.

### Modal windows

A view controller can also be presented as an application-modal window, centred over the application. Use it for a panel that isn't tied to one window's content, such as preferences or Jump To:

```ts
@action showPreferences() { this.presentAsModalWindow(PreferencesViewController); }
```

The window takes the controller's `title` as its title and `preferredContentSize.width` as its width, and without a width it sizes to its content. Atmo draws it on the modal plate. The rest of the application takes no input until it is dismissed. Escape calls the controller's `cancelOperation()` if it defines one, and otherwise dismisses it. Actions go to the controller first, then its presenter, which owns it: `dismiss` disposes it.

### Popovers

A popover is a view controller presented next to an element:

```ts
// In a button's click handler:
const popover = this.presentAsPopover(PublishOptionsViewController, { of: event.currentTarget }, this);
```

| `NSEPopoverPositioning` | Meaning |
| --- | --- |
| `of` | The element the popover points at. Required. |
| `relativeTo` | Optional `{ x, y, width, height }` positioning rectangle in `of`'s local coordinates. Omit it to use the whole view. Coordinates follow the view as it moves or scrolls. |
| `preferredEdge` | The edge of `of` it opens from: `"maxY"` (below, the default), `"minY"` (above), `"minX"` or `"maxX"`. It moves to the other side when there is no room. |
| `behavior` | `"transient"` (the default) closes on Escape or a click elsewhere; `"semitransient"` closes on Escape only; `"applicationDefined"` closes only when dismissed. |
| `drawsBackground` | `true` (the default) draws the theme's standard popover background. `false` lets the content view paint its own. The framework still owns the geometry, outline, shadow, clipping, animation and interaction. |

The popover takes the controller's `title` as its accessible name and `preferredContentSize` as its size. On a compact display it is presented as a sheet. It closes when `of` leaves the document. Closing dismisses (and disposes) the controller, so track whether a popover is open in its `didDispose`. To toggle a popover from its button, dismiss the open one instead of presenting a second.

An anchored popover has an arrow aimed at the centre of the positioning view or rectangle, kept clear of the rounded corners. When it needs to, the popover flips to the opposite edge or shifts along its edge, and it keeps its content inside the overlay region or visible work area. Oversized content scrolls inside the popover. Compact sheets have no arrow and keep the same content view when the presentation changes.

Opening scales up from 0.85 around the arrow tip on an AnimationFX spring (sampled into a CSS `linear()` easing), with a slight overshoot that settles in 320 ms. Closing fades and scales down in 150 ms. Repositioning doesn't restart the animation. Under reduced motion (from the animation environment or the system setting) the popover cross-fades briefly without scaling.

For a custom surface such as paper, present the controller with `drawsBackground: false` and set `--nse-popover-content-fill` on its content view's root. Set it to a CSS colour that matches the edge of your surface; the framework paints the arrow with it, in dark appearance too. Paint textures and other artwork in the content view. The framework supplies the rounded clip and shadow, and a content-painted popover has no standard interior padding.

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

Behind `presentAsPopover`, the popover is a real window with the role `popover`, managed by the window system, including when it is drawn as a compact sheet. The window layer handles anchor tracking, dismissal, inspector visibility and focus restoration, and switching between popover and sheet changes the focus scope and frame without replacing the window or its content view. Applications always present popovers through `presentAsPopover`; the `NSEPopover` component that implements them isn't part of the SDK.

### Bottom-bar accessories

`window.bottomBarAccessory` places ordinary views in the window's bottom content border. Set the border's height separately with `window.setContentBorderThickness(56, "minY")`; assigning `null` removes the accessory without changing that height. The window reserves space for the accessory, keeps it in the application's context and makes it inert while a sheet is attached. A source-list app can line up its own footer cells with the sidebar width. This is window chrome; bottom navigation tabs come from `NSETabViewController.tabStyle`.

### Open panels

`NSEOpenPanel.beginSheetModal(window)` presents the panel as a sheet on the window, below its title bar and toolbar. `begin()` and `runModal()` present it modally for the whole application. See [Open panels, folders and application storage](nse/open-panel.md) for file references, media sources, directory permissions and the explicit system-chooser option.
