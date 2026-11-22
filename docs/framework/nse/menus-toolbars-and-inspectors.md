# Menus, toolbars and inspectors in a class application

This page collects recipes for the menus, toolbars, title bars, status lines and inspectors of a class-based application. Each recipe names the controls it uses, what layout each container handles for you, and which responder its overlays belong to. The components themselves are documented in [NSE controls](../nse-controls.md).

## Menus are objects

A menu is an `NSEMenu` object, not a widget. Make one with a title and its items, and show it in one of three places:

| Where it appears | How |
| --- | --- |
| A button that opens a list of commands (a pull-down) | `<NSEPopUpButton pullsDown title="Export" menu={menu} />` |
| A view's contextual menu (secondary click, the context-menu key, Shift-F10, or a touch long press of 600 ms by default) | `<NSEView menu={menu}>…</NSEView>` |
| The menus across the application's menu bar | `this.mainMenu = menu` in the application, drawn by `<NSEMenuBar menu={…} />` |

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

An item is one of four kinds:

| Item | Fields |
| --- | --- |
| A command | `action` (an `@action` name or reference), `actionPayload`, `title`, `image`, `identifier` |
| A submenu | `title`, `submenu` (its items), `image`, `isEnabled`, `toolTip`, `identifier` |
| A separator | `isSeparatorItem: true` |
| A view | `view`, `title`, `identifier` |

When a menu opens, each command item is validated along the responder chain: the action's `validate<Name>()` decides whether the item is enabled and whether it shows a check mark (its `state`). An item's shortcut is its action's key binding, so declare the shortcut once, in `@action({ keyBindings })`. The menu shows it, and the same binding performs the action from the keyboard.

## Application menus

Set `NSEApplication.mainMenu` to provide your File, Edit and View menus. The key window draws the menu bar above its title bar, and the host adds the application menu at the start. At compact widths the bar collapses into a single Menu control.

To offer the same application menu from a toolbar button, add `NSEToolbarItem.applicationMenu("gear")` (the default glyph) or `NSEToolbarItem.applicationMenu("person")` to the window's toolbar. You can use the menu bar, the button or both.

## Responder provenance for toolbars and menus

An overlay, such as a toolbar's overflow menu, a menu bar's open menu or a pop-up button's list, has to know which responder it belongs to, so that its commands reach the right view controller and focus returns to the right place.

Inside a view controller you don't need to do anything. A window's toolbar, `NSEMenuBar`, `NSEPopUpButton`, `NSEView` and `NSEPopup` use the nearest responder: the view controller (or `ResponderScope`) the control renders inside.

```tsx
// Inside a view controller's view: no overlay props needed
<NSEMenuBar menu={mainMenu} />
```

Don't pass `SCOS.responderId` as the parent. It identifies the application's mount, which sits above every view controller, so a command routed from there can't reach an `@action` declared on a view controller below it. Pass `overlay={{ parentResponderId }}` (menu bar or pop-up button) or `menuOverlay={{ id, parentResponderId }}` (a view's menu) only when the control renders outside the responder that should own it. A window's toolbar dispatches from the window controller's responder, or from the application's mount when the window controller declares no actions.

## A window's toolbar

