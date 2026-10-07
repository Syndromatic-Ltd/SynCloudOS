# ImageFX

ImageFX (`IFX`) is the web-native analogue of Core Image. It describes image processing as a graph of lazy operations. Building a graph does no pixel work, and nothing runs until you render it. That delay lets the framework work out which region each output pixel needs, split the output into tiles, keep memory inside a budget, choose a backend and run the work off the main thread.

An ImageFX image is a description, not a bitmap. `IFXImage.fromPixels()` wraps existing pixels, `IFXImage.constant()` describes a colour that fills all space, and every filter takes images and returns a new image that records what it does. The graph is immutable, so you can share a node between several outputs and render them separately.

The framework has these parts, and each has its own section below.

- **Images and extents.** `IFXImage` nodes with a finite or infinite `extent`, and the operations that crop, transform, composite and clamp them.
- **Filters.** About 200 named filters in 15 categories, applied with `IFXFilter` and discovered through `IFXFilterRegistry`. See the [filter catalogue](image/filters.md).
- **Rendering.** `IFXContext`, `IFXRenderPipeline`, destinations, tile plans and tasks turn a graph into pixels with budgets and cancellation.
- **Resources.** `IFXImageResource` loads and exports images through the session.
- **Text images.** `createIFXTextImage` and `createIFXAttributedTextImage` turn [TextFX](text.md) text into graph nodes.
- **Analysis and RAW.** Feature detection, barcode descriptors, model assets and a portable DNG decoder. See [analysis and RAW](image/analysis-and-raw.md).
- **Kernels, processors and graph transport.** Custom per-pixel programs and the codec that moves a graph between threads. See [kernels and graph transport](image/kernels-and-graphs.md).
- **Retained image shaders.** `IFXShader` carries immutable GPU generator and filter recipes presented by AnimationFX layers. See [image shaders in retained layers](image/shaders.md).

```ts
import { IFXImage } from "@syndromatic/syncloudos/fx/image";
```

## At a glance

| | |
| --- | --- |
| Prefix | `IFX` |
| Entry | `@syndromatic/syncloudos/fx/image` |
| Hook | `useSynWareImages`, from `@syndromatic/syncloudos/sdk` |
| Permissions | None declared in the manifest. The session checks decode and export policy for each image. |
| Analogue | Core Image (`CIImage`, `CIFilter`, `CIContext`, `CIKernel`, `CIDetector`, `CIRAWFilter`) |

## What the entry exports

| Area | Symbols |
| --- | --- |
| Images | `IFXImage`, `IFXExtent`, `IFXImageAccumulator`, `IFXSampler` |
| Retained shaders | `IFXShader`, `IFXShaderUniform`, `IFXShaderUniformType` |
| Filters | `IFXFilter`, `IFXFilterRegistry`, `IFXFilterName`, `IFXFilterParameters`, `IFXFilterCategory`, `IFXBlendMode`, `IFXColourComponents` |
| Rendering | `IFXContext`, `IFXRenderPipeline`, `IFXRenderDestination`, `IFXTileRenderDestination`, `IFXTilePlan`, `IFXRenderTask`, `IFXRenderBackend` and the option, result and info types |
| Resources | `IFXImageResource`, `IFXImageResourcePort`, `IFXResourceHandle` |
| Text | `createIFXTextImage`, `createIFXAttributedTextImage`, `IFXTextImageOptions` |
| Graphs | `IFXFilterGraph`, `IFXGraphCodec`, `IFXSerializedGraph`, `IFXSerializedGraphV2`, `IFXSerializedGraphV3`, `IFXPortableGraph` |
| Kernels and processors | `IFXKernel`, `IFXColourKernel`, `IFXBlendKernel`, `IFXWarpKernel`, `IFXProcessorDefinition` and their program types |
| Analysis | `IFXDetector`, `IFXFeature`, `IFXAnalysisBackend`, `IFXPortableAnalysisBackend`, `IFXModelAnalysisBackend`, `IFXPortableModelBackend` and their types |
| Barcodes | `IFXBarcodeDescriptor` and the QR, Aztec, PDF417 and Data Matrix descriptor classes |
| RAW | `IFXRAWFilter`, `IFXRAWMetadata`, `IFXPortableDNGRAWBackend` and their types and errors |

