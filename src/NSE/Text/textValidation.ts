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

export interface NSETextDataLimits { readonly maxDepth?: number; readonly maxNodes?: number; readonly maxBytes?: number }
function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) value.forEach(deepFreeze);
  else Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
}

export function canonicalNSETextData<T>(value: T, typeId = "nse.text", limits: NSETextDataLimits = {}): T {
    const maxDepth = limits.maxDepth ?? 64;
    const maxNodes = limits.maxNodes ?? 100_000;
    const maxBytes = limits.maxBytes ?? 4 * 1024 * 1024;
    const seen = new Set<object>();
    let nodes = 0;
    const fail = (message: string): never => { throw new TypeError(`${typeId}: ${message}`); };
    const visit = (candidate: unknown, depth: number): unknown => {
      nodes += 1;
      if (nodes > maxNodes) fail(`value exceeds the ${maxNodes} node limit.`);
      if (depth > maxDepth) fail(`value exceeds the ${maxDepth} level depth limit.`);
      if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return candidate;
      if (typeof candidate === "number") {
        if (!Number.isFinite(candidate) || Object.is(candidate, -0)) fail("numbers must be finite and not negative zero.");
        return candidate;
      }
      if (typeof candidate !== "object") fail("values must contain only JSON data.");
      const objectCandidate = candidate as object;
      if (seen.has(objectCandidate)) fail("values must be acyclic.");
      seen.add(objectCandidate);
      let result: unknown;
      if (Array.isArray(objectCandidate)) {
        const entries: unknown[] = [];
        for (let index = 0; index < objectCandidate.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(objectCandidate, String(index)) ?? fail("arrays must be dense, not sparse.");
          if (!("value" in descriptor) || !descriptor.enumerable) fail("arrays must use enumerable data properties.");
          entries.push(visit(descriptor.value, depth + 1));
        }
        if (Reflect.ownKeys(objectCandidate).some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= objectCandidate.length))) fail("arrays must contain only indexed JSON elements.");
        result = entries;
      } else {
        const prototype = Object.getPrototypeOf(objectCandidate);
        if (prototype !== Object.prototype && prototype !== null) fail("values must use plain JSON objects.");
        const descriptors = Object.getOwnPropertyDescriptors(objectCandidate);
        const keys = Reflect.ownKeys(objectCandidate);
        if (keys.some((key) => typeof key !== "string")) fail("objects must not contain symbol properties.");
        result = Object.fromEntries((keys as string[]).sort().map((key) => {
          const descriptor = descriptors[key] ?? fail("object descriptor is missing.");
          if (!("value" in descriptor) || !descriptor.enumerable) fail("values must use enumerable data properties, not accessors.");
          return [key, visit(descriptor.value, depth + 1)];
        }));
      }
      seen.delete(objectCandidate);
      return result;
    };
    const canonical = JSON.stringify(visit(value, 0));
    if (new TextEncoder().encode(canonical).byteLength > maxBytes) fail(`value exceeds the ${maxBytes} byte limit.`);
    return deepFreeze(JSON.parse(canonical) as T);
  }
