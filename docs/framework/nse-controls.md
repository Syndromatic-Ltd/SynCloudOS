# NSE controls

NSE is the application kit of SynCloudOS, the counterpart of AppKit. It supplies the buttons, fields, containers, data views, menus, panels and text machinery an application is built from. The prefix follows the Apple convention: `NS` for NeXTSTEP, `NSE` for the New Syndromatic Experience. Where a Mac developer reaches for `NSButton` or `NSTableView`, you reach for `NSEButton` or `NSETableView`.

Controls describe what they are and how they behave. The [Atmo theme](appearance.md) decides how they look, so the same component renders correctly in light and dark mode and in every presentation.

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/nse/themes/atmo/styles.css";
```

Import controls from `@syndromatic/syncloudos/nse`. Focused subpaths such as `nse/controls`, `nse/text`, `nse/layout`, `nse/scroll`, `nse/page`, `nse/cover-flow` and `nse/system-ui` expose subsets for code that wants narrower imports.

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

Focused entries include `NSEDrawer`, `NSESlidingPanes` and `NSEStandaloneControlHost` in `nse/controls`, text machinery in `nse/text`, `NSEScrollView` in `nse/scroll`, `NSEPage` and `NSEPageController` in `nse/page` and `NSECoverFlow` in `nse/cover-flow`. `NSETextView` is also available through the aggregate `nse` entry. Each page names the entry it needs.

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
| `NSESegmentedControl` | Momentary, select-one and select-any segments in the rounded, capsule and textured styles, with overflow handling. One-of-many choices and tab strips are segmented controls. |
| `NSEProgressIndicator` | `NSProgressIndicator`: a determinate or indeterminate bar, or a spinning indicator. |

## Date, time and colour

| Component | Purpose |
| --- | --- |
| `NSEDatePicker` | `NSDatePicker`: a date, a date range, a time, or a date and time, as a text field or a graphical calendar and clock, with full keyboard support. See [Date pickers](nse/values-and-progress.md#date-pickers). |
| `NSEColourWell`, `NSEColourSwatches`, `NSEColourSliderPicker`, `NSEColourWheelPicker` | Colour selection controls. |
| `NSEColourPanel` | The shared colour panel. Applications reach it through `useColourPanel`. |

## Containers and layout

| Component | Purpose |
| --- | --- |
| `NSEStackView`, `NSEStackItem` | `NSStackView`: views in a row or a column, with distribution, alignment, spacing and visibility priorities. Views below `mustHold` that no longer fit detach into an overflow menu, in priority order, and stay reachable from the keyboard. See [Stacks and grids](nse/stacks-and-grids.md). |
| `NSEGridView`, `NSEGridRow` | `NSGridView`: views in rows and columns. A trailing label column and a fill column make a Mac form. |
| `NSEBox` | `NSBox`: titled boxes (`title`, `titlePosition`, `borderType`, `contentViewMargins`) and separators (`boxType="separator"`). |
| `NSERoundedBox` | A rounded surface. |
| `NSESplitView` | Two resizable panes, a sidebar beside the main view. |
| `NSEScrollView`, `NSEClipView` | Scrolling with momentum and rubber banding. |
| `NSETabView`, `NSETabBar` | Tabbed content, driven by `NSETabBarController`. |
| `NSEButton` (`bezelStyle="disclosure"`) in an `NSEStackView` | Collapsible sections: the disclosure button shows and hides the stack item below it, as in AppKit. |
| `NSESourceListScene` | The scene that composes a source-list sidebar (an `NSEOutlineView` in source-list style) with content. |
| `NSEHierarchyStack`, `NSESlidingPanes` | Drill in navigation across panes. |
| `NSEDrawer` | A drawer that slides from a window edge. |
| `NSEPageController` | `NSPageController`: a page for each of its `arrangedObjects`, one shown at a time, with `selectedIndex` and a horizontal swipe between pages (`transitionStyle="horizontalStrip"`). It is in `nse/page`. |

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
| `NSEView` | A view with a contextual `menu` and a `toolTip` (`NSView.menu`, `NSView.toolTip`). |
| `NSEPopup` | An anchored or modal popup plate. |
| `NSEToolbar`, `NSEToolbarConfigurationSheet` | Toolbars with customisation, driven by `NSEToolbarController`. |
| `NSEStatusBar`, `NSETopBar` | Status and title strips. The metal bar's `titlePlacement: "leading"` suits document windows: the app title (with its QuickSwitch action) beside the return control, the document in the middle. Items are `webspring`, `userInfo`, `settings` or `custom`. Every item glyph is a single-shape SVG drawn as a CSS mask over theme colours, so its normal, pressed and selected looks follow the theme for any icon: pass the SVG's URL as `icon` on any item, or omit it to get the built-in house (`webspring`), person (`userInfo`) or gear (`settings`). There is no separate selected icon. The metal bar's buttons are drawn in CSS (raised aluminium that presses in deeply, light and dark). |

## Panels and overlays

| Component | Purpose |
| --- | --- |
| `NSEAlert`, `NSEDialog`, `NSEModalDialog`, `NSEConfirmDialog` | Alerts and dialogs with focus trapping and inert backgrounds. |
| `NSEPopover` | An anchored transient surface. |
| `NSEOpenPanel`, `NSESavePanel` | File panels. |
| `NSEFontPanel`, `NSEMediaPanel` | The font panel and a media chooser. |
| `NSETooltipProvider` | Tooltips. Transient notices go through the notification service (`useNotifications`). |

## Images and graphics

| Component | Purpose |
| --- | --- |
| `NSEImageView` | Displays an image with correct sizing and decoding. |
| `NSECroppableImage`, `NSESizeableImage`, `NSERotatingImage`, `NSEScrollingImage` | Interactive image presentations. |
| `NSEGraphicsView` | A drawing surface for GraphicsFX content. |
| `snapshotNSEView` | Draws a view your app owns into a PNG data URL, for a version card, a drag image or a thumbnail. Canvas content is left out. |
| `NSEShadowView`, `NSEMetalSurface`, `NSESmoothSurface` | Shadows, brushed metal and smooth cornered surfaces. |
| `NSEPage`, `NSECoverFlow` | A page with a curl transition, and the cover flow browser. |

## Navigation controllers

Some controls come with a controller that holds their state and restoration data.

| Controller | Drives |
| --- | --- |
| `NSENavigationStackController` | Push and pop navigation, with restoration snapshots. |
| `NSEAdaptiveNavigationController` | A sidebar layout on wide screens that collapses to a stack on compact ones. |
| `NSETabBarController` | Tabs, overflow and restoration. |
| `NSESplitViewController`, `NSESplitViewItem` | A split view of child view controllers: thicknesses, holding priorities and collapse. |
| `NSEToolbarController` | Toolbar items and user customisation. |

The [controllers guide](controllers.md) covers the array, tree and preferences controllers.

## Text and web content

| Component | Purpose |
| --- | --- |
| `NSETextView` | A text view over a canonical owner and independent editing session. See [Text and editing](text-and-editing.md). |
| `NSEFontManager`, `NSELayoutManager`, `NSERulerView`, `drawNSEString` | Typography and text layout. |
| `NSEWebView` | Hosts external web content inside a sandbox. |

## Tracking and animation

`useNSETrackingRegion` reports pointer entry, exit and movement over a region. `NSECursor` sets the pointer cursor. `NSEAnimationEnvironmentProvider` and `useNSEAnimationEnvironment` carry the reduced motion setting and the default easing and duration values that controls share.

## Accessibility

Every control exposes semantic roles, labels and states, a keyboard path and a touch path. Disabled, invalid, read-only and loading states reach assistive technology through `aria-disabled`, `aria-invalid` and native attributes. When a control reports a placement or policy failure, it does so through its host port and never substitutes a fallback of its own.
