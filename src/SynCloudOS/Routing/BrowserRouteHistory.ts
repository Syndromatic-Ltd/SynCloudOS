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

export const browserRouteHistoryNamespace = "__syncloudosRoute";
export const browserRouteHostStateKey = "__syncloudosHostState";

export interface ManagedRouteEntry {
  readonly runtimeSession: string;
  readonly entryKey: string;
  readonly position: number;
  readonly routeRevision: number;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function createManagedRouteEntry(entry: ManagedRouteEntry): ManagedRouteEntry {
  if (!entry.runtimeSession.trim()) throw new TypeError("Managed route entries require a runtime session.");
  if (!entry.entryKey.trim()) throw new TypeError("Managed route entries require an entry key.");
  if (!Number.isSafeInteger(entry.position)) throw new TypeError("Managed route entry position must be a safe integer.");
  if (!Number.isSafeInteger(entry.routeRevision) || entry.routeRevision < 0) {
    throw new TypeError("Managed route revision must be a non-negative safe integer.");
  }
  return Object.freeze({ ...entry });
}

export function mergeManagedRouteHistoryState(
  hostState: unknown,
  entry: ManagedRouteEntry,
): Readonly<Record<string, unknown>> {
  const safeEntry = createManagedRouteEntry(entry);
  const base = isPlainObject(hostState)
    ? { ...hostState }
    : hostState === undefined
      ? {}
      : { [browserRouteHostStateKey]: hostState };
  return Object.freeze({
    ...base,
    [browserRouteHistoryNamespace]: safeEntry,
  });
}

export function readManagedRouteEntry(state: unknown): ManagedRouteEntry | null {
  if (!isPlainObject(state)) return null;
  const candidate = state[browserRouteHistoryNamespace];
  if (!isPlainObject(candidate)) return null;
  const runtimeSession = candidate.runtimeSession;
  const entryKey = candidate.entryKey;
  const position = candidate.position;
  const routeRevision = candidate.routeRevision;
  if (
    typeof runtimeSession !== "string" || !runtimeSession.trim()
    || typeof entryKey !== "string" || !entryKey.trim()
    || !Number.isSafeInteger(position)
    || !Number.isSafeInteger(routeRevision)
    || (routeRevision as number) < 0
  ) {
    return null;
  }
  return Object.freeze({
    runtimeSession,
    entryKey,
    position: position as number,
    routeRevision: routeRevision as number,
  });
}
