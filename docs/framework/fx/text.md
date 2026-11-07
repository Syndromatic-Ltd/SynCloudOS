# TextFX

TextFX (`TFX`) is the web-native analogue of Core Text. It turns text and font data into shaped glyphs, breaks them into lines, fits lines into frames of any shape, and gives you the geometry to draw, measure and hit-test the result. Layout, measurement and drawing reuse shaped glyph data. Caret and selection queries must use the current model, font and container revisions.

The pipeline has five stages, and each has a class.

1. **Fonts.** `TFXFont` loads a font file and shapes text through HarfBuzz, which applies ligatures, marks, contextual forms and complex scripts as the font specifies.
2. **Attributed strings.** `TFXAttributedString` pairs text with runs of attributes: a font, a language, paragraph styling, OpenType features, inline objects and ruby annotations.
3. **Typesetting.** `TFXTypesetter` splits text into lines at Unicode break opportunities and produces `TFXLine` objects with positioned glyph runs, bidirectional reordering and vertical writing.
4. **Framesetting.** `TFXFramesetter` fills a rectangle or an arbitrary path with lines, flowing around exclusion rectangles, and returns a `TFXFrame`.
5. **Drawing.** `TFXGlyphDrawing` converts lines and frames to vector outlines and image placements that you fill onto any surface.

Everything is immutable. Fonts, attributed strings, paragraph styles, lines and frames never change after creation, so you can cache them freely and share them between components.

TextFX uses no ambient system fonts. You supply every font as bytes, making the shaping inputs explicit. Browser rasterization and native input behavior still require their own validation.

## Cooperating with NSE text and custom engines

The [NSE text system](../text-and-editing.md) supplies semantic content owners and per-view editing sessions. Its [shaped geometry adapter](../text-geometry.md) projects supported attributes into TextFX using caller-supplied fonts and attachment metrics. Logical DOM measurement advertises a different capability from shaped glyph geometry; it does not promise identical line breaks or PDF positions.

Applications supply the sequence of containers and exclusion geometry. TextFX reports consumed ranges and overflow; deciding where pages, columns or anchored figures belong remains application policy. The [custom document engines guide](../custom-document-engines.md) demonstrates this split without publishing a page engine.

For long flows, the NSE adapter uses paragraph-safe shaping windows and cancels superseded work. A paragraph exceeding the supported window bound is explicitly refused. Readiness and geometry queries carry model, owner, layout, font, resource and container generations; an unavailable or stale query cannot substitute an older measured result. Engine output captures a settled document revision and owns its font/resource lifetimes separately from the live view.

```ts
import { TFXAttributedString, TFXFont, TFXFontDescriptor } from "@syndromatic/syncloudos/fx/text";
```

## At a glance

| | |
| --- | --- |
| Prefix | `TFX` |
| Entry | `@syndromatic/syncloudos/fx/text` |
| Hook | `useTextLayout`, from `@syndromatic/syncloudos/sdk` |
| Permissions | None |
| Analogue | Core Text (`CTFont`, `CTFontDescriptor`, `CTFontCollection`, `CTTypesetter`, `CTFramesetter`, `CTFrame`, `CTLine`, `CTRunDelegate`, `CTRubyAnnotation`) |

## What the entry exports

| Area | Symbols |
| --- | --- |
| Fonts | `TFXFont`, `TFXFontShapeOptions`, `TFXFontDescriptor`, `TFXFontDescriptorOptions`, `TFXFontCollection` |
| Glyph data | `TFXGlyphInfo`, `TFXGlyphRun`, `TFXTextDirection` |
| Attributed text | `TFXAttributedString`, `TFXTextAttributes`, `TFXParagraphStyle`, `TFXParagraphStyleOptions`, `TFXTextTab`, `TFXTextTabOptions`, `TFXTextTabAlignment` |
| Typesetting | `TFXTypesetter`, `TFXLine` and its position, caret and truncation types |
| Framesetting | `TFXFramesetter`, `TFXFrameOptions`, `TFXFrame`, `TFXFrameLine`, `TFXFrameProgression`, `TFXTextContainer`, `TFXTextContainerInput` |
| Inline content | `TFXRunDelegate`, `TFXRunDelegateOptions`, `TFXRunDelegateAttachment`, `TFXRubyAnnotation`, `layoutTFXRuby`, `tfxRubyGlyphOffsets` and the ruby option types |
| Vertical text | `tfxVerticalOrientationForGrapheme`, `TFX_VERTICAL_ORIENTATION_UNICODE_VERSION`, `TFXVerticalOrientation`, `TFXVerticalPresentation`, `TFXTextCombine`, `TFXLineBreakPolicy` |
| Drawing | `TFXGlyphDrawing`, `TFXGlyphOutline`, `TFXAttachmentDrawing`, `TFXLineDrawing`, `TFXPDFTextRun` |
| Caching | `TFXLayoutCache`, `TFXLayoutCacheKey`, `TFXLayoutCacheDiagnostics`, `TFXLayoutPlanner` |
| Session client | `TFXFontClient`, `TFXFontRegistration` and the font and attachment readiness types |

