# GraphicsFX PDF

GraphicsFX writes and reads PDF files. `GFXPDFContext` records pages of drawing and produces a PDF. `GFXPDFDocument` opens an existing PDF, exposes its pages, and renders them to images. `GFXPDFScanner` gives low-level access to a document's objects and content streams, and `GFXPDFFontSubset` embeds fonts so that text in an exported PDF is real, searchable text.

Every PDF operation is bounded. A PDF file can be hostile input, so opening, scanning and rendering all enforce limits on size, page count, object count, decoded bytes and time, and they report a `GFXPDFError` with a code rather than exhaust memory. In a browser, a document is parsed in an isolated worker.

This page belongs to [GraphicsFX](../graphics.md). Drawing calls take the paths, colours, gradients and images described on the [GraphicsFX](../graphics.md) and [Paint and images](paint-and-images.md) pages.

```ts
import { GFXPDFContext, GFXPDFDocument } from "@syndromatic/syncloudos/fx/graphics";
```

## Writing a PDF

### `GFXPDFContext`

A recorder that builds a PDF one page at a time.

```text
new GFXPDFContext(metadata?: GFXPDFMetadata)
```

`GFXPDFMetadata` holds optional `title`, `author`, `subject` and `keywords` strings of up to 4,096 characters each.

The typical order is: begin a page, draw, end the page, repeat, then call `finish()`. Page coordinates are in points (1/72 inch), with the origin at the top left and y growing down, the same as every other GraphicsFX context.

| Member | Description |
| --- | --- |
| `beginPage(options)` | Starts a page. Throws if a page is already open, or after 256 pages. |
| `endPage()` | Finishes the page. Throws if `save` and `restore` calls, or marked-content calls, are unbalanced. |
| `finish(consumer?, signal?)` | Builds the PDF and resolves with its bytes. Optional `GFXDataConsumer` receives the bytes too, and `signal` cancels the export. The context is closed afterwards. Output above 32 MiB throws `RangeError`. |
| `dispose()` | Abandons the recording and cancels a pending `finish`. |

`GFXPDFPageOptions`:

| Field | Description |
| --- | --- |
| `width`, `height` | The page size in points, each from 0.001 to 14,400. Required. |
| `rotation` | `0` (default), `90`, `180` or `270`. |
| `cropBox`, `bleedBox`, `trimBox`, `artBox` | Optional `GFXRect`s for print production. |

**Document structure.**

| Member | Description |
| --- | --- |
| `setLanguage(tag)` | The document's language as a BCP 47 tag such as `"en-GB"`. Screen readers use it. |
| `setOutputIntent(profile, { identifier })` | Declares the colour profile the document is intended for, a `GFXColourProfile` with an identifier of up to 256 characters (`GFXPDFOutputIntentOptions`). |
| `addOutline({ title, pageIndex })` | Adds a bookmark that jumps to a page that already exists. Titles are up to 1,024 characters, and a document holds up to 4,096 outlines (`GFXPDFOutline`). |
| `addLink({ rect, uri })` | Adds a clickable rectangle on the open page. Only absolute `http:` and `https:` URIs are accepted. Up to 4,096 per page (`GFXPDFLink`). |
| `beginMarkedContent({ tag, actualText? })`, `endMarkedContent()` | Wraps drawing in structure for accessibility. `tag` is a structure name such as `"P"` or `"Figure"` (a letter followed by up to 31 letters and digits). `actualText` supplies replacement text that assistive technology reads in place of the drawing, up to 4,096 characters. Marked content nests up to 32 deep, and a page holds up to 4,096 markers (`GFXPDFMarkedContent`). |

**Graphics state.** These calls need an open page and mirror the other contexts.

| Member | Description |
| --- | --- |
| `save()`, `restore()` | State stack. |
| `setTransform(t)`, `concatTransform(t)` | Transform. |
| `setAlpha(alpha)` | 0 to 1. |
| `setBlendMode(mode)` | `"normal"`, `"multiply"`, `"screen"`, `"overlay"`, `"darken"` or `"lighten"`. Others throw `TypeError`. |
| `setFillColour(colour)`, `setStrokeColour(colour)` | A `GFXColour`. |
| `setProfiledFillColour(profile, components)` | A fill colour given in an ICC profile's space, converted to sRGB. |
| `setLineWidth(w)` | From 0 to 10,000. |
| `setLineCap(cap)`, `setLineJoin(join)` | As elsewhere. |
| `setLineDash(lengths, phase?)` | Up to 64 lengths. They cannot all be zero. |
| `clip(path, rule?)` | Up to 64 active clips. |

