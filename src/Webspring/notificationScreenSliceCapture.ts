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
  ".webspring-widget-shelf"
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
 * box is therefore pinned to its real layout box, relative to its nearest
 * pinned ancestor. This also bakes in scroll offsets, which cloneNode loses.
 *
 * A box's viewport rect includes its own transform (`transform` and the
 * individual `translate`, `rotate` and `scale`). The clone keeps that
 * transform, so it is pinned to the box before the transform, recovered from
 * the rect and the transform about its origin.
 */
interface CloneAffine {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

const cloneIdentity: CloneAffine = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
const cloneEpsilon = 1e-6;

function multiplyAffine(m: CloneAffine, n: CloneAffine): CloneAffine {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

function translationAffine(x: number, y: number): CloneAffine {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

function cssTokens(value: string) {
  const trimmed = value.trim();
  return trimmed && trimmed !== "none" ? trimmed.split(/\s+/u) : [];
}

function parseCloneLength(token: string, reference: number): number | null {
  const amount = parseFloat(token);
  if (!Number.isFinite(amount)) return null;
  if (token.endsWith("%")) return reference * amount / 100;
  return token.endsWith("px") || amount === 0 ? amount : null;
}

const cloneAngleUnits: Record<string, number> = { deg: Math.PI / 180, rad: 1, grad: Math.PI / 200, turn: Math.PI * 2 };

function parseCloneAngle(token: string): number | null {
  const unit = /[a-z]+$/u.exec(token)?.[0] ?? "";
  const amount = parseFloat(token);
  const factor = cloneAngleUnits[unit] ?? (amount === 0 ? 0 : undefined);
  return factor === undefined || !Number.isFinite(amount) ? null : amount * factor;
}

/** `none`, or the matrix() and matrix3d() forms computed transforms take. */
function parseCloneTransformList(value: string): CloneAffine | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "none") return cloneIdentity;
  const match = /^(matrix|matrix3d)\(([^)]*)\)$/u.exec(trimmed);
  if (!match) return null;
  const values = match[2].split(",").map((part) => Number(part.trim()));
  if (values.some((entry) => !Number.isFinite(entry))) return null;
  if (match[1] === "matrix" && values.length === 6) {
    const [a, b, c, d, e, f] = values;
    return { a, b, c, d, e, f };
  }
  if (match[1] === "matrix3d" && values.length === 16) {
    return { a: values[0], b: values[1], c: values[4], d: values[5], e: values[12], f: values[13] };
  }
  return null;
}

function parseCloneTranslate(value: string, width: number, height: number): CloneAffine | null {
  const [x = "0px", y = "0px"] = cssTokens(value);
  const tx = parseCloneLength(x, width);
  const ty = parseCloneLength(y, height);
  return tx === null || ty === null ? null : translationAffine(tx, ty);
}

/** A z rotation exactly; a rotation about x or y as its flattening. */
function parseCloneRotate(value: string): CloneAffine | null {
  const tokens = cssTokens(value);
  if (tokens.length === 0) return cloneIdentity;
  const angle = parseCloneAngle(tokens[tokens.length - 1]);
  if (angle === null) return null;
  const axis = tokens.slice(0, -1);
  const [x, y, z] = axis.length === 1
    ? [axis[0] === "x" ? 1 : 0, axis[0] === "y" ? 1 : 0, axis[0] === "z" ? 1 : 0]
    : axis.length === 3 ? axis.map(Number) : [0, 0, 1];
  if (![x, y, z].every(Number.isFinite)) return null;
  if (Math.abs(x) < cloneEpsilon && Math.abs(y) < cloneEpsilon) {
    const turn = z < 0 ? -angle : angle;
    return { a: Math.cos(turn), b: Math.sin(turn), c: -Math.sin(turn), d: Math.cos(turn), e: 0, f: 0 };
  }
  const cos = Math.cos(angle);
  return { a: Math.abs(y) > Math.abs(x) ? cos : 1, b: 0, c: 0, d: Math.abs(x) >= Math.abs(y) ? cos : 1, e: 0, f: 0 };
}

function parseCloneScale(value: string): CloneAffine | null {
  const tokens = cssTokens(value);
  if (tokens.length === 0) return cloneIdentity;
  const factor = (token: string) => token.endsWith("%") ? parseFloat(token) / 100 : Number(token);
  const sx = factor(tokens[0]);
  const sy = tokens.length > 1 ? factor(tokens[1]) : sx;
  return Number.isFinite(sx) && Number.isFinite(sy) ? { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 } : null;
}

const cloneOriginKeywords: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };

function parseCloneOrigin(value: string, width: number, height: number) {
  const tokens = cssTokens(value);
  const [x = "50%", y = "50%"] = tokens[0] === "top" || tokens[0] === "bottom" ? [tokens[1], tokens[0]] : tokens;
  const resolve = (token: string, reference: number) => token in cloneOriginKeywords
    ? cloneOriginKeywords[token] * reference
    : parseCloneLength(token, reference);
  const originX = resolve(x, width);
  const originY = resolve(y, height);
  return originX === null || originY === null ? null : { x: originX, y: originY };
}

