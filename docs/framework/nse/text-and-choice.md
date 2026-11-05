# Text fields and choice controls

This page covers the controls people type into: text fields and labels, secure, search, combo box and token fields, and the boxes that group a form. They are native `<input>`, `<fieldset>` and `<label>` elements underneath, so labels, autofill, validation and form submission work as they do on any page. Checkboxes are `NSEButton`s with `buttonType="switch"` (see [Buttons](buttons.md)), and a one-of-many choice is an `NSESegmentedControl` (see [Values and progress](values-and-progress.md#nsesegmentedcontrol)).

```tsx
import { NSEBox, NSESearchField, NSETextField } from "@syndromatic/syncloudos/nse";
```

## At a glance

| Component | AppKit | Purpose | Needs an overlay host |
| --- | --- | --- | --- |
| `NSETextField` | `NSTextField` | Single line text with prefix, suffix, validation, formatting and commands; with `isEditable={false}`, a label | No |
| `NSESecureTextField` | `NSSecureTextField` | A concealed field with a reveal control and a Caps Lock notice | No |
| `NSESearchField` | `NSSearchField` | A search box with incremental queries and recent searches | Only for recent searches |
| `NSEComboBox` | `NSComboBox` | An editable field with asynchronous completions | Yes |
| `NSETokenField` | `NSTokenField` | Tokens such as tags or recipients, with paste, reorder and completion | For completion and token menus |
| `NSEBox` | `NSBox` | Titled boxes and separators | No |

Controls marked "Yes" open a floating list, so they need an *overlay host*. A mounted SynWare receives one from the runtime. Elsewhere, wrap the controls in `NSEStandaloneControlHost` from `nse/controls`, which supplies the same overlay, scheduler and focus authority. A control that needs a host and finds none throws an `Error` when it renders.

## Shared behaviour

**Values and phases.** A value control reports its changes with a *phase*:

| Phase | When |
| --- | --- |
| `"preview"` | The value changed while the user is still editing, such as a keystroke. |
| `"commit"` | The user finished: Enter, or focus leaving the field. |
| `"cancel"` | The user pressed Escape and the field reverted. |

Use `"preview"` for a live readout, and `"commit"` for anything that should be saved or recorded as an undo step.

**Controlled and uncontrolled.** Give `value` and the control shows exactly that, and calls back when the user edits. Give only `defaultValue` and the control keeps its own state. A native form reset returns an uncontrolled control to its default.

**Validation.** `validation` is `{ kind: "valid" }` or `{ kind: "invalid", code, message }`, and it is yours to compute. An invalid result sets `aria-invalid`, links the message to the field through `aria-describedby` and shows it as an alert. Command availability is separate. See below.

**Commands.** Fields and search accept a `command` binding, `{ id, payload }` with an optional `responderId` for diagnostics. The control validates the command through the responder chain, disables itself while the command is unavailable, and dispatches it before it commits the value. When the command does not execute, the value does not commit. Bindings resolve through the host's command system and never through a registry of the control's own. See [Commands, responders and undo](../commands-responders-undo.md).

**Control size.** `controlSize` is `"regular"` (the default), `"small"` or `"mini"`. The theme sizes the frame, the text and the affixes together.

**Labels.** A control with no visible text needs an `aria-label`. The types require it where a label cannot be inferred.

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
| `formatter`, `formatterContext` | `Formatter<T>`, `{ locale, timeZone? }` | none | Typed editing. See below. |
| `validation` | `NSEControlValidation` | none | Your validation result. |
| `invalid` | `boolean` | `false` | A shortcut for an invalid state with the message "This value needs attention." |
| `command` | binding | none | See Shared behaviour. |
| `disabled`, `readOnly`, `required`, `name`, `id` | | | As on `<input>`. `required` and other native constraints report through `onInvalid` and show the browser's message. |

Every other `<input>` attribute passes through, except `prefix`, which the frame uses.

**Editing model.** Typing calls `onValueChange(text, "preview")`. Enter, or leaving the field, commits. Escape restores the last committed text, calls `onValueChange(value, "cancel")` and skips the commit that leaving the field would have made. Escape claims the key only when there was something to revert, so a clean field still lets it close the panel that contains it. Composition input, such as an input method for Japanese, reports nothing until the composition ends.

**Formatters.** A `formatter` makes the field edit values of type `T` rather than strings. It is any object with four methods:

| Method | Purpose |
| --- | --- |
| `format(value, context)` | The display text for a value. The interface requires it for your own use, and the field itself edits with `editingText`. |
| `editingText(value, context)` | The text the field shows, both at rest and while editing. |
| `parse(text, context)` | `{ ok: true, value }` or `{ ok: false, error: { code, message, input } }`. |
| `validatePartial(text, context)` | `{ valid, replacement?, error? }`. Called on every keystroke so the field can reject or rewrite input the moment it goes wrong. |

The field previews a parsed value as the user types, shows a formatter's error as an alert while the text cannot parse, and on commit replaces the text with `editingText` of the parsed value.

### Labels

A text field that is not editable is a label: AppKit's `NSTextField(labelWithString:)`, drawn without a bezel or background. Its children are its string value. Use it for readouts, captions and notes beside controls instead of hand-sizing paragraphs.

```tsx
<NSETextField isEditable={false} font="footnote" textColor="secondaryLabelColor" monospacedDigits role="status">
  {count} items
</NSETextField>
```

| Prop | Type | Default | AppKit | Description |
| --- | --- | --- | --- | --- |
| `isEditable` | `false` | | `isEditable` | Makes the field a label. |
| `font` | `"body" \| "callout" \| "footnote" \| "caption" \| "headline" \| "label"` | `"body"` | `font` (`NSFont.TextStyle`) | The text style, sized by the SDK's text tokens so every theme agrees. |
| `textColor` | `"labelColor" \| "secondaryLabelColor"` | `"labelColor"` | `textColor` | The quieter `secondaryLabelColor` suits hints and metadata. |
| `monospacedDigits` | `boolean` | `false` | the monospaced-digit system font | Tabular figures, so changing numbers do not jitter. |
| `lineBreakMode` | `"byWordWrapping" \| "byCharWrapping"` | `"byWordWrapping"` | `lineBreakMode` | `byCharWrapping` lets long unbroken strings (paths, URLs, hex values) wrap anywhere. |

A label accepts the attributes of a `<span>`, so give a live readout `role="status"`.

## NSESecureTextField

A password field with a built-in reveal control. It requires an `aria-label`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `revealPolicy` | `"hold" \| "toggle" \| "never"` | `"hold"` | `"hold"` shows the text while the reveal control is pressed. `"toggle"` flips on each click. `"never"` removes the control. |
| `value`, `defaultValue`, `onValueChange(value)` | `string` | none | Controlled or uncontrolled text. The callback receives only the value. |
| `validation`, `invalid`, `validationMessage` | | | The invalid state and its message. The default message is "Enter a valid password." |
| `label`, `prefix`, `suffix` | `ReactNode` | none | Visible label and affixes. |
| `autoComplete`, `required`, `pattern`, `minLength`, `maxLength`, `name` | | | Native attributes. |

The text conceals again when the control loses focus, when the user presses Escape, and when the page becomes hidden. A "Caps Lock is on." notice appears while the key is engaged. A form reset clears an uncontrolled field.

## NSESearchField

A search box for incremental and submitted searches, with an affordance that clears the text, and a menu of recent searches.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `aria-label`, `label`, `placeholder` | | `"Search"` | The accessible name comes from `aria-label`, then a string `label`, then the placeholder. |
| `value`, `defaultValue`, `onValueChange(value)` | `string` | none | Controlled or uncontrolled text. |
| `onQuery` | `(value, signal: AbortSignal) => void \| Promise<void>` | none | Runs the search as the user types. A new query aborts the signal of the previous one. |
| `debounceMs` | `number` | `0` | Delay before `onQuery` runs, when the host provides a scheduler. Without one the query runs at once. |
| `onSearch` | `(value) => void` | none | The user submitted, with Enter. |
| `onClear`, `onCancel` | `() => void` | none | The user cleared the text. |
| `command` | `{ id, payload }` | none | Dispatched on submit with the payload `{ query }`. The search is remembered and reported only when the command executes. |
| `recentSearches` | `readonly string[]` | the field's own | `NSSearchField.recentSearches`: the searches the recents menu offers, most recent first. |
| `maximumRecents` | `number` | `20` | `NSSearchField.maximumRecents`, from 1 to 100. |
| `onRecentSearchesChange` | `(recents) => void` | none | Called with the new list after a search is remembered. |
| `showsAffordance` | `boolean` | `true` | Show the trailing clear button. Hide it for fully incremental surfaces. |
| `showsSearchIcon` | `boolean` | `false` | Show a magnifying glass before the text. |
| `clearLabel` | `string` | `"Clear search"` | The clear button's accessible name. |
| `controlSize`, `height`, `width` | | `"regular"` | `"small"` is the inspector and panel size. |
| `parentResponderId` | `string` | none | The responder that owns the recents list. |
| `disabled`, `readOnly`, `name`, `id`, `className` | | | Standard. |

Enter submits and Escape clears the text, or closes the recents menu when the field is already empty. Recent searches appear when the empty field takes focus, and need an overlay host. Choosing one fills the field and submits it. While an input method is composing, the field neither queries nor submits.

**Keeping recent searches.** Without `recentSearches`, the field keeps its own list for as long as it is shown. AppKit keeps the list between launches with `recentsAutosaveName`; in NSE, bind `recentSearches` to a `@preference` property and store the list `onRecentSearchesChange` passes you. Searches are trimmed, and an empty search or one longer than 256 characters is not remembered.

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

Each edit queries the data source with an `AbortSignal` that aborts when the text changes again. Arrow Down and Arrow Up move through the suggestions. Enter chooses the highlighted suggestion, or the first one when none is highlighted. Escape closes the list and restores `inputValue`. Query failures leave the list empty. Composition input queries when the composition ends.

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

Enter or a separator turns the typed text into a token, and a token whose id is already present is skipped. Backspace in an empty input removes the last token. A focused token removes itself with Delete or Backspace, edits with Enter or a double click (it becomes text in the input), and moves with Alt and Arrow Left or Arrow Right, and Arrow keys move focus between tokens. Pasted text splits on the separators. Tokens copy and cut as text and drag out as text and as a `application/x-syncloudos-token` representation. Completions and token menus need an overlay host.

## NSEBox

`NSEBox` is AppKit's `NSBox`: a `<fieldset>` with a `<legend>`, or a separator.

| Prop | Type | Default | AppKit | Description |
| --- | --- | --- | --- | --- |
| `title` | `ReactNode` | none | `title` | The legend. |
| `titlePosition` | `"noTitle" \| "aboveTop" \| "atTop" \| "belowTop" \| "aboveBottom" \| "atBottom" \| "belowBottom"` | `"atTop"` with a title, otherwise `"noTitle"` | `titlePosition` | Where the title sits. `"noTitle"` keeps it for assistive technology and hides it. |
| `boxType` | `"primary" \| "secondary" \| "separator" \| "custom"` | `"primary"` | `boxType` | `"separator"` draws a rule (`role="separator"`) and takes no children. |
| `borderType` | `"noBorder" \| "lineBorder" \| "bezelBorder" \| "grooveBorder"` | `"bezelBorder"` | `borderType` | The edge treatment. |
| `contentViewMargins` | `{ width, height }` | standard | `contentViewMargins` | The horizontal and vertical distance from the border to the content, each 0 to 4,096 points. Without them the content sits at the standard content margin, and rows run edge to edge as in a grouped table. |
| `fillColor` | `string` | theme | `fillColor` | One CSS background value, at most 512 characters, with no `;`, `{` or `}`. |
| `contentLayout` | `"stack" \| "flow"` | `"stack"` | | `stack` lays the content out as a leading-aligned column at standard spacing; `flow` leaves it in plain block flow. |

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
  format: (value: number) => `${Math.round(value * 100)}%`,
  editingText: (value: number) => String(Math.round(value * 100)),
  parse: (text: string) => {
    const number = Number(text.replace("%", "").trim());
    return Number.isFinite(number)
      ? { ok: true as const, value: number / 100 }
      : { ok: false as const, error: { code: "not-a-number", message: "Enter a number.", input: text } };
  },
  validatePartial: (text: string) => ({ valid: /^\d{0,3}%?$/.test(text) }),
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
      <NSETextField isEditable={false} font="footnote" textColor="secondaryLabelColor">Exports keep their links.</NSETextField>
    </NSEBox>
  );
}
```

## Errors

| Situation | Result |
| --- | --- |
| A completion control renders with no overlay host | `Error` from the render |
| `NSEBox` `contentViewMargins` outside 0 to 4,096 or not numbers | `RangeError` or `TypeError` |
| `NSEBox` `fillColor` unsafe or unsupported | `TypeError` |
| `NSEBox` with `boxType="separator"` and children, in development | `TypeError` |
| A command that is unavailable or fails | The control stays uncommitted. It reports nothing to the user by itself, so present the command's own state |

## Related

- [NSE controls](../nse-controls.md)
- [Buttons](buttons.md)
- [Values and progress](values-and-progress.md)
- [Commands, responders and undo](../commands-responders-undo.md)
