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

import { normaliseRuntimeCursorDescriptor } from "../../SynCloudOS/nseRuntimeContracts";
import type { NSECursorDescriptor, NSESystemCursor } from "./cursorTypes";

function imageField(descriptors: PropertyDescriptorMap, key: string): unknown {
  const descriptor = descriptors[key];
  if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
    throw new TypeError(`Cursor image.${key} must be an enumerable own data property.`);
  }
  return descriptor.value;
}

export const NSECursor = Object.freeze({
  system(kind: NSESystemCursor): NSECursorDescriptor {
    return normaliseRuntimeCursorDescriptor({ kind });
  },
  image(input: {
    readonly resourceId: string;
    readonly hotspot: Readonly<{ readonly x: number; readonly y: number }>;
    readonly fallback: NSESystemCursor;
  }): NSECursorDescriptor {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Cursor image must be a plain data-property record.");
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Cursor image must be a plain data-property record.");
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const allowed = new Set<PropertyKey>(["resourceId", "hotspot", "fallback"]);
    if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) throw new TypeError("Cursor image contains unsupported fields.");
    return normaliseRuntimeCursorDescriptor({
      kind: "image",
      resourceId: imageField(descriptors, "resourceId"),
      hotspot: imageField(descriptors, "hotspot"),
      fallback: imageField(descriptors, "fallback"),
    });
  },
});
