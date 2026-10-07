# Buttons

Every NSE button is a native `<button>` with NSE behaviour on top: a press state that follows the pointer, keyboard activation, an optional haptic tick and a loading state. Each accepts the attributes of a `<button>`, so `type`, `form`, `name`, `value`, `aria-*` and event handlers work as on any page, and each forwards its `ref` to the element.

```tsx
import { NSEPushButton } from "@syndromatic/syncloudos/nse";
```

## At a glance

| Component | Purpose | Entry |
| --- | --- | --- |
| `NSEPushButton` | The standard button | `nse`, `nse/controls` |
| `NSEIconButton` | A button that shows an icon and keeps a text label for assistive technology | `nse`, `nse/controls` |
| `NSEToggleButton` | An on and off switch that drags like a physical toggle | `nse`, `nse/controls` |
| `NSEToolButton`, `NSEToolButtonGroup`, `NSERadioToolButtonGroup` | Toolbar style buttons, single, grouped and as a radio set | `nse`, `nse/controls` |
| `NSEActivityButton` | A button that swaps its icon for a spinner while work runs | `nse`, `nse/controls` |
| `NSENotificationButton` | A button with named variants for confirming or dismissing a notice | `nse`, `nse/controls` |
| `NSEButtonHeader` | A dark header bar that acts as a button | `nse`, `nse/controls` |
| `NSEProgressButton` | A button whose face fills as work progresses, with an optional cancel affordance | `nse`, `nse/controls` |
| `NSEFilePickerButton` | A button that opens the host's file panel | `nse`, `nse/controls` |
| `NSEGrabHandle` | A grip that reports drag distances | `nse`, `nse/controls` |
| `NSEPopupButton` | A button that opens a menu | `nse` (a menu button, documented with the menu controls) |

## Shared behaviour

**Press state.** A button is *pressed* while the primary pointer button is held inside it, or while Space or Enter is held. Moving the pointer out of the button shows it released, moving back in shows it pressed again, and letting go outside cancels the click. The native click still fires exactly once, from the browser, so form submission and `onClick` behave as usual.

**Disabled and loading.** `disabled` and `loading` both set the native `disabled` attribute. A loading button also sets `aria-busy` and shows a spinner.

**Haptics.** A button asks the session's haptic engine for a tick when it is clicked. The request is a preset name from HapticsFX: `"success"`, `"warning"`, `"error"`, `"light"`, `"medium"`, `"heavy"`, `"soft"`, `"rigid"`, `"selection"`, `"nudge"` or `"buzz"`. Pass `false` or `null` to turn the tick off, and leave `haptic` undefined for the button's default. Without a haptic engine in the host, or when the user has turned haptics off, the request does nothing. A click that calls `event.preventDefault()` in its handler produces no tick. See [HapticsFX](../fx/haptics.md).

## NSEPushButton

