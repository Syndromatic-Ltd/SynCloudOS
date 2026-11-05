# Menus, toolbars and inspectors in a class application

These are task recipes. Each one names the controls it uses, the layout behaviour each container owns, and the responder provenance its overlays need. The components themselves are documented in [NSE controls](../nse-controls.md).

## Choosing a menu control

Four controls open menus. They look different and mean different things, so choose by what the user is doing, not by which one renders a menu.

| You want | Use | It looks like |
| --- | --- | --- |
| A row of text menu titles (File, Edit, View…) inside your window | `NSEMenuBar` | Plain text titles; the open title highlights; hovering across titles switches menus; arrow keys move between them. |
| One button that opens a list of commands (a pull-down) | `NSEMenu` with `trigger="push"` (the default) | A push button with a disclosure arrow. |
| A pull-down that sits in a toolbar or tool strip | `NSEMenu` with `trigger="tool"` | A tool capsule with a disclosure arrow. It is still a button, not a menu title. |
| A choice of one value from a list | `NSEPicker` or `NSEPopupButton` | A pop-up button showing the current value. |

The host's application menu (the app name menu in the SynCloudOS top bar) belongs to the system. Do not draw your own copy of it.

Most SynWare doesn't need a menu bar of its own. Its commands live in the toolbar, in context menus, and in the host's application menu. Add an `NSEMenuBar` only when the application is a dense, document- or instrument-style tool whose users expect File/Edit/View menus. When you add one, follow the standard order: File, Edit, View, then your own menus, then Window and Help last. Put the standard items in their standard places (Undo and Redo first in Edit, Close in File).

```tsx
// Contents/menus.ts: one owned controller per menu, all on the app's menu port
const fileMenu = new NSEMenuController({ owner: this, model: fileModel, runtime: SCOS.menus.runtime });
const editMenu = new NSEMenuController({ owner: this, model: editModel, runtime: SCOS.menus.runtime });

// In the view controller's view
<NSEMenuBar items={[
  { model: fileModel, controller: fileMenu },
  { model: editModel, controller: editMenu },
  { model: viewModel, controller: viewMenu },
  { model: helpModel, controller: helpMenu },
]} />
```

## Responder provenance for toolbars and menus

An overlay (a toolbar's overflow menu, a menu bar's open menu, a picker's list) must know which responder it belongs to, so that its commands go to the right view controller and focus returns to the right place.

Inside a view controller you do not need to supply this. `NSEToolbar`, `NSEMenuBar`, `NSEMenu`, `NSEPicker` and `NSEPopup` use the nearest responder: the view controller (or `ResponderScope`) the control renders inside.

```tsx
// Inside a view controller's view: no interaction or overlay props needed
<NSEToolbar composition="configured" controller={this.toolbar} width={width} aria-label="Lab toolbar" />
<NSEMenuBar items={menuBarItems} />
```

Do not pass `SCOS.responderId` as the parent. It identifies the application's mount, which sits above every view controller. A command routed from the mount cannot reach an `@action` declared on a view controller below it. Pass `interaction={{ parentResponderId, overflowOverlayId }}` (toolbar) or `overlay={{ parentResponderId }}` (menu bar) only when the control renders outside the responder that should own it. If a toolbar finds no responder at all, it throws an error that explains how to fix it.

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
| `NSEGroupBox` | Titles a group of related controls. The title is the label, so the controls inside it don't each need one. Use one per topic (Font, Spacing, Probe). |
| `NSEPicker` with `labelHidden width="100%"` | Fills the group's width and shows its full value. The label is still read by screen readers. A visible label would share the row with the value and push it into truncation. |
| `NSEForm` | Puts each label beside its control, but stacks the label above its control below 420 pixels. In an inspector that means stacked labels. Use it there only if that is the layout you want. |

```tsx
<NSEGroupBox label="Probe">
  <NSEPicker label="Resolution" labelHidden width="100%" value={resolution} options={resolutions} onValueChange={setResolution} />
  <NSESlider label="Current" value={current} minimum={0} maximum={20} onValueChange={setCurrent} />
</NSEGroupBox>
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
- a picker's value is truncated;
- the chrome takes too much height from the workspace.

Check those by looking at the application at desktop and phone widths, in light and dark appearance.
