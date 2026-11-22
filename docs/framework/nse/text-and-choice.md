# Text fields and choice controls

This page covers the controls people type into (text fields and labels, and secure, search, combo box and token fields) and the boxes that group a form. Underneath, they're native `<input>`, `<fieldset>` and `<label>` elements, so labels, autofill, validation and form submission work as they do on any page. Checkboxes are `NSEButton`s with `buttonType="switch"` (see [Buttons](buttons.md)), and a one-of-many choice is an `NSESegmentedControl` (see [Values and progress](values-and-progress.md#nsesegmentedcontrol)).

```tsx
import { NSEBox, NSESearchField, NSETextField } from "@syndromatic/syncloudos/nse";
```

## At a glance

| Component | Purpose | Needs an overlay host |
| --- | --- | --- |
| `NSETextField` | Single-line text with prefix, suffix, validation, formatting and commands; with `isEditable={false}`, a label | No |
| `NSESecureTextField` | A concealed field with a reveal control and a Caps Lock notice | No |
| `NSESearchField` | A search box with incremental queries and recent searches | Only for recent searches |
| `NSEComboBox` | An editable field with asynchronous completions | Yes |
| `NSETokenField` | Tokens such as tags or recipients, with paste, reorder and completion | For completion and token menus |
| `NSEBox` | Titled boxes and separators | No |

Controls that open a floating list need an *overlay host*. A mounted SynWare gets one from the runtime, so use these controls inside an application's views. A control that needs a host and finds none throws an `Error` when it renders.

## Shared behaviour

**Values and phases.** A value control reports each change with a phase:

| Phase | When |
| --- | --- |
| `"preview"` | The value changed while the user is still editing, such as a keystroke. |
| `"commit"` | The user finished: Enter, or focus leaving the field. |
| `"cancel"` | The user pressed Escape and the field reverted. |

Use `"preview"` for a live readout, and `"commit"` for anything that should be saved or recorded as an undo step.

**Controlled and uncontrolled.** Give `value`, and the control shows that value and calls back when the user edits. Give only `defaultValue`, and the control keeps its own state. A native form reset returns an uncontrolled control to its default.

**Validation.** `validation` is `{ kind: "valid" }` or `{ kind: "invalid", code, message }`, and you compute it. An invalid result sets `aria-invalid`, links the message to the field through `aria-describedby` and shows it as an alert. Whether a command is available is a separate matter (see below).

**Commands.** Text and search fields accept a `command` binding, `{ id, payload }`, with an optional `responderId` for diagnostics. The control validates the command through the responder chain, disables itself while the command is unavailable, and dispatches it before committing the value; if the command doesn't run, the value isn't committed. Bindings always go through the host's command system. See [Commands, responders and undo](../commands-responders-undo.md).

**Control size.** `controlSize` is `"regular"` (the default), `"small"` or `"mini"`. The theme sizes the frame, the text and the affixes together.

**Labels.** A control with no visible text needs an `aria-label`, and the types require one where a label can't be inferred.

## NSETextField

```text
<NSETextField label? prefix? suffix? controlSize? groupPosition? value? defaultValue? formatter? formatterContext? validation? invalid? command? onValueChange? {...input attributes} />
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `T` | none | The controlled value. `T` is `string` unless you supply a `formatter`. |
| `defaultValue` | `T` | none | The uncontrolled initial value. |
| `onValueChange` | `(value: T, phase) => void` | none | Value changes with their phase. |
| `label` | `ReactNode` | none | Visible label, tied to the input. |
| `prefix`, `suffix` | `ReactNode` | none | Content inside the frame before and after the text, such as a currency symbol or a unit. |
| `controlSize` | `"regular" \| "small" \| "mini"` | `"regular"` | Frame and text metrics. |
| `groupPosition` | `"single" \| "first" \| "middle" \| "last"` | `"single"` | Join several fields into one block by giving each its place, so the theme draws shared edges. |
| `formatter`, `formatterContext` | `NSEFormatter<T>`, `{ locale, timeZone? }` | none | Typed editing. See below. |
| `validation` | `NSEControlValidation` | none | Your validation result. |
| `invalid` | `boolean` | `false` | A shortcut for an invalid state with the message "This value needs attention." |
| `command` | binding | none | See Shared behaviour. |
| `isEnabled`, `readOnly`, `required`, `name`, `id` | `boolean`, … | `true` for `isEnabled` | `isEnabled={false}` disables the field; the others work as on `<input>`. `required` and other native constraints report through `onInvalid` and show the browser's message. |

Every other `<input>` attribute passes through, except `prefix`, which the frame uses.

**Editing.** Typing calls `onValueChange(text, "preview")`, and Enter or leaving the field commits. Escape restores the last committed text, calls `onValueChange(value, "cancel")` and skips the commit that leaving the field would have made. Escape only claims the key when there's something to revert, so in an unchanged field it can still close the panel around it. Input-method composition, such as typing Japanese, reports nothing until the composition ends.

**Formatters.** A `formatter` makes the field edit values of type `T` instead of strings. It's any object with four methods:

| Method | Purpose |
| --- | --- |
| `string(value, context)` | The display text for a value. It's there for your own use; the field itself uses `editingString`. |
| `editingString(value, context)` | The text the field shows, both at rest and while editing. |
| `getObjectValue(text, context)` | `{ ok: true, value }` or `{ ok: false, error: { code, message, input } }`. |
| `isPartialStringValid(text, context)` | `{ valid, replacement?, error? }`. Called on every keystroke, so the field can reject or rewrite input as soon as it goes wrong. |

As the user types, the field previews the parsed value and shows the formatter's error as an alert while the text can't be parsed. On commit, it replaces the text with the `editingString` of the parsed value.

### Labels

A text field that isn't editable is a label, drawn without a bezel or background, and its children are its text. Use labels for readouts, captions and notes beside controls instead of sizing paragraphs by hand.

```tsx
<NSETextField isEditable={false} font="footnote" textColour="secondaryLabelColour" monospacedDigits role="status">
  {count} items