## Fonts

### `TFXFontDescriptor`

Selects a font size and face from a font file. It is immutable.

```text
new TFXFontDescriptor({ size, family?, faceIndex?, variations? })
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `number` | required | The font size in points. Above 0 and at most 16,384. |
| `family` | `string \| null` | `null` | A family name to use when the font file carries none. |
| `faceIndex` | `number` | 0 | The face to load from a font collection file. A non-negative integer. |
| `variations` | `Record<string, number>` | none | Variable font axis values, keyed by four-character tags such as `"wght"` and `"wdth"`. |

The constructor throws `RangeError` for a bad size or index and `TypeError` for a malformed tag or a non-finite value. A variation outside the axis range in the font file is rejected later, when you load the font.

### `TFXFont`

A loaded, sized font that can shape text and produce glyph outlines. Create one with the asynchronous factory. The constructor is private.

```text
TFXFont.create(bytes: Uint8Array, descriptor: TFXFontDescriptor, signal?: AbortSignal): Promise<TFXFont>
```

`bytes` holds a TrueType, OpenType, WOFF or WOFF2 file of 12 bytes to 32 MiB. The font copies it. The first call loads the HarfBuzz engine, and later calls reuse it. The factory rejects with `RangeError` for a bad size, `TypeError` for an unreadable or unsupported face, and the signal's reason when aborted.

| Member | Type or signature | Description |
| --- | --- | --- |
| `descriptor` | `TFXFontDescriptor` | The size, face and variations. |
| `familyName` | `string` | The family name from the font's name table, falling back to the descriptor. |
| `unitsPerEm` | `number` | The design grid size of the font file. |
| `ascent`, `descent`, `leading` | `number` | Horizontal-line metrics scaled to the font size. Descent is positive. |
| `verticalAscent`, `verticalDescent`, `verticalLeading` | `number` | The same for vertical lines, from the font's `vhea` table, or half the size when the font has none. |
| `embedding` | `"allowed" \| "restricted" \| "unknown"` | The font's embedding permission from its OS/2 table. Respect `"restricted"` when you embed the font in exported documents. |
| `shape(text, options?)` | `TFXGlyphRun` | Shapes up to 65,536 UTF-16 units. Options: `direction` (`"ltr"`, `"rtl"`, `"ttb"` or `"btt"`), `language`, `script` and `features`. |
| `supportsCodePoint(codePoint)` | `boolean` | True when the font has a glyph for the code point. |
| `supportsText(text)` | `boolean` | True when the text shapes with no missing glyphs. Accepts 1 to 256 units. |
| `createPathForGlyph(id)` | `GFXPath` | The scaled outline of a glyph, in typographic coordinates where positive y points up. |
| `glyphPath(id)` | `string` | The same outline as an SVG path string. |
| `pdfFontSubset()` | `GFXPDFFontSubset` | An opaque handle for embedding a subset of this font in a [GraphicsFX](graphics.md) PDF. |
| `dispose()` | `void` | Releases the shaping engine's handles. Later calls throw. |

`features` maps four-character OpenType tags to unsigned integer values, for example `{ liga: 0 }` to turn ligatures off or `{ smcp: 1 }` for small capitals. A run accepts at most 128 features.

`TFXFontShapeOptions` names the options object. `TFXTextDirection` is `"ltr" | "rtl" | "ttb" | "btt"`.

### `TFXGlyphRun` and `TFXGlyphInfo`

`font.shape()` returns a `TFXGlyphRun`: the input `text`, the `direction`, the `glyphs` in visual order, and the total `advance` as `{ width, height }`.

Each `TFXGlyphInfo` has:

| Field | Description |
| --- | --- |
| `id` | The glyph index in the font. Zero means the glyph is missing. |
| `cluster` | The UTF-16 offset in the input that this glyph represents. Several glyphs can share a cluster, and one glyph can stand for several characters (a ligature). |
| `position` | Where the glyph's origin lies along the run, accumulated from earlier advances. |
| `advance` | How far the pen moves after this glyph. |
| `offset` | The adjustment for marks and kerning, applied when drawing but not to the pen. |
| `ligatureCaretOffsets` | Caret positions inside a ligature, from the font's caret table, when present. |

```ts
import { TFXFont, TFXFontDescriptor } from "@syndromatic/syncloudos/fx/text";

