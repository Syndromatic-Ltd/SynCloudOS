# GraphicsFX drawing contexts

A drawing context is where drawing calls go. GraphicsFX has three, and they share a vocabulary: save and restore a graphics state, set a transform, clip, fill and stroke paths, draw images. They differ in what they produce.

| Context | Produces | Use it for |
| --- | --- | --- |
| `GFXBitmapContext` | A `GFXImage` you can read back | Rendering to pixels in any environment, including workers and tests, and compositing layers. |
| `GFXContext` (recording) | A display list and an SVG document | Capturing drawing as data, generating SVG, and drawing that must be inspected or replayed. |
| `GFXPDFContext` | A PDF file | Documents. See [PDF](pdf.md). |

The [GraphicsFX page](../graphics.md) describes the paths and colours that every context takes, and [Paint and images](paint-and-images.md) describes gradients, patterns and images.

```ts
import { GFXBitmapContext, GFXContext } from "@syndromatic/syncloudos/fx/graphics";
```

## The graphics state

Each context keeps a graphics state, and drawing uses it. `save()` pushes a copy of the state and `restore()` returns to the last saved one, so a helper can change the state and put it back. The depth of saved states is limited to 64 in every context.

| State | Set with | Notes |
| --- | --- | --- |
| Transform | `setTransform(t)`, `concatTransform(t)` | `concatTransform` applies the new transform first (in local coordinates) and then the current one. |
| Clip | `clip(path, rule?)`, `clipToMask(image, rect)` | Each call intersects with the existing clip. Up to 64 clips and 64 masks are active at once. Clips follow the transform in force when you set them. |
| Alpha | `setAlpha(alpha)` | From 0 to 1. Multiplies everything you draw. |
| Blend mode | `setBlendMode(mode)` | See below. |
| Shadow | `setShadow(shadow \| null)` | A `GFXShadow` or `GFXShadowValue`. |
| Interpolation | `setInterpolation(mode)` | `"nearest"` (default) or `"linear"` for images drawn scaled. |
| Pattern phase | `setPatternPhase(point)` | Shifts every pattern paint. |

Restoring with nothing saved throws. In `GFXContext` the error is `GFXStateUnderflowError`, and in the other contexts it is an `Error`.

**Blend modes.** `GFXBlendMode` names the modes:

| Group | Modes |
| --- | --- |
| Separable | `"normal"`, `"multiply"`, `"screen"`, `"overlay"`, `"darken"`, `"lighten"` |
| Compositing | `"source-in"`, `"source-out"`, `"source-atop"`, `"destination-in"`, `"destination-out"`, `"destination-atop"`, `"xor"`, `"copy"`, `"clear"` |

`GFXBitmapContext` implements all fifteen. `GFXContext` records only the separable group, because SVG has no Porter-Duff compositing, and throws `TypeError` for the rest. `GFXPDFContext` accepts the six separable modes and throws `TypeError` for the others.

Types used by these calls: `GFXFillRule` (`"nonzero"` or `"evenodd"`), `GFXLineCap`, `GFXLineJoin`, `GFXInterpolation` (`"nearest"` or `"linear"`), `GFXAffineTransform`.

## Transparency groups

A transparency group draws several things as one unit and then composites the result with a single alpha and blend mode, so overlapping shapes do not show through each other.

```text
const group = context.beginTransparencyGroup({ alpha?, blendMode? });
// ...draw...
context.endTransparencyGroup(group);
```

Inside a group, drawing starts with alpha 1 and the normal blend mode. The options default to the alpha and blend mode in force when the group began. Groups nest to a depth of 16 and must end in reverse order. A `save()` inside a group must be balanced by a `restore()` inside it, or `endTransparencyGroup` throws.

`GFXTransparencyGroup` is the token that `beginTransparencyGroup` returns. It has `id`, `alpha` and `blendMode`, and it is only useful as the argument to `endTransparencyGroup`. `GFXTransparencyGroupOptions` is the options type.

