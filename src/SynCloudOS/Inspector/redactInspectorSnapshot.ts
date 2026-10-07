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

import type { InspectorLink, InspectorPanel, InspectorRow } from "./inspectorTypes";

/** Do not read getters, prototypes, toJSON, errors, arbitrary labels or payloads. */
export function inspectorField(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null && !(Array.isArray(value) && prototype === Array.prototype)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch { return undefined; }
}

export function inspectorArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return [];
  const length = inspectorField(value, "length");
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) return [];
  if (length > 100000) throw new RangeError("Inspector owner array exceeds the diagnostic safety limit.");
  return Array.from({ length }, (_, index) => inspectorField(value, String(index)));
}

const statuses = new Set(["pending", "idle", "loading", "ready", "error", "disposed", "registered", "committed", "completed", "cancelled", "superseded", "failed", "rolledBack", "blocked", "redirected", "settled", "route-error", "not-found", "timed-out", "excluded", "unsupported", "revoked", "available", "unavailable", "open", "closed", "active", "inactive", "allowed", "denied", "clean", "dirty", "saving", "conflicted", "read-only", "deleted", "closing"]);
const phases = new Set(["validating", "will", "committing", "effects", "did", "completed", "cancelled", "failed", "rolledBack", "guard", "loader", "module", "presentation"]);
const kinds = new Set(["operation", "route.transition", "route.open", "route", "graph", "module", "loader", "presentation", "work", "runtime", "application", "service", "policy", "window", "document", "resource", "statechart", "performance", "animation", "audio", "graphics", "haptics", "image", "location", "lumina", "media", "midi", "motion", "text", "video"]);
const knownRoles = new Set(["application", "webspring", "route-outlet", "window", "multiswitch"]);
export const inspectorStatus = (value: unknown): string => typeof value === "string" && statuses.has(value) ? value : "unknown";

let captureSerial = 0;
/** References are opaque ordinals, never hashes of secrets. The dictionary is
 * pruned to references used by the current owner projection on each capture. */
export function createInspectorRedactor() {
  const captureNamespace = ++captureSerial;
  let serial = 0;
  const references = new Map<string, string>();
  const reference = (value: unknown, namespace: string): string | null => {
    if (typeof value !== "string" || !value || value.length > 1024) return null;
    const key = JSON.stringify([namespace, value]);
    let result = references.get(key);
    if (!result) result = `ref-${captureNamespace}-${++serial}`;
    references.set(key, result);
    return result;
  };
  return {
    prune(retained: ReadonlySet<string>) { for (const [key, id] of references) if (!retained.has(id)) references.delete(key); },
    clear() { references.clear(); },
    reference,
    row(value: unknown, fallbackId: string, panel: InspectorPanel): InspectorRow {
      const links: InspectorLink[] = [];
      const link = (key: string, relation: InspectorLink["relation"], panel: InspectorPanel) => {
        const id = reference(inspectorField(value, key), relation === "correlation" || relation === "parent" ? "correlation" : panel);
        if (id) links.push(Object.freeze({ relation, panel, id }));
      };
      link("operationId", "operation", "Operations");
      link("latestOperationId", "latest-route-operation", "Operations");
      link("correlationId", "correlation", "Operations");
      link("parentCorrelationId", "parent", "Operations");
      link("successorId", "successor", "Operations");
      link("appId", "application", "Applications");
      link("routeId", "route", "Routes");
      link("graphId", "graph", "Routes");
      const numeric: Record<string, number> = {};
      for (const key of ["startedAt", "updatedAt", "endedAt", "revision", "parameterCount", "queryCount"]) {
        const field = inspectorField(value, key);
        if (typeof field === "number" && Number.isFinite(field) && field >= 0 && field <= Number.MAX_SAFE_INTEGER) numeric[key] = field;
      }
      const kind = inspectorField(value, "kind");
      const phase = inspectorField(value, "phase");
      const committed = inspectorField(value, "committed");
      return Object.freeze({
        id: reference(inspectorField(value, "id"), panel) ?? reference(fallbackId, panel)!,
        kind: typeof kind === "string" && kinds.has(kind) ? kind : "unknown",
        status: inspectorStatus(inspectorField(value, "status")),
        phase: typeof phase === "string" && phases.has(phase) ? phase : "unknown",
        ...numeric,
        ...(typeof committed === "boolean" ? { committed } : {}),
        pendingRoles: Object.freeze(inspectorArray(inspectorField(value, "pendingRoles")).slice(0, 64).map(role => typeof role === "string" && knownRoles.has(role) ? role : reference(role, "role") ?? "unknown")),
        links: Object.freeze(links),
      });
    },
  };
}