export async function measureWord(fontBytes: Uint8Array, word: string) {
  const font = await TFXFont.create(fontBytes, new TFXFontDescriptor({ size: 24 }));
  try {
    const run = font.shape(word, { language: "en", features: { kern: 1 } });
    return { width: run.advance.width, glyphs: run.glyphs.length, ascent: font.ascent, descent: font.descent };
  } finally {
    font.dispose();
  }
}
```

### `TFXFontCollection`

An ordered set of fonts that you supply, used as a fallback cascade when the primary font lacks a character. The constructor accepts up to 64 fonts and removes duplicates.

| Member | Description |
| --- | --- |
| `fonts` | The fonts, frozen, in order. |
| `fontForText(text, preferred?)` | Returns the first font that shapes the text with no missing glyphs, trying `preferred` first. Returns `null` when none does. Accepts at most 65,536 units. |
| `matchingFontDescriptors(query?)` | The descriptors of fonts whose family (case-insensitive) or size matches the query. |

Attach a collection to a run as `fallbackFonts` and the typesetter selects a font per cluster.

## Attributed strings

### `TFXAttributedString`

Text plus runs of attributes that cover the whole string, with no gaps.

```text
new TFXAttributedString(text: string, runs: readonly TFXTextAttributes[])
```

The text can hold at most 65,536 UTF-16 units. Runs must start at 0, be contiguous, be non-empty and end at the text length, and every boundary must fall on a Unicode boundary, never between the halves of a surrogate pair. The constructor throws `RangeError` when they do not, and `TypeError` for an invalid attribute. `text` and `runs` are frozen.

`TFXTextAttributes`:

| Field | Type | Description |
| --- | --- | --- |
| `start`, `end` | `number` | The UTF-16 range of the run. |
| `font` | `TFXFont` | The primary font. Required. |
| `language` | `string` | A BCP 47 language tag such as `"ja"` or `"ar-EG"`. Improves shaping, line breaking and font selection. |
| `paragraphStyle` | `TFXParagraphStyle` | Paragraph formatting. It takes effect from the run that starts each paragraph. |
| `fallbackFonts` | `TFXFontCollection` | Fonts to use for characters the primary font lacks. |
| `features` | `Record<string, number>` | OpenType feature settings for this run. |
| `verticalOrientation` | `"auto" \| "upright" \| "sideways"` | How characters rotate in vertical lines. `"auto"` follows Unicode's vertical orientation data. |
| `verticalForms` | `boolean` | The older switch for font-provided vertical forms. Use one of `verticalForms` and `verticalOrientation`, not both. |
| `textCombine` | `"none" \| "all" \| "digits2"` | Tate-chu-yoko: sets a run, or two-digit numbers, upright in a single cell of a vertical line. |
| `lineBreakPolicy` | `"auto" \| "strict" \| "normal" \| "loose"` | Japanese, Chinese and Korean line-breaking rules. `"auto"` uses the default Unicode breaker. |
| `runDelegate` | `TFXRunDelegate` | Replaces one `U+FFFC` character with an inline object. |
| `rubyAnnotation` | `TFXRubyAnnotation` | Adds ruby text to the run. |

Limits: at most 1,024 attachments (with at most 32 MiB of distinct image pixels) and 1,024 ruby annotations per string. An attachment run covers exactly one `U+FFFC` character and takes no fonts, features or orientation. A ruby base is a single font, at most 256 units, with no whitespace and no `textCombine`.

### `TFXParagraphStyle`

Paragraph-level layout. Every value is a length in layout units (points at the font's scale) from 0 to 1,048,576.

| Option | Default | Meaning |
| --- | --- | --- |
| `alignment` | `"natural"` | `"natural"` (start edge for the text direction), `"left"`, `"right"`, `"center"` or `"justified"`. Justification widens the spaces on every line except the last of a paragraph. |
| `headIndent` | 0 | Indent of every line after the first, from the start edge. |
| `firstLineHeadIndent` | `headIndent` | Indent of the first line of a paragraph. |
| `tailIndent` | 0 | Inset from the end edge. |
| `lineSpacing` | 0 | Extra space between lines. |
| `paragraphSpacingBefore`, `paragraphSpacing` | 0 | Space before and after a paragraph. |
| `tabStops` | 12 left tabs every 28 units | Up to 64 `TFXTextTab` values in strictly ascending order. |
| `defaultTabInterval` | 0 | Spacing of tabs beyond the last stop. |

Every option is exposed as a property with the same name. `TFXParagraphStyleOptions` is the options type.

### `TFXTextTab`

One tab stop.

```text
new TFXTextTab(alignment: "left" | "right" | "center" | "natural", location: number, options?: { columnTerminators?: string })
```

`location` is a distance from the start edge above 0 and at most 1,048,576. `columnTerminators` (up to 64 units) lists characters that end a column, such as `"."` to align decimals. The tab has the properties `textAlignment`, `location` and `options`. `TFXTextTabAlignment` and `TFXTextTabOptions` are the types.

```ts
import { TFXParagraphStyle, TFXTextTab } from "@syndromatic/syncloudos/fx/text";