A toolbar belongs to a window. Create an `NSEToolbar` with its items and give it to the window. The window draws it under the title bar, validates its command items along the responder chain (an item disables itself when its action's `validate<Name>()` says so), lays the items out to fit its width and moves any that don't fit into an overflow menu.

```ts
const toolbar = new NSEToolbar({
  identifier: "journal-publisher.toolbar",           // also the key for the saved configuration
  items,                                              // every item the toolbar can show
  defaultItemIdentifiers: ["posts", "zoom", "flexible", "publish"],
  allowedItemIdentifiers,                             // what the customisation palette offers; every item when omitted
  displayMode: "iconAndLabel", sizeMode: "regular",   // or default/iconOnly/labelOnly, default/small
  allowsUserCustomization: true,
  autosavesConfiguration: true,                       // kept in the application's preferences under the identifier
});
this.window.toolbar = toolbar;
toolbar.runCustomizationPalette();                    // the customisation sheet, on the window
toolbar.insertItem("link", 3); toolbar.removeItem(3);
toolbar.isVisible = !compact;                         // a hidden toolbar keeps its items and configuration
toolbar.validateVisibleItems();                       // when state the validators read changes outside an action
```

The window routes the toolbar's commands and saves its configuration, so you don't need a preferences controller or a menu runtime.

## The title bar: title, subtitle and accessories

`window.title` names the window's document. On the stage, a window with a title or title bar accessories uses the document layout of the standard bar: the application's name at the leading edge and the document in the centre. `window.subtitle` adds optional document information, which Atmo draws as a status capsule without changing its case, and `window.isDocumentEdited` marks unsaved changes.

`window.toolbarStyle` is `automatic` (the default), `expanded`, `preference`, `unified` or `unifiedCompact`. Atmo draws `expanded` as a large plate row of its own beneath the toolbar items, fixed above the scrolling content even on a phone. `preference` centres the pane's title with room for accessories at either side. The other three draw the ordinary title bar. For example, a gallery window can set only its section title and `expanded`, and put its description in the scrolling content as secondary-colour text. See [the complete Atmo mapping](../windows.md#window-title-and-toolbar-style).

Add accessory view controllers with `window.addTitlebarAccessoryViewController(controller)`, and the window owns them from then on. Set each one's `layoutAttribute` to `"leading"`, `"trailing"` or `"bottom"` (the default): leading and trailing accessories sit beside the title, and bottom accessories go below the title bar row.

```ts
class FileAccessory extends NSETitlebarAccessoryViewController {
  static view = FileMenuButton;
  constructor(readonly owner: DocumentWindowController) { super({ owner }); this.layoutAttribute = "leading"; }
}
this.window.addTitlebarAccessoryViewController(new FileAccessory(this));
```

A segment of a textured `NSESegmentedControl` can carry a command menu (`menu: NSEMenu`). Pressing the segment shows the menu below it, and the segment stays highlighted while the menu is open.

## The status line: a window's bottom content border

A status line isn't a component: it's the window's bottom content border. The window paints a band along the bottom of its content, and your content lays out a row of the same height at its foot with ordinary controls on it. Draw labels there with `backgroundStyle="raised"` so the theme embosses them. Leave the band unpainted, because an opaque background over it hides it.

```ts
this.window.setContentBorderThickness(56, "minY");   // 0 removes it
```

```tsx
<div className="status-line" style={{ blockSize: 56 }}>
  <NSETextField isEditable={false} font="footnote" backgroundStyle="raised">{words} words</NSETextField>
  <NSETextField isEditable={false} font="footnote" backgroundStyle="raised">Saved</NSETextField>
</div>
```

Atmo draws a tall border (44 points or more) as its metal footer and a shorter one (such as 28 points) as its compact strip. Only the bottom edge is drawn.

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

Give the inspector its width from the split or pane that contains it, and let its controls fill it. Don't make room by shrinking text or changing the theme's control art.

## Keeping pane content alive across layouts

An `NSESplitViewController` arranges its children side by side or stacked. Each child is an `NSESplitViewItem` with a `viewController`, its thickness limits and its collapse behaviour, and the controller renders its own split view:

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

Items with a lower `holdingPriority` take size changes first, and when the window can't fit every item, the highest-priority item that `canCollapse` collapses first. Sidebars, content lists and inspectors default to 260 and can collapse; other items default to 250. Collapse an item with `item.isCollapsed = true`, or with the controller's `toggleSidebar()` and `toggleInspector()`, and place a divider with `setPosition(position, dividerIndex)`.

In a compact width the outermost split view shows one item at a time behind tabs labelled with each view controller's `title`; split views nested inside its items stay whole. Each item's view stays mounted when the layout changes, or when an item collapses and reopens. A canvas keeps its context, and component state and scroll position survive. You don't need to lift an item's state out of it to survive a resize.

## What validation checks, and what it doesn't

`syncloudos.validate` checks that the manifest is valid and that the code follows the [idiom rules](../developer-mcp/idiom-rules.md), such as no stray state hooks, no unmanaged lifecycles and theme colours instead of literals. It doesn't check how the interface is put together, so it can't tell you that:

- a pane boundary is fixed when it should be resizable;
- a toolbar wraps instead of overflowing;
- an inspector has no labelled groups;
- a pop-up button's value is truncated;
- the chrome takes too much height from the workspace.

Check those by looking at the application at desktop and phone widths, in light and dark appearance.
