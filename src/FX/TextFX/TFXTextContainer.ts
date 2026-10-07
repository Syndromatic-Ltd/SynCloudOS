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

import type { GFXRect, GFXSize } from "../GraphicsFX/GFXGeometry";
import type { TFXTextContainerValue, TFXTextTruncation, TFXTextWritingMode } from "./textLayoutTypes";

export interface TFXTextContainerInput {
  readonly size: GFXSize;
  readonly insets?: Partial<TFXTextContainerValue["insets"]>;
  readonly maximumLines?: number;
  readonly truncation?: TFXTextTruncation;
  readonly writingMode?: TFXTextWritingMode;
  readonly flowOrder?: number;
  readonly exclusionRects?: readonly GFXRect[];
}

export function normaliseTFXTextLayoutRecord(value: unknown, label: string, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain data-only object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain data-only object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${label} must not contain symbols.`);
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!allowed.includes(key)) throw new TypeError(`${label} contains unsupported property ${key}.`);
    if (!("value" in descriptor)) throw new TypeError(`${label} must not contain accessors.`);
    result[key] = descriptor.value;
  }
  return result;
}

function finite(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > 1_000_000) throw new RangeError(`${label} must be finite and bounded.`);
  return value;
}

function size(value: unknown): GFXSize {
  const data = normaliseTFXTextLayoutRecord(value, "Text-container size", ["width", "height"]);
  return Object.freeze({ width: finite(data.width, "Width"), height: finite(data.height, "Height") });
}

function rect(value: unknown): GFXRect {
  const data = normaliseTFXTextLayoutRecord(value, "Exclusion rectangle", ["x", "y", "width", "height"]);
  return Object.freeze({ x: finite(data.x, "Rectangle x", -1_000_000), y: finite(data.y, "Rectangle y", -1_000_000), width: finite(data.width, "Rectangle width"), height: finite(data.height, "Rectangle height") });
}

function dense(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${label} must be a bounded dense array.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${label} must not contain symbols.`);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum) throw new TypeError(`${label} must be a bounded dense array.`);
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) throw new TypeError(`${label} must not contain sparse or accessor slots.`);
    result.push(descriptor.value);
  }
  const unexpected = Object.keys(descriptors).find((key) => key !== "length" && !/^(?:0|[1-9]\d*)$/u.test(key));
  if (unexpected) throw new TypeError(`${label} contains unsupported property ${unexpected}.`);
  return result;
}

export class TFXTextContainer implements TFXTextContainerValue {
  readonly size: GFXSize;
  readonly insets: TFXTextContainerValue["insets"];
  readonly maximumLines: number;
  readonly truncation: TFXTextTruncation;
  readonly writingMode: TFXTextWritingMode;
  readonly flowOrder: number;
  readonly exclusionRects: readonly GFXRect[];

  constructor(input: TFXTextContainerInput) {
    const data = normaliseTFXTextLayoutRecord(input, "Text container", ["size", "insets", "maximumLines", "truncation", "writingMode", "flowOrder", "exclusionRects"]);
    this.size = size(data.size);
    const insetData = data.insets === undefined ? {} : normaliseTFXTextLayoutRecord(data.insets, "Text-container insets", ["blockStart", "inlineEnd", "blockEnd", "inlineStart"]);
    this.insets = Object.freeze({
      blockStart: finite(insetData.blockStart ?? 0, "Block-start inset"),
      inlineEnd: finite(insetData.inlineEnd ?? 0, "Inline-end inset"),
      blockEnd: finite(insetData.blockEnd ?? 0, "Block-end inset"),
      inlineStart: finite(insetData.inlineStart ?? 0, "Inline-start inset"),
    });
    if (this.insets.inlineStart + this.insets.inlineEnd > this.size.width || this.insets.blockStart + this.insets.blockEnd > this.size.height) {
      throw new RangeError("Text-container insets exceed its size.");
    }
    const maximumLines = data.maximumLines ?? 10_000;
    if (!Number.isSafeInteger(maximumLines) || (maximumLines as number) < 1 || (maximumLines as number) > 10_000) throw new RangeError("Maximum lines must be a bounded positive integer.");
    this.maximumLines = maximumLines as number;
    const truncation = data.truncation ?? "none";
    if (truncation !== "none" && truncation !== "head" && truncation !== "middle" && truncation !== "tail") throw new TypeError("Text truncation is invalid.");
    this.truncation = truncation;
    const writingMode = data.writingMode ?? "horizontal-tb";
    if (writingMode !== "horizontal-tb" && writingMode !== "vertical-rl" && writingMode !== "vertical-lr") throw new TypeError("Writing mode is invalid.");
    this.writingMode = writingMode;
    const flowOrder = data.flowOrder ?? 0;
    if (!Number.isSafeInteger(flowOrder) || (flowOrder as number) < -1_000_000 || (flowOrder as number) > 1_000_000) throw new RangeError("Text-container flow order must be a bounded integer.");
    this.flowOrder = flowOrder as number;
    this.exclusionRects = Object.freeze(dense(data.exclusionRects ?? [], "Exclusion rectangles", 1_024).map(rect));
    Object.freeze(this);
  }
}

export function snapshotTFXTextContainers(value: unknown): readonly TFXTextContainerValue[] {
  const containers = dense(value, "Text containers", 64);
  if (containers.length === 0) throw new RangeError("Text layout requires at least one container.");
  return Object.freeze(containers.map((container) => {
    if (!(container instanceof TFXTextContainer)) throw new TypeError("Text-container slots must contain canonical TFXTextContainer values.");
    return Object.freeze({
      size: container.size,
      insets: container.insets,
      maximumLines: container.maximumLines,
      truncation: container.truncation,
      writingMode: container.writingMode,
      flowOrder: container.flowOrder,
      exclusionRects: container.exclusionRects,
    });
  }));
}
