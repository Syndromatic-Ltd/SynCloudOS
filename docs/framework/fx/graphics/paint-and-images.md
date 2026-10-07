# GraphicsFX paint and images

This page covers the things you fill shapes with (colours, gradients, shadings and patterns), the shadow that can fall behind them, and the raster images that GraphicsFX and the other FX frameworks exchange. Geometry, colour and paths are on the [GraphicsFX page](../graphics.md), and the contexts that draw with all of these are on [Drawing contexts](contexts.md).

```ts
import { GFXGradient, GFXImage, GFXShadow } from "@syndromatic/syncloudos/fx/graphics";
```

## Gradients

### `GFXGradient`

A colour ramp along a line or out from a centre. It is immutable.

```text
new GFXGradient(stops: readonly GFXGradientStop[], geometry?: GFXGradientGeometry, options?: { units?, transform? })
```

A `GFXGradientStop` is `{ offset, colour }`, where `offset` is from 0 to 1 and `colour` is a `GFXColour`. A gradient takes 1 to 64 stops. The constructor sorts them by offset (stops with equal offsets keep their order, which makes a hard edge).

`GFXGradientGeometry` is one of:

| Geometry | Fields | The offset at a point is |
| --- | --- | --- |
| Linear | `{ kind: "linear", start, end }` | how far along the line from `start` to `end` the point projects, where 0 is `start` and 1 is `end`. |
| Radial | `{ kind: "radial", centre, radius }` | the distance from `centre` divided by `radius`. The radius must be above 0. |

The default geometry is a linear ramp from `(0, 0)` to `(1, 0)`.

| Option | Values | Default | Meaning |
| --- | --- | --- | --- |
| `units` | `"objectBoundingBox"` or `"userSpaceOnUse"` | `"objectBoundingBox"` | With the bounding box, geometry coordinates run from 0 to 1 across the filled shape, so a gradient adapts to the shape's size. With user space, they are absolute coordinates. |
| `transform` | `GFXAffineTransform` | identity | Applied to the geometry, for skewed or rotated ramps. It must be invertible. |

| Member | Description |
| --- | --- |
| `stops`, `geometry`, `units`, `transform` | The validated values. |
| `sample(offset)` | The colour at an offset along the ramp. Offsets before the first stop return the first colour, and offsets after the last return the last. Colours between stops interpolate in premultiplied sRGB, which avoids dark fringes next to transparent stops. |
| `sampleAt(position, bounds?)` | The colour at a point in the plane. `bounds` supplies the shape's bounding box for bounding-box units, and defaults to the unit square. |

```ts
import { GFXColour, GFXGradient } from "@syndromatic/syncloudos/fx/graphics";

// A top-to-bottom sheen that spans whatever shape it fills.
export const sheen = new GFXGradient(
  [
    { offset: 0, colour: GFXColour.rgba(1, 1, 1, 0.9) },
    { offset: 0.5, colour: GFXColour.rgba(1, 1, 1, 0.1) },
    { offset: 0.5, colour: GFXColour.rgba(0, 0, 0, 0.05) }, // a hard edge at the midpoint
    { offset: 1, colour: GFXColour.rgba(0, 0, 0, 0.25) },
  ],
  { kind: "linear", start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
);

export const middle = sheen.sample(0.75);
```

### `GFXShading`

A gradient with its own geometry in user space. Where a `GFXGradient` with bounding-box units follows the shape it fills, a shading is fixed in the coordinate system. It also adds a conic form.

```text
new GFXShading(gradient: GFXGradient, geometry: GFXShadingGeometry, transform?: GFXAffineTransform)
```

`GFXShadingGeometry` is one of:

| Geometry | Fields | The ramp offset is |
| --- | --- | --- |
| Axial | `{ kind: "axial", start, end }` | the projection along the line, as for a linear gradient. |
| Radial | `{ kind: "radial", centre, radius }` | the distance from the centre divided by the radius. |
| Conic | `{ kind: "conic", centre, startAngle }` | the angle around the centre from `startAngle` (in radians), as a fraction of a full turn. Angles grow clockwise on screen, because y grows down. |

`gradient` supplies the colours and stops, and only the stops matter. `sample(position)` returns the colour at a point. A shading paints the same way anywhere it is used, which suits backgrounds that should stay put behind a moving shape.

## Patterns

### `GFXPattern`

A bitmap that repeats to fill an area.

```text
new GFXPattern(image: GFXImage, transform?: GFXAffineTransform, interpolation?: "nearest" | "linear")
```

