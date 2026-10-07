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

import { DocumentRecoveryVersionConflictError } from "./DocumentErrors";
import type { DocumentLocation, DocumentVersion } from "./documentTypes";
import { throwIfDocumentAborted } from "./Adapters/InMemoryDocumentAdapter";
import { canonicalDocumentJson, immutableDocumentValue } from "./documentTypes";

export interface DocumentRecoveryRecord {
  readonly schemaVersion: 1;
  readonly recoveryId: string;
  readonly recoveryVersion: number;
  readonly documentId: string;
  readonly typeId: string;
  readonly typeSchemaVersion: number;
  readonly location: DocumentLocation | null;
  readonly baseVersion: DocumentVersion | null;
  readonly dirtyRevision: number;
  readonly serializedContent: unknown;
  readonly contentHash: string;
  readonly capturedAt: string;
}

export interface DocumentRecoveryStore {
  write(
    record: Omit<DocumentRecoveryRecord, "recoveryVersion">,
    expectedRecoveryVersion: number | null,
    signal?: AbortSignal,
  ): Promise<DocumentRecoveryRecord>;
  read(recoveryId: string, signal?: AbortSignal): Promise<DocumentRecoveryRecord | null>;
  remove(recoveryId: string, expectedRecoveryVersion: number, signal?: AbortSignal): Promise<void>;
  dispose?(): void | Promise<void>;
}

export function canonicalDocumentContentHash(value: unknown): string {
  const source = canonicalDocumentJson(value, "document.recovery");
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function freezeRecoveryRecord(record: DocumentRecoveryRecord): DocumentRecoveryRecord {
  return immutableDocumentValue(record, record.typeId);
}

export class InMemoryDocumentRecoveryStore implements DocumentRecoveryStore {
  readonly #records = new Map<string, DocumentRecoveryRecord>();

  async write(
    record: Omit<DocumentRecoveryRecord, "recoveryVersion">,
    expectedRecoveryVersion: number | null,
    signal?: AbortSignal,
  ): Promise<DocumentRecoveryRecord> {
    throwIfDocumentAborted(signal);
    const current = this.#records.get(record.recoveryId) ?? null;
    if ((current?.recoveryVersion ?? null) !== expectedRecoveryVersion) {
      throw new DocumentRecoveryVersionConflictError(
        record.recoveryId,
        expectedRecoveryVersion,
        current?.recoveryVersion ?? null,
      );
    }
    const next = freezeRecoveryRecord({
      ...structuredClone(record),
      recoveryVersion: (current?.recoveryVersion ?? 0) + 1,
    });
    this.#records.set(next.recoveryId, next);
    return freezeRecoveryRecord(next);
  }

  async read(recoveryId: string, signal?: AbortSignal): Promise<DocumentRecoveryRecord | null> {
    throwIfDocumentAborted(signal);
    const record = this.#records.get(recoveryId);
    return record ? freezeRecoveryRecord(record) : null;
  }

  async remove(recoveryId: string, expectedRecoveryVersion: number, signal?: AbortSignal): Promise<void> {
    throwIfDocumentAborted(signal);
    const current = this.#records.get(recoveryId) ?? null;
    if (current?.recoveryVersion !== expectedRecoveryVersion) {
      throw new DocumentRecoveryVersionConflictError(
        recoveryId,
        expectedRecoveryVersion,
        current?.recoveryVersion ?? null,
      );
    }
    this.#records.delete(recoveryId);
  }
}