## Images and extents

### `IFXImage`

An immutable node in a graph. The constructor is private, and images come from the two static factories or from operations on other images.

| Member | Type or signature | Description |
| --- | --- | --- |
| `extent` | `IFXExtent` | The region the image covers, either `{ kind: "finite", rect }` or `{ kind: "infinite" }`. |
| static `fromPixels(pixels, origin?)` | `IFXImage` | Wraps a [GraphicsFX](graphics.md) `GFXImage` (bytes) or `GFXFloatImage` (float16 or float32 samples). `origin` places its top-left corner in the graph's coordinate space, and defaults to 0, 0. |
| static `constant(colour)` | `IFXImage` | A `GFXColour` that fills all space. The extent is infinite. |
| `cropped(rect)` | `IFXImage` | Restricts the image to a rectangle. The new extent is the intersection of the rectangle with the old extent. |
| `transformed(transform, interpolation?)` | `IFXImage` | Applies a `GFXAffineTransform`. Interpolation is `"linear"` (default) or `"nearest"`. The new extent is the bounding box of the transformed extent. |
| `compositedOver(background)` | `IFXImage` | Draws this image over another with source-over blending. The extent is the union. |
| `clampedToExtent()` | `IFXImage` | Repeats the edge pixels outward to infinity. Requires a non-empty finite extent. Use it before a blur so the edges do not fade to transparent. |

Every operation returns a new image and leaves the receiver unchanged. Passing a value that did not come from ImageFX throws `TypeError`.

Coordinates are in the graph's working space: x grows right and y grows down, and a pixel `(x, y)` covers the square from `(x, y)` to `(x + 1, y + 1)`.

### `IFXExtent`

A finite extent has a `rect` in graph coordinates. Blur, distortion and other filters that spread pixels enlarge a finite extent, and generators and `constant` produce infinite ones. An infinite image cannot be the default output of a render. Crop it or give the render an explicit destination.

```ts
import { GFXColour } from "@syndromatic/syncloudos/fx/graphics";
import { IFXImage } from "@syndromatic/syncloudos/fx/image";

const swatch = IFXImage.constant(GFXColour.rgba(1, 0, 0)).cropped({ x: 0, y: 0, width: 32, height: 16 });
if (swatch.extent.kind !== "finite") throw new Error("A crop always has a finite extent");
export const size = [swatch.extent.rect.width, swatch.extent.rect.height]; // [32, 16]
```

## Filters

### `IFXFilter`

A filter is a name, its parameters and how many images it takes. The constructor validates the parameters and fills defaults, and the filter is immutable.

```text
new IFXFilter(name: IFXFilterName, parameters: IFXFilterParameters[name])
filter.apply(...inputs: IFXImage[]): IFXImage
```

| Member | Description |
| --- | --- |
| `name` | The filter's name, such as `"gaussianBlur"`. |
| `parameters` | The validated parameters, frozen, with defaults applied. |
| `category` | One of the 15 categories. |
| `inputCount` | How many images `apply` takes. |
| `apply(...inputs)` | Returns a new image. The number of inputs must equal `inputCount`, or the call throws `RangeError`. |

Parameter types are checked by TypeScript through `IFXFilterParameters`, so the editor completes names and rejects a wrong shape. The constructor also validates at run time and throws for out-of-range values. Where a parameter is optional, an omitted value takes the filter's own default.

The [filter catalogue](image/filters.md) lists every filter, its inputs and its parameters.

### `IFXFilterRegistry`

Lists filters and holds custom ones.

| Member | Description |
| --- | --- |
| `names(category?)` | The sorted names of the built-in filters, optionally for one category. |
| `create(name, parameters)` | The same as `new IFXFilter(name, parameters)`. |
| `register(name, kernel)` | Adds a custom [kernel](image/kernels-and-graphs.md) under a name that starts with `custom:`. A registry holds at most 64. |
| `custom(name)` | Returns a registered kernel. |
| `registerProcessor(definition)` | Adds a portable processor definition. |
| `processor(id, version)` | Returns a registered processor definition. |

