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

import type { OperationCoordinator, PresentationSettlementCoordinator } from "../Operations/operationTypes";
import type { SettlementRegistry } from "../Testing/settlementTypes";
import type { InspectorSource } from "./inspectorTypes";
import { inspectorArray as array, inspectorField as field } from "./redactInspectorSnapshot";

/** Supplied by the routing owner. No transition handles, loaders, services,
 * graph methods or runtime object cross this seam. Absent arrays mean that
 * the owner does not yet expose that inspection family. */
export interface InspectorRouteInspection {
  readonly current?: Readonly<{ route: unknown; latestOperationId: string | null }> | null;
  readonly graphs?: readonly unknown[];
  readonly sessions?: readonly unknown[];
  readonly transitions?: readonly unknown[];
  readonly modules?: readonly unknown[];
}
export interface InspectorRouteInspectionPort {
  readonly runtimeId: string;
  read(): InspectorRouteInspection;
  subscribe(listener: () => void): () => void;
}
export interface InspectorOwnerPorts {
  readonly runtimeId: string;
  readonly operations: Pick<OperationCoordinator, "runtimeId" | "inspectPending" | "inspectHistory" | "subscribe">;
  readonly presentation: Pick<PresentationSettlementCoordinator, "runtimeId" | "inspectPending" | "subscribe">;
  readonly settlement?: Pick<SettlementRegistry, "runtimeId" | "getState" | "subscribe">;
  readonly routes?: InspectorRouteInspectionPort;
}
const select = (row: unknown, keys: readonly string[]): Record<string, unknown> => Object.fromEntries(keys.map(key => [key, field(row, key)]));
const identityFields = ["id", "operationId", "correlationId", "parentCorrelationId", "successorId", "appId", "routeId", "startedAt", "updatedAt", "endedAt", "revision", "committed"];
const routeIdentity = (appId: unknown, name: unknown): string | undefined => typeof name === "string"
  ? JSON.stringify([typeof appId === "string" ? appId : null, name]) : undefined;
const count = (value: unknown): number => {
  if (!value || typeof value !== "object") return 0;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || prototype === Object.prototype ? Object.keys(value).length : 0;
  } catch { return 0; }
};

