# Values, pickers and progress

This page covers the controls that show or choose a number, a level, an option from a list or a date: `NSESlider`, `NSEStepper`, `NSELevelIndicator`, `NSESegmentedControl`, the pop-up buttons, `NSEProgressIndicator` and `NSEDatePicker`.

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
| `NSEProgressIndicator` | Determinate and indeterminate progress, as a bar or a spinning indicator | No |
| `NSEDatePicker` | A date, a date range, a time, or a date and time, as a text field or a graphical calendar and clock | For the calendar and clock popover |

Components marked "Yes" open a floating list and need an overlay host. A mounted SynWare receives one from the runtime, so use them inside an application's views. See [Text fields and choice controls](text-and-choice.md#at-a-glance).

Everything on this page comes from `@syndromatic/syncloudos/nse`.

## NSESlider

A native `<input type="range">` with the NSE track and thumb. It reports a value while the user drags and a final value when the drag ends.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value`, `defaultValue` | `number` | `minimum` for the default | The controlled or initial value. |
| `minimum`, `maximum` | `number` | 0 and 100 | `minValue` and `maxValue`. |
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
| `isEnabled`, `readOnly`, `name`, `dir` | | | `isEnabled` is `NSControl.isEnabled` (default `true`). `name` adds a hidden input for form submission. `dir="rtl"` flips the horizontal arrow keys. |
| `undoManager` | `NSEUndoManagerPort` | none | Registers each committed change as an undo step named "Change Slider". |
| `onValueChange` | `(value, phase) => void` | none | `"preview"` while dragging and `"commit"` at the end of a drag or any other change: NSSlider's continuous and final actions. |

Arrow keys move by one step, Home and End jump to the ends, and every key press commits, as does a change made by assistive technology.

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
| `name`, `isEnabled`, `readOnly`, `undoManager` | | | |
| `onValueChange` | `(value: T, phase) => void` | required | |

A click commits one step. Arrow Up and Arrow Right increase, Arrow Down and Arrow Left decrease, Page Up and Page Down move by `pageStep`, and Home and End go to the limits. Holding a button repeats after 400 ms, then every 120 ms and speeding up to every 40 ms, sending previews and one commit when released. Hold to repeat needs the host's scheduler, so it works in a mounted SynWare and not in a bare render.

## NSELevelIndicator

| Prop | Type | Description |
| --- | --- | --- |
| `aria-label` | `string` | Required. |
| `value`, `minimum`, `maximum` | `number` | Required. |
| `mode` | `"continuous" \| "discrete" \| "capacity" \| "rating"` | `"rating"` draws stars that the user can choose. Other modes render a native `<meter>`. |
| `warningValue`, `criticalValue` | `number` | The value at or above which the state becomes `warning` or `critical`, for the theme's colouring. |
| `isEnabled` | `boolean` | `NSControl.isEnabled`. Default `true`. |
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
| `isEnabled`, `readOnly`, `name`, `parentResponderId` | | `name` adds a hidden input with the selected ids joined by commas. |

A segment (`NSESegmentedItem`) is `{ id, label }` with these optional fields:

| Field | AppKit | Description |
| --- | --- | --- |
| `image` | `setImage(_:forSegment:)` | An image URL or a drawn element. The segment draws the image, and `accessibleLabel` (or a string label) names it. |
| `width` | `setWidth(_:forSegment:)` | A fixed width in CSS pixels. Otherwise the segment sizes to fit, or shares the width under `fill-equally`. |
| `accessibleLabel` | | The spoken name and tooltip of an image segment. |
| `action`, `actionPayload` | | The segment's own action. It sends the segment's `actionPayload`, or no payload when that is omitted, so it can name an action method that takes no parameter. The segment disables itself while the action is unavailable. |
| `isEnabled` | `setEnabled(_:forSegment:)` | Default `true`. |
| `menu` | `setMenu(_:forSegment:)` | `{ id, label, isEnabled? }[]`, shown in a disclosure menu on the segment. |

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

`NSEProgressIndicator` is AppKit's `NSProgressIndicator`: a bar, or a spinning indicator.

```tsx
<NSEProgressIndicator aria-label="Export" value={exported} maximum={total} />
<NSEProgressIndicator aria-label="Waiting for the server" />
<NSEProgressIndicator aria-label="Preparing image" style="spinning" controlSize="small" />
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `aria-label` | `string` | required | The accessible name. |
| `style` | `"bar" \| "spinning"` | `"bar"` | `NSProgressIndicator.Style`. |
| `value` | `number` | none | `doubleValue`. It is snapped to a whole number and held between `minimum` and `maximum`. |
| `minimum`, `maximum` | `number` | 0, 100 | `minValue` and `maxValue`. A `maximum` that is not above `minimum` is treated as `minimum + 100`. |
| `isIndeterminate` | `boolean` | `true` without a `value` | An indeterminate bar sweeps back and forth and an indeterminate spinning indicator turns. |
| `controlSize` | `"small" \| "regular" \| "large"` | `"regular"` | A spinning indicator is 16, 32 or 64 pixels across. |

