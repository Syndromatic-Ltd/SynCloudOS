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

import type { CaptureContext, SnapdomOptions, SnapdomPlugin } from "@zumer/snapdom";
import { prepareRenderedCanvasCapture } from "../SynCloudOS/SynCloudOS";

export const notificationCubeTopFaceHeight = 104;

const notificationCanvasCaptureAttr = "data-syncloudos-notification-capture";
const notificationCaptureProxyAttr = "data-syncloudos-notification-capture-proxy";
const notificationSnapdomCaptureStorageKey = "SynCloudOS4:debug.notificationScreenCapture";
const notificationCaptureRootSelectors = [
  ".webspring-view",
  ".webspring-board"
];
/** System overlays no screen slice ever shows. */
export const screenSliceIgnoredSelectors: readonly string[] = Object.freeze([
  ".syncloudos-notification-layer",
  ".webspring-drag-proxy",
  ".syncloudos-startup-layer",
  ".syncloudos-login-gate",
  ".webspring-status-layer",
  ".webspring-quickswitch",
  ".webspring-launch-dim",
  ".webspring-folder-split"
]);
const notificationCaptureIgnoredSelectors: readonly string[] = Object.freeze([
  ...screenSliceIgnoredSelectors,
  ".webspring-edit-controls",
  ".webspring-board-controls"
]);
const notificationCaptureSurfaceSelectors = [
  ".webspring-material-stack",
  ".webspring-backdrop",
  ".webspring-board-material",
  ".webspring-board-journal"
];

export interface NotificationCanvasReplacement {
  id: string;
  dataUrl: string;
  /** CSS-pixel placement of the snapshot inside the canvas element's box. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  /** CSS-pixel size of the canvas element's box itself. */
  boxWidth: number;
  boxHeight: number;
}

export interface NotificationCaptureSource {
  canvas: HTMLCanvasElement;
  rect: DOMRect;
}

export interface NotificationCaptureProxy {
  element: HTMLElement;
  dispose: () => void;
}

export interface NotificationSnapdomCanvasCapture {
  toCanvas: (element: HTMLElement, options: SnapdomOptions) => Promise<HTMLCanvasElement>;
}

let notificationCaptureEngineWarmed = false;

/*
 * The banner's cube roll is gated on the screen-slice capture, and SnapDOM's
 * first capture pays a one-off font-embedding cost (~300ms) that it caches
 * globally afterwards. Warming at idle moves that cost off the first banner.
 */
export function warmNotificationCaptureEngine() {
  if (notificationCaptureEngineWarmed || typeof window === "undefined" || typeof document === "undefined") return;
  notificationCaptureEngineWarmed = true;
  const schedule: (callback: () => void) => void =
    typeof window.requestIdleCallback === "function"
      ? (callback) => window.requestIdleCallback(callback, { timeout: 4000 })
      : (callback) => window.setTimeout(callback, 1200);
  schedule(() => {
    void (async () => {
      try {
        const { snapdom } = await import("@zumer/snapdom");
        const probe = document.createElement("div");
        probe.textContent = "warm";
        probe.style.cssText = "position:fixed;left:-9999px;top:0;width:32px;height:16px;";
        document.body.appendChild(probe);
        try {
          await snapdom.toCanvas(probe, { cache: "auto", dpr: 1, embedFonts: true, fast: true, scale: 1 });
        } finally {
          probe.remove();
        }
      } catch {
        // Best-effort: a failed warm-up just means the first capture is slower.
      }
    })();
  });
}

export function shouldUseNotificationSnapdomCapture() {
  if (typeof window === "undefined") return false;
  try {
    const preference = window.localStorage.getItem(notificationSnapdomCaptureStorageKey);
    return preference !== "disabled" && preference !== "false" && preference !== "off";
  } catch {
    return true;
  }
}

export function shouldIgnoreNotificationCaptureElement(
  element: Element,
  ignoredSelectors: readonly string[] = notificationCaptureIgnoredSelectors
) {
  if (!(element instanceof HTMLElement)) return false;
  return ignoredSelectors.some((selector) => Boolean(element.closest(selector)));
}

