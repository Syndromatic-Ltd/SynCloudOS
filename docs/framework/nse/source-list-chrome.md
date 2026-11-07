# Source-list application chrome

A source-list window has an `NSESplitViewController` as its content view controller. Its sidebar item holds an `NSEOutlineView` with `selectionHighlightStyle="sourceList"`; its other items hold ordinary child view controllers. Declare `frame.sourceList` in the manifest for the host-owned title-bar rail, QuickSwitch and shared sidebar width. Name the window with `window.title`.

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

Top-level outline items reported by `isGroupItem` are source-list sections: Atmo draws their blue label, line and disclosure arrow. `shouldShowOutlineCell` returning false makes a section fixed. The frame's material selects the plain or brushed-metal rail; appearance selects light or dark independently. `floatingSubviews` places search over the scrolling rows. `NSETableCellView` supplies a row's image, title, detail and badge. Expansion belongs to `NSETreeController.expandedIds`, and collapsed rows cannot take focus.

The split view shares the source-list frame's sidebar width, including divider moves and resets. Compact layout shows one item at a time. `showDetail(detail)` selects the detail; the theme's Back control returns to the preceding item and restores initiating focus. `compactItem` is an approved NSE extension on the AppKit-shaped split controller. The view measures its own content allocation; app code does not call `setTraits` or `setContentBounds`.

`window.bottomBarAccessory` is another approved NSE extension. It holds ordinary views in the bottom content border, whose thickness is set independently with `setContentBorderThickness(56, "minY")`. Window status content is separate from bottom navigation tabs. The window renders the accessory in the application's context and makes it inert with the rest of the window while a sheet is attached. Apps hide the border/accessory when their compact navigation uses the bottom edge.

Peer navigation belongs to `NSETabViewController`: `tabStyle: "sidebarAdaptable"` is the NSE extension named after SwiftUI's `TabViewStyle.sidebarAdaptable`. It places the theme's tab control in a sidebar at content widths of at least 768 px, below the content at smaller widths, or in a 104 px vertical rail in short landscape allocations (height at most 480 px, with at least 360 px left for content). AppKit's other styles are fixed; `segmentedControlOnBottom` stays below the content on every layout. All items remain directly reachable; there is no UIKit More stack.

A source-list app with a richer outline can compose an outer split with tab content. Its outline supplies regular navigation while the tab controller uses `unspecified`; compact/rail layouts collapse that sidebar and use `sidebarAdaptable` on the same retained tab controller. Selection, mounted content and editor focus survive these presentation changes.

Current explicit foldable segments are mapped into usable book regions, with at least 280 by 160 px per pane. The split excludes the hinge, respects RTL and disables divider dragging across the hinge. Stale geometry retains the preceding presentation. Browser emulation covers geometry and interaction; physical folding and reachability still need device review.

Utility panels belong to their application session. Changing a retained section does not dismiss its font panel or popover; explicit close or session teardown does.