// A price list: descriptions on the left, amounts aligned on the decimal point.
export const priceList = new TFXParagraphStyle({
  alignment: "left",
  headIndent: 12,
  paragraphSpacing: 6,
  tabStops: [new TFXTextTab("left", 160), new TFXTextTab("right", 260, { columnTerminators: "." })],
});
```

## Lines

### `TFXTypesetter`

Breaks an attributed string into lines.

```text
new TFXTypesetter(input: TFXAttributedString, direction?: "ltr" | "rtl", orientation?: "horizontal" | "vertical")
```

`direction` is the paragraph direction (default `"ltr"`). Vertical orientation lays lines out top to bottom, for vertical writing modes.

| Member | Description |
| --- | --- |
| `suggestLineBreak(start, width, signal?)` | Returns how many UTF-16 units starting at `start` fit in `width`, breaking at Unicode line break opportunities and never inside a ruby base. Returns 0 at the end of the text. |
| `createLine(start, length, signal?)` | Shapes `length` units from `start` into a `TFXLine`, including bidirectional reordering, font fallback, tabs, attachments and ruby. |

Both throw `RangeError` when `start` is not on a Unicode boundary, `length` is negative or `width` is not finite and non-negative. A line holds at most 1,024 tab characters, and ruby text cannot cross a script boundary.

### `TFXLine`

One shaped line. The typesetter creates lines and you read them.

| Member | Type | Description |
| --- | --- | --- |
| `start`, `end` | `number` | The UTF-16 range the line covers. |
| `runs` | `readonly TFXPositionedGlyphRun[]` | The positioned runs, in visual order. |
| `width` | `number` | The typographic width, including trailing whitespace. |
| `ascent`, `descent`, `leading` | `number` | Line metrics, the largest across its runs. |
| `trailingWhitespaceWidth` | `number` | The width of whitespace at the end, which you exclude when aligning. |
| `direction` | `"ltr" \| "rtl"` | The paragraph direction. |
| `orientation` | `"horizontal" \| "vertical"` | The line orientation. |
| `truncatedRange` | `{ location, length } \| null` | The omitted range when the line was truncated. |

| Method | Description |
| --- | --- |
| `stringIndexForPosition(x)` | The UTF-16 index nearest a distance along the line, for hit testing. |
| `offsetForStringIndex(index)` | `{ primary, secondary }` caret positions for an index. In mixed-direction text, the two positions differ at a direction boundary. |
| `textPositionForUTF16Offset(offset)` | `{ utf16Offset, graphemeBoundary, glyphIndices }`. Use `graphemeBoundary` to know whether a caret may stop there. |
| `enumerateCaretOffsets(visitor, signal?)` | Calls the visitor with every caret stop `{ offset, stringIndex, leadingEdge }`. Return `false` to stop early. |
| `createJustifiedLine(factor, width)` | A copy widened toward `width` by expanding spaces, where `factor` from 0 to 1 sets how much of the difference to distribute. Returns `null` when the line has no spaces to stretch. |
| `createTruncatedLine(width, type, token)` | A copy that fits `width`, omitting text at the `"head"`, `"middle"` or `"tail"` and inserting the `token` line (for example an ellipsis) in its place. Returns the line itself when it already fits, and `null` when even the token is too wide. A line can be truncated once. |

`TFXPositionedGlyphRun` describes one run: `kind` (`"glyph"`, `"tab"`, `"attachment"` or `"truncation-token"`), the source range `start` and `end`, the inline offset `x`, the `font`, the `shaped` glyph run, `delegate` for attachments and `ruby` for ruby runs. Rendering code reads these through `TFXGlyphDrawing` and rarely needs them directly.

`TFXPositionedRubyRun` describes the ruby text of a run with its `position`, `text`, `font`, `shaped` glyphs, `scale`, offsets (`inlineOffset`, `crossOffset`, `baseInlineOffset`), extents (`crossMin`, `crossMax`, `width`, `cellWidth`) and `glyphInlineOffsets`.

The remaining types: `TFXLineStringRange` (`location`, `length`), `TFXLineCaretOffsets` (`primary`, `secondary`), `TFXLineCaretOffset`, `TFXLineCaretVisitor`, `TFXLineTextPosition`, `TFXLineTruncationType` and `TFXPositionedGlyphRunKind`.

```ts
import {
  TFXAttributedString,
  TFXFont,
  TFXFontDescriptor,
  TFXTypesetter,
} from "@syndromatic/syncloudos/fx/text";

