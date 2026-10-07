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

import {
  InMemoryDocumentAdapter,
  InMemoryDocumentRecoveryStore,
  type DocumentController,
  type DocumentControllerDependencies,
  type DocumentLocation,
  type DocumentReadOptions,
  type DocumentRecord,
  type DocumentRecoveryStore,
  type DocumentRestorationSnapshot,
} from "../../src/SynCloudOS/Documents";
import type { SynCloudOSRuntimeEnvironment } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { createTestRuntime, createTestRuntimeEnvironment } from "../runtime/helpers";
import { noteType } from "./noteDocumentType";

export function createDocumentTestDependencies(options: {
  readonly id?: string;
  readonly environment?: SynCloudOSRuntimeEnvironment;
  readonly recovery?: DocumentRecoveryStore;
} = {}): DocumentControllerDependencies & {
  readonly environment: SynCloudOSRuntimeEnvironment;
  cleanup(): Promise<void>;
} {
  const environment = options.environment ?? createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ id: options.id, environment });
  return {
    runtimeId: runtime.runtimeId,
    operations: runtime.operations,
    commands: runtime.commands,
    undo: runtime.undo,
    recovery: options.recovery ?? new InMemoryDocumentRecoveryStore(),
    persistenceNamespace: "tests:documents",
    environment,
    cleanup: async () => { await runtime.dispose("test"); },
  };
}

class CountingMemoryDocumentAdapter extends InMemoryDocumentAdapter {
  readCount = 0;

  override read<TSerialized>(
    location: DocumentLocation,
    options: DocumentReadOptions = {},
  ): Promise<DocumentRecord<TSerialized> | null> {
    this.readCount += 1;
    return super.read<TSerialized>(location, options);
  }
}

export interface DocumentControllerPerformanceFixture {
  readonly controller: DocumentController;
  readonly snapshot: DocumentRestorationSnapshot;
  readonly adapter: CountingMemoryDocumentAdapter;
  cleanup(): Promise<void>;
}

export async function makeDocumentControllerFixture(options: {
  readonly documentCount: number;
}): Promise<DocumentControllerPerformanceFixture> {
  if (!Number.isSafeInteger(options.documentCount) || options.documentCount < 0) {
    throw new RangeError("Document fixture count must be a non-negative safe integer.");
  }
  const environment = createTestRuntimeEnvironment();
  const adapter = new CountingMemoryDocumentAdapter(environment);
  const runtime = createTestRuntime({
    id: `runtime:document-performance:${options.documentCount}`,
    environment,
    applicationDocuments: {
      recoveryStore: new InMemoryDocumentRecoveryStore(),
      initialAdapters: [adapter],
    },
  });
  runtime.documents.registerType(noteType);

  const documents: DocumentRestorationSnapshot["documents"] = [];
  for (let index = 0; index < options.documentCount; index += 1) {
    const documentId = `performance-note-${index.toString().padStart(3, "0")}`;
    const location = {
      kind: "memory",
      namespace: "performance:restore",
      key: documentId,
    } as const;
    const record = await adapter.write({
      location,
      typeId: noteType.id,
      schemaVersion: noteType.schemaVersion,
      content: { title: `Note ${index}`, body: `Body ${index}` },
      expectedVersion: null,
      idempotencyKey: `seed:${documentId}`,
    });
    documents.push({
      documentId,
      typeId: noteType.id,
      typeSchemaVersion: noteType.schemaVersion,
      location,
      baseVersion: record.version,
      recovery: { kind: "none" },
      windowAssociations: [],
    });
  }

  return {
    controller: runtime.documents,
    snapshot: {
      schemaVersion: 1,
      activeDocumentId: documents.at(-1)?.documentId ?? null,
      documents,
      recentLocations: [],
      capturedAt: new Date(environment.now()).toISOString(),
    },
    adapter,
    cleanup: async () => { await runtime.dispose("test"); },
  };
}