```ts
import { GFXBitmapContext, GFXColour, GFXPath } from "@syndromatic/syncloudos/fx/graphics";

export function overlappingDiscs(): Uint8Array {
  const context = new GFXBitmapContext({ width: 120, height: 80 });
  context.setAntialiasing(true);
  try {
    const group = context.beginTransparencyGroup({ alpha: 0.5 });
    context.fillPath(GFXPath.ellipse({ x: 10, y: 10, width: 60, height: 60 }), GFXColour.rgba(0.9, 0.1, 0.1));
    context.fillPath(GFXPath.ellipse({ x: 40, y: 10, width: 60, height: 60 }), GFXColour.rgba(0.1, 0.1, 0.9));
    context.endTransparencyGroup(group); // the overlap is not darker, because the group composites as one
    return context.makeImage().toPNG();
  } finally {
    context.dispose();
  }
}
```

## `GFXBitmapContext`

A software raster surface. It draws into 8-bit RGBA memory that it owns, with no dependence on the DOM or the session, so it works in tests and workers.

```text
new GFXBitmapContext({ width, height, scale? })
```

`width` and `height` are the logical size and `scale` (default 1, at most 8) is the number of device pixels per logical unit. The bitmap is `ceil(width * scale)` by `ceil(height * scale)` device pixels, and it cannot exceed 16 megapixels. Drawing calls use logical units.

| Member | Type or signature | Description |
| --- | --- | --- |
| `width`, `height`, `scale` | `number` | The logical size and the scale. |
| `pixelWidth`, `pixelHeight` | `number` | The size in device pixels. |
| `save()`, `restore()` | `void` | Graphics state. |
| `setTransform(t)` | `void` | Sets the transform, which must be invertible. |
| `convertPointToDeviceSpace(point)` | `GFXPoint` | Applies the transform and the scale. |
| `convertPointFromDeviceSpace(point)` | `GFXPoint` | The reverse, for hit testing a device coordinate. |
| `setAlpha(alpha)` | `void` | 0 to 1. |
| `setBlendMode(mode)` | `void` | Any `GFXBlendMode`. |
| `setInterpolation(mode)` | `void` | For images. |
| `setAntialiasing(enabled)` | `void` | Off by default. When on, shape edges use 16 coverage samples per device pixel, so edges are smooth and rasterisation is slower. |
| `setPatternPhase(point)` | `void` | Shifts patterns. |
| `setShadow(shadow \| null)` | `void` | The shadow drawn behind subsequent fills, strokes and images. Blur, offset and spread are in logical units, and the Gaussian sigma is half of the blur. Spread cannot be negative. |
| `clip(path, rule?)`, `clipToMask(image, rect)` | `void` | Restrict drawing. |
| `fillPath(path, paint, rule?)` | `void` | Fills with a `GFXBitmapPaint`: a `GFXColour`, `GFXGradient`, `GFXPattern` or `GFXShading`. |
| `strokePath(path, paint, options)` | `void` | Strokes with `GFXStrokeOptions` (width, cap, join, miter limit). Paint is per call, so there is no separate stroke state. |
| `drawImage(image, rect)` | `void` | Draws an image scaled into a rectangle. |
| `beginTransparencyGroup(options?)`, `endTransparencyGroup(group)` | | Groups. |
| `clear()` | `void` | Sets every pixel of the current target to transparent black. |
| `makeImage()` | `GFXImage` | A snapshot as an sRGB, straight-alpha `rgba8` image at device resolution. Throws while a group is open. |
| `dispose()` | `void` | Releases the memory. Later calls throw `Error`. |

Every raster call has a work budget: the product of the device pixels, the samples per pixel and the complexity of the path and clips cannot exceed about 64 million units, and calls beyond it throw `RangeError`. Shadows have their own memory and work check. Lower the size, turn antialiasing off or simplify the path when you reach it.

`GFXBitmapPaint` is the paint union. `GFXLayer` snapshots a bitmap for reuse, as below.

## `GFXContext` (the recording context)

A context that records what you draw as data instead of pixels. It is the basis for SVG output, and for code that wants to inspect or transform drawing after the fact. Its constructor is private. Create one with `GFXContext.recording`:

```text
GFXContext.recording({ size, identifiers, scale? })
```

