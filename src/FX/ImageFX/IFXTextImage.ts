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

import type { GFXPathCommand } from "../GraphicsFX/graphicsTypes";
import type { GFXRect } from "../GraphicsFX/GFXGeometry";
import { TFXAttributedString } from "../TextFX/TFXAttributedString";
import { TFXFont } from "../TextFX/TFXFont";
import { TFXGlyphDrawing } from "../TextFX/TFXGlyphDrawing";
import { TFXTypesetter } from "../TextFX/TFXTypesetter";
import { IFXFilterRegistry } from "./IFXFilterRegistry";
import type { IFXImage } from "./IFXImage";

export interface IFXTextImageOptions {
  readonly scaleFactor: number;
  readonly padding: number;
  readonly signal?: AbortSignal;
}

function optionNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new RangeError(`${label} is outside its supported range.`);
  return value;
}

function snapshot(attributed: TFXAttributedString, options: IFXTextImageOptions): Readonly<{
  text: string;
  scaleFactor: number;
  padding: number;
  extent: GFXRect;
  paths: readonly (readonly GFXPathCommand[])[];
}> {
  if (!(attributed instanceof TFXAttributedString)) throw new TypeError("A TFXAttributedString is required.");
  if (!options || typeof options !== "object") throw new TypeError("Text image options are required.");
  const scaleFactor = optionNumber(options.scaleFactor, "Text image scaleFactor", 1 / 64, 64);
  const padding = optionNumber(options.padding, "Text image padding", 0, 4096);
  options.signal?.throwIfAborted();
  const line = new TFXTypesetter(attributed).createLine(0, attributed.text.length, options.signal);
  const drawings = TFXGlyphDrawing.drawingsForLine(line, { x: 0, y: 0 }, options.signal);
  if (drawings.some(drawing => !("path" in drawing))) throw new TypeError("Text image snapshots do not accept inline image attachments.");
  const outlines = drawings.filter((drawing): drawing is Extract<(typeof drawings)[number], { readonly path: unknown }> => "path" in drawing);
  let commands = 0;
  for (const outline of outlines) {
    commands += outline.path.commands.length;
    if (commands > 100_000) throw new RangeError("Text image snapshot exceeds its path-command work limit.");
  }
  const nonempty = outlines.filter(outline => outline.path.commands.length > 0);
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  if (nonempty.length) {
    minX = Math.min(...nonempty.map(outline => outline.path.bounds.x));
    minY = Math.min(...nonempty.map(outline => outline.path.bounds.y));
    maxX = Math.max(...nonempty.map(outline => outline.path.bounds.x + outline.path.bounds.width));
    maxY = Math.max(...nonempty.map(outline => outline.path.bounds.y + outline.path.bounds.height));
  } else {
    maxX = line.width;
    const heights = line.runs.map(run => run.font.ascent + run.font.descent);
    maxY = heights.length ? Math.max(...heights) : 1;
  }
  const tx = padding - minX * scaleFactor, ty = padding - minY * scaleFactor;
  const paths = Object.freeze(outlines.map(outline => Object.freeze([
    ...outline.path.transformed({ a: scaleFactor, b: 0, c: 0, d: scaleFactor, tx, ty }).commands,
  ])));
  const width = Math.max(1, Math.ceil((maxX - minX) * scaleFactor + padding * 2));
  const height = Math.max(1, Math.ceil((maxY - minY) * scaleFactor + padding * 2));
  if (width > 16_384 || height > 16_384 || width * height > 64 * 1024 * 1024) throw new RangeError("Text image extent exceeds its output work limit.");
  return Object.freeze({
    text: attributed.text,
    scaleFactor,
    padding,
    extent: Object.freeze({ x: 0, y: 0, width, height }),
    paths,
  });
}

/** Shapes with the supplied live TextFX font, then stores only owned outline data in the ImageFX graph. */
export function createIFXTextImage(text: string, font: TFXFont, options: IFXTextImageOptions): IFXImage {
  if (typeof text !== "string" || text.length === 0 || text.length > 65_536) throw new RangeError("Text image source must be nonempty bounded text.");
  if (!(font instanceof TFXFont)) throw new TypeError("A live TFXFont is required.");
  const data = snapshot(new TFXAttributedString(text, [{ start: 0, end: text.length, font }]), options);
  return new IFXFilterRegistry().create("textImage", {
    ...data,
    fontName: font.familyName,
    fontSize: font.descriptor.size,
  }).apply();
}

/** Shapes all TextFX attributed runs first; no font or attributed-string object crosses into the serializable graph. */
export function createIFXAttributedTextImage(attributed: TFXAttributedString, options: IFXTextImageOptions): IFXImage {
  const data = snapshot(attributed, options);
  return new IFXFilterRegistry().create("attributedTextImage", data).apply();
}