function getNotificationCaptureRoot() {
  for (const selector of notificationCaptureRootSelectors) {
    const candidates = document.querySelectorAll<HTMLElement>(selector);
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return candidate;
    }
  }
  return document.body;
}

function rectIntersectsStrip(bounds: DOMRect, strip: DOMRect) {
  return !(
    bounds.bottom <= strip.top ||
    bounds.top >= strip.top + strip.height ||
    bounds.right <= strip.left ||
    bounds.left >= strip.left + strip.width
  );
}

function cloneNotificationCaptureRoot(root: HTMLElement, strip: DOMRect, ignoredSelectors: readonly string[]) {
  const clone = root.cloneNode(false) as HTMLElement;
  const rootRect = root.getBoundingClientRect();
  const rootStyle = window.getComputedStyle(root);
  const pinContext = {
    left: rootRect.left + (parseFloat(rootStyle.borderLeftWidth) || 0),
    top: rootRect.top + (parseFloat(rootStyle.borderTopWidth) || 0)
  };
  const descendantIntersectionCache = new WeakMap<HTMLElement, boolean>();
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const clonedChild = cloneNotificationCaptureElement(child, strip, pinContext, descendantIntersectionCache, ignoredSelectors);
    if (!clonedChild) continue;
    clone.appendChild(clonedChild);
  }
  return clone;
}

function freezeNotificationCaptureAnimations(root: HTMLElement) {
  for (const element of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
    element.style.animation = "none";
    element.style.transition = "none";
  }
}

interface NotificationCapturePinContext {
  left: number;
  top: number;
}

/*
 * Inline-level content participates in line layout: pruning one inline shifts
 * every inline after it, and pinning one to its union rect breaks wrapped
 * lines. Such elements are cloned in flow with their whole subtree instead.
 * (Flex/grid items are safe to pin — browsers blockify their computed display.)
 */
function isFlowAtomicDisplay(style: CSSStyleDeclaration) {
  const display = style.display;
  return display.startsWith("inline") || display === "contents" || display.startsWith("table-") || display === "ruby";
}

/*
 * The proxy clone drops every element outside the banner strip, so no cloned
 * element may derive its position from flow layout — pruned siblings would
 * reflow the survivors (a grid topbar collapses its centre segment into the
 * first column, sliding all visible chrome out of the strip). Every cloned
 * box is therefore pinned to its real viewport rect, relative to its nearest
 * pinned ancestor. This also bakes in scroll offsets, which cloneNode loses.
 */
function pinNotificationCloneGeometry(
  clone: HTMLElement,
  rect: DOMRect,
  context: NotificationCapturePinContext
) {
  Object.assign(clone.style, {
    position: "absolute",
    left: `${rect.left - context.left}px`,
    top: `${rect.top - context.top}px`,
    right: "auto",
    bottom: "auto",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    minWidth: "0",
    minHeight: "0",
    maxWidth: "none",
    maxHeight: "none",
    margin: "0",
    boxSizing: "border-box",
    transform: "none"
  });
}

function cloneNotificationCaptureSubtree(original: HTMLElement, ignoredSelectors: readonly string[]): HTMLElement | null {
  if (shouldIgnoreNotificationCaptureElement(original, ignoredSelectors)) return null;
  const clone = original.cloneNode(false) as HTMLElement;
  for (const child of Array.from(original.childNodes)) {
    if (child instanceof HTMLElement) {
      const clonedChild = cloneNotificationCaptureSubtree(child, ignoredSelectors);
      if (clonedChild) clone.appendChild(clonedChild);
    } else {
      clone.appendChild(child.cloneNode(true));
    }
  }
  return clone;
}