The image tiles endlessly, in both directions. `transform` positions, scales and rotates the tile in user space. The default interpolation is `"nearest"`, which keeps pixel art crisp. `sample(position)` returns the colour at a point. Contexts can shift every pattern with `setPatternPhase`, so animated backgrounds scroll without rebuilding the pattern.

## Shadows

### `GFXShadow`

A drop shadow description.

```text
new GFXShadow({ offset, blur, spread, colour })
```

| Field | Meaning |
| --- | --- |
| `offset` | `{ x, y }`, the displacement of the shadow in the context's logical units. |
| `blur` | The softness, at least 0. The Gaussian sigma is half of the blur. |
| `spread` | How far the shadow grows before blurring. The bitmap context requires at least 0. |
| `colour` | A `GFXColour`, whose alpha is the shadow's strength. |

All four fields are required, and unknown fields throw `TypeError`. `GFXShadowValue` is the plain-data form, which contexts accept anywhere a `GFXShadow` fits. `setShadow(null)` on a context turns shadows off.

## Images

### `GFXImage`

An immutable image of 8-bit pixels. A `GFXImage` is the standard way pixels move between frameworks.

```text
new GFXImage(descriptor: GFXImageDescriptor)
```

`GFXImageDescriptor`:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `width`, `height` | `number` | required | Positive integers. |
| `data` | `Uint8Array \| Uint8ClampedArray` | required | The pixel bytes. The image copies them. The length must equal `bytesPerRow * height`. |
| `alpha` | `"straight"`, `"premultiplied"` or `"opaque"` | required | How alpha is stored. |
| `colourSpace` | `GFXColourSpace` | required | `"srgb"`, `"linear-srgb"`, `"display-p3"` or `"grayscale"`. |
| `pixelFormat` | `"rgba8"`, `"bgra8"`, `"rgb8"`, `"gray8"` or `"a8"` | `"rgba8"` | The channel layout. `rgb8` and `gray8` have no alpha and require `"opaque"`. `gray8` requires the grayscale space, and `a8` (alpha only) requires `"straight"`. |
| `bytesPerRow` | `number` | tightly packed | Use it when rows carry padding. Must be at least `width * bytesPerPixel`. |

An image is limited to 64 MiB. The constructor rejects a descriptor that has an unknown field, the wrong data length or an inconsistent combination, with `TypeError` or `RangeError`.

| Member | Type or signature | Description |
| --- | --- | --- |
| `width`, `height`, `bytesPerRow`, `bytesPerPixel`, `pixelFormat`, `alpha`, `colourSpace` | | The descriptor's values. |
| `descriptor` | `GFXBytePixelDescriptor` | The same values as a descriptor with `sampleFormat: "unorm8"`. |
| `copyData()` | `Uint8Array` | A copy of the bytes. An image never exposes its own storage. |
| `pixel(x, y)` | `GFXRGBAComponents` | One pixel as straight (not premultiplied) unit components. Throws `RangeError` outside the image. |
| `sample(position, options?)` | `GFXRGBAComponents` | Reads at a fractional position. Pixel centres sit at half-integer coordinates. `options.interpolation` is `"nearest"` (default) or `"linear"` (which blends premultiplied values), and `options.edge` is `"clamp"` (default), `"repeat"` or `"transparent"`. |
| `cropped(rect)` | `GFXImage \| null` | The part inside an integer rectangle, or `null` when nothing overlaps. |
| `converting(colourSpace, alpha?)` | `GFXImage` | A copy in another colour space and alpha encoding, as `rgba8`. Returns itself when nothing changes. |
| `resized(size, mode?)` | `GFXImage` | Resamples to an integer size with `"linear"` (default) or `"nearest"`. |
| `extractMask(mode?)` | `GFXImage` | An `a8` image from the `"alpha"` channel (default) or from the `"luminance"` weighted by alpha. |
| `withAlphaMask(mask)` | `GFXImage` | Multiplies alpha by a mask's alpha. The mask must have the same size. |
| `toPNG()` | `Uint8Array` | Encodes the image as a PNG file. |

```ts
import { GFXImage } from "@syndromatic/syncloudos/fx/graphics";

export function checker(size: number): GFXImage {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const light = (x >> 2) % 2 === (y >> 2) % 2;
      data.set([light ? 240 : 40, light ? 240 : 40, light ? 240 : 40, 255], (y * size + x) * 4);
    }
  }
  return new GFXImage({ width: size, height: size, alpha: "opaque", colourSpace: "srgb", data });
}

const tile = checker(16);
export const thumbnail = tile.resized({ width: 8, height: 8 }, "nearest");
export const png = thumbnail.toPNG();
export const centre = tile.pixel(8, 8);
export const mask = tile.extractMask("luminance");
```