export async function wrapAndTruncate(fontBytes: Uint8Array, message: string, width: number) {
  const font = await TFXFont.create(fontBytes, new TFXFontDescriptor({ size: 16 }));
  const text = new TFXAttributedString(message, [{ start: 0, end: message.length, font }]);
  const typesetter = new TFXTypesetter(text);

  // Wrap into lines.
  const lines = [];
  for (let start = 0; start < message.length; ) {
    const count = typesetter.suggestLineBreak(start, width);
    if (count === 0) break;
    lines.push(typesetter.createLine(start, count));
    start += count;
  }

  // Or fit the whole message on one line with an ellipsis.
  const ellipsisText = new TFXAttributedString("…", [{ start: 0, end: 1, font }]);
  const token = new TFXTypesetter(ellipsisText).createLine(0, 1);
  const single = typesetter.createLine(0, message.length).createTruncatedLine(width, "tail", token);

  return { lines: lines.length, truncatedWidth: single?.width ?? null };
}
```

### Caret movement and hit testing

A text editor needs three operations. `stringIndexForPosition` maps a click to an index. `offsetForStringIndex` maps an index to where the caret is drawn. `enumerateCaretOffsets` lists every position the caret can occupy, in visual order, so arrow keys move as the user expects in right-to-left and mixed text.

```ts
import type { TFXLine } from "@syndromatic/syncloudos/fx/text";

export function caretStops(line: TFXLine) {
  const stops: Array<{ x: number; index: number }> = [];
  line.enumerateCaretOffsets((caret) => {
    stops.push({ x: caret.offset, index: caret.stringIndex });
  });
  return stops;
}

export function clickToIndex(line: TFXLine, x: number, lineOriginX: number) {
  return line.stringIndexForPosition(x - lineOriginX);
}
```

## Frames

### `TFXTextContainer`

A description of a region that text flows into. It is immutable and validates plain data.

```text
new TFXTextContainer({ size, insets?, maximumLines?, truncation?, writingMode?, flowOrder?, exclusionRects? })
```

| Field | Default | Meaning |
| --- | --- | --- |
| `size` | required | `{ width, height }`, each from 0 to 1,000,000. |
| `insets` | 0 on every side | `{ blockStart, inlineEnd, blockEnd, inlineStart }`. The total per axis cannot exceed the size. |
| `maximumLines` | 10,000 | An integer from 1 to 10,000. |
| `truncation` | `"none"` | `"none"`, `"head"`, `"middle"` or `"tail"`, applied where the container ends the text. |
| `writingMode` | `"horizontal-tb"` | `"horizontal-tb"`, `"vertical-rl"` or `"vertical-lr"`. |
| `flowOrder` | 0 | An integer that orders containers in a multi-container flow. Ties keep array order. |
| `exclusionRects` | none | Up to 1,024 rectangles that text avoids. |

The container is the description that layout services accept, such as the session client's `layout()` and `TFXLayoutPlanner`. `TFXTextContainerInput` is the constructor argument type. To lay out directly with `TFXFramesetter`, you pass bounds or a path.

### `TFXFramesetter`

Fills a shape with lines.

```text
new TFXFramesetter(input: TFXAttributedString, direction?: "ltr" | "rtl")
framesetter.createFrame(options: TFXFrameOptions): TFXFrame
```

`TFXFrameOptions` needs exactly one of `bounds` or `path`:

| Option | Description |
| --- | --- |
| `bounds` | A `GFXRect` for rectangular text. |
| `path` | A `GFXPath` for text that follows a shape, with `pathFillRule` (`"nonzero"` or `"evenodd"`). The path must have a non-empty area. |
| `start` | The UTF-16 index at which to begin, so you can continue text in a second frame. Must be a Unicode boundary. |
| `lineSpacing` | Extra space between lines, in addition to the paragraph styles. |
| `exclusions` | Up to 64 rectangles that text flows around. |
| `progression` | `"topToBottom"` (default) for horizontal lines, and `"rightToLeft"` or `"leftToRight"` for vertical lines that stack across the frame. |
| `signal` | An `AbortSignal`. |

The framesetter honours paragraph styles for indents, spacing, alignment and justification, and it shrinks each line to the width that remains after paths and exclusions. It stops when the next line no longer fits, and the frame's `visibleRange.end` tells you where. A frame is limited to 4,096 rows or columns of work and throws `RangeError` beyond that.

### `TFXFrame`

| Member | Description |
| --- | --- |
| `bounds`, `path`, `pathFillRule` | The shape you asked for. |
| `lines` | `TFXFrameLine[]`, each with an `origin` (the baseline start point) and its `line`. |
| `visibleRange` | `{ start, end }`, the UTF-16 range that fit. |
| `progression` | The line progression used. |
| `stringIndexForPosition(point)` | Hit testing for a point in frame coordinates. It finds the nearest line and then the nearest index. Throws `RangeError` for non-finite coordinates. |

To flow text across several frames, create the first, then start the next at `frame.visibleRange.end`.

```ts
import {
  TFXAttributedString,
  TFXFont,
  TFXFontDescriptor,
  TFXFramesetter,
  TFXParagraphStyle,
} from "@syndromatic/syncloudos/fx/text";

