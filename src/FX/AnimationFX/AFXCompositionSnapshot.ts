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

import {
  normaliseRect,
  type GFXPoint,
  type GFXRect,
} from "../GraphicsFX/GFXGeometry";
import { GFXColour } from "../GraphicsFX/GFXColour";
import { GFXImage } from "../GraphicsFX/GFXImage";
import { GFXPath } from "../GraphicsFX/GFXPath";
import type { AFXLayerContent } from "./AFXLayerContent";
import {
  AFXLayer,
  type AFXLayerCompositionCapability,
  type AFXLayerSnapshot,
} from "./AFXLayer";
import { AFXTransform3D } from "./AFXTransform3D";

export interface AFXCompositionCaptureOptions {
  readonly bounds: GFXRect;
  readonly scale: number;
  readonly time: number;
}

export interface AFXCompositionDestination {
  readonly rect: GFXRect;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly scale: number;
}

export interface AFXCompositionNode {
  readonly layer: AFXLayerSnapshot;
  readonly children: readonly AFXCompositionNode[];
  readonly mask: AFXCompositionNode | null;
}

export type AFXCompositionCapability = AFXLayerCompositionCapability;

type Pixel = Readonly<{ r: number; g: number; b: number; a: number }>;
type Matrix3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];
type RenderNode = Readonly<{
  source: AFXCompositionNode;
  world: AFXTransform3D;
  inverse: Matrix3;
  children: readonly RenderNode[];
  mask: RenderNode | null;
}>;

const transparent: Pixel = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });

function finite(value: number, name: string, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} is outside its supported range.`);
  return value;
}

function integer(value: number, name: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} is outside its supported range.`);
  return value;
}

function colour(value: GFXColour | null): Pixel {
  if (!value) return transparent;
  return Object.freeze(value.converting("srgb").components);
}

function sourceOver(backdrop: Pixel, source: Pixel): Pixel {
  if (source.a <= 0) return backdrop;
  if (source.a >= 1 && backdrop.a <= 0) return source;
  const alpha = source.a + backdrop.a * (1 - source.a);
  if (!alpha) return transparent;
  return Object.freeze({
    r: (source.r * source.a + backdrop.r * backdrop.a * (1 - source.a)) / alpha,
    g: (source.g * source.a + backdrop.g * backdrop.a * (1 - source.a)) / alpha,
    b: (source.b * source.a + backdrop.b * backdrop.a * (1 - source.a)) / alpha,
    a: alpha,
  });
}

function withAlpha(value: Pixel, factor: number): Pixel {
  if (factor <= 0 || value.a <= 0) return transparent;
  return Object.freeze({ ...value, a: Math.max(0, Math.min(1, value.a * factor)) });
}

function localTransform(snapshot: AFXLayerSnapshot) {
  return AFXTransform3D.translation(
    snapshot.position.x,
    snapshot.position.y,
    snapshot.zPosition,
  )
    .multiply(snapshot.transform)
    .multiply(
      AFXTransform3D.translation(
        -snapshot.anchorPoint.x * snapshot.bounds.width - snapshot.bounds.x,
        -snapshot.anchorPoint.y * snapshot.bounds.height - snapshot.bounds.y,
        -snapshot.anchorPointZ,
      ),
    );
}

function inversePlanar(transform: AFXTransform3D): Matrix3 {
  const m = transform.values;
  const a = m[0]!, b = m[4]!, c = m[12]!;
  const d = m[1]!, e = m[5]!, f = m[13]!;
  const g = m[3]!, h = m[7]!, i = m[15]!;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12)
    throw new RangeError("Composition contains a singular planar projection.");
  const inverse = [A, B, C, D, E, F, G, H, I].map((value) => value / det);
  if (!inverse.every(Number.isFinite))
    throw new RangeError("Composition projection is not finite.");
  return Object.freeze(inverse) as Matrix3;
}

