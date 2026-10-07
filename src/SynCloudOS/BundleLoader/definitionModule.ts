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

import { captureSynWareDefinition } from "../AppSDK/createSynWare";
import { findSynWareManifestDifference } from "../AppSDK/manifest/compareCanonicalManifests";
import type { SynWareDefinition } from "../AppSDK/runtimeContracts";
import type { TrustedSynWareBundle } from "./bundleTypes";

function moduleDefault(module: unknown): unknown {
  if (typeof module !== "object" || module === null || Array.isArray(module)) {
    throw new TypeError("A lazy SynWare entry must be a module object.");
  }
  const descriptor = Object.getOwnPropertyDescriptor(module, "default");
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || descriptor.get || descriptor.set) {
    throw new TypeError("A lazy SynWare entry must expose an enumerable default data export.");
  }
  return descriptor.value;
}

/** Captures a lazy definition without calling its root, then proves it still
 * describes exactly the V1 manifest which the host registered. */
export function captureLazySynWareDefinition(
  module: unknown,
  bundle: Pick<TrustedSynWareBundle, "synWareManifest">,
): Readonly<SynWareDefinition> {
  const definition = captureSynWareDefinition(moduleDefault(module));
  if (bundle.synWareManifest) {
    const mismatch = findSynWareManifestDifference(bundle.synWareManifest, definition.manifest);
    if (mismatch) {
      throw new TypeError(`Lazy SynWare manifest differs from its registration at ${mismatch.pointer}.`);
    }
  }
  return definition;
}
