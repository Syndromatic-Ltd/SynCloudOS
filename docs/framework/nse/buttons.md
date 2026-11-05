# Buttons

NSE has one button, `NSEButton`, shaped like AppKit's `NSButton`: its `buttonType` says how it behaves when clicked, and its `bezelStyle` says how the theme draws it. A push button, a toggle, a checkbox, a toolbar button and a disclosure triangle are all `NSEButton`s. `NSESwitch` is the on/off switch (`NSSwitch`).

Every `NSEButton` is a native `<button>`. It accepts the attributes of a `<button>` (except `title`, `disabled`, `value` and `children`, which have AppKit names here), and forwards its `ref` to the element.

```tsx
import { NSEButton, NSESwitch } from "@syndromatic/syncloudos/nse";
```

## At a glance

| Component | AppKit | Purpose | Entry |
| --- | --- | --- | --- |
| `NSEButton` | `NSButton` | Push, toggle, checkbox, toolbar and disclosure buttons | `nse`, `nse/controls` |
| `NSESwitch` | `NSSwitch` | An on/off switch that drags like a physical toggle | `nse`, `nse/controls` |
| `NSESegmentedControl` | `NSSegmentedControl` | Joined segments, including the capsule and textured toolbar strips | [Values and progress](values-and-progress.md#nsesegmentedcontrol) |
| `NSEPopupButton` | `NSPopUpButton` | A button that opens a menu | [Menus, toolbars and inspectors](menus-toolbars-and-inspectors.md) |

## NSEButton

```text
<NSEButton title buttonType? bezelStyle? image? imagePosition? state? defaultState? onStateChange?
           action? actionPayload? isEnabled? isHighlighted? keyEquivalent? hasDestructiveAction?
           appearance? controlSize? toolTip? haptic? {...button attributes} />
```

| Prop | Type | Default | AppKit | Description |
| --- | --- | --- | --- | --- |
| `title` | `ReactNode` | none | `title` | The button's text. For an `imageOnly` button it is the name read to assistive technology. |
| `buttonType` | `"momentaryPushIn" \| "pushOnPushOff" \| "toggle" \| "switch"` | `"momentaryPushIn"` | `setButtonType(_:)` | How the button behaves. A momentary button highlights while pressed and sends its action. `pushOnPushOff` and `toggle` show their `state` and alternate it on each click. `switch` is a checkbox. |
| `bezelStyle` | `"rounded" \| "texturedRounded" \| "disclosure"` | `"rounded"` | `bezelStyle` | The shape. `rounded` is the push button, `texturedRounded` the toolbar and inspector button, and `disclosure` the triangle that shows and hides a section (use it with `pushOnPushOff`). |
| `image` | `ReactNode` | none | `image` | An image URL, or a drawn element. |
| `imagePosition` | `"noImage" \| "imageOnly" \| "imageLeading" \| "imageTrailing"` | `imageLeading` with an image, otherwise `noImage` | `imagePosition` | Where the image sits against the title. |
| `state`, `defaultState` | `"on" \| "off" \| "mixed"` | `"off"` | `state` | The state a `pushOnPushOff`, `toggle` or `switch` button shows, controlled or initial. |
| `allowsMixedState` | `boolean` | `false` | `allowsMixedState` | Whether clicking a `switch` cycles through the mixed state. |
| `onStateChange` | `(state) => void` | none | | Called with the new state after a click changes it. |
| `action`, `actionPayload` | `string \| NSEActionReference`, payload | none | `action`, `target` | The action sent up the responder chain when the button is clicked. See [Commands, responders and undo](../commands-responders-undo.md). |
| `isEnabled` | `boolean` | `true` | `isEnabled` | A disabled button ignores clicks and draws dimmed. |
| `isHighlighted` | `boolean` | `false` | `isHighlighted` | Draws the button pressed, as a pop-up button does while its menu shows. |
| `keyEquivalent`, `keyEquivalentModifierMask` | `string`, modifiers | none | `keyEquivalent` | The key that clicks the button while its window has focus. `"\r"` (Return) makes it the window's default button, which the theme draws as such; `"\u{1b}"` (Escape) suits a Cancel button. |
| `hasDestructiveAction` | `boolean` | `false` | `hasDestructiveAction` | The button deletes or discards, and the theme draws it as such. |
| `appearance` | `"aqua" \| "darkAqua"` | the window's | `NSView.appearance` | Draws the button in the light or dark appearance, whatever its window's. |
| `controlSize` | `"small" \| "regular" \| "large"` | `"regular"` | `controlSize` | Capsule bezels draw from one band height: small is 24px and large 28px. |
| `toolTip` | `string` | none | `NSView.toolTip` | The tooltip. |
| `binding` | `NSEBinding<boolean \| "mixed">` | none | Cocoa Bindings `value` | Binds a `switch` button's state: on for true, off for false, mixed for a selection whose values differ. |
| `submissionValue` | `string` | `"on"` | | The form value a `switch` button submits when on. |
| `haptic` | `HFXFeedbackRequest` | by art | | The click feedback. Pass `false` for none. |
| `type` | `"button" \| "submit" \| "reset"` | `"button"` | | The native button type. An NSE button never submits a form unless you say `type="submit"`. |

**Press state.** A button is pressed while the primary pointer button is held inside it, or while Space or Enter is held. Moving the pointer out shows it released, moving back in shows it pressed again, and letting go outside cancels the click. The native click still fires once, so forms and `onClick` behave as usual.

**Haptics.** A click asks the session's haptic engine for a tick, named from HapticsFX: `"success"`, `"warning"`, `"error"`, `"light"`, `"medium"`, `"heavy"`, `"soft"`, `"rigid"`, `"selection"`, `"nudge"` or `"buzz"`. The default follows how the theme draws the button: `success` for the default button, `error` for a destructive one, `rigid` for the dark and textured art, `medium` otherwise. Without a haptic engine, or with haptics turned off, the request does nothing. See [HapticsFX](../fx/haptics.md).

### Disclosure sections

A disclosure button shows and hides a section beneath it. AppKit has no accordion; a disclosure button above a view in an `NSEStackView` is the pattern.

```tsx
<NSEButton bezelStyle="disclosure" buttonType="pushOnPushOff" title="Advanced"
           state={shown ? "on" : "off"} onStateChange={(state) => setShown(state === "on")} />
{shown ? <AdvancedOptions /> : null}
```

## NSESwitch

A switch with a track, a sliding thumb and On and Off words. The user can click it, press Space or Enter, or drag the thumb, and a drag past halfway commits to the side it ends on.

| Prop | Type | Default | AppKit | Description |
| --- | --- | --- | --- | --- |
| `state`, `defaultState` | `"on" \| "off"` | `"off"` | `state` | The controlled or initial state. |
| `onStateChange` | `(state) => void` | none | | Called with the new state after the user flips the switch. |
| `binding` | `NSEBinding<boolean>` | none | Cocoa Bindings `value` | Reads and writes a Boolean. |
| `isEnabled` | `boolean` | `true` | `isEnabled` | |
| `toolTip` | `string` | none | `NSView.toolTip` | |
| `onLabel`, `offLabel` | `string` | `"On"`, `"Off"` | | The words on the track, also the state's spoken text. |
| `thumbMaterial` | `"standard" \| "metal"` | `"standard"` | | `"metal"` gives the thumb a brushed metal surface that catches light from the device's tilt where MotionFX is available. |
| `selectionHaptic` | `HFXFeedbackRequest` | `"selection"` | | The tick when the state changes. |

The element has `role="switch"` and `aria-checked`. Arrow Right or End turns it on, Arrow Left or Home turns it off, and Space or Enter flips it. Give it a name with `aria-label` or `aria-labelledby`.

## Example

```tsx
import { useState } from "react";
import { NSEButton, NSESwitch } from "@syndromatic/syncloudos/nse";

export function ExportBar() {
  const [links, setLinks] = useState<"on" | "off">("on");
  const [shareable, setShareable] = useState<"on" | "off">("off");

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <NSEButton bezelStyle="texturedRounded" title="Bold" image="/icons/bold.png" imagePosition="imageOnly" action="toggleBoldface" />
      <NSEButton buttonType="switch" title="Include links" state={links} onStateChange={(state) => setLinks(state === "on" ? "on" : "off")} />
      <NSESwitch aria-label="Shareable link" state={shareable} onStateChange={setShareable} thumbMaterial="metal" />
      <NSEButton title="Cancel" keyEquivalent={"\u{1b}"} action="cancelOperation" />
      <NSEButton type="submit" title="Export" keyEquivalent={"\r"} />
    </form>
  );
}
```

## Related

- [NSE controls](../nse-controls.md)
- [Text fields and choice controls](text-and-choice.md)
- [HapticsFX](../fx/haptics.md)
