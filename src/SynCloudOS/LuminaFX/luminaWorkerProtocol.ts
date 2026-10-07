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

import type {
  LUFXIndexBackendMutation,
  LUFXIndexBackendMutationResult,
  LUFXIndexBackendSnapshot,
} from "../../FX/LuminaFX/LUFXIndexBackend";
import type { LUFXSearchableItemJSON } from "../../FX/LuminaFX/LUFXSearchableItem";
import type { LUFXQueryDescriptor } from "../../FX/LuminaFX/LUFXQuery";
import type { LUFXSnippet, LUFXSuggestionResult } from "../../FX/LuminaFX/LUFXSuggestions";
import type {
  LuminaIndexMaintenanceDiagnostics,
  LuminaIndexReplacementMetadata,
} from "./LuminaIndexMaintenance";
import type { LuminaEligibilityRestriction } from "./luminaEligibilityRestriction";

export interface LuminaWorkerQueryResultPage {
  readonly checkpoint: Readonly<{ generation: number; revision: number }>;
  readonly tokenizerVersion: string;
  readonly rankerVersion: string;
  readonly results: readonly Readonly<{ item: LUFXSearchableItemJSON; score: number; snippet: LUFXSnippet }>[];
  readonly nextCursor?: string;
}

export type LuminaWorkerRequest =
  | Readonly<{ id: number; operation: "mutate"; databaseName: string; ownerKey: string; mutation: LUFXIndexBackendMutation }>
  | Readonly<{ id: number; operation: "snapshot"; databaseName: string; ownerKey: string }>
  | Readonly<{ id: number; operation: "replace-all"; databaseName: string; ownerKey: string; items: readonly LUFXSearchableItemJSON[]; metadata: LuminaIndexReplacementMetadata }>
  | Readonly<{ id: number; operation: "replace-all-begin"; databaseName: string; ownerKey: string; batchId: number; metadata: LuminaIndexReplacementMetadata }>
  | Readonly<{ id: number; operation: "replace-all-chunk"; databaseName: string; ownerKey: string; batchId: number; items: readonly LUFXSearchableItemJSON[] }>
  | Readonly<{ id: number; operation: "replace-all-commit"; databaseName: string; ownerKey: string; batchId: number }>
  | Readonly<{ id: number; operation: "replace-all-abort"; databaseName: string; ownerKey: string; batchId: number }>
  | Readonly<{ id: number; operation: "erase-owner"; databaseName: string; ownerKey: string }>
  | Readonly<{ id: number; operation: "diagnostics"; databaseName: string; ownerKey: string }>
  | Readonly<{ id: number; operation: "query"; databaseName: string; ownerKey: string; query: LUFXQueryDescriptor; cursor?: string; restriction?: LuminaEligibilityRestriction }>
  | Readonly<{ id: number; operation: "suggest"; databaseName: string; ownerKey: string; query: LUFXQueryDescriptor; limit: number; maximumBytes: number }>
  | Readonly<{ id: number; operation: "cancel" }>
  | Readonly<{ id: number; operation: "dispose-owner"; databaseName: string; ownerKey: string }>;

export type LuminaWorkerValue = LUFXIndexBackendMutationResult | LUFXIndexBackendSnapshot | LuminaIndexMaintenanceDiagnostics | LuminaWorkerQueryResultPage | LUFXSuggestionResult | null;

export type LuminaWorkerResponse =
  | Readonly<{ id: number; ok: true; value: LuminaWorkerValue }>
  | Readonly<{ id: number; ok: false; error: Readonly<{ name: string; message: string }> }>;
