# NSE controls

NSE (the New Syndromatic Experience) is the application kit of SynCloudOS: the buttons, fields, containers, data views, menus, panels and text system you build an application from. This page is a map of what's there and where each component is documented. If you've used AppKit, most names will be familiar with an `NSE` prefix, such as `NSEButton` and `NSETableView`.

Controls describe what they are and how they behave, and the [theme](appearance.md) decides how they look, so the same component renders correctly in light and dark mode and in every presentation. Import the base styles and the Atmo theme once:

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/nse/themes/atmo/styles.css";
```

Import controls from `@syndromatic/syncloudos/nse`. Focused entries such as `nse/controls`, `nse/text`, `nse/layout`, `nse/scroll`, `nse/page` and `nse/system-ui` export subsets if you want narrower imports.

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

- **Native elements underneath.** Buttons are `<button>`, fields are `<input>`, and each control accepts its element's attributes, so form submission, autofill and assistive technology work as they do on any page.
- **Values and phases.** Controls that produce values call `onValueChange(value, phase)`. The `phase` separates a `"preview"` during a drag from the `"commit"` that follows, so you can update a live readout without recording an undo step for every pixel.
- **Control sizes.** Many controls take a `controlSize` of `"regular"`, `"small"` or `"mini"`.
- **Labels.** Controls without visible text need an `aria-label`, and the types enforce it.
- **Reduced motion and forced colours.** Every control follows the user's settings without extra code.
- **Actions.** Buttons, segmented controls, pop-up buttons, path controls and menu items accept an `action`, so a control sends the same commands as menus and key bindings.

## Reference pages

The tables further down give an overview. These pages document each component's props, defaults, keyboard behaviour and errors, with examples.

| Page | Covers |
| --- | --- |
| [Buttons](nse/buttons.md) | `NSEButton` (push, toggle, checkbox, toolbar and disclosure buttons) and `NSESwitch` |
| [Text fields and choice controls](nse/text-and-choice.md) | Text fields and labels, secure, search, combo box and token fields, and boxes |
| [Values, pickers and progress](nse/values-and-progress.md) | Sliders, steppers, level indicators, segmented controls, pop-up buttons, progress, date pickers |
| [Stacks and grids](nse/stacks-and-grids.md) | `NSEStackView` and `NSEGridView` |
| [Menus, toolbars and inspectors](nse/menus-toolbars-and-inspectors.md) | Choosing a menu control, responder provenance, configured toolbars, narrow inspectors, keep-mounted panes |
| [Boxes, shadows and corners](nse/boxes-and-shadows.md) | Wells, frames, floating plates, `NSEShadow` and continuous corners |
| [Open panels](nse/open-panel.md) | `NSEOpenPanel`, granted folders, media sources and application storage |
| [Source-list chrome](nse/source-list-chrome.md) | Sidebar windows, compact layouts and adaptive tabs |
| [Animation objects](nse/animation.md) | Animation contexts, view animators, presentation animators and transitions |
| [Route picker](nse/route-picker.md) | `NSERoutePickerView` |

Some components live only in focused entries: `NSEDrawer` in `nse/controls`, `NSEScrollView` in `nse/scroll` and `NSEPageController` in `nse/page`. The text system is in `nse/text`, and `NSETextView` is also in the aggregate `nse` entry. Each page names the entry it needs.

## Buttons

| Component | Purpose |
| --- | --- |
| `NSEButton` | Push, toggle (`pushOnPushOff`), checkbox (`switch`), toolbar (`texturedRounded`) and disclosure buttons, set by `buttonType` and `bezelStyle`. |
| `NSESwitch` | An on/off switch. |
| `NSEPopUpButton` | A pop-up button showing the selected choice, or (`pullsDown`) a button that opens a menu of commands. |

## Fields

| Component | Purpose |
| --- | --- |
| `NSETextField` | Single-line text input with prefix, suffix, validation and formatter support. |
| `NSETextField` with `isEditable={false}` | A label in a text style. |
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
| `NSESegmentedControl` | Momentary, select-one and select-any segments in the rounded, capsule and textured styles, with overflow handling. One-of-many choices and tab strips are segmented controls, and so is a joined row of tool buttons (`segmentStyle: "texturedRounded"`, momentary); a lone tool button is an `NSEButton` with the `texturedRounded` bezel. `className` styles the root, `haptic` sets each segment's haptic and an item's `toolTip` sets that segment's tooltip. |
| `NSEProgressIndicator` | A determinate or indeterminate bar, or a spinning indicator. |

## Date, time and colour

| Component | Purpose |
| --- | --- |
| `NSEDatePicker` | A date, a date range, a time, or a date and time, as a text field or a graphical calendar and clock, with full keyboard support. See [Date pickers](nse/values-and-progress.md#date-pickers). |
| `NSEColourWell` | A colour selection control. |
| `NSEColourPanel` | The shared colour panel. Applications reach it through `useColourPanel`. |

## Containers and layout

| Component | Purpose |
| --- | --- |
| `NSEStackView`, `NSEStackItem` | Views in a row or a column, with distribution, alignment, spacing and visibility priorities. Views below `mustHold` that no longer fit detach into an overflow menu, in priority order, and stay reachable from the keyboard. See [Stacks and grids](nse/stacks-and-grids.md). |
| `NSEGridView`, `NSEGridRow` | Views in rows and columns. A trailing label column and a fill column make a form. |
| `NSEBox` | Titled boxes, separators, and custom boxes with `fillColour`, `borderColour`, `borderWidth`, `cornerRadius`, `contentViewMargins`, `isTransparent` and `shadow`. See [Boxes and shadows](nse/boxes-and-shadows.md). |
| `NSESplitView` | Two resizable panes, a sidebar beside the main view. |
| `NSEScrollView`, `NSEClipView` | Scrolling with momentum and rubber banding. |
| `NSETabView`, `NSETabViewController` | Tabbed content and owned child view controllers; fixed or `sidebarAdaptable` placement. |
| `NSEButton` (`bezelStyle="disclosure"`) in an `NSEStackView` | Collapsible sections: the disclosure button shows and hides the stack item below it. |
| `NSESplitViewController` | Source-list outline/sidebar and detail items, with compact collapse and `showDetail`. |
| `NSEDrawer` | A drawer that slides from a window edge. |
| `NSEPageController` | Child view controllers display `arrangedObjects`. `transitionStyle` is `"stackHistory"` (the default, with drill-in history), `"horizontalStrip"` (sliding pages) or `"pageCurl"` (a physical paper curl). `navigateForwardToObject`, `navigateBack`, `navigateForward` and horizontal gestures navigate. In `pageCurl`, `spineLocation: "min"` (the default) shows a single page; `"mid"` shows two-page spreads. See the [controller contract](controllers.md#page-controller). |

## Data views

Data views render collections owned by a controller. They are virtualised, so a list of ten thousand rows costs no more to draw than a list of ten. See [Structured data views](data-views.md).

| Component | Purpose |
| --- | --- |
| `NSETableView` | Sortable, resizable, editable columns, and lists (one column, `headerHidden`). |
| `NSEOutlineView` | Expandable hierarchies, and sidebar source lists (`selectionHighlightStyle="sourceList"`, group items). |
| `NSECollectionView` | Grids and adaptive layouts of items. |
| `NSEBrowser` | Multi-column hierarchical browsing. |
| `NSERuleEditor`, `NSEPredicateEditor` | Editors for rules and predicates. |

## Menus and toolbars

| Component | Purpose |
| --- | --- |
| `NSEMenu` | A menu object of command, submenu, separator and view items, validated along the responder chain when it opens. A pull-down `NSEPopUpButton` shows one, a view shows one as its `menu`, and the application's `mainMenu` is one. |
| `NSEMenuBar` | Draws the application's `mainMenu` across the window. |
| `NSEView` | A view with a contextual `menu` and a `toolTip`. |
| `NSEPopup` | An anchored or modal popup plate. |
| `NSEToolbar` | A window's toolbar (`window.toolbar`): validated items, overflow, display and size modes, the customisation palette and autosaved configuration. |

On a desktop (a fine pointer that can hover), choosing an item in any menu or pop-up list flashes it (highlighted, unhighlighted, highlighted again) before the command runs, and then the menu fades out. Dismissing a menu without choosing closes it at once, and touch presentations neither flash nor fade. A pop-up button's list is at least as wide as the button, and without a `width` the button sizes itself to its widest item. Pressing an open pop-up button closes its list.

## Panels and overlays

| Component | Purpose |
| --- | --- |
| `NSEAlert`, `presentAsSheet` | An alert is an `NSEAlert` object presented on a window; a custom dialog is a view controller presented as a sheet. See [Alerts and sheets](windows.md#alerts-and-sheets). Host system UI outside any window uses `NSEConfirmDialog` from `nse/system-ui`. |
| `presentAsModalWindow` | `NSEViewController.presentAsModalWindow(controller)` presents a view controller as a centred application-modal window. See [Modal windows](windows.md#modal-windows). |
| `presentAsPopover` | `NSEViewController.presentAsPopover(controller, { of, preferredEdge, behavior })` presents a view controller in a popover. See [Popovers](windows.md#popovers). |
| `NSEOpenPanel`, `NSESavePanel` | [File panels](nse/open-panel.md): granted folders, media sources and application storage. |
| `NSEFontPanel` | The font panel. |
| `toolTip` | Every NSE view and control takes a `toolTip`, which the host shows. Transient notices go through the notification service (`useNotifications`). |
| `NSEHapticFeedbackManager` | `NSEHapticFeedbackManager.defaultPerformer.perform("alignment")` (`generic`, `alignment`, `levelChange`; `performanceTime` `default`, `now` or `drawCompleted`) for feedback from your own views. Controls perform their own. |

## Images and graphics

| Component | Purpose |
| --- | --- |
| `NSEImageView` | Displays an image fitted to the view or at natural size (`imageScaling`). A carousel is an `NSEPageController` of image views; to crop, use ImageFX's `IFXImageView`. |
| `NSEView` | `draw(dirtyRect, context)` records GraphicsFX content at the view’s measured bounds; `layerContentsPlacement` places its layer contents. Also carries `menu`, `toolTip` and `appearance`. |
| `snapshotNSEView` | Draws a view your app owns into a PNG data URL, for a version card, a drag image or a thumbnail. Canvas content is left out. |
| `NSEShadow` | `shadowColour`, `shadowOffset` and `shadowBlurRadius`, set as `shadow` on a view or box. Smooth corners are `cornerRadius` and `cornerCurve: "continuous"` on views and AnimationFX layers; material renderers are internal to the theme. |

## Navigation controllers

Some controls come with a controller that holds their state and restoration data.

| Controller | Drives |
| --- | --- |
| `NSEPageController` | Drill-in history, horizontal strips or page curls, with child controllers for arranged objects and single-page or two-page curl layouts. See [Page controller](controllers.md#page-controller). |
| `NSESplitViewController`, `NSESplitViewItem` | A split view of child view controllers: thicknesses, holding priorities and collapse. `NSESplitViewController.compactItem` selects the item shown in a compact layout. |
| `NSETabViewController`, `NSETabViewItem` | A container showing one child at a time behind a tab control: `tabViewItems` (each an `NSETabViewItem` with the child `viewController`, `label`, `image` and `toolTip`), `selectedTabViewItemIndex`, restoration, and `tabStyle` (`segmentedControlOnTop`, `segmentedControlOnBottom`, `toolbar`, `unspecified`, or `sidebarAdaptable`). Override `shouldSelect`, `willSelect` and `didSelect`. Place it with `<tabs.view />`. |
| `NSETitlebarAccessoryViewController` | A view controller drawn in the window's title bar (`window.addTitlebarAccessoryViewController`). |

The [controllers guide](controllers.md) covers the array, tree and user defaults controllers.

## Text and web content

| Component | Purpose |
| --- | --- |
| `NSETextView` | A text view over a shared text owner, with its own editing session. See [Text and editing](text-and-editing.md). |
| `NSEFontManager`, `NSELayoutManager`, `NSERulerView`, `drawNSEString` | Typography and text layout. |
| `NSEWebView` | Hosts external web content inside a sandbox. |

## Tracking and animation

`useNSETrackingRegion` reports pointer entry, exit and movement over a region. `NSECursor` sets the pointer cursor. `NSEAnimationContext` groups view animator and layer changes. Controllers read `traitCollection.reducedMotion`; function views read `useNSETraitCollection().reducedMotion`. See [animation objects](nse/animation.md) for custom presentations, child transitions and owned artwork.

## Accessibility

Every control exposes semantic roles, labels and states, and can be used from the keyboard and by touch. Disabled, invalid, read-only and loading states reach assistive technology through `aria-disabled`, `aria-invalid` and native attributes. When a control can't be placed or a policy refuses it, it reports the failure to its host instead of quietly falling back to something else.
