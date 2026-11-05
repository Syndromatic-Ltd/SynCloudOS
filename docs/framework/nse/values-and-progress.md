# Values, pickers and progress

This page covers the controls that show or choose a number, a level or an option from a list: `NSESlider`, `NSEStepper`, `NSELevelIndicator`, `NSESegmentedControl`, the pickers, and the progress family. Dates and colours are covered separately.

```tsx
import { NSESlider, NSEStepper } from "@syndromatic/syncloudos/nse";
```

## At a glance

| Component | Purpose | Overlay host |
| --- | --- | --- |
| `NSESlider` | A horizontal or vertical slider with ticks, detents, a tooltip and undo | No |
| `NSEStepper` | Increment and decrement buttons with hold to repeat | No |
| `NSELevelIndicator` | A meter, or a star rating | No |
| `NSESegmentedControl` | Momentary, single and multiple selection segments in the rounded, capsule and textured toolbar styles, with menus and overflow | For menus and overflow |
| `NSEPopUpButton` | A button that shows the selected choice and opens the list, or (`pullsDown`) a button that opens a menu of commands | A pull-down button does; a pop-up button falls back to the native list without one |
| `NSEProgressBar`, `NSEProgressItem`, `NSEProgressIndicator`, `NSESpinner` | Determinate and indeterminate progress | No |