`IFXFilterCategory` is one of `"blur"`, `"colourAdjustment"`, `"colourEffect"`, `"composite"`, `"convolution"`, `"distortion"`, `"generator"`, `"geometry"`, `"gradient"`, `"halftone"`, `"reduction"`, `"sharpen"`, `"stylize"`, `"tile"` and `"transition"`. `IFXBlendMode` names the blend modes of the `blend` filter, and `IFXColourComponents` is a `[r, g, b, a]` tuple in the range 0 to 1.

## Rendering

### `IFXContext`

Renders images to pixels. A context holds the working colour space and the resource budgets that keep a render bounded.

```text
new IFXContext(workingColourSpace?: GFXColourSpace, maximumSamples?: number, budgets?: IFXContextBudgets)
```

| Argument | Default | Meaning |
| --- | --- | --- |
| `workingColourSpace` | `"linear-srgb"` | The space in which filters compute. Colours convert to it on the way in and to the destination's space on the way out. |
| `maximumSamples` | 262,144 | The most sample evaluations allowed in one render, from 1 to 2,097,152. |
| `budgets` | see below | Memory and work limits. |

`IFXContextBudgets`, with defaults:

| Field | Default | Meaning |
| --- | --- | --- |
| `outputBytes` | 256 MiB | The largest output image. |
| `scratchBytes` | 32 MiB | Temporary working memory. |
| `cacheBytes` | 16 MiB | The tile cache. |
| `work` | `maximumSamples * 32` | A bound on total computation. |
| `tileSize` | 128 | The tile edge in pixels, from 1 to 1,024. |

The resolved values appear in `context.budgets`. A render that would exceed a budget throws `RangeError`, before it allocates.

| Method | Description |
| --- | --- |
| `render(image, destination?, options?)` | Renders and resolves with `{ image, info }`. Without a destination it renders the image's finite extent, rounded out to whole pixels. |
| `startTask(image, destination?, options?)` | The same, but returns an `IFXRenderTask` you can cancel and inspect. |
| `renderTiles(image, destination, options?)` | Renders to an `IFXTileRenderDestination`, delivering each tile as it finishes, and resolves with `IFXTileRenderInfo`. |
| `dispose()` | Cancels running tasks and releases caches. |

`IFXRenderOptions` has `signal` (an `AbortSignal`) and `interpolation` (`"linear"` or `"nearest"`, the default for sampling between pixels).

The context renders on the calling thread, in the CPU. To render on a worker or a GPU backend, use `IFXRenderPipeline`.

### `IFXRenderDestination`

The rectangle and format that a render fills.

```text
new IFXRenderDestination(extent: IFXExtent, colourSpace = "srgb", alpha = "straight")
```

The extent must be finite and cover whole pixels, with at most four million pixels. `alpha` is `"straight"`, `"premultiplied"` or `"opaque"`. After a render, `destination.image` holds the resulting `GFXImage`. A destination also records which render owns it, so a newer render supersedes an older one, and the older one rejects with an `AbortError`. `bounds`, `colourSpace` and `alpha` describe it, and `dispose()` releases it.

### `IFXRenderTask`

The handle for a render in flight, from `context.startTask()`.

| Member | Description |
| --- | --- |
| `status` | `"running"`, `"completed"`, `"failed"` or `"cancelled"`. |
| `cancel()` | Stops the render. Output becomes visible only after the final cancellation check, so a cancelled render never publishes a partial image. |
| `waitUntilCompleted()` | A promise for the `IFXRenderResult`. |

### `IFXRenderResult` and `IFXRenderInfo`

A result holds the rendered `image` and `info`:

| Field | Description |
| --- | --- |
| `width`, `height` | The output size in pixels. |
| `backend` | `"cpu"`, `"worker-cpu"` or `"accelerated"`. |
| `sampleEvaluations`, `cacheHits` | How many samples the graph computed, and how many the memo answered. |
| `tileCount`, `logicalOutputBytes` | How the output was split and its size. |
| `peakBytes` | `{ output, scratch, cache }`, the peak memory in each category (`IFXPeakBytes`). |
| `work` | The computation used. |
| `globalPreparationCount` | How many whole-image preparation passes ran. |
| `tileCacheHits`, `tileCacheEvictions` | Tile cache statistics. |

