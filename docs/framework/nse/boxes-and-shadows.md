# Boxes, shadows and corners

This page covers drawing boxes, shadows and rounded corners. Use an `NSEBox` for a well, frame or floating plate, and give any view a shadow by assigning an `NSEShadow` to its `shadow` property. You describe the box and the active theme draws it. There are no separate public rounded-box, shadow-view or smooth-surface components.

```tsx
import { NSEBox, NSEShadow, NSEView } from "@syndromatic/syncloudos/nse";

<NSEBox boxType="custom" titlePosition="noTitle">A well</NSEBox>
<NSEBox boxType="custom" borderType="lineBorder">A frame</NSEBox>
<NSEBox boxType="custom" shadow={new NSEShadow({
  shadowColour: "#0004", shadowOffset: { width: 0, height: -4 }, shadowBlurRadius: 12,
})}>A floating plate</NSEBox>

<NSEView cornerRadius={18} cornerCurve="continuous">Continuous corners</NSEView>
```

## Atmo's property mapping

The framework sets `data-box-kind`, `data-border-style`, `data-nse-shadow`, `data-transparent`, `data-custom-fill`, `data-custom-border` and `data-corner-curve` on the box, and never picks an Atmo variant in JavaScript. Atmo's rules are in `src/Themes/Atmo.scostheme/Contents/Resources/atmo.boxes.css` and `atmo-structure.boxes.css`.

| Properties | Atmo look |
| --- | --- |
| `boxType="custom"`, `borderType="bezelBorder"` (the default), no shadow | Well: an inset rounded rim, drawn from 14-slice artwork. |
| `boxType="custom"`, `borderType="lineBorder"` or `"grooveBorder"`, no shadow | Frame: raised frame artwork, 18-slice. |
| `boxType="custom"` with a `shadow` | Floating plate: 18-slice plate artwork plus your shadow. This wins over the border type. |
| `boxType="custom"`, `borderType="noBorder"` | A plain interior with no border, even on a plate with a shadow. |
| `fillColour`, `borderColour`, `borderWidth`, `cornerRadius` or `cornerCurve` set | Your values win: the fixed artwork gives way to a scalable CSS fill and border. A shadow still gives the floating look. |
| `isTransparent={true}` | No interior fill and no opaque artwork centre. The border and any shadow remain. |
| `contentViewMargins={{ width, height }}` | Exact horizontal and vertical content insets, zero included. Without them, the content sits at the standard content margin and list rows run edge to edge. |
| `title` and `titlePosition` | The title positions (`titlePosition` defaults to `atTop` with a title and `noTitle` without), drawn as a fieldset and legend. |
| Reduced transparency, forced colours or the matching media query | Decorative shadows and artwork that includes a shadow are dropped; focus rings are never clipped. |

`fillColour` takes one CSS background value, gradients included. `borderColour` and `shadowColour` are CSS colours, and a shadow also accepts a `GFXColour`. `borderWidth`, `cornerRadius` and the shadow's blur are finite, non-negative pixel values. Property names use British spelling (`fillColour`, `shadowColour`).

## NSEShadow

`new NSEShadow({ shadowColour?, shadowOffset?, shadowBlurRadius? })` copies its options and freezes the result. By default it's black at one-third opacity, with no offset and no blur. `shadowOffset` is `{ width, height }`, where a positive height moves the shadow up; NSE flips the sign for CSS. A view's `shadow` also accepts a plain options object, or `null` to remove the shadow. There's no spread setting.

## Layer corners

`NSEView`, `NSEBox` and `AFXLayer` accept `cornerRadius` and `cornerCurve: "circular" | "continuous"`, and `AFXLayer` also has `maskedCorners`. `circular` is the default. Continuous corners are a superellipse (a squircle): in the browser they use CSS `corner-shape`, and SVG alpha masks and AnimationFX composition draw the same curve. A browser without `corner-shape` falls back to a circular radius. The framework's own smooth corners for windows, menus, popovers and toolbars are internal and unaffected. A shadow never clips the view or wraps it in an extra element.