export async function twoColumns(fontBytes: Uint8Array, story: string) {
  const font = await TFXFont.create(fontBytes, new TFXFontDescriptor({ size: 14 }));
  const paragraph = new TFXParagraphStyle({ alignment: "justified", paragraphSpacing: 8 });
  const text = new TFXAttributedString(story, [{ start: 0, end: story.length, font, paragraphStyle: paragraph }]);
  const framesetter = new TFXFramesetter(text);

  const left = framesetter.createFrame({ bounds: { x: 0, y: 0, width: 240, height: 400 } });
  const right = framesetter.createFrame({
    bounds: { x: 264, y: 0, width: 240, height: 400 },
    start: left.visibleRange.end,
  });

  return { leftEnd: left.visibleRange.end, rightEnd: right.visibleRange.end, complete: right.visibleRange.end === story.length };
}
```

## Inline content

### `TFXRunDelegate`

Reserves room in a line for an object such as an image or an emoji sprite, so text flows around it. The object replaces a single `U+FFFC` character in the attributed string.

```text
new TFXRunDelegate({ width, ascent, descent, attachment: { image: GFXImage, accessibilityLabel: string } })
```

The metrics are each from 0 to 32,768. The image must be an owned [GraphicsFX](graphics.md) `GFXImage` of at most 8 MiB. The accessibility label is required, non-blank and at most 4,096 units, because the object stands in for text that a screen reader would otherwise miss. Layout never runs application code. The delegate is a snapshot of these values, and the properties `width`, `ascent`, `descent` and `attachment` read them back.

In an application, `useTextLayout().resolveRunDelegate(request)` builds a delegate from an image that belongs to one of your documents, and the client reports when the image becomes ready.

### Ruby annotations

Ruby text is a small annotation set beside base text, common in Japanese and Chinese, for readings or glosses.

`TFXRubyAnnotation` holds the text and its placement.

```text
new TFXRubyAnnotation({ text, alignment?, overhang?, sizeFactor?, collisionPolicy? })
```

| Option | Default | Meaning |
| --- | --- | --- |
| `text` | required | An object keyed by position with a string or `{ text, font?, language?, features? }` for each. At least one position. Each text has 1 to 256 inline units. |
| `alignment` | `"auto"` | `"auto"`, `"start"`, `"center"`, `"end"`, `"distributeLetter"`, `"distributeSpace"` or `"lineEdge"`. |
| `overhang` | `"auto"` | Whether ruby may extend past the base at the `"start"` or `"end"`, or `"none"`. |
| `sizeFactor` | 0.5 | Ruby size relative to the base, above 0 and at most 1. |
| `collisionPolicy` | `"allow"` (`"lineEdge"` when the alignment is `"lineEdge"`) | `"allow"`, `"lineEdge"` or `"reserve"`, controlling how ruby that overhangs interacts with neighbours. |

Positions are `"before"` and `"after"` (above and below in horizontal text, and to the right and left in vertical), `"interCharacter"` (between characters) and `"inline"` (following the base). The annotation offers `textForPosition(position)` and `contentForPosition(position)`.

A ruby base is atomic: a line never breaks inside it, and ruby text cannot cross a script boundary.

`layoutTFXRuby(input)` is the geometry the typesetter uses, exposed for renderers that place ruby themselves. It takes the position, widths, alignment, overhang, collision policy, direction, orientation and font metrics of the base and the ruby, and returns the offsets and extents (`baseInlineOffset`, `cellWidth`, `inlineOffset`, `crossOffset`, `crossMin`, `crossMax`, `width`). `tfxRubyGlyphOffsets(count, naturalWidth, targetWidth, alignment)` returns the per-glyph spacing that distributes ruby over a wider base.

```ts
import {
  TFXAttributedString,
  TFXFont,
  TFXFontDescriptor,
  TFXRubyAnnotation,
  TFXTypesetter,
} from "@syndromatic/syncloudos/fx/text";

