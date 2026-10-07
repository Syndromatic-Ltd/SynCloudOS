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

/** Application authorization and document identity are distinct from byte identity. */
export interface DocumentAssetScope {
  readonly authorizationId: string;
  readonly documentId: string;
}

export interface DocumentAssetIntrinsicMetrics {
  readonly width: number;
  readonly height: number;
  readonly density?: number;
}

export interface DocumentAssetReference {
  readonly kind: "document-asset";
  readonly scope: DocumentAssetScope;
  readonly assetId: string;
  readonly hash: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly intrinsic?: DocumentAssetIntrinsicMetrics;
}

/** External provider authority is explicit; volatile URLs are not durable references. */
export interface DocumentExternalAssetReference {
  readonly kind: "external-document-asset";
  readonly scope: DocumentAssetScope;
  readonly assetId: string;
  readonly providerId: string;
  readonly resourceId: string;
  readonly url?: string;
  readonly hash: string;
  readonly mimeType: string;
  readonly byteLength: number;
}

export type DocumentAssetRetentionKind = "committed" | "transaction" | "history" | "version" | "recovery" | "output";
export interface DocumentAssetRetentionRoot {
  readonly scope: DocumentAssetScope;
  readonly kind: DocumentAssetRetentionKind;
  readonly id: string;
}

export interface DocumentAssetInput {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly assetId?: string;
  readonly intrinsic?: DocumentAssetIntrinsicMetrics;
}

export interface DocumentAssetStoreCapabilities {
  readonly durability: "memory" | "durable";
  readonly maximumAssetBytes: number;
  readonly maximumTotalBytes: number;
  readonly maximumRetentionRoots: number;
  readonly retention: "persistent-roots";
  readonly deduplication: "authorization-scoped";
}

export interface DocumentAssetCollectionResult {
  readonly removedAssets: number;
  readonly removedBytes: number;
}

export interface DocumentAssetStore {
  readonly capabilities: DocumentAssetStoreCapabilities;
  put(scope: DocumentAssetScope, input: DocumentAssetInput, signal?: AbortSignal): Promise<DocumentAssetReference>;
  read(scope: DocumentAssetScope, reference: DocumentAssetReference, signal?: AbortSignal): Promise<Uint8Array>;
  copy(source: DocumentAssetScope, reference: DocumentAssetReference, destination: DocumentAssetScope, signal?: AbortSignal): Promise<DocumentAssetReference>;
  /** Replaces a root atomically; returned token fences stale release handles. */
  retain(root: DocumentAssetRetentionRoot, references: readonly DocumentAssetReference[], signal?: AbortSignal): Promise<string>;
  /** Optional atomic verified move at full quota; undefined means the source generation changed. */
  promoteRetentionRoot?(source: DocumentAssetRetentionRoot, target: DocumentAssetRetentionRoot, references: readonly DocumentAssetReference[], expectedToken: string, signal?: AbortSignal): Promise<string | undefined>;
  release(root: DocumentAssetRetentionRoot, signal?: AbortSignal, expectedToken?: string): Promise<boolean>;
  listRetentionRoots(scope: DocumentAssetScope, signal?: AbortSignal): Promise<readonly { readonly root: DocumentAssetRetentionRoot; readonly references: readonly DocumentAssetReference[]; readonly token: string }[]>;
  collectGarbage(scope: DocumentAssetScope, signal?: AbortSignal): Promise<DocumentAssetCollectionResult>;
  dispose(): void;
}