</NSETextField>
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `isEditable` | `false` | | Makes the field a label. |
| `font` | `"body" \| "callout" \| "footnote" \| "caption" \| "headline" \| "label"` | `"body"` | The text style, sized by the SDK's text tokens so every theme agrees. |
| `textColour` | `"labelColour" \| "secondaryLabelColour"` | `"labelColour"` | The quieter `secondaryLabelColour` suits hints and metadata. |
| `monospacedDigits` | `boolean` | `false` | Tabular figures, so changing numbers don't jitter. |
| `lineBreakMode` | `"byWordWrapping" \| "byCharWrapping"` | `"byWordWrapping"` | `byCharWrapping` lets long unbroken strings (paths, URLs, hex values) wrap anywhere. |
| `backgroundStyle` | `"normal" \| "emphasised" \| "raised" \| "lowered"` | `"normal"` | What the label is drawn on. Use `raised` for a label on a raised surface such as a window's status line, so the theme embosses it. |

A label accepts the attributes of a `<span>`, so give a live readout `role="status"`.

## NSESecureTextField

A password field with a built-in reveal control. It needs an `aria-label`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `revealPolicy` | `"hold" \| "toggle" \| "never"` | `"hold"` | `"hold"` shows the text while the reveal control is pressed. `"toggle"` flips on each click. `"never"` removes the control. |
| `value`, `defaultValue`, `onValueChange(value)` | `string` | none | Controlled or uncontrolled text. The callback receives only the value. |
| `validation`, `invalid`, `validationMessage` | | | The invalid state and its message. The default message is "Enter a valid password." |
| `label`, `prefix`, `suffix` | `ReactNode` | none | Visible label and affixes. |
| `autoComplete`, `required`, `pattern`, `minLength`, `maxLength`, `name` | | | Native attributes. |

The text is hidden again when the field loses focus, when the user presses Escape and when the page is hidden. A "Caps Lock is on." notice appears while Caps Lock is on. A form reset clears an uncontrolled field.

## NSESearchField

A search box for incremental and submitted searches, with a button that clears the text and a menu of recent searches.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `aria-label`, `label`, `placeholder` | | `"Search"` | The accessible name comes from `aria-label`, then a string `label`, then the placeholder. |
| `value`, `defaultValue`, `onValueChange(value)` | `string` | none | Controlled or uncontrolled text. |
| `onQuery` | `(value, signal: AbortSignal) => void \| Promise<void>` | none | Runs the search as the user types. A new query aborts the signal of the previous one. |
| `debounceMs` | `number` | `0` | Delay before `onQuery` runs, when the host provides a scheduler. Without one the query runs at once. |
| `onSearch` | `(value) => void` | none | The user submitted, with Enter. |
| `onClear`, `onCancel` | `() => void` | none | The user cleared the text. |
| `command` | `{ id, payload }` | none | Dispatched on submit with the payload `{ query }`. The search is remembered and reported only when the command executes. |
| `recentSearches` | `readonly string[]` | the field's own | The searches the recents menu offers, most recent first. |
| `maximumRecents` | `number` | `20` | How many recent searches to keep, from 1 to 100. |
| `onRecentSearchesChange` | `(recents) => void` | none | Called with the new list after a search is remembered. |
| `showsAffordance` | `boolean` | `true` | Show the trailing clear button. Hide it for fully incremental surfaces. |
| `showsSearchIcon` | `boolean` | `false` | Show a magnifying glass before the text. |
| `clearLabel` | `string` | `"Clear search"` | The clear button's accessible name. |
| `controlSize`, `height`, `width` | | `"regular"` | `"small"` is the inspector and panel size. |
| `parentResponderId` | `string` | none | The responder that owns the recents list. |
| `isEnabled`, `readOnly`, `name`, `id`, `className` | | `true` for `isEnabled` | `isEnabled={false}` disables the field; the others are standard. |

