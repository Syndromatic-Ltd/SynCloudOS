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

import { validateSynWareManifest } from "./validateManifest";
import type { SynWareManifestValidation, SynWareManifestV1 } from "./manifestTypes";

const canonicalManifests = new WeakSet<object>();

function cloneJsonData(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneJsonData(entry)));
  }
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value as object)) {
    if (typeof key !== "string") throw new TypeError("A validated SynWare manifest cannot contain symbol keys.");
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new TypeError("A validated SynWare manifest cannot contain accessor properties.");
    }
    Object.defineProperty(output, key, {
      value: cloneJsonData(descriptor.value),
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  return Object.freeze(output);
}

/** Captures the exact JSON declaration which passed the one V1 schema. The
 * returned value never aliases author-owned mutable data and is safe to carry
 * from authoring through runtime registration. */
export function captureSynWareManifest(value: unknown): SynWareManifestValidation {
  const validation = validateSynWareManifest(value);
  if (!validation.ok) return validation;
  const manifest = cloneJsonData(validation.value) as SynWareManifestV1;
  canonicalManifests.add(manifest);
  return Object.freeze({
    ok: true as const,
    value: manifest,
    errors: Object.freeze([]) as readonly [],
  });
}

export function isCanonicalSynWareManifest(value: unknown): value is Readonly<SynWareManifestV1> {
  return typeof value === "object" && value !== null && canonicalManifests.has(value);
}
