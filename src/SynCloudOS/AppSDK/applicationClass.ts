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

import { createElement, type ComponentType } from "react";
import { NSEApplication, type NSEApplicationClass } from "../../NSE/Application/NSEApplication";
import { NSEWindowController } from "../../NSE/Application/NSEWindowController";
import type { SynWareRouteGraph } from "../Routing/appRouteTypes";
import { registerApplicationLifecycle } from "../Lifecycle/applicationLifecycleHooks";
import type { SynWareDefinition, SynWareMigration } from "./appDefinitionTypes";
import type { SynWareManifestV1 } from "./manifest/manifestTypes";
import { createApplicationRoot } from "./applicationRoot";
import {
  createApplicationLifecycle,
  runApplicationBackgroundTask,
  type ApplicationSessionSource,
} from "./applicationSession";

/** Whether `value` is a class that extends `NSEApplication`. */
export function isNSEApplicationClass(value: unknown): value is NSEApplicationClass {
  return typeof value === "function" && value.prototype instanceof NSEApplication;
}

/**
 * The named exports of an application module that sit beside its default
 * export. An application class carries `routes`, `migrations` and
 * `handleBackgroundTask` itself; a function component names them here.
 */
export interface SynWareModuleNamedExports {
  readonly routes?: SynWareRouteGraph | undefined;
  readonly migrations?: readonly SynWareMigration[] | undefined;
  readonly windowChrome?: SynWareDefinition["windowChrome"] | undefined;
  readonly rematerialiseOwnedDocument?: SynWareDefinition["rematerialiseOwnedDocument"] | undefined;
  readonly createBackgroundHandler?: SynWareDefinition["createBackgroundHandler"] | undefined;
}

function assembleDefinition(
  manifest: SynWareManifestV1,
  root: ComponentType,
  parts: SynWareModuleNamedExports,
): SynWareDefinition {
  const definition: { -readonly [Key in keyof SynWareDefinition]: SynWareDefinition[Key] } = { manifest, root };
  if (parts.routes !== undefined) definition.routes = parts.routes;
  if (parts.migrations !== undefined) definition.migrations = parts.migrations;
  if (parts.windowChrome !== undefined) definition.windowChrome = parts.windowChrome;
  if (parts.rematerialiseOwnedDocument !== undefined) definition.rematerialiseOwnedDocument = parts.rematerialiseOwnedDocument;
  if (parts.createBackgroundHandler !== undefined) definition.createBackgroundHandler = parts.createBackgroundHandler;
  return definition;
}

function rejectDuplicate(what: string, onClass: unknown, named: unknown): void {
  if (onClass !== undefined && named !== undefined) {
    throw new TypeError(`The application declares ${what} twice: once on the class and once as a named export of the module. Keep the class's.`);
  }
}

/**
 * The definition of an application written as an `NSEApplication` class. The
 * definition's root renders the application's window controllers, and its
 * lifecycle hooks (launch, activate, suspend, terminate) are registered for
 * the kernel to drive.
 */
export function createSynWareDefinitionFromApplicationClass(
  AppClass: NSEApplicationClass,
  manifest: SynWareManifestV1,
  named: SynWareModuleNamedExports = {},
): SynWareDefinition {
  if (!isNSEApplicationClass(AppClass)) throw new TypeError("The default export is not an NSEApplication class.");
  rejectDuplicate("routes", AppClass.routes, named.routes);
  rejectDuplicate("migrations", AppClass.migrations, named.migrations);
  const handlesBackgroundTasks = typeof AppClass.prototype.handleBackgroundTask === "function";
  rejectDuplicate("background handling", handlesBackgroundTasks ? true : undefined, named.createBackgroundHandler);
  const source: ApplicationSessionSource = { AppClass, appName: manifest.title, strictOwnership: true };
  const root = createApplicationRoot(source);
  registerApplicationLifecycle(root, createApplicationLifecycle(source));
  return assembleDefinition(manifest, root, {
    routes: AppClass.routes ?? named.routes,
    migrations: AppClass.migrations ?? named.migrations,
    windowChrome: named.windowChrome,
    rematerialiseOwnedDocument: named.rematerialiseOwnedDocument,
    createBackgroundHandler: handlesBackgroundTasks
      ? () => ({ handle: (taskId, context) => runApplicationBackgroundTask(source, manifest.id, taskId, context) })
      : named.createBackgroundHandler,
  });
}

/**
 * The definition of an application written as a function component: a
 * single-window `NSEApplication` whose window renders `Root`. Hooks keep
 * working as they did; the application is not class-based, so controllers
 * built with hooks keep the ownership their hooks give them.
 */
export function createSynWareDefinitionFromComponent(
  Root: ComponentType,
  manifest: SynWareManifestV1,
  named: SynWareModuleNamedExports = {},
): SynWareDefinition {
  if (typeof Root !== "function" && (typeof Root !== "object" || Root === null)) {
    throw new TypeError("The default export of an application module must be a component or an NSEApplication class.");
  }
  class ComponentWindowController extends NSEWindowController {
    static override view = function ComponentView() { return createElement(Root); };
  }
  class ComponentApplication extends NSEApplication {
    static override mainWindow = ComponentWindowController;
  }
  const source: ApplicationSessionSource = { AppClass: ComponentApplication, appName: manifest.title, strictOwnership: false };
  const root = createApplicationRoot(source);
  registerApplicationLifecycle(root, createApplicationLifecycle(source));
  return assembleDefinition(manifest, root, named);
}
