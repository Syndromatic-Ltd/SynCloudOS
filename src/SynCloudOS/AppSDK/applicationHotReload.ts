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

import { publishObservableChange } from "../../NSE/Objects/observable";
import { refreshActionBindings } from "./actions";
import { isNSEApplicationClass } from "./applicationClass";

/**
 * Hot reload for class-based applications (dev server only).
 *
 * The Vite plugin appends a registration call to every module that
 * default-exports a class. Each time the module is evaluated the runtime
 * compares it with the previous evaluation, class by class:
 *
 * - same field signature: every live instance of the old class is given the
 *   new class's prototype, so its methods, actions and validation update and
 *   its state stays; its actions are re-registered and observers are told;
 * - different field signature (a field added, removed or given another
 *   initialiser; a changed constructor, `extends` clause or class decorator):
 *   the application that owns the instance relaunches, with a notice. Nothing
 *   else is reloaded.
 *
 * The host reports each live application, window controller and view
 * controller through `trackLiveApplicationObject`, and creates new ones from
 * `currentClass(...)` so a relaunch uses the new code.
 */

/** The part of Vite's `import.meta.hot` this module uses. */
export interface ApplicationHotContext {
  invalidate(message?: string): void;
}

/** What the generated registration call passes for one evaluation of an application module. */
export interface ApplicationHotModuleRecord {
  /** The module's identity, the same on every evaluation. */
  readonly id: string;
  /** The binding name of the default-exported class. */
  readonly defaultClass: string;
  /** The module's top-level classes by binding name. */
  readonly classes: Readonly<Record<string, Function>>;
  /** A digest of each class's fields, by binding name; unchanged means a method swap is enough. */
  readonly signatures: Readonly<Record<string, string>>;
  /** Export names React Fast Refresh must not require to be components. */
  readonly ignoredExports: readonly string[];
  /**
   * The object that carries React Fast Refresh's `__getReactRefreshIgnoredExports` hook: the page's global scope.
   * The generated call supplies it, so the runtime never reaches for a global itself.
   */
  readonly refreshHost: object;
}

/** Everything the host tells the runtime about one live object so hot reload can reach it. */
export interface LiveApplicationObject {
  /** The application's name, for the "Reloaded Notes" notice. */
  readonly appName: string;
  /** Relaunches the application that owns the object. Pass the same function for every object of one application. */
  relaunch(notice: string): void;
}

interface Lineage {
  current: Function;
}

const lineages = new WeakMap<Function, Lineage>();
const registeredModules = new Map<string, Pick<ApplicationHotModuleRecord, "classes" | "signatures">>();
const liveObjects = new Map<Lineage, Set<{ readonly object: object } & LiveApplicationObject>>();
const ignoredExportsByModule = new Map<string, readonly string[]>();

function lineageOf(constructor: Function): Lineage {
  let lineage = lineages.get(constructor);
  if (!lineage) {
    lineage = { current: constructor };
    lineages.set(constructor, lineage);
  }
  return lineage;
}

/** The newest version of `constructor` the dev server has loaded; `constructor` itself when it was never reloaded. */
export function currentClass<T extends Function>(constructor: T): T {
  return lineageOf(constructor).current as T;
}

/**
 * Tells hot reload that `object` is live, so a later edit reaches it. Returns
 * the function that stops tracking, to be called when the object is disposed.
 */
export function trackLiveApplicationObject(object: object, options: LiveApplicationObject): () => void {
  const lineage = lineageOf(object.constructor);
  const entry = { object, appName: options.appName, relaunch: options.relaunch };
  let set = liveObjects.get(lineage);
  if (!set) {
    set = new Set();
    liveObjects.set(lineage, set);
  }
  set.add(entry);
  return () => { set.delete(entry); };
}

/**
 * React Fast Refresh refuses to treat a module as a boundary when it exports
 * something that is not a component. An application module exports its classes,
 * so it names them here and the refresh runtime skips them.
 */
function ignoreExportsForFastRefresh(refreshHost: object, moduleId: string, names: readonly string[]): void {
  ignoredExportsByModule.set(moduleId, names);
  const hook = "__getReactRefreshIgnoredExports";
  const existing: unknown = Reflect.get(refreshHost, hook);
  if (typeof existing === "function" && Reflect.get(existing, "nseApplicationHotReload") === true) return;
  const installed = (context: { readonly id: string }): readonly string[] => [
    ...(typeof existing === "function" ? (existing(context) as readonly string[] | undefined) ?? [] : []),
    ...(ignoredExportsByModule.get(context.id) ?? []),
  ];
  Reflect.set(installed, "nseApplicationHotReload", true);
  Reflect.set(refreshHost, hook, installed);
}

/**
 * Registers one evaluation of an application module. Called by code the Vite
 * plugin appends to the module; the first evaluation only records the classes,
 * later ones apply the change to live objects. Does nothing outside the dev
 * server or when the module's default export is not an `NSEApplication`.
 */
export function registerApplicationHotModule(hot: ApplicationHotContext | undefined, record: ApplicationHotModuleRecord): void {
  if (!hot) return;
  if (!isNSEApplicationClass(record.classes[record.defaultClass])) return;
  ignoreExportsForFastRefresh(record.refreshHost, record.id, record.ignoredExports);
  const previous = registeredModules.get(record.id);
  registeredModules.set(record.id, { classes: record.classes, signatures: record.signatures });

  const changed: Array<{ readonly lineage: Lineage; readonly next: Function; readonly reshaped: boolean }> = [];
  for (const [name, next] of Object.entries(record.classes)) {
    const before = previous?.classes[name];
    if (!before) {
      lineageOf(next);
      continue;
    }
    const lineage = lineageOf(before);
    lineage.current = next;
    lineages.set(next, lineage);
    changed.push({ lineage, next, reshaped: previous.signatures[name] !== record.signatures[name] });
  }

  const relaunches = new Map<LiveApplicationObject["relaunch"], string>();
  for (const { lineage, reshaped } of changed) {
    if (!reshaped) continue;
    for (const live of liveObjects.get(lineage) ?? []) relaunches.set(live.relaunch, `Reloaded ${live.appName}`);
  }

  const failures: unknown[] = [];
  for (const { lineage, next, reshaped } of changed) {
    if (reshaped) continue;
    for (const live of [...(liveObjects.get(lineage) ?? [])]) {
      if (relaunches.has(live.relaunch)) continue;
      try {
        Object.setPrototypeOf(live.object, next.prototype);
        refreshActionBindings(live.object);
        publishObservableChange(live.object);
      } catch (error) {
        failures.push(error);
      }
    }
  }
  for (const [relaunch, notice] of relaunches) {
    try {
      relaunch(notice);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Hot reload could not update every application object.");
}

/**
 * The callback the generated code passes to `import.meta.hot.accept`. The
 * module accepts its own update only if it still default-exports an
 * `NSEApplication`; otherwise the update propagates to importers as it would
 * for any module.
 */
export function acceptApplicationHotUpdate(hot: ApplicationHotContext, next: unknown): void {
  if (typeof next !== "object" || next === null) return;
  const exported: unknown = "default" in next ? next.default : undefined;
  if (!isNSEApplicationClass(exported)) hot.invalidate("The default export is not an NSEApplication, so this module cannot take its own update.");
}