**Drawing.**

| Member | Description |
| --- | --- |
| `fill(path, paint?, rule?)` | Fills with a `GFXColour` or `GFXGradient`, defaulting to the current fill colour. |
| `stroke(path)` | Strokes with the current stroke colour and line state. |
| `drawImage(image, rect)` | Embeds a `GFXImage`. Each image is limited to one megapixel and a document to four megapixels of images in total. |
| `drawProfiledImage(profile, pixels, rect)` | Embeds image data that is in an ICC profile's space, converted to sRGB. |
| `drawPDFPage(document, index, rect)` | Places a page from an opened `GFXPDFDocument` into a rectangle, for imposition and stamping. |
| `drawPositionedText(runs)` | Writes real text. Each `GFXPDFPositionedTextRun` carries the text, its source range, the baseline, a `GFXPDFFontSubset` and the glyph outlines, so the PDF embeds a subset of the font and the text is selectable and searchable. Up to 4,096 runs and 10,000 glyphs per call. |
| `drawGlyphOutlines(outlines)` | Draws glyphs as filled outlines. The result looks right but is not searchable. Up to 10,000 outlines. |

A document holds up to 10,000 drawing commands and 100,000 path elements, and exceeding either throws `RangeError`.

**Fonts and permissions.** `drawPositionedText` and `drawGlyphOutlines` refuse fonts whose embedding permission is not `"allowed"` and throw a `SecurityError` `DOMException`. That is the font's own licence bit, read from its OS/2 table, and honouring it is part of exporting responsibly.

```ts
import { GFXColour, GFXPDFContext, GFXPath } from "@syndromatic/syncloudos/fx/graphics";
import { TFXAttributedString, TFXFont, TFXFontDescriptor, TFXGlyphDrawing, TFXTypesetter } from "@syndromatic/syncloudos/fx/text";

export async function invoice(fontBytes: Uint8Array): Promise<Uint8Array> {
  const font = await TFXFont.create(fontBytes, new TFXFontDescriptor({ size: 18 }));
  const heading = "Invoice 4821";
  const line = new TFXTypesetter(new TFXAttributedString(heading, [{ start: 0, end: heading.length, font }])).createLine(0, heading.length);

  const pdf = new GFXPDFContext({ title: "Invoice 4821", author: "Example Ltd" });
  pdf.setLanguage("en-GB");
  pdf.beginPage({ width: 595, height: 842 }); // A4 in points
  pdf.setFillColour(GFXColour.rgba(0.95, 0.95, 0.98));
  pdf.fill(GFXPath.rect({ x: 40, y: 40, width: 515, height: 48 }));

  pdf.beginMarkedContent({ tag: "H1" });
  pdf.setFillColour(GFXColour.rgba(0, 0, 0));
  pdf.drawPositionedText(TFXGlyphDrawing.pdfTextRunsForLine(line, { x: 52, y: 72 }));
  pdf.endMarkedContent();

  pdf.addLink({ rect: { x: 40, y: 800, width: 200, height: 16 }, uri: "https://example.com/terms" });
  pdf.endPage();
  pdf.addOutline({ title: "Invoice", pageIndex: 0 });
  return pdf.finish();
}
```

### `GFXPDFFontSubset`

An opaque handle to a font program that a PDF may embed. You do not create one directly. `TFXFont.pdfFontSubset()` returns it, and `TFXGlyphDrawing.pdfTextRunsForLine` puts it into text runs. The framework subsets the font to the glyphs the document uses.

```text
new GFXPDFFontSubset(source: Uint8Array, options: { familyName, size })
```

The constructor takes 12 bytes to 32 MiB of font data. `identity` is a stable fingerprint of the font, `familyName` and `size` are the values you passed, and `embedding` is `"allowed"`, `"restricted"` or `"unknown"` (`GFXPDFFontEmbedding`). The original font bytes are never exposed by the handle.

