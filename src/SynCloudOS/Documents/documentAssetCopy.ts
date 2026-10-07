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

import { createDocumentAssetManifest, type DocumentAssetManifest } from "./documentAssetManifest";
import type { DocumentAssetReference, DocumentAssetScope, DocumentAssetStore } from "./documentAssetTypes";
import { assertDocumentAssetNotAborted, DocumentAssetError } from "./documentAssetErrors";
import { validateDocumentAssetScope } from "./documentAssetValidation";

export interface DocumentAssetCopyResult {
  readonly manifest: DocumentAssetManifest;
  readonly mapping: readonly { readonly source: DocumentAssetReference; readonly destination: DocumentAssetReference }[];
}

/** App rewrites its native references using this mapping; no source live lease is reused. */
export async function copyDocumentAssetManifest(store: DocumentAssetStore, manifest: DocumentAssetManifest, destination: DocumentAssetScope, signal?: AbortSignal): Promise<DocumentAssetCopyResult> {
  assertDocumentAssetNotAborted(signal);
  const captured = createDocumentAssetManifest(manifest.scope, manifest.assets);
  const target = validateDocumentAssetScope(destination);
  if (captured.scope.authorizationId !== target.authorizationId) throw new DocumentAssetError("asset-unauthorized", "Cross-provider asset transfer requires an explicit provider capability.");
  const mapping: { readonly source: DocumentAssetReference; readonly destination: DocumentAssetReference }[] = [];
  for (const source of captured.assets) mapping.push(Object.freeze({ source, destination: await store.copy(captured.scope, source, target, signal) }));
  assertDocumentAssetNotAborted(signal);
  return Object.freeze({ manifest: createDocumentAssetManifest(target, mapping.map(pair => pair.destination)), mapping: Object.freeze(mapping) });
}
