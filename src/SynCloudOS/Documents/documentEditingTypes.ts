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

import type { DocumentEditOptions, DocumentEditResult } from "./documentEditTypes";

export type DocumentEditingReason = "save" | "save-as" | "export" | "print" | "revert" | "transition" | "close";
export interface DocumentEditingIssue { readonly message: string; readonly code?: string }
export type DocumentEditingParticipantResult =
  | { readonly status: "settled" }
  | { readonly status: "refused"; readonly reason: string; readonly issues?: readonly DocumentEditingIssue[] };

export interface DocumentEditingContext<TModel = unknown> {
  readonly documentId: string;
  readonly reason: DocumentEditingReason;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  /** Use this admission capability for async participant commits. It expires with the barrier. */
  transact(transform: (current: Readonly<TModel>) => TModel, options: DocumentEditOptions<TModel>): DocumentEditResult;
}
export interface DocumentEditingParticipant<TModel = unknown> {
  readonly id: string;
  settle(context: DocumentEditingContext<TModel>): DocumentEditingParticipantResult | Promise<DocumentEditingParticipantResult>;
  discard?(context: DocumentEditingContext<TModel>): DocumentEditingParticipantResult | Promise<DocumentEditingParticipantResult>;
}
export interface DocumentEditingLifetimeOptions {
  readonly signal?: AbortSignal;
  readonly windowControllerId?: string;
  readonly mountId?: string;
  readonly isCurrent?: () => boolean;
}
export interface DocumentEditingParticipantRegistration {
  readonly isLive: boolean;
  dispose(): void;
}
export type DocumentEditingSettlementResult =
  | { readonly status: "settled"; readonly documentId: string; readonly reason: DocumentEditingReason; readonly settledParticipantIds: readonly string[] }
  | { readonly status: "refused"; readonly documentId: string; readonly reason: DocumentEditingReason; readonly participantId: string; readonly refusalReason: string; readonly issues: readonly DocumentEditingIssue[]; readonly settledParticipantIds: readonly string[] }
  | { readonly status: "revoked"; readonly documentId: string; readonly reason: DocumentEditingReason; readonly revocationReason: "aborted" | "participant-revoked" | "document-revoked" | "membership-changed"; readonly participantId?: string; readonly settledParticipantIds: readonly string[] };
