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

/** Private host/dev protocol. Deliberately absent from runtime and SDK barrels. */
export const inspectorPanels = ["Runtime", "Applications", "Routes", "Transitions", "Operations", "Statechart", "Services", "Policy", "Windows", "Documents", "Resources", "NSE", "FX", "Performance"] as const;
export type InspectorPanel = typeof inspectorPanels[number];
export interface InspectorLink { readonly relation: "operation" | "latest-route-operation" | "correlation" | "parent" | "successor" | "application" | "route" | "graph"; readonly panel: InspectorPanel; readonly id: string }
export interface InspectorRow {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly phase: string;
  readonly links: readonly InspectorLink[];
  readonly startedAt?: number;
  readonly updatedAt?: number;
  readonly endedAt?: number;
  readonly revision?: number;
  readonly parameterCount?: number;
  readonly queryCount?: number;
  readonly committed?: boolean;
  readonly pendingRoles: readonly string[];
}
export interface InspectorPanelSnapshot {
  readonly id: InspectorPanel;
  readonly status: "supported" | "unsupported" | "unavailable";
  readonly rows: readonly InspectorRow[];
  readonly omittedHistory: number;
}
export interface InspectorSnapshot {
  readonly version: 1;
  readonly runtimeId: string;
  readonly revision: number;
  readonly capturedAt: number;
  readonly capture: Readonly<{ status: "live" | "paused"; recorded: number; retained: number; dropped: number; skipped: number }>;
  readonly panels: readonly InspectorPanelSnapshot[];
}
export interface InspectorPage<T> { readonly rows: readonly T[]; readonly total: number; readonly nextCursor: string | null }
export interface InspectorNotice { readonly sequence: number; readonly at: number; readonly panel: InspectorPanel }
/** Host-only input: a read-only owner inspection method, never an app command. */
export interface InspectorSource {
  readonly panel: InspectorPanel;
  read(): readonly unknown[];
  subscribe(listener: () => void): () => void;
}
export interface InspectorClient {
  getSnapshot(): InspectorSnapshot;
  getPage(panel: InspectorPanel, options?: { readonly cursor?: string; readonly limit?: number }): InspectorPage<InspectorRow>;
  getEvents(options?: { readonly after?: number; readonly limit?: number }): InspectorPage<InspectorNotice>;
  subscribe(listener: () => void): () => void;
  pause(): void;
  resume(): void;
  exportSnapshot(snapshot: InspectorSnapshot): Readonly<{ fileName: string; content: string; bytes: number }>;
}
export interface InspectorProjection extends InspectorClient {
  redactTimeout(value: unknown): Readonly<{ status: string; pending: readonly InspectorRow[]; excluded: readonly InspectorRow[] }>;
  dispose(): void;
}
