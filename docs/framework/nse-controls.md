# NSE controls

NSE is the application kit of SynCloudOS, the counterpart of AppKit. It supplies the buttons, fields, containers, data views, menus, panels and text machinery an application is built from. The prefix follows the Apple convention: `NS` for NeXTSTEP, `NSE` for the Syndromatic edition. Where a Mac developer reaches for `NSButton` or `NSTableView`, you reach for `NSEPushButton` or `NSETable`.

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
  NSECheckbox,
  NSEGroupBox,
  NSEProgressBar,
  NSEPushButton,
  NSESegmentedControl,
  NSESlider,
  NSETextField,
  type NSESegmentedSelection,
} from "@syndromatic/syncloudos/nse";

export function ExportSettings() {
  const [name, setName] = useState("Report");
  const [compress, setCompress] = useState(true);
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState<NSESegmentedSelection>({
    mode: "select-one",
    selectedIds: new Set(["pdf"]),
    allowsEmpty: false,
  });

  return (
    <NSEGroupBox label="Export">
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
      <NSECheckbox label="Compress" checked={compress} onChange={(event) => setCompress(event.currentTarget.checked)} />
      <NSEProgressBar aria-label="Export progress" value={40} max={100} />
      <NSEPushButton tone="affirmative">Export</NSEPushButton>
    </NSEGroupBox>
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
| [Values, pickers and progress](nse/values-and-progress.md) | Sliders, steppers, level indicators, segmented controls, pickers, progress |

Focused entries include `NSEPicker`, `NSEDrawer`, `NSEToaster`, `NSEList`, `NSESlidingPanes` and `NSEStandaloneControlHost` in `nse/controls`, text machinery in `nse/text`, `NSEScrollView` in `nse/scroll`, `NSEPage` in `nse/page` and `NSECoverFlow` in `nse/cover-flow`. `NSETextView` is also available through the aggregate `nse` entry. Each page names the entry it needs.

## Buttons

| Component | Purpose |
| --- | --- |
| `NSEPushButton` | The standard button. Tones: `medium`, `light`, `dark`, `affirmative` and `negative`. It supports `loading`, an icon and a haptic request. |
| `NSEToggleButton` | A button that holds an on or off state. |
| `NSEIconButton` | A button that shows only an icon. |
| `NSEToolButton`, `NSEToolButtonGroup`, `NSERadioToolButtonGroup` | Toolbar style buttons, with grouped and radio behaviour. |
| `NSEPopupButton` | A button that opens a menu. |
| `NSEActivityButton`, `NSEProgressButton`, `NSENotificationButton` | Buttons that show activity, progress or a notification count. |
| `NSEFilePickerButton` | Opens the host's file panel. |
| `NSEButtonHeader` | A section header that acts as a button. |

## Fields

| Component | Purpose |
| --- | --- |
| `NSETextField` | Single line text input with prefix, suffix, validation and formatter support. |
| `NSESecureTextField`, `NSEPasswordField` | Concealed input for secrets. |
| `NSESearchField` | A search box with a clear control and recent search support, paired with `NSESearchFieldController`. |
| `NSEComboBox` | An editable field with a completion list. |
| `NSETokenField` | Tokenised entry such as tags or recipients. |
| `NSEInputBox`, `NSERoundedInput` | Bordered input containers. |
| `NSECheckbox` | A checkbox with a mixed state. |
| `NSERadioGroup` | A group of radio buttons with roving focus. |

## Values and progress

| Component | Purpose |
| --- | --- |
| `NSESlider` | Horizontal or vertical slider with ticks and detents. |
| `NSECircularSlider` | A dial. |
| `NSEStepper` | Increment and decrement, with hold to repeat, bounds and wrapping. |
| `NSELevelIndicator` | Continuous, discrete, capacity and rating indicators with warning and critical thresholds. |
| `NSESegmentedControl` | Momentary, select one and select many segments, with overflow handling. |
| `NSEIntegerPicker`, `NSEListSelector`, `NSEPickerGroup` | Pickers for numbers and lists. |
| `NSEProgressBar`, `NSEProgressSlider`, `NSEProgressItem` | Determinate progress, with an optional secondary fill. |
| `NSEProgressIndicator`, `NSESpinner` | Indeterminate activity. |

## Date, time and colour

| Component | Purpose |
| --- | --- |
| `NSEDatePicker`, `NSETimePicker`, `NSEDateTimePicker`, `NSEDateRangePicker` | Locale aware date and time entry with full keyboard support. |
| `NSECalendarView`, `NSEClockView` | Calendar and clock presentations. |
| `NSEColourWell`, `NSEColourSwatches`, `NSEColourSliderPicker`, `NSEColourWheelPicker` | Colour selection controls. |
| `NSEColourPanel` | The shared colour panel. Applications reach it through `useColourPanel`. |

## Containers and layout

| Component | Purpose |
| --- | --- |
| `NSEStackView`, `NSEStackItem` | One dimensional layout with distribution, alignment and visibility priorities. Items that no longer fit collapse in priority order, and stay reachable from the keyboard. |
| `NSEBox`, `NSEGroupBox`, `NSERoundedBox` | Bordered and titled grouping. |
| `NSEDivider` | A separator, optionally with a disclosure arrow. |
| `NSESplitView` | Resizable panes, driven by `NSESplitViewController`. |
| `NSEScrollView`, `NSEClipView` | Scrolling with momentum and rubber banding. |
| `NSETabView`, `NSETabGroup`, `NSETabBar` | Tabbed content, driven by `NSETabBarController`. |
| `NSEAccordionView` | Collapsible sections. |
| `NSESidebar`, `NSESourceListScene` | A source list sidebar and the scene that composes it with content. |
| `NSEHierarchyStack`, `NSESlidingPanes` | Drill in navigation across panes. |
| `NSEDrawer` | A drawer that slides from a window edge. |

## Data views

Data views render collections owned by a controller. They are virtualised, so a list of ten thousand rows costs no more to draw than a list of ten. See [Structured data views](data-views.md).

| Component | Purpose |
| --- | --- |
| `NSETable` | Sortable, resizable, editable columns. |
| `NSEOutline` | Expandable hierarchies. |
| `NSECollectionView` | Grids and adaptive layouts of items. |
| `NSEBrowser` | Multi column hierarchical browsing. |
| `NSEVirtualList`, `NSEList`, `NSEGroupedList` | Long and grouped lists. |
| `NSERuleEditor`, `NSEPredicateEditor` | Editors for rules and predicates. |

## Menus and toolbars

| Component | Purpose |
| --- | --- |
| `NSEMenu`, `NSEMenuBar`, `NSEContextMenu`, `NSEPopup`, `NSEPopupList` | Menus of every kind, driven by `NSEMenuController`. |
| `NSEApplicationMenu`, `NSEEditMenu`, `NSEHelpMenu` | Standard application menus. |
| `NSEToolbar`, `NSEToolbarConfigurationSheet` | Toolbars with customisation, driven by `NSEToolbarController`. |
| `NSEStatusBar`, `NSETopBar` | Status and title strips. The metal bar's `titlePlacement: "leading"` suits document windows: the app title (with its QuickSwitch action) beside the return control, the document in the middle. Items are `webspring`, `userInfo`, `settings` or `custom`. Every item glyph is a single-shape SVG drawn as a CSS mask over theme colours, so its normal, pressed and selected looks follow the theme for any icon: pass the SVG's URL as `icon` on any item, or omit it to get the built-in house (`webspring`), person (`userInfo`) or gear (`settings`). There is no separate selected icon. The metal bar's buttons are drawn in CSS (raised aluminium that presses in deeply, light and dark). |

## Panels and overlays

| Component | Purpose |
| --- | --- |
| `NSEAlert`, `NSEDialog`, `NSEModalDialog`, `NSEConfirmDialog` | Alerts and dialogs with focus trapping and inert backgrounds. |
| `NSEPopover` | An anchored transient surface. |
| `NSEOpenPanel`, `NSESavePanel` | File panels. |
| `NSEFontPanel`, `NSEMediaPanel` | The font panel and a media chooser. |
| `NSEToaster`, `NSETooltipProvider` | Transient notices and tooltips. |

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
| `NSESplitViewController` | Pane sizes and collapse state. |
| `NSEToolbarController` | Toolbar items and user customisation. |
| `NSEMenuController` | Menu models, open state and overlay provenance. |
| `NSESearchFieldController` | Search text and recent searches. |

The [controllers guide](controllers.md) covers the array, tree and preferences controllers.

## Text and web content

| Component | Purpose |
| --- | --- |
| `NSETextView` | A text view over a canonical owner and independent editing session. See [Text and editing](text-and-editing.md). |
| `NSEFontManager`, `NSELayoutManager`, `NSERuler`, `drawNSEString` | Typography and text layout. |
| `NSEWebContentView` | Hosts external web content inside a sandbox. |

## Tracking and animation

`useNSETrackingRegion` reports pointer entry, exit and movement over a region. `NSECursor` sets the pointer cursor. `NSEAnimationEnvironmentProvider` and `useNSEAnimationEnvironment` carry the reduced motion setting and the default easing and duration values that controls share.

## Accessibility

Every control exposes semantic roles, labels and states, a keyboard path and a touch path. Disabled, invalid, read-only and loading states reach assistive technology through `aria-disabled`, `aria-invalid` and native attributes. When a control reports a placement or policy failure, it does so through its host port and never substitutes a fallback of its own.
