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

export interface DocumentEditSelection {
  readonly before?: unknown;
  readonly after?: unknown;
}

export interface DocumentEditSelectionReceipt {
  readonly documentId: string;
  readonly direction: "undo" | "redo";
  readonly revision: number;
  readonly bookmark: unknown;
}

/** A history retention root, separate from committed-model ownership. */
export interface DocumentEditResourceRetention {
  readonly resourceIds: readonly string[];
  release(): void;
}

export interface DocumentEditOptions<TModel> {
  readonly expectedRevision: number;
  readonly actionName: string;
  /** Include flow/session/selection/input/format lineage in this key. */
  readonly coalescingKey?: string;
  readonly signal?: AbortSignal;
  /** Validate application invariants and references before admission. Throw to refuse. */
  readonly validateModel?: (next: Readonly<TModel>) => void;
  readonly selection?: DocumentEditSelection;
  /** Resolve the data bookmark in live sessions; no mounted view is required by undo. */
  readonly restoreSelection?: (receipt: DocumentEditSelectionReceipt) => void;
  readonly retainResources?: (before: Readonly<TModel>, after: Readonly<TModel>) => DocumentEditResourceRetention;
}

export interface DocumentEditReceipt {
  readonly status: "committed";
  readonly documentId: string;
  readonly changeId: string;
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly historyEntryId: string | null;
  readonly retainedResourceIds: readonly string[];
  readonly selection?: DocumentEditSelection;
}

export type DocumentEditRejectionReason = "stale" | "read-only" | "aborted" | "unavailable" | "invalid" | "failed";
export interface DocumentEditRejection {
  readonly status: "rejected";
  readonly documentId: string;
  readonly reason: DocumentEditRejectionReason;
  readonly error: Error;
}
export type DocumentEditResult = DocumentEditReceipt | DocumentEditRejection;