A determinate bar is a `role="progressbar"` with `aria-valuemin`, `aria-valuemax` and `aria-valuenow`; an indeterminate one has no `aria-valuenow`. A spinning indicator with a `value` fills as a ring. Indeterminate motion stops under reduced motion (the nearest `NSEAnimationEnvironmentProvider`). To hide an indicator when no work is running, don't render it.

## Date pickers

`NSEDatePicker` is AppKit's `NSDatePicker`. One component edits every kind of civil date and time: `datePickerElements` chooses what it edits, `datePickerMode` chooses a single date or a range, and `datePickerStyle` chooses how it looks.

```tsx
<NSEDatePicker aria-label="Due" locale="en-GB" timeZone="Europe/London" value={due} onValueChange={setDue} />
<NSEDatePicker aria-label="Trip" datePickerMode="range" locale="en-GB" timeZone="Europe/London" value={trip} onValueChange={setTrip} />
<NSEDatePicker aria-label="Start" datePickerElements={["hourMinute"]} hourCycle="h24" locale="en-GB" timeZone="Europe/London" value={start} onValueChange={setStart} />
<NSEDatePicker aria-label="Appointment" datePickerElements={["yearMonthDay", "hourMinute"]} locale="en-GB" timeZone="Europe/London" value={appointment} onValueChange={setAppointment} />
<NSEDatePicker aria-label="Calendar" datePickerStyle="clockAndCalendar" locale="en-GB" timeZone="Europe/London" value={day} onValueChange={setDay} />
```

| `datePickerElements` | `datePickerMode` | Value type |
| --- | --- | --- |
| `["yearMonthDay"]` (the default) | `"single"` (the default) | `NSEPlainDate` |
| `["yearMonthDay"]` | `"range"` | `NSEDateRange` |
| `["hourMinute"]` | none | `NSEPlainTime` |
| `["yearMonthDay", "hourMinute"]` | none | `NSEDateTimeValue`: a date, a time, the time zone, and which of a repeated hour |

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `aria-label` | `string` | required | The accessible name. |
| `locale`, `timeZone` | `string` | required | How the value is formatted, and the zone that "today" and daylight-saving transitions are read in. |
| `datePickerStyle` | `"textFieldAndStepper" \| "textField" \| "clockAndCalendar"` | `"textFieldAndStepper"` | `NSDatePicker.Style`. `textField` edits the date as separate day, month and year fields. `clockAndCalendar` shows the month calendar, or the clock for a time. |
| `presentsCalendarOverlay` | `boolean` | `true` | A text field opens the calendar, or the clock, in a popover. |
| `value`, `defaultValue` | see above, or `null` | none | Controlled or uncontrolled. |
| `minimum`, `maximum` | the value's date or time type | none | `minDate` and `maxDate`. Days outside them can't be chosen. For a date and time they are `NSEZonedDateTime`. |
| `isEnabled`, `isEditable` | `boolean` | `true` | A non-editable picker still shows and submits its value. |
| `name` | `string` | none | The form field name. The value is submitted as ISO 8601. |
| `onValueChange` | `(value, phase: "preview" \| "commit") => void` | none | A text field previews while it is edited and commits on Return or blur. The graphical calendar commits every change. |
| `today`, `eventIndicatorsForDate` | | | Graphical calendar only: the day marked as today, and marks under a day such as a calendar's events. NSE extensions. |
| `date`, `minuteStep`, `hourCycle` | | | Times only: the day the time falls on, the minute interval, and a 12 or 24-hour clock. `hourCycle` defaults to the locale's. |

As in AppKit, the graphical calendar edits its value live: clicking a day selects it, and the month arrows move the selected date by a month, keeping the day where the month has it. In range mode, a second click or Shift with an arrow key extends the range.

## Example

```tsx
import { useState } from "react";
import {
  NSELevelIndicator,
  NSEProgressIndicator,
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
      <NSEProgressIndicator aria-label="Played" value={position} maximum={duration} />
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