/** The element's own transform in its local box: translate, rotate, scale, then transform, about the origin. */
function cloneElementTransform(style: CSSStyleDeclaration, width: number, height: number): CloneAffine | null {
  const translate = parseCloneTranslate(style.getPropertyValue("translate"), width, height);
  const rotate = parseCloneRotate(style.getPropertyValue("rotate"));
  const scale = parseCloneScale(style.getPropertyValue("scale"));
  const transform = parseCloneTransformList(style.getPropertyValue("transform"));
  const origin = parseCloneOrigin(style.getPropertyValue("transform-origin"), width, height);
  if (!translate || !rotate || !scale || !transform || !origin) return null;
  return [translate, rotate, scale, transform, translationAffine(-origin.x, -origin.y)]
    .reduce(multiplyAffine, translationAffine(origin.x, origin.y));
}

interface NotificationCloneBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** The transform scales, rotates or skews the box, so its children are not where their rects say. */
  readonly reshaped: boolean;
  /** Computed transform values to carry onto the clone; null when the transform could not be read. */
  readonly transforms: Readonly<Record<"transform" | "translate" | "rotate" | "scale" | "transform-origin", string>> | null;
}

function notificationCloneBox(element: HTMLElement, rect: DOMRect, style: CSSStyleDeclaration): NotificationCloneBox {
  // Size first from layout, then exactly from the rect when the transform only scales.
  let width = element.offsetWidth || rect.width;
  let height = element.offsetHeight || rect.height;
  let matrix = cloneElementTransform(style, width, height);
  if (matrix && Math.abs(matrix.b) < cloneEpsilon && Math.abs(matrix.c) < cloneEpsilon &&
    Math.abs(matrix.a) > cloneEpsilon && Math.abs(matrix.d) > cloneEpsilon) {
    width = rect.width / Math.abs(matrix.a);
    height = rect.height / Math.abs(matrix.d);
    matrix = cloneElementTransform(style, width, height);
  }
  if (!matrix) {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, reshaped: false, transforms: null };
  }
  const corners = [[0, 0], [width, 0], [0, height], [width, height]]
    .map(([x, y]) => ({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f }));
  const reshaped = Math.abs(matrix.a - 1) > cloneEpsilon || Math.abs(matrix.d - 1) > cloneEpsilon ||
    Math.abs(matrix.b) > cloneEpsilon || Math.abs(matrix.c) > cloneEpsilon;
  const value = (property: string, fallback: string) => style.getPropertyValue(property).trim() || fallback;
  return {
    left: rect.left - Math.min(...corners.map((corner) => corner.x)),
    top: rect.top - Math.min(...corners.map((corner) => corner.y)),
    width,
    height,
    reshaped,
    transforms: {
      transform: value("transform", "none"),
      translate: value("translate", "none"),
      rotate: value("rotate", "none"),
      scale: value("scale", "none"),
      "transform-origin": value("transform-origin", "50% 50%"),
    },
  };
}

function pinNotificationCloneGeometry(
  clone: HTMLElement,
  box: NotificationCloneBox,
  context: NotificationCapturePinContext
) {
  Object.assign(clone.style, {
    position: "absolute",
    left: `${box.left - context.left}px`,
    top: `${box.top - context.top}px`,
    right: "auto",
    bottom: "auto",
    width: `${box.width}px`,
    height: `${box.height}px`,
    minWidth: "0",
    minHeight: "0",
    maxWidth: "none",
    maxHeight: "none",
    margin: "0",
    boxSizing: "border-box",
  });
  // An unreadable transform is dropped whole, and the clone sits on the rect it drew.
  const transforms = box.transforms ?? { transform: "none", translate: "none", rotate: "none", scale: "none", "transform-origin": "50% 50%" };
  for (const [property, value] of Object.entries(transforms)) clone.style.setProperty(property, value);
}

/* Media whose size comes from content the clone has not loaded yet. */
const notificationCloneMediaElements = new Set(["img", "video", "object", "embed"]);

function cloneNotificationCaptureSubtree(original: HTMLElement, ignoredSelectors: readonly string[]): HTMLElement | null {
  if (shouldIgnoreNotificationCaptureElement(original, ignoredSelectors)) return null;
  const clone = original.cloneNode(false) as HTMLElement;
  // A cloned image lays out at 0 x 0 (`height: auto`) until it loads, and the
  // capture reads its size at once: it keeps the original's laid-out size.
  if (notificationCloneMediaElements.has(original.localName)) {
    Object.assign(clone.style, { width: `${original.offsetWidth}px`, height: `${original.offsetHeight}px`, boxSizing: "border-box" });
  }
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

  const box = hasBox ? notificationCloneBox(original, originalRect, originalStyle) : null;
  // Children of a scaled, rotated or skewed box are drawn through its
  // transform: they are cloned with it in flow rather than pinned to their rects.
  if (box?.reshaped) {
    const subtree = cloneNotificationCaptureSubtree(original, ignoredSelectors);
    if (subtree) pinNotificationCloneGeometry(subtree, box, pinContext);
    return subtree;
  }

  const clone = original.cloneNode(false) as HTMLElement;
  let childPinContext = pinContext;
  if (box) {
    pinNotificationCloneGeometry(clone, box, pinContext);
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
