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
import { GFXGradient } from "../GraphicsFX/GFXGradient";
import { GFXColour } from "../GraphicsFX/GFXColour";
import { normalisePoint, type GFXPoint } from "../GraphicsFX/GFXGeometry";
import type { GFXGradientGeometry, GFXGradientStop } from "../GraphicsFX/graphicsTypes";
import type { AFXLayerContent } from "./AFXLayerContent";
import type { AFXAnimationScalar } from "./animationTypes";
export class AFXGradientLayer extends AFXLayer {
  #gradient: GFXGradient | null = null;
  #replace(
    operation: string,
    stops: readonly GFXGradientStop[],
    geometry: GFXGradientGeometry,
  ) {
    const current = this.gradient;
    const next = new GFXGradient(stops, geometry, {
      units: current?.units ?? "objectBoundingBox",
      transform: current?.transform,
    });
    this.setLayerContent(operation, Object.freeze({ kind: "gradient", gradient: next }), "gradient");
    this.#gradient = next;
  }
  get gradient() {
    const content = this.model.content;
    return content?.kind === "gradient" ? content.gradient : this.#gradient;
  }
  set gradient(value: GFXGradient | null) {
    if (value !== null && !(value instanceof GFXGradient))
      throw new TypeError("Gradient layer requires GFXGradient.");
    this.setLayerContent("gradient", Object.freeze({ kind: "gradient", gradient: value }), "gradient");
    this.#gradient = value;
  }
  get colours(): readonly GFXColour[] {
    return Object.freeze(this.gradient?.stops.map((stop) => stop.colour) ?? []);
  }
  set colours(value: readonly GFXColour[]) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 64)
      throw new RangeError("Gradient colours require a bounded array of 1–64 colours.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const colours = Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !(descriptor.value instanceof GFXColour))
        throw new TypeError("Gradient colours require canonical GFXColour values.");
      return descriptor.value as GFXColour;
    });
    const current = this.gradient;
    if (current && current.stops.length !== colours.length)
      throw new RangeError("Gradient colour count must match the current location count.");
    const offsets = current
      ? current.stops.map((stop) => stop.offset)
      : colours.map((_, index) => (colours.length === 1 ? 0 : index / (colours.length - 1)));
    this.#replace(
      "colours",
      colours.map((colour, index) => ({ offset: offsets[index]!, colour })),
      current?.geometry ?? { kind: "linear", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    );
  }
  get locations(): readonly number[] {
    return Object.freeze(this.gradient?.stops.map((stop) => stop.offset) ?? []);
  }
  set locations(value: readonly number[]) {
    const current = this.gradient;
    if (!current) throw new Error("Gradient locations require existing colours.");
    if (!Array.isArray(value) || value.length !== current.stops.length)
      throw new RangeError("Gradient location count must match the current colour count.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    let previous = -Infinity;
    const locations = Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      const location = descriptor && "value" in descriptor ? descriptor.value : NaN;
      if (
        typeof location !== "number" ||
        !Number.isFinite(location) ||
        location < 0 ||
        location > 1 ||
        location < previous
      )
        throw new RangeError("Gradient locations must be finite, ordered values from zero to one.");
      previous = location;
      return location;
    });
    this.#replace(
      "locations",
      current.stops.map((stop, index) => ({ ...stop, offset: locations[index]! })),
      current.geometry,
    );
  }
  get startPoint(): GFXPoint | null {
    const geometry = this.gradient?.geometry;
    return geometry?.kind === "linear" ? geometry.start : null;
  }
  set startPoint(value: GFXPoint) {
    const current = this.gradient;
    if (!current || current.geometry.kind !== "linear")
      throw new TypeError("startPoint requires an existing linear gradient.");
    this.#replace("startPoint", current.stops, {
      ...current.geometry,
      start: normalisePoint(value),
    });
  }
  get endPoint(): GFXPoint | null {
    const geometry = this.gradient?.geometry;
    return geometry?.kind === "linear" ? geometry.end : null;
  }
  set endPoint(value: GFXPoint) {
    const current = this.gradient;
    if (!current || current.geometry.kind !== "linear")
      throw new TypeError("endPoint requires an existing linear gradient.");
    this.#replace("endPoint", current.stops, {
      ...current.geometry,
      end: normalisePoint(value),
    });
  }
  protected override supportsContentAnimation(keyPath: string) {
    return keyPath === "gradient";
  }
  protected override presentationContent(content: AFXLayerContent | null, values: Readonly<Record<string, AFXAnimationScalar>>) {
    if (content?.kind !== "gradient" || values.gradient === undefined) return content;
    if (!(values.gradient instanceof GFXGradient)) throw new TypeError("Animated gradient requires GFXGradient values.");
    return Object.freeze({ ...content, gradient: values.gradient });
  }
}
