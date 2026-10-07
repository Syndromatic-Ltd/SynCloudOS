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

export interface SynCloudOSNamedRouteIdentity {
  readonly version: 1;
  readonly kind: "named-route";
  readonly routeName: string;
  readonly parameters: Readonly<Record<string, string>>;
}

const identityKeys = Object.freeze(["version", "kind", "routeName", "parameters"] as const);
const routeNamePattern = /^[A-Za-z][A-Za-z0-9._-]*$/u;
const parameterNamePattern = /^[A-Za-z_][A-Za-z0-9._-]*$/u;
const controlCharacters = /[\u0000-\u001f\u007f]/u;
const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function plainDataRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new TypeError(`${label} must be plain data.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be plain data with no custom prototype.`);
  if (Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} cannot contain symbol fields.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor)) throw new TypeError(`${label} fields must be data descriptors.`);
    result[key] = descriptor.value;
  }
  return result;
}

function boundedString(value: unknown, label: string, maximumBytes: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string.`);
  if (controlCharacters.test(value)) throw new TypeError(`${label} cannot contain control characters.`);
  if (byteLength(value) > maximumBytes) throw new RangeError(`${label} exceeds its ${maximumBytes}-byte limit.`);
  if (pattern && !pattern.test(value)) throw new TypeError(`${label} has an invalid shape.`);
  return value;
}

export function createSynCloudOSNamedRouteIdentity(value: unknown): SynCloudOSNamedRouteIdentity {
  const input = plainDataRecord(value, "Named-route identity");
  const keys = Object.keys(input);
  if (keys.length !== identityKeys.length || identityKeys.some((key) => !Object.hasOwn(input, key))) {
    throw new TypeError("Named-route identity has an invalid field shape.");
  }
  if (input.version !== 1) throw new TypeError("Named-route identity version must be 1.");
  if (input.kind !== "named-route") throw new TypeError("Named-route identity kind must be named-route.");
  const routeName = boundedString(input.routeName, "Route name", 128, routeNamePattern);
  const rawParameters = plainDataRecord(input.parameters, "Named-route parameters");
  const parameterKeys = Object.keys(rawParameters).sort();
  if (parameterKeys.length > 16) throw new RangeError("Named-route parameter count exceeds 16.");
  const parameters: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const key of parameterKeys) {
    const parameterName = boundedString(key, "Route parameter name", 64, parameterNamePattern);
    parameters[parameterName] = boundedString(rawParameters[key], `Route parameter ${parameterName}`, 512);
  }
  return Object.freeze({
    version: 1 as const,
    kind: "named-route" as const,
    routeName,
    parameters: Object.freeze(parameters),
  });
}
