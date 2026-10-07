# GraphicsFX

GraphicsFX (`GFX`) is the web-native analogue of Quartz 2D. It supplies the vocabulary that all drawing code shares: points and rectangles, affine transforms, colours in named colour spaces, vector paths, gradients, shadows and images. On top of that vocabulary it provides drawing contexts that turn calls into pixels (`GFXBitmapContext`), into a replayable display list and SVG (`GFXContext`), or into a PDF document (`GFXPDFContext`), and it reads PDF files back (`GFXPDFDocument`).

Every other FX framework builds on these types. An [AnimationFX](animation.md) shape layer takes a `GFXPath` and a `GFXColour`. An [ImageFX](image.md) graph starts from a `GFXImage` and renders back to one. [TextFX](text.md) turns glyphs into `GFXPath` outlines. [VideoFX](video.md) converts frames to `GFXImage`. Learning GraphicsFX first makes the rest of the FX frameworks easier to read.

Three habits run through the framework.

- **Values are immutable.** A path, a colour, an image and a gradient never change after construction. Methods that look like edits (`path.line(...)`, `colour.withAlpha(...)`) return new values.
- **Input is validated once, at the door.** Constructors reject non-finite numbers, out-of-range values, unknown fields and malformed shapes with `TypeError` or `RangeError`, so a value that exists is a value you can trust.
- **Work is bounded.** Path commands, image sizes, clip depth, state depth and raster work all have documented limits, and exceeding one throws `RangeError` instead of consuming memory or time without bound.

The coordinate system has its origin at the top left, with x growing right and y growing down, in every context, including PDF pages.

```ts
import { GFXColour, GFXPath } from "@syndromatic/syncloudos/fx/graphics";
```

## At a glance

| | |
| --- | --- |
| Prefix | `GFX` |
| Entry | `@syndromatic/syncloudos/fx/graphics` |
| Hook | None. GraphicsFX is a library. The session supplies the identifier issuer that `GFXContext` needs, through `useSynWareImages().createGraphicsIdentifierIssuer()`. |
| Permissions | None |
| Analogue | Quartz 2D (`CGPath`, `CGColor`, `CGColorSpace`, `CGImage`, `CGGradient`, `CGShading`, `CGPattern`, `CGContext`, `CGLayer`, `CGPDFDocument`) |

## The pages of this reference

| Page | Covers |
| --- | --- |
| This page | Geometry, colour, colour transforms and profiles, and paths |
| [Paint and images](graphics/paint-and-images.md) | Gradients, shadings, patterns, shadows, `GFXImage`, `GFXFloatImage`, data providers and pixel descriptors |
| [Drawing contexts](graphics/contexts.md) | `GFXBitmapContext`, the recording `GFXContext`, layers, transparency groups and blend modes |
| [PDF](graphics/pdf.md) | Writing PDFs with `GFXPDFContext`, reading them with `GFXPDFDocument`, rendering, scanning and font embedding |

## Geometry

Points, sizes and rectangles are plain objects. Functions that work on them validate their arguments and return new values.

| Type | Fields |
| --- | --- |
| `GFXPoint` | `x`, `y` |
| `GFXSize` | `width`, `height` |
| `GFXRect` | `x`, `y`, `width`, `height` |
| `GFXVector` | `dx`, `dy` |
| `GFXAffineTransform` | `a`, `b`, `c`, `d`, `tx`, `ty`, the six values of a 2 by 3 matrix. A point `(x, y)` maps to `(a*x + c*y + tx, b*x + d*y + ty)`. |

`GFXIdentityTransform` is the transform that changes nothing.

### Functions

