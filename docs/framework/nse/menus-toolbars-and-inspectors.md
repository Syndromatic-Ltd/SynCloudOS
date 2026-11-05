# Menus, toolbars and inspectors in a class application

These are task recipes. Each one names the controls it uses, the layout behaviour each container owns, and the responder provenance its overlays need. The components themselves are documented in [NSE controls](../nse-controls.md).

## Menus are objects

A menu is an `NSEMenu`, as in AppKit an `NSMenu` is an object, not a widget. Make one with a title and its items, and show it in one of three places:

| Where it appears | AppKit | NSE |
| --- | --- | --- |
| A button that opens a list of commands (a pull-down) | `NSPopUpButton` with `pullsDown` | `<NSEPopUpButton pullsDown title="Export" menu={menu} />` |
| A view's contextual menu (secondary click, the context-menu key, Shift-F10, a touch long press) | `NSView.menu` | `<NSEView menu={menu}>…</NSEView>` |
| The menus across the application's menu bar | `NSApplication.mainMenu` | `this.mainMenu = menu` in the application, drawn by `<NSEMenuBar menu={…} />` |

A choice of one value from a list is not a menu of commands: use a pop-up button (`NSEPopUpButton` with `items` and a `value`), described in [Values and progress](values-and-progress.md).

```ts
import { NSEMenu, type NSEMenuItem } from "@syndromatic/syncloudos/nse";

const exportMenu = new NSEMenu({
  owner: this,
  title: "Export",
  items: [
    { action: "exportPDF", title: "PDF…" },
    { action: "exportText" },                       // the action's own title
    { isSeparatorItem: true },
    { title: "More", submenu: [{ action: "exportHTML", title: "HTML…" }] },
  ],
  runtime: SCOS.menus.runtime,
});
```

An item is one of four kinds, as `NSMenuItem` is:

| Item | Fields |
| --- | --- |
| A command | `action` (an `@action` name or reference), `actionPayload`, `title`, `image`, `identifier` |
| A submenu | `title`, `submenu` (its items), `image`, `isEnabled`, `toolTip`, `identifier` |
| A separator | `isSeparatorItem: true` |
| A view | `view`, `title`, `identifier` |

When a menu opens, each command item is validated along the responder chain, as `validateMenuItem(_:)` does: the action's `validate<Name>()` decides whether it is enabled and whether it shows a check mark (its `state`). An item's key equivalent is the action's key binding, so declare the shortcut once, in `@action({ keyBindings })`, and the menu shows it; the binding is also what performs the action from the keyboard.

## A menu bar

The host's application menu (the app name menu in the SynCloudOS top bar) belongs to the system. Open it from your own control with `useApplicationMenuTrigger()`; do not draw your own copy of it.

Most SynWare doesn't need a menu bar of its own. Its commands live in the toolbar, in context menus, and in the host's application menu. Give the application a `mainMenu` only when it is a dense, document- or instrument-style tool whose users expect File/Edit/View menus. Setting `mainMenu` is the opt-in: an application without one has no menu bar. Follow the standard order: File, Edit, View, then your own menus, then Window and Help last. Put the standard items in their standard places (Undo and Redo first in Edit, Close in File).

```tsx
// Contents/index.tsx: the application owns its main menu
async applicationWillFinishLaunching() {
  this.mainMenu = new NSEMenu({
    owner: this,
    title: "Main Menu",
    items: [
      { title: "File", submenu: [{ action: "document.save" }, { action: "exportPDF", title: "Export as PDF…" }] },
      { title: "Edit", submenu: [{ action: "undo" }, { action: "redo" }] },
      { title: "View", submenu: [{ action: "toggleInspector", title: "Inspector" }] },
      { title: "Help", submenu: [{ action: "startDemo", title: "Guided Demonstration" }] },
    ],
    runtime: SCOS.menus.runtime,
  });
}

// In the main window's view (the window controller's `app` is the application)
const { mainMenu } = windowController.app;
{mainMenu ? <NSEMenuBar menu={mainMenu} /> : null}
```

Each item with a submenu is a menu across the bar. As `NSApp.mainMenu` does with the key window, the bar validates and dispatches its items along the responder chain of the window that draws it, so an `@action` on a view controller is enabled when that view controller is in the chain.

## Responder provenance for toolbars and menus

An overlay (a toolbar's overflow menu, a menu bar's open menu, a pop-up button's list) must know which responder it belongs to, so that its commands go to the right view controller and focus returns to the right place.

Inside a view controller you do not need to supply this. `NSEToolbar`, `NSEMenuBar`, `NSEPopUpButton`, `NSEView` and `NSEPopup` use the nearest responder: the view controller (or `ResponderScope`) the control renders inside.

```tsx
// Inside a view controller's view: no interaction or overlay props needed
<NSEToolbar composition="configured" controller={this.toolbar} width={width} aria-label="Lab toolbar" />
<NSEMenuBar menu={mainMenu} />
```

Do not pass `SCOS.responderId` as the parent. It identifies the application's mount, which sits above every view controller. A command routed from the mount cannot reach an `@action` declared on a view controller below it. Pass `interaction={{ parentResponderId, overflowOverlayId }}` (toolbar), `overlay={{ parentResponderId }}` (menu bar or pop-up button) or `menuOverlay={{ id, parentResponderId }}` (a view's menu) only when the control renders outside the responder that should own it. If a toolbar finds no responder at all, it throws an error that explains how to fix it.