function cloneNotificationCaptureElement(
  original: HTMLElement,
  strip: DOMRect,
  pinContext: NotificationCapturePinContext,
  descendantIntersectionCache: WeakMap<HTMLElement, boolean>,
  ignoredSelectors: readonly string[],
  parentIntersectsStrip = false
): HTMLElement | null {
  if (shouldIgnoreNotificationCaptureElement(original, ignoredSelectors)) return null;

  const originalRect = original.getBoundingClientRect();
  const originalStyle = window.getComputedStyle(original);
  const hasBox = originalRect.width > 0 && originalRect.height > 0;
  const intersectsStrip = hasBox && rectIntersectsStrip(originalRect, strip);
  const isCaptureSurface = notificationCaptureSurfaceSelectors.some((selector) => original.matches(selector));

  if (parentIntersectsStrip && isFlowAtomicDisplay(originalStyle) && !isCaptureSurface) {
    return cloneNotificationCaptureSubtree(original, ignoredSelectors);
  }

  const hasIntersectingDescendant =
    !intersectsStrip &&
    hasNotificationCaptureDescendantInStrip(original, strip, descendantIntersectionCache, ignoredSelectors);

  if (
    !isCaptureSurface &&
    !intersectsStrip &&
    !hasIntersectingDescendant &&
    !(parentIntersectsStrip && !hasBox)
  ) {
    return null;
  }

  const clone = original.cloneNode(false) as HTMLElement;
  let childPinContext = pinContext;
  if (hasBox) {
    pinNotificationCloneGeometry(clone, originalRect, pinContext);
    childPinContext = {
      left: originalRect.left + (parseFloat(originalStyle.borderLeftWidth) || 0),
      top: originalRect.top + (parseFloat(originalStyle.borderTopWidth) || 0)
    };
  } else {
    // A boxless carrier must not become a containing block at its flow position.
    clone.style.position = "static";
  }

  const cloneChildText = intersectsStrip || (parentIntersectsStrip && !hasBox);
  const childrenSeeIntersectingParent = cloneChildText;

  for (const child of Array.from(original.childNodes)) {
    if (child instanceof HTMLElement) {
      const clonedChild = cloneNotificationCaptureElement(
        child,
        strip,
        childPinContext,
        descendantIntersectionCache,
        ignoredSelectors,
        childrenSeeIntersectingParent
      );
      if (clonedChild) clone.appendChild(clonedChild);
    } else if (cloneChildText) {
      clone.appendChild(child.cloneNode(true));
    }
  }

  return clone;
}

function hasNotificationCaptureDescendantInStrip(
  element: HTMLElement,
  strip: DOMRect,
  cache: WeakMap<HTMLElement, boolean>,
  ignoredSelectors: readonly string[]
): boolean {
  const cached = cache.get(element);
  if (typeof cached === "boolean") return cached;

  for (const child of Array.from(element.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (shouldIgnoreNotificationCaptureElement(child, ignoredSelectors)) continue;
    const bounds = child.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0 && rectIntersectsStrip(bounds, strip)) {
      cache.set(element, true);
      return true;
    }
    if (hasNotificationCaptureDescendantInStrip(child, strip, cache, ignoredSelectors)) {
      cache.set(element, true);
      return true;
    }
  }

  cache.set(element, false);
  return false;
}

/*
 * WebGL renderers use preserveDrawingBuffer: false, so capture engines
 * can sample a cleared buffer if they read the <canvas> after the active draw
 * task. We snapshot every canvas overlapping the banner strip here, in-task,
 * after prepareRenderedCanvasCapture redraws it; SnapDOM's clone plugin then swaps each
 * cloned canvas for an <img> of those fresh pixels.
 */