Components marked "Yes" open a floating list and need an overlay host. A mounted SynWare receives one from the runtime, and elsewhere you wrap the controls in `NSEStandaloneControlHost` from `nse/controls`. See [Text fields and choice controls](text-and-choice.md#at-a-glance).

Everything on this page comes from `@syndromatic/syncloudos/nse`.

## NSESlider

A native `<input type="range">` with the NSE track and thumb. It reports a value while the user drags and a final value when the drag ends.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value`, `defaultValue` | `number` | `minimum` for the default | The controlled or initial value. |
| `minimum`, `maximum` | `number` | 0 and 100 | The range. `min` and `max` are aliases. |
| `step` | `number` | `1` | The increment. Values snap to it. |
| `sliderType` | `"linear" \| "circular"` | `"linear"` | `NSSlider.sliderType`: a track and thumb, or a dial (below). |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | A linear slider's direction. |
| `label` | `ReactNode` | none | A visible label. The accessible name comes from `aria-label`, then a string `label`, then `"Slider"`. |
| `ticks` | `readonly number[]` | none | Tick positions. When present the slider snaps to the nearest tick rather than to the step. |
| `detents` | `readonly number[]` | none | Soft checkpoints for pointer drags. The value is drawn to a detent when within `detentThreshold`, and a haptic tick marks the moment it enters one. Keyboard values are unaffected. |
| `detentThreshold` | `number` | two steps | The attraction distance, in value units. |
| `tooltip` | `ReactNode \| (value: number) => ReactNode` | none | Shown at the thumb while it is focused or dragged. A function receives the current value. |
| `thumbMaterial` | `"standard" \| "metal"` | `"standard"` | `"metal"` gives the thumb a brushed metal surface. |
| `controlSize` | `"regular" \| "small" \| "mini"` | `"regular"` | |
| `readOnly`, `disabled`, `name`, `dir` | | | `name` adds a hidden input for form submission. `dir="rtl"` flips the horizontal arrow keys. |
| `undoManager` | `NSEUndoManagerPort` | none | Registers each committed change as an undo step named "Change Slider". |
| `onValueChange` | `(value, phase) => void` | none | `"preview"` while dragging and `"commit"` at the end of a drag or a key press. |
| `onChanging`, `onChange` | `(value) => void` | none | The same events without a phase: `onChanging` for previews, `onChange` for commits. |

Arrow keys move by one step, Home and End jump to the ends, and every key press commits. When you give the slider `minimum`, `maximum`, `orientation`, `readOnly`, `ticks`, `tooltip` or `undoManager`, `onValueChange` receives the phase. Without any of these the callback receives only the value and is called for previews and commits alike. Use `onChanging` and `onChange` to tell them apart in either case.

`NSEUndoManagerPort` is the part of the runtime's undo manager that the control needs (`isExecuting`, `register`, `reserve`). The undo client of the SDK provides one. A change that the value setter rejects rolls back. When the rollback also fails, the error is an `AggregateError` named `NSEValueControlCompensationError` that carries both failures.

### A circular slider

`sliderType="circular"` is `NSSlider`'s circular style: a dial. Dragging around it, or clicking anywhere on it, sets the value, and a linear slider with the same range sits alongside it for assistive technology, labelled "… linear alternative". The circular style takes `aria-label`, `value` or `defaultValue`, `minimum`, `maximum`, `step`, `wraps`, `valueText`, `controlSize` (`"small"` is the 22 px inspector dial), `disabled`, `readOnly` and `onValueChange(value, phase)`.

```tsx
<NSESlider sliderType="circular" aria-label="Angle" value={angle} minimum={0} maximum={359} step={1} wraps valueText={(value) => `${value} degrees`} onValueChange={setAngle} />
```

The angle runs clockwise from twelve o'clock. Arrow keys change the value by one step and commit, wrapping round through the start when `wraps` is set, and Home and End go to the ends. A cancelled drag reports the starting value as a preview.

## NSEStepper

Two buttons, an increment and a decrement, in a single control with `role="spinbutton"`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `aria-label` | `string` | required | |
| `value` | `T` | required | The value, controlled. |
| `minimum`, `maximum`, `step`, `wraps` | `number`, `boolean` | | The numeric contract, when `T` is `number`. `wraps` makes the value continue from the other end. |
| `contract` | `NSEStepperValueContract<T>` | none | For other value types, in place of the numeric props. It supplies `minimum`, `maximum`, `compare(a, b)`, `step(value, direction)` and optional `wraps`. |
| `pageStep` | `number` | ten steps | The Page Up and Page Down increment, for numeric steppers. |
| `formatValue` | `(value: T) => string` | none | The spoken text (`aria-valuetext`). |
| `size` | `"regular" \| "small" \| "mini"` | `"regular"` | |
| `name`, `disabled`, `readOnly`, `undoManager` | | | |
| `onValueChange` | `(value: T, phase) => void` | required | |

A click commits one step. Arrow Up and Arrow Right increase, Arrow Down and Arrow Left decrease, Page Up and Page Down move by `pageStep`, and Home and End go to the limits. Holding a button repeats after 400 ms, then every 120 ms and speeding up to every 40 ms, sending previews and one commit when released. Hold to repeat needs the host's scheduler, so it works in a mounted SynWare and not in a bare render.

## NSELevelIndicator

| Prop | Type | Description |
| --- | --- | --- |
| `aria-label` | `string` | Required. |
| `value`, `minimum`, `maximum` | `number` | Required. |
| `mode` | `"continuous" \| "discrete" \| "capacity" \| "rating"` | `"rating"` draws stars that the user can choose. Other modes render a native `<meter>`. |
| `warningValue`, `criticalValue` | `number` | The value at or above which the state becomes `warning` or `critical`, for the theme's colouring. |
| `disabled` | `boolean` | |
| `onValueChange` | `(value, "commit") => void` | Rating mode only. |

A rating shows `maximum - minimum` stars as a radio group, and clicking star *n* commits `minimum + n`.

## NSESegmentedControl

AppKit's `NSSegmentedControl`: a row of joined segments that acts as a momentary control, a single choice or a multiple choice. It also draws the theme's capsule strips (inspector tabs, view switchers) and its textured toolbar strips, so there is no separate radio group, tab group or tool-button group.

| Prop | Type | Description |
| --- | --- | --- |
| `aria-label` | `string` | Required. |
| `items` | `NSESegmentedItem[]` | The segments. See below. |
| `selection` | `NSESegmentedSelection` | `NSSegmentedControl.trackingMode`: `{ mode: "momentary", selectedIds }`, `{ mode: "select-one", selectedIds, allowsEmpty }` or `{ mode: "select-any", selectedIds }`. |
| `onSelectionChange` | `(selection) => void` | The new selection, in the same shape. |
| `segmentStyle` | `"rounded" \| "capsule" \| "texturedRounded"` | `NSSegmentedControl.segmentStyle` (default `rounded`). `capsule` is the theme's small uppercase capsule strip; `texturedRounded` is the toolbar strip, which draws segment images. |
| `action`, `actionPayload` | action, payload | The action sent for a segment that has no action of its own. It sends `actionPayload`, or the segment's id when that is omitted, so the receiver can tell which segment was pressed. |
| `controlSize` | `"regular" \| "small"` | `small` is the 24px inspector size. |
| `height` | `number` | An explicit band height in CSS pixels, overriding `controlSize`. |
| `distribution` | `"fit" \| "fill-equally"` | `NSSegmentedControl.segmentDistribution`. `fill-equally` stretches the control to its container and shares the width evenly. |
| `maximumVisibleSegments` | `number` | Segments beyond this fit into an overflow menu. The selected one always stays visible. |
| `onMenuAction` | `(segmentId, actionId) => void` | A segment's menu item was chosen. |
| `disabled`, `readOnly`, `name`, `parentResponderId` | | `name` adds a hidden input with the selected ids joined by commas. |

A segment (`NSESegmentedItem`) is `{ id, label }` with these optional fields:

| Field | AppKit | Description |
| --- | --- | --- |
| `image` | `setImage(_:forSegment:)` | An image URL or a drawn element. The segment draws the image, and `accessibleLabel` (or a string label) names it. |
| `width` | `setWidth(_:forSegment:)` | A fixed width in CSS pixels. Otherwise the segment sizes to fit, or shares the width under `fill-equally`. |
| `accessibleLabel` | | The spoken name and tooltip of an image segment. |
| `action`, `actionPayload` | | The segment's own action. It sends the segment's `actionPayload`, or no payload when that is omitted, so it can name an action method that takes no parameter. The segment disables itself while the action is unavailable. |
| `disabled` | `setEnabled(_:forSegment:)` | |
| `menu` | `setMenu(_:forSegment:)` | `{ id, label, disabled? }[]`, shown in a disclosure menu on the segment. |

In a momentary control every click reports an empty selection. In select-one, clicking the selected segment clears it when `allowsEmpty` is true. Arrow keys move focus among the enabled segments, wrapping around. Segment menus and overflow need an overlay host.

```tsx
<NSESegmentedControl
  aria-label="Calendar view"
  segmentStyle="capsule"
  selection={{ mode: "select-one", selectedIds: new Set([view]), allowsEmpty: false }}
  items={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]}
  onSelectionChange={(selection) => setView([...selection.selectedIds][0] ?? "day")}