`GFXPDFFontSubsetOptions` is the options type, and `GFXPDFPositionedTextRun` is the shape of a run: `sourceStart`, `sourceEnd`, `text`, `direction` (`"ltr"`, `"rtl"`, `"ttb"` or `"btt"`), `baseline` (a point), `font` (a subset) and `outlines` (each with `glyphId`, `stringIndex`, `path` and `embedding`). The text length must equal the source range, and every outline's `stringIndex` must fall inside it.

## Reading a PDF

### `GFXPDFDocument`

An opened PDF. Open one with the static method, which parses the file with bounds and (in a browser) inside an isolated worker.

```text
GFXPDFDocument.open(bytes: Uint8Array, options?: GFXPDFOpenOptions, signal?: AbortSignal): Promise<GFXPDFDocument>
GFXPDFDocument.open(bytes: Uint8Array, signal?: AbortSignal): Promise<GFXPDFDocument>
```

`GFXPDFOpenOptions`:

| Option | Default | Maximum | Meaning |
| --- | --- | --- | --- |
| `maximumEncodedBytes` | 16 MiB | 64 MiB | The largest file accepted. |
| `maximumDecodedBytes` | 32 MiB | 128 MiB | The most that decoding may produce. |
| `maximumPageCount` | 256 | 4,096 | The most pages accepted. |
| `maximumObjectCount` | 20,000 | 100,000 | The most indirect objects accepted. |
| `maximumOperationMilliseconds` | 5,000 | 60,000 (at least 10) | The time budget for one parse or render operation. |
| `password` | none | | The password for an encrypted file. |

The bytes are copied. `open` rejects with `GFXPDFError` when the file does not start with `%PDF-`, is malformed, encrypted (`"password-required"` or `"incorrect-password"`), or over a limit.

| Member | Description |
| --- | --- |
| `pageCount` | The number of pages. |
| `page(index)` | A `GFXPDFPage`. Throws `RangeError` outside the document. |
| `metadata` | `GFXPDFMetadata` (`title`, `author`, `subject`, `keywords`). |
| `permissions` | `{ raw }`, the PDF permission flags exactly as the file declares them, or `null`. They are metadata and not a security boundary, so honour them in your interface as you see fit. |
| `dispose()` | Cancels running renders, wipes the retained bytes and invalidates the document and its pages. Idempotent. |

### `GFXPDFPage`

One page. Pages come from `document.page(index)`.

| Member | Type or signature | Description |
| --- | --- | --- |
| `index` | `number` | The zero-based page number. |
| `mediaBox`, `cropBox`, `bleedBox`, `trimBox`, `artBox` | `GFXRect` | The five page boxes in points. |
| `rotation` | `0 \| 90 \| 180 \| 270` | The page's declared rotation. |
| `userUnit` | `number` | The size of a unit in points, usually 1. |
| `viewport(scale?, box?)` | `GFXPDFViewport` | The pixel size at a scale (0.001 to 32, default 1) for the `"crop"` (default) or `"media"` box, and a transform that maps page coordinates to that viewport, with rotation and y-flip applied. |
| `render(destination?, signal?)` | `Promise<GFXImage>` | Renders the page to an image. |
| `startRender(destination?, signal?)` | `GFXPDFRenderTask` | The same, with a task you can cancel. |

`GFXPDFViewport` holds `width`, `height` and `transform`.

### Rendering

`GFXPDFRenderDestination` says how large to render.

```text
new GFXPDFRenderDestination({ scale?, box?, maximumPixels? })
```

| Option | Default | Range |
| --- | --- | --- |
| `scale` | 1 | 0.001 to 8 |
| `box` | `"crop"` | `"crop"` or `"media"` |
| `maximumPixels` | 16,777,216 | 1 to 16,777,216 |

A render throws `RangeError` before it starts when the page would exceed `maximumPixels`. After a render, `destination.image` holds the result. Starting a new render into the same destination cancels the earlier one, which rejects with an `AbortError`. `dispose()` cancels and empties the destination. `GFXPDFRenderRequest` is the options type.

`GFXPDFRenderTask` is the handle for a render in progress: `status` (`"running"`, `"completed"`, `"failed"` or `"cancelled"`), `cancel()` and `waitUntilCompleted()`, which resolves with the `GFXImage`. At most eight renders run at once, and a ninth throws a `limit` error. The image is `rgba8`, straight alpha, sRGB.