### Tiles

Large images render in tiles so memory stays bounded.

`IFXTilePlan` splits a rectangle into tiles.

```text
new IFXTilePlan(bounds: GFXRect, tileSize = 128)
```

The bounds must be integral and non-empty, and the plan allows at most 16,384 tiles. It exposes `bounds`, `tileSize`, `tiles` (each an `IFXTileDescriptor` with `index`, `rect` and `outputBytes`), `logicalOutputBytes` and `maximumTileBytes`.

`IFXTileRenderDestination` delivers rendered tiles to a callback instead of assembling one image:

```text
new IFXTileRenderDestination(extent, { write, tileSize?, colourSpace?, alpha? })
```

`write(tile)` receives an `IFXRenderedTile` with its `index`, `rect` and `image` (a `GFXImage`) and may return a promise. The destination has `bounds`, `tileSize`, `colourSpace` and `alpha`, and a `dispose()`.

```ts
import { GFXImage } from "@syndromatic/syncloudos/fx/graphics";
import { IFXContext, IFXFilter, IFXImage, IFXTileRenderDestination } from "@syndromatic/syncloudos/fx/image";

export async function blurLargeImage(source: GFXImage, paint: (x: number, y: number, tile: GFXImage) => void) {
  const original = IFXImage.fromPixels(source);
  const blurred = new IFXFilter("gaussianBlur", { sigma: 4 })
    .apply(original.clampedToExtent())
    .cropped({ x: 0, y: 0, width: source.width, height: source.height });

  const context = new IFXContext("linear-srgb", 2 * 1024 * 1024, { tileSize: 256 });
  const destination = new IFXTileRenderDestination(blurred.extent, {
    tileSize: 256,
    write: (tile) => paint(tile.rect.x, tile.rect.y, tile.image),
  });
  try {
    return await context.renderTiles(blurred, destination);
  } finally {
    destination.dispose();
    context.dispose();
  }
}
```

### `IFXRenderPipeline`

Chooses where to render. It holds an ordered list of preferred backends and falls back to an `IFXContext`.

```text
new IFXRenderPipeline(preferred?: IFXRenderBackend | readonly IFXRenderBackend[] | null, fallback?: IFXContext)
pipeline.render(image, destination, options?): Promise<IFXRenderResult>
```

For each backend in order, the pipeline asks `canRender(image, destination)`, which has no side effects, and uses the first that says yes. A backend that declines (an unsupported format, or a graph over its budget) passes the graph on. An error thrown while checking eligibility is a failure and does not trigger a fallback. `backends` and `preferred` expose the list, and `dispose()` disposes each backend and the fallback.

The interface a backend implements:

| Member | Description |
| --- | --- |
| `capabilities` | `IFXRenderBackendCapabilities`: `id`, `kind` (`"main-cpu"`, `"worker-cpu"` or `"accelerated"`), `accelerated`, the `pixelFormats`, `colourSpaces` and `alphaFormats` it handles, `destinations` (`"pixels"`, `"tiles"`, `"offscreen-canvas"`, `"encoded-blob"`), `encodedMimeTypes`, `graphOperations` (`"builtin"`, `"portable-kernel"`, `"custom-processor"`) and `builtinOperations`. |
| `canRender(image, destination)` | True when the backend accepts the graph. |
| `render(image, destination, options?)` | Renders. |
| `dispose()` | Releases the backend. |

Graphs render on a browser worker by default. An explicit WebGPU backend accelerates a reviewed subset of operations, and every graph still has a portable path. Float sources keep their precision through the worker, and clipping to bytes happens at the byte render destination. `IFXBackendRenderOptions` has `signal` and `interpolation`.

### `IFXSampler`

The evaluator behind a render. It samples a graph at a point and memoises the results. Most code does not need it, and it is public for backends and diagnostics.

| Member | Description |
| --- | --- |
| `sample(position, interpolation?)` | The premultiplied `{ r, g, b, a }` at a point, in the working colour space. |
| `prepare(check?, bounds?)` | Runs the preparation passes that the graph needs for a region. |
| `preparationRequirements(bounds?)` | The scratch memory and work that preparation will take. |
| `evaluations`, `cacheHits`, `requests`, `cacheEntries`, `cacheEvictions`, `estimatedCacheBytes` | Counters. |
| `clearMemo()`, `clear()` | Drop the memo, or everything. |

