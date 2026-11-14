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

## Application menus

Set `NSEApplication.mainMenu` to author File, Edit and View menus. The key window draws the bar above its titlebar, and the host prepends the application menu. Compact widths collapse the bar into one Menu control.

Add `NSEToolbarItem.applicationMenu("gear")` or `NSEToolbarItem.applicationMenu("person")` to the window's toolbar to offer the same application menu from a toolbar button. The menu bar and the button can be used independently.

## Responder provenance for toolbars and menus

An overlay (a toolbar's overflow menu, a menu bar's open menu, a pop-up button's list) must know which responder it belongs to, so that its commands go to the right view controller and focus returns to the right place.

Inside a view controller you do not need to supply this. A window's toolbar, `NSEMenuBar`, `NSEPopUpButton`, `NSEView` and `NSEPopup` use the nearest responder: the view controller (or `ResponderScope`) the control renders inside.

```tsx
// Inside a view controller's view: no overlay props needed
<NSEMenuBar menu={mainMenu} />
```

Do not pass `SCOS.responderId` as the parent. It identifies the application's mount, which sits above every view controller. A command routed from the mount cannot reach an `@action` declared on a view controller below it. Pass `overlay={{ parentResponderId }}` (menu bar or pop-up button) or `menuOverlay={{ id, parentResponderId }}` (a view's menu) only when the control renders outside the responder that should own it. A window's toolbar dispatches from the window controller's responder, or from the application's mount when the window controller declares no actions.

## A window's toolbar (NSToolbar)

A toolbar belongs to a window. Create an `NSEToolbar` with its items and give it to the window; the window draws it under its title bar, validates its command items along the responder chain (an item disables itself when its action's `validate<Name>()` says so), lays the items out to its width and moves those that don't fit into an overflow menu.

```ts
const toolbar = new NSEToolbar({
  identifier: "journal-publisher.toolbar",           // NSToolbar(identifier:)
  items,                                              // every item the toolbar can show
  defaultItemIdentifiers: ["posts", "zoom", "flexible", "publish"],
  allowedItemIdentifiers,                             // what the customisation palette offers; every item when omitted
  displayMode: "iconAndLabel", sizeMode: "regular",
  allowsUserCustomization: true,
  autosavesConfiguration: true,                       // kept in the application's preferences under the identifier
});
this.window.toolbar = toolbar;
toolbar.runCustomizationPalette();                    // the customisation sheet, on the window
toolbar.insertItem("link", 3); toolbar.removeItem(3);
toolbar.isVisible = !compact;                         // a hidden toolbar keeps its items and configuration
toolbar.validateVisibleItems();                       // after state its validators read changes outside an action
```

The window owns the toolbar's command and preference authority, so you do not build a preferences controller or pass a menu runtime. JournalPublisher (`PublisherWindowController.tsx`) and the control gallery's Toolbars section use it.

## The title bar: title, subtitle and accessories

`window.title` names the window's document; on the stage, a window with a title (or titlebar accessories) draws the standard bar's document layout: the application's name leading, then the document centred. `window.subtitle` supplies optional document information in the title bar (Atmo draws it as a status capsule, preserving its case) and `window.isDocumentEdited` marks unsaved changes.

`window.toolbarStyle` takes NSWindow.ToolbarStyle’s `automatic`, `expanded`, `preference`, `unified` or `unifiedCompact`. Atmo draws `expanded` on its own large plate row beneath toolbar items, fixed above scroll content even on a phone. `preference` centres the pane’s title with leading/trailing accessory space. The other three values retain today’s title bar. The gallery sets only its section title and `expanded`; its description is ordinary secondary-colour text in the scroll content. See [the complete Atmo mapping](../windows.md#window-title-and-toolbar-style).

The window owns accessory controllers added with `window.addTitlebarAccessoryViewController(_:)`. The shared title bar places leading and trailing accessories beside the title and bottom accessories below the titlebar row.

```ts
class FileAccessory extends NSETitlebarAccessoryViewController {
  static view = FileMenuButton;
  constructor(readonly owner: DocumentWindowController) { super({ owner }); this.layoutAttribute = "leading"; }
}
this.window.addTitlebarAccessoryViewController(new FileAccessory(this));
```

A textured `NSESegmentedControl` segment can carry a command menu (`menu: NSEMenu`, NSSegmentedControl.setMenu(_:forSegment:)): pressing it shows the menu below the segment, which stays highlighted while the menu is open. Publisher's File accessory is a small one-segment control of this kind.

## The status line: a window's bottom content border

A status line is the window's bottom content border (NSWindow.setContentBorderThickness(_:for: .minY)), not a component. The window paints the band along the bottom of its content; the content lays out its own row of that height at its foot and puts ordinary controls on it, labels drawn `backgroundStyle="raised"` (NSCell.backgroundStyle) so the theme embosses them. The content leaves the band unpainted: an opaque background over it hides it, as an opaque content view does in AppKit.

```ts
this.window.setContentBorderThickness(56, "minY");   // 0 removes it
```

```tsx
<div className="status-line" style={{ blockSize: 56 }}>
  <NSETextField isEditable={false} font="footnote" backgroundStyle="raised">{words} words</NSETextField>
  <NSETextField isEditable={false} font="footnote" backgroundStyle="raised">Saved</NSETextField>
</div>
```

Atmo draws a tall border (44 points or more) as its metal footer and a shorter one as its compact strip. Journal Publisher (56) and FieldLab (28) use it. Only the bottom edge is drawn.

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
