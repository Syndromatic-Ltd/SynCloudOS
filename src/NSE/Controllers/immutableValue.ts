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

const immutableValues = new WeakSet<object>();
const immutableTargets = new WeakMap<object, object>();

function immutableFailure(message: string): never {
  throw new TypeError(`Controller snapshots require cloneable own-data values: ${message}`);
}

function ownershipFailure(error: unknown): never {
  if (
    error instanceof TypeError &&
    error.message.startsWith("Controller snapshots require cloneable own-data values:")
  ) {
    throw error;
  }
  return immutableFailure("the value could not be cloned safely.");
}

function markImmutable<T extends object>(value: T): T {
  immutableValues.add(value);
  return value;
}

function sourceFor(value: object): object {
  return immutableTargets.get(value) ?? value;
}

function readonlyMap(target: Map<unknown, unknown>): ReadonlyMap<unknown, unknown> {
  let proxy: ReadonlyMap<unknown, unknown>;
  proxy = new Proxy(target, {
    get(map, property) {
      if (property === "constructor") return Map;
      if (property === "set" || property === "delete" || property === "clear") {
        return () => {
          throw new TypeError("ReadonlyMap cannot be mutated.");
        };
      }
      if (property === "forEach") {
        return (
          callback: (
            value: unknown,
            key: unknown,
            current: ReadonlyMap<unknown, unknown>,
          ) => void,
          thisArg?: unknown,
        ) => map.forEach((value, key) => callback.call(thisArg, value, key, proxy));
      }
      const value = Reflect.get(map, property, map);
      return typeof value === "function" ? value.bind(map) : value;
    },
  });
  immutableTargets.set(proxy as object, target);
  return proxy;
}

function readonlySet(target: Set<unknown>): ReadonlySet<unknown> {
  let proxy: ReadonlySet<unknown>;
  proxy = new Proxy(target, {
    get(set, property) {
      if (property === "constructor") return Set;
      if (property === "add" || property === "delete" || property === "clear") {
        return () => {
          throw new TypeError("ReadonlySet cannot be mutated.");
        };
      }
      if (property === "forEach") {
        return (
          callback: (value: unknown, key: unknown, current: ReadonlySet<unknown>) => void,
          thisArg?: unknown,
        ) => set.forEach((value, key) => callback.call(thisArg, value, key, proxy));
      }
      const value = Reflect.get(set, property, set);
      return typeof value === "function" ? value.bind(set) : value;
    },
  });
  immutableTargets.set(proxy as object, target);
  return proxy;
}

const DATE_MUTATORS = new Set([
  "setDate",
  "setFullYear",
  "setHours",
  "setMilliseconds",
  "setMinutes",
  "setMonth",
  "setSeconds",
  "setTime",
  "setUTCDate",
  "setUTCFullYear",
  "setUTCHours",
  "setUTCMilliseconds",
  "setUTCMinutes",
  "setUTCMonth",
  "setUTCSeconds",
]);

function readonlyDate(target: Date): Date {
  const proxy = new Proxy(target, {
    get(date, property) {
      if (typeof property === "string" && DATE_MUTATORS.has(property)) {
        return () => {
          throw new TypeError("ReadonlyDate cannot be mutated.");
        };
      }
      const value = Reflect.get(date, property, date);
      return typeof value === "function" ? value.bind(date) : value;
    },
  });
  immutableTargets.set(proxy, target);
  return proxy;
}

function descriptorsFor(value: object): Record<PropertyKey, PropertyDescriptor> {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key === "symbol") {
        immutableFailure("symbol-keyed properties are not supported.");
      }
      const descriptor = descriptors[key]!;
      if (!Object.hasOwn(descriptor, "value")) {
        immutableFailure("accessor properties are not supported.");
      }
    }
    return descriptors;
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith("Controller snapshots")) {
      throw error;
    }
    return immutableFailure("the value could not be inspected safely.");
  }
}