### `IFXImageAccumulator`

A bitmap that you update in regions, for a canvas that repeatedly composites new content.

```text
new IFXImageAccumulator(extent: GFXRect)
```

`image` returns the current contents as an `IFXImage`. `update(image, context, dirty?, signal?)` renders `image` into the `dirty` rectangle (default all of it) and merges it. A newer update supersedes an older one that is still running. `clear()` resets to transparent and `dispose()` releases it.

```ts
import { GFXColour } from "@syndromatic/syncloudos/fx/graphics";
import { IFXContext, IFXImage, IFXImageAccumulator } from "@syndromatic/syncloudos/fx/image";

export async function paintDab(accumulator: IFXImageAccumulator, context: IFXContext, x: number, y: number) {
  const dab = IFXImage.constant(GFXColour.rgba(0.1, 0.4, 0.9, 0.8)).cropped({ x: x - 8, y: y - 8, width: 16, height: 16 });
  await accumulator.update(dab.compositedOver(accumulator.image), context, { x: x - 8, y: y - 8, width: 16, height: 16 });
}
```

## Loading and exporting images

### `IFXImageResource`

A decoded image that the session owns. Inside a SynWare, `useSynWareImages().load(request)` returns one. The request names a `source` and can set `accessibleLabel`, `renderingMode`, `tintColour`, `capInsets` and `resizingMode`.

A source is one of:

| Kind | Fields | Use |
| --- | --- | --- |
| `"app-asset"` | `path` | A file in your bundle's resources: a root path, or the URL your bundler gives you (`new URL("./plate.png", import.meta.url).href`), which must be on the site's origin. Any app may decode its own assets; no host policy is needed. |
| `"url"` | `url`, `cors` (`"none"`, `"anonymous"` or `"use-credentials"`) | A web image. Pixel access needs a CORS-clean response. |
| `"bytes"` | `mimeType`, `bytes` | Encoded PNG, JPEG, WebP, GIF or SVG data that you hold. |
| `"generated-svg"` | `svg`, optional `intrinsicSize` and `density` | An SVG string. |
| `"document-resource"` | `documentId`, `descriptor` | An image stored inside an open document. |

| Member | Type or signature | Description |
| --- | --- | --- |
| `state` | `"loading"`, `"ready"`, `"failed"` or `"released"` | The load state. |
| `revision` | `number` | Increases when the content changes. |
| `ready` | `Promise<void>` | Resolves when the image is decoded. Rejects on failure. |
| `subscribe(listener)` | `() => void` | Calls the listener on state changes. Returns an unsubscribe function. |
| `src` | `string` | The resource's URL identity. |
| `intrinsicSize`, `density` | `GFXSize \| null`, `number \| null` | The decoded size in points and the pixel density. |
| `sourceOrientation` | `1` to `8` or `null` | The EXIF orientation of the encoded file. Decoded pixels may already be rotated by the browser, and the framework leaves that as the browser made it. |
| `sourceICCProfile` | `Uint8Array \| null` | A fresh copy of the embedded ICC profile, when present. |
| `accessibleLabel` | `string` | The description for assistive technology. |
| `renderingMode` | `"original" \| "template"` | Template images are drawn as a mask that takes `tintColour`. |
| `tintColour` | `string \| null` | A CSS colour for template images. |
| `capInsets` | `{ top, right, bottom, left } \| null` | Insets for nine-part stretching. |
| `resizingMode` | `"stretch" \| "tile" \| "cap-insets"` | How the image fills a larger area. |
| `image(signal?)` | `Promise<IFXImage>` | A graph node that reuses the decoded pixels. |
| `pixelLease(signal?)` | `Promise<GFXPixelLease>` | A short-lived view of the pixels. |
| `export(format, signal?)` | `Promise<Uint8Array>` | Encoded bytes as `"image/png"` or `"image/webp"`. Rejects if the browser answers with a different type, and never labels PNG bytes as WebP. |
| `release()` | `void` | Frees the image. |