export function createInspectorOwnerSources(owners: InspectorOwnerPorts): readonly InspectorSource[] {
  for (const owner of [owners.operations, owners.presentation, owners.settlement, owners.routes]) {
    if (owner && owner.runtimeId !== owners.runtimeId) throw new Error("Inspector owner belongs to another runtime.");
  }
  const sources: InspectorSource[] = [
    { panel: "Operations", subscribe: listener => owners.operations.subscribe(listener), read: () => {
      const pending = owners.operations.inspectPending();
      const pendingIds = new Set(pending.map(row => field(row, "operationId")));
      return [
        ...pending.map(row => ({ ...select(row, identityFields), id: field(row, "operationId"), kind: field(row, "kind"), phase: field(row, "phase"), status: "pending" })),
        ...owners.operations.inspectHistory().filter(row => !pendingIds.has(field(row, "operationId"))).map(row => ({
          ...select(row, identityFields), id: field(row, "operationId"), kind: field(row, "kind"), phase: field(row, "phase"), status: field(row, "status") ?? field(row, "phase"),
        })),
      ];
    } },
    { panel: "NSE", subscribe: listener => owners.presentation.subscribe(listener), read: () => owners.presentation.inspectPending().map(row => {
      const complete = new Set(array(field(row, "completedRoles")));
      return { ...select(row, identityFields), kind: "presentation", phase: "presentation", status: "pending",
        pendingRoles: array(field(row, "roles")).filter(role => !complete.has(role)) };
    }) },
  ];
  const settlement = owners.settlement;
  if (settlement) sources.push({ panel: "Resources", subscribe: listener => settlement.subscribe(listener), read: () => {
    const state = settlement.getState();
    const rows = (key: string, status?: string) => array(field(state, key)).map(row => ({ ...select(row, identityFields), kind: "work", status: status ?? field(row, "status") }));
    return [...rows("pending", "pending"), ...rows("excluded", "excluded"), ...rows("recent")];
  } });
  const routes = owners.routes;
  if (routes) {
    sources.push({ panel: "Transitions", subscribe: listener => routes.subscribe(listener), read: () => {
      const transitions = field(routes.read(), "transitions");
      if (transitions === undefined) return [{ id: "transitions:unsupported", kind: "route", status: "unsupported" }];
      return array(transitions).map(row => ({ ...select(row, identityFields), id: field(row, "operationId"), kind: "route", status: field(row, "outcome"), phase: field(row, "phase") }));
    } });
    sources.push({ panel: "Routes", subscribe: listener => routes.subscribe(listener), read: () => {
      const inspection = routes.read();
      const current = field(inspection, "current");
      const currentRoute = field(current, "route");
      const currentRows = currentRoute ? [{ id: routeIdentity(field(currentRoute, "appId"), field(currentRoute, "name")), appId: field(currentRoute, "appId"), graphId: field(currentRoute, "graphId"),
        latestOperationId: field(current, "latestOperationId"), kind: "route", status: "committed",
        parameterCount: count(field(currentRoute, "params")), queryCount: count(field(currentRoute, "query")) }] : [];
      const graphs = array(field(inspection, "graphs")).flatMap(graph => {
        const graphId = field(graph, "id"); const appId = field(graph, "appId");
        const declarations: Record<string, unknown>[] = [];
        const visited = new Set<unknown>();
        const walk = (nodes: unknown, parent: unknown, depth: number) => {
          if (depth > 12) throw new RangeError("Inspector route graph exceeds the diagnostic depth limit.");
          for (const node of array(nodes)) {
            if (visited.has(node)) continue;
            visited.add(node);
            if (visited.size > 2000) throw new RangeError("Inspector route graph exceeds the diagnostic node limit.");
            const name = field(node, "name");
            declarations.push({ id: routeIdentity(appId, name), appId, graphId, routeId: routeIdentity(appId, parent), kind: "route", status: "registered" });
            walk(field(node, "children"), name, depth + 1);
          }
        };
        walk(field(graph, "routes"), undefined, 0);
        return [{ id: graphId, appId, kind: "graph", status: "ready" }, ...declarations];
      });
      const sessions = array(field(inspection, "sessions")).flatMap(session => {
        const snapshot = field(session, "snapshot");
        const route = field(snapshot, "route");
        const nodes = field(snapshot, "nodes");
        const common = { operationId: field(session, "operationId"), appId: field(session, "appId"), revision: field(snapshot, "revision") };
        const routeRow = { ...common, id: routeIdentity(common.appId, field(route, "name")) ?? field(session, "appId"), kind: "route", status: field(snapshot, "status"),
          parameterCount: count(field(route, "params")), queryCount: count(field(route, "query")) };
        return [routeRow, ...array(field(route, "branch")).map(name => {
          const node = typeof name === "string" ? field(nodes, name) : undefined;
          return { ...common, id: typeof name === "string" ? routeIdentity(common.appId, `loader:${name}`) : undefined, routeId: routeIdentity(common.appId, name), kind: "loader", phase: "loader", status: field(node, "state") };
        })];
      });
      const modules: Record<string, unknown>[] = array(field(inspection, "modules")).map(row => ({ ...select(row, identityFields), kind: "module", phase: "module", status: field(row, "status") }));
      if (field(inspection, "modules") === undefined) modules.push({ id: "route-modules:unsupported", kind: "module", phase: "module", status: "unsupported" });
      return [...graphs, ...currentRows, ...sessions, ...modules];
    } });
  }
  return Object.freeze(sources.map(source => Object.freeze(source)));
}
