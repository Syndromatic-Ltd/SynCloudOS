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
- `tabStyle`: `"segmentedControlOnTop"`, `"segmentedControlOnBottom"`, `"toolbar"` or `"unspecified"` are fixed AppKit styles. The approved NSE extension `"sidebarAdaptable"` selects sidebar, bottom tabs or a rail from the trait collection and measured content allocation. Atmo draws `segmentedControlOnBottom` with today's tab-bar art, and `toolbar` puts the items in the window's toolbar as selectable items, as AppKit's preferences windows do.
- `transitionOptions`: `crossfade`, `slideForward`, `slideBackward` and `slideLeft`/`slideRight` (`NSViewController.TransitionOptions`). This replaces About's own `NSEPresence` slide.
- Delegate hooks are overridable methods, as AppKit's `NSTabViewDelegate` methods on the controller are: `tabView(shouldSelect:)`, `tabView(willSelect:)` and `tabView(didSelect:)`. They replace `onSelect`.
- `NSETabViewItem` (`NSTabViewItem`) has `identifier`, `label`, `image`, `toolTip` and `viewController`.
- Restoration: the controller keeps today's `restoration` descriptor, capturing the selected item's `identifier`. It is an NSE extension, matching `NSWindowRestoration`'s role.
- Removed: `destinations`, `createContent`, `sections`, `badge`, the More stack and `__nse-more`, and `NSETabBar` and `NSETabBarOverflowList` as public API. The tab control is the theme's.

### `NSESplitViewController` collapse (`NSSplitViewController`)

The adaptive controller's job, one pane at a time on a compact display, moves to the split view controller and its items:

