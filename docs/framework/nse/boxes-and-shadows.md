# Boxes, shadows and corners

An `NSEBox` is an `NSBox`. A shadow is an `NSEShadow` value assigned to a view's `shadow`, as in `NSView.shadow`. Applications describe the box; the selected theme draws it. There are no public rounded-box, shadow-view or smooth-surface components.

```tsx
import { NSEBox, NSEShadow, NSEView } from "@syndromatic/syncloudos/nse";

<NSEBox boxType="custom" titlePosition="noTitle">A well</NSEBox>
<NSEBox boxType="custom" borderType="lineBorder">A frame</NSEBox>
<NSEBox boxType="custom" shadow={new NSEShadow({
  shadowColor: "#0004", shadowOffset: { width: 0, height: -4 }, shadowBlurRadius: 12,
})}>A floating plate</NSEBox>

<NSEView cornerRadius={18} cornerCurve="continuous">Continuous corners</NSEView>
```

## Atmo's property mapping

The framework sets `data-box-kind`, `data-border-style`, `data-nse-shadow`, `data-transparent`, `data-custom-fill`, `data-custom-border` and `data-corner-curve`. It does not choose an Atmo variant in JavaScript. CSS lives in `Themes/Atmo/Resources/atmo.css`.

| Properties | Atmo look |
| --- | --- |
| `boxType="custom"`, `borderType="bezelBorder"` (default), no shadow | Well: the inset rounded rim, with the existing 14-slice artwork. |
| `boxType="custom"`, `borderType="lineBorder"` or `"grooveBorder"`, no shadow | Frame: the existing raised frame artwork, 18-slice. |
| `boxType="custom"`, non-null `shadow` | Floating plate: the 18-slice plate artwork plus the requested shadow. Takes precedence over the border recipe. |
| `boxType="custom"`, `borderType="noBorder"` | Plain interior; the border is omitted, including on a shadowed plate. |
| Explicit `fillColor`, `borderColor`, `borderWidth`, `cornerRadius` or `cornerCurve` | Property values win: the fixed artwork is replaced with a scalable CSS fill and border. An assigned shadow still draws the floating treatment. |
| `isTransparent={true}` | No interior fill or opaque sprite centre. The border and assigned shadow remain. |
| `contentViewMargins={{ width, height }}` | Exact horizontal and vertical content insets, including zero. The default custom-box inset is 12 px. |
| `title` and `titlePosition` | The existing NSBox title positions and fieldset/legend grouping are preserved. |
| Reduced transparency, forced-colour appearance or the corresponding media query | Decorative shadows and shadow-bearing sprite artwork are suppressed; focus is not clipped. |

`fillColor` follows the existing NSEBox CSS background convention, including gradients. `borderColor` and `shadowColor` are CSS colour values; a shadow also accepts a `GFXColour`. `borderWidth`, `cornerRadius` and shadow blur are finite non-negative pixels. AppKit's own names retain `Color`; other identifiers and prose use British spelling.

## NSEShadow

`new NSEShadow({ shadowColor?, shadowOffset?, shadowBlurRadius? })` copies and freezes its value. The default is one-third-opacity black, zero offset and zero blur. `shadowOffset` is an `NSSize` (`width`, `height`), with positive height upwards; NSE reverses its vertical sign for CSS. A view also accepts the same property record directly, or `null` to remove the shadow. There is no GraphicsFX-only spread field.

## Layer corners

`NSEView`, `NSEBox` and `AFXLayer` accept `cornerRadius` and `cornerCurve: "circular" | "continuous"`. AFX also retains `maskedCorners`. Continuous corners use a squircle. Browser projection uses `corner-shape`; SVG alpha masks and portable AFX composition use the same superellipse geometry. Circular is the default, and browsers without CSS corner-shape retain a circular radius fallback for live CSS surfaces. Existing framework smooth geometry remains internal, so host windows, app views, menus, popovers and toolbars keep their existing corner shapes. NSE's shadow property does not clip the view or add an extra view around it.