/>
```

## Pop-up buttons

`NSEPopUpButton` is AppKit's `NSPopUpButton`. As a pop-up button it shows the selected item and opens a list of the other choices; with `pullsDown` it keeps its title and its items run commands (see [Menus, toolbars and inspectors](menus-toolbars-and-inspectors.md)).

```tsx
<NSEPopUpButton
  label="Resolution"
  value={resolution}
  items={[{ value: "low", title: "Low" }, { value: "high", title: "High" }, { isSeparatorItem: true }, { value: "custom", title: "Custom…", isEnabled: canCustomise }]}
  onValueChange={setResolution}
/>
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `readonly NSEPopUpButtonItem[]` | | Choice items `{ value, title, image?, isEnabled? }`, separators `{ isSeparatorItem: true }`, and command items with their own `action` and `actionPayload`, which run the action rather than change the value. |
| `value`, `defaultValue` | `string` | the first enabled item | The selected item's value. |
| `onValueChange` | `(value: string) => void` | none | Or send the button's `action`, with the chosen value as its payload. |
| `pullsDown` | `boolean` | `false` | `NSPopUpButton.pullsDown`. The button shows `title`; give it a command `menu` (an `NSEMenu`) or command `items`. |
| `title` | `ReactNode` | | A pull-down button's title. |
| `menu` | `NSEMenu` | | A pull-down button's command menu, validated along the responder chain when it opens. |
| `label`, `labelHidden`, `accessibleLabel` | | | A caption beside the button. `accessibleLabel` overrides what a screen reader says before the current choice. |
| `isEnabled` | `boolean` | `true` | |
| `controlSize` | `"regular" \| "small"` | `"regular"` | `"small"` is the 24 px size inspectors and panels use. |
| `bezelStyle`, `appearance`, `toolTip` | | | A pull-down button's `NSButton` bezel (`texturedRounded` is the toolbar capsule), its `NSView.appearance`, and its tooltip. |
| `width`, `height` | | | An explicit size; the bezel keeps its proportions. |
| `overlay`, `parentResponderId`, `presentation` | | | Where the list belongs in the overlay and responder hierarchy. With an overlay host these have working defaults. |

Arrow Down and Arrow Up on the button open the list. Without an overlay host, a pop-up button falls back to the platform's native `<select>`; a pull-down button needs one and throws an error that says so.