export async function furigana(fontBytes: Uint8Array) {
  const font = await TFXFont.create(fontBytes, new TFXFontDescriptor({ size: 24 }));
  const text = "漢字を読む";
  const annotated = new TFXAttributedString(text, [
    { start: 0, end: 2, font, language: "ja", rubyAnnotation: new TFXRubyAnnotation({ text: { before: "かんじ" } }) },
    { start: 2, end: 5, font, language: "ja" },
  ]);
  return new TFXTypesetter(annotated).createLine(0, text.length);
}
```

## Vertical text

Vertical writing lays lines in columns. Choose it by giving the typesetter the `"vertical"` orientation, or a framesetter frame a `rightToLeft` or `leftToRight` progression.

Within a vertical line, each character is either upright or rotated sideways. `tfxVerticalOrientationForGrapheme(grapheme)` returns `"upright"` or `"sideways"` for one grapheme according to a pinned subset of the Unicode Vertical Orientation data (`TFX_VERTICAL_ORIENTATION_UNICODE_VERSION`, currently `"17.0.0"`). Han, kana, Hangul and Bopomofo characters and common symbols stand upright, and Latin text rotates. The table is pinned so a browser update cannot silently change your layout. The font still supplies vertical glyph forms through its `vert` and `vrt2` features.

Set `verticalOrientation` on a run to override the default for its text, and `textCombine` to set short runs such as two-digit numbers upright in one cell.

`TFXVerticalOrientation` (`"auto" | "upright" | "sideways"`), `TFXVerticalPresentation` (`"upright" | "sideways" | "combined"`), `TFXTextCombine` and `TFXLineBreakPolicy` are the option types.

## Drawing

### `TFXGlyphDrawing`

Static methods that convert already-shaped lines and frames into things you can draw. They never shape text a second time. Each accepts an optional origin and `AbortSignal`, and each limits its work: 10,000 glyphs per call and 100,000 outline commands.

| Method | Returns | Description |
| --- | --- | --- |
| `drawingsForLine(line, origin?, signal?)` | `TFXLineDrawing[]` | Every glyph outline and attachment in draw order. |
| `pathsForLine(line, origin?, signal?)` | `TFXGlyphOutline[]` | Only the glyph outlines. |
| `attachmentsForLine(line, origin?, signal?)` | `TFXAttachmentDrawing[]` | Only the images. |
| `pdfTextRunsForLine(line, origin?, signal?)` | `TFXPDFTextRun[]` | Runs for a [GraphicsFX](graphics.md) PDF, in logical order, so the exported text is selectable and searchable. Up to 4,096 runs. |
| `drawLine(destination, line, origin?, signal?)` | `void` | Fills each outline and draws each image on a destination. |
| `drawingsForFrame(frame, signal?)`, `pathsForFrame`, `attachmentsForFrame` | as above | The same for a whole frame. |
| `drawFrame(destination, frame, signal?)` | `void` | Draws a frame. |

A destination is any object with `fill(path: GFXPath)`, plus `drawImage(image, rect)` when the text has attachments. `drawLine` leaves the destination's fill style and transform as you set them, so set the colour first.

`TFXGlyphOutline` has `glyphId`, `kind` (`"glyph"`, `"truncation-token"` or `"ruby"`), `stringIndex` (the source index, useful for selection highlights), `path` (a `GFXPath`), `embedding` (the font's permission) and `rubyPosition`. `TFXAttachmentDrawing` has `kind`, `stringIndex`, `image`, `rect` and `accessibilityLabel`. `TFXLineDrawing` is the union of the two. Vector outlines do not by themselves make PDF text selectable or embed a font. Use `pdfTextRunsForLine` and the font's `pdfFontSubset()` for that.

```ts
import { TFXGlyphDrawing, type TFXFrame } from "@syndromatic/syncloudos/fx/text";

