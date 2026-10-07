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

import { AFXAnimation } from "./AFXAnimation";
import type {
  AFXAnimationKeyPath,
  AFXAnimationTiming,
  AFXReducedMotionPolicy,
} from "./animationTypes";

export type AFXLayerActionKey = Extract<
  AFXAnimationKeyPath,
  "frame" | "transform" | "sublayerTransform" | "opacity" | "backgroundColour" | "boxShadow" | "scrollPosition"
>;

export interface AFXLayerAction {
  readonly duration: number;
  readonly delay?: number;
  readonly timing?: AFXAnimationTiming;
  readonly reducedMotion?: AFXReducedMotionPolicy;
}

export type AFXLayerActionMap = Readonly<
  Partial<Record<AFXLayerActionKey, AFXLayerAction | null>>
>;

const keys = Object.freeze([
  "frame",
  "transform",
  "sublayerTransform",
  "opacity",
  "backgroundColour",
  "boxShadow",
  "scrollPosition",
] as const satisfies readonly AFXLayerActionKey[]);

export function normaliseAFXLayerAction(
  value: AFXLayerAction,
  label = "layer action",
): AFXLayerAction {
  if (
    !value ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length
  )
    throw new TypeError(`${label} must be a plain data record.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    !descriptors.duration ||
    !("value" in descriptors.duration) ||
    Object.keys(descriptors).some(
      (key) =>
        !["duration", "delay", "timing", "reducedMotion"].includes(key) ||
        !("value" in descriptors[key]!),
    )
  )
    throw new TypeError(`${label} contains unsupported fields.`);
  const canonical = new AFXAnimation({
    duration: descriptors.duration.value as number,
    delay: descriptors.delay?.value,
    timing: descriptors.timing?.value,
    reducedMotion: descriptors.reducedMotion?.value,
  });
  return Object.freeze({
    duration: canonical.duration,
    ...(descriptors.delay ? { delay: canonical.delay } : {}),
    ...(descriptors.timing ? { timing: canonical.timing } : {}),
    ...(descriptors.reducedMotion
      ? { reducedMotion: canonical.reducedMotion }
      : {}),
  });
}

export function normaliseAFXLayerActions(value: AFXLayerActionMap): AFXLayerActionMap {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length
  )
    throw new TypeError("Layer actions must be a plain data record.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Partial<Record<AFXLayerActionKey, AFXLayerAction | null>> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!keys.includes(key as AFXLayerActionKey) || !("value" in descriptor))
      throw new TypeError(`Unsupported layer action key: ${key}.`);
    const item = descriptor.value as AFXLayerAction | null;
    result[key as AFXLayerActionKey] =
      item === null ? null : normaliseAFXLayerAction(item, `${key} action`);
  }
  return Object.freeze(result);
}

export function normaliseAFXLayerActionResult(
  value: AFXLayerAction | null | undefined,
  label: string,
): AFXLayerAction | null | undefined {
  return value == null ? value : normaliseAFXLayerAction(value, label);
}
