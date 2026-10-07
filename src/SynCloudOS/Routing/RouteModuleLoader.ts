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

import type {
  SynWareRouteDefinition,
  SynWareRouteLazyModule,
} from "./appRouteTypes";

const executableKeys = new Set<keyof SynWareRouteLazyModule>([
  "component",
  "loadingComponent",
  "errorComponent",
  "notFoundComponent",
  "load",
  "afterLoad",
  "activate",
  "deactivate",
  "beforeEnter",
  "beforeLeave",
]);

export class StaleRouteModuleGenerationError extends Error {
  constructor() {
    super("The route module bundle generation changed before import publication.");
    this.name = "StaleRouteModuleGenerationError";
  }
}

export interface RouteModuleLoaderOptions {
  getBundleGeneration(): number;
  isOwnerLive?(): boolean;
}

export interface RouteModuleLoadOptions {
  readonly signal?: AbortSignal;
}

function makeAbortError(signal: AbortSignal): DOMException {
  return new DOMException(
    typeof signal.reason === "string" ? signal.reason : "Route module caller detached.",
    "AbortError",
  );
}

function validateModule(value: unknown): Readonly<SynWareRouteLazyModule> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("A lazy route module must be a plain object.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("A lazy route module must be a plain object.");
  }
  const namespaceDescriptor = Object.getOwnPropertyDescriptor(value, Symbol.toStringTag);
  const namespaceTag = namespaceDescriptor
    ? "value" in namespaceDescriptor
      ? namespaceDescriptor.value
      : namespaceDescriptor.get?.call(value)
    : undefined;
  const isModuleNamespace = namespaceDescriptor !== undefined
    && namespaceDescriptor.enumerable === false
    && namespaceDescriptor.set === undefined
    && namespaceTag === "Module";
  const executable: Partial<Record<keyof SynWareRouteLazyModule, unknown>> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (key === Symbol.toStringTag) {
      if (!isModuleNamespace) {
        throw new TypeError(`Lazy route modules cannot change static route topology through "${String(key)}".`);
      }
      continue;
    }
    if (typeof key !== "string" || !executableKeys.has(key as keyof SynWareRouteLazyModule)) {
      throw new TypeError(`Lazy route modules cannot change static route topology through "${String(key)}".`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable) {
      throw new TypeError(`Lazy route module field "${key}" must be an enumerable data property.`);
    }
    if ("value" in descriptor) {
      executable[key as keyof SynWareRouteLazyModule] = descriptor.value;
      continue;
    }
    if (!isModuleNamespace || typeof descriptor.get !== "function" || descriptor.set !== undefined) {
      throw new TypeError(`Lazy route module field "${key}" must be an enumerable data property.`);
    }
    executable[key as keyof SynWareRouteLazyModule] = descriptor.get.call(value);
  }
  return Object.freeze(executable as SynWareRouteLazyModule);
}

function detachForAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(makeAbortError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(makeAbortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (!signal.aborted) resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        if (!signal.aborted) reject(error);
      },
    );
  });
}

export interface RouteModuleLoader {
  load(definition: SynWareRouteDefinition, options?: RouteModuleLoadOptions): Promise<Readonly<SynWareRouteLazyModule>>;
  retry(definition: SynWareRouteDefinition, options?: RouteModuleLoadOptions): Promise<Readonly<SynWareRouteLazyModule>>;
  preload(definition: SynWareRouteDefinition, options?: RouteModuleLoadOptions): Promise<Readonly<SynWareRouteLazyModule>>;
  resolveDefinition(definition: SynWareRouteDefinition, options?: RouteModuleLoadOptions): Promise<SynWareRouteDefinition>;
  invalidate(definition?: SynWareRouteDefinition): void;
}

function eagerExecutable(definition: SynWareRouteDefinition): Readonly<SynWareRouteLazyModule> {
  return Object.freeze({
    ...(definition.component ? { component: definition.component } : {}),
    ...(definition.loadingComponent ? { loadingComponent: definition.loadingComponent } : {}),
    ...(definition.errorComponent ? { errorComponent: definition.errorComponent } : {}),
    ...(definition.notFoundComponent ? { notFoundComponent: definition.notFoundComponent } : {}),
    ...(definition.load ? { load: definition.load } : {}),
    ...(definition.afterLoad ? { afterLoad: definition.afterLoad } : {}),
    ...(definition.activate ? { activate: definition.activate } : {}),
    ...(definition.deactivate ? { deactivate: definition.deactivate } : {}),
    ...(definition.beforeEnter ? { beforeEnter: definition.beforeEnter } : {}),
    ...(definition.beforeLeave ? { beforeLeave: definition.beforeLeave } : {}),
  });
}

export function createRouteModuleLoader(options: RouteModuleLoaderOptions): RouteModuleLoader {
  let cache = new WeakMap<object, Map<number, Promise<Readonly<SynWareRouteLazyModule>>>>();

  const assertOwnerLive = () => {
    if (options.isOwnerLive && !options.isOwnerLive()) {
      throw new DOMException("Route module owner has been revoked.", "InvalidStateError");
    }
  };

  const importForGeneration = (
    definition: SynWareRouteDefinition,
    generation: number,
  ): Promise<Readonly<SynWareRouteLazyModule>> => {
    assertOwnerLive();
    if (!definition.lazy) return Promise.resolve(eagerExecutable(definition));
    let byGeneration = cache.get(definition as object);
    if (!byGeneration) {
      byGeneration = new Map();
      cache.set(definition as object, byGeneration);
    }
    const existing = byGeneration.get(generation);
    if (existing) return existing;
    const promise = Promise.resolve()
      .then(() => definition.lazy!())
      .then((raw) => {
        assertOwnerLive();
        if (options.getBundleGeneration() !== generation) throw new StaleRouteModuleGenerationError();
        return validateModule(raw);
      });
    byGeneration.set(generation, promise);
    return promise;
  };

  const load = (definition: SynWareRouteDefinition, loadOptions: RouteModuleLoadOptions = {}) => {
    const generation = options.getBundleGeneration();
    return detachForAbort(importForGeneration(definition, generation), loadOptions.signal);
  };

  const loader: RouteModuleLoader = {
    load,
    retry(definition: SynWareRouteDefinition, loadOptions: RouteModuleLoadOptions = {}) {
      const generation = options.getBundleGeneration();
      cache.get(definition as object)?.delete(generation);
      return detachForAbort(importForGeneration(definition, generation), loadOptions.signal);
    },
    preload: load,
    async resolveDefinition(
      definition: SynWareRouteDefinition,
      loadOptions: RouteModuleLoadOptions = {},
    ) {
      if (!definition.lazy) return definition;
      const executable = await load(definition, loadOptions);
      return Object.freeze({ ...definition, ...executable });
    },
    invalidate(definition?: SynWareRouteDefinition) {
      if (definition) cache.delete(definition as object);
      else cache = new WeakMap();
    },
  };
  return Object.freeze(loader);
}