export function collectNotificationCanvasReplacements(
  strip: DOMRect,
  ignoredSelectors: readonly string[] = notificationCaptureIgnoredSelectors
): NotificationCanvasReplacement[] {
  const replacements: NotificationCanvasReplacement[] = [];
  let index = 0;
  for (const canvas of document.querySelectorAll<HTMLCanvasElement>("canvas")) {
    if (canvas.width < 1 || canvas.height < 1) continue;
    if (shouldIgnoreNotificationCaptureElement(canvas, ignoredSelectors)) continue;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1 || !rectIntersectsStrip(bounds, strip)) continue;
    if (!prepareRenderedCanvasCapture(canvas)) continue;

    // Snapshot only the strip's slice of the canvas: encoding a full-screen
    // canvas to PNG costs hundreds of ms; the visible sliver is cheap.
    const cropPad = 2;
    const cropLeft = Math.max(bounds.left, strip.left - cropPad);
    const cropTop = Math.max(bounds.top, strip.top - cropPad);
    const cropRight = Math.min(bounds.right, strip.left + strip.width + cropPad);
    const cropBottom = Math.min(bounds.bottom, strip.top + strip.height + cropPad);
    const cropWidth = cropRight - cropLeft;
    const cropHeight = cropBottom - cropTop;
    if (cropWidth < 1 || cropHeight < 1) continue;
    const backingScaleX = canvas.width / bounds.width;
    const backingScaleY = canvas.height / bounds.height;

    let dataUrl: string;
    try {
      const crop = document.createElement("canvas");
      crop.width = Math.max(1, Math.round(cropWidth * backingScaleX));
      crop.height = Math.max(1, Math.round(cropHeight * backingScaleY));
      const context = crop.getContext("2d");
      if (!context) continue;
      context.drawImage(
        canvas,
        (cropLeft - bounds.left) * backingScaleX,
        (cropTop - bounds.top) * backingScaleY,
        cropWidth * backingScaleX,
        cropHeight * backingScaleY,
        0,
        0,
        crop.width,
        crop.height
      );
      dataUrl = crop.toDataURL("image/png");
    } catch {
      continue;
    }
    const id = `nc-${index}`;
    index += 1;
    canvas.setAttribute(notificationCanvasCaptureAttr, id);
    replacements.push({
      id,
      dataUrl,
      offsetX: cropLeft - bounds.left,
      offsetY: cropTop - bounds.top,
      width: cropWidth,
      height: cropHeight,
      boxWidth: bounds.width,
      boxHeight: bounds.height
    });
  }
  return replacements;
}

export function clearNotificationCanvasMarks() {
  for (const canvas of document.querySelectorAll(`[${notificationCanvasCaptureAttr}]`)) {
    canvas.removeAttribute(notificationCanvasCaptureAttr);
  }
}

async function applyNotificationCanvasReplacements(
  clonedRoot: Element | Document,
  replacements: NotificationCanvasReplacement[]
) {
  if (replacements.length === 0) return;
  const byId = new Map(replacements.map((replacement) => [replacement.id, replacement]));
  const decoded: Promise<unknown>[] = [];
  const clonedDocument = clonedRoot instanceof Document ? clonedRoot : clonedRoot.ownerDocument;
  for (const canvas of clonedRoot.querySelectorAll<HTMLCanvasElement>(`canvas[${notificationCanvasCaptureAttr}]`)) {
    const replacement = byId.get(canvas.getAttribute(notificationCanvasCaptureAttr) ?? "");
    if (!replacement) continue;
    // The snapshot covers only the strip's slice of the canvas, so it rides
    // inside a wrapper that keeps the canvas's box and clips to it.
    const wrapper = clonedDocument.createElement("div");
    wrapper.className = canvas.className;
    wrapper.setAttribute("style", canvas.getAttribute("style") ?? "");
    if (!wrapper.style.position || wrapper.style.position === "static") {
      wrapper.style.position = "relative";
      wrapper.style.display = "inline-block";
    }
    if (!wrapper.style.width) wrapper.style.width = `${replacement.boxWidth}px`;
    if (!wrapper.style.height) wrapper.style.height = `${replacement.boxHeight}px`;
    wrapper.style.overflow = "hidden";
    const image = clonedDocument.createElement("img");
    Object.assign(image.style, {
      position: "absolute",
      left: `${replacement.offsetX}px`,
      top: `${replacement.offsetY}px`,
      width: `${replacement.width}px`,
      height: `${replacement.height}px`,
      display: "block"
    });
    image.src = replacement.dataUrl;
    wrapper.appendChild(image);
    canvas.replaceWith(wrapper);
    decoded.push(image.decode?.().catch(() => undefined) ?? Promise.resolve());
  }
  await Promise.allSettled(decoded);
}

function createNotificationCapturePlugin(canvasReplacements: NotificationCanvasReplacement[]): SnapdomPlugin {
  return {
    name: "syncloudos-notification-canvas-swap",
    async afterClone(context: CaptureContext) {
      if (!context.clone) return;
      await applyNotificationCanvasReplacements(context.clone, canvasReplacements);
    }
  };
}

