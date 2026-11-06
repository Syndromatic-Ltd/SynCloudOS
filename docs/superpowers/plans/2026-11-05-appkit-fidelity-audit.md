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
| `NSEMediaPanel` | The Open panel's Media sidebar section (MediaLibrary, `MLMediaLibrary`) | Merge into `NSEOpenPanel` media sources (D4) | Gallery |
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
  - **Page curl** becomes a `transitionStyle` of `NSEPageController`, beside AppKit's `stackHistory`, `stackBook` and `horizontalStrip`; the curl is named `pageCurl` after UIKit's `UIPageViewController.TransitionStyle.pageCurl`. `NSEPage` is removed.
  - **Crop** moves to ImageFX as `IFXImageView`, after ImageKit's `IKImageView` (`currentToolMode`: move, select, crop, rotate; `zoomFactor`, `rotationAngle`). ImageKit ships in the Quartz framework beside Core Image, which ImageFX mirrors. `NSECroppableImage` is removed.
  - **`NSEMediaPanel`** is removed. Apple has no public media-chooser panel; media appears in the Open panel's sidebar (the Media section: Photos, Music, Movies), backed by the MediaLibrary framework (`MLMediaLibrary`). The media providers become media sources of `NSEOpenPanel`.
  - **`NSEGraphicsView`** is renamed `NSEView`: AppKit draws custom content by overriding `NSView.draw(_:)`, and has no "graphics view". `NSEView` takes `draw(dirtyRect, context)` and is also where every view's `toolTip`, `menu` and `appearance` live.
  - **Smooth corners** stay everywhere they are drawn today (windows, app views, menus, popovers, toolbars). The public `NSESmoothSurface` component goes; the shape is a layer property, `cornerRadius` with `cornerCurve: "continuous"` (`CALayer.cornerCurve`), applied by Atmo and available on `AFXLayer`.
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
  - (a) `NSERoundedBox`, `NSEShadowView` and `NSESmoothSurface` are still public. Making them internal needs `NSEBox` custom boxes to draw the rounded box's three looks (well, frame, floating) and an `NSEShadow` on views; how a custom box picks the Atmo rounded look is a design choice, so it waits for a decision.
  - (b) Content views in the gallery's split, sliding and navigation examples are custom `NSEBox`es with a headline label: the surface matches, but the line border is slightly darker than the pane's and the headline sits tighter.
  - (c) Diagnostics' inspector is a titled `NSEBox`.
  - (d) `NSESlidingPane` and `NSESlidingPanes` move with the navigation controllers (phase 7), and `NSEPage` merges into `NSEPageController` as `pageCurl` with the D4 items.
- [ ] 6. Windows and chrome. Landed so far: `NSERulerView` and `NSEWebView` (verified loading example.org in the gallery; the site's host authorises that one origin, sandboxed, with no capabilities); `NSEHeader`, `NSEPrevNextBanner` and `NSEToaster` removed (the gallery posts notices through `useNotifications`); `NSEAppFrame`, the toolbar overflow menu, `allocateNSEToolbarItems` and the colour wheel, slider and swatch pickers internal. Still to do: the title bar from `NSEWindow` (`NSETopBar`), the bottom bar in place of `NSEStatusBar`, `NSEToolbarController` and `NSEToolbarConfigurationSheet` merged into `NSEToolbar`, alerts and sheets as objects (D3), and `isEnabled` on pop-up items. Popovers: `presentAsPopover` on `NSEViewController` (Publisher's publish options, Insert Image and Advanced Options, and the gallery, moved); `NSEPopover` is internal (date pickers). For the owner: D3 alerts: `NSEAlert` is an object (`messageText`, `informativeText`, `alertStyle`, `addButton`, `beginSheetModal(for:)`, `NSEModalResponse`), `NSEWindow.endSheet`, `NSView.window` as `view.window`; the old component is the host-internal `NSEAlertSurface`. D3 sheets: `presentAsSheet`/`dismiss`/`presentedViewControllers`/`preferredContentSize` on `NSEViewController`; Journal, JournalOld, MemoJournal, AnimationFX and Journal Publisher moved. D3 finished: `NSEDialog`, `NSEModalDialog` and `NSEConfirmPrompt` are removed (the gallery shows `NSEAlert` and a sheet instead), and `NSEDialogSurface` and `NSEAlertBackdrop` are host-internal. `NSEConfirmDialog` stays in `nse/system-ui` for host UI outside any window (the MemoJournal web preview).
  - (a) `NSEPageHeader` is still public: it draws the gallery's section plate, and that look lives in Atmo. Removing it needs a decision on what draws the plate (a label in an `NSEBox`, or a gallery-owned view).
- [x] D4 Cover Flow. `NSECollectionView` takes a Cover Flow layout (`createCoverFlowCollectionLayout`: item shape, `cameraDistance`, `cameraPitch`, `isWrapped`). AnimationFX draws it from AnimationFX's showcase geometry, with replicator-layer reflections and a continuous scroll on the AnimationFX frame clock; pictures are ImageFX resources. Software and the gallery use it; `NSECoverFlow` and `nse/cover-flow` are removed.
- [ ] 7. Navigation controllers
- [ ] 8. Agent guard rails