| Function | Description |
| --- | --- |
| `normalisePoint(point)`, `normaliseSize(size)`, `normaliseRect(rect)` | Validate a value and return a frozen copy. Coordinates must be finite. Sizes and rectangle dimensions cannot be negative. |
| `normaliseAffineTransform(transform)` | Validates the six numbers. |
| `offsetRect(rect, dx, dy)` | Moves a rectangle. |
| `insetRect(rect, dx, dy)` | Shrinks a rectangle by `dx` on the left and right and `dy` on the top and bottom. A negative inset grows it. Throws `RangeError` when the result would have a negative size. |
| `unionRects(a, b)` | The smallest rectangle that covers both. |
| `intersectRects(a, b)` | The overlap, or `null` when the rectangles do not touch. Rectangles that share only an edge intersect in a rectangle with zero width or height. |
| `rectContainsPoint(rect, point)` | True for a point inside or on the edge. |
| `rectContainsRect(outer, inner)` | True when `inner` lies wholly inside `outer`. |
| `clampPointToRect(point, rect)` | The nearest point inside the rectangle. |
| `pointsEqual`, `sizesEqual`, `rectsEqual` | Exact equality. |
| `concatenateTransforms(left, right)` | The transform that applies `right` first and then `left`, using column vectors. |
| `invertTransform(transform)` | The inverse. Throws `RangeError` for a singular transform. |
| `transformPoint(point, transform)`, `transformVector(vector, transform)` | Apply a transform. A vector ignores the translation. |
| `transformRect(rect, transform)` | The bounding box of the transformed rectangle. |

```ts
import {
  GFXIdentityTransform,
  concatenateTransforms,
  intersectRects,
  offsetRect,
  transformRect,
} from "@syndromatic/syncloudos/fx/graphics";

const card = offsetRect({ x: 2, y: 3, width: 4, height: 5 }, 10, 20); // x 12, y 23

const rotate90 = { ...GFXIdentityTransform, a: 0, b: 1, c: -1, d: 0 };
const move = { ...GFXIdentityTransform, tx: 100, ty: 50 };
const both = concatenateTransforms(move, rotate90); // rotate first, then move

export const box = transformRect(card, both);
export const overlap = intersectRects(box, { x: 0, y: 0, width: 200, height: 200 });
```

## Colour

### `GFXColour`

An immutable colour with four unit components (red, green, blue and alpha, each from 0 to 1) in a named colour space. The constructor is private, so create colours with the static factories or `GFXColour.parse`. Out-of-range components are clamped to the range and non-finite ones throw `TypeError`.

Colour spaces (`GFXColourSpace`):

| Space | Meaning |
| --- | --- |
| `"srgb"` | Standard sRGB with its transfer curve. The default for `rgba`, `hsla`, `hsva` and `parse`. |
| `"linear-srgb"` | sRGB primaries without the curve. Use it for arithmetic that mixes light. |
| `"display-p3"` | The wider Display P3 gamut, with the sRGB transfer curve. |
| `"grayscale"` | A single gray level held in all three channels. |

| Member | Type or signature | Description |
| --- | --- | --- |
| static `rgba(r, g, b, a?)` | `GFXColour` | sRGB, alpha defaults to 1. |
| static `linearSRGB(r, g, b, a?)` | `GFXColour` | Linear sRGB. |
| static `displayP3(r, g, b, a?)` | `GFXColour` | Display P3. |
| static `hsla({ h, s, l, a })` | `GFXColour` | From hue in degrees (any value, wrapped into 0 to 360), saturation, lightness and alpha as units. |
| static `hsva({ h, s, v, a })` | `GFXColour` | From hue, saturation and value. |
| static `grayscale(white, alpha?)` | `GFXColour` | A gray in the grayscale space. |
| static `parse(input)` | `GFXColour` | Parses a CSS colour string. See below. |
| `space` | `GFXColourSpace` | The colour's space. |
| `components` | `{ r, g, b, a }` | The four components in that space. |
| `hsva` | `GFXHSVAComponents` | The colour as hue (degrees), saturation, value and alpha, computed in sRGB. |
| `converting(space)` | `GFXColour` | The same colour in another space. Out-of-gamut results are clamped. Returns itself when the space is already right. |
| `withAlpha(alpha)` | `GFXColour` | The colour with a different alpha. |
| `equals(other, epsilon?)` | `boolean` | Compares in sRGB, within `epsilon` (default 1/510, about half a byte step). |
| `toCSS()` | `string` | `rgb(r g b)` or `rgb(r g b / a)` in bytes, or `color(display-p3 r g b)` for P3 colours. |
| `toHex(options?)` | `string` | `#rrggbb`, or `#rrggbbaa` with `{ includeAlpha: true }`. |