## Progress

### NSEProgressBar

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `number` | required | The progress. |
| `min`, `max` | `number` | 0, 100 | The range. A `max` that is not above `min` is treated as `min + 100`. |
| `snap` | `number` | `1` | Round the value to a multiple of this. Non-positive values use 1. |
| `altValue` | `number` | none | A secondary fill behind the main one, for buffering. |
| `content` | `ReactNode` | none | Text drawn over the bar. `children` does the same. |
| `label` | `string` | none | The accessible name. |
| `animatePosition` | `boolean` | `true` | Animate changes in width. |

A non-finite value counts as the minimum, and the value is held within the range. The element is a `role="progressbar"` with `aria-valuemin`, `aria-valuemax` and `aria-valuenow`.

### NSEProgressItem

A row-shaped progress element for lists: `value`, `max` (default 100), `variant` (`"item"` or `"pill"`), `label` and children for the text over the fill.

### NSEProgressIndicator

A state-driven indicator, for progress that can be indeterminate, paused or failed.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `aria-label` | `string` | required | |
| `state` | object | required | `{ kind: "determinate", value, minimum, maximum }`, `{ kind: "indeterminate" }`, `{ kind: "suspended", value? }`, `{ kind: "completed" }`, `{ kind: "error", message }` or `{ kind: "hidden" }`. |
| `variant` | `"bar" \| "circular" \| "spinner"` | `"bar"` | |
| `size` | `16 \| 32 \| 64` | `16` | |
| `reducedMotion` | `boolean` | | Draw without motion. |

A hidden state renders nothing. Completed, suspended and error states render a status message, and error shows its `message`.

### NSESpinner

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `"small" \| "large"` | `"small"` | |
| `tone` | `"light" \| "dark"` | `"light"` | Pick the tone that contrasts with the surface. |
| `label` | `string` | `"Loading"` | The accessible label, on a `role="status"` element. |

The spinner stops animating while it is scrolled out of view.

## Example

```tsx
import { useState } from "react";
import {
  NSELevelIndicator,
  NSEProgressBar,
  NSESegmentedControl,
  NSESlider,
  NSEStepper,
  type NSESegmentedSelection,
} from "@syndromatic/syncloudos/nse";

export function PlayerControls({ duration }: { duration: number }) {
  const [position, setPosition] = useState(0);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [rating, setRating] = useState(3);
  const [mode, setMode] = useState<NSESegmentedSelection>({
    mode: "select-one",
    selectedIds: new Set(["audio"]),
    allowsEmpty: false,
  });

  return (
    <div>
      <NSEProgressBar label="Buffered" value={position} altValue={Math.min(duration, position + 30)} max={duration} />
      <NSESlider
        aria-label="Position"
        minimum={0}
        maximum={duration}
        step={1}
        value={scrubbing ?? position}
        tooltip={(value) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`}
        onValueChange={(value, phase) => {
          if (phase === "preview") setScrubbing(value);
          else {
            setScrubbing(null);
            setPosition(value);
          }
        }}
      />
      <NSEStepper
        aria-label="Speed"
        value={speed}
        minimum={0.5}
        maximum={2}
        step={0.25}
        formatValue={(value) => `${value} times`}
        onValueChange={(value, phase) => {
          if (phase === "commit") setSpeed(value);
        }}
      />
      <NSELevelIndicator aria-label="Rating" mode="rating" value={rating} minimum={0} maximum={5} onValueChange={(value) => setRating(value)} />
      <NSESegmentedControl
        aria-label="Source"
        items={[
          { id: "audio", label: "Audio" },
          { id: "video", label: "Video" },
        ]}
        selection={mode}
        onSelectionChange={setMode}
      />
    </div>
  );
}
```

## Errors

| Situation | Result |
| --- | --- |
| A picker, segmented menu or popup list with no overlay host | `Error` from the render |
| A controlled value setter that throws inside an undoable change | The change rolls back and the error is rethrown. If the rollback also fails, an `AggregateError` named `NSEValueControlCompensationError`. If the setter threw before acknowledging the value, an error named `NSEValueControlUnknownStateError` with the original as its `cause` |

## Related

- [NSE controls](../nse-controls.md)
- [Text fields and choice controls](text-and-choice.md)
- [Commands, responders and undo](../commands-responders-undo.md), for the undo manager
