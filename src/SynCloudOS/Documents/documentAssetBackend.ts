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

import type { DocumentAssetReference, DocumentAssetRetentionRoot } from "./documentAssetTypes";

export interface DocumentAssetBackendState {
  assets: Record<string, DocumentAssetReference>;
  blobs: Record<string, Uint8Array>;
  roots: Record<string, { root: DocumentAssetRetentionRoot; references: readonly string[]; token: string }>;
}
export function emptyDocumentAssetState(): DocumentAssetBackendState {
  return { assets: {}, blobs: {}, roots: {} };
}
/** Internal backing protocol. Mutations execute synchronously inside one storage transaction. */
export interface DocumentAssetBackend {
  readonly durability: "memory" | "durable";
  run<T>(write: boolean, operation: (state: DocumentAssetBackendState) => T, signal?: AbortSignal): Promise<T>;
  dispose(): void;
}
