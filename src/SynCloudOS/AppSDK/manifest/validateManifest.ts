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

import type { ErrorObject } from "ajv/dist/2020";
// synapp-manifest.schema.json, compiled by Ajv ahead of time
// (scripts/synware/gen-manifest-validator.mjs): compiling it here cost every
// boot 20-31 ms of main-thread time. A test keeps it current with the schema.
import { validate } from "./synappManifestValidator.generated.mjs";
import type {
  SynWareManifestIssue,
  SynWareManifestV1,
  SynWareManifestValidation,
} from "./manifestTypes";

function issuePath(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missing = (error.params as { readonly missingProperty: string }).missingProperty;
    return `${error.instancePath}/${missing}`;
  }
  if (error.keyword === "additionalProperties") {
    const property = (error.params as { readonly additionalProperty: string }).additionalProperty;
    return `${error.instancePath}/${property}`;
  }
  return error.instancePath || "/";
}

function issueCode(error: ErrorObject): SynWareManifestIssue["code"] {
  if (error.keyword === "required") return "required";
  if (error.keyword === "type") return "type";
  if (error.keyword === "additionalProperties") return "unknown-key";
  if (error.keyword === "format" || error.keyword === "pattern") return "format";
  return "conflict";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function pointerSegment(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** JSON Schema intentionally observes enumerable JSON values. Reject any
 * hidden/accessor/symbol value before Ajv so public boundaries cannot smuggle
 * data that build-time and registration-time validation would see differently. */
function inspectPublicBoundary(
  value: unknown,
  path = "",
  ancestors = new WeakSet<object>(),
): SynWareManifestIssue | null {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return null;
  if (typeof value !== "object") {
    return Object.freeze({ path: path || "/", code: "type" as const, message: "Manifest values must be JSON data." });
  }
  const object = value as object;
  if (ancestors.has(object)) {
    return Object.freeze({ path: path || "/", code: "conflict" as const, message: "Manifest values must not contain cycles." });
  }
  ancestors.add(object);
  try {
    if (Array.isArray(value)) {
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)) {
          return Object.freeze({ path: path || "/", code: "unknown-key" as const, message: "Manifest arrays may contain only indexed JSON values." });
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          return Object.freeze({ path: `${path}/${pointerSegment(key)}`, code: "unknown-key" as const, message: "Manifest values must be enumerable data properties." });
        }
        const issue = inspectPublicBoundary(descriptor.value, `${path}/${pointerSegment(key)}`, ancestors);
        if (issue) return issue;
      }
      return null;
    }
    if (!isPlainObject(value)) {
      return Object.freeze({ path: path || "/", code: "type" as const, message: "Manifest objects must use a plain object prototype." });
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        return Object.freeze({ path: path || "/", code: "unknown-key" as const, message: "Manifest objects must not contain symbol properties." });
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return Object.freeze({ path: `${path}/${pointerSegment(key)}`, code: "unknown-key" as const, message: "Manifest values must be enumerable data properties." });
      }
      const issue = inspectPublicBoundary(descriptor.value, `${path}/${pointerSegment(key)}`, ancestors);
      if (issue) return issue;
    }
    return null;
  } finally {
    ancestors.delete(object);
  }
}

function freezeIssues(errors: readonly ErrorObject[] | null | undefined): readonly SynWareManifestIssue[] {
  return Object.freeze((errors ?? [])
    .map((error) => Object.freeze({
      path: issuePath(error),
      code: issueCode(error),
      message: error.message ?? "The manifest is invalid.",
    }))
    .sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)));
}

/** Both build tooling and registration call this one compiled checked-in
 * schema; no handwritten validation rules are allowed alongside it. */
export function validateSynWareManifest(value: unknown): SynWareManifestValidation {
  if (!isPlainObject(value)) {
    return Object.freeze({
      ok: false as const,
      value: null,
      errors: Object.freeze([Object.freeze({
        path: "/",
        code: "type" as const,
        message: "A SynWare manifest must be a plain object.",
      })]),
    });
  }
  const boundaryIssue = inspectPublicBoundary(value);
  if (boundaryIssue) {
    return Object.freeze({
      ok: false as const,
      value: null,
      errors: Object.freeze([boundaryIssue]),
    });
  }
  if (validate(value)) {
    return Object.freeze({
      ok: true as const,
      value: value as SynWareManifestV1,
      errors: Object.freeze([]) as readonly [],
    });
  }
  return Object.freeze({
    ok: false as const,
    value: null,
    errors: freezeIssues(validate.errors),
  });
}
