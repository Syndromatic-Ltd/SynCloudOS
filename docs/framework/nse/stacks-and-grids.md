# Stacks and grids

Two views lay out other views: `NSEStackView` puts them in a row or a column, and `NSEGridView` puts them in rows and columns. Both come from `@syndromatic/syncloudos/nse`.

```tsx
import { NSEGridRow, NSEGridView, NSEStackItem, NSEStackView } from "@syndromatic/syncloudos/nse";
```

## NSEStackView

The children of an `NSEStackView` are its arranged views, laid out along its `orientation`.

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
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | A row or a column. |
| `alignment` | `"fill" \| "leading" \| "centre" \| "trailing" \| "first-baseline" \| "last-baseline"` | `"centre"` in a row, `"fill"` in a column | How views sit across the stack. A `leading` column is a content stack: fields, sliders and lists fill it, while buttons, switches and checkboxes keep their natural size. |
| `distribution` | `"fill" \| "fill-equally" \| "fill-proportionally" \| "equal-spacing" \| "equal-centring" \| "gravity-areas"` | `"fill"` | How the views share the space along the stack. |
| `spacing` | a spacing name, pixels or a CSS length | `"inline"` in a row, `"standard"` in a column | The theme's spacing names are `none`, `tight`, `standard`, `inline`, `related` and `group`. |
| `edgeInsets` | `{ inlineStart?, inlineEnd?, blockStart?, blockEnd? }` | none | Padding inside the stack, in pixels. |
| `overflowPolicy` | `"menu" \| "preserve" \| "wrap"` | `"menu"` | What happens when the views do not fit: `menu` detaches views below `mustHold` priority into an overflow menu, `preserve` keeps them all, and `wrap` continues a row on the next line, for narrow windows. |

Wrap a view in an `NSEStackItem` to give it its own settings: `visibilityPriority` (by default `NSEStackVisibilityPriority.mustHold`, 1000; lower priorities such as `detachOnlyIfNecessary`, 900, detach first when space runs out), `minimumSize`, `preferredSize`, `maximumSize`, `weight`, `gravity`, `spacingAfter` (custom spacing after this view), and `hidden` with `detachedWhenHidden`. A hidden view keeps its state but takes no space.

When no view needs per-view sizes, gravity or priorities, the browser lays the stack out with flexbox; otherwise NSE measures it. The frames come out the same either way.

## NSEGridView

An `NSEGridView` contains `NSEGridRow`s, and each child of a row is one cell: a string is a label, any other node is a view, and a fragment is one cell holding several views.

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
      <NSETextField isEditable={false} font="footnote" textColour="secondaryLabelColour">{summary}</NSETextField>
    </>
  </NSEGridRow>
</NSEGridView>
```

| Prop | Type | Description |
| --- | --- | --- |
| `columns` | `{ xPlacement?, width? }[]` | Where cells sit across each column (`leading`, the default, `centre`, `trailing` or `fill`) and an optional fixed width in pixels. |
| `columnSpacing`, `rowSpacing` | a spacing name, pixels or a CSS length | The gaps between columns and rows. They default to the theme's form spacing. |

| `NSEGridRow` prop | Type | Description |
| --- | --- | --- |
| `yPlacement` | `"firstBaseline" \| "top" \| "centre"` | How a label meets the row's views. `firstBaseline`, the default, centres it on their first line, so a label sits level with a field, a checkbox or a slider alike. |
| `mergesCells` | `boolean` | The row's single cell spans every column. |

A grid with a trailing (or leading) label column and a fill column is a form. Each view cell is a content stack, each row's views form a group named by its label, and below 420 px each label moves above its view.
