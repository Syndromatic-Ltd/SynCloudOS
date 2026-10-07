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

import type { SynWareManifestV1 } from "./manifestTypes";

export interface SynWareManifestDifference {
  /** RFC 6901 JSON Pointer identifying the first semantic difference. */
  readonly pointer: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function difference(
  expected: unknown,
  actual: unknown,
  pointer: string,
): SynWareManifestDifference | null {
  if (Object.is(expected, actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return { pointer: `${pointer}/length`, expected: expected.length, actual: actual.length };
    for (let index = 0; index < expected.length; index += 1) {
      const nested = difference(expected[index], actual[index], `${pointer}/${index}`);
      if (nested) return nested;
    }
    return null;
  }
  if (
    typeof expected === "object" && expected !== null && !Array.isArray(expected) &&
    typeof actual === "object" && actual !== null && !Array.isArray(actual)
  ) {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])].sort();
    for (const key of keys) {
      const nested = difference(expectedRecord[key], actualRecord[key], `${pointer}/${pointerSegment(key)}`);
      if (nested) return nested;
    }
    return null;
  }
  return { pointer: pointer || "/", expected, actual };
}

/**
 * Compare the canonical JSON declarations used at host registration and lazy
 * module evaluation. Object key order is deliberately not significant; array
 * order remains declaration data and is therefore significant.
 */
export function findSynWareManifestDifference(
  expected: Readonly<SynWareManifestV1>,
  actual: Readonly<SynWareManifestV1>,
): SynWareManifestDifference | null {
  return difference(expected, actual, "");
}
