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

import { GFXPath } from "../../FX/GraphicsFX/GFXPath";
import { GFXColour } from "../../FX/GraphicsFX/GFXColour";
import { GFXGradient } from "../../FX/GraphicsFX/GFXGradient";
import { normaliseRect, type GFXRect } from "../../FX/GraphicsFX/GFXGeometry";
import type { AFXLayerContent } from "../../FX/AnimationFX/AFXLayerContent";
import type { AFXContentsGravity } from "../../FX/AnimationFX/AFXLayer";
import { imagePNGDataURL } from "../../FX/GraphicsFX/imagePNG";
import { GFXImage } from "../../FX/GraphicsFX/GFXImage";
const emitterImageURLs = new WeakMap<GFXImage, string>();
const emitterImageURL = (image: GFXImage) => {
  let value = emitterImageURLs.get(image);
  if (!value) {
    value = imagePNGDataURL(image);
    emitterImageURLs.set(image, value);
  }
  return value;
};
export interface AFXLayerContentGeometry {
  readonly contentsRect: GFXRect;
  readonly contentsCenter: GFXRect;
  readonly contentsGravity: AFXContentsGravity;
}
const unit = (rect: GFXRect) =>
  rect.x === 0 && rect.y === 0 && rect.width === 1 && rect.height === 1;
