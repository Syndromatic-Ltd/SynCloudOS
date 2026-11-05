# Stacks and grids

Two views lay out other views: `NSEStackView` puts them in a row or a column, and `NSEGridView` puts them in rows and columns. Both are AppKit's, and both come from `@syndromatic/syncloudos/nse`.

```tsx
import { NSEGridRow, NSEGridView, NSEStackItem, NSEStackView } from "@syndromatic/syncloudos/nse";
```

## NSEStackView

`NSEStackView` is `NSStackView`: its children are its arranged views, laid out along `orientation`.

```tsx
<NSEStackView orientation="vertical" alignment="leading" spacing="standard">
  <NSETextField aria-label="Name" />
  <NSESwitch aria-label="Notify me" state={notify} onStateChange={setNotify} />
</NSEStackView>

<NSEStackView overflowPolicy="wrap">
  <NSEButton title="Cancel" action="cancelOperation" />
  <NSEButton title="Save" action="saveDocument" keyEquivalent="\r" />
</NSEStackView>
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | `NSUserInterfaceLayoutOrientation`. |
| `alignment` | `"fill" \| "leading" \| "centre" \| "trailing" \| "first-baseline" \| "last-baseline"` | `"centre"` in a row, `"fill"` in a column | How views sit across the stack. A `leading` column is a content stack: fields, sliders and lists fill it, while buttons, switches and checkboxes keep their natural size. |
| `distribution` | `"fill" \| "fill-equally" \| "fill-proportionally" \| "equal-spacing" \| "equal-centring" \| "gravity-areas"` | `"fill"` | `NSStackView.Distribution`. |
| `spacing` | a spacing name, pixels or a CSS length | `"inline"` in a row, `"standard"` in a column | The theme's spacing names are `none`, `tight`, `standard`, `inline`, `related` and `group`. |
| `edgeInsets` | `{ inlineStart?, inlineEnd?, blockStart?, blockEnd? }` | none | `NSStackView.edgeInsets`, in pixels. |
| `overflowPolicy` | `"menu" \| "preserve" \| "wrap"` | `"menu"` | What happens when the views do not fit: `menu` detaches views below `mustHold` priority into an overflow menu, `preserve` keeps them all, and `wrap` continues a row on the next line, for narrow windows. |

An `NSEStackItem` around a view gives it the per-view settings of `NSStackView`: `visibilityPriority` (`NSEStackVisibilityPriority.mustHold`, 1000, by default; lower priorities detach first when space runs out), `minimumSize`, `preferredSize`, `maximumSize`, `weight`, `gravity`, `spacingAfter` (`setCustomSpacing(_:after:)`), and `hidden` with `detachedWhenHidden`. A hidden view keeps its state but takes no space.

A stack whose views need none of the per-view sizes, gravity or priorities is laid out by the browser's flexbox; the others are measured. Both give the same frames.

## NSEGridView

`NSEGridView` is `NSGridView`. Each `NSEGridRow` is an `NSGridRow`, and each child of a row is one cell: a string is a label, any other node is a view, and a fragment is one cell holding several views.

```tsx
<NSEGridView columns={[{ xPlacement: "trailing" }, { xPlacement: "fill" }]}>
  <NSEGridRow>
    {"Name"}
    <NSETextField aria-label="Name" />
  </NSEGridRow>
  <NSEGridRow>
    {"Trip"}
    <>
      <NSEDatePicker aria-label="Trip" datePickerMode="range" locale="en-GB" timeZone="Europe/London" value={trip} onValueChange={setTrip} />
      <NSETextField isEditable={false} font="footnote" textColor="secondaryLabelColor">{summary}</NSETextField>
    </>
  </NSEGridRow>
</NSEGridView>
```

| Prop | Type | Description |
| --- | --- | --- |
| `columns` | `{ xPlacement?, width? }[]` | `NSGridColumn`: where cells sit across each column (`leading`, the default, `centre`, `trailing` or `fill`) and an optional fixed width in pixels. |
| `columnSpacing`, `rowSpacing` | a spacing name, pixels or a CSS length | `NSGridView.columnSpacing` and `rowSpacing`. They default to the theme's form spacing. |

| `NSEGridRow` prop | Type | Description |
| --- | --- | --- |
| `yPlacement` | `"firstBaseline" \| "top" \| "centre"` | How a label meets the row's views. `firstBaseline`, the default, centres it on their first line, so a label sits level with a field, a checkbox or a slider alike. |
| `mergesCells` | `boolean` | `mergeCells(in:)`: the row's one cell spans every column. |

A grid with a trailing (or leading) label column and a fill column is a Mac form: each view cell is a content stack, the row's views are a group named by its label, and below 420px each label moves above its view, as on iOS.