Enter submits and Escape clears the text, or closes the recents menu when the field is already empty. Recent searches appear when the empty field takes focus, and need an overlay host. Choosing one fills the field and submits it. While an input method is composing, the field neither queries nor submits.

**Keeping recent searches.** Without `recentSearches`, the field keeps its own list only while it's shown. To keep the list between launches, bind `recentSearches` to a `@preference` property and store the list that `onRecentSearchesChange` passes you. Searches are trimmed, and an empty search or one longer than 256 characters isn't remembered.

## NSEComboBox

An editable field that suggests values from an asynchronous data source. It has `role="combobox"`, and suggestions appear in a popup list.

| Prop | Type | Description |
| --- | --- | --- |
| `aria-label` | `string` | Required accessible name. |
| `dataSource` | `NSECompletionDataSource<T>` | `{ query(input, signal): Promise<readonly T[]>, idForItem(item), labelForItem(item) }`. |
| `value` | `T \| null` | The chosen item. |
| `inputValue` | `string` | The text in the field. |
| `onInputValueChange` | `(text: string) => void` | The user edited the text. |
| `onValueChange` | `(value: T \| string \| null, reason) => void` | An item was chosen (`"completion"`) or free text was entered (`"freeform"`). The `reason` type also lists `"clear"`. |
| `allowsFreeform` | `boolean` | Let Enter accept text that is not in the list. |
| `disabled`, `readOnly`, `id`, `name`, `direction`, `parentResponderId` | | `name` adds a hidden input holding the chosen item's id, or the text for a free entry. |

Each edit queries the data source with an `AbortSignal` that aborts when the text changes again. Arrow Down and Arrow Up move through the suggestions, and Enter chooses the highlighted one, or the first if none is highlighted. Escape closes the list and restores `inputValue`. A failed query leaves the list empty, and input-method composition queries only when the composition ends.

## NSETokenField

A field whose values are tokens, such as tags or recipients.

| Prop | Type | Description |
| --- | --- | --- |
| `aria-label` | `string` | Required accessible name. |
| `values` | `readonly NSETokenValue<TId, T>[]` | The tokens. A token is `{ id, representedObject, label }`. |
| `createToken` | `(label: string) => NSETokenValue<TId, T>` | Turns typed text into a token. |
| `onValuesChange` | `(values, reason) => void` | The token list changed. The reason is `"create"`, `"paste"`, `"delete"`, `"reorder"` or `"edit"`. |
| `separators` | `readonly string[]` | Characters that end a token as the user types or pastes. Default `,`, `;` and a newline. |
| `dataSource` | `NSECompletionDataSource<NSETokenValue<TId, T>>` | Suggestions, shown in a popup list. |
| `tokenMenu` | `(token) => readonly { id, label, disabled? }[]` | Items for a disclosure menu on each token. |
| `onTokenMenuAction` | `(tokenId, actionId) => void` | A menu item was chosen. |
| `onRequestReorder` | `(id, beforeId \| null) => void` | Called with a keyboard reorder, before `onValuesChange`. |
| `disabled`, `readOnly`, `id`, `name`, `parentResponderId` | | `name` adds a hidden input with the token ids joined by commas. |

Enter or a separator turns the typed text into a token, skipping any token whose id is already there. Backspace in an empty input removes the last token. Arrow keys move focus between tokens. A focused token is removed with Delete or Backspace, edited with Enter or a double click (it turns back into text in the input), and moved with Alt and Arrow Left or Arrow Right. Pasted text is split on the separators. Tokens copy and cut as text, and drag out as text and as an `application/x-syncloudos-token` representation. Completions and token menus need an overlay host.

## NSEBox

