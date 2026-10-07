/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { SynWareDefinition, SynWareBundleLoadContext } from "./appDefinitionTypes";
import { captureSynWareManifest } from "./manifest";
import { projectRuntimeManifest } from "./projectRuntimeManifest";
import type { SynWareManifestIssue, SynWareManifestV1 } from "./manifest";
import type { TrustedSynWareBundle } from "../SynCloudOS";
import { bindSynWareRouteGraph, createAppRouteGraph, isSynWareRouteGraph } from "../Routing/appSdkRoutePort";
import type { SynWareRouteDefinition, SynWareRouteGraph } from "../Routing/appSdkRoutePort";

const DEFINITION_KEYS = new Set(["manifest", "root", "routes", "migrations", "windowChrome", "rematerialiseOwnedDocument", "createBackgroundHandler"]);
const canonicalDefinitions = new WeakMap<object, Readonly<SynWareDefinition>>();

/** Preserve a closed V1 declaration at authoring time as well as at the JSON
 * schema boundary. Generic constraints alone accept excess object keys. */
type ClosedSynWareManifest<TManifest extends SynWareManifestV1> = TManifest & Record<Exclude<keyof TManifest, keyof SynWareManifestV1>, never>;

function titleCase(value: string): string {
  return value
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function componentKeyFromPackageName(value: string): string {
  const compact = titleCase(value.replace(/\.app$/iu, "")).replace(/[^A-Za-z0-9]/gu, "");
  return compact || "SynWare";
}

function completeBundleLoadContext(
  manifest: Readonly<SynWareManifestV1>,
  context: Partial<SynWareBundleLoadContext>,
): SynWareBundleLoadContext {
  const packageName = context.packageName ?? `${componentKeyFromPackageName(manifest.id)}.app`;
  const appRoot = context.appRoot ?? `./${packageName}`;
  const path = context.path ?? `${packageName}/`;
  const componentKey = context.componentKey ?? componentKeyFromPackageName(packageName);
  return {
    appRoot,
    packageName,
    path,
    componentKey,
    modulePath: context.modulePath ?? `${path}Contents/index.tsx`,
    loadModule: context.loadModule,
  };
}

export class SynWareManifestValidationError extends TypeError {
  readonly issues: readonly SynWareManifestIssue[];

  constructor(issues: readonly SynWareManifestIssue[]) {
    super(`SynWare manifest validation failed: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
    this.name = "SynWareManifestValidationError";
    this.issues = issues;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  if (typeof value === "function") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const key of Reflect.ownKeys(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function dataProperty(value: object, key: string, required = false): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    if (required) throw new TypeError(`A SynWare definition requires the "${key}" field.`);
    return undefined;
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError(`SynWare definition fields must be enumerable data properties; "${key}" cannot be an accessor.`);
  }
  return descriptor.value;
}

function captureDefinition(value: unknown): Readonly<SynWareDefinition> {
  if (typeof value === "object" && value !== null) {
    const known = canonicalDefinitions.get(value);
    if (known) return known;
  }
  if (!isPlainObject(value)) throw new TypeError("A SynWare definition must be a plain object.");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !DEFINITION_KEYS.has(key)) {
      throw new TypeError(`SynWare definitions do not support the "${String(key)}" field.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`SynWare definition fields must be enumerable data properties; "${key}" cannot be an accessor.`);
    }
  }
  const root = dataProperty(value, "root", true);
  if (typeof root !== "function") throw new TypeError("A SynWare definition requires a root component.");
  const validation = captureSynWareManifest(dataProperty(value, "manifest", true));
  if (!validation.ok) throw new SynWareManifestValidationError(validation.errors);
  const declaredRoutes = dataProperty(value, "routes");
  if (declaredRoutes !== undefined && !isSynWareRouteGraph(declaredRoutes)) {
    throw new TypeError("SynWare routes must be created with defineSynWareRoutes().");
  }
  const primaryRoute = validation.value.routes?.find((route) => route.primary) ?? validation.value.routes?.[0];
  const basePath = primaryRoute?.path ?? `/${validation.value.id}`;
  const routeGraph = declaredRoutes === undefined
    ? createAppRouteGraph({
        id: `${validation.value.id}.legacy-routes`,
        routes: [{ name: validation.value.id, path: "", component: root as NonNullable<SynWareRouteDefinition["component"]> }],
      }).bind(basePath, validation.value.id)
    : bindSynWareRouteGraph(declaredRoutes as SynWareRouteGraph, basePath, validation.value.id);
  const migrations = dataProperty(value, "migrations");
  if (migrations !== undefined && !Array.isArray(migrations)) {
    throw new TypeError("SynWare migrations must be an array when supplied.");
  }
  const createBackgroundHandler = dataProperty(value, "createBackgroundHandler");
  if (createBackgroundHandler !== undefined && typeof createBackgroundHandler !== "function") {
    throw new TypeError("SynWare background handlers must be created by a function.");
  }
  const windowChrome = dataProperty(value, "windowChrome");
  if (windowChrome !== undefined && typeof windowChrome !== "function") {
    throw new TypeError("SynWare window chrome must be a component.");
  }
  const rematerialiseOwnedDocument = dataProperty(value, "rematerialiseOwnedDocument");
  if (rematerialiseOwnedDocument !== undefined && typeof rematerialiseOwnedDocument !== "function") {
    throw new TypeError("SynWare owned-document rematerialisers must be functions.");
  }
  const definition: SynWareDefinition = {
    manifest: validation.value,
    root: root as SynWareDefinition["root"],
    routes: routeGraph,
    ...(migrations === undefined ? {} : { migrations: deepFreeze([...migrations]) }),
    ...(windowChrome === undefined ? {} : { windowChrome: windowChrome as NonNullable<SynWareDefinition["windowChrome"]> }),
    ...(rematerialiseOwnedDocument === undefined ? {} : { rematerialiseOwnedDocument: rematerialiseOwnedDocument as NonNullable<SynWareDefinition["rematerialiseOwnedDocument"]> }),
    ...(createBackgroundHandler === undefined ? {} : { createBackgroundHandler: createBackgroundHandler as NonNullable<SynWareDefinition["createBackgroundHandler"]> }),
  };
  const captured = deepFreeze(definition);
  canonicalDefinitions.set(value, captured);
  canonicalDefinitions.set(captured, captured);
  return captured;
}