function project(point: GFXPoint, inverse: Matrix3): GFXPoint | null {
  const x = inverse[0] * point.x + inverse[1] * point.y + inverse[2];
  const y = inverse[3] * point.x + inverse[4] * point.y + inverse[5];
  const w = inverse[6] * point.x + inverse[7] * point.y + inverse[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  const result = { x: x / w, y: y / w };
  return Number.isFinite(result.x) && Number.isFinite(result.y)
    ? Object.freeze(result)
    : null;
}

function inside(rect: GFXRect, point: GFXPoint) {
  return point.x >= rect.x && point.y >= rect.y &&
    point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}

function insideRounded(snapshot: AFXLayerSnapshot, point: GFXPoint, inset = 0) {
  const bounds = snapshot.bounds;
  const x = bounds.x + inset, y = bounds.y + inset;
  const width = Math.max(0, bounds.width - inset * 2);
  const height = Math.max(0, bounds.height - inset * 2);
  if (point.x < x || point.y < y || point.x >= x + width || point.y >= y + height)
    return false;
  const raw = Math.max(0, snapshot.style.cornerRadius - inset);
  const radius = Math.min(raw, width / 2, height / 2);
  if (!radius) return true;
  const corners = snapshot.style.maskedCorners;
  const test = (cx: number, cy: number) => {
    const dx = point.x - cx, dy = point.y - cy;
    return dx * dx + dy * dy <= radius * radius;
  };
  if (corners.includes("top-left") && point.x < x + radius && point.y < y + radius)
    return test(x + radius, y + radius);
  if (corners.includes("top-right") && point.x >= x + width - radius && point.y < y + radius)
    return test(x + width - radius, y + radius);
  if (corners.includes("bottom-left") && point.x < x + radius && point.y >= y + height - radius)
    return test(x + radius, y + height - radius);
  if (corners.includes("bottom-right") && point.x >= x + width - radius && point.y >= y + height - radius)
    return test(x + width - radius, y + height - radius);
  return true;
}

function gravityRect(
  bounds: GFXRect,
  width: number,
  height: number,
  gravity: AFXLayerSnapshot["contentsGravity"],
): GFXRect {
  if (gravity === "resize") return bounds;
  let w = width, h = height;
  if (gravity === "resize-aspect" || gravity === "resize-aspect-fill") {
    const scale = gravity === "resize-aspect"
      ? Math.min(bounds.width / width, bounds.height / height)
      : Math.max(bounds.width / width, bounds.height / height);
    w *= scale;
    h *= scale;
  }
  const left = gravity === "left" || gravity === "top-left" || gravity === "bottom-left";
  const right = gravity === "right" || gravity === "top-right" || gravity === "bottom-right";
  const top = gravity === "top" || gravity === "top-left" || gravity === "top-right";
  const bottom = gravity === "bottom" || gravity === "bottom-left" || gravity === "bottom-right";
  return Object.freeze({
    x: left ? bounds.x : right ? bounds.x + bounds.width - w : bounds.x + (bounds.width - w) / 2,
    y: top ? bounds.y : bottom ? bounds.y + bounds.height - h : bounds.y + (bounds.height - h) / 2,
    width: Math.max(0, w),
    height: Math.max(0, h),
  });
}

function segmentCoordinate(value: number, destination: readonly number[], source: readonly number[]) {
  for (let index = 0; index < 3; index += 1) {
    const d0 = destination[index]!, d1 = destination[index + 1]!;
    if (value < d0 || value >= d1 || d1 <= d0) continue;
    const fraction = (value - d0) / (d1 - d0);
    return source[index]! + fraction * (source[index + 1]! - source[index]!);
  }
  return null;
}

function imagePixel(content: Extract<AFXLayerContent, { kind: "image" }>, snapshot: AFXLayerSnapshot, point: GFXPoint): Pixel {
  const image = content.image;
  const crop = snapshot.contentsRect;
  const sourceWidth = Math.max(1, Math.ceil(crop.width * image.width));
  const sourceHeight = Math.max(1, Math.ceil(crop.height * image.height));
  const destination = gravityRect(snapshot.bounds, sourceWidth, sourceHeight, snapshot.contentsGravity);
  if (!inside(destination, point)) return transparent;
  const centre = snapshot.contentsCenter;
  const sx = [0, centre.x * sourceWidth, (centre.x + centre.width) * sourceWidth, sourceWidth];
  const sy = [0, centre.y * sourceHeight, (centre.y + centre.height) * sourceHeight, sourceHeight];
  const fixedWidth = sx[1]! + sourceWidth - sx[2]!;
  const fixedHeight = sy[1]! + sourceHeight - sy[2]!;
  const xScale = fixedWidth > destination.width && fixedWidth > 0 ? destination.width / fixedWidth : 1;
  const yScale = fixedHeight > destination.height && fixedHeight > 0 ? destination.height / fixedHeight : 1;
  const left = sx[1]! * xScale, right = (sourceWidth - sx[2]!) * xScale;
  const top = sy[1]! * yScale, bottom = (sourceHeight - sy[2]!) * yScale;
  const dx = [destination.x, destination.x + left, destination.x + destination.width - right, destination.x + destination.width];
  const dy = [destination.y, destination.y + top, destination.y + destination.height - bottom, destination.y + destination.height];
  const px = segmentCoordinate(point.x, dx, sx);
  const py = segmentCoordinate(point.y, dy, sy);
  if (px === null || py === null) return transparent;
  const sampled = image.sample({
    x: (crop.x + (px / sourceWidth) * crop.width) * image.width,
    y: (crop.y + (py / sourceHeight) * crop.height) * image.height,
  }, { interpolation: "nearest", edge: "clamp" });
  return Object.freeze(sampled);
}

function contentPixel(content: AFXLayerContent | null | undefined, snapshot: AFXLayerSnapshot, point: GFXPoint): Pixel {
  if (!content) return transparent;
  if (content.kind === "image") return imagePixel(content, snapshot, point);
  if (content.kind === "gradient")
    return content.gradient && inside(snapshot.bounds, point)
      ? colour(content.gradient.sampleAt(point, snapshot.bounds))
      : transparent;
  if (content.kind === "shape") {
    if (!content.path) return transparent;
    let value = content.fillColour && content.path.contains(point, content.fillRule)
      ? colour(content.fillColour)
      : transparent;
    if (content.strokeColour && content.lineWidth > 0 && content.strokeStart < content.strokeEnd) {
      const path = content.strokeStart === 0 && content.strokeEnd === 1
        ? content.path
        : content.path.trimmed(content.strokeStart, content.strokeEnd);
      const stroke = path.stroked({
        width: content.lineWidth,
        cap: content.lineCap,
        join: content.lineJoin,
        miterLimit: content.miterLimit,
      });
      if (stroke.contains(point, "nonzero")) value = sourceOver(value, colour(content.strokeColour));
    }
    return value;
  }
  if (content.kind === "text") {
    const hit = content.glyphs.some((glyph) => glyph.path.contains(point, "nonzero"));
    return hit ? colour(content.foregroundColour) : transparent;
  }
  if (content.kind === "tiled") {
    let value = transparent;
    for (const tile of content.tiles) {
      if (!inside(tile.rect, point)) continue;
      const sample = tile.image.sample({
        x: (point.x - tile.rect.x) / tile.rect.width * tile.image.width,
        y: (point.y - tile.rect.y) / tile.rect.height * tile.image.height,
      }, { interpolation: "linear", edge: "clamp" });
      value = sourceOver(value, Object.freeze(sample));
    }
    return value;
  }
  if (content.kind === "emitter") {
    let value = transparent;
    for (const particle of content.particles) {
      if (!particle.scale) continue;
      const dx = point.x - particle.position.x, dy = point.y - particle.position.y;
      const cosine = Math.cos(-particle.rotation), sine = Math.sin(-particle.rotation);
      const x = (dx * cosine - dy * sine) / particle.scale + particle.contents.width / 2;
      const y = (dx * sine + dy * cosine) / particle.scale + particle.contents.height / 2;
      if (x < 0 || y < 0 || x >= particle.contents.width || y >= particle.contents.height) continue;
      const image = particle.contents.sample({ x, y }, { interpolation: "linear", edge: "transparent" });
      const tint = particle.colour.converting("srgb").components;
      value = sourceOver(value, Object.freeze({
        r: image.r * tint.r,
        g: image.g * tint.g,
        b: image.b * tint.b,
        a: image.a * tint.a,
      }));
    }
    return value;
  }
  return transparent;
}

function contentUnsupported(content: AFXLayerContent | null | undefined): string | null {
  if (!content) return null;
  if (content.kind === 'shader') return 'image-shader-offscreen';
  if (content.kind === "shape" && content.lineDashPattern.length)
    return "shape-dash-offscreen";
  return null;
}

function captureNode(layer: AFXLayer, budget: { count: number; unsupported: string | null }): AFXCompositionNode {
  if (++budget.count > 256) throw new RangeError("Composition snapshot exceeds 256 owned layers.");
  const capability = layer.compositionCapability;
  budget.unsupported ??= capability.state === "unsupported" ? capability.reason ?? "surface-unsupported" : null;
  const snapshot = layer.presentation;
  if (snapshot.filters?.length) budget.unsupported ??= 'image-filter-offscreen';
  if (snapshot.compositingFilter?.parameters.mode === 'addition') budget.unsupported ??= 'addition-offscreen';
  budget.unsupported ??= contentUnsupported(snapshot.content);
  if (snapshot.replication) budget.unsupported ??= "replication-offscreen";
  if (!snapshot.style.doubleSided) budget.unsupported ??= "backface-culling-offscreen";
  const children = Object.freeze(layer.sublayers.map((child) => captureNode(child, budget)));
  const mask = layer.mask ? captureNode(layer.mask, budget) : null;
  return Object.freeze({ layer: snapshot, children, mask });
}

function renderNode(source: AFXCompositionNode, parentWorld?: AFXTransform3D): RenderNode {
  const world = parentWorld
    ? parentWorld.multiply(localTransform(source.layer))
    : localTransform(source.layer);
  const childParent = world.multiply(source.layer.sublayerTransform);
  const children = Object.freeze(source.children.map((child) => renderNode(child, childParent)));
  const mask = source.mask ? renderNode(source.mask) : null;
  return Object.freeze({ source, world, inverse: inversePlanar(world), children, mask });
}

function bodyPixel(node: RenderNode, worldPoint: GFXPoint, local: GFXPoint): Pixel {
  const snapshot = node.source.layer;
  const insideShape = insideRounded(snapshot, local);
  let value = transparent;
  if (insideShape) {
    const animatedBackground = typeof snapshot.values.backgroundColour === "string"
      ? GFXColour.parse(snapshot.values.backgroundColour)
      : snapshot.style.backgroundColour;
    const borderWidth = Math.min(snapshot.style.borderWidth, snapshot.bounds.width / 2, snapshot.bounds.height / 2);
    const border = borderWidth > 0 && !insideRounded(snapshot, local, borderWidth);
    value = colour(border ? snapshot.style.borderColour : animatedBackground);
    value = sourceOver(value, contentPixel(snapshot.content, snapshot, local));
  }
  if (!snapshot.clipsToBounds || insideShape) {
    const ordered = node.children
      .map((child, index) => ({ child, index }))
      .sort((a, b) => a.child.source.layer.zPosition - b.child.source.layer.zPosition || a.index - b.index);
    for (const { child } of ordered)
      value = sourceOver(value, sampleNode(child, worldPoint));
  }
  return value;
}

function shadowPixel(node: RenderNode, local: GFXPoint): Pixel {
  const style = node.source.layer.style;
  if (!style.shadowColour || style.shadowOpacity <= 0) return transparent;
  const radius = Math.min(style.shadowRadius, 64);
  const offsets = radius > 0
    ? [-0.75, -0.35, 0, 0.35, 0.75].map((value) => value * radius)
    : [0];
  let hits = 0, samples = 0;
  for (const oy of offsets) for (const ox of offsets) {
    samples += 1;
    if (insideRounded(node.source.layer, {
      x: local.x - style.shadowOffset.x + ox,
      y: local.y - style.shadowOffset.y + oy,
    })) hits += 1;
  }
  return withAlpha(colour(style.shadowColour), style.shadowOpacity * hits / samples);
}

function sampleNode(node: RenderNode, worldPoint: GFXPoint): Pixel {
  const snapshot = node.source.layer;
  if (snapshot.style.hidden || snapshot.opacity <= 0) return transparent;
  const local = project(worldPoint, node.inverse);
  if (!local) return transparent;
  const body = bodyPixel(node, worldPoint, local);
  const combined = sourceOver(shadowPixel(node, local), body);
  const maskAlpha = node.mask ? sampleNode(node.mask, local).a : 1;
  return withAlpha(combined, snapshot.opacity * maskAlpha);
}

export class AFXCompositionSnapshot {
  readonly root: AFXCompositionNode;
  readonly bounds: GFXRect;
  readonly scale: number;
  readonly time: number;
  readonly nodeCount: number;
  readonly capability: AFXCompositionCapability;

  private constructor(
    root: AFXCompositionNode,
    options: AFXCompositionCaptureOptions,
    nodeCount: number,
    capability: AFXCompositionCapability,
  ) {
    this.root = root;
    this.bounds = Object.freeze(normaliseRect(options.bounds));
    this.scale = options.scale;
    this.time = options.time;
    this.nodeCount = nodeCount;
    this.capability = capability;
    Object.freeze(this);
  }

  static capture(root: AFXLayer, options: AFXCompositionCaptureOptions) {
    if (!(root instanceof AFXLayer)) throw new TypeError("Composition capture requires AFXLayer.");
    const bounds = normaliseRect(options.bounds);
    if (bounds.width <= 0 || bounds.height <= 0)
      throw new RangeError("Composition bounds must be nonempty.");
    const scale = finite(options.scale, "Composition scale", 0.25, 8);
    const time = finite(options.time, "Composition time", 0, Number.MAX_SAFE_INTEGER);
    const budget = { count: 0, unsupported: null as string | null };
    const node = captureNode(root, budget);
    const capability: AFXCompositionCapability = budget.unsupported
      ? Object.freeze({ state: "unsupported", reason: budget.unsupported })
      : Object.freeze({ state: "portable-owned" });
    return new AFXCompositionSnapshot(node, { bounds, scale, time }, budget.count, capability);
  }

  async render(destination: AFXCompositionDestination, signal: AbortSignal): Promise<GFXImage> {
    signal.throwIfAborted();
    if (this.capability.state !== "portable-owned")
      throw new TypeError(`Composition is not portable: ${this.capability.reason ?? "unsupported"}.`);
    const rect = normaliseRect(destination.rect);
    if (rect.width <= 0 || rect.height <= 0)
      throw new RangeError("Composition destination must be nonempty.");
    const pixelWidth = integer(destination.pixelWidth, "Composition pixel width", 1, 4096);
    const pixelHeight = integer(destination.pixelHeight, "Composition pixel height", 1, 4096);
    const pixels = pixelWidth * pixelHeight;
    if (!Number.isSafeInteger(pixels) || pixels > 4_194_304)
      throw new RangeError("Composition destination exceeds four million admitted pixels.");
    finite(destination.scale, "Composition destination scale", 0.25, 8);
    const plan = renderNode(this.root);
    const bytes = new Uint8Array(pixels * 4);
    for (let y = 0; y < pixelHeight; y += 1) {
      if ((y & 15) === 0) {
        signal.throwIfAborted();
        await Promise.resolve();
      }
      for (let x = 0; x < pixelWidth; x += 1) {
        const point = {
          x: rect.x + (x + 0.5) / pixelWidth * rect.width,
          y: rect.y + (y + 0.5) / pixelHeight * rect.height,
        };
        const sample = sampleNode(plan, point);
        const index = (y * pixelWidth + x) * 4;
        bytes[index] = Math.round(Math.max(0, Math.min(1, sample.r)) * 255);
        bytes[index + 1] = Math.round(Math.max(0, Math.min(1, sample.g)) * 255);
        bytes[index + 2] = Math.round(Math.max(0, Math.min(1, sample.b)) * 255);
        bytes[index + 3] = Math.round(Math.max(0, Math.min(1, sample.a)) * 255);
      }
    }
    signal.throwIfAborted();
    return new GFXImage({
      width: pixelWidth,
      height: pixelHeight,
      alpha: "straight",
      colourSpace: "srgb",
      data: bytes,
    });
  }

}
