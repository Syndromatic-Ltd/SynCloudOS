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

import { AFXLayer } from "./AFXLayer";
import { TFXLine } from "../TextFX/TFXLine";
import {
  TFXGlyphDrawing,
  type TFXGlyphOutline,
} from "../TextFX/TFXGlyphDrawing";
import { GFXColour } from "../GraphicsFX/GFXColour";
import { normalisePoint, type GFXPoint } from "../GraphicsFX/GFXGeometry";
import { layerColour } from "./AFXLayerStyle";
/** Displays a supplied shaped line. Text shaping, fallback and layout remain owned by TextFX. */
export class AFXTextLayer extends AFXLayer {
  #line: TFXLine | null = null;
  #origin: GFXPoint = normalisePoint({ x: 0, y: 0 });
  #colour = GFXColour.grayscale(0);
  #glyphs: readonly TFXGlyphOutline[] = Object.freeze([]);
  get line() {
    return this.#line;
  }
  set line(value: TFXLine | null) {
    if (value !== null && !(value instanceof TFXLine))
      throw new TypeError("Text layer requires a shaped TFXLine.");
    const glyphs = value
      ? TFXGlyphDrawing.pathsForLine(value, this.#origin)
      : Object.freeze([]);
    this.setLayerContent(
      "line",
      Object.freeze({ kind: "text", glyphs, foregroundColour: this.#colour }),
    );
    this.#line = value;
    this.#glyphs = glyphs;
  }
  get baselineOrigin() {
    return this.#origin;
  }
  set baselineOrigin(value: GFXPoint) {
    const origin = normalisePoint(value),
      glyphs = this.#line
        ? TFXGlyphDrawing.pathsForLine(this.#line, origin)
        : Object.freeze([]);
    this.setLayerContent(
      "baselineOrigin",
      Object.freeze({ kind: "text", glyphs, foregroundColour: this.#colour }),
    );
    this.#origin = origin;
    this.#glyphs = glyphs;
  }
  get foregroundColour() {
    return this.#colour;
  }
  set foregroundColour(value: GFXColour) {
    if (!value) throw new TypeError("Text foreground requires GFXColour.");
    const colour = layerColour(value)!;
    this.setLayerContent(
      "foregroundColour",
      Object.freeze({
        kind: "text",
        glyphs: this.#glyphs,
        foregroundColour: colour,
      }),
    );
    this.#colour = colour;
  }
  get glyphOutlines() {
    return this.#glyphs;
  }
}