```ts
import { GFXPDFDocument, GFXPDFRenderDestination } from "@syndromatic/syncloudos/fx/graphics";

export async function thumbnails(bytes: Uint8Array, signal: AbortSignal) {
  const document = await GFXPDFDocument.open(bytes, { maximumPageCount: 50 }, signal);
  try {
    const images = [];
    for (let index = 0; index < Math.min(document.pageCount, 6); index += 1) {
      const destination = new GFXPDFRenderDestination({ scale: 0.25, maximumPixels: 1_000_000 });
      images.push(await document.page(index).render(destination, signal));
      destination.dispose();
    }
    return { title: document.metadata.title ?? "Untitled", images };
  } finally {
    document.dispose();
  }
}
```

## Inspecting a PDF's structure

### `GFXPDFScanner`

Low-level, read-only access to a document's objects, for tools that extract images, read form data or check structure. It is not a text extractor. It reads the objects and content streams, and interpreting them is up to you.

```text
new GFXPDFScanner(document: GFXPDFDocument, maximumDecodedBytes = 8 MiB)
```

The byte budget can be raised to 32 MiB. It bounds every object and stream the scanner returns.

| Member | Description |
| --- | --- |
| `document`, `maximumDecodedBytes` | The document and the budget. |
| `objects()` | Every indirect object as `{ reference, kind }`. |
| `object(reference, resolveReferences?)` | The object as a `GFXPDFObject` tree. With `resolveReferences` set, indirect references are replaced by their objects (a cycle throws). Traversal is limited to 20,000 nodes and 64 levels. |
| `decodedStream(reference, signal?)` | The decoded bytes of a stream. Supports the `FlateDecode` and `ASCIIHexDecode` filters, with PNG and TIFF predictors on 8-bit data. Other filters throw a `GFXPDFError` with code `"unsupported"`, and streams over the budget throw `"limit"`. |
| `contentOperators(reference, signal?)` | The operators of a content stream as `{ operator, operands }` with operands as source tokens. Up to 20,000 operators, 256 operands each. Inline images are not supported. |

`GFXPDFReference` is `{ objectNumber, generationNumber }`. `GFXPDFObject` is a union discriminated by `kind`: `"null"`, `"boolean"`, `"number"`, `"name"`, `"string"` (with `value` and raw `bytes`), `"reference"`, `"array"` (`items`), `"dictionary"` (`entries`) and `"stream"` (`dictionary` and `encodedBytes`). `GFXPDFContentOperator` is one operator with its operands.

```ts
import { GFXPDFDocument, GFXPDFScanner } from "@syndromatic/syncloudos/fx/graphics";

export async function countStreams(bytes: Uint8Array) {
  const document = await GFXPDFDocument.open(bytes);
  try {
    const scanner = new GFXPDFScanner(document);
    const streams = scanner.objects().filter((entry) => entry.kind === "stream");
    let decodedBytes = 0;
    for (const { reference } of streams.slice(0, 20)) {
      try {
        decodedBytes += (await scanner.decodedStream(reference)).byteLength;
      } catch {
        // Images use filters such as DCTDecode, which the scanner does not decode.
      }
    }
    return { streams: streams.length, decodedBytes };
  } finally {
    document.dispose();
  }
}
```

## Errors

### `GFXPDFError`

Every problem with PDF input or a PDF operation arrives as a `GFXPDFError` with a `code`:

| Code | Meaning |
| --- | --- |
| `"malformed"` | The file is not a valid PDF, or a page or object is corrupt. |
| `"encrypted"` | The file is encrypted in a way that cannot be handled. |
| `"password-required"` | The file needs a password and none was given. |
| `"incorrect-password"` | The password was wrong. |
| `"permission"` | An operation is not permitted. |
| `"limit"` | A size, count, time or work limit was exceeded. |
| `"disposed"` | The document, page or render was used after `dispose()`. |
| `"unsupported"` | The file uses a feature the framework does not implement. |

`GFXPDFErrorCode` is the union. Other failures use the standard errors: `TypeError` and `RangeError` for bad arguments and limits on a `GFXPDFContext`, `SecurityError` for a font that may not be embedded, and `AbortError` when a signal or a newer render cancels the work.

## Related

- [GraphicsFX](../graphics.md)
- [Drawing contexts](contexts.md), for the contexts that share this drawing vocabulary
- [TextFX](../text.md), for the glyph outlines and font subsets that searchable PDFs use
