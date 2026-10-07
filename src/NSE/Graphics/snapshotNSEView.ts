/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { SnapdomPlugin } from "@zumer/snapdom";

/** Options for {@link snapshotNSEView}. */
export interface NSEViewSnapshotOptions {
  readonly signal?: AbortSignal;
  /** Pixels per CSS pixel; defaults to the display's, capped at 2. */
  readonly scale?: number;
  /** Paints behind transparent areas; defaults to transparent. */
  readonly backgroundColour?: string;
  /**
   * The part of the view to draw, in CSS pixels as it shows on screen, from its top-left corner, as
   * `cacheDisplay(in:to:)`'s rect: the top of a page for a card, one cell of a grid.
   * Omitted, the whole view is drawn. Clamped to the view's bounds.
   */
  readonly region?: Readonly<{ x: number; y: number; width: number; height: number }>;
  /**
   * Selectors for parts of the view to leave out, keeping their space: a window drawn without
   * the page that is about to lift off it. Drawn as if `visibility: hidden`.
   */
  readonly exclude?: readonly string[];
  /**
   * Draws the view itself without its clip path, mask, filter or opacity, as though it were
   * laid out plainly: a page whose corner is folded away, drawn whole. Its contents keep theirs.
   */
  readonly unclipped?: boolean;
  /**
   * Draws in the browser's idle time, a slice at a time, instead of all at once: slower to
   * finish, but it never holds up a frame. For drawing ahead while something animates.
   */
  readonly idle?: boolean;
}

/**
 * Draws a view the application owns into a PNG data URL, as `NSView.cacheDisplay(in:to:)`
 * does: a version card, a drag image, a thumbnail. It reads only the element given, which
 * must be in the document. Canvas content is left out. Host surfaces such as the homepage
 * remain the responsibility of their owning host.
 *
 * CSS `zoom` is retained. The root's placement transforms (including an entry animation)
 * are flattened; transforms inside the view remain part of its content. Screen regions
 * are mapped into that stable source box, so entry scaling cannot shrink the snapshot.
 */