| Option | Description |
| --- | --- |
| `size` | The logical `GFXSize` of the drawing. |
| `identifiers` | An identifier issuer that gives every gradient, pattern, clip and shadow definition in the output a unique ID. Applications get one from `useImages().createGraphicsIdentifierIssuer()`, which keeps the IDs unique and stops working when your application closes. |
| `scale` | The device scale, above 0 and at most 8. Used by the point conversion methods. |

Unlike the bitmap context, the recording context keeps a full graphics state with fill and stroke paints (defaults are opaque black), so you set paint once and draw several times.

| Member | Type or signature | Description |
| --- | --- | --- |
| `save()`, `restore()` | `void` | State. Restoring with nothing saved throws `GFXStateUnderflowError`. |
| `setTransform(t)`, `concatTransform(t)` | `void` | Transform. |
| `convertPointToDeviceSpace(point)`, `convertPointFromDeviceSpace(point)` | `GFXPoint` | Conversion through the transform and scale. |
| `clip(path, rule?)`, `clipToMask(image, rect)` | `void` | Clips. A clip path may be up to 512 KiB of path data. |
| `setFill(paint)`, `setStroke(paint)` | `void` | A `GFXColour`, `GFXGradient`, `GFXPattern` or `GFXShading`. |
| `setAlpha(alpha)`, `setBlendMode(mode)`, `setPatternPhase(p)`, `setPaintSamplingScale(s)` | `void` | Compositing state. The sampling scale (above 0, at most 8) sets how finely a shading is projected into an SVG gradient. |
| `setLineWidth(w)` | `void` | From 0 to 100,000. Default 1. |
| `setLineCap(cap)`, `setLineJoin(join)` | `void` | Defaults `"butt"` and `"miter"`. |
| `setLineDash(lengths, phase?)` | `void` | Up to 64 entries from 0 to 1,000,000. |
| `setMiterLimit(limit)` | `void` | From 1 to 1,000,000. Default 10. |
| `setInterpolation(mode)` | `void` | For images. |
| `setShadow(shadow \| null)` | `void` | Blur and spread from 0 to 100,000. |
| `setTextAttributes({ letterSpacing, alignment })` | `void` | Letter spacing from -10,000 to 10,000 and alignment `"start"`, `"middle"` or `"end"` (`GFXTextAttributes`). |
| `fill(path, rule?)`, `stroke(path)` | `void` | Records a fill or stroke with the current paint and state. |
| `drawImage(image, rect)` | `void` | Records an image. Each image is limited to one megapixel. An empty rectangle records nothing. |
| `drawLayer(layer, rect)` | `void` | Draws a `GFXLayer`. |
| `drawText(text, origin, font)` | `void` | Records text as an SVG `text` element with the current fill. `font` is `{ family, size, weight?, style? }` (`GFXTextFont`): a family up to 256 characters, a size up to 512, a weight from 1 to 1000 (default 400) and a style `"normal"` (default) or `"italic"`. Text is limited to 64 KiB. The text is set by the viewer's fonts. For exact glyph shapes, draw [TextFX](../text.md) outlines as paths. |
| `beginTransparencyGroup(options?)`, `endTransparencyGroup(group)` | | Groups, to a depth of 16. |
| `displayList` | `GFXDisplayList` | The recording so far as an immutable value. Throws while a group is open. |
| `toSVG()` | `string` | An SVG document for the recording, with gradients, patterns, masks, clip paths and shadows defined once each. |

A recording holds at most 10,000 commands, and exceeding that throws `RangeError`.

### The display list

`GFXDisplayList` is `{ size, commands }`. Each `GFXCommand` is one of:

| Kind | What it records |
| --- | --- |
| `"fill-path"` | A path, its fill rule, the paint, the opacity, the transform, the clips and the blend mode. |
| `"stroke-path"` | The same, plus the line width, cap, join and dash. |
| `"image"` | An image and its destination rectangle. |
| `"text"` | The text, origin and font. |
| `"transparency-group"` | A group token and the commands inside it. |