### `GFXFloatImage`

An image with floating-point samples, for high dynamic range and wide-gamut data. RGB values can be negative or greater than 1, and alpha stays a unit value.

```text
new GFXFloatImage({ width, height, sampleFormat, alpha, colourSpace, data })
```

| Field | Description |
| --- | --- |
| `sampleFormat` | `"float32"` (data is a `Float32Array`) or `"float16"` (data is a `Uint16Array` of half-precision bit patterns). |
| `data` | Four samples per pixel in R, G, B, A order. The length must equal `width * height * 4`. Every sample must be finite and alpha must be from 0 to 1. |
| `alpha`, `colourSpace` | As for `GFXImage`. |

The image is limited to 64 MiB and copies its data.

| Member | Description |
| --- | --- |
| `width`, `height`, `sampleFormat`, `alpha`, `colourSpace` | The descriptor's values. |
| `bytesPerRow`, `bytesPerPixel`, `pixelFormat` (`"rgba-float"`), `descriptor` | Layout details (`GFXPixelDescriptor`). |
| `copyData()` | A copy of the samples, in their storage type. |
| `pixel(x, y)` | A `GFXExtendedRGBA` in straight alpha, so premultiplied images divide out their alpha. |
| static `fromIndexed(descriptor)` | Builds a float image from palette indexes: `{ width, height, indices, palette, colourSpace }`, with a `Uint8Array` or `Uint16Array` of indexes and 1 to 65,536 palette entries. |

`GFXFloatSampleFormat` is `"float16" | "float32"`, and `GFXFloatImageDescriptor` and `GFXIndexedImageDescriptor` are the argument types. ImageFX consumes float images without clipping them, and the RAW decoder produces them.

### Pixel descriptors and leases

`GFXPixelDescriptor` describes the layout of any image: `width`, `height`, `bytesPerRow`, `pixelFormat` (`GFXPixelStorageFormat`: an 8-bit format, `"rgba-float"` or `"indexed"`), `sampleFormat` (`GFXPixelSampleFormat`: `"unorm8"`, `"float16"`, `"float32"`, `"indexed8"` or `"indexed16"`), `alpha` and `colourSpace`. `GFXBytePixelDescriptor` is the 8-bit case.

`GFXPixelLease` is a short-lived hold on an image that a host owns. The session gives you one when you ask an [`IFXImageResource`](../image.md) for pixels (`pixelLease()`), so the host stays in charge of the memory.

| Member | Description |
| --- | --- |
| `descriptor` | The layout of the leased image. |
| `released` | True after `release()` or `transferImage()`. |
| `copyImage()` | A new `GFXImage` with a copy of the pixels. The lease stays valid. |
| `transferImage()` | Hands over the image itself and ends the lease. |
| `release()` | Ends the lease. Idempotent. |

### Data providers and consumers

These move bytes across a boundary with a size limit.

`GFXDataProvider` wraps bytes or a callback so a consumer can read bounded slices.

```text
new GFXDataProvider(data: Uint8Array | GFXCallbackDataProvider)
```

Bytes are copied. A `GFXCallbackDataProvider` (`length`, `read(offset, length)`, `release()`) is read on demand and released once. Both are limited to 64 MiB.

| Member | Description |
| --- | --- |
| `length` | The size in bytes. |
| `read(offset, length)` | A copy of a slice. Throws `RangeError` outside the data and `Error` after release. |
| `released` | True after `release()`. |
| `release()` | Frees the data and calls the callback's `release`. |

`GFXDataConsumer` collects written bytes up to a limit.

```text
new GFXDataConsumer(maximumBytes = 64 MiB)
```

`write(bytes)` appends a copy and throws `RangeError` past the limit. `finish()` returns all the bytes as one array and closes the consumer. `dispose()` discards everything. `GFXPDFContext.finish` accepts a consumer, which is how a large PDF is bounded.

`GFXImageDrawingDestination` is the one-method interface (`drawImage(image, rect)`) that `GFXLayer.draw` and text attachments draw into. Every drawing context satisfies it.

## Errors

| Situation | Error |
| --- | --- |
| A descriptor with unknown fields, non-data properties or an inconsistent combination | `TypeError` |
| Sizes, lengths, indexes or samples out of range, an image over 64 MiB | `RangeError` |
| A mask of a different size | `RangeError` |
| A released lease or provider | `Error` |

## Related

- [GraphicsFX](../graphics.md)
- [Drawing contexts](contexts.md)
- [ImageFX](../image.md)