The session checks export policy, CORS cleanliness and mount lifetime before it hands pixels over. When a host cannot identify colour channels reliably, numeric pixel and export access rejects with `NotSupportedError` while display decoding continues to work. Operations that read pixels wait for `ready` and reject with `AbortError` if the image changes while they run.

`IFXImageResourcePort` and `IFXResourceHandle` are the interfaces a host implements to supply a resource.

```tsx
import { useEffect, useRef } from "react";
import { IFXContext, IFXFilter } from "@syndromatic/syncloudos/fx/image";
import { useSynWareImages } from "@syndromatic/syncloudos/sdk";

export function Vignette({ path }: { path: string }) {
  const images = useSynWareImages();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const resource = images.load({ source: { kind: "app-asset", path }, accessibleLabel: "Photo" });

    void (async () => {
      const source = await resource.image(controller.signal);
      const filtered = new IFXFilter("vignette", { intensity: 0.8, radius: 1.5 }).apply(source);
      const context = new IFXContext();
      try {
        const { image } = await context.render(filtered, undefined, { signal: controller.signal });
        const element = canvas.current;
        if (!element) return;
        element.width = image.width;
        element.height = image.height;
        const pixels = new Uint8ClampedArray(image.copyData());
        element.getContext("2d")?.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
      } finally {
        context.dispose();
      }
    })().catch(() => undefined);

    return () => {
      controller.abort();
      resource.release();
    };
  }, [images, path]);

  return <canvas ref={canvas} role="img" aria-label="Photo with a vignette" />;
}
```

## Text as an image

`createIFXTextImage(text, font, options)` and `createIFXAttributedTextImage(attributed, options)` shape text with [TextFX](text.md), turn the glyphs into outlines and place them in the graph as an image. The image then takes part in filters and compositing like any other, for example to add a glow or a shadow.

`IFXTextImageOptions`:

| Field | Range | Meaning |
| --- | --- | --- |
| `scaleFactor` | 1/64 to 64 | Scales the outlines. Use the display's pixel ratio for sharp text. |
| `padding` | 0 to 4,096 | Empty pixels around the text, so effects such as blur have room. |
| `signal` | | An `AbortSignal`. |

The image stores only outline data, so it survives serialisation and never holds a live font. The output cannot exceed 16,384 pixels on a side, and a text image cannot contain inline image attachments. The functions throw `RangeError` beyond those limits.

```ts
import { IFXFilter, createIFXTextImage } from "@syndromatic/syncloudos/fx/image";
import type { TFXFont } from "@syndromatic/syncloudos/fx/text";

export function glowingTitle(text: string, font: TFXFont) {
  const label = createIFXTextImage(text, font, { scaleFactor: 2, padding: 16 });
  if (label.extent.kind !== "finite") throw new Error("A text image always has a finite extent");
  const glow = new IFXFilter("gaussianBlur", { sigma: 4 }).apply(label.clampedToExtent());
  // The clamped glow is infinite, so crop the composite back to the label's box before rendering.
  return label.compositedOver(glow).cropped(label.extent.rect);
}
```

## Errors

| Situation | Error |
| --- | --- |
| A value that is not an ImageFX object, an unknown filter, a wrong parameter type | `TypeError` |
| A parameter or budget out of range, a wrong input count, an extent that overflows | `RangeError` |
| A render that exceeds a memory or work budget | `RangeError` |
| An infinite image with no destination | `RangeError` |
| A superseded destination, a disposed context, an aborted signal | `DOMException` named `AbortError` |
| Pixel access the host cannot provide | `DOMException` named `NotSupportedError` |

## Sub-pages

- [Filter catalogue](image/filters.md), every filter with its inputs and parameters
- [Analysis and RAW](image/analysis-and-raw.md), detection, barcodes, models and DNG decoding
- [Kernels and graph transport](image/kernels-and-graphs.md), custom kernels, processors and graph serialisation

## Related

- [FX overview](README.md)
- [GraphicsFX](graphics.md), for the pixel, colour and path types ImageFX builds on
- [TextFX](text.md)
- [VideoFX](video.md), which filters frames through an ImageFX graph