**Parsing.** `GFXColour.parse` (also exported as `parseGFXColour`) accepts these forms, case-insensitively:

- The names `black`, `white`, `red`, `green` (the CSS dark green `#008000`), `blue` and `transparent`.
- Hexadecimal with 3, 4, 6 or 8 digits.
- `rgb()` and `rgba()`, with commas or with spaces and a `/` before the alpha. Channels are numbers from 0 to 255 or percentages, and alpha is 0 to 1 or a percentage.
- `hsl()` and `hsla()`, with a hue in degrees (an optional `deg` suffix) and saturation and lightness as percentages.
- `color(display-p3 r g b)` and `color(display-p3 r g b / a)`, with components from 0 to 1.

Anything else throws `GFXColourParseError`, which has the `input` and a `reason` of `"syntax"` or `"unsupported-space"`. Use `try` and `catch` for user-supplied strings.

### Colour functions

| Function | Description |
| --- | --- |
| `parseGFXColour(input)` | Same as `GFXColour.parse`. |
| `compositeColour(foreground, background)` | The colour that a translucent foreground produces over an opaque background. Throws when the background is not opaque. |
| `relativeLuminance(colour, background?)` | The WCAG relative luminance, from 0 (black) to 1 (white). A translucent colour needs a background. |
| `contrastRatio(foreground, background)` | The WCAG contrast ratio, from 1 to 21. The background must be opaque. |
| `bestContrastingColour(background, candidates)` | The candidate with the highest contrast against the background, or `null` for an empty list. |

```ts
import { GFXColour, bestContrastingColour, contrastRatio } from "@syndromatic/syncloudos/fx/graphics";

const fill = GFXColour.parse("hsl(210 80% 45%)");
const label = bestContrastingColour(fill, [GFXColour.rgba(0, 0, 0), GFXColour.rgba(1, 1, 1)]);

export const css = fill.toCSS();
export const hex = fill.toHex();
export const p3 = fill.converting("display-p3").toCSS();
export const passesAA = label ? contrastRatio(label, fill) >= 4.5 : false;
```

### Component types and conversion helpers

`GFXRGBAComponents` (`r`, `g`, `b`, `a`), `GFXHSLAComponents` (`h`, `s`, `l`, `a`) and `GFXHSVAComponents` (`h`, `s`, `v`, `a`) describe colour components. Hue is in degrees, and every other value is a unit from 0 to 1.

The entry also exports the conversion functions that `GFXColour` uses, for code that converts many values without creating colour objects: `hslaToRGBA`, `hsvaToRGBA`, `rgbaToHSVA`, `displayP3ToSRGB`, `sRGBToDisplayP3` and `srgbLinearChannel` (which decodes one sRGB channel to linear light). They return clamped components. `clampUnit`, `normalizeHue` and `finite` are the small validators behind them, and `convertColourComponents(components, from, to)` is the conversion `GFXColour.converting` performs. They serve the other FX frameworks, and application code rarely needs them.

### `GFXColourConversionInfo`

A reusable conversion between two named spaces.

```text
new GFXColourConversionInfo(source: GFXColourSpace, destination: GFXColourSpace)
```

`convert(colour)` returns the colour in the destination space and throws `TypeError` when the colour is not in the `source` space. It is useful when you convert many colours between the same pair.

### `GFXColourTransform`

A conversion with explicit policy, and with extended range. Where `GFXColour.converting` always clamps to the unit range, a `GFXColourTransform` works on `GFXExtendedRGBA` values (`r`, `g`, `b` unbounded and finite, `a` from 0 to 1) and clips only when you tell it to. Use it for HDR-ish or wide-gamut work and for conversions through an ICC profile.

```text
new GFXColourTransform({ source, destination, intent?, blackPointCompensation?, gamutMapping?, toneMap? })
```

| Option | Values | Default |
| --- | --- | --- |
| `source`, `destination` | A `GFXColourSpace` or a `GFXColourProfile` | required |
| `intent` | `"perceptual"`, `"relative-colorimetric"`, `"saturation"`, `"absolute-colorimetric"` (`GFXRenderingIntent`) | `"relative-colorimetric"` |
| `blackPointCompensation` | `boolean` | `false` |
| `gamutMapping` | `"preserve"` or `"clip"` (`GFXGamutMapping`) | `"preserve"` |
| `toneMap` | `"none"`, `"clip"` or `"reinhard"` (`GFXToneMapPolicy`) | `"none"` |