export function paintFrame(context: CanvasRenderingContext2D, frame: TFXFrame) {
  context.fillStyle = "#222";
  const destination = {
    fill(path: { commands: readonly { kind: string; point?: { x: number; y: number }; control?: { x: number; y: number }; control1?: { x: number; y: number }; control2?: { x: number; y: number } }[] }) {
      const outline = new Path2D();
      for (const command of path.commands) {
        if (command.kind === "move" && command.point) outline.moveTo(command.point.x, command.point.y);
        else if (command.kind === "line" && command.point) outline.lineTo(command.point.x, command.point.y);
        else if (command.kind === "quad" && command.control && command.point) outline.quadraticCurveTo(command.control.x, command.control.y, command.point.x, command.point.y);
        else if (command.kind === "curve" && command.control1 && command.control2 && command.point) outline.bezierCurveTo(command.control1.x, command.control1.y, command.control2.x, command.control2.y, command.point.x, command.point.y);
        else if (command.kind === "close") outline.closePath();
      }
      context.fill(outline);
    },
  };
  TFXGlyphDrawing.drawFrame(destination, frame);
}
```

## Caching layout

### `TFXLayoutCache`

A bounded least-recently-used cache for layout results, for code that lays out the same text repeatedly, such as a scrolling list.

```text
new TFXLayoutCache({ maximumBytes?, maximumEntries? })
```

| Option | Default | Range |
| --- | --- | --- |
| `maximumBytes` | 4 MiB | 256 bytes to 64 MiB |
| `maximumEntries` | 64 | 1 to 1,024 |

| Member | Description |
| --- | --- |
| `lookup(key)` | Returns a stored result or `null`. |
| `store(key, result)` | Stores a result, evicting older entries when over budget, and returns it. |
| `clear()` | Removes every entry. |
| `diagnostics()` | `{ entryCount, liveBytes, hitCount, missCount, evictionCount, disposed }`. |
| `dispose()` | Releases the cache. Later `store` calls throw `InvalidStateError`. |

The key, `TFXLayoutCacheKey`, holds everything that affects the result: `revision`, `attributedRevision`, `fontGeneration`, `text`, `font`, `locale`, `direction` and `containers`. Bump `fontGeneration` when fonts change, which is what the session client's font readiness generation supplies, and old entries stop matching.

### `TFXLayoutPlanner`

Plans logical text fragments through a layout service. It exists for hosts and adapters that run layout off the main thread, and it exposes no glyph identities.

```text
new TFXLayoutPlanner({ service })
planner.plan(input, containers): Promise<TFXTextLayoutResult>
```

`plan` snapshots the containers (at least one and at most 64 `TFXTextContainer` values) and hands them to the service. Applications reach this through the session client's `layout()`.

## In a SynWare

`useTextLayout()` returns a client that owns fonts for your application and reports when they are ready. It is a `TFXFontClient` with a few extras.

| Member | Description |
| --- | --- |
| `registerFont(bytes, descriptor, signal?)` | Registers font bytes and resolves with a `TFXFontRegistration`: `id`, `familyName`, `format` (`"truetype"`, `"opentype"`, `"woff"` or `"woff2"`), an independent `font` instance and `dispose()`. Disposing one registration never revokes another. |
| `registerFontResource(relativeBundlePath, descriptor, signal?)` | Loads a font that ships inside your SynWare's `Resources` folder. The host resolves the path within your bundle only. |
| `fontReadinessGeneration` | A counter that increases when a font becomes ready or is released. |
| `subscribeFontReadiness(listener)` | Calls the listener with `{ registrationId, familyName, generation, state }` where `state` is `"ready"` or `"released"`. Returns an unsubscribe function. Redraw text when it fires. |
| `resolveRunDelegate(request, signal?)` | Builds a `TFXRunDelegate` from a document image. |
| `attachmentReadinessGeneration`, `subscribeAttachmentReadiness(listener)` | The same readiness protocol for attachments. |
| `segment(input)`, `layout(input, containers?)`, `measure(input)` | Text segmentation, layout into containers and measurement. Used by NSE's `NSELayoutManager`. |

`TFXFontRegistration`, `TFXFontReadinessChange`, `TFXFontFaceRegistration`, `TFXFontFaceRegistrationRequest`, `TFXFontResourceMimeType`, `TFXPackagedFontResource`, `TFXPackagedFontResourceLoader`, `TFXRunDelegateRequest` and `TFXRunDelegateReadinessChange` are the types of these requests and events. The host implements the loader and face-registration types.

```tsx
import { useEffect, useState } from "react";
import { TFXFontDescriptor, type TFXFontRegistration } from "@syndromatic/syncloudos/fx/text";
import { useTextLayout } from "@syndromatic/syncloudos/sdk";

export function useBundledFont(path: string, size: number) {
  const textLayout = useTextLayout();
  const [registration, setRegistration] = useState<TFXFontRegistration | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let loaded: TFXFontRegistration | undefined;
    textLayout
      .registerFontResource(path, new TFXFontDescriptor({ size }), controller.signal)
      .then((result) => {
        loaded = result;
        setRegistration(result);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      loaded?.dispose();
    };
  }, [textLayout, path, size]);

  return registration?.font ?? null;
}
```

## Errors

| Situation | Error |
| --- | --- |
| A value outside its range, an index off a Unicode boundary, a limit exceeded | `RangeError` |
| A wrong type, an unsupported font face, an unknown option value | `TypeError` |
| Ruby across a script or bidirectional boundary | `DOMException` named `NotSupportedError` |
| Truncating a line twice, using a disposed cache | `DOMException` named `InvalidStateError` |
| An aborted signal | The signal's reason, usually `AbortError` |
| Using a disposed font | `Error` |

## Related

- [FX overview](README.md)
- [GraphicsFX](graphics.md), for the paths, images and PDF output that text produces and consumes
- [Text and editing](../text-and-editing.md), for NSE's editor and layout manager built on TextFX
- [SynWare SDK](../synware-sdk.md)
