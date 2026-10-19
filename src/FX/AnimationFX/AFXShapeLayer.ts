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
import { GFXPath } from "../GraphicsFX/GFXPath";
import { GFXColour } from "../GraphicsFX/GFXColour";
import { layerColour, layerFinite } from "./AFXLayerStyle";
import type { AFXLayerContent, AFXShapeContent } from "./AFXLayerContent";
import type { AFXAnimationScalar } from "./animationTypes";
export class AFXShapeLayer extends AFXLayer {
  #shape: AFXShapeContent = Object.freeze({
    kind: "shape",
    path: null,
    fillColour: GFXColour.grayscale(0),
    strokeColour: null,
    fillRule: "nonzero",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    miterLimit: 10,
    lineDashPattern: Object.freeze([]),
    lineDashPhase: 0,
    strokeStart: 0,
    strokeEnd: 1,
  });
  #set<K extends keyof AFXShapeContent>(key: K, value: AFXShapeContent[K]) {
    const next = Object.freeze({ ...this.#shape, [key]: value });
    this.setLayerContent(key, next, key === "path" ? "path" : undefined);
    this.#shape = next;
  }
  protected override supportsContentAnimation(keyPath: string) {
    return keyPath === "path";
  }
  protected override presentationContent(content: AFXLayerContent | null, values: Readonly<Record<string, AFXAnimationScalar>>) {
    if (content?.kind !== "shape" || values.path === undefined) return content;
    if (!(values.path instanceof GFXPath)) throw new TypeError("Animated shape path requires GFXPath values.");
    return Object.freeze({ ...content, path: values.path });
  }
  get path() {
    const content = this.model.content;
    return content?.kind === "shape" ? content.path : this.#shape.path;
  }
  set path(value: GFXPath | null) {
    if (value !== null && !(value instanceof GFXPath))
      throw new TypeError("Shape path requires GFXPath.");
    this.#set("path", value);
  }
  get fillColour() {
    return this.#shape.fillColour;
  }
  set fillColour(value: GFXColour | null) {
    this.#set("fillColour", layerColour(value));
  }
  get strokeColour() {
    return this.#shape.strokeColour;
  }
  set strokeColour(value: GFXColour | null) {
    this.#set("strokeColour", layerColour(value));
  }
  get fillRule() {
    return this.#shape.fillRule;
  }
  set fillRule(value: AFXShapeContent["fillRule"]) {
    if (!["nonzero", "evenodd"].includes(value))
      throw new TypeError("Invalid shape fill rule.");
    this.#set("fillRule", value);
  }
  get lineWidth() {
    return this.#shape.lineWidth;
  }
  set lineWidth(value: number) {
    this.#set("lineWidth", layerFinite(value, "line width", 0));
  }
  get miterLimit() {
    return this.#shape.miterLimit;
  }
  set miterLimit(value: number) {
    this.#set("miterLimit", layerFinite(value, "miter limit", 1));
  }
  get lineCap() {
    return this.#shape.lineCap;
  }
  set lineCap(value: AFXShapeContent["lineCap"]) {
    if (!["butt", "round", "square"].includes(value))
      throw new TypeError("Invalid line cap.");
    this.#set("lineCap", value);
  }
  get lineJoin() {
    return this.#shape.lineJoin;
  }
  set lineJoin(value: AFXShapeContent["lineJoin"]) {
    if (!["miter", "round", "bevel"].includes(value))
      throw new TypeError("Invalid line join.");
    this.#set("lineJoin", value);
  }
  get lineDashPhase() {
    return this.#shape.lineDashPhase;
  }
  set lineDashPhase(value: number) {
    this.#set("lineDashPhase", layerFinite(value, "dash phase"));
  }
  get lineDashPattern() {
    return this.#shape.lineDashPattern;
  }
  set lineDashPattern(value: readonly number[]) {
    if (!Array.isArray(value) || value.length > 64)
      throw new TypeError("Dash pattern requires at most64 entries.");
    const next = Array.from(value, (x) => layerFinite(x, "dash length", 0));
    if (next.length && !next.some((x) => x > 0))
      throw new RangeError("Dash period must be positive.");
    this.#set("lineDashPattern", Object.freeze(next));
  }
  get strokeStart() {
    return this.#shape.strokeStart;
  }
  set strokeStart(value: number) {
    this.#set("strokeStart", layerFinite(value, "stroke start", 0, 1));
  }
  get strokeEnd() {
    return this.#shape.strokeEnd;
  }
  set strokeEnd(value: number) {
    this.#set("strokeEnd", layerFinite(value, "stroke end", 0, 1));
  }
}