`NSEBox` is a `<fieldset>` with a `<legend>`, or a separator. For wells, frames, plates, shadows and custom fills and borders (`borderColour`, `borderWidth`, `isTransparent`, `cornerRadius`), see [Boxes, shadows and corners](boxes-and-shadows.md).

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `ReactNode` | none | The legend. |
| `titlePosition` | `"noTitle" \| "aboveTop" \| "atTop" \| "belowTop" \| "aboveBottom" \| "atBottom" \| "belowBottom"` | `"atTop"` with a title, otherwise `"noTitle"` | Where the title sits. `"noTitle"` keeps it for assistive technology and hides it. |
| `boxType` | `"primary" \| "secondary" \| "separator" \| "custom"` | `"primary"` | `"separator"` draws a rule (`role="separator"`) and takes no children. |
| `borderType` | `"noBorder" \| "lineBorder" \| "bezelBorder" \| "grooveBorder"` | `"bezelBorder"` | The edge treatment. |
| `contentViewMargins` | `{ width, height }` | standard | The horizontal and vertical distance from the border to the content, each 0 to 4,096 points. Without them the content sits at the standard content margin, and rows run edge to edge as in a grouped table. |
| `fillColour` | `string` | theme | One CSS background value, at most 512 characters, with no `;`, `{` or `}`. |
| `contentLayout` | `"stack" \| "flow"` | `"stack"` | `stack` lays the content out as a leading-aligned column at standard spacing; `flow` leaves it in plain block flow. |

A separator with a `title` draws the theme's captioned separator: the title, then the rule to the edge.

```tsx
<NSEBox title="Downloads">
  <NSEButton buttonType="switch" title="Keep offline" />
</NSEBox>
<NSEBox boxType="separator" title="Disciplines" />
```

## Example

```tsx
import { useState } from "react";
import { NSEBox, NSEButton, NSESearchField, NSESegmentedControl, NSETextField } from "@syndromatic/syncloudos/nse";

// A formatter is any object with these four methods.
const percent = {
  string: (value: number) => `${Math.round(value * 100)}%`,
  editingString: (value: number) => String(Math.round(value * 100)),
  getObjectValue: (text: string) => {
    const number = Number(text.replace("%", "").trim());
    return Number.isFinite(number)
      ? { ok: true as const, value: number / 100 }
      : { ok: false as const, error: { code: "not-a-number", message: "Enter a number.", input: text } };
  },
  isPartialStringValid: (text: string) => ({ valid: /^\d{0,3}%?$/.test(text) }),
};

export function ExportOptions() {
  const [name, setName] = useState("Quarterly report");
  const [scale, setScale] = useState(1);
  const [layout, setLayout] = useState("portrait");
  const [links, setLinks] = useState<"on" | "off" | "mixed">("mixed");
  const [recents, setRecents] = useState<readonly string[]>([]);

  const nameProblem = name.trim() === "" ? ({ kind: "invalid", code: "empty", message: "Give the export a name." } as const) : undefined;

  return (
    <NSEBox title="Export">
      <NSETextField
        label="Name"
        value={name}
        validation={nameProblem}
        onValueChange={(value, phase) => {
          if (phase !== "cancel") setName(value);
        }}
      />
      <NSETextField<number>
        label="Scale"
        value={scale}
        formatter={percent}
        formatterContext={{ locale: "en-GB" }}
        suffix="of original"
        onValueChange={(value, phase) => {
          if (phase === "commit") setScale(value);
        }}
      />
      <NSESegmentedControl
        aria-label="Orientation"
        segmentStyle="capsule"
        selection={{ mode: "select-one", selectedIds: new Set([layout]), allowsEmpty: false }}
        items={[{ id: "portrait", label: "Portrait" }, { id: "landscape", label: "Landscape" }]}
        onSelectionChange={(selection) => setLayout([...selection.selectedIds][0] ?? "portrait")}
      />
      <NSEButton buttonType="switch" allowsMixedState title="Include links" state={links} onStateChange={setLinks} />
      <NSESearchField aria-label="Search templates" recentSearches={recents} onRecentSearchesChange={setRecents} onSearch={(query) => console.log(query)} />
      <NSETextField isEditable={false} font="footnote" textColour="secondaryLabelColour">Exports keep their links.</NSETextField>
    </NSEBox>
  );
}
```

## Errors

| Situation | Result |
| --- | --- |
| A completion control renders with no overlay host | `Error` from the render |
| `NSEBox` `contentViewMargins` outside 0 to 4,096 or not numbers | `RangeError` or `TypeError` |
| `NSEBox` `fillColour` unsafe or unsupported | `TypeError` |
| `NSEBox` with `boxType="separator"` and children, in development | `TypeError` |
| A command that is unavailable or fails | The value isn't committed. The control doesn't tell the user, so show the command's own state |

## Related

- [NSE controls](../nse-controls.md)
- [Buttons](buttons.md)
- [Values and progress](values-and-progress.md)
- [Commands, responders and undo](../commands-responders-undo.md)