## A configured toolbar owned by the window controller

A configured toolbar is a controller with a configuration, items and stored preferences. It adds customisation, overflow into a menu, and command validation: an item disables itself when its action's `validate<Name>()` says so, and re-enables when that changes.

```ts
const preferences = new NSEPreferencesController<NSEToolbarPreferences>({
  owner: this,
  namespace: configuration.identifier,
  schema: {
    version: 1,
    defaults: { itemIds: configuration.defaultItemIds, displayMode: configuration.displayMode, sizeMode: configuration.sizeMode },
    fields: { /* validate itemIds, displayMode and sizeMode */ },
    migrations: [],
  },
  adapter: { read, write, remove },
});
this.toolbar = new NSEToolbarController({ owner: this, configuration, items, preferences, runtime: SCOS.menus.runtime });
```

Render it with `composition="configured"` and the width it can use. Items that don't fit go into the overflow menu; don't wrap them onto a second row. JournalPublisher (`PublisherWindowController.tsx`) builds its toolbar this way.

## A narrow inspector

An inspector of 240 to 320 pixels is narrower than a form is designed for. Use the containers that suit that width:

| Container | What it does at inspector width |
| --- | --- |
| `NSEBox` with a `title` | Titles a group of related controls. The title is the label, so the controls inside it don't each need one. Use one per topic (Font, Spacing, Probe). |
| `NSEPopUpButton` with `labelHidden width="100%"` | Fills the group's width and shows its full value. The label is still read by screen readers. A visible label would share the row with the value and push it into truncation. |
| `NSEGridView` with a label column and a fill column | Puts each label beside its control, but stacks the label above its control below 420 pixels. In an inspector that means stacked labels. Use it there only if that is the layout you want. |

```tsx
<NSEBox title="Probe">
  <NSEPopUpButton label="Resolution" labelHidden width="100%" value={resolution} items={resolutions} onValueChange={setResolution} />
  <NSESlider label="Current" value={current} minimum={0} maximum={20} onValueChange={setCurrent} />
</NSEBox>
```

Give the inspector its width from the split or pane that contains it, and let its controls fill it. Don't make room by shrinking text or changing the theme's control art. JournalPublisher's `PublisherInspector.tsx` follows this pattern.

## Keeping pane content alive across layouts

An `NSESplitViewController` arranges its children side by side or stacked, as `NSSplitViewController` does. Each child is an `NSESplitViewItem` with a `viewController`, its thickness limits and its collapse behaviour, and the controller renders its own split view:

```tsx
import { NSESplitViewController, NSESplitViewItem } from "@syndromatic/syncloudos/nse";

class LabViewController extends NSEViewController {
  readonly split = this.addChild(new NSESplitViewController({
    id: "lab.workspace",
    title: "Laboratory",
    splitViewItems: [
      new NSESplitViewItem({ identifier: "navigator", behavior: "sidebar", viewController: this.addChild(NavigatorViewController), minimumThickness: 220, maximumThickness: 380, preferredThicknessFraction: 0.18 }),
      new NSESplitViewItem({ identifier: "canvas", viewController: this.addChild(CanvasViewController), minimumThickness: 480 }),
      new NSESplitViewItem({ identifier: "inspector", behavior: "inspector", viewController: this.addChild(InspectorViewController), minimumThickness: 268, maximumThickness: 400, preferredThicknessFraction: 0.2 }),
    ],
  }));
}
```

Items with a lower `holdingPriority` take size changes first; when the window cannot fit every item, the highest-priority item that `canCollapse` collapses first. Sidebars and inspectors default to 260 and can collapse; other items default to 250. Collapse an item with `item.isCollapsed = true`, or with the controller's `toggleSidebar()` and `toggleInspector()`, and place a divider with `setPosition(position, dividerIndex)`.

In a compact width the outermost split view shows one item at a time behind tabs labelled with each view controller's `title`; split views nested inside its items stay whole. Each item's view stays mounted when the layout changes, or when an item collapses and reopens. A canvas keeps its context, and component state and scroll position survive. You don't need to lift an item's state out of it to survive a resize.

## What validation checks, and what it doesn't

`syncloudos.validate` checks that the manifest is valid and that the code uses the class-authoring idioms (no stray state hooks, no unmanaged lifecycles, theme colours rather than literals). It does not check composition. It cannot tell you that:

- a pane boundary is fixed when it should be resizable;
- a toolbar wraps instead of overflowing;
- an inspector has no labelled groups;
- a pop-up button's value is truncated;
- the chrome takes too much height from the workspace.

Check those by looking at the application at desktop and phone widths, in light and dark appearance.
