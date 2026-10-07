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

import { DocumentAssetError, assertDocumentAssetNotAborted } from "./documentAssetErrors";
import type { DocumentAssetReference, DocumentAssetScope, DocumentAssetStore } from "./documentAssetTypes";
import { documentAssetKey, documentAssetReferencesEqual, documentAssetScopeEqual, validateDocumentAssetReference, validateDocumentAssetScope } from "./documentAssetValidation";

export const documentAssetManifestMetadataKey = "syncloudos.document.assets.v1";
export interface DocumentAssetManifest {
  readonly version: 1;
  readonly scope: DocumentAssetScope;
  readonly assets: readonly DocumentAssetReference[];
}

export function createDocumentAssetManifest(scope: DocumentAssetScope, references: readonly DocumentAssetReference[]): DocumentAssetManifest {
  const capturedScope = validateDocumentAssetScope(scope);
  if (!Array.isArray(references)) throw new DocumentAssetError("asset-invalid", "Reference enumeration must return an array.");
  if (references.length > 4096) throw new DocumentAssetError("asset-quota", "Manifest exceeds the asset reference limit.");
  const assets = new Map<string, DocumentAssetReference>();
  for (const value of references) {
    const reference = validateDocumentAssetReference(value);
    if (!documentAssetScopeEqual(capturedScope, reference.scope)) throw new DocumentAssetError("asset-unauthorized", "Manifest references must belong to the destination document scope.");
    const key = documentAssetKey(reference), previous = assets.get(key);
    if (previous && !documentAssetReferencesEqual(previous, reference)) throw new DocumentAssetError("asset-conflict", "A manifest contains conflicting stable asset identities.");
    assets.set(key, reference);
  }
  return Object.freeze({ version: 1, scope: capturedScope, assets: Object.freeze([...assets.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, reference]) => reference)) });
}

export function encodeDocumentAssetManifest(manifest: DocumentAssetManifest): string {
  const encoded = JSON.stringify(validateDocumentAssetManifest(manifest));
  if (encoded.length > 2 * 1024 * 1024) throw new DocumentAssetError("asset-quota", "Manifest exceeds its metadata limit.");
  return encoded;
}

export function validateDocumentAssetManifest(value: unknown): DocumentAssetManifest {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length) {
    throw new DocumentAssetError("asset-corrupt", "Invalid asset manifest envelope.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length !== 3 || ["version", "scope", "assets"].some(key => !(key in descriptors)) || keys.some(key => !("value" in descriptors[key])) || descriptors.version.value !== 1) {
    throw new DocumentAssetError("asset-corrupt", "Unsupported or invalid asset manifest version/envelope.");
  }
  return createDocumentAssetManifest(descriptors.scope.value, descriptors.assets.value);
}

export function readDocumentAssetManifest(metadata: Readonly<Record<string, string>>): DocumentAssetManifest | null {
  const encoded = metadata[documentAssetManifestMetadataKey];
  if (encoded === undefined) return null;
  try {
    if (typeof encoded !== "string" || encoded.length > 2 * 1024 * 1024) throw new Error("Invalid manifest size.");
    return validateDocumentAssetManifest(JSON.parse(encoded));
  } catch (cause) { throw new DocumentAssetError("asset-corrupt", "The saved asset manifest is invalid.", { cause }); }
}

export async function verifyDocumentAssetManifest(store: DocumentAssetStore, manifest: DocumentAssetManifest, signal?: AbortSignal): Promise<void> {
  assertDocumentAssetNotAborted(signal);
  const captured = validateDocumentAssetManifest(manifest);
  for (const reference of captured.assets) await store.read(captured.scope, reference, signal);
  assertDocumentAssetNotAborted(signal);
}