| Member | Description |
| --- | --- |
| `apply(value)` | Converts an extended RGBA value. `"reinhard"` compresses values above 1 smoothly, and `"clip"` (as a tone map or a gamut mapping) clamps to 0 to 1. |
| static `fromCMYK({ c, m, y, k, a? })` | A naive CMYK to RGB conversion with all components from 0 to 1. It is not colour managed. |
| static `fromLabD50({ l, a, b, alpha? })` | CIELAB (D50) to linear sRGB. `l` is 0 to 100. |
| static `toLabD50(value)` | Linear sRGB to CIELAB (D50). |
| static `unsupported(backend, disposition)` | Throws `GFXColourTransformUnsupportedError`. A helper for backends that decline a transform. |

`GFXColourTransformUnsupportedError` carries the `backend` and `disposition` that declined.

### `GFXColourProfile`

An ICC colour profile, for images and colours that arrive in a camera, scanner or display profile.

```text
new GFXColourProfile(data: Uint8Array)
```

The constructor validates the profile and copies the bytes. It supports ICC version 2 and 4 RGB profiles of the matrix and tone curve kind (and LUT profiles with paired 8-bit A2B0 and B2A0 tables), with an XYZ connection space at D50. It rejects everything else, including CMYK profiles, other transforms and profiles larger than 4 MiB, with `RangeError` or `TypeError`, rather than guess. Conversions use the relative colorimetric intent and clip at the gamut edge.

| Member | Description |
| --- | --- |
| `version` | `2` or `4`. |
| `preferredIntent` | The profile's declared rendering intent, from 0 to 3. |
| `tags` | The tag signatures the profile contains. |
| `copyData()` | A copy of the profile bytes. |
| `toSRGB(components)` | Converts profile RGBA components (unit values) to sRGB. |
| `fromSRGB(components)` | Converts sRGB components into the profile's space. |
| `decodeImage(descriptor)` | Builds a `GFXImage` in sRGB from image data that is in this profile. The descriptor is a `GFXImageDescriptor` without `colourSpace`. Limited to four million pixels, RGB channels only. |

```ts
import { GFXColourProfile, GFXColourTransform } from "@syndromatic/syncloudos/fx/graphics";

export function toPrinterSpace(profileBytes: Uint8Array) {
  const printer = new GFXColourProfile(profileBytes);
  const transform = new GFXColourTransform({ source: "srgb", destination: printer, gamutMapping: "clip" });
  return transform.apply({ r: 0.9, g: 0.2, b: 0.1, a: 1 });
}
```

## Paths

### `GFXPath`

An immutable vector outline made of commands. A path can hold up to 10,000 commands.

`GFXPathCommand` is a union of five shapes:

| Command | Fields |
| --- | --- |
| Move | `{ kind: "move", point }`, begins a new contour. |
| Line | `{ kind: "line", point }` |
| Quadratic curve | `{ kind: "quad", control, point }` |
| Cubic curve | `{ kind: "curve", control1, control2, point }` |
| Close | `{ kind: "close" }`, returns to the start of the contour. |

```text
new GFXPath(commands?: readonly GFXPathCommand[])
```

