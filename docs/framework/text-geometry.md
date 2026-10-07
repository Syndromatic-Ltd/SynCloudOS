# Text geometry

Logical DOM measurement and shaped geometry are separate capabilities. Browser logical layout reports `kind: "logical-dom"`, CSS-pixel units, no shaped carets and no exclusion support. `NSEShapedTextLayoutAdapter` projects caller-resolved attributed text through the existing TextFX shaper and framesetter. Its provider reports `kind: "shaped"`. A renderer consumes the same retained frames for drawing, caret, selection and position queries.

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

Every query carries `flowId` and the complete `revision` object. Positions add UTF-16 `offset` and `affinity: "upstream" | "downstream"`. Ranges add `location` and `length`. Points add `x`, `y`, named `space`, `transformRevision` and optional `outside: "reject" | "nearest"`. Provider snapshots also report `kind`, `complete`, `current`, `textLength` and semantic `units`. Carets return their container ID, primary rectangle and optional secondary bidi rectangle. Selection returns one or more spatial rectangles per shaped run/fragment.

For example, query an existing current provider:

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

Null/empty answers are deliberate for a wrong flow, stale generation, disposed provider, invalid boundary or unmapped point. Default hit testing rejects points outside shaped fragments, including an exclusion gap. Request `outside: "nearest"` explicitly for an application gesture that should snap. Text offsets remain UTF-16; do not infer them from glyph count, raster size or byte length. Bidi carets, combining clusters and ligatures use existing TextFX caret data.

Containers use independently named local spaces such as `container:0`. Shaped local rectangles/points have `transformRevision: 0`. A renderer places each container and constructs a current presentation transform. When using a local result in that transform, tag it with the transform's current revision; never retag an already-transformed stale client point as current.

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

The presentation factory returns `client` in `css-client`/CSS pixels, `screen` in CSS pixels and `canvas` in device pixels. Point-valued layout scales by 96/72 before zoom; CSS-valued layout scales by zoom. Scroll is an unzoomed CSS-pixel displacement subtracted directly, offsets are viewport CSS pixels, and DPR applies only to the canvas result. If `getBoundingClientRect()` already includes scrolling, pass zero scroll to avoid subtracting it twice. Zoom, scroll and DPR do not change semantic font size, text offsets or canonical revision.

`createNSETextGeometryTransform({ from, to, revision, matrix })`, `invertNSETextGeometryTransform(transform)`, `projectNSETextGeometryPoint(point, transform)` and `projectNSETextGeometryRect(rect, transform)` use GraphicsFX affine operations. Projection checks source space and transform revision; inversion rejects a singular matrix. Rectangle projection transforms all four corners to an axis-aligned bound. Keep the presentation generation current for scrolling, resize, zoom, surface movement and DPR changes.

The example measures each SVG box's current client bounds, increments the presentation generation on scroll/resize/zoom, inverts that box's transform for pointer hit testing and focuses its stable native host. Input-client transforms map the selected caret container. Queries that cannot map through that supplied transform remain pending; do not substitute a rectangle from a different container. Browser-provided screen offsets in the example are provisional window offsets, not measured OS IME placement.

Projection API:

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

Resolve font sizes in the selected semantic units. Projection preserves font cascades/features/vertical/ruby attributes supplied by the resolver; paragraph distances convert from v1 CSS pixels when units are points. Attachment metrics/images come from the caller's resource authority. Semantic paint attributes remain in the source; the geometry adapter is not a complete style renderer.

Long flows use whole-paragraph windows around the TextFX 65536-unit per-input bound. CRLF, CR, LF and paragraph separators preserve paragraph context; a single oversized paragraph is rejected explicitly. App-supplied boxes are consumed in flow order; results include frames, immutable provider, consumed/overflow ranges, completeness and per-container consumed/no-progress/empty outcomes. Insets, exclusions, paths and empty terminal caret lines use the existing frame primitive. A suffix request is incomplete as a whole-flow provider. No paginator, page-master, document anchor or wrap-policy API is introduced.

Readiness notifications invalidate result/type-setter caches, revoke current providers and require new font/resource generations. Cancellation, superseded requests and disposal fence asynchronous publication. `isCurrent` must reflect the app's actual owner and resource lifetimes. The adapter disposes its providers and caches; it does not dispose caller-owned fonts/assets. Identical current requests can reuse one result. Work yields after bounded rows, but row counts alone do not guarantee an eight-millisecond slice.

Benchmark shaping with the actual fonts, paragraph lengths and supplied containers used by your application. Unsupported v1 cases include oversized individual paragraphs, baseline shifts, non-unit line-height multiples, negative indents, shaped truncation and more than 64 exclusions per frame. Tests establish deterministic primitive behavior; they do not establish DOM/PDF equality, OS IME/screen-reader acceptance, physical-device performance or complete-document pagination performance.
