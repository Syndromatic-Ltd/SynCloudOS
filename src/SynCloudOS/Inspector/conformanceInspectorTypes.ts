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

/**
 * Stable, presentation-safe data returned by the framework inspector.  These
 * records deliberately model identities, state and bounded counters only;
 * bodies, payloads, locations, tokens and arbitrary error text are excluded.
 */
export interface ConformanceInspectorSnapshot {
  readonly runtimeId: string;
  readonly sequence: number;
  readonly capturedAt: string;
  /** Consumers must render this state instead of treating a bounded view as a
   * complete diagnostic report. */
  readonly metadata: ConformanceInspectorSnapshotMetadata;
  readonly runtime: {
    readonly state: string;
    readonly booted: boolean;
    readonly disposed: boolean;
    readonly activeOperations: readonly InspectorOperation[];
    readonly ownedResources: readonly InspectorResourceSummary[];
  };
  readonly lifecycle: {
    readonly apps: readonly InspectorAppLifecycle[];
    readonly timeline: readonly InspectorLifecycleEvent[];
  };
  readonly navigation: {
    readonly routes: readonly InspectorRouteNode[];
    readonly workspaces: readonly InspectorWorkspaceNode[];
    readonly browserQueue: readonly InspectorNavigationEntry[];
  };
  readonly adapters: readonly InspectorAdapterSummary[];
  readonly capabilities: readonly InspectorCapabilityDecision[];
  readonly activeResponder: InspectorResponderNode | null;
  readonly responderGraph: readonly InspectorResponderNode[];
  readonly commands: readonly InspectorCommandSummary[];
  readonly keyBindings: readonly InspectorKeyBindingSummary[];
  readonly undoManagers: readonly InspectorUndoManagerSummary[];
  readonly documents: readonly InspectorDocumentSummary[];
  readonly windows: readonly InspectorWindowSummary[];
  /** Panel and HUD roles are reported independently from ordinary windows so
   * presentation diagnostics can distinguish their ownership without exposing
   * a mutable window manager. */
  readonly panels: readonly InspectorWindowSummary[];
  readonly overlays: readonly InspectorOverlay[];
  readonly pasteboards: readonly InspectorPasteboardSummary[];
  readonly dragSession: { readonly id: string; readonly phase: string; readonly operation: string } | null;
  readonly colourPanel: { readonly open: boolean; readonly pickerId: string | null; readonly targetOwner: string | null };
  readonly caches: readonly InspectorCacheSummary[];
  readonly appearance: {
    readonly selection: InspectorAppearanceSelection;
    /** Bounded, producer-registered gallery slot facts. Values are category
     * labels only; no asset URL, path, or source payload is exposed. */
    readonly galleryCoverage: readonly InspectorAppearanceCoverage[];
    readonly unresolvedAssetSlots: readonly string[];
    readonly provenanceViolations: readonly string[];
  };
  readonly accessibility: readonly InspectorAccessibilityIssue[];
  readonly performance: readonly InspectorPerformanceCounter[];
  readonly errors: readonly InspectorBoundedError[];
}

export interface ConformanceInspectorSnapshotOptions {
  /** The caller owns refresh lifetime. A cancelled request never publishes a
   * partially collected snapshot. */
  readonly signal?: AbortSignal;
  readonly limits?: Partial<{
    readonly lifecycle: number;
    readonly events: number;
    readonly errors: number;
    readonly resources: number;
    readonly data: number;
  }>;
}

export type ConformanceInspectorSectionId =
  | "runtime.activeOperations"
  | "runtime.ownedResources"
  | "lifecycle.apps"
  | "lifecycle.timeline"
  | "navigation.routes"
  | "navigation.browserQueue"
  | "adapters"
  | "capabilities"
  | "responderGraph"
  | "commands"
  | "keyBindings"
  | "undoManagers"
  | "documents"
  | "windows"
  | "panels"
  | "overlays"
  | "pasteboards"
  | "dragSession"
  | "colourPanel"
  | "caches"
  | "appearance"
  | "accessibility"
  | "performance"
  | "errors";

export interface ConformanceInspectorSectionStatus {
  readonly id: ConformanceInspectorSectionId;
  readonly status: "complete" | "truncated" | "unavailable";
  readonly total: number | null;
  readonly returned: number;
  readonly redacted: number;
}

