# NSE controls

NSE is the application kit of SynCloudOS, the counterpart of AppKit. It supplies the buttons, fields, containers, data views, menus, panels and text machinery an application is built from. The prefix follows the Apple convention: `NS` for NeXTSTEP, `NSE` for the New Syndromatic Experience. Where a Mac developer reaches for `NSButton` or `NSTableView`, you reach for `NSEButton` or `NSETableView`.

Controls describe what they are and how they behave. The [Atmo theme](appearance.md) decides how they look, so the same component renders correctly in light and dark mode and in every presentation.

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/nse/themes/atmo/styles.css";
```

Import controls from `@syndromatic/syncloudos/nse`. Focused subpaths such as `nse/controls`, `nse/text`, `nse/layout`, `nse/scroll`, `nse/page` and `nse/system-ui` expose subsets for code that wants narrower imports.

## A first form

```tsx
import { useState } from "react";
import {
  NSEBox,
  NSEButton,
  NSEProgressIndicator,
  NSESegmentedControl,
  NSESlider,
  NSETextField,
  type NSESegmentedSelection,
} from "@syndromatic/syncloudos/nse";

export function ExportSettings() {
  const [name, setName] = useState("Report");
  const [compress, setCompress] = useState<"on" | "off">("on");
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState<NSESegmentedSelection>({
    mode: "select-one",
    selectedIds: new Set(["pdf"]),
    allowsEmpty: false,
  });

  return (
    <NSEBox title="Export">
      <NSETextField label="Name" value={name} onValueChange={(value) => setName(value)} />
      <NSESegmentedControl
        aria-label="Format"
        items={[
          { id: "pdf", label: "PDF" },
          { id: "png", label: "PNG" },
        ]}
        selection={format}
        onSelectionChange={setFormat}
      />
      <NSESlider aria-label="Quality" label="Quality" minimum={0} maximum={100} value={quality} onValueChange={(value) => setQuality(value)} />
      <NSEButton buttonType="switch" title="Compress" state={compress} onStateChange={(state) => setCompress(state === "on" ? "on" : "off")} />
      <NSEProgressIndicator aria-label="Export progress" value={40} />
      <NSEButton title="Export" keyEquivalent={"\r"} />
    </NSEBox>
  );
}
```

## Conventions

- **Native elements underneath.** Buttons are `<button>`, fields are `<input>`, and each control accepts the attributes of its element. Form submission, autofill and assistive technology work as they do on any page.
- **Values and phases.** Controls that produce values call `onValueChange(value, phase)`. The phase distinguishes a `"preview"` during a drag from the `"commit"` that follows, so you can update a live readout without recording an undo step for every pixel.
- **Control sizes.** Many controls take `controlSize` of `"regular"`, `"small"` or `"mini"`.
- **Labels are required.** Controls without visible text require an `aria-label`, and the types enforce it.
- **Reduced motion and forced colours.** Every control honours the user's settings without extra code.
- **Commands.** Fields and segmented controls accept a command binding, so a control dispatches the same commands as menus and key bindings.

## Reference pages

The tables below give an overview. These pages document each component's props, defaults, keyboard behaviour and errors, with examples.

| Page | Covers |
| --- | --- |
| [Buttons](nse/buttons.md) | Push, icon, toggle, tool, activity, notification, progress and file picker buttons |
| [Text fields and choice controls](nse/text-and-choice.md) | Text, password, secure, search, combo and token fields, checkboxes, radio groups, boxes |
| [Values, pickers and progress](nse/values-and-progress.md) | Sliders, steppers, level indicators, segmented controls, pop-up buttons, progress, date pickers |
| [Stacks and grids](nse/stacks-and-grids.md) | `NSEStackView` and `NSEGridView` |
| [Menus, toolbars and inspectors](nse/menus-toolbars-and-inspectors.md) | Choosing a menu control, responder provenance, configured toolbars, narrow inspectors, keep-mounted panes |

Focused entries include `NSEDrawer` and `NSESplitViewController` in `nse/controls`, text machinery in `nse/text`, `NSEScrollView` in `nse/scroll`, and `NSEPageController` in `nse/page`. `NSETextView` is also available through the aggregate `nse` entry. Each page names the entry it needs.

## Buttons

| Component | Purpose |
| --- | --- |
| `NSEButton` | `NSButton`: push, toggle (`pushOnPushOff`), checkbox (`switch`), toolbar (`texturedRounded`) and disclosure buttons, set by `buttonType` and `bezelStyle`. |
| `NSESwitch` | `NSSwitch`: an on/off switch. |
| `NSEPopUpButton` | A pop-up button showing the selected choice, or (`pullsDown`) a button that opens a menu of commands. |

## Fields

| Component | Purpose |
| --- | --- |
| `NSETextField` | Single line text input with prefix, suffix, validation and formatter support. |
| `NSETextField` with `isEditable={false}` | A label (`NSTextField(labelWithString:)`) in a text style. |
| `NSESecureTextField` | Concealed input for secrets. |
| `NSESearchField` | A search box with a clear control and `recentSearches`. |
| `NSEComboBox` | An editable field with a completion list. |
| `NSETokenField` | Tokenised entry such as tags or recipients. |

## Values and progress

| Component | Purpose |
| --- | --- |
| `NSESlider` | A slider: linear (horizontal or vertical, with ticks and detents) or circular (`sliderType`). |
| `NSEStepper` | Increment and decrement, with hold to repeat, bounds and wrapping. |
| `NSELevelIndicator` | Continuous, discrete, capacity and rating indicators with warning and critical thresholds. |
| `NSESegmentedControl` | Momentary, select-one and select-any segments in the rounded, capsule and textured styles, with overflow handling. One-of-many choices and tab strips are segmented controls, and so is a joined row of tool buttons (`segmentStyle: "texturedRounded"`, momentary); a lone tool button is an `NSEButton` with the `texturedRounded` bezel. `className` styles the root, `haptic` sets each segment's haptic and an item's `toolTip` is `setToolTip(_:forSegment:)`. |
| `NSEProgressIndicator` | `NSProgressIndicator`: a determinate or indeterminate bar, or a spinning indicator. |

## Date, time and colour

| Component | Purpose |
| --- | --- |
| `NSEDatePicker` | `NSDatePicker`: a date, a date range, a time, or a date and time, as a text field or a graphical calendar and clock, with full keyboard support. See [Date pickers](nse/values-and-progress.md#date-pickers). |
| `NSEColourWell` | Colour selection control. |
| `NSEColourPanel` | The shared colour panel. Applications reach it through `useColourPanel`. |

## Containers and layout

| Component | Purpose |
| --- | --- |
| `NSEStackView`, `NSEStackItem` | `NSStackView`: views in a row or a column, with distribution, alignment, spacing and visibility priorities. Views below `mustHold` that no longer fit detach into an overflow menu, in priority order, and stay reachable from the keyboard. See [Stacks and grids](nse/stacks-and-grids.md). |
| `NSEGridView`, `NSEGridRow` | `NSGridView`: views in rows and columns. A trailing label column and a fill column make a Mac form. |
| `NSEBox` | `NSBox`: titled boxes, separators, and custom boxes with `fillColour`, `borderColour`, `borderWidth`, `cornerRadius`, `contentViewMargins`, `isTransparent` and `shadow`. See [Boxes and shadows](nse/boxes-and-shadows.md). |
| `NSESplitView` | Two resizable panes, a sidebar beside the main view. |
| `NSEScrollView`, `NSEClipView` | Scrolling with momentum and rubber banding. |
| `NSETabView`, `NSETabViewController` | Tabbed content and owned child view controllers; fixed or `sidebarAdaptable` placement. |
| `NSEButton` (`bezelStyle="disclosure"`) in an `NSEStackView` | Collapsible sections: the disclosure button shows and hides the stack item below it, as in AppKit. |
| `NSESplitViewController` | Source-list outline/sidebar and detail items, with compact collapse and `showDetail`. |
| `NSEDrawer` | A drawer that slides from a window edge. |
| `NSEPageController` | `NSPageController`: child view controllers display `arrangedObjects`. `transitionStyle` is `"stackHistory"` (the default, with drill-in history), `"horizontalStrip"` (sliding pages) or `"pageCurl"` (a physical paper curl). `navigateForwardToObject`, `navigateBack`, `navigateForward` and horizontal gestures navigate. In `pageCurl`, `spineLocation: "min"` (the default) shows a single page; `"mid"` shows two-page spreads. See the [controller contract](controllers.md#page-controller). |

## Data views

Data views render collections owned by a controller. They are virtualised, so a list of ten thousand rows costs no more to draw than a list of ten. See [Structured data views](data-views.md).

| Component | Purpose |
| --- | --- |
| `NSETableView` | Sortable, resizable, editable columns, and lists (one column, `headerHidden`). |
| `NSEOutlineView` | Expandable hierarchies, and sidebar source lists (`selectionHighlightStyle="sourceList"`, group items). |
| `NSECollectionView` | Grids and adaptive layouts of items. |
| `NSEBrowser` | Multi column hierarchical browsing. |
| `NSERuleEditor`, `NSEPredicateEditor` | Editors for rules and predicates. |

## Menus and toolbars

| Component | Purpose |
| --- | --- |
| `NSEMenu` | A menu object (`NSMenu`) of command, submenu, separator and view items, validated along the responder chain when it opens. A pull-down `NSEPopUpButton` shows one, a view shows one as its `NSEView.menu`, and the application's `mainMenu` is one. |
| `NSEMenuBar` | Draws the application's `mainMenu` across the window. |

On a desktop (a fine pointer that hovers), choosing an item in any menu or pop-up list flashes it (highlighted, unhighlighted, highlighted again) before the command runs, then the menu fades out, as a Mac menu does. Dismissing a menu without a choice closes it at once, and touch presentations do neither. A pop-up button's list is at least as wide as the button, and without a `width` the button is sized to its widest item (`sizeToFit`). Pressing an open pop-up button closes its list.
| `NSEView` | A view with a contextual `menu` and a `toolTip` (`NSView.menu`, `NSView.toolTip`). |
| `NSEPopup` | An anchored or modal popup plate. |
| `NSEToolbar` | A window's toolbar (`window.toolbar`): validated items, overflow, display and size modes, the customisation palette and autosaved configuration. |

## Panels and overlays

| Component | Purpose |
| --- | --- |
| `NSEAlert` | An alert object (`NSAlert`) presented as a sheet on a window. See [Alerts and sheets](windows.md#alerts-and-sheets). |
| `NSEAlert`, `presentAsSheet` | An alert is an `NSEAlert` object presented on a window; a custom dialog is a view controller presented as a sheet. See [Alerts and sheets](windows.md#alerts-and-sheets). Host system UI outside any window uses `NSEConfirmDialog` from `nse/system-ui`. |
| `presentAsModalWindow` | `NSEViewController.presentAsModalWindow(controller)` presents a view controller as a centred application-modal window. See [Modal windows](windows.md#modal-windows). |
| `presentAsPopover` | `NSEViewController.presentAsPopover(controller, { of, preferredEdge, behavior })` presents a view controller in a popover. See [Popovers](windows.md#popovers). |
| `NSEOpenPanel`, `NSESavePanel` | [File panels](nse/open-panel.md): granted folders, media sources and application storage. |
| `NSEFontPanel` | The font panel. Media sources are part of `NSEOpenPanel`. |
| `toolTip` | Every NSE view and control takes a `toolTip`, as `NSView.toolTip` does; the host shows it. Transient notices go through the notification service (`useNotifications`). |
| `NSEHapticFeedbackManager` | `NSHapticFeedbackManager`: `NSEHapticFeedbackManager.defaultPerformer.perform("alignment")` (`generic`, `alignment`, `levelChange`; `performanceTime` `default`, `now` or `drawCompleted`) for feedback from your own views. Controls perform their own. |

## Images and graphics

| Component | Purpose |
| --- | --- |
| `NSEImageView` | Displays an image fitted to the view or at natural size (`imageScaling`). A carousel is an `NSEPageController` of image views; to crop, use ImageFX's `IFXImageView`. |
| `NSEView` | `draw(dirtyRect, context)` records GraphicsFX content at the view’s measured bounds; `layerContentsPlacement` places its layer contents. Also carries `menu`, `toolTip` and `appearance`. |
| `snapshotNSEView` | Draws a view your app owns into a PNG data URL, for a version card, a drag image or a thumbnail. Canvas content is left out. |
| `NSEShadow` | `NSShadow`: `shadowColour`, `shadowOffset` and `shadowBlurRadius`, set as `shadow` on a view or box. Smooth corners are `cornerRadius` and `cornerCurve: "continuous"` on views and AFX layers; material renderers are theme internals. |

## Navigation controllers

Some controls come with a controller that holds their state and restoration data.

| Controller | Drives |
| --- | --- |
| `NSEPageController` | Drill-in history, horizontal strips or page curls, with child controllers for arranged objects and single-page or two-page curl layouts. See [Page controller](controllers.md#page-controller). |
| `NSESplitViewController.compactItem` | The selected split item in a compact layout (NSE extension). |
| `NSETabViewController`, `NSETabViewItem` | A container showing one child at a time behind a tab control (`NSTabViewController`): `tabViewItems` (each an `NSETabViewItem` with the child `viewController`, `label`, `image` and `toolTip`), `selectedTabViewItemIndex`, and `tabStyle` (`segmentedControlOnTop`, `segmentedControlOnBottom`, which Atmo draws as its bottom tab bar, or `unspecified`). Override `shouldSelect`, `willSelect` and `didSelect`. Place it with `<tabs.view />`. |
| `NSETabViewController` | Tab view items, selected index, restoration and fixed or adaptive tab placement. |
| `NSESplitViewController`, `NSESplitViewItem` | A split view of child view controllers: thicknesses, holding priorities and collapse. |
| `NSETitlebarAccessoryViewController` | A view controller drawn in the window's title bar (`window.addTitlebarAccessoryViewController`). |

The [controllers guide](controllers.md) covers the array, tree and preferences controllers.

## Text and web content

| Component | Purpose |
| --- | --- |
| `NSETextView` | A text view over a canonical owner and independent editing session. See [Text and editing](text-and-editing.md). |
| `NSEFontManager`, `NSELayoutManager`, `NSERulerView`, `drawNSEString` | Typography and text layout. |
| `NSEWebView` | Hosts external web content inside a sandbox. |

## Tracking and animation

`useNSETrackingRegion` reports pointer entry, exit and movement over a region. `NSECursor` sets the pointer cursor. `NSEAnimationContext` groups view animator and layer changes. Controllers read `traitCollection.reducedMotion`; function views read `useNSETraitCollection().reducedMotion`. See [animation objects](nse/animation.md) for custom presentations, child transitions and owned artwork.

## Accessibility

Every control exposes semantic roles, labels and states, a keyboard path and a touch path. Disabled, invalid, read-only and loading states reach assistive technology through `aria-disabled`, `aria-invalid` and native attributes. When a control reports a placement or policy failure, it does so through its host port and never substitutes a fallback of its own.