/** Host loaders use the same closed declaration capture as app authors. This
 * validates a lazy module's definition without ever evaluating its root. */
export function captureSynWareDefinition(value: unknown): Readonly<SynWareDefinition> {
  return captureDefinition(value);
}

/** Creates a declaration only. It never creates a runtime, reads the browser,
 * or registers globally; a host owns registration and session construction. */
export function createSynWare<
  const TManifest extends SynWareManifestV1,
  const TRoutes extends readonly SynWareRouteDefinition[] = readonly SynWareRouteDefinition[],
>(
  definition: SynWareDefinition<TManifest, TRoutes> & { readonly manifest: ClosedSynWareManifest<TManifest> },
): Readonly<SynWareDefinition<TManifest, TRoutes>> {
  return captureSynWareDefinition(definition) as Readonly<SynWareDefinition<TManifest, TRoutes>>;
}

/** Explicit host-side adapter from the authoring declaration to the runtime
 * bundle contract. Runtime registration remains instance-owned and this
 * function never performs it on the caller's behalf. */
export function createSynWareBundle(
  definition: SynWareDefinition,
  context: Partial<SynWareBundleLoadContext> = {},
): TrustedSynWareBundle {
  const captured = captureDefinition(definition);
  const manifest = captured.manifest;
  const loadContext = completeBundleLoadContext(manifest, context);
  const runtimeManifest = projectRuntimeManifest(manifest, loadContext);
  return Object.freeze({
    manifest: runtimeManifest,
    modulePath: loadContext.modulePath,
    loadModule: loadContext.loadModule,
    componentKey: runtimeManifest.componentKey,
    synWareDefinition: captured,
    synWareManifest: manifest,
    services: [...runtimeManifest.requiredServices, ...(runtimeManifest.optionalServices ?? [])],
    optionalServices: [...(runtimeManifest.optionalServices ?? [])],
    permissions: [...(manifest.permissions ?? [])],
  });
}