export interface ConformanceInspectorSnapshotMetadata {
  readonly complete: boolean;
  readonly returned: number;
  readonly redacted: number;
  readonly sections: readonly ConformanceInspectorSectionStatus[];
}

/** A portable, pre-validated export. SynWare deliberately receive text only;
 * browser download authority stays outside the runtime capability graph. */
export interface ConformanceInspectorExport {
  readonly fileName: "syncloudos-conformance-snapshot.json";
  readonly content: string;
  readonly bytes: number;
}

/** The sole public read-only inspector port. It has no manager, store, or
 * adapter escape hatch, which lets both Diagnostics and developer tooling use
 * the same bounded snapshot and export validation path. */
export interface ConformanceInspectorSnapshotPort {
  getConformanceSnapshot(options?: ConformanceInspectorSnapshotOptions): ConformanceInspectorSnapshot;
  refreshConformanceSnapshot(options?: ConformanceInspectorSnapshotOptions): Promise<ConformanceInspectorSnapshot>;
  exportConformanceSnapshot(snapshot: ConformanceInspectorSnapshot): ConformanceInspectorExport;
}

export interface InspectorOperation { readonly id: string; readonly kind: string; readonly phase: string; readonly status: string; }
export interface InspectorResourceSummary { readonly id: string; readonly kind: string; readonly count: number; }
export interface InspectorAppLifecycle { readonly id: string; readonly state: string; }
export interface InspectorLifecycleEvent { readonly id: string; readonly type: string; readonly appId: string | null; readonly at: number; }
export interface InspectorRouteNode { readonly id: string; readonly kind: string; readonly workspaceId: string; }
export interface InspectorWorkspaceNode { readonly id: string; readonly active: boolean; }
export interface InspectorNavigationEntry { readonly id: string; readonly at: number; readonly kind: string; }
export interface InspectorAdapterSummary { readonly id: string; readonly kind: string; readonly status: "available" | "unavailable" | "denied" | "failed"; }
export interface InspectorCapabilityDecision { readonly id: string; readonly capability: string; readonly status: "allowed" | "denied" | "unavailable"; }
export interface InspectorResponderNode { readonly id: string; readonly role: string; readonly parentId: string | null; }
export interface InspectorCommandSummary { readonly id: string; readonly enabled: boolean; readonly owner: string; }
export interface InspectorKeyBindingSummary { readonly commandId: string; readonly chord: string; readonly scope: string; }
export interface InspectorUndoManagerSummary { readonly id: string; readonly owner: string; readonly canUndo: boolean; readonly canRedo: boolean; }
export interface InspectorDocumentSummary {
  readonly id: string;
  readonly typeId: string;
  readonly state: string;
  readonly dirty: boolean;
  /** This is intentionally metadata, never a recovery id or serialized body. */
  readonly recovery: "none" | "available";
  readonly dirtyRevision: number;
  readonly recoveryVersion: number | null;
}
export interface InspectorWindowSummary {
  readonly id: string;
  readonly role: string;
  readonly state: string;
  readonly key: boolean;
  readonly zIndex: number;
}
export interface InspectorOverlay { readonly id: string; readonly kind: string; readonly state: string; }
export interface InspectorPasteboardSummary { readonly name: string; readonly types: readonly string[]; readonly changeCount: number; }
export interface InspectorCacheSummary { readonly id: string; readonly entries: number; readonly bytes: number; }
export interface InspectorAppearanceSelection { readonly requested: string; readonly resolved: string; }
export interface InspectorAppearanceCoverage {
  readonly slot: string;
  readonly status: "covered" | "unresolved" | "provenance-violation";
}
export interface InspectorAccessibilityIssue { readonly code: string; readonly severity: "info" | "warning" | "error"; }
export interface InspectorPerformanceCounter { readonly id: string; readonly value: number; readonly budget: number; }
export interface InspectorBoundedError { readonly id: string; readonly category: string; readonly code: string; readonly at: number; }

/** Internal producer registrations. They deliberately model only bounded
 * category facts and stay on the runtime inspector, never in the app SDK. */
export interface ConformanceInspectorAppearanceFact {
  readonly slot: string;
  readonly status: InspectorAppearanceCoverage["status"];
}

export interface ConformanceInspectorAccessibilityFinding {
  readonly code: string;
  readonly severity: InspectorAccessibilityIssue["severity"];
}
