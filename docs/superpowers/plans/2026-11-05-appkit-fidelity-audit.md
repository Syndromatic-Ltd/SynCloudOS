# NSE AppKit fidelity audit

Date: 2026-11-05. Author: Claude Opus, at the owner's request. Status: **approved 2026-11-05**, with the owner's amendments under [Decisions](#decisions-for-the-owner). Execution in progress; see [Progress](#progress).

## The rule

SynCloudOS follows AppKit and Cocoa closely: in application architecture, and also in class names, API shapes and coding conventions. An NSE class corresponds to a real AppKit class (`NSOutlineView` → `NSEOutlineView`) and behaves the way that class does. Appearance belongs to themes. While the framework is in beta, any public NSE API that has no AppKit counterpart, departs from one, or splits one AppKit class across several NSE ones is fixed in place. There are **no compatibility shims, aliases or deprecation periods**.

What prompted this: `NSEAccordionView` has no AppKit counterpart (its API matches web accordion libraries, not Cappuccino's `CPAccordionView` either), and the source-list section header that apps and agents admire exists only inside an invented `NSESidebar`. Agents built on both, believing them native.

## Method

- Every value export (class, function, component, constant) of the SDK entries `@syndromatic/syncloudos`, `/sdk`, `/nse` and `/nse/*` was listed from the built declarations with the TypeScript compiler API: 439 names. 181 of them are NSE UI or controller APIs outside the text system. This audit maps those 181. The text system and the Foundation-style models are reviewed briefly in [Second pass](#second-pass).
- For each name, the files that reference it were counted in the framework's source, its tests, the site (`site/src`) and Fusion. In the tables, `fw N` counts framework files other than the declaring one. Two or three of those are always the public index and entry files, so **`fw 2`–`fw 3` usually means no internal use**. "Gallery" is `NSEControlGallery.app`, which exists to show every control and moves with whatever is decided.
- Each AppKit counterpart was checked against what the NSE component actually does (its props and implementation), not only its name. Where the AppKit class arrived after Mountain Lion, its macOS version is given.

## Conventions the target API follows

1. **One NSE type per AppKit class, with the AppKit name and capitalisation**: `NSETableView`, `NSEOutlineView`, `NSEPopUpButton` (capital U, as `NSPopUpButton`), `NSEUserDefaultsController`.
2. **Variants are properties, not classes.** AppKit has one `NSButton`, whose `buttonType` and `bezelStyle` give a push button, checkbox, radio button, disclosure triangle, toggle, recessed or textured button. Likewise `NSSlider.sliderType` (linear or circular), `NSProgressIndicator.style` (bar or spinning), `NSDatePicker.datePickerStyle`, `datePickerElements` and `datePickerMode` (single or range), `NSBox.boxType` (primary, separator, custom), `NSTextField.bezelStyle`, and `NSPopUpButton.pullsDown`. NSE today often has a separate component per variant.
3. **Appearance belongs to the theme.** The class says what something is (a source list's group row, a disclosure button), and Atmo decides how it looks. The look the owner wants to keep, a blue label with a line to the edge and a disclosure arrow, is Atmo's drawing of an `NSEOutlineView` group row in source-list style.
4. **Data views use a data source, a delegate or bindings, and cells are views.** `NSTableView` and `NSOutlineView` take a data source or are bound to an `NSArrayController` or `NSTreeController`. A delegate answers questions such as `isGroupItem` and `shouldShowOutlineCellForItem`, and cells are `NSTableCellView`s.
5. **Commands go through target-action and the responder chain, and menus validate.** NSE already has this (`@action`, `validate…`). Every control that sends a command takes an `action`, including menu items in pop-up buttons (see FRICTION-OPUS O5).
6. **Menus are models, not components.** `NSMenu` and `NSMenuItem` are objects. A view shows one as its context menu (`NSView.menu`), a pop-up button shows one, and the application has a `mainMenu`. There is no standalone "menu" widget.
7. **Windows, panels, sheets and alerts are objects their controllers present.** `NSAlert` is configured (`messageText`, `informativeText`, `addButton(withTitle:)`, `alertStyle`) and presented with `beginSheetModal(for:completionHandler:)`, just as `NSEOpenPanel` already is. They are not ad-hoc JSX trees.
8. **No web or React vocabulary in public names**: Provider, Presence, Surface, Scene, Adapter, Host, Backdrop, Toaster, Listbox, Popup (as a noun), Inline, Flex.
9. **Control state is AppKit's state value**: `on`, `off`, `mixed` (`NSControl.StateValue`), and a control's size is `controlSize` on every control (see FRICTION-OPUS O6).

## The case that started this: section lists

| Want | AppKit (Mountain Lion) | NSE target |
|---|---|---|
| A sidebar with sections (`[Section] ——— ⌄`), items inside, nested items | `NSOutlineView` with `selectionHighlightStyle = .sourceList` and `floatsGroupRows = false`. Top-level items are group items (`outlineView(_:isGroupItem:)`); AppKit draws the group row's Show/Hide control, and `outlineView(_:shouldShowOutlineCellForItem:)` returning `false` makes a section fixed. Children expand with disclosure triangles. It sits in the left pane of an `NSSplitView`. | `NSEOutlineView` with `selectionHighlightStyle: "sourceList"`, a delegate with `isGroupItem` and `shouldShowOutlineCellForItem`, and `floatsGroupRows`. **Atmo draws group rows as today's sidebar header**: blue label, line to the edge, and the `NSEDivider` arrow sprite as the outline cell, collapsing with the current animation, which reduced motion turns off. `NSESidebar`'s rendering becomes Atmo's source-list styling for `NSEOutlineView`. |
| A collapsible section in an inspector or form (Motion, Xcode) | An `NSButton` with `bezelStyle = .disclosure` (or `.roundedDisclosure`) that hides the view below it, in an `NSStackView` (10.9) that reflows. | `NSEButton` with `bezelStyle: "disclosure"` and `NSEStackView` (whose items already have `hidden` and visibility priority). Atmo may draw the inspector header with the same label, line and arrow grammar. `NSEAccordionView` is removed. |

## Findings by family

Verdicts: **Keep** (the name and shape are AppKit's); **Rename**; **Merge into** (fold into one AppKit class as a property); **Remove** (no AppKit counterpart and no need); **Internal** (needed, but implementation detail that should not be public); **Decide** (needs an owner decision, listed at the end).

### Application, objects and controllers

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSEApplication` | `NSApplication` | Keep | fw 15 · 12 site apps · Fusion |
| `NSEWindowController` | `NSWindowController` | Keep | fw 10 · 11 site apps · Fusion |
| `NSEViewController` | `NSViewController` | Keep | fw 20 · 12 site apps · Fusion |
| `NSEViewControllerView` | `NSViewController.view`, added with `addSubview` | Remove (D7): `controller.view` is rendered directly, `<child.view />` | fw 3 · 8 site apps · Fusion |
| `NSEObject` | `NSObject` | Keep | fw 12 · AnimationFX · Fusion |
| `NSEArrayController`, `NSETreeController`, `NSEObjectController`, `NSEDictionaryController` | same | Keep | Diagnostics, Portfolio, Software · Fusion |
| `NSEPreferencesController` | `NSUserDefaultsController` | Rename → `NSEUserDefaultsController`, backed by an `NSEUserDefaults` store (schema, validation and migrations stay) | fw 11 · JournalPublisher, Software · Fusion |
| `NSETaskQueueFullError` | — | Keep (an error type, not a view) | fw 4 |
| `NSEActionScopeProvider` | Responder chain | Internal: the framework supplies it around every class app | fw 4 |
| `NSEStandaloneControlHost` | — | Internal | fw 6 |
| `NSEFocusScope` | `NSWindow.initialFirstResponder`, `nextKeyView`, sheet modality | Internal. Sheets and alerts own their key-view loop once they are objects (D3) | fw 10 · Journal, JournalPublisher, MemoJournal |
| `NSEFeedbackProvider` | `NSHapticFeedbackManager` (10.11) | Rename → `NSEHapticFeedbackManager` (an object, not a provider) | fw 4 |
| `NSEAppearanceProvider` | `NSAppearance` (10.9), `NSView.appearance` | Rename → `NSEAppearance`, set on a view or window (`appearance` property) | fw 6 · Gallery |
| `NSEAnimationDefaults`, `NSEAnimationEnvironmentProvider` | `NSAnimationContext` | Merge into `NSEAnimationContext` (duration, timing function, `allowsImplicitAnimation`, reduced motion) | fw 11 / 4 · About, Journal |
| `NSEPresence`, `NSELayoutView` | `NSView.animator()`, `NSViewController.transition(from:to:options:)` (10.10) | Internal. Expose transitions on `NSEViewController`; `NSELayoutView`'s layout animation becomes the animator | fw 13 / 4 · About, MemoJournal, Webspring |
| `NSEMaterialLighting`, `NSEMaterialLightingProvider`, `NSEMetalSurface`, `NSESmoothSurface`, `NSERoundedBox`, `NSEShadowView` | `NSVisualEffectView` (10.10), `NSBox` (`boxType: .custom`), `NSView.shadow` (`NSShadow`) | Internal (theme parts). Public: `NSEBox` custom boxes, an `NSEShadow` value on views, and `NSEVisualEffectView` only if an app needs a material | Gallery |
| `NSECursor` | `NSCursor` | Keep | Gallery |
| `NSETooltipProvider` | `NSView.toolTip` | Internal. Every NSE view takes `toolTip` | fw 8 · Gallery |

### Buttons

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSEPushButton` | `NSButton` (`.momentaryPushIn`, `.rounded`) | Rename → `NSEButton`. Tones become AppKit's: `keyEquivalent = "\r"` makes the default button, `hasDestructiveAction` (11) or `bezelColor` | fw 36 · 10 site apps · Fusion |
| `NSEIconButton` | `NSButton` with `image` and `imagePosition = .imageOnly` | Merge into `NSEButton` | Gallery |
| `NSEToolButton` | `NSButton` with `bezelStyle = .texturedRounded` or `.recessed` | Merge into `NSEButton` | AnimationFX · Fusion |
| `NSEToggleButton` (thumb switch) | `NSSwitch` (10.15) | Rename → `NSESwitch` | Gallery |
| `NSECheckbox` | `NSButton` with `buttonType = .switch` | Merge into `NSEButton` (`buttonType: "switch"`, `state: "on" \| "off" \| "mixed"`, `allowsMixedState`) | 5 site apps · Fusion |
| `NSERadioGroup` | Radio `NSButton`s sharing an action (Mountain Lion: `NSMatrix` of radio cells) | Merge into `NSEButton` (`buttonType: "radio"`), grouped the AppKit way. Decide (D5) whether a grouping container stays for roving focus | Gallery, SynCal |
| `NSEToolButtonGroup`, `NSERadioToolButtonGroup`, `NSEPickerGroup`, `NSETabGroup` | `NSSegmentedControl` (`trackingMode` select-one, select-any, momentary; `segmentStyle`) | Merge into `NSESegmentedControl` | AnimationFX, JournalPublisher |
| `NSEPopupButton` | `NSPopUpButton` with `pullsDown = true` | Merge into `NSEPopUpButton` | JournalPublisher |
| `NSEActivityButton`, `NSEProgressButton` | `NSButton` beside an `NSProgressIndicator` | Remove | Gallery |
| `NSENotificationButton` | A toned `NSButton`; not a badge (badges are `NSDockTile.badgeLabel`, see D4) | Remove | Gallery |
| `NSEButtonHeader` | Disclosure `NSButton`, or a source-list group row | Remove | Gallery |
| `NSEFilePickerButton` | `NSButton` whose action runs `NSOpenPanel` | Remove | Gallery |
| `NSEGrabHandle` | The `NSSplitView` divider (`dividerStyle`, `drawDivider(in:)`) | Internal to `NSESplitView` | Gallery |
| `NSEHashBadge` | — | Remove | Gallery |

### Text fields

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSETextField` | `NSTextField` | Keep (gains `isEditable`, `isBezeled` and `bezelStyle`, which also cover labels) | fw 13 · JournalPublisher, Portfolio, SynCal · Fusion |
| `NSERoundedInput`, `NSEToolInput` | `NSTextField` with `bezelStyle = .roundedBezel` or `.squareBezel` | Merge into `NSETextField` | Gallery |
| `NSEInputBox` | `NSSearchField` or `NSTokenField` cells; no general "field containing controls" | Remove | Gallery |
| `NSESecureTextField` | `NSSecureTextField` | Keep | Gallery |
| `NSEPasswordField` | `NSSecureTextField` | Merge into `NSESecureTextField` (a duplicate) | Gallery |
| `NSESearchField` | `NSSearchField` | Keep | 4 site apps |
| `NSESearchFieldController` | `NSSearchField.recentSearches` and `recentsAutosaveName` | Merge into `NSESearchField` | Gallery |
| `NSEComboBox`, `NSETokenField` | same | Keep | Gallery |
| `NSEText` | `NSTextField(labelWithString:)` (10.12), a non-editable, non-bezelled `NSTextField` | Merge into `NSETextField` | Gallery |

### Values and progress

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSESlider` | `NSSlider` | Keep | AnimationFX, JournalPublisher · Fusion |
| `NSECircularSlider` | `NSSlider` with `sliderType = .circular` | Merge into `NSESlider` | JournalPublisher |
| `NSEProgressSlider` | — (a scrubber with buffered progress) | Remove | Gallery |
| `NSEStepper`, `NSELevelIndicator`, `NSESegmentedControl` | same | Keep | JournalPublisher, Software · Fusion |
| `NSEProgressIndicator` | `NSProgressIndicator` (`style` bar or spinning, `isIndeterminate`, `controlSize`) | Keep, and absorb the four below. Its `size: 16 \| 32 \| 64` becomes `controlSize` | JournalPublisher · Fusion |
| `NSEProgressBar`, `NSEProgressItem`, `NSESpinner`, `LoadingSpinner` | `NSProgressIndicator` | Merge into `NSEProgressIndicator` | Gallery |

### Pop-up buttons, menus and choosers

AppKit has two choosers: `NSPopUpButton` (pick from a menu, or with `pullsDown` a command menu) and `NSComboBox` (type or pick). NSE has eight.

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSEPicker` | `NSPopUpButton` | Rename → `NSEPopUpButton` | JournalPublisher, Software, SynCal · Fusion |
| `NSEPopupButton` | `NSPopUpButton` with `pullsDown` | Merge into `NSEPopUpButton` | JournalPublisher |
| `NSEListSelector`, `NSEPopupList`, `NSEChoiceControl` | `NSPopUpButton` | Merge into `NSEPopUpButton` | Portfolio, Gallery |
| `NSEIntegerPicker` | `NSPopUpButton` with numbered items, or `NSTextField` with an `NSStepper` | Remove | Gallery |
| `NSEMenu` (component with a trigger) | `NSMenu` shown by an `NSPopUpButton` (pull-down) | Reshape: `NSEMenu` becomes the menu **object** (`NSEMenu`, `NSEMenuItem` with `title`, `action`, `keyEquivalent`, `state`, `submenu`, `isSeparatorItem`). The trigger is `NSEPopUpButton` with `pullsDown` | fw 11 · Fusion |
| `NSEMenuController`, `NSEMenuModel` | `NSMenu` (with its `delegate` and `update()` validation) | Merge into the `NSEMenu` object | fw 12 · JournalPublisher · Fusion |
| `NSEContextMenu` | `NSView.menu`, `menu(for:)` | Merge into a `menu` property on views | JournalPublisher |
| `NSEApplicationMenu`, `NSEAppMenu`, `NSEEditMenu`, `NSEHelpMenu`, `NSEAppMenuSurface`, `createNSEApplicationMenuModel` | `NSApplication.mainMenu`, the standard menu templates, `NSApplication.helpMenu` and `windowsMenu` | Merge into `NSEApplication.mainMenu` (an `NSEMenu`), with standard Edit, Window and Help menus the framework fills | Gallery |
| `NSEMenuBar` | The menu bar draws `NSApp.mainMenu` | Keep (D6): it draws the window's menu bar from `NSEApplication.mainMenu` | Fusion |
| `NSEMenuOverlay`, `NSEListboxPopup`, `NSEPopup` | — | Internal (the overlay mechanics behind menus and popovers) | fw 8–13 · Portfolio, SynCal (`NSEPopup` used directly) |

### Containers, boxes and layout

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSEBox` | `NSBox` | Keep (`boxType`, `title`, `titlePosition`, `borderType`, `contentViewMargins`) | Gallery |
| `NSEGroupBox` | `NSBox` with a title | Merge into `NSEBox` | JournalPublisher |
| `NSEDivider` | `NSBox` with `boxType = .separator` | Merge into `NSEBox`. Its arrow becomes the theme's art for disclosure buttons and group-row outline cells | About |
| `NSEStackView` | `NSStackView` (10.9) | Keep | Gallery |
| `NSEStackItem` | Arranged views with visibility priorities | Keep only if `NSStackView`'s per-view API needs a wrapper in JSX; otherwise merge | Gallery |
| `NSEStack`, `NSEInline`, `NSEFlex`, `NSEFit`, `NSEOrdered`, `NSESpacer` | `NSStackView` (orientation, distribution, spacing, `setCustomSpacing`) | Merge into `NSEStackView` | Gallery |
| `NSEForm`, `NSEFormRow`, `NSEFormSeparator`, `NSERowGroup` | `NSGridView` (10.12); in Mountain Lion `NSForm` (deprecated in 10.10) | Merge into `NSEGridView` (rows, columns, `xPlacement`, `rowAlignment`, merged cells) | Gallery |
| `NSEPane` | An `NSView` in a split pane; no "pane" class | Remove (Diagnostics uses it as a titled box: `NSEBox`) | Diagnostics |
| `NSEDrawer` | `NSDrawer` (deprecated in 10.13, current in Mountain Lion) | Keep | Gallery |
| `NSEDividerDrawer` | — | Remove | Gallery |
| `NSESlidingView` | `NSPageController` (10.8: swipe between pages) | Rename → `NSEPageController` | Gallery |
| `NSESlidingPane`, `NSESlidingPanes` | `NSSplitViewController` collapse, or `NSPageController` | Merge (see Navigation) | Gallery |
| `NSEScrollView`, `NSEClipView` | same | Keep. `NSScrollView.allowsMagnification` (10.8) also absorbs the image zoom views below | Gallery |
| `NSESplitView` | `NSSplitView` | Keep | Gallery |
| `NSESplitViewController` | `NSSplitViewController` (10.10) | Keep (`splitViewItems` with `canCollapse`, `holdingPriority`, `minimumThickness`, and sidebar behaviour) | Gallery · Fusion |
| `NSESplitViewAdapter` | `NSSplitViewController.splitView` | Merge into `NSESplitViewController`: the controller renders its own split view, as a view controller renders its view | Gallery · Fusion |
| `NSEAccordionView` | — | Remove (see [section lists](#the-case-that-started-this-section-lists)) | Gallery · Fusion |
| `NSEBookRegionMetrics`, `resolveNSEBookRegions` | — | Internal | fw 1 |

### Data views

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSETable` | `NSTableView` | Rename → `NSETableView`. Columns become `NSETableColumn` (`identifier`, `title`, `width`, `minWidth`, `maxWidth`, `sortDescriptorPrototype`); cells become views via a delegate | Diagnostics, Software · Fusion |
| `NSEOutline` | `NSOutlineView` | Rename → `NSEOutlineView`, and gain `selectionHighlightStyle: "sourceList"`, group items, `floatsGroupRows`, `autosaveExpandedItems` | Diagnostics, Software |
| `NSESidebar`, `NSESidebarSurface`, `NSESidebarVariant` | `NSOutlineView` in source-list style | Remove. Its look becomes Atmo's source-list styling of `NSEOutlineView` (see above) | JournalPublisher |
| `NSEList`, `NSEListRow`, `NSEListItem`, `NSEVirtualList`, `NSEGroupedList` | A single-column view-based `NSTableView` with `NSTableCellView` rows (group rows for sections) | Merge into `NSETableView`. `NSEListItem` (used inside menus and the sidebar, fw 16) becomes the theme's `NSETableCellView` | Diagnostics, JournalPublisher |
| `NSESwipeableItem` | `NSTableView` row actions (`tableView(_:rowActionsForRow:edge:)`, 10.11) | Merge into `NSETableView`'s delegate | Gallery |
| `NSEDataViewCellContent` | `NSTableCellView` (`textField`, `imageView`) | Rename → `NSETableCellView` | fw 1 |
| `NSECollectionView`, `NSEBrowser`, `NSERuleEditor`, `NSEPredicateEditor` | same | Keep | Portfolio, Software |

### Navigation and tabs

AppKit has `NSTabView`, `NSTabViewController` (10.10), `NSSplitViewController` and `NSPageController`. NSE's navigation controllers come from UIKit, for the compact (phone) idiom.

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSETabView` | `NSTabView` | Keep (`tabViewItems`, `tabViewType`, `selectedTabViewItem`) | Gallery · Fusion |
| `NSETabBarController`, `NSETabBar`, `NSETabBarOverflowList` | `NSTabViewController` (`tabStyle`: segmented control on top or bottom, toolbar, unspecified); UIKit `UITabBarController` | Decide (D2). Recommended: rename to `NSETabViewController`, with its tab bar as a `tabStyle` the theme draws | About, Journal, Portfolio, Software |
| `NSENavigationStackController`, `NSEHierarchyStack` | No AppKit stack; UIKit `UINavigationController`. `NSPageController` (history mode) is AppKit's closest | Decide (D2) | Journal, Portfolio |
| `NSEAdaptiveNavigationController` | `NSSplitViewController` with a collapsible sidebar item; UIKit `UISplitViewController` collapse | Decide (D2). Recommended: merge into `NSESplitViewController` collapse behaviour driven by the trait collection | About, Journal, Portfolio, Software |
| `NSESourceListScene` | A window whose content is an `NSSplitViewController` with a sidebar item holding an `NSOutlineView` | Remove, as an `NSESplitViewController` configuration plus window chrome | Software |

### Windows, chrome and toolbars

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSETopBar`, `NSETopBarButton`, `nseTopBarStyles` | The `NSWindow` title bar (`title`, `subtitle` 11, `representedURL`, `isDocumentEdited`, `titleVisibility`) with an `NSToolbar` and `NSTitlebarAccessoryViewController` (10.10) | Reshape: `NSEWindowController` and `NSEWindow` own the title bar. A document's "— Edited" comes from `isDocumentEdited`; Webspring and QuickSwitch items become title-bar accessories | JournalPublisher · Fusion |
| `NSEStatusBar` | **Name collision**: `NSStatusBar` is the system menu bar's status-item area. A window's bottom bar is `NSWindow.setContentBorderThickness(_:for: .minY)` with ordinary views on it | Rename → a bottom-bar accessory of `NSEWindow` (content border), never `NSEStatusBar` | JournalPublisher · Fusion |
| `NSEAppFrame` | `NSWindow` content layout | Internal | Gallery |
| `NSEHeader`, `NSEPageHeader`, `NSEPrevNextBanner` | — (labels, `NSBox`, buttons) | Remove | Gallery |
| `NSEToolbar` | `NSToolbar` | Keep, merging `NSEToolbarController` into it: `NSToolbar` *is* the model (`items`, `delegate`, `allowsUserCustomization`, `autosavesConfiguration`, `displayMode`) | 7 site apps · Fusion |
| `NSEToolbarController` | `NSToolbar` and its delegate | Merge into `NSEToolbar` | JournalPublisher · Fusion |
| `NSEToolbarConfigurationSheet` | `NSToolbar.runCustomizationPalette(_:)` | Merge into `NSEToolbar` (a method) | JournalPublisher |
| `NSEToolbarOverflowMenu`, `allocateNSEToolbarItems` | Toolbar overflow (`»`) | Internal | fw 3 |

### Panels, sheets and alerts

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSEOpenPanel`, `NSESavePanel` | same | Keep | Gallery |
| `NSEFontPanel`, `NSEFontManager` | same | Keep | Libraries/JournalPages |
| `NSEColourPanel`, `NSEColourWell` | `NSColorPanel`, `NSColorWell` | Keep (D1: British spelling stays) | JournalPublisher, MemoJournal, Portfolio |
| `NSEColourSliderPicker`, `NSEColourSwatches`, `NSEColourWheelPicker` | The colour panel's modes (`NSColorPanel.Mode`), `NSColorPicker` | Internal to the colour panel | Gallery |
| `NSEAlert`, `NSEAlertBackdrop`, `NSEConfirmDialog`, `NSEConfirmPrompt`, `NSEDialog`, `NSEModalDialog`, `NSEDialogSurface` | `NSAlert` (`messageText`, `informativeText`, `addButton(withTitle:)`, `alertStyle`, `showsSuppressionButton`, `accessoryView`, `beginSheetModal(for:)`), and sheets (`NSWindow.beginSheet`) or `NSPanel` for custom dialogs | Merge into `NSEAlert` (an object) and window or panel sheets: Decide (D3) | 5 site apps |
| `NSEPopover` | `NSPopover` | Done: `NSEViewController.presentAsPopover(_, { of, preferredEdge, behavior })` (NSViewController's `present(_:asPopoverRelativeTo:of:preferredEdge:behavior:)`); the component is internal | JournalPublisher, gallery |
| `NSEToaster` | `NSUserNotification` (10.8), later `UNUserNotificationCenter` | Remove from NSE: notices go through the system notification service (`useNotifications`) | Gallery |
| `NSEMediaPanel` | The Open panel's Media sidebar section (MediaLibrary, `MLMediaLibrary`) | Landed: removed; `NSEOpenPanel.mediaSources` (D4) | Gallery migrated |
| `NSERuler` | `NSRulerView` | Rename → `NSERulerView` | Gallery |
| `NSEWebContentView` | WebKit `WebView` (Mountain Lion), `WKWebView` (10.10) | Rename → `NSEWebView`; verified by loading example.org | Gallery |

### Images and graphics

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSEImageView` | `NSImageView` | Keep (`imageScaling`, `imageAlignment`, `isEditable`, `animates`) | Gallery |
| `NSESizeableImage`, `NSEScrollingImage`, `NSEViewImage` | `NSImageView` in an `NSScrollView` with `allowsMagnification` | Merge into `NSEImageView` and `NSEScrollView` | Gallery |
| `NSECroppableImage` | ImageKit `IKImageView`, `currentToolMode = .crop` | Move to ImageFX as `IFXImageView` (D4) | Gallery |
| `NSERotatingImage` | A spinning `NSProgressIndicator` | Remove | Gallery |
| `NSEGraphicsView` | A custom `NSView` with `draw(_:)`; there is no graphics view | Rename → `NSEView` with `draw(dirtyRect, context)` (D4) | Gallery · Fusion |
| `NSECoverFlow` | `NSCollectionView` with a custom `NSCollectionViewLayout` (Cover Flow itself was the private `IKImageFlowView`) | Merge into `NSECollectionView` as the `coverFlow` layout, from AnimationFX's implementation (D4) | AnimationFX, Software |
| `NSEPage` | `NSPageController.transitionStyle` | Merge into `NSEPageController` as `transitionStyle: "pageCurl"` (D4) | MemoJournal, Portfolio |

### Date, time and colour controls

| NSE today | AppKit | Verdict | Callers |
|---|---|---|---|
| `NSEDatePicker` | `NSDatePicker` | Keep, and absorb the five below (`datePickerStyle`: text field, text field and stepper, clock and calendar; `datePickerElements`: year-month-day, hour-minute-second, time zone; `datePickerMode`: single or range) | SynCal |
| `NSETimePicker`, `NSEDateTimePicker`, `NSEDateRangePicker`, `NSECalendarView`, `NSEClockView` | `NSDatePicker` | Merge into `NSEDatePicker` | SynCal |

## Decisions for the owner

Approved on 2026-11-05 with these outcomes:

- **D1. "Colour" stays.** British spelling is kept in every API name (`NSEColourWell`, `NSEColourPanel`, `GFXColour`, `colourScheme`). This is a deliberate exception to AppKit naming.
- **D2. No UIKit classes.** Compact-idiom behaviour comes from AppKit classes presented through the trait collection:
  - `NSETabViewController` with a `tabStyle`;
  - `NSESplitViewController` collapsing to one pane at a time;
  - `NSEPageController` for drill-in history.
- **D3. Alerts and sheets are objects.** `NSEAlert` is a class that a controller configures and presents; custom dialogs are sheets presenting a view controller.
- **D4. Syndromatic originals take an AppKit shape, and keep the `NSE` prefix** (NSE, New Syndromatic Experience, is NeXTSTEP's NS plus our E; no other prefix is introduced):
  - **Cover Flow** becomes a `coverFlow` layout of `NSECollectionView` (`collectionViewLayout`, after `NSCollectionViewLayout`). There is one implementation: AnimationFX's, whose reflections are a replicator layer (`CAReplicatorLayer`) with a fade mask and colour-modulated brightness, not CSS `-webkit-box-reflect`. Software.app moves to it; `NSECoverFlow` is removed.
  - **Page curl — Landed (owner decision 8, 2026-11-07).** `NSEPageController` takes `transitionStyle: "pageCurl"` beside `stackHistory` and `horizontalStrip`. `pageCurl` and `spineLocation: "min" | "mid"` are the approved UIKit-named exceptions (`UIPageViewController.TransitionStyle.pageCurl` / `.SpineLocation`); `min` is a single page and `mid` is a two-page spread. Selected and neighbouring objects are child view controllers with `representedObject`; the controller owns edge/corner drags, dog-ear buttons, swipes, navigation, snap cancellation and completed-turn selection. Its snapshot exposes `turnProgress` and `turnDirection`, and `didTransitionToObject` fires after a successful curl. Portfolio reads that snapshot and retains its book open/close scene. The existing curl engine, renderer, lighting, back faces and presets stay internal; `NSEPage`, its public types and the old namespace facade are removed without aliases. MemoJournal no longer uses the old page component. See the [capture and validation report](../evidence/2026-11-07-page-curl/REPORT.md).
  - **Crop** moves to ImageFX as `IFXImageView`, after ImageKit's `IKImageView` (`currentToolMode`: move, select, crop, rotate; `zoomFactor`, `rotationAngle`). ImageKit ships in the Quartz framework beside Core Image, which ImageFX mirrors. `NSECroppableImage` is removed. *Landed:* `IFXImageView` supports the move and crop tools (`zoomFactor`, `zoomIn`, `zoomOut`, `zoomImageToFit`, `crop()`); select and rotate are not built yet. `NSEImageView` shares its zoom engine, and the geometry and string-source ports are ImageFX types (`IFXImageGeometryPort`, `IFXImageStringSourcePort`).
  - **`NSEMediaPanel`** is removed. Apple has no public media-chooser panel; media appears in the Open panel's sidebar (the Media section: Photos, Music, Movies), backed by the MediaLibrary framework (`MLMediaLibrary`). The media providers become media sources of `NSEOpenPanel`. **Landed (2026-11-07):** the Open panel is an AppKit-shaped object, drawn by Atmo as a parent-window sheet or an application-modal panel. Its Folders section restores IndexedDB directory handles and renews permission from an explicit action; Media lists `mediaSources`; App Storage browses the bundle-scoped OPFS application-support directory. Compact presentation drills from Sources into a three-column collection. `usesSystemFileChooser` is the explicit system-only extension; `SCOS.fileManager.urls("applicationSupportDirectory", "userDomainMask")` is the minimal FileManager analogue. The separate media panel and its public declarations are removed; gallery callers use the Open panel. See [Open panels](../../framework/nse/open-panel.md) and [implementation and verification](2026-11-07-open-panel.md). Original *Design for the build:* `NSEOpenPanel` takes `mediaSources` (the providers `NSEMediaPanel` takes today). With any, the panel shows a sidebar: the system chooser ("Choose files") and a Media section with one row per source; choosing a source shows its searchable collection, and Open returns the chosen media items in the panel result beside file references. `NSEMediaPanel`, its window bridge and labels go; the gallery's local-pictures example becomes an Open panel with one media source.
  - **`NSEGraphicsView`** is renamed `NSEView`: AppKit draws custom content by overriding `NSView.draw(_:)`, and has no "graphics view". `NSEView` takes `draw(dirtyRect, context)` and is also where every view's `toolTip`, `menu` and `appearance` live. *Design for the build:* (1) `GFXContext.drawDisplayList(list, destination)` replays a recorded list into another context, scaled into the destination, so a controller can keep caching figures (as `CGContext` draws a `CGPDFPage` or `CGLayer`). Constraint: a recorded list is sealed to the identifier issuer that recorded it (`sealGFXDisplayList`), and its commands carry device-space transforms and clip-path strings, so replay must re-issue paint and clip identifiers in the target context's scope and compose the destination transform into every command's transform and clip chain. It is not a copy of commands. *Landed:* `GFXContext.drawDisplayList(list, rect)` records a nested `display-list` command (commands, placement transform, outer state). Identities are renamed by a per-context prefix at record time, and both SVG renderers draw it as a transformed group inside the outer clips; definition IDs are still issued at render from the outer list's scope. (2) `NSEView` with `draw` records a fresh `GFXContext` sized to its bounds on each display and renders the list as `NSEGraphicsView` does now. The identifier issuer and the bounds measurement come from the application through an internal provider context that `SynCloudOSProvider` fills (`runtime.images.createGraphicsIdentifierIssuer`, `runtime.images.geometry`), as haptics registration does; apps pass neither. `needsDisplay = true` is a re-render. *Landed:* `NSEView.draw` records a fresh bounds-sized context on every React display; `SynCloudOSProvider` supplies private drawing authority and resize observation. Menus, tooltips, appearance and HTML view outlets compose with drawing. (3) `autoSize`/`contentsGravity` map to `layerContentsPlacement` on the view. *Landed:* all twelve `NSView.LayerContentsPlacement` names are supported, with proportional fit as the default. The framework’s graphics view, exports and documentation are removed or migrated to `NSEView.draw`. (4) Callers: gallery (two), TextTransferMedia (two), Fusion AnalysisPanel and ComparisonView (four): each figure method becomes a `draw(rect, context)` that replays the cached list.
  - **Smooth corners — Landed (owner decision 7, 2026-11-07).** They stay everywhere they are drawn today (windows, app views, menus, popovers, toolbars), through the existing internal geometry renderer. The public `NSESmoothSurface` component is removed; views and boxes take `cornerRadius` with `cornerCurve: "continuous"` (`CALayer.cornerCurve`), applied by Atmo and also available on `AFXLayer`. See [Boxes, shadows and corner evidence](#boxes-shadows-and-corner-evidence).
  - **Notification badges are untouched.** `NSENotificationButton` is not a badge: it is a push button with affirmative or negative tones, which the Notification Centre does not use, so it is removed. App badges keep flowing through the Notification Centre, and gain AppKit's API: `NSEApplication.dockTile.badgeLabel` (`NSDockTile`) for the app's own count, and `badge` on a posted notification (`UNNotificationContent.badge`), which replaces `badgeCount`.
- **D5. JSX props use AppKit property names** (`title`, `state`, `bezelStyle`, `buttonType`, `controlSize`, `keyEquivalent`, `toolTip`, `isEnabled`).
- **D6. `NSEMenuBar` stays as the component that draws the window's menu bar.** It renders the application's `mainMenu` (`NSEMenu` and `NSEMenuItem` objects with actions and validation).
- **D7. `NSEViewControllerView` is removed.** It is not AppKit. A view controller's `view` (which already carries `element`, `layer` and `isLoaded`) becomes renderable itself, and a parent places it as AppKit adds a subview: `<this.viewer.view className="…" />`.

## Summary of verdicts

Of the 181 UI and controller exports:

- **Keep:** about 45.
- **Rename:** about 15, including `NSETable` → `NSETableView`, `NSEOutline` → `NSEOutlineView`, `NSEPicker` → `NSEPopUpButton`, `NSEPushButton` → `NSEButton`, and `NSEPreferencesController` → `NSEUserDefaultsController`.
- **Merge into an AppKit class:** about 70. The largest merges:
  - `NSEButton` absorbs 8;
  - `NSEPopUpButton` absorbs 6;
  - `NSEStackView` absorbs 6;
  - `NSEDatePicker` absorbs 5;
  - `NSEProgressIndicator` absorbs 4;
  - `NSETableView` absorbs 6;
  - `NSEAlert` absorbs 7.
- **Make internal:** about 25.
- **Remove:** about 20.
- **Awaiting a decision:** about 10.

Afterwards the public UI surface is roughly 70 classes, each naming an AppKit class.

## Execution plan (after approval)

The beta break lands as one sweep, so no app is ever half-migrated. Each phase finishes before the next starts. Within a phase, the framework, the Atmo theme, the documentation, the developer MCP's lookup catalogue, the control gallery, every site app and Fusion change together. Each phase ends green: typecheck, tests, the site build, and a visual pass of the gallery in light and dark.

1. **Data views and source lists.** This unblocks Minimak's navigator and inspector.
   - `NSETableView`, `NSETableColumn`, `NSETableCellView`, `NSEOutlineView` in source-list style with group rows. Atmo's current sidebar look moves to group rows.
   - Remove `NSESidebar`, `NSEAccordionView` and the `NSEList` family.
   - `NSESplitViewController` renders its own view (no adapter).
2. **Buttons and fields.**
   - `NSEButton` with `buttonType` and `bezelStyle`, including disclosure. `NSESwitch`.
   - The `NSETextField` bezel styles, `NSESecureTextField`, and `NSEBox` with its box types.
3. **Pop-up buttons and menus.** The `NSEMenu` and `NSEMenuItem` objects, `NSEPopUpButton` (pull-down included, validated through the responder chain), `NSView.menu`, and `NSEApplication.mainMenu`.
4. **Values, progress, and date and time.** `NSESlider` `sliderType`, `NSEProgressIndicator`, `NSEDatePicker`.
5. **Layout and containers.** `NSEStackView` only, `NSEGridView`, `NSEPageController`, `NSEDrawer`; theme parts made internal.
6. **Windows and chrome.** The title bar from `NSEWindow` (title, `isDocumentEdited`, accessories), the bottom bar, `NSEToolbar` absorbing its controller, and alerts and sheets as objects (after D3).
7. **Navigation controllers** (after D2).
8. **Guard rails for agents:**
   - An `appkitCounterpart` field on every entry in the developer MCP's `lookup_sdk` catalogue.
   - A test that fails when a public NSE export has none.
   - A rule in the SDK's `AGENTS.md`: NSE names are AppKit names; an AppKit pattern goes in a theme, not a new component.

## Second pass

These are out of scope for this approval, listed so they are not forgotten:

- **Text system.** `NSETextStorage`, `NSELayoutManager`, `NSETextView` and `NSETextInputClient` are AppKit's. About 60 free functions around them (`applyNSETextOperations`, `findNSEText`, `nseToggleListOperations`…) would be methods on those classes in AppKit (`NSTextStorage.replaceCharacters(in:with:)`, `NSTextFinder`, `NSTextList`).
- **Foundation types.** `NumberFormatter`, `DateFormatter`, `ByteCountFormatter`, `IndexPath`, `IndexSet`, `SortDescriptor` and `ValueTransformer` follow Swift Foundation's unprefixed names, which is consistent. `TreeNode` should be `NSTreeNode` (Swift keeps the prefix); `SelectionModel` and `Predicate` need checking against `NSIndexSet` selection and `NSPredicate`.
- **SDK hooks** (`useDocument`, `useMedia`, …). These are SynCloudOS services, not AppKit; they need a separate review against `NSDocument`, `NSWorkspace`, `NSPasteboard` and friends.

## Progress

Updated as each phase lands on `dev`.

- [x] 1. Data views and source lists. `NSETableView`, `NSETableHeaderView`, `NSETableCellView` and `NSEOutlineView` take their AppKit names; source lists are `NSEOutlineView` with `selectionHighlightStyle: "sourceList"` and group items, drawn by Atmo as the old sidebar; lists are single-column `NSETableView`s and the `NSEList` family is removed; `NSESplitViewController` renders its own view of `NSESplitViewItem`s. Two items move: `NSEAccordionView`'s removal needs the disclosure bezel (phase 2), and `NSESidebar`, already internal, goes with `NSESourceListScene` (phase 7).
- [x] 2. Buttons and fields. One `NSEButton` (`buttonType`, `bezelStyle`, `controlSize` small/regular/large, AppKit prop names) replaces the push, toggle, tool, icon and checkbox components, and `NSESwitch` takes `state`; the disclosure bezel and `NSEStackView` fitting sizes replace `NSEAccordionView`; `NSESegmentedControl.segmentStyle` (`rounded`, `capsule`, `texturedRounded`), segment `image` and `width`, and `trackingMode` `select-any` replace `NSERadioGroup`, `NSERadioToolButtonGroup`, `NSEToolButtonGroup` and `NSETabGroup`; `NSEPickerGroup` is removed. Text fields: `NSETextField` with `isEditable={false}` (`font`, `textColor`, `monospacedDigits`, `lineBreakMode`) replaces `NSEText`; `NSESearchField` takes `recentSearches`, `maximumRecents` and `onRecentSearchesChange` in place of `NSESearchFieldController`; `NSERoundedInput`, `NSEToolInput` and `NSEPasswordField` are removed, and `NSEInputBox` is internal to the developer Inspector. Boxes: `NSEBox` takes `boxType`, `borderType`, `titlePosition` (AppKit's names), `contentViewMargins` (an `NSSize`) and `fillColor`; `NSEGroupBox` is an `NSEBox` with a title; `NSEDivider` is internal theme art, and a separator `NSEBox` with a title draws the captioned separator. For owner review: (a) `buttonType: "radio"`: AppKit has a round radio button, but Atmo draws no such art (its radio family is the capsule strip), so it needs a design first, and until then Cappuccino's `CPRadio` maps to a capsule segmented control; (b) AppKit does not draw a separator box's title, but Atmo's captioned separator (About's chip headings) needs one, so a titled separator draws it; (c) the gallery's plain, soft and grey captioned divider variants had no caller outside the gallery and are gone.
- [x] 3. Pop-up buttons and menus. `NSEPopUpButton` (`items` of choice, separator and command items; `pullsDown` with a `title` and an `NSEMenu`; `bezelStyle` for the toolbar capsule) replaces `NSEPicker`, `NSEPopupButton`, `NSEChoiceControl`, `NSEListSelector`, `NSEPopupList` and `NSEIntegerPicker`, falling back to the native list without an overlay host. `NSEMenu` is the menu object: a title and `NSEMenuItem`s (command items with `action`, `actionPayload`, `title` and `image`; submenus; separators; view items), validated along the responder chain when a branch opens. It absorbs `NSEMenuController` and `NSEMenuModel`, and the old menu component is the internal `NSEMenuView`. `NSEView` carries a view's `menu` and `toolTip`, replacing `NSEContextMenu`. `NSEApplication.mainMenu` is drawn by `NSEMenuBar`, which validates it in the window that draws it. A menu row's key equivalent is its action's effective key binding, shown in the row and exposed as `aria-keyshortcuts`. The runtime's application menu (`NSEApplicationMenu`, `createNSEApplicationMenuModel`, `NSEAppMenuSurface`), `NSEMenuOverlay` and `NSEListboxPopup` are internal; `NSEAppMenu`, `NSEEditMenu` and `NSEHelpMenu` are removed, along with the gallery samples that showed them and the unreferenced Programme 07 page. For owner review: (a) `NSEMenuItem` has no `keyEquivalent` string: AppKit sets one on the item, but here it would only be a label, so the binding declared on the action is the single source (this exposed FieldLab's "⌘S" label, which never saved; Save now has a real binding); (b) shortcuts read `Ctrl+S` or `Cmd+S` from the key-binding manager, not glyphs such as ⌘S; (c) a pull-down no longer sends the button's own action when it opens; (d) setting `mainMenu` is the opt-in to a menu bar, but the framework does not yet fill standard Edit, Window or Help items: that needs the opt-in API proposed first; (e) the runtime application menu stays in the top bar rather than becoming `mainMenu`'s first item; (f) `NSEPopup` stays public until phase 6, where modal popups become sheets and anchored ones `NSEPopover`, since SynCal and Portfolio use it.
- [x] 4. Values, progress, date and time. `NSESlider` takes `sliderType: "circular"` in place of `NSECircularSlider`, and `NSEProgressSlider` is removed. `NSEProgressIndicator` (`style` bar or spinning, `isIndeterminate`, `value`, `minimum`, `maximum`, `controlSize`) replaces `NSEProgressBar`, `NSEProgressItem`, `NSESpinner` and the progress state union; `LoadingSpinner` is system chrome in `nse/system-ui` only. `NSEDatePicker` (`datePickerElements`, `datePickerMode`, `datePickerStyle`, `presentsCalendarOverlay`, `isEnabled`, `isEditable`) replaces `NSETimePicker`, `NSEDateTimePicker`, `NSEDateRangePicker`, `NSECalendarView` and `NSEClockView`, which are its internal editors; `NSEDateTimePickerValue` is `NSEDateTimeValue`. The value controls (`NSESlider`, `NSEStepper`, `NSELevelIndicator`, `NSESegmentedControl` and its segments) take `isEnabled`; the slider loses `min`/`max` and `onChanging`/`onChange`, and `onValueChange` always receives the phase. Atmo draws the progress bar at 14px with half-circle ends in the measured track and fill colours. For owner review: (a) the public spinning indicator is the drawn ring (Publisher, FieldLab, conformance); the filmstrip sprite stays internal system chrome; (b) the bar keeps its status caption ("42%", "Loading") beside it, which AppKit does not draw; (c) the error, suspended, completed and hidden progress states are gone: to hide an indicator, don't render it; (d) paging a `clockAndCalendar` picker moves the selected date by a month, as AppKit does, where SynCal used to jump to the 1st; (e) `today` and `eventIndicatorsForDate` stay as NSE extensions for the graphical calendar, and the clock's repeated-hour `disambiguation` is no longer public on a time-only picker; (f) a slider change made outside a drag (keyboard, assistive technology) now commits; before, a slider given a range only previewed it and never committed; (g) `NSEPopUpButton` items and menu entries still say `disabled`: `NSMenuItem.isEnabled` belongs with phase 6's menu and popup work; (h) the gallery's progress bar is the 80px minimum width because its example sizes to content.
- [x] 5. Layout and containers. `NSEStackView` absorbs `NSEStack` and `NSEInline` (`orientation`, `spacing`, `overflowPolicy: "wrap"`; a stack with no per-view sizes or priorities is laid out by flexbox with the old markup), and its items default to `mustHold` visibility priority. `NSEGridView` and `NSEGridRow` replace `NSEForm` and `NSEFormRow` with the form's markup. `NSEFlex`, `NSEFit`, `NSESpacer`, `NSEOrdered`, `NSEFormSeparator`, `NSERowGroup`, `NSEDividerDrawer` and `NSEPane` are removed (the pane's markup is internal, for the inspector, drawers and sliding panes). `NSEPageController` (`arrangedObjects`, `selectedIndex`, `viewForObject`, `transitionStyle: "horizontalStrip"`, swipe) replaces `NSESlidingView`; the page curl's turn controller is internal. The material lighting and metal surface are internal. Pixel diffs of every gallery section and app route are identical except removed examples. For the owner:
  - (a) **Landed (owner decision 7, 2026-11-07):** `NSERoundedBox`, `NSEShadowView` and `NSESmoothSurface` are removed from the SDK, public indexes, namespace, registry and counterpart map, without aliases. `NSEBox` custom boxes draw the well, frame and floating looks from AppKit properties; `NSEShadow` is an NSShadow-shaped value on views and boxes. Atmo CSS chooses the recipe from neutral property attributes. The gallery callers have moved. See the [mapping and visual evidence](#boxes-shadows-and-corner-evidence).
  - (b) Content views in the gallery's split, sliding and navigation examples are custom `NSEBox`es with a headline label: the surface matches, but the line border is slightly darker than the pane's and the headline sits tighter.
  - (c) Diagnostics' inspector is a titled `NSEBox`.
  - (d) `NSESlidingPane` and `NSESlidingPanes` move with the navigation controllers (phase 7), and `NSEPage` merges into `NSEPageController` as `pageCurl` with the D4 items.
- [ ] 6. Windows and chrome. Landed so far: `NSERulerView` and `NSEWebView` (verified loading example.org in the gallery; the site's host authorises that one origin, sandboxed, with no capabilities); `NSEHeader`, `NSEPrevNextBanner` and `NSEToaster` removed (the gallery posts notices through `useNotifications`); `NSEAppFrame`, the toolbar overflow menu, `allocateNSEToolbarItems` and the colour wheel, slider and swatch pickers internal. Inline toolbars (stage 1 of Option C, Atmo parity verified pixel for pixel): a lone tool button is an `NSEButton` with the `texturedRounded` bezel, which Atmo draws with the toolbar capsule sprite; a joined row is an `NSESegmentedControl` with `segmentStyle: "texturedRounded"` (momentary for actions), which gained `className`, `haptic` and per-segment `toolTip` (`setToolTip(_:forSegment:)`). Journal, JournalOld, MemoJournal, SynCal, Webspring (dial and board), the gallery and the font panel's alignment moved. Still to do: the title bar from `NSEWindow` (`NSETopBar`), the bottom bar in place of `NSEStatusBar`, `NSEToolbarController` and `NSEToolbarConfigurationSheet` merged into `NSEToolbar`, alerts and sheets as objects (D3), and `isEnabled` on pop-up items. Popovers: `presentAsPopover` on `NSEViewController` (Publisher's publish options, Insert Image and Advanced Options, and the gallery, moved); `NSEPopover` is internal (date pickers). For the owner: D3 alerts: `NSEAlert` is an object (`messageText`, `informativeText`, `alertStyle`, `addButton`, `beginSheetModal(for:)`, `NSEModalResponse`), `NSEWindow.endSheet`, `NSView.window` as `view.window`; the old component is the host-internal `NSEAlertSurface`. D3 sheets: `presentAsSheet`/`dismiss`/`presentedViewControllers`/`preferredContentSize` on `NSEViewController`; Journal, JournalOld, MemoJournal, AnimationFX and Journal Publisher moved. D3 finished: `NSEDialog`, `NSEModalDialog` and `NSEConfirmPrompt` are removed (the gallery shows `NSEAlert` and a sheet instead), and `NSEDialogSurface` and `NSEAlertBackdrop` are host-internal. `NSEConfirmDialog` stays in `nse/system-ui` for host UI outside any window (the MemoJournal web preview). Sheets attach to their window: view-controller sheets and `NSEAlert.beginSheetModal(for:)` alerts render in the window's sheet layer under its title bar and toolbar, slide down from that edge, make the window's toolbar, accessories and content inert, and refuse its close button and Close command while attached; alerts are queued per window, not on the system alert centre. `NSEAlert.runModal()` is the centred application-modal alert (Journal, JournalOld and MemoJournal confirm with it). Menus: on a desktop a chosen item or pop-up row flashes, then the menu fades out; a pop-up list's highlight follows the pointer, pressing an open pop-up button closes it, and the button is sized to its widest item. The source-list bar shows `window.title`; the gallery and Software name their window after the section shown. D7 done: `NSEViewControllerView` is removed from the SDK, and a view controller's `view` renders itself (`<child.view className="…" />`); the site's apps and FieldLab moved. `NSETopBar` is internal: the host draws a window's title bar from `NSEWindow` (`title`, the document's "— Edited", toolbar and titlebar accessories), and the Journal apps, MemoJournal and SynCal draw their phone chrome's Webspring, settings and user-info glyphs from the site's own `Libraries/PhoneChrome`. `NSEToolbarController` and the configuration sheet are internal to `NSEToolbar`, and pop-up items take `isEnabled`. `presentAsModalWindow` on `NSEViewController` presents a centred application-modal window on Atmo's modal plate; SynCal's six panels (event, editor, preferences, reminders, sync, Jump To) moved to it, pixel-identical. The window's bottom bar moves with `NSESourceListScene` (phase 7), its only caller.
  - (a) `NSEPageHeader` is still public: it draws the gallery's section plate, and that look lives in Atmo. Removing it needs a decision on what draws the plate (a label in an `NSEBox`, or a gallery-owned view).
    - **Decided (owner, 2026-11-07): option A.**
      - The gallery's plate becomes the window's expanded title: `window.title = "Buttons"`, `toolbarStyle = "expanded"`.
      - There is no subtitle and no all-caps parent-section label. The owner said: "never ever do all caps text like that… You only need to write Buttons".
      - The description line becomes ordinary content: an `NSETextField` with the secondary label colour.
      - Phones keep the large title fixed under the bar, since AppKit has no collapsing title and we invent no API.
      - `NSEPreferencesToast`'s cap becomes its panel's title bar (`toolbarStyle = "preference"`): the title follows the pane, and Back is a leading title-bar accessory.
      - Atmo draws the webOS plate for both. `NSEPageHeader` leaves the public API.
      - Mock-up: https://claude.ai/artifact/F7ooqfeQJXQqgZrt4RowCV
  - (b) **Decision 4 — Landed (framework):** `NSEPopover` draws a continuous plate-and-arrow frame, positioned by Floating UI's arrow, flip, shift and size middleware. AppKit's `minX` / `maxX` / `minY` / `maxY` edges are preserved; optional `relativeTo` positions against a rectangle in the view. Opening uses a 320 ms AnimationFX spring about the arrow tip; closing uses a 150 ms fade/scale, with a short cross-fade for reduced motion. `drawsBackground` defaults to true on the internal popover and `presentAsPopover`'s positioning options. With false, the content paints its plate and sets `--nse-popover-content-fill` on its root for the arrow; frame, shadow, clipping and behaviour remain framework-owned. Atmo supplies light and dark Aqua colours. Compact sheets retain their content and omit the arrow. Framework tests and server-free Chromium, Firefox and WebKit probes cover DPR 1 and 2, collision sizing, motion and paper surfaces. Portfolio and Publisher migrations remain Claude's follow-up; `NSEPopup` remains public until those callers move. See [Popovers](../../framework/windows.md#popovers).
- [x] D4 Cover Flow. `NSECollectionView` takes a Cover Flow layout (`createCoverFlowCollectionLayout`: item shape, `cameraDistance`, `cameraPitch`, `isWrapped`). AnimationFX draws it from AnimationFX's showcase geometry, with replicator-layer reflections and a continuous scroll on the AnimationFX frame clock; pictures are ImageFX resources. Software and the gallery use it; `NSECoverFlow` and `nse/cover-flow` are removed.
- [x] 7. Navigation controllers. [Steps 3–5 and the complete behaviour inventory](2026-11-06-navigation-controllers.md) are implemented: fixed AppKit tab styles plus the approved `sidebarAdaptable` extension; split `compactItem`/`showDetail`, retained compact panes and theme/stage Back; page-controller drill-in; source-list windows with ordinary `window.bottomBarAccessory` views. Journal, JournalOld, Software, Portfolio and the gallery migrated. Adaptive/source-list/status/sliding public APIs, types, registry entries and pinned exports are removed without aliases. The owner approved both extension names on 2026-11-07. The earlier split measurement loop is fixed by a single renderer bounds authority; completion evidence and recorded visual differences are linked in the navigation plan.
- [x] 8. Agent guard rails. The SDK's `AGENTS.md` (the authoring contract) states that NSE names are AppKit names, new looks are theme recipes on AppKit classes, and UIKit idioms and invented AppKit-sounding API are out, and tells agents to read `appkitCounterpart`. `docs/framework/appkit-counterparts.json` (shipped in the SDK) maps all 541 public NSE names: 444 entries, and a type such as `NSEButtonProps` takes its class's counterpart through the listed suffixes. An entry is the AppKit, Foundation or Core framework name, or `{ none, replacement? }` for SynCloudOS services and for names a phase removes. `lookup_sdk` returns it as `appkitCounterpart` on every NSE symbol. `tests/runtime/appkit-counterparts.test.ts` fails when a public NSE export has no entry, or the map lists a name the SDK no longer exports.
- [ ] 9. Application objects, images and graphics. These approved verdicts belong to no earlier phase: `NSEPreferencesController` → `NSEUserDefaultsController`; `NSEFeedbackProvider` → `NSEHapticFeedbackManager`; `NSEAppearanceProvider` → `NSEAppearance`; `NSEAnimationDefaults` and `NSEAnimationEnvironmentProvider` → `NSEAnimationContext`; `NSEActionScopeProvider`, `NSEStandaloneControlHost`, `NSEFocusScope`, `NSETooltipProvider`, `NSEPresence` and `NSELayoutView` internal; `NSESizeableImage`, `NSEScrollingImage` and `NSEViewImage` merged into `NSEImageView` and `NSEScrollView`; `NSERotatingImage` removed; and the D4 items: `NSEGraphicsView` → `NSEView` with `draw`, `NSEPage` → `NSEPageController` `pageCurl` (**Landed**, owner decision 8), `NSECroppableImage` → `IFXImageView`, `NSEMediaPanel` → `NSEOpenPanel` media sources. The theme parts (`NSERoundedBox`, `NSEShadowView`, `NSESmoothSurface`) are **Landed** under phase 5 (a), owner decision 7: public box, shadow and corner properties replace the three public components.
  - Landed: `NSEUserDefaultsController` with `NSEUserDefaults` (`object(forKey)`, `set(value, forKey)`, `removeObject(forKey)` over `SCOS.preferences`, or memory); `NSEHapticFeedbackManager.defaultPerformer.perform(pattern, performanceTime)` through the host's engine (launcher views keep the full HFX range through `useWebspringHapticEngine`); `NSEAppearance` (`aqua` or `darkAqua`, with theme, chrome, contrast and transparency) set as `NSEView`'s `appearance`; `NSEAnimationContext.current` (duration, timing function, `allowsImplicitAnimation`), with Atmo's curves exported as `atmoMotion`; `NSERotatingImage` removed; `NSEActionScopeProvider`, `NSEStandaloneControlHost`, `NSEFocusScope` and `NSETooltipProvider` internal.
  - (a) **Landed — animation objects, owner decisions 5 and 6:** `NSEAnimationContext.runAnimationGroup` scopes duration, timing and implicit-animation transactions. Reduced motion is the existing reactive `NSEViewController.traitCollection.reducedMotion`, also read through `useNSETraitCollection`; the environment provider and testing overrides are internal. The conformance specimen reports the live system setting; reduced-motion evidence uses browser media emulation. `present(viewController, animator)` / `dismiss`, `NSEViewControllerPresentationAnimator`, child `transition(from, to, options, completionHandler)` and `view.animator()` replace public presence, presentation and layout helpers. MemoJournal, Webspring, Netburst, the gallery, Journal, JournalOld, About and Portfolio have moved; retired exports have no aliases. See [Animation objects](../../framework/nse/animation.md) and the [implementation and verification plan](2026-11-07-animation-objects.md).

## Boxes, shadows and corner evidence

Owner decision 7, 2026-11-07: "Boxes/shadows: AppKit-style properties, theme-driven Atmo rendering. Visual improvements welcome."

Landed in `eaa4185` (properties, theme recipes, public removal, tests and docs), `6996deb` (licence headers) and `dc2a217` (custom boxes retain their original outer alignment). The public authoring reference is [Boxes, shadows and corners](../../framework/nse/boxes-and-shadows.md).

| AppKit properties | Atmo drawing |
| --- | --- |
| `NSEBox`, `boxType="custom"`, default `borderType="bezelBorder"`, no shadow | Rounded well; original 14-slice inset artwork. |
| Custom box, `borderType="lineBorder"` or `"grooveBorder"`, no shadow | Rounded frame; original 18-slice artwork. |
| Custom box with non-null `shadow` | Floating plate; original 18-slice plate plus the requested NSShadow colour, offset and blur. |
| Custom box, `borderType="noBorder"` | Plain interior with no border, including when shadowed. |
| Explicit `fillColor`, `borderColor`, `borderWidth`, `cornerRadius` or `cornerCurve` | Scalable CSS fill and border replace fixed artwork so exact property values take precedence. A shadow still draws. |
| `isTransparent={true}` | No interior fill or opaque sprite centre. Border and shadow remain. |
| `contentViewMargins={{ width, height }}`, `title`, `titlePosition` | Exact content insets, including zero, and NSBox's existing legend/grouping and title-position attributes. Custom boxes default to 12 px content insets and zero outer margin. |
| `cornerRadius`, `cornerCurve="continuous"` on a view or AFX layer | Atmo draws a squircle. AFX also applies the curve to SVG alpha masks and portable composition. Existing internal host geometry keeps the corners of windows, app views, menus, popovers and toolbars. |

The framework projects semantic data attributes and CSS variables. Applications choose no Atmo variant. `NSEShadow` copies and freezes `shadowColor`, `shadowOffset` (NSSize, positive height upwards) and `shadowBlurRadius`; it is assigned directly to `NSEView.shadow` or `NSEBox.shadow`. No extra shadow view or GraphicsFX spread field is required. Appearance context and forced-colour/reduced-transparency media queries suppress decorative shadows without clipping focus.

### Recorded visual changes

The reproducible [browser fixture](../evidence/2026-11-07-box-shadow/verify-boxes.cjs) renders the actual packed components and their complete CSS/asset graph. The baseline is framework `4e0085f`, site archive `68881ae54dbfd31e196d5b49359d410be0952da9cf5257996673eecfa2f6dd54`. The after archive is `2a2f0df45ac420ecabf6f72bc26e03cf86d45eaf23636ad28a220864ac9add06`, framework `1e2ed78`, which includes both the box work and the navigation commits. Archive identity and measured values are retained in [measurements.json](../evidence/2026-11-07-box-shadow/measurements.json).

| Intentional change | Measurement | Before / after screenshots |
| --- | --- | --- |
| Custom boxes fit narrow panes | In a 140 px pane the old component remains 180 px wide, overflowing by 40 px; the custom NSBox fits at 140 px. Verified at DPR 1 and 2 in light and dark. | [Before](../evidence/2026-11-07-box-shadow/narrow-before.png) / [after](../evidence/2026-11-07-box-shadow/narrow-after.png); [dark before](../evidence/2026-11-07-box-shadow/narrow-before-dark.png) / [dark after](../evidence/2026-11-07-box-shadow/narrow-after-dark.png). |
| A floating plate responds to the app's shadow value | The example adds an actual CSS shadow of `rgba(0,0,0,0.2) 0px 2px 6px 0px` to the plate artwork, replacing a fixed sprite-only shadow choice. | [Before](../evidence/2026-11-07-box-shadow/recipes-before-dpr1.png) / [after](../evidence/2026-11-07-box-shadow/recipes-after-dpr1.png); [DPR 2 before](../evidence/2026-11-07-box-shadow/recipes-before-dpr2.png) / [after](../evidence/2026-11-07-box-shadow/recipes-after-dpr2.png). |

The normal three-box fixture retains 216 × 76 px bounds and 14 / 18 / 18 slices before and after. The well and frame retain their original artwork. Additional captures show [explicit fill, border and continuous corners](../evidence/2026-11-07-box-shadow/properties-after-dpr2.png), [forced colours with keyboard focus](../evidence/2026-11-07-box-shadow/properties-forced-colours-dpr2.png), and the [dark recipes](../evidence/2026-11-07-box-shadow/recipes-after-dark-dpr2.png). These are Chromium render checks, not physical-device or owner visual acceptance.

### Gallery and remaining acceptance

The seven gallery callers and its search assertion use the new properties. No calls to the three removed components were found in either `SynCloudOS-Fusion/src` or `SynCloudOS-Fusion-gemini/src`; Fusion was not edited.

Live gallery baselines are retained for [boxes](../evidence/2026-11-07-box-shadow/gallery-boxes-before.png) and [shadows](../evidence/2026-11-07-box-shadow/gallery-shadow-before.png), at 1440 × 1000, DPR 1. A matching full-gallery after capture is blocked by the navigation session's window/split rendering loop: `APP_CONTENT_FAILED`, "Maximum update depth exceeded", reproduced on port 5199 with frameworks `1e2ed78` and `4aa8a4c`. The same error fails `gallery-class.test.tsx`'s "hands keyboard navigation focus between retained adaptive presentations" at `NSESplitViewController.ts:528`. See the [live diagnostic](../evidence/2026-11-07-box-shadow/gallery-navigation-blocker.png). Its owned files were left untouched.

Both framework and site TypeScript checks pass. The final full site run on archive `4aa8a4c` has 389 passing tests and four failures (58 files, 393 tests): the gallery settings-popover assertion, the navigation focus loop, and Publisher's two replacement-anchor popover assertions. These belong to the other agents' window/navigation and popover changes. Four focused gallery files pass all 22 tests; the two new shadow-probe regression cases also pass. The clean `dc2a217` checkout's scoped framework run passed 98 of 99 tests across 11 files, including the external packed consumer and counterpart map. One existing haptics test hit the 5 s test timeout during parallel validation; its complete 14-test file passed when rerun alone. Coverage includes property-to-Atmo CSS mapping, immutable shadow values, removal of public exports, NSBox grouping, existing smooth host geometry, AFX projection/composition/alpha masks and vector residency. The full framework suite is reserved for Claude.

Site commits: `16baa48` migrates the gallery, `0dc3b09` separates concurrently staged navigation changes back into their owner's unchanged working files, `9d0fff9` updates and tests the conformance shadow probes, and `65411a2` adopts the clean `4aa8a4c` archive (`6dfec01c453c803f33451a3e2f160d83ea9e1a2b2a545117d3bb6bfebe1bcefe`). A later shared working-tree adoption of `2a50c75` was preserved without modification. Both temporary checkouts were removed only after deleting their node_modules junctions and checking the shared framework Vitest executable.

New live CSS continuous corners use `corner-shape: squircle`; engines without CSS corner-shape retain circular radius fallback. Existing framework smooth geometry is unchanged. Full-gallery after captures and owner acceptance remain pending the navigation repair; there is no outstanding box/shadow API decision.

### Phase 9: Open panel sources

**Landed 2026-11-07:** D4 media sources, persistent granted folders, application-support storage and desktop/compact Open panel presentations are implemented together. See [Open panel API](../../framework/nse/open-panel.md). Browser and suite evidence is recorded with the [Open panel plan](2026-11-07-open-panel.md); native directory chooser approval remains a manual check.