function projectedImage(
  image: GFXImage,
  rect: GFXRect,
): { readonly image: GFXImage; readonly width: number; readonly height: number } {
  const width = Math.max(1, Math.ceil(rect.width * image.width));
  const height = Math.max(1, Math.ceil(rect.height * image.height));
  if (width * height > 4_194_304)
    throw new RangeError("Layer content crop exceeds four million source samples.");
  if (unit(rect)) return { image, width: image.width, height: image.height };
  const bytes = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const source = image.sample(
        {
          x: (rect.x + ((x + 0.5) / width) * rect.width) * image.width,
          y: (rect.y + ((y + 0.5) / height) * rect.height) * image.height,
        },
        { interpolation: "nearest", edge: "clamp" },
      );
      const i = (y * width + x) * 4;
      bytes[i] = Math.round(source.r * 255);
      bytes[i + 1] = Math.round(source.g * 255);
      bytes[i + 2] = Math.round(source.b * 255);
      bytes[i + 3] = Math.round(source.a * 255);
    }
  return {
    image: new GFXImage({
      width,
      height,
      alpha: "straight",
      colourSpace: image.colourSpace,
      data: bytes,
    }),
    width,
    height,
  };
}
function gravityRect(
  bounds: GFXRect,
  width: number,
  height: number,
  gravity: AFXContentsGravity,
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
  return normaliseRect({
    x: left ? bounds.x : right ? bounds.x + bounds.width - w : bounds.x + (bounds.width - w) / 2,
    y: top ? bounds.y : bottom ? bounds.y + bounds.height - h : bounds.y + (bounds.height - h) / 2,
    width: Math.max(0, w),
    height: Math.max(0, h),
  });
}
function imageContentSVG(
  image: GFXImage,
  bounds: GFXRect,
  geometry: AFXLayerContentGeometry,
): string {
  const crop = geometry.contentsRect;
  if (unit(geometry.contentsCenter) && crop.x >= 0 && crop.y >= 0 &&
      crop.x + crop.width <= 1 && crop.y + crop.height <= 1) {
    // A contentsRect is a viewport into the same image. Keep one encoded
    // source for every layer instead of allocating a cropped image per view.
    const sourceWidth = Math.max(1, Math.ceil(crop.width * image.width));
    const sourceHeight = Math.max(1, Math.ceil(crop.height * image.height));
    const destination = gravityRect(bounds, sourceWidth, sourceHeight, geometry.contentsGravity);
    return `<svg x="${destination.x}" y="${destination.y}" width="${destination.width}" height="${destination.height}" viewBox="${crop.x * image.width} ${crop.y * image.height} ${crop.width * image.width} ${crop.height * image.height}" preserveAspectRatio="none" overflow="hidden"><image href="${emitterImageURL(image)}" x="0" y="0" width="${image.width}" height="${image.height}" preserveAspectRatio="none"/></svg>`;
  }
  const source = projectedImage(image, geometry.contentsRect);
  const destination = gravityRect(bounds, source.width, source.height, geometry.contentsGravity);
  const centre = geometry.contentsCenter;
  const sx = [0, centre.x * source.width, (centre.x + centre.width) * source.width, source.width];
  const sy = [0, centre.y * source.height, (centre.y + centre.height) * source.height, source.height];
  const fixedWidth = sx[1]! + (source.width - sx[2]!);
  const fixedHeight = sy[1]! + (source.height - sy[2]!);
  const xScale = fixedWidth > destination.width && fixedWidth > 0 ? destination.width / fixedWidth : 1;
  const yScale = fixedHeight > destination.height && fixedHeight > 0 ? destination.height / fixedHeight : 1;
  const left = sx[1]! * xScale, right = (source.width - sx[2]!) * xScale;
  const top = sy[1]! * yScale, bottom = (source.height - sy[2]!) * yScale;
  const dx = [destination.x, destination.x + left, destination.x + destination.width - right, destination.x + destination.width];
  const dy = [destination.y, destination.y + top, destination.y + destination.height - bottom, destination.y + destination.height];
  let result = "";
  for (let row = 0; row < 3; row += 1)
    for (let column = 0; column < 3; column += 1) {
      const sw = sx[column + 1]! - sx[column]!;
      const sh = sy[row + 1]! - sy[row]!;
      const dw = dx[column + 1]! - dx[column]!;
      const dh = dy[row + 1]! - dy[row]!;
      if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) continue;
      const slice = projectedImage(source.image, {
        x: sx[column]! / source.width,
        y: sy[row]! / source.height,
        width: sw / source.width,
        height: sh / source.height,
      });
      result += `<svg x="${dx[column]}" y="${dy[row]}" width="${dw}" height="${dh}" viewBox="0 0 ${slice.width} ${slice.height}" preserveAspectRatio="none" overflow="hidden"><image href="${emitterImageURL(slice.image)}" x="0" y="0" width="${slice.width}" height="${slice.height}" preserveAspectRatio="none"/></svg>`;
    }
  if (result.length > 1_000_000)
    throw new RangeError("Projected layer image exceeds one million characters.");
  return result;
}
const finite = (value: number) => {
  if (!Number.isFinite(value))
    throw new RangeError("SVG content requires finite numbers.");
  return value;
};
const token = <T extends string>(value: T, allowed: readonly T[]) => {
  if (!allowed.includes(value)) throw new TypeError("Unsupported shape style.");
  return value;
};
export function layerSVGColour(value: GFXColour | null): string {
  if (value === null) return "none";
  if (!(value instanceof GFXColour))
    throw new TypeError("SVG colours require GFXColour.");
  const { r, g, b, a } = GFXColour.prototype.converting.call(
    value,
    "srgb",
  ).components;
  return GFXColour.rgba(r, g, b, a).toCSS();
}
/** Markup consists only of validated canonical geometry/numeric/colour values and private IDs. */
export function layerContentSVG(
  content: AFXLayerContent | null | undefined,
  bounds: GFXRect,
  id: string,
  geometry: AFXLayerContentGeometry = {
    contentsRect: { x: 0, y: 0, width: 1, height: 1 },
    contentsCenter: { x: 0, y: 0, width: 1, height: 1 },
    contentsGravity: "resize",
  },
): string {
  if (!content) return "";
  const box = normaliseRect(bounds);
  if (content.kind === "image") {
    if (!(content.image instanceof GFXImage))
      throw new TypeError("Image layer content requires a canonical GFXImage.");
    return imageContentSVG(content.image, box, geometry);
  }
  if (!unit(geometry.contentsRect) || !unit(geometry.contentsCenter) || geometry.contentsGravity !== "resize")
    throw new TypeError("Non-image layer content does not support contentsRect/contentsCenter/gravity projection.");
  if (content.kind === "tiled") {
    if (!Array.isArray(content.tiles) || content.tiles.length > 256)
      throw new RangeError("Tiled layer exceeds its visible tile budget.");
    return content.tiles.map((tile) => {
      const rect = normaliseRect(tile.rect);
      if (!(tile.image instanceof GFXImage) || !Number.isInteger(tile.level) || !Number.isFinite(tile.scale) || tile.scale <= 0 || !Number.isFinite(tile.fadeDuration) || tile.fadeDuration < 0 || tile.fadeDuration > 2)
        throw new TypeError("Invalid canonical tile content.");
      return `<image data-afx-tile="${tile.key}" data-afx-tile-level="${tile.level}" href="${emitterImageURL(tile.image)}" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" preserveAspectRatio="none">${tile.fadeDuration ? `<animate attributeName="opacity" from="0" to="1" dur="${tile.fadeDuration}s" fill="freeze"/>` : ""}</image>`;
    }).join("");
  }
  if (content.kind === "emitter") {
    if (!Array.isArray(content.particles) || content.particles.length > 2048)
      throw new RangeError("Emitter layer exceeds its particle budget.");
    const resources = new Map<GFXImage, { id: string; markup: string }>();
    for (const particle of content.particles) {
      if (!resources.has(particle.contents)) {
        const resourceId = `${id}-emitter-image-${resources.size}`;
        resources.set(particle.contents, {
          id: resourceId,
          markup: `<image id="${resourceId}" href="${emitterImageURL(particle.contents)}" width="${particle.contents.width}" height="${particle.contents.height}"/>`,
        });
      }
    }
    const particles = content.particles
      .map((particle, index) => {
        if (!Number.isSafeInteger(particle.id) || particle.id < 1)
          throw new TypeError("Invalid particle identity.");
        const position = normaliseRect({
          x: particle.position.x,
          y: particle.position.y,
          width: particle.contents.width,
          height: particle.contents.height,
        });
        const scale = finite(particle.scale),
          rotation = finite(particle.rotation),
          zPosition = finite(particle.zPosition);
        if (!Number.isSafeInteger(particle.renderOrder))
          throw new TypeError("Invalid particle render order.");
        if (scale < 0) throw new RangeError("Particle scale cannot be negative.");
        const colour = particle.colour.converting("srgb").components;
        const filterId = `${id}-particle-${index}`;
        const resource = resources.get(particle.contents)!;
        return (
          `<g data-afx-particle="${particle.id}" data-afx-z="${zPosition}" data-afx-render-order="${particle.renderOrder}" transform="translate(${position.x} ${position.y}) rotate(${rotation * 180 / Math.PI}) scale(${scale})">` +
          `<defs><filter id="${filterId}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${colour.r} 0 0 0 0 0 ${colour.g} 0 0 0 0 0 ${colour.b} 0 0 0 0 0 ${colour.a} 0"/></filter></defs>` +
          `<use href="#${resource.id}" x="${-position.width / 2}" y="${-position.height / 2}" filter="url(#${filterId})"/>` +
          `</g>`
        );
      })
      .join("");
    return `<defs>${[...resources.values()].map(({ markup }) => markup).join("")}</defs>${particles}`;
  }
  if (content.kind === "text") {
    if (!Array.isArray(content.glyphs) || content.glyphs.length > 10000)
      throw new RangeError("Text layer exceeds its glyph budget.");
    let commands = 0;
    const paths = content.glyphs
      .map((glyph) => {
        if (
          !Number.isInteger(glyph.glyphId) ||
          glyph.glyphId < 0 ||
          !Number.isInteger(glyph.stringIndex) ||
          glyph.stringIndex < 0
        )
          throw new TypeError("Invalid shaped glyph identity.");
        const embedding = token(glyph.embedding, [
          "allowed",
          "restricted",
          "unknown",
        ]);
        const path = new GFXPath(glyph.path.commands);
        commands += path.commands.length;
        if (commands > 100000)
          throw new RangeError("Text layer exceeds its outline budget.");
        return (
          '<path d="' +
          path.toSVGPathData() +
          '" data-tfx-glyph="' +
          glyph.glyphId +
          '" data-string-index="' +
          glyph.stringIndex +
          '" data-font-embedding="' +
          embedding +
          '"/>'
        );
      })
      .join("");
    return (
      '<g fill="' +
      layerSVGColour(content.foregroundColour) +
      '">' +
      paths +
      "</g>"
    );
  }
  if (content.kind === "shape") {
    if (!content.path) return "";
    const path = new GFXPath(content.path.commands),
      d = path.toSVGPathData();
    const width = finite(content.lineWidth),
      start = finite(content.strokeStart),
      end = finite(content.strokeEnd);
    if (width < 0 || start < 0 || end > 1 || start > 1 || end < 0)
      throw new RangeError("Invalid shape stroke extent.");
    const cap = token(content.lineCap, ["butt", "round", "square"]),
      join = token(content.lineJoin, ["miter", "round", "bevel"]),
      rule = token(content.fillRule, ["nonzero", "evenodd"]);
    if (
      !Array.isArray(content.lineDashPattern) ||
      content.lineDashPattern.length > 64
    )
      throw new RangeError("Invalid dash pattern.");
    const dash = content.lineDashPattern
      .map((value) => {
        if (finite(value) < 0) throw new RangeError("Negative dash.");
        return value;
      })
      .join(" ");
    const fill =
      '<path d="' +
      d +
      '" fill="' +
      layerSVGColour(content.fillColour) +
      '" fill-rule="' +
      rule +
      '"/>';
    if (!content.strokeColour || width === 0 || start >= end) return fill;
    const trim = start !== 0 || end !== 1;
    const common =
      ' d="' +
      d +
      '" fill="none" stroke-width="' +
      width +
      '" stroke-linecap="' +
      cap +
      '" stroke-linejoin="' +
      join +
      '" stroke-miterlimit="' +
      finite(content.miterLimit) +
      '"';
    const trimmedCommon = trim
      ? common.replace(
          ' d="' + d + '"',
          ' d="' + path.trimmed(start, end).toSVGPathData() + '"',
        )
      : common;
    const mask = trim
      ? '<defs><mask id="' +
        id +
        '-trim" maskUnits="userSpaceOnUse" x="' +
        (box.x - width) +
        '" y="' +
        (box.y - width) +
        '" width="' +
        (box.width + width * 2) +
        '" height="' +
        (box.height + width * 2) +
        '" style="mask-type:alpha"><path' +
        trimmedCommon +
        ' stroke="white"/></mask></defs>'
      : "";
    return (
      fill +
      mask +
      "<path" +
      common +
      ' stroke="' +
      layerSVGColour(content.strokeColour) +
      '" stroke-dasharray="' +
      (dash || "none") +
      '" stroke-dashoffset="' +
      finite(content.lineDashPhase) +
      '"' +
      (trim ? ' mask="url(#' + id + '-trim)"' : "") +
      "/>"
    );
  }
  if (content.kind === "gradient") {
    if (!content.gradient) return "";
    const source = content.gradient;
    const gradient = new GFXGradient(source.stops, source.geometry, {
      units: source.units,
      transform: source.transform,
    });
    const g = gradient.geometry,
      t = gradient.transform;
    const transform =
      "matrix(" + [t.a, t.b, t.c, t.d, t.tx, t.ty].join(" ") + ")";
    const tag = g.kind === "linear" ? "linearGradient" : "radialGradient";
    const geometry =
      g.kind === "linear"
        ? 'x1="' +
          g.start.x +
          '" y1="' +
          g.start.y +
          '" x2="' +
          g.end.x +
          '" y2="' +
          g.end.y +
          '"'
        : 'cx="' +
          g.centre.x +
          '" cy="' +
          g.centre.y +
          '" r="' +
          g.radius +
          '"';
    const stops = gradient.stops
      .map(
        (stop) =>
          '<stop offset="' +
          stop.offset +
          '" stop-color="' +
          layerSVGColour(stop.colour) +
          '"/>',
      )
      .join("");
    return (
      "<defs><" +
      tag +
      ' id="' +
      id +
      '-gradient" gradientUnits="' +
      gradient.units +
      '" gradientTransform="' +
      transform +
      '" ' +
      geometry +
      ' color-interpolation="sRGB">' +
      stops +
      "</" +
      tag +
      '></defs><rect x="' +
      box.x +
      '" y="' +
      box.y +
      '" width="' +
      box.width +
      '" height="' +
      box.height +
      '" fill="url(#' +
      id +
      '-gradient)"/>'
    );
  }
  throw new TypeError("Unsupported layer content.");
}
