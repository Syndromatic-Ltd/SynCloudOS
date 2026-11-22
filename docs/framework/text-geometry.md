# Text geometry

This page is for applications that draw their own text and need to know where carets, selections and characters are. There are two kinds of geometry. Browser layout reports `kind: "logical-dom"`, measures in CSS pixels, and has no shaped carets or exclusions. `NSEShapedTextLayoutAdapter` lays out attributed text with the TextFX shaper and framesetter, using fonts you resolve, and its provider reports `kind: "shaped"`. Your renderer uses the same frames for drawing and for caret, selection and position queries.

Import these contracts from `@syndromatic/syncloudos/nse/text`:

```ts
interface NSETextCoordinateSpace {
  readonly name: string;
  readonly units: "points" | "css-pixels" | "device-pixels";
}
interface NSETextGeometryRevision {
  readonly modelRevision: number;
  readonly layoutGeneration: number;
  readonly fontGeneration: number;
  readonly resourceGeneration: number;
  readonly containerGeneration: number;
  readonly ownerGeneration: number;
}
interface NSETextGeometryProvider {
  snapshot(): NSETextGeometrySnapshot;
  caret(position: NSETextGeometryPosition): NSETextCaretGeometry | null;
  selection(range: NSETextGeometryRange): readonly NSETextSelectionGeometry[];
  positionAt(point: NSETextGeometryPoint): NSETextGeometryPosition | null;
}
```

Every query carries the `flowId` and the whole `revision` object. A position adds a UTF-16 `offset` and `affinity: "upstream" | "downstream"`. A range adds `location` and `length`. A point adds `x`, `y`, a named `space`, a `transformRevision` and an optional `outside: "reject" | "nearest"`. Provider snapshots also report `kind`, `complete`, `current`, `textLength` and `units`. A caret query returns the container ID, a primary rectangle and, at a bidirectional boundary, a secondary rectangle. A selection query returns one or more rectangles for each shaped run or fragment.

For example, to query a current provider:

```ts
const geometry = result.provider.snapshot();
const caret = result.provider.caret({
  flowId: geometry.flowId, revision: geometry.revision,
  offset: session.getSnapshot().selection.focus, affinity: "downstream",
});
const rectangles = result.provider.selection({
  flowId: geometry.flowId, revision: geometry.revision,
  location: 0, length: 5,
});
```

A query returns `null` or an empty list if the flow is wrong, a generation is stale, the provider is disposed, the boundary is invalid or the point can't be mapped. By default, hit testing rejects points outside the shaped fragments, including points in an exclusion gap. Pass `outside: "nearest"` when a gesture should snap to the nearest position. Text offsets are always UTF-16; don't work them out from glyph counts, image sizes or byte lengths. Bidirectional carets, combining clusters and ligatures use TextFX's caret data.

Each container has its own named local space, such as `container:0`, and local rectangles and points from shaping have `transformRevision: 0`. Your renderer places each container and builds a presentation transform for where it is now. When you project a local result through that transform, tag it with the transform's current revision. Never re-tag a client point that was projected through an older transform as current.

```ts
const presentation = createNSETextPresentationTransforms({
  layoutSpace: caret.primary.space, revision: presentationGeneration,
  zoom: 1.5, scroll: { x: 0, y: 0 },
  clientOffset: { x: boxClientRect.x, y: boxClientRect.y },
  screenOffset: appScreenOffset, devicePixelRatio: window.devicePixelRatio,
});
const clientCaret = projectNSETextGeometryRect(
  { ...caret.primary, transformRevision: presentation.client.revision },
  presentation.client,
);
```

The factory returns `client` (the `css-client` space, in CSS pixels), `screen` (CSS pixels) and `canvas` (device pixels). Layout in points is scaled by 96/72 and then by zoom; layout in CSS pixels is scaled by zoom alone. Scroll is an unzoomed displacement in CSS pixels that is subtracted as given, offsets are in viewport CSS pixels, and the device pixel ratio applies only to `canvas`. If your `getBoundingClientRect()` result already includes scrolling, pass a zero scroll so it isn't subtracted twice. Zoom, scroll and pixel ratio never change the font size, text offsets or model revision.