- `NSESplitViewItem.behavior`: `"sidebar"`, `"contentList"`, `"inspector"` or `"default"` (AppKit's `NSSplitViewItem.Behavior`), plus `canCollapse`, `isCollapsed`, `minimumThickness` and `maximumThickness`.
- When the trait collection's `horizontalSizeClass` is `compact`, the split view controller shows one item at a time. `showDetail(_:)` moves forward from the sidebar to the content; the theme draws a back control that collapses back to the sidebar. Which item shows is observable as `NSESplitViewController.compactItem`. AppKit has no compact collapse: this is the NSE behaviour permitted by D2, with the property name approved on 2026-11-07.
- Removed: `NSEAdaptiveNavigationController`, `model`, `presentation`, `setTraits` (the trait collection already reaches every controller through `traitCollectionDidChange`) and `setContentBounds`.

### `NSEPageController` history (`NSPageController`, `transitionStyle: "stackHistory"`)

Drill-in (Journal's folders, then notes, then a note; Portfolio's library, then a collection, then a reader) is `NSPageController` in history mode:

- `navigateForward(to:)`, `navigateBack(_:)`, `navigateForward(_:)`, `arrangedObjects` (the history), `selectedIndex`.
- `viewControllerForIdentifier` and `identifier(for:)` (the `NSPageControllerDelegate` methods), as overridable methods.
- Removed: `NSENavigationStackController` and `NSEHierarchyStack`. The theme's compact chrome draws the back control from `selectedIndex > 0`.

### The source-list window

`NSESourceListScene` goes. A source-list window's `contentViewController` is an `NSESplitViewController` whose sidebar item holds an `NSEOutlineView` with `selectionHighlightStyle: "sourceList"`. Its bottom bar is the window's content border, after `NSWindow.setContentBorderThickness(_:for: .minY)`: `window.bottomBarAccessory`, holding ordinary views. AppKit draws the content border but has no accessory for it; this NSE extension was approved on 2026-11-07. The QuickSwitch rail stays the host's title-bar chrome.

## Order

## Approved behaviour inventory (2026-11-07)

The owner approved `compactItem`, `window.bottomBarAccessory` and the single adaptive tab style
`sidebarAdaptable`. AppKit's other tab styles remain fixed; About's `segmentedControlOnBottom`
therefore stays at the bottom on every layout. `sidebarAdaptable` is an NSE extension named after
SwiftUI's `TabViewStyle.sidebarAdaptable`. Bottom navigation tabs and the window's bottom content
border are separate concepts.

Before removing `NSEAdaptiveNavigationController`, the existing implementation was inventoried:

| Existing behaviour | Destination and preservation requirement |
|---|---|
| Peer selection, independent of physical navigation | `NSETabViewController`, `NSETabViewItem` and selected item identifier; lazy, retained child views |
| Fixed bottom tabs (`presentation: "bottom-tabs"`) | `tabStyle: "segmentedControlOnBottom"`; fixed on desktop, tablet and phone |
| Adaptive peer sidebar at content widths >=768 px | `tabStyle: "sidebarAdaptable"`; an Atmo source-list `NSEOutlineView` in the tab controller's split view |
| Adaptive peer bottom tabs below 768 px | The same tab controller and selected child, with its theme tab control below the content |
| Short-wide rail (height <=480 px, landscape, at least 360 px content after a 104 px rail) | `sidebarAdaptable`'s vertical tab control; content budgets, independent of device labels |
| Hierarchy list/detail versus one pane at a time | `NSESplitViewController`, sidebar/content-list items, `compactItem` and `showDetail(_:)` |
| Folder/list/detail drill-in and Back | `NSEPageController` `stackHistory`; split-view Back returns to the preceding pane and restores initiating focus |
| Foldable book regions | Shared `resolveNSEBookRegions`: explicit current side-by-side posture/segments, >=280x160 px per pane; the existing two-pane navigation allocations exclude the hinge, respect RTL, and disable divider dragging. Generic splits with three or more visible items do not project into two book regions |
| Bounds-driven switching | Controller views measure their own untransformed content allocation through ResizeObserver; window traits are the fallback. Zero/invalid allocations retain the last valid geometry |
| Pending/untrusted geometry | Retain the previous presentation until current geometry is available; do not guess a device or posture |
| Canonical trait changes | `traitCollectionDidChange`; no caller-owned `setTraits` or `setContentBounds` API |
| Selection/history restoration | Keep selected identifiers, app preference keys and deep-link precedence; migrate stored history into page-controller arranged objects |
| Persistent content during presentation changes | Keep child controllers and mounted content/DOM while sidebar, tabs, rail and compact panes change |
| Keyboard/ARIA and focus | Theme tab roving focus, source-list outline semantics, hidden panes inert, navigation focus transferred across projection changes without stealing editor/overlay focus |
| Stage Back/title handoff | Framework compact split/page chrome uses the existing stage chrome ownership; custom Journal chrome retains its action/responder and focus-return path |
| Section grouping/collapse and resizable source-list seam | Source-list outline group rows and split items; host QuickSwitch/title-bar rail remains host chrome |
| UIKit More stack and five-tab limit | Deliberately removed by the approved tab design; all tab items remain directly reachable. This is a recorded navigation difference, not a window status bar |

The inventory is the acceptance checklist for steps 3–5. Implementation and browser evidence are
recorded below as each step lands.

Each step ends green (typecheck, tests, the site build, the gallery in light and dark, and pixel diffs of every changed app route).

1. `NSETabViewController` and `NSETabViewItem`. *Done.* The classes (`segmentedControlOnTop`, `segmentedControlOnBottom`, `unspecified`; restoration through `selectTabViewItem(withIdentifier:)`; the leaving item's view exits with `NSEPresence`) and About, pixel-identical in every section on desktop and phone, with its adaptive controller gone. `toolbar` now inserts selectable items into the owning window's toolbar, preserves configured items and transfers ownership when the toolbar changes. `transitionOptions` remains deferred. Renderer models stay private; the public controller does not expose the legacy tab/stack contract.
2. `NSEPageController` `stackHistory`. *Done.* `NSEPageController` is an `NSViewController` subclass with `stackHistory` (the default) and `horizontalStrip`, the delegate methods as overridable methods, and pages as child view controllers that receive their object as `representedObject` (new on `NSEViewController`). The gallery's sliding day views use it. Portfolio's stack was only a flag for whether the reader shows, so it is plain state now; the reader itself waits on the owner's presentation decision. The gallery's section browse and detail is a sidebar collapsing to one pane, so it moves with step 3, not here.
3. *Done.* `NSESplitViewController.compactItem` and `showDetail` own compact pane selection, measured content bounds, retained pane DOM, two-pane hinge allocation and Back/focus restoration. Standard compact split/page chrome hands title and Back to the stage; Journal keeps its own established chrome. Journal and JournalOld compose `NSETabViewController`, split detail and `NSEPageController.stackHistory`, retaining preference migration and explicit-route precedence. The default split renderer has one bounds authority so an outer controller wrapper cannot oscillate with its inner content allocation.
4. *Done.* `window.bottomBarAccessory` renders ordinary views in the bottom content border with application context and sheet modality; its permanent content host retains editing state when the border appears or disappears. Software and the gallery compose source-list outlines, split items and adaptive tab controllers. Their footer seam follows the shared resized sidebar. Portfolio uses an `unspecified` tab controller behind its existing collection picker. `NSEAdaptiveNavigationController`, `NSESourceListScene`, `NSESidebar` and `NSEStatusBar` are removed, including public types, registry entries, catalogue mappings and pinned exports. The tab appearance model remains private implementation, without compatibility exports.
5. *Done.* `NSESlidingPane` and `NSESlidingPanes` are removed. The gallery's note and connected-trip examples use actual split items (`canCollapse`, `isCollapsed`, `behavior`) with retained child controllers. The old animated peek-strip interaction is deliberately replaced by split collapse/dividers and a compact pane chooser; this is a recorded visual and interaction change.

## Verification and recorded differences

The evidence root is `%TEMP%/syncloudos-navigation-phase7-20261107`: `before/` contains the 28 baseline captures and `final/` the desktop 1440×900 and phone 390×844 captures in light and dark (DPR 1), including About, Journal, JournalOld, Software, Portfolio, the gallery and Publisher. The earlier `after/` run records the split measurement regression; it is failed evidence, retained for diagnosis. Final validation counts and commit identities are recorded in the Phase 7 completion report in that folder.

Recorded differences are the removal of More (all Software/gallery peers are directly reachable), the gallery's window-owned footer reserving its own bottom border, and the collapsing-split specimens described above. Software's accidental 10 px group shift was corrected. Concurrent box/shadow/popover changes are separate work. Browser emulation verifies responsive/focus geometry, not physical folding or human visual acceptance; book-region allocation is bounded to two visible panes.