Every command carries a `GFXCommandState`, an immutable snapshot of the whole graphics state when the command was recorded, so a renderer never has to read live context state. Paints in the list are `GFXPaint` values: `GFXPaintColour` (`{ kind: "colour", css }`), `GFXPaintGradient` (`{ kind: "gradient", id, geometry, units, transform, stops }`) and `GFXPaintPattern` (`{ kind: "pattern", id, image, transform, interpolation }`). Shadings are converted to gradients when they are recorded. `GFXImageMask` describes an active mask (`id`, `image`, `rect`, `transform`). The path commands of a recorded fill are the same `GFXPathCommand` values you passed in.

```tsx
import { useEffect, useState } from "react";
import { GFXColour, GFXContext, GFXGradient, GFXPath } from "@syndromatic/syncloudos/fx/graphics";
import { useImages } from "@syndromatic/syncloudos/sdk";

export function Badge() {
  const images = useImages();
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    const context = GFXContext.recording({ size: { width: 96, height: 96 }, identifiers: images.createGraphicsIdentifierIssuer() });
    context.setFill(new GFXGradient(
      [{ offset: 0, colour: GFXColour.rgba(0.2, 0.6, 1) }, { offset: 1, colour: GFXColour.rgba(0.1, 0.2, 0.7) }],
      { kind: "linear", start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
    ));
    context.setShadow({ offset: { x: 0, y: 3 }, blur: 6, spread: 0, colour: GFXColour.rgba(0, 0, 0, 0.35) });
    context.fill(GFXPath.roundedRect({ x: 8, y: 8, width: 80, height: 72 }, 18));
    context.setShadow(null);
    context.setFill(GFXColour.rgba(1, 1, 1));
    context.drawText("New", { x: 26, y: 54 }, { family: "system-ui", size: 28, weight: 700 });
    setSvg(context.toSVG());
  }, [images]);

  return <div role="img" aria-label="New" dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

## `GFXLayer`

A frozen copy of a bitmap context's pixels that you can draw many times.

```text
new GFXLayer(surface: GFXBitmapContext)
```

`image` is the snapshot (a `GFXImage`), and `draw(context, rect)` draws it into any `GFXImageDrawingDestination`, that is, any context with `drawImage`. Build a complicated shape once on a bitmap, wrap it in a layer, and stamp it where you need it.

```ts
import { GFXBitmapContext, GFXColour, GFXLayer, GFXPath } from "@syndromatic/syncloudos/fx/graphics";

export function stampedStars(): Uint8Array {
  const star = new GFXBitmapContext({ width: 16, height: 16 });
  star.setAntialiasing(true);
  const points = new GFXPath().move({ x: 8, y: 1 }).line({ x: 10, y: 6 }).line({ x: 15, y: 6 }).line({ x: 11, y: 10 }).line({ x: 13, y: 15 }).line({ x: 8, y: 12 }).line({ x: 3, y: 15 }).line({ x: 5, y: 10 }).line({ x: 1, y: 6 }).line({ x: 6, y: 6 }).close();
  star.fillPath(points, GFXColour.rgba(1, 0.8, 0));
  const layer = new GFXLayer(star);
  star.dispose();

  const canvas = new GFXBitmapContext({ width: 64, height: 32 });
  for (let index = 0; index < 4; index += 1) layer.draw(canvas, { x: index * 16, y: index * 4, width: 16, height: 16 });
  const image = canvas.makeImage();
  canvas.dispose();
  return image.toPNG();
}
```

## Errors

| Situation | Error |
| --- | --- |
| A value out of range, a state stack, clip, mask or group depth exceeded | `RangeError` |
| A wrong argument type, a blend mode or line style the context does not support | `TypeError` |
| A raster call over its work budget, a bitmap over 16 megapixels | `RangeError` |
| Restoring with no matching save | `GFXStateUnderflowError` (recording) or `Error` |
| A transparency group that is closed out of order, or with unbalanced saves | `Error` |
| Using a disposed bitmap context | `Error` |
| Reading `displayList` or `makeImage` with a group open | `Error` |

## Related

- [GraphicsFX](../graphics.md)
- [Paint and images](paint-and-images.md)
- [PDF](pdf.md)
- [NSE controls](../../nse-controls.md), where `NSEGraphicsView` hosts drawing code
