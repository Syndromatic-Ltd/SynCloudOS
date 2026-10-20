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
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { ComponentType } from "react";
import { captureSynWareDefinition } from "../AppSDK/createSynWare";
import {
  createSynWareDefinitionFromApplicationClass,
  createSynWareDefinitionFromComponent,
  isNSEApplicationClass,
} from "../AppSDK/applicationClass";
import { findSynWareManifestDifference } from "../AppSDK/manifest/compareCanonicalManifests";
import type { SynWareDefinition } from "../AppSDK/runtimeContracts";
import type { TrustedSynWareBundle } from "./bundleTypes";

/** Named exports `Contents/index.tsx` may add beside its default export. */
const definitionExports = ["routes", "migrations", "windowChrome", "rematerialiseOwnedDocument", "createBackgroundHandler"] as const;

function moduleExport(module: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(module, key);
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || !("value" in descriptor) || descriptor.get || descriptor.set) {
    throw new TypeError(`A lazy SynWare entry must export ${key} as an enumerable data property.`);
  }
  return descriptor.value;
}

function moduleDefault(module: unknown): unknown {
  if (typeof module !== "object" || module === null || Array.isArray(module)) {
    throw new TypeError("A lazy SynWare entry must be a module object.");
  }
  const value = moduleExport(module, "default");
  if (value === undefined) throw new TypeError("A lazy SynWare entry must expose an enumerable default data export.");
  return value;
}

/** Functions, and the memo and forwardRef wrappers React renders as components. */
function isReactComponent(value: unknown): value is ComponentType {
  if (typeof value === "function") return true;
  if (typeof value !== "object" || value === null) return false;
  const reactType = Object.getOwnPropertyDescriptor(value, "$$typeof");
  return Boolean(reactType && "value" in reactType && (
    reactType.value === Symbol.for("react.memo") || reactType.value === Symbol.for("react.forward_ref")
  ));
}

function namedExports(module: object) {
  return Object.fromEntries(definitionExports.map((key) => [key, moduleExport(module, key)]));
}

/**
 * Builds an application's definition from its entry module: the default export
 * is a React component or an NSEApplication subclass, and `routes`,
 * `migrations`, `windowChrome`, `rematerialiseOwnedDocument` and
 * `createBackgroundHandler` are named exports. A module that still exports a
 * captured definition keeps working for hosts without the Vite plugin.
 *
 * The definition is captured without rendering, then proved to describe
 * exactly the V1 manifest the host registered.
 */
export function captureLazySynWareDefinition(
  module: unknown,
  bundle: Pick<TrustedSynWareBundle, "synWareManifest" | "manifest">,
): Readonly<SynWareDefinition> {
  if (typeof module !== "object" || module === null || Array.isArray(module)) {
    throw new TypeError("A lazy SynWare entry must be a module object.");
  }
  const entry = moduleDefault(module);
  const manifest = bundle.synWareManifest;
  if (manifest === undefined) {
    throw new TypeError(`${bundle.manifest.packageName} was registered without its V1 manifest, so its module cannot build a definition.`);
  }
  let declared: unknown;
  if (isNSEApplicationClass(entry)) {
    declared = createSynWareDefinitionFromApplicationClass(entry, manifest, namedExports(module));
  } else if (isReactComponent(entry)) {
    declared = createSynWareDefinitionFromComponent(entry, manifest, namedExports(module));
  } else if (typeof entry === "object" && entry !== null) {
    declared = entry;
  } else {
    throw new TypeError(`${bundle.manifest.packageName}/Contents/index.tsx must default-export a React component or an NSEApplication subclass.`);
  }
  const definition = captureSynWareDefinition(declared);
  const mismatch = findSynWareManifestDifference(manifest, definition.manifest);
  if (mismatch) {
    throw new TypeError(`Lazy SynWare manifest differs from its registration at ${mismatch.pointer}.`);
  }
  return definition;
}