export async function snapshotNSEView(element: Element, options: NSEViewSnapshotOptions = {}): Promise<string> {
  const { signal } = options;
  const { canvas, width, height, layoutWidth, layoutHeight, zoom } = await renderNSEViewSnapshot(element, options);
  signal?.throwIfAborted();
  const region = options.region;
  if (!region) return canvas.toDataURL("image/png");
  const x = Math.min(Math.max(0, region.x), width);
  const y = Math.min(Math.max(0, region.y), height);
  const cropWidth = Math.max(0, Math.min(region.width, width - x));
  const cropHeight = Math.max(0, Math.min(region.height, height - y));
  const scaleX = canvas.width / (width || layoutWidth * zoom);
  const scaleY = canvas.height / (height || layoutHeight * zoom);
  const pixels = { x: Math.round(x * scaleX), y: Math.round(y * scaleY), width: Math.round(cropWidth * scaleX), height: Math.round(cropHeight * scaleY) };
  if (pixels.x === 0 && pixels.y === 0 && pixels.width >= canvas.width && pixels.height >= canvas.height) return canvas.toDataURL("image/png");
  const cropped = element.ownerDocument.createElement("canvas");
  cropped.width = Math.max(1, Math.min(pixels.width, canvas.width - pixels.x));
  cropped.height = Math.max(1, Math.min(pixels.height, canvas.height - pixels.y));
  const context = cropped.getContext("2d");
  if (!context) return canvas.toDataURL("image/png");
  context.drawImage(canvas, pixels.x, pixels.y, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return cropped.toDataURL("image/png");
}

/** The drawn view and the boxes it was measured with. Framework-internal: callers that
 * upload the pixels (a page curl's texture) skip the PNG round trip. */
export interface NSEViewSnapshotRender {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly layoutWidth: number;
  readonly layoutHeight: number;
  readonly zoom: number;
}

function abortBetweenStages(signal: AbortSignal) {
  const check = () => signal.throwIfAborted();
  return { name: "nse-abort", afterClone: check, beforeRender: check, afterRender: check, beforeExport: check };
}

/** Draws a view as {@link snapshotNSEView} does, returning the canvas instead of a PNG. */
export async function renderNSEViewSnapshot(element: Element, options: NSEViewSnapshotOptions = {}): Promise<NSEViewSnapshotRender> {
  const { signal } = options;
  signal?.throwIfAborted();
  if (!element.isConnected) throw new TypeError("snapshotNSEView needs an element that is in the document.");
  const view = element.ownerDocument.defaultView;
  const scale = options.scale ?? Math.min(view?.devicePixelRatio || 1, 2);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 4) throw new RangeError("snapshotNSEView scale must be greater than 0 and at most 4.");
  const region = options.region;
  if (region && ![region.x, region.y, region.width, region.height].every(Number.isFinite)) throw new RangeError("snapshotNSEView region must be finite.");
  if (region && (region.width <= 0 || region.height <= 0)) throw new RangeError("snapshotNSEView region must have a size.");
  const exclude = options.exclude ? [...options.exclude] : [];
  for (const selector of exclude) {
    if (typeof selector !== "string" || !selector.trim()) throw new TypeError("snapshotNSEView exclude needs selectors.");
    // Throws a SyntaxError for a selector the engine cannot parse, before any drawing starts.
    element.ownerDocument.createDocumentFragment().querySelector(selector);
  }
  const bounds = element.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  let zoom = 1;
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    const factor = Number.parseFloat(view?.getComputedStyle(ancestor).zoom ?? "1");
    if (Number.isFinite(factor) && factor > 0) zoom *= factor;
  }
  const style = view?.getComputedStyle(element);
  const layoutWidth = Math.max(1, (element as HTMLElement).offsetWidth || Number.parseFloat(style?.width ?? "") || width / zoom || 1);
  const layoutHeight = Math.max(1, (element as HTMLElement).offsetHeight || Number.parseFloat(style?.height ?? "") || height / zoom || 1);
  const outputWidth = Math.max(1, Math.round(layoutWidth * zoom * scale)) / scale;
  const outputHeight = Math.max(1, Math.round(layoutHeight * zoom * scale)) / scale;
  const sourceBox: SnapdomPlugin = {
    name: "nse-view-source-box",
    beforeRender({ clone }) {
      if (!clone) return;
      // Change only the detached root. In particular, keep the scaled page inside a card.
      const properties: Record<string, string> = {
        zoom: "1", transform: "none", translate: "none", rotate: "none", scale: "none",
        animation: "none", transition: "none", position: "relative", inset: "auto", margin: "0",
        "box-sizing": "border-box", width: `${layoutWidth}px`, height: `${layoutHeight}px`,
        ...(options.unclipped ? { "clip-path": "none", mask: "none", "-webkit-mask": "none", filter: "none", opacity: "1" } : {}),
      };
      for (const [property, value] of Object.entries(properties)) clone.style.setProperty(property, value, "important");
    },
    afterRender(context) {
      if (!context.svgString) return;
      // SnapDOM still derives its SVG viewport and foreignObject origin from the live root's
      // transform. Reframe both after serialization, without changing the live document.
      const svgDocument = new DOMParser().parseFromString(context.svgString, "image/svg+xml");
      const svg = svgDocument.documentElement;
      const content = svg.querySelector(":scope > foreignObject");
      if (!content) throw new Error("snapshotNSEView renderer did not provide a source box.");
      svg.setAttribute("width", String(outputWidth));
      svg.setAttribute("height", String(outputHeight));
      svg.setAttribute("viewBox", `0 0 ${layoutWidth} ${layoutHeight}`);
      svg.setAttribute("preserveAspectRatio", "none");
      content.setAttribute("x", "0");
      content.setAttribute("y", "0");
      content.setAttribute("width", String(layoutWidth));
      content.setAttribute("height", String(layoutHeight));
      context.svgString = new XMLSerializer().serializeToString(svg);
      context.dataURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(context.svgString)}`;
    },
  };
  const { snapdom } = await import("@zumer/snapdom");
  signal?.throwIfAborted();
  const canvas = await snapdom.toCanvas(element as HTMLElement, {
    backgroundColor: options.backgroundColour ?? "transparent",
    cache: "soft",
    dpr: 1,
    embedFonts: true,
    fast: !options.idle,
    scale,
    width: outputWidth,
    height: outputHeight,
    outerShadows: false,
    // Checked between snapdom's stages too, so an abandoned drawing stops
    // before its costliest steps (inlining styles, rasterising) instead of after.
    plugins: signal ? [sourceBox, abortBetweenStages(signal)] : [sourceBox],
    filter: (node) => node === element || node.tagName !== "CANVAS",
    filterMode: "remove",
    ...(exclude.length ? { exclude, excludeMode: "hide" as const } : {}),
  });
  signal?.throwIfAborted();
  return { canvas, width, height, layoutWidth, layoutHeight, zoom };
}
