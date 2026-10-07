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

import type { DocumentAssetReference, DocumentAssetRetentionRoot, DocumentAssetStore } from "./documentAssetTypes";
import { validateDocumentAssetRoot } from "./documentAssetValidation";

export interface DocumentAssetRetentionHandle {
  readonly root: DocumentAssetRetentionRoot;
  release(signal?: AbortSignal): Promise<boolean>;
}
export interface DocumentAssetRetention {
  retain(root: DocumentAssetRetentionRoot, references: readonly DocumentAssetReference[], signal?: AbortSignal): Promise<DocumentAssetRetentionHandle>;
  replace(root: DocumentAssetRetentionRoot, references: readonly DocumentAssetReference[], signal?: AbortSignal): Promise<string>;
  release(root: DocumentAssetRetentionRoot, signal?: AbortSignal): Promise<boolean>;
}
export function createDocumentAssetRetention(store: DocumentAssetStore): DocumentAssetRetention {
  return Object.freeze({
    async retain(root: DocumentAssetRetentionRoot, references: readonly DocumentAssetReference[], signal?: AbortSignal) {
      const capturedRoot = validateDocumentAssetRoot(root);
      const token = await store.retain(capturedRoot, references, signal);
      let released = false;
      return Object.freeze({ root: capturedRoot, async release(releaseSignal?: AbortSignal) {
        if (released) return false;
        const result = await store.release(capturedRoot, releaseSignal, token);
        released = true;
        return result;
      } });
    },
    replace: (root: DocumentAssetRetentionRoot, references: readonly DocumentAssetReference[], signal?: AbortSignal) => store.retain(root, references, signal),
    release: (root: DocumentAssetRetentionRoot, signal?: AbortSignal) => store.release(root, signal),
  });
}
