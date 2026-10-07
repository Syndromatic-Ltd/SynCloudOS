# Values, pickers and progress

This page covers the controls that show or choose a number, a level or an option from a list: `NSESlider`, `NSECircularSlider`, `NSEStepper`, `NSELevelIndicator`, `NSESegmentedControl`, the pickers, and the progress family. Dates and colours are covered separately.

```tsx
import { NSESlider, NSEStepper } from "@syndromatic/syncloudos/nse";
```

## At a glance

| Component | Purpose | Overlay host |
| --- | --- | --- |
| `NSESlider` | A horizontal or vertical slider with ticks, detents, a tooltip and undo | No |
| `NSECircularSlider` | A dial, with a linear slider alongside for assistive technology | No |
| `NSEStepper` | Increment and decrement buttons with hold to repeat | No |
| `NSELevelIndicator` | A meter, or a star rating | No |
| `NSESegmentedControl` | Momentary, single and multiple selection segments, with menus and overflow | For menus and overflow |
| `NSEPicker`, `NSEListSelector`, `NSEIntegerPicker` | A button that opens a list of options | Yes |
| `NSEPopupList`, `NSEPickerGroup` | A menu button from a list of items, and a grouped strip for pickers | Popup list: yes |
| `NSEProgressBar`, `NSEProgressItem`, `NSEProgressSlider`, `NSEProgressIndicator`, `NSESpinner` | Determinate and indeterminate progress | No |

Components marked "Yes" open a floating list and need an overlay host. A mounted SynWare receives one from the runtime, and elsewhere you wrap the controls in `NSEStandaloneControlHost` from `nse/controls`. See [Text fields and choice controls](text-and-choice.md#at-a-glance).

Import `NSEPicker` from `@syndromatic/syncloudos/nse/controls`. Everything else on this page comes from `@syndromatic/syncloudos/nse`.

## NSESlider

A native `<input type="range">` with the NSE track and thumb. It reports a value while the user drags and a final value when the drag ends.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value`, `defaultValue` | `number` | `minimum` for the default | The controlled or initial value. |
| `minimum`, `maximum` | `number` | 0 and 100 | The range. `min` and `max` are aliases. |
| `step` | `number` | `1` | The increment. Values snap to it. |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | |
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

## NSECircularSlider

A dial. Dragging around the circle sets the value, and a linear slider with the same range sits alongside it for assistive technology, labelled "… linear alternative".

| Prop | Type | Description |
| --- | --- | --- |
| `aria-label` | `string` | Required. |
| `value` | `number` | The value. The control is always controlled. |
| `minimum`, `maximum`, `step` | `number` | All required. `wraps` is accepted but has no effect on the dial. |
| `onValueChange` | `(value, "preview" \| "commit") => void` | Previews during the drag, commit on release. A cancelled drag reports the starting value as a preview. |
| `disabled`, `readOnly` | `boolean` | |

The angle runs clockwise from twelve o'clock. Arrow keys change the value by one step and commit, and Home and End go to the ends.

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

A row of buttons that acts as a momentary control, a single choice or a multiple choice.

| Prop | Type | Description |
| --- | --- | --- |
| `aria-label` | `string` | Required. |
| `items` | `NSESegmentedItem[]` | `{ id, label, disabled?, commandId?, commandPayload?, menu? }`. `menu` is a list of `{ id, label, disabled? }` shown in a disclosure menu on the segment. |
| `selection` | `NSESegmentedSelection` | `{ mode: "momentary", selectedIds }`, `{ mode: "select-one", selectedIds, allowsEmpty }` or `{ mode: "select-many", selectedIds }`. |
| `onSelectionChange` | `(selection) => void` | The new selection, in the same shape. |
| `maximumVisibleSegments` | `number` | Segments beyond this fit into an overflow menu. The selected one always stays visible. |
| `onMenuAction` | `(segmentId, actionId) => void` | A segment's menu item was chosen. |
| `disabled`, `readOnly`, `name`, `parentResponderId` | | `name` adds a hidden input with the selected ids joined by commas. |

In a momentary control every click reports an empty selection. In select-one, clicking the selected segment clears it when `allowsEmpty` is true. Give a segment a `commandId` and it disables itself while the command is unavailable and selects only after the command executes. Arrow keys move focus among the enabled segments, wrapping around. Segment menus and overflow need an overlay host.

## Pickers

`NSEPicker` is a button that shows the current choice and opens a listbox. `NSEListSelector` and `NSEIntegerPicker` are built on it.

| Prop (`NSEPicker`) | Type | Default | Description |
| --- | --- | --- | --- |
| `options` | `readonly { value, label, disabled? }[]` | required | |
| `value`, `defaultValue` | `string` | first enabled option | |
| `onValueChange` | `(value: string) => void` | none | |
| `label`, `labelHidden`, `accessibleLabel` | | | A caption above or beside the button. `accessibleLabel` overrides what a screen reader says before the current choice. |
| `textAlign` | `"start" \| "center" \| "end"` | `"start"` | Alignment of the caption. |
| `popupAlign` | `"left" \| "right"` | `"right"` | Which edge the list aligns to. |
| `pressHaptic`, `snapHaptic` | `HFXFeedbackRequest` | `"soft"`, `"selection"` | The ticks for pressing the button and choosing an option. |
| `listboxOverlay`, `parentResponderId`, `presentation` | | | Where the list belongs in the overlay and responder hierarchy. With an overlay host these have working defaults. |
| `disabled`, `smoothSurface` | `boolean` | | |

Arrow Down and Arrow Up on the button open the list.

**`NSEListSelector`** takes `items` (or `options`) as strings or `{ value, label, caption?, icon?, src?, disabled? }`, and adds `onChange(value, oldValue)`, `onSelect(item, value)`, `hideItem`, `hideArrow` and `contentPack` (`"start"`, `"center"` or `"end"`). **`NSEIntegerPicker`** offers the whole numbers from `min` to `max` (defaults 0 and 9) in steps of `step` (default 1), takes `value`, `defaultValue`, `onValueChange(value: number)` and `formatValue`, and clamps the value to the range. **`NSEPopupList`** is a menu button with the same item shapes, taking `label` and `onSelect(value, item)`. **`NSEPickerGroup`** groups pickers in a strip, taking `label`, `position` and `grouped` like `NSEToolButtonGroup`.

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

### NSEProgressSlider

A slider with a progress bar behind it, for media scrubbers. It takes the props of `NSESlider` and adds:

| Prop | Description |
| --- | --- |
| `value`, `position`, `defaultValue`, `defaultPosition` | The slider position. `position` is an alias. |
| `onValueChange`, `onPositionChange` | `(value: number) => void`. Both fire on each change. |
| `min`, `max`, `minimum`, `maximum`, `step`, `snap` | The range and step. |
| `lockBar` | Make the bar follow the slider. |
| `barPosition`, `barMinimum`, `barMaximum` | The bar's value and range when it does not follow. |
| `altBarPosition` | The secondary fill. |
| `progressLabel` | The bar's accessible name. |

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

The spinner stops animating while it is scrolled out of view. `NSEProgressButton` is on the [Buttons](buttons.md#nseprogressbutton) page.

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