`createNSETextGeometryTransform({ from, to, revision, matrix })`, `invertNSETextGeometryTransform(transform)`, `projectNSETextGeometryPoint(point, transform)` and `projectNSETextGeometryRect(rect, transform)` use GraphicsFX affine transforms. Projection checks the source space and the transform revision, and inversion rejects a singular matrix. Projecting a rectangle transforms all four corners and returns their axis-aligned bounds. Increase the presentation generation whenever the surface scrolls, resizes, zooms, moves or changes pixel ratio.

A typical surface that draws each container as an SVG box measures the box's current client bounds, increases the presentation generation on scroll, resize and zoom, inverts the box's transform to hit-test the pointer, and keeps focus on its stable native input host. The input client's transform maps the container that holds the caret. A query that can't be mapped through that transform stays pending; don't substitute a rectangle from another container. Screen offsets that come from the browser are provisional window offsets, not the measured position of the operating system's input-method window.

The projection API:

```ts
declare function projectNSEAttributedContentToTFX(
  content: NSEAttributedContent,
  options: NSEShapedTextProjectionOptions,
): Promise<NSEShapedTextProjection>;
// NSEShapedTextProjectionOptions: required resolveFont; optional attachments,
// direction, units, maximumWindowUnits, signal.
declare class NSEShapedTextLayoutAdapter {
  constructor(options?: NSEShapedTextLayoutAdapterOptions);
  layout(request: NSEShapedTextLayoutRequest): Promise<NSEShapedTextLayoutResult>;
  invalidate(): void;
  dispose(): void;
}
// Adapter options: isCurrent, subscribeFontReadiness, subscribeResourceReadiness,
// yieldToHost, maximumRowsPerSlice, signal (all optional).
// Request: flowId, revision, projection, containers (required);
// paths, fromCharacter, signal (optional).
```

Resolve font sizes in the units you chose. Projection keeps the font cascades, features, vertical text and ruby attributes your resolver supplies, and converts paragraph distances from CSS pixels when the units are points. Attachment metrics and images come from your own resources. Paint attributes such as colour stay in the source content, because the geometry adapter doesn't render styles.

TextFX shapes at most 65,536 UTF-16 units at a time, so long flows are split into windows of whole paragraphs. CRLF, CR, LF and paragraph separators all keep paragraph context, and a single paragraph longer than the limit is rejected. The boxes you supply are filled in flow order. The result includes the frames, an immutable provider, the consumed and overflow ranges, whether layout is complete, and for each container whether it was filled, made no progress or stayed empty. Insets, exclusions, paths and an empty last caret line all come from the TextFX frame. A request that starts part-way through the flow (`fromCharacter`) never gives a complete whole-flow provider. There's no pagination, page template, document anchor or wrap-policy API.

When a font or resource readiness notification arrives, the adapter clears its result and typesetter caches, retires its current providers, and needs new font and resource generations. A cancelled, superseded or disposed request never publishes a late result. Make `isCurrent` reflect the real lifetimes of your text owner and resources. The adapter disposes its own providers and caches, but never your fonts or assets. Identical requests for the current revision can share one result. Layout yields to the host after `maximumRowsPerSlice` rows (2 by default), but a row count alone can't guarantee an eight-millisecond slice.

Benchmark shaping with your application's own fonts, paragraph lengths and containers. Version 1 doesn't support paragraphs over the size limit, baseline shifts, line-height multiples other than 1, negative indents, shaped truncation or more than 64 exclusions per frame. The framework's tests check that the building blocks behave deterministically. They don't show that DOM and PDF output match, that operating system input methods and screen readers work, or how fast layout is on real devices or across whole paginated documents.
