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

import type { GFXPDFContext } from "../../FX/GraphicsFX/pdf/GFXPDFContext";
import type { GFXPDFMetadata, GFXPDFPageOptions } from "../../FX/GraphicsFX/pdf/pdfTypes";
import type { DocumentEditingParticipantResult, DocumentEditingSettlementResult } from "./documentEditingTypes";

export type DocumentOutputPurpose = "export" | "print";
export interface DocumentOutputSnapshot<TModel> {
  readonly documentId: string;
  /** Monotonic canonical mutation revision, independent of native saved identity. */
  readonly revision: number;
  readonly model: TModel;
}
/** Accepts the existing full document barrier or its minimal injected participant result. */
export type DocumentOutputSettlement = DocumentEditingSettlementResult | DocumentEditingParticipantResult;
export interface DocumentOutputDependencies<TModel> {
  settle(purpose: DocumentOutputPurpose, signal: AbortSignal): DocumentOutputSettlement | Promise<DocumentOutputSettlement>;
  /** Synchronous capture of one canonical model/revision after settlement. Models use native document JSON values. */
  capture(): DocumentOutputSnapshot<TModel>;
  /** Scoped owner lifetime, in addition to each request's cancellation signal. */
  readonly signal?: AbortSignal;
}
export interface DocumentOutputLease {
  readonly value: unknown;
  /**
   * Synchronously drops this output's retention only; must not revoke another owner's lease.
   * Async backing release requires an adapter that observes its promise and reports later
   * failures to its runtime owner. Already-issued output receipts cannot include future errors.
   */
  release(): void;
}
export interface DocumentOutputFallback {
  readonly requested: string;
  readonly actual: string;
  readonly reason: string;
}
export type DocumentOutputRetainResult =
  | { readonly status: "retained"; readonly lease: DocumentOutputLease; readonly fallback?: DocumentOutputFallback }
  | { readonly status: "pending" | "missing" | "unsupported"; readonly reason: string };
export interface DocumentOutputDependency {
  readonly id: string;
  readonly kind: "font" | "resource";
  /** All declared dependencies are required. Undeclared optional content is engine policy. */
  retain(signal: AbortSignal): DocumentOutputRetainResult | Promise<DocumentOutputRetainResult>;
}
export interface DocumentOutputDrawing<TModel> {
  readonly snapshot: DocumentOutputSnapshot<TModel>;
  readonly dependencies: ReadonlyMap<string, unknown>;
  readonly signal: AbortSignal;
}
/** The preparation service owns pages and recorder completion; engines own drawing within each page. */
export type DocumentOutputDrawingContext = Omit<GFXPDFContext, "beginPage" | "endPage" | "finish" | "dispose">;
export interface DocumentOutputPage<TModel> {
  /** PDF points; engine-supplied dimensions, quarter-turn rotation and optional boxes. */
  readonly geometry: GFXPDFPageOptions;
  draw(context: DocumentOutputDrawingContext, drawing: DocumentOutputDrawing<TModel>): void | Promise<void>;
}
export interface DocumentOutputPlan<TModel> {
  readonly pages: readonly DocumentOutputPage<TModel>[];
  readonly dependencies?: readonly DocumentOutputDependency[];
  readonly metadata?: GFXPDFMetadata;
}
export type DocumentOutputEngine<TModel> = (snapshot: DocumentOutputSnapshot<TModel>, signal: AbortSignal) => DocumentOutputPlan<TModel> | Promise<DocumentOutputPlan<TModel>>;
export interface DocumentOutputRequest<TModel> {
  readonly purpose?: DocumentOutputPurpose;
  readonly configurationId?: string;
  readonly engine: DocumentOutputEngine<TModel>;
  readonly acceptFallbacks?: boolean;
  readonly signal?: AbortSignal;
}
export type DocumentOutputReadiness = "complete" | "accepted-fallback" | "pending-resources" | "missing-resources" | "unsupported" | "unavailable";
export interface DocumentOutputDependencyReceipt {
  readonly id: string;
  readonly kind: "font" | "resource";
  readonly status: "retained" | "pending" | "missing" | "unsupported";
  readonly reason?: string;
}
export interface DocumentOutputReceipt {
  readonly documentId: string | null;
  readonly revision: number | null;
  readonly purpose: DocumentOutputPurpose;
  readonly configurationId: string;
  readonly readiness: DocumentOutputReadiness;
  readonly pageUnit: "pt";
  readonly pages: readonly GFXPDFPageOptions[];
  readonly dependencies: readonly DocumentOutputDependencyReceipt[];
  readonly fallbacks: readonly (DocumentOutputFallback & { readonly dependencyId: string })[];
  readonly cleanupErrors: readonly string[];
  readonly reason?: string;
}
export type DocumentOutputPDFResult =
  | { readonly status: "exported"; readonly bytes: Uint8Array; readonly mimeType: "application/pdf"; readonly receipt: DocumentOutputReceipt }
  | { readonly status: "canceled" | "failed"; readonly receipt: DocumentOutputReceipt };
export interface PreparedDocumentOutput<TModel> {
  readonly snapshot: DocumentOutputSnapshot<TModel>;
  readonly receipt: DocumentOutputReceipt;
  /** One-shot recording; repeated calls join the same operation. All leases are dropped at completion. */
  exportPDF(): Promise<DocumentOutputPDFResult>;
  /** Abandons output and cancels in-flight drawing. Returns cleanup errors; idempotent. */
  release(): readonly string[];
}
export type DocumentOutputPreparationResult<TModel> =
  | { readonly status: "prepared"; readonly output: PreparedDocumentOutput<TModel> }
  | { readonly status: "refused" | "canceled" | "pending-resources" | "missing-resources" | "unsupported" | "failed"; readonly receipt: DocumentOutputReceipt };
export interface DocumentOutputPreparation<TModel> {
  prepare(request: DocumentOutputRequest<TModel>): Promise<DocumentOutputPreparationResult<TModel>>;
}
export type DocumentOutputPDFArtifact = Extract<DocumentOutputPDFResult, { status: "exported" }>;
export interface DocumentOutputPrintHost {
  isUserActivationActive(): boolean;
  /** Synchronous request on an already-presented surface for this artifact. Never prepare or await here. */
  requestDialog(artifact: DocumentOutputPDFArtifact): "dialog-requested" | "canceled";
}
export interface DocumentOutputPrintResult {
  readonly status: "prepared" | "dialog-requested" | "canceled" | "failed";
  readonly receipt: DocumentOutputReceipt;
  readonly reason?: string;
}
