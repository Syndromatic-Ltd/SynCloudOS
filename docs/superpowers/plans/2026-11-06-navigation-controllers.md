# Phase 7: navigation controllers

Phase 7 of the [AppKit fidelity audit](2026-11-05-appkit-fidelity-audit.md). D2 decides it: no UIKit classes. Compact-idiom behaviour comes from AppKit classes presented through the trait collection.

## Today

Three UIKit-shaped controllers interlock in every caller:

| Today | Shape | Callers |
|---|---|---|
| `NSETabBarController` (+ `NSETabBar`, `NSETabBarOverflowList`) | `UITabBarController`: `destinations` with `createContent`, `sections`, a More stack (`moreStack`, `__nse-more`), `onSelect` | About, Journal, JournalOld, Portfolio, Software, the gallery |
| `NSENavigationStackController`, `NSEHierarchyStack` | `UINavigationController`: `rootDestinationId`, `destinationIds`, push and pop | Journal, JournalOld, Portfolio, the gallery |
| `NSEAdaptiveNavigationController` | `UISplitViewController` collapse: `model: "peer" \| "hierarchy"`, `presentation: "bottom-tabs" \| "adaptive"`, `tabController`, `stackController`, `setTraits`, `setContentBounds` | About, Journal, JournalOld, Portfolio, Software, the gallery |
| `NSESourceListScene` | A system frame: sidebar, main, status bar, QuickSwitch rail | Software, the gallery |

## Target

### `NSETabViewController` (`NSTabViewController`, 10.10)

```ts
class AboutViewController extends NSEViewController {
  readonly tabs = this.addChild(NSETabViewController, { tabStyle: "segmentedControlOnBottom" });
  constructor() {
    super();
    for (const id of aboutSectionIds) {
      const item = new NSETabViewItem({ viewController: this.addChild(AboutPaneViewController, this, id) });
      item.label = sectionTitle(id);
      item.image = aboutNavigationIcons[id];
      this.tabs.addTabViewItem(item);
    }
  }
  // <this.tabs.view /> draws the selected item's view and the tab control its tabStyle names.
}
```

- `tabViewItems`, `addTabViewItem(_:)`, `insertTabViewItem(_:at:)`, `removeTabViewItem(_:)`.
- `selectedTabViewItemIndex` (observable, settable).
- `tabStyle`: `"segmentedControlOnTop"`, `"segmentedControlOnBottom"`, `"toolbar"` or `"unspecified"`. Atmo draws `segmentedControlOnBottom` with today's tab-bar art, and `toolbar` puts the items in the window's toolbar as selectable items, as AppKit's preferences windows do.
- `transitionOptions`: `crossfade`, `slideForward`, `slideBackward` and `slideLeft`/`slideRight` (`NSViewController.TransitionOptions`). This replaces About's own `NSEPresence` slide.
- Delegate hooks are overridable methods, as AppKit's `NSTabViewDelegate` methods on the controller are: `tabView(shouldSelect:)`, `tabView(willSelect:)` and `tabView(didSelect:)`. They replace `onSelect`.
- `NSETabViewItem` (`NSTabViewItem`) has `identifier`, `label`, `image`, `toolTip` and `viewController`.
- Restoration: the controller keeps today's `restoration` descriptor, capturing the selected item's `identifier`. It is an NSE extension, matching `NSWindowRestoration`'s role.
- Removed: `destinations`, `createContent`, `sections`, `badge`, the More stack and `__nse-more`, and `NSETabBar` and `NSETabBarOverflowList` as public API. The tab control is the theme's.

### `NSESplitViewController` collapse (`NSSplitViewController`)

The adaptive controller's job, one pane at a time on a compact display, moves to the split view controller and its items:

- `NSESplitViewItem.behavior`: `"sidebar"`, `"contentList"`, `"inspector"` or `"default"` (AppKit's `NSSplitViewItem.Behavior`), plus `canCollapse`, `isCollapsed`, `minimumThickness` and `maximumThickness`.
- When the trait collection's `horizontalSizeClass` is `compact`, the split view controller shows one item at a time. `showDetail(_:)` moves forward from the sidebar to the content; the theme draws a back control that collapses back to the sidebar. Which item shows is observable as `NSESplitViewController.compactItem`. **For the owner:** AppKit has no compact collapse, so this is an NSE behaviour on an AppKit class, as D2 allows; the property name needs approval.
- Removed: `NSEAdaptiveNavigationController`, `model`, `presentation`, `setTraits` (the trait collection already reaches every controller through `traitCollectionDidChange`) and `setContentBounds`.

### `NSEPageController` history (`NSPageController`, `transitionStyle: "stackHistory"`)

Drill-in (Journal's folders, then notes, then a note; Portfolio's library, then a collection, then a reader) is `NSPageController` in history mode:

- `navigateForward(to:)`, `navigateBack(_:)`, `navigateForward(_:)`, `arrangedObjects` (the history), `selectedIndex`.
- `viewControllerForIdentifier` and `identifier(for:)` (the `NSPageControllerDelegate` methods), as overridable methods.
- Removed: `NSENavigationStackController` and `NSEHierarchyStack`. The theme's compact chrome draws the back control from `selectedIndex > 0`.

### The source-list window

`NSESourceListScene` goes. A source-list window's `contentViewController` is an `NSESplitViewController` whose sidebar item holds an `NSEOutlineView` with `selectionHighlightStyle: "sourceList"`. Its bottom bar is the window's content border, after `NSWindow.setContentBorderThickness(_:for: .minY)`: `window.bottomBarAccessory`, holding ordinary views. **For the owner:** AppKit draws the content border but has no accessory for it, so the name needs approval. The QuickSwitch rail stays the host's title-bar chrome.

## Order

Each step ends green (typecheck, tests, the site build, the gallery in light and dark, and pixel diffs of every changed app route).

1. `NSETabViewController` and `NSETabViewItem`. *Done.* The classes (`segmentedControlOnTop`, `segmentedControlOnBottom`, `unspecified`; restoration through `selectTabViewItem(withIdentifier:)`; the leaving item's view exits with `NSEPresence`) and About, pixel-identical in every section on desktop and phone, with its adaptive controller gone. Software and the gallery's source-list examples are source lists, not tabs: they move in steps 3 and 4. `toolbar` and `transitionOptions` wait for a caller.
2. `NSEPageController` `stackHistory`. The gallery's hierarchy examples move, then Portfolio's library to reader.
3. `NSESplitViewController` compact collapse, then Journal and JournalOld (tabs, stack and adaptive together).
4. The source-list window and the bottom bar. Software and the gallery move, and `NSESourceListScene`, `NSESidebar` and `NSEStatusBar` go.
5. `NSESlidingPane` and `NSESlidingPanes` merge into the split view controller's collapsing items.
