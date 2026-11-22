# Source-list application chrome

A source-list window has a sidebar of sections beside a detail view, and adapts to small screens. This page shows how to build one from a split view controller, an outline view and the window's bottom bar.

Use an `NSESplitViewController` as the window's content view controller. The sidebar item can show an `NSEOutlineView` with `selectionHighlightStyle="sourceList"`. The split controller manages the sidebar's size and how the window looks when it's compact.

```ts
const split = new NSESplitViewController({ id: "catalogue" });
split.addSplitViewItem(new NSESplitViewItem({
  identifier: "sections", behavior: "sidebar", viewController: sectionList,
  minimumThickness: 208, maximumThickness: 460,
}));
split.addSplitViewItem(new NSESplitViewItem({ identifier: "detail", viewController: detail }));
windowController.contentViewController = split;
windowController.window.setContentBorderThickness(56, "minY");
windowController.window.bottomBarAccessory = <NSETextField isEditable={false} backgroundStyle="raised">25 sections</NSETextField>;
```

Top-level items that `isGroupItem` reports are the sections: Atmo draws their blue label, rule and disclosure arrow. Return `false` from `shouldShowOutlineCell` to make a section that can't collapse. The frame's material picks a plain or brushed-metal sidebar, and the appearance picks light or dark separately. `floatingSubviews` puts a search field over the scrolling rows, and `NSETableCellView` lays out a row's image, title, detail and badge. Expansion is stored in `NSETreeController.expandedIds`, and rows inside a collapsed section can't take focus.

The split view and the source-list frame share one sidebar width, including when the user drags or resets the divider. In compact layout, only one item shows at a time. `showDetail(detail)` shows the detail, and the theme's Back control returns to the previous item and puts focus back where it was. `compactItem` tells you, or sets, which item is showing. The view measures the space it has by itself, so your code never calls `setTraits` or `setContentBounds`.

`window.bottomBarAccessory` holds ordinary views in the window's bottom border, whose height you set separately with `setContentBorderThickness(56, "minY")`; only the bottom edge is drawn. This status area is separate from bottom navigation tabs. The window renders the accessory in your application's context, and it becomes inert with the rest of the window while a sheet is attached. Hide the border and accessory when your compact navigation uses the bottom edge.

For switching between peer sections, use `NSETabViewController` with `tabStyle: "sidebarAdaptable"`. It puts the theme's tab control in a sidebar when the content is at least 768 px wide and below the content when it's narrower. In a short landscape space (at most 480 px high, with at least 360 px left for content), it becomes a 104 px vertical rail. The other styles, `segmentedControlOnTop`, `segmentedControlOnBottom`, `toolbar` and `unspecified`, stay where they are on every layout. Every item stays directly reachable; there's no overflow "More" list.

An application with a richer outline can put a tab view controller inside an outer split. At regular sizes the outline does the navigating and the tab controller uses `unspecified`. In compact and rail layouts, the sidebar collapses and the same tab controller switches to `sidebarAdaptable`. Selection, mounted content and editor focus all survive the switch.

On a foldable device that reports its screen segments, each segment becomes a book region of at least 280 by 160 px per pane. A vertical split with two visible panes keeps clear of the hinge, follows right-to-left layout and won't let the divider be dragged across the hinge. A split with three or more visible panes keeps its ordinary layout. If the segment geometry is out of date, the previous layout stays. This has been tested with browser emulation; folding on real hardware still needs checking on a device.

Utility panels belong to the application session, so switching sections doesn't close an open font panel or popover. Only closing it yourself, or ending the session, does.
