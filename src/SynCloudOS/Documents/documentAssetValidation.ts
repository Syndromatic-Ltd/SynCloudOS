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

import { DocumentAssetError } from "./documentAssetErrors";
import type { DocumentAssetIntrinsicMetrics, DocumentAssetReference, DocumentAssetRetentionRoot, DocumentAssetScope, DocumentExternalAssetReference } from "./documentAssetTypes";

function invalid(message: string): never { throw new DocumentAssetError("asset-invalid", message); }
function data(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid("Assets require plain data values.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length || Object.keys(descriptors).some(key => !required.includes(key) && !optional.includes(key)) ||
    required.some(key => !(key in descriptors)) || Object.values(descriptors).some(d => !("value" in d))) return invalid("Asset data contains unsupported or missing fields.");
  return Object.fromEntries(Object.entries(descriptors).map(([key, d]) => [key, d.value]));
}
export function documentAssetId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512 || /[\u0000-\u001f]/u.test(value)) return invalid("A bounded asset identity is required.");
  return value;
}
export function documentAssetMime(value: unknown): string {
  if (typeof value !== "string" || value.length > 255 || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(value)) return invalid("A canonical MIME type is required.");
  return value;
}
export function documentAssetHash(value: unknown): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) return invalid("A SHA-256 asset digest is required.");
  return value;
}
export function validateDocumentAssetScope(value: unknown): DocumentAssetScope {
  const v = data(value, ["authorizationId", "documentId"]);
  return Object.freeze({ authorizationId: documentAssetId(v.authorizationId), documentId: documentAssetId(v.documentId) });
}
export function documentAssetScopeEqual(a: DocumentAssetScope, b: DocumentAssetScope): boolean {
  return a.authorizationId === b.authorizationId && a.documentId === b.documentId;
}
export function validateDocumentAssetIntrinsic(value: unknown): DocumentAssetIntrinsicMetrics {
  const v = data(value, ["width", "height"], ["density"]);
  for (const key of ["width", "height", ...(v.density === undefined ? [] : ["density"])]) {
    if (typeof v[key] !== "number" || !Number.isFinite(v[key]) || (v[key] as number) <= 0) invalid("Intrinsic asset metrics must be positive finite numbers.");
  }
  return Object.freeze(v) as unknown as DocumentAssetIntrinsicMetrics;
}
export function validateDocumentAssetReference(value: unknown): DocumentAssetReference {
  const v = data(value, ["kind", "scope", "assetId", "hash", "mimeType", "byteLength"], ["intrinsic"]);
  if (v.kind !== "document-asset" || !Number.isSafeInteger(v.byteLength) || (v.byteLength as number) < 0) return invalid("Invalid asset reference.");
  return Object.freeze({ kind: "document-asset", scope: validateDocumentAssetScope(v.scope), assetId: documentAssetId(v.assetId),
    hash: documentAssetHash(v.hash), mimeType: documentAssetMime(v.mimeType), byteLength: v.byteLength as number,
    ...(v.intrinsic === undefined ? {} : { intrinsic: validateDocumentAssetIntrinsic(v.intrinsic) }) });
}
export function validateDocumentExternalAssetReference(value: unknown): DocumentExternalAssetReference {
  const v = data(value, ["kind", "scope", "assetId", "providerId", "resourceId", "hash", "mimeType", "byteLength"], ["url"]);
  if (v.kind !== "external-document-asset" || !Number.isSafeInteger(v.byteLength) || (v.byteLength as number) < 0) return invalid("Invalid external asset reference.");
  if (v.url !== undefined && (typeof v.url !== "string" || !/^https:\/\/[^\s]+$/u.test(v.url))) return invalid("External durable URLs require HTTPS provider authority.");
  return Object.freeze({ ...v, scope: validateDocumentAssetScope(v.scope), assetId: documentAssetId(v.assetId), providerId: documentAssetId(v.providerId),
    resourceId: documentAssetId(v.resourceId), hash: documentAssetHash(v.hash), mimeType: documentAssetMime(v.mimeType) }) as unknown as DocumentExternalAssetReference;
}
export function validateDocumentAssetRoot(value: unknown): DocumentAssetRetentionRoot {
  const v = data(value, ["scope", "kind", "id"]);
  if (!["committed", "transaction", "history", "version", "recovery", "output"].includes(v.kind as string)) return invalid("Invalid asset retention root.");
  return Object.freeze({ scope: validateDocumentAssetScope(v.scope), kind: v.kind, id: documentAssetId(v.id) }) as DocumentAssetRetentionRoot;
}
export function documentAssetKey(reference: Pick<DocumentAssetReference, "scope" | "assetId">): string {
  return JSON.stringify([reference.scope.authorizationId, reference.scope.documentId, reference.assetId]);
}
export function documentAssetBlobKey(reference: Pick<DocumentAssetReference, "scope" | "hash">): string {
  return JSON.stringify([reference.scope.authorizationId, reference.hash]);
}
export function documentAssetRootKey(root: DocumentAssetRetentionRoot): string {
  return JSON.stringify([root.scope.authorizationId, root.scope.documentId, root.kind, root.id]);
}
export function documentAssetReferencesEqual(a: DocumentAssetReference, b: DocumentAssetReference): boolean {
  return JSON.stringify(validateDocumentAssetReference(a)) === JSON.stringify(validateDocumentAssetReference(b));
}