| Member | Type or signature | Description |
| --- | --- | --- |
| static `rect(rect)` | `GFXPath` | A rectangle. |
| static `roundedRect(rect, radius)` | `GFXPath` | A rectangle with rounded corners. The radius is limited to half the shorter side. |
| static `ellipse(rect)` | `GFXPath` | An ellipse that fills the rectangle, drawn as four cubic curves. |
| `commands` | `readonly GFXPathCommand[]` | The frozen command list. |
| `move(point)`, `line(point)`, `quad(control, point)`, `curve(c1, c2, point)`, `close()` | `GFXPath` | A new path with the command added. |
| `arc(centre, radius, startAngle, endAngle, clockwise?)` | `GFXPath` | Adds a circular arc, in radians, as cubic curves. It starts with a move (or a line when the path is not empty). The span cannot exceed one revolution. |
| `appending(command)` | `GFXPath` | Adds one command. |
| `append(path)` | `GFXPath` | Adds every command of another path. |
| `transformed(transform)` | `GFXPath` | Applies an affine transform to every point. |
| `bounds` | `GFXRect` | The exact bounding box, including the extremes of curves. An empty path has zero bounds. |
| `contains(point, rule?)` | `boolean` | True when the point is inside, for the `"nonzero"` (default) or `"evenodd"` fill rule. Points on an edge count as inside. |
| `length()` | `number` | The total length of all contours, measured on a flattened approximation accurate to 1/16 of a unit. |
| `trimmed(start, end)` | `GFXPath` | The part between two fractions (0 to 1) of the total length. Curves in the result become polylines. Use it to animate a line drawing on. |
| `dashed(lengths, phase?)` | `GFXPath` | The outline as separate dashes. `lengths` alternates dash and gap, and an odd-length list repeats. |
| `stroked(options)` | `GFXPath` | The outline of the stroked shape as a fillable path. See `GFXStrokeOptions`. |
| `toSVGPathData()` | `string` | The path as SVG `d` data. |

`GFXStrokeOptions`:

| Field | Values | Default |
| --- | --- | --- |
| `width` | A number of at least 0. A width of 0 gives an empty path. | required |
| `cap` | `"butt"`, `"round"`, `"square"` | `"butt"` |
| `join` | `"miter"`, `"round"`, `"bevel"` | `"miter"` |
| `miterLimit` | A number of at least 1. A miter longer than the limit falls back to a bevel. | 10 |

Curves are flattened for measuring, hit testing, dashing and stroking with a fixed tolerance of 1/16 of a unit, so results are the same on every device. Dashing and stroking each throw `RangeError` if the result would exceed 10,000 commands.

`GFXFillRule` is `"nonzero" | "evenodd"`, and `GFXLineCap` and `GFXLineJoin` are the cap and join unions.

### `GFXMutablePath`

A builder for paths made of many calls. Each method changes the builder and returns it, so calls chain. The builder holds an immutable snapshot, so a path you took earlier with `copy()` never changes.

| Member | Description |
| --- | --- |
| `new GFXMutablePath(path?)` | Starts from an existing path, or empty. |
| `move`, `line`, `quad`, `curve`, `arc`, `close`, `append` | As on `GFXPath`. |
| `copy()` | The current path as an immutable `GFXPath`. |
| `clear()` | Empties the builder. |

```ts
import { GFXMutablePath, GFXPath } from "@syndromatic/syncloudos/fx/graphics";

// A rounded speech bubble with a tail.
const bubble = GFXPath.roundedRect({ x: 0, y: 0, width: 160, height: 80 }, 16);
const tail = new GFXMutablePath()
  .move({ x: 28, y: 80 })
  .line({ x: 20, y: 104 })
  .line({ x: 52, y: 80 })
  .close()
  .copy();

export const shape = bubble.append(tail);
export const inside = shape.contains({ x: 80, y: 40 }); // true
export const outline = shape.stroked({ width: 3, join: "round" });
export const drawOn = shape.trimmed(0, 0.5); // the first half of the outline
export const dashes = bubble.dashed([8, 4]);
```

## Errors

| Situation | Error |
| --- | --- |
| A non-finite number, a negative size, an unknown field, a wrong shape | `TypeError` or `RangeError` |
| A colour string that cannot be parsed | `GFXColourParseError` |
| A path, dash, stroke or trim that exceeds its limit | `RangeError` |
| A singular transform inverted | `RangeError` |
| A colour space, ICC profile or transform the framework cannot handle | `GFXColourTransformUnsupportedError`, `TypeError` or `RangeError` |

## Related

- [FX overview](README.md)
- [Paint and images](graphics/paint-and-images.md)
- [Drawing contexts](graphics/contexts.md)
- [PDF](graphics/pdf.md)
- [ImageFX](image.md), which processes `GFXImage` values
- [TextFX](text.md), which produces `GFXPath` outlines
