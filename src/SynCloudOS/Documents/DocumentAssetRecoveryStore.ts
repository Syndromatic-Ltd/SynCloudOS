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

import type { DocumentRecoveryRecord, DocumentRecoveryStore } from "./DocumentRecoveryStore";
import type { DocumentAssetRetentionRoot, DocumentAssetScope, DocumentAssetStore } from "./documentAssetTypes";
import { createDocumentAssetManifest, encodeDocumentAssetManifest, verifyDocumentAssetManifest, type DocumentAssetManifest } from "./documentAssetManifest";
import type { DocumentAssetSaveOptions } from "./DocumentAssetSaveCoordinator";
import { immutableDocumentValue } from "./documentTypes";
import { DocumentAssetError } from "./documentAssetErrors";

export interface AssetBearingDocumentRecoveryRecord extends DocumentRecoveryRecord {
  readonly assetManifest: DocumentAssetManifest;
  readonly assetRetentionRoot: DocumentAssetRetentionRoot | null;
}

/** Manifest lives in the framework recovery envelope, outside app serializedContent. */
export function createDocumentAssetRecoveryStore(options: {
  readonly recovery: DocumentRecoveryStore;
  readonly store: DocumentAssetStore;
  readonly scopeForDocument: (documentId: string) => DocumentAssetScope;
  readonly enumerateReferences: DocumentAssetSaveOptions["enumerateReferences"];
  readonly randomUUID: () => string;
  readonly observeError?: (error: unknown) => void;
}): DocumentRecoveryStore {
  const manifestFor = (record: DocumentRecoveryRecord | Omit<DocumentRecoveryRecord, "recoveryVersion">) => createDocumentAssetManifest(options.scopeForDocument(record.documentId),
    options.enumerateReferences(record.serializedContent, { typeId: record.typeId, schemaVersion: record.typeSchemaVersion }));
  const release = async (record: DocumentRecoveryRecord | null) => {
    const root = (record as AssetBearingDocumentRecoveryRecord | null)?.assetRetentionRoot;
    if (root) {
      try { await options.store.release(root); }
      catch (error) { try { options.observeError?.(error); } catch { /* provider outcome remains authoritative */ } }
    }
  };
  return Object.freeze({
    async write(record: Omit<DocumentRecoveryRecord, "recoveryVersion">, expectedRecoveryVersion: number | null, signal?: AbortSignal) {
      const captured = immutableDocumentValue(record, record.typeId);
      const manifest = manifestFor(captured);
      const previous = await options.recovery.read(record.recoveryId, signal);
      const root: DocumentAssetRetentionRoot | null = manifest.assets.length ? { scope: manifest.scope, kind: "recovery", id: `recovery:${options.randomUUID()}` } : null;
      if (root) await options.store.retain(root, manifest.assets, signal);
      let started = false;
      try {
        started = true;
        const written = await options.recovery.write({ ...captured, assetManifest: manifest, assetRetentionRoot: root } as Omit<AssetBearingDocumentRecoveryRecord, "recoveryVersion">, expectedRecoveryVersion, signal);
        // Release only the exact envelope replaced by the successful conditional write.
        await release(previous);
        return written;
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (root && (!started || code === "document-recovery-version-conflict")) await release({ ...captured, recoveryVersion: 0, assetRetentionRoot: root } as AssetBearingDocumentRecoveryRecord);
        throw error;
      }
    },
    async read(recoveryId: string, signal?: AbortSignal) {
      const record = await options.recovery.read(recoveryId, signal);
      if (!record) return null;
      const expected = manifestFor(record), saved = (record as AssetBearingDocumentRecoveryRecord).assetManifest;
      if (expected.assets.length && !saved) throw new DocumentAssetError("asset-missing", "The recovery record has no required asset manifest.");
      if (saved && encodeDocumentAssetManifest(saved) !== encodeDocumentAssetManifest(expected)) throw new DocumentAssetError("asset-corrupt", "The recovery manifest does not match native references.");
      await verifyDocumentAssetManifest(options.store, saved ?? expected, signal);
      return record;
    },
    async remove(recoveryId: string, expectedRecoveryVersion: number, signal?: AbortSignal) {
      const previous = await options.recovery.read(recoveryId, signal);
      await options.recovery.remove(recoveryId, expectedRecoveryVersion, signal);
      await release(previous);
    },
    ...(options.recovery.dispose ? { dispose: () => options.recovery.dispose!() } : {}),
  });
}