export function createNotificationCaptureProxy(
  root: HTMLElement,
  strip: DOMRect,
  ignoredSelectors: readonly string[] = notificationCaptureIgnoredSelectors
): NotificationCaptureProxy {
  const rootRect = root.getBoundingClientRect();
  const ownerDocument = root.ownerDocument;
  const proxyViewport = ownerDocument.createElement("div");
  const clonedRoot = cloneNotificationCaptureRoot(root, strip, ignoredSelectors);

  proxyViewport.dataset.syncloudosNotificationCaptureProxy = "true";
  proxyViewport.setAttribute(notificationCaptureProxyAttr, "true");
  proxyViewport.setAttribute("aria-hidden", "true");
  clonedRoot.setAttribute("aria-hidden", "true");
  Object.assign(proxyViewport.style, {
    position: "fixed",
    left: `${strip.left}px`,
    top: `${strip.top}px`,
    width: `${strip.width}px`,
    height: `${strip.height}px`,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "-1",
    background: "transparent",
    contain: "layout style paint size",
    isolation: "isolate"
  });

  Object.assign(clonedRoot.style, {
    position: "absolute",
    left: `${rootRect.left - strip.left}px`,
    top: `${rootRect.top - strip.top}px`,
    width: `${rootRect.width}px`,
    height: `${rootRect.height}px`,
    minHeight: `${rootRect.height}px`,
    maxHeight: `${rootRect.height}px`,
    margin: "0",
    overflow: "hidden",
    pointerEvents: "none",
    transform: "none",
    transformOrigin: "top left"
  });
  freezeNotificationCaptureAnimations(clonedRoot);

  proxyViewport.appendChild(clonedRoot);
  ownerDocument.body.appendChild(proxyViewport);

  return {
    element: proxyViewport,
    dispose: () => proxyViewport.remove()
  };
}

function createNotificationCaptureOptions(
  canvasReplacements: NotificationCanvasReplacement[],
  scale: number,
  ignoredSelectors: readonly string[]
): SnapdomOptions {
  return {
    cache: "auto",
    dpr: 1,
    // Fonts must ride into SnapDOM's SVG sandbox or pinned boxes overflow in
    // a fallback font and ellipsize; snapdom caches the embedded fonts.
    embedFonts: true,
    fast: true,
    filter: (element) => !shouldIgnoreNotificationCaptureElement(element, ignoredSelectors),
    filterMode: "remove",
    outerShadows: false,
    placeholders: false,
    plugins: [createNotificationCapturePlugin(canvasReplacements)],
    resolvePicturePlaceholders: false,
    scale
  };
}

/**
 * Captures one viewport rect of `root` to a canvas. Live canvases inside the
 * rect must already be collected with the same ignored selectors. This is the
 * engine behind the notification banner's screen slice and the folder split.
 */
export async function captureScreenSlice(
  snapdom: NotificationSnapdomCanvasCapture,
  root: HTMLElement,
  canvasReplacements: NotificationCanvasReplacement[],
  scale: number,
  strip: DOMRect,
  ignoredSelectors: readonly string[]
): Promise<HTMLCanvasElement> {
  const proxy = createNotificationCaptureProxy(root, strip, ignoredSelectors);
  try {
    return await snapdom.toCanvas(proxy.element, createNotificationCaptureOptions(canvasReplacements, scale, ignoredSelectors));
  } finally {
    proxy.dispose();
  }
}

export async function captureNotificationSource(
  snapdom: NotificationSnapdomCanvasCapture,
  canvasReplacements: NotificationCanvasReplacement[],
  scale: number,
  captureStrip: DOMRect
): Promise<NotificationCaptureSource> {
  const canvas = await captureScreenSlice(
    snapdom,
    getNotificationCaptureRoot(),
    canvasReplacements,
    scale,
    captureStrip,
    notificationCaptureIgnoredSelectors
  );
  return {
    canvas,
    rect: new DOMRect(captureStrip.left, captureStrip.top, captureStrip.width, captureStrip.height)
  };
}