function containsImmutable(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (immutableValues.has(value)) return true;
  if (seen.has(value)) return false;
  seen.add(value);
  const source = sourceFor(value);
  try {
    if (source instanceof Map) {
      for (const [key, item] of source) {
        if (containsImmutable(key, seen) || containsImmutable(item, seen)) return true;
      }
      return false;
    }
    if (source instanceof Set) {
      for (const item of source) if (containsImmutable(item, seen)) return true;
      return false;
    }
    if (source instanceof Date) return false;
    for (const descriptor of Object.values(descriptorsFor(source))) {
      if (containsImmutable(descriptor.value, seen)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** Reports whether a value graph already contains controller-owned state. */
export function hasImmutableValue(value: unknown): boolean {
  return containsImmutable(value);
}

function cloneValue(
  value: unknown,
  seen: Map<object, unknown>,
  forceClone = false,
): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (immutableValues.has(value) && !forceClone) return value;
  if (seen.has(value)) return seen.get(value);
  const source = sourceFor(value);

  if (source instanceof Date) {
    const result = readonlyDate(new Date(source.getTime()));
    seen.set(value, result);
    Object.freeze(result);
    return markImmutable(result);
  }
  if (source instanceof Map) {
    const target = new Map<unknown, unknown>();
    const result = readonlyMap(target);
    seen.set(value, result);
    for (const [key, item] of source) {
      target.set(cloneValue(key, seen), cloneValue(item, seen));
    }
    Object.freeze(result);
    markImmutable(target);
    return markImmutable(result as object);
  }
  if (source instanceof Set) {
    const target = new Set<unknown>();
    const result = readonlySet(target);
    seen.set(value, result);
    for (const item of source) target.add(cloneValue(item, seen));
    Object.freeze(result);
    markImmutable(target);
    return markImmutable(result as object);
  }

  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(source);
  } catch {
    return immutableFailure("the value prototype could not be inspected safely.");
  }
  if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype) {
    return immutableFailure("only plain objects, arrays, maps, sets and dates are supported.");
  }
  const descriptors = descriptorsFor(source);
  const target: object = Array.isArray(source)
    ? new Array((descriptors.length?.value as number | undefined) ?? 0)
    : Object.create(prototype);
  seen.set(value, target);
  for (const key of Object.keys(descriptors)) {
    if (key === "length" && Array.isArray(target)) continue;
    const descriptor = descriptors[key]!;
    Object.defineProperty(target, key, {
      value: cloneValue(descriptor.value, seen),
      enumerable: descriptor.enumerable,
      configurable: false,
      writable: false,
    });
  }
  Object.freeze(target);
  return markImmutable(target);
}

function mutableCloneValue(value: unknown, seen: Map<object, unknown>): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return seen.get(value);
  const source = sourceFor(value);
  if (seen.has(source)) return seen.get(source);

  if (source instanceof Date) {
    const result = new Date(source.getTime());
    seen.set(value, result);
    seen.set(source, result);
    return result;
  }
  if (source instanceof Map) {
    const result = new Map<unknown, unknown>();
    seen.set(value, result);
    seen.set(source, result);
    for (const [key, item] of source) {
      result.set(mutableCloneValue(key, seen), mutableCloneValue(item, seen));
    }
    return result;
  }
  if (source instanceof Set) {
    const result = new Set<unknown>();
    seen.set(value, result);
    seen.set(source, result);
    for (const item of source) result.add(mutableCloneValue(item, seen));
    return result;
  }

  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(source);
  } catch {
    return immutableFailure("the value prototype could not be inspected safely.");
  }
  const descriptors = descriptorsFor(source);
  const target: object = Array.isArray(source)
    ? new Array((descriptors.length?.value as number | undefined) ?? 0)
    : Object.create(prototype);
  seen.set(value, target);
  seen.set(source, target);
  for (const key of Object.keys(descriptors)) {
    if (key === "length" && Array.isArray(target)) continue;
    const descriptor = descriptors[key]!;
    Object.defineProperty(target, key, {
      value: mutableCloneValue(descriptor.value, seen),
      enumerable: descriptor.enumerable,
      configurable: true,
      writable: true,
    });
  }
  return target;
}

/** Takes ownership at a controller boundary, preserving already-owned subgraphs. */
export function ownImmutable<T>(
  value: T,
  clone?: (value: T) => T,
): T {
  try {
    if (typeof value === "object" && value !== null && immutableValues.has(value)) {
      return value;
    }
    const source = clone && !containsImmutable(value) ? clone(value) : value;
    return cloneValue(source, new Map()) as T;
  } catch (error) {
    return ownershipFailure(error);
  }
}

/** Creates a new immutable root while retaining immutable nested references. */
export function copyImmutable<T>(value: T): T {
  try {
    return cloneValue(value, new Map(), true) as T;
  } catch (error) {
    return ownershipFailure(error);
  }
}

/** Clones an owned graph into ordinary mutable built-ins for drafts or persistence. */
export function mutableClone<T>(value: T): T {
  try {
    return (containsImmutable(value)
      ? mutableCloneValue(value, new Map())
      : structuredClone(value)) as T;
  } catch (error) {
    return ownershipFailure(error);
  }
}

export function isImmutableValue(value: unknown): value is object {
  return typeof value === "object" && value !== null && immutableValues.has(value);
}
