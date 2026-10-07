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

import type { DocumentStorageAdapter } from "./Adapters/documentAdapterTypes";
import type { DocumentAssetRetentionRoot, DocumentAssetScope, DocumentAssetStore } from "./documentAssetTypes";
import { assertDocumentAssetNotAborted, DocumentAssetError } from "./documentAssetErrors";
import { canonicalDocumentJson, canonicalDocumentLocation, documentVersionsEqual, immutableDocumentValue, type DocumentLocation, type DocumentRecord, type DocumentVersion } from "./documentTypes";
import { createBrowserDocumentAssetEnvironment } from "../PlatformAdapters/BrowserDocumentAssetEnvironment";
import { documentAssetHash } from "./documentAssetValidation";

async function identity(value: string, hash = createBrowserDocumentAssetEnvironment().hash): Promise<string> {
  return documentAssetHash(await hash(new TextEncoder().encode(value))).slice("sha256:".length);
}
/** Stable root identity survives wrapper/kernel recreation; native providers own eviction. */
export async function documentAssetNativeVersionRoot(adapterId: string, scope: DocumentAssetScope, record: Pick<DocumentRecord<unknown>, "location" | "version">, hash?: (bytes: Uint8Array) => Promise<string>): Promise<DocumentAssetRetentionRoot> {
  const owner = await identity(JSON.stringify([adapterId, canonicalDocumentLocation(record.location)]), hash);
  const version = encodeURIComponent(canonicalDocumentJson(record.version));
  return Object.freeze({ scope, kind: "version", id: `native-version:${owner}:${version}` });
}

/** Actual provider receipts, never an invented prune API. Unknown staging roots stay pinned. */
export async function reconcileDocumentAssetVersions(options: {
  readonly adapter: DocumentStorageAdapter;
  readonly store: DocumentAssetStore;
  readonly scopeForLocation: (location: DocumentLocation) => DocumentAssetScope;
  readonly hash?: (bytes: Uint8Array) => Promise<string>;
}, location: DocumentLocation, signal?: AbortSignal): Promise<number> {
  const capturedLocation = immutableDocumentValue(location);
  const scope = options.scopeForLocation(capturedLocation);
  const prefix = `native-version:${await identity(JSON.stringify([options.adapter.id, canonicalDocumentLocation(capturedLocation)]), options.hash)}:`;
  // Snapshot roots before reading provider state, so a concurrent later write's
  // newly pinned version cannot be mistaken for an earlier eviction.
  const roots = await options.store.listRetentionRoots(scope, signal);
  const visible = await options.adapter.listVersions(capturedLocation, { signal });
  const current = await options.adapter.read(capturedLocation, { signal });
  let released = 0;
  for (const { root, token } of roots) {
    if (root.kind !== "version" || !root.id.startsWith(prefix)) continue;
    let version: DocumentVersion;
    try { version = JSON.parse(decodeURIComponent(root.id.slice(prefix.length))) as DocumentVersion; }
    catch { continue; }
    if (!version || typeof version.id !== "string" || !Number.isSafeInteger(version.sequence) || typeof version.savedAt !== "string" || typeof version.etag !== "string") continue;
    if (visible.some(value => documentVersionsEqual(value, version)) || documentVersionsEqual(current?.version ?? null, version)) continue;
    // Absence from a listing alone is insufficient; query the actual immutable
    // historical receipt before dropping its durable byte ownership.
    if (await options.adapter.readVersion(capturedLocation, version, { signal })) continue;
    assertDocumentAssetNotAborted(signal);
    if (await options.store.release(root, signal, token)) released += 1;
  }
  return released;
}

/** Release only supplied versions that the provider proves are no longer readable or current. */
export async function releaseEvictedDocumentAssetVersions(options: {
  readonly adapter: DocumentStorageAdapter;
  readonly store: DocumentAssetStore;
  readonly scopeForLocation: (location: DocumentLocation) => DocumentAssetScope;
  readonly hash?: (bytes: Uint8Array) => Promise<string>;
}, location: DocumentLocation, versions: readonly DocumentVersion[], signal?: AbortSignal): Promise<number> {
  const capturedLocation = immutableDocumentValue(location);
  const capturedVersions = immutableDocumentValue(versions);
  assertDocumentAssetNotAborted(signal);
  const snapshot = await options.store.listRetentionRoots(options.scopeForLocation(capturedLocation), signal);
  const visible = await options.adapter.listVersions(capturedLocation, { signal });
  const current = await options.adapter.read(capturedLocation, { signal });
  const roots: DocumentAssetRetentionRoot[] = [];
  for (const version of capturedVersions) {
    if (visible.some(value => documentVersionsEqual(value, version)) || documentVersionsEqual(current?.version ?? null, version) ||
        await options.adapter.readVersion(capturedLocation, version, { signal })) {
      throw new DocumentAssetError("asset-conflict", "A native version still exists; its assets cannot be evicted.");
    }
    roots.push(await documentAssetNativeVersionRoot(options.adapter.id, options.scopeForLocation(capturedLocation), { location: capturedLocation, version }, options.hash));
  }
  assertDocumentAssetNotAborted(signal);
  let released = 0;
  for (const root of roots) {
    const captured = snapshot.find(entry => entry.root.kind === root.kind && entry.root.id === root.id);
    if (captured && await options.store.release(root, signal, captured.token)) released += 1;
  }
  return released;
}