```text
<NSEPushButton tone? selected? active? pressed? loading? loadingLabel? icon? iconPosition? haptic? {...button attributes}>label</NSEPushButton>
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `tone` | `"medium" \| "light" \| "dark" \| "affirmative" \| "negative"` | `"medium"` | The button's colour treatment. Affirmative is green and negative is red. |
| `selected`, `active` | `boolean` | `false` | Draw the button in its selected state, for buttons that mark a current choice. The two are equivalent. |
| `pressed` | `boolean` | `false` | Force the pressed appearance, for example while a menu the button opened is visible. |
| `loading` | `boolean` | `false` | Disable the button, show a spinner and set `aria-busy`. |
| `loadingLabel` | `string` | `"Loading"` | The spinner's accessible label. |
| `icon` | `ReactNode` | none | Content drawn beside the label. |
| `iconPosition` | `"left" \| "right"` | `"left"` | Which side the icon sits on. |
| `haptic` | `HFXFeedbackRequest` | by tone | The click feedback. The defaults are `medium` for `"medium"`, `light` for `"light"`, `rigid` for `"dark"`, `success` for `"affirmative"` and `error` for `"negative"`. |
| `type` | `"button" \| "submit" \| "reset"` | `"button"` | The native button type. Unlike a plain `<button>`, an NSE button never submits a form unless you say `type="submit"`. |

The button's `data-tone`, `data-selected`, `data-pressed`, `data-loading` attributes carry its state for the theme, and you can use them in your own CSS selectors.

## NSEIconButton

A push button that shows an icon. The label is required, because an icon alone gives assistive technology nothing to say.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | required | The accessible name and the tooltip (`title`). |
| `icon` | `ReactNode` | none | The icon element. |
| `src` | `string` | none | An image URL to use as the icon when `icon` is not given. The image is decorative and not draggable. |
| `showLabel` | `boolean` | `false` | Show the label text beside the icon. |

All other `NSEPushButton` props apply, except `children` and the `icon` type.

## NSEToggleButton

A switch with a track, a sliding thumb and On and Off captions. The user can click it, press Space or Enter, or drag the thumb, and a drag past halfway commits to the side it ends on.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `checked` | `boolean` | none | The controlled state. |
| `defaultChecked` | `boolean` | `false` | The initial state when uncontrolled. |
| `onCheckedChange` | `(checked: boolean) => void` | none | Called when the state changes. |
| `onLabel`, `offLabel` | `string` | `"On"`, `"Off"` | The captions on the track. They also serve as the state's spoken text, so set them when the toggle needs a more specific word, such as "Enabled". |
| `thumbMaterial` | `"standard" \| "metal"` | `"standard"` | `"metal"` gives the thumb a brushed metal surface that catches light from the device's tilt where MotionFX is available. |
| `selectionHaptic` | `HFXFeedbackRequest` | `"selection"` | The tick when the state changes. |

The element has `role="switch"` and `aria-checked`. Arrow Right or End turns it on, Arrow Left or Home turns it off, and Space or Enter flips it. An accessible name comes from `aria-label` or `aria-labelledby`, so supply one.

## NSEToolButton

A compact button for toolbars and other strips of tools. It defaults to the dark tone and shows only its icon, keeping the text for assistive technology.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `icon` | `ReactNode` | none | The icon. A string is treated as an image URL. |
| `src` | `string` | none | An image URL for the icon. |
| `label` | `string` | none | The accessible name and tooltip. When absent, the visible caption is used, and finally `"Tool button"`. Always set one for icon-only tools. |
| `caption` | `ReactNode` | none | A visible caption. `children` takes precedence. |
| `showLabel` | `boolean` | `false` | Show the caption beside the icon. |
| `tone` | `NSEButtonTone` | `"dark"` | The colour treatment. |

`NSEToolButtonGroup` joins several tool buttons into one grouped strip. It takes `label` (the group's accessible name), `position` (`"top"`, `"bottom"` or `"inline"`, default `"inline"`), `grouped` (default `true`), `fadeOnKeyboard` (fade the strip in while a text field has focus, as when an on-screen keyboard is showing), `smoothSurface` and any `<div>` attributes. The strip has `role="toolbar"`, and its buttons are reached with Tab in order.

`NSERadioToolButtonGroup` makes the buttons of a strip a single choice. It takes the props of [`NSERadioGroup`](text-and-choice.md#nseradiogroup) with `options: NSESelectableOption[]`, where an option has `value`, `label`, `caption`, `icon`, `src` and `disabled`. An option that has an icon shows the icon before its label.

## NSEActivityButton

A push button for actions that take a moment. While `active` is true the icon becomes a small spinner on the right and the button sets `aria-busy`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `active` | `boolean` | `false` | Show the spinner. The button stays enabled, so use `disabled` when clicks should be ignored during the work. |
| `caption` | `ReactNode` | none | The label. `children` takes precedence. |
| `spinnerLabel` | `string` | `"Working"` | The spinner's accessible label. |
| `icon`, `iconPosition` | | `iconPosition` is `"right"` | The idle icon. |

Unlike `NSEPushButton`'s `loading`, `active` does not disable the button.

## NSENotificationButton

A push button for the buttons of a notice or alert. Its `variant` picks a tone by name.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `"default" \| "affirmative" \| "negative" \| "alternate"` | `"default"` | Maps to the tones `medium`, `affirmative`, `negative` and `dark`. |
| `tone` | `NSEButtonTone` | from `variant` | Overrides the variant's tone. |
| `caption`, `label` | `ReactNode` | none | The text. `children` wins over `caption`, and `caption` over `label`. |

## NSEButtonHeader

A dark push button styled as a section header, for headers that expand or collapse content. It takes `caption`, `content` and `children` for its text (in that order of increasing precedence), defaults `tone` to `"dark"`, and accepts every `NSEPushButton` prop.

## NSEProgressButton

A button that doubles as a progress readout. Its face fills from the left as `value` approaches `max`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `number` | required | The progress. |
| `max` | `number` | `100` | The value at which the fill is complete. The range starts at 0. |
| `label` | `ReactNode` | none | The text on the button and, for a string, its accessible name. |
| `onCancel` | `() => void` | none | When present, a cancel affordance appears on the button. Clicking it, or pressing Enter or Space while it has focus, calls `onCancel` without also triggering the button. |
| `cancelLabel` | `string` | `"Cancel"` | The cancel affordance's accessible name. |
| `haptic` | `HFXFeedbackRequest` | `"medium"` | The click tick. |

The button exposes `aria-valuemin`, `aria-valuemax` and `aria-valuenow`, with the value snapped to a whole number and held between 0 and `max`.

## NSEFilePickerButton

A button that opens the host's file panel.

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `ReactNode` | The button's text. |
| `meta` | `ReactNode` | Secondary text, such as the name of the chosen file. |
| `openPanel` | `NSEFilePickerPanelBinding` | Connects the button to a file panel. Without it the button is a plain button and does nothing on its own. |

`NSEFilePickerPanelBinding` fields: `id`, `parentResponderId`, `parentWindowControllerId`, `service` (the file panel service), `windowBridge`, `request` (the open request), and the optional `parentScopeId`, `compact` and `onResult(result)`. In a SynWare you rarely build one by hand. The file panels are described with the other panels.

## NSEGrabHandle

A grip for dragging a pane. With no drag handlers it draws a decorative handle (`role="img"`). With any of `onDragStart`, `onDragMove` or `onDragEnd` it becomes a real button that captures the pointer.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | `"Grab handle"` | The accessible name. |
| `onDragStart` | `(event) => void` | none | The drag began. |
| `onDragMove` | `(delta: { dx, dy }, event) => void` | none | The pointer moved. The delta is measured from where the drag began. |
| `onDragEnd` | `(event) => void` | none | The pointer was released or cancelled. |

## Example

```tsx
import { useState } from "react";
import {
  NSEActivityButton,
  NSEProgressButton,
  NSEPushButton,
  NSEToggleButton,
  NSEToolButton,
  NSEToolButtonGroup,
} from "@syndromatic/syncloudos/nse";

export function ExportBar({ onExport }: { onExport: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState(35);
  const [shareable, setShareable] = useState(false);

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <NSEToolButtonGroup label="Formatting">
        <NSEToolButton label="Bold" caption="B" showLabel />
        <NSEToolButton label="Italic" caption="I" showLabel />
      </NSEToolButtonGroup>

      <NSEActivityButton
        active={busy}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onExport();
          } finally {
            setBusy(false);
          }
        }}
      >
        Export
      </NSEActivityButton>

      <NSEProgressButton value={uploaded} label="Uploading" onCancel={() => setUploaded(0)} />

      <NSEToggleButton
        aria-label="Shareable link"
        checked={shareable}
        onCheckedChange={setShareable}
        onLabel="Enabled"
        offLabel="Disabled"
        thumbMaterial="metal"
      />

      <NSEPushButton type="submit" tone="affirmative" haptic="success">
        Save
      </NSEPushButton>
      <NSEPushButton type="reset" tone="light" haptic={false}>
        Reset
      </NSEPushButton>
    </form>
  );
}
```

## Related

- [NSE controls](../nse-controls.md)
- [Text fields and choice controls](text-and-choice.md)
- [HapticsFX](../fx/haptics.md)
