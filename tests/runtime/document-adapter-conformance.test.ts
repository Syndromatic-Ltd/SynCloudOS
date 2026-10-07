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

import { describe, expect, it } from "vitest";
import {
  DocumentStoreDocumentAdapter,
  InMemoryDocumentAdapter,
} from "../../src/SynCloudOS/Documents";
import { runDocumentAdapterConformance } from "../../src/SynCloudOS/Documents/Adapters/runDocumentAdapterConformance";
import { createInMemoryDocumentStore } from "../../src/SynCloudOS/DocumentStore";
import { createTestRuntimeEnvironment } from "./helpers";

const applicationDocumentStoreKind = {
  kind: "application.document",
  version: 1,
  displayName: "Application Document",
  permissions: {
    getDraft: { public: true },
    saveDraft: { public: true },
    listDraftVersions: { public: true },
    readDraftVersion: { public: true },
    deleteDraft: { public: true },
    listDrafts: { public: true },
  },
} as const;

describe("document adapter conformance", () => {
  runDocumentAdapterConformance(
    "memory",
    () => new InMemoryDocumentAdapter(createTestRuntimeEnvironment()),
  );
  runDocumentAdapterConformance(
    "document-store",
    () => new DocumentStoreDocumentAdapter(
      createInMemoryDocumentStore({ kinds: [applicationDocumentStoreKind] }),
    ),
    { location: { kind: "document-store", documentId: "conformance-note" } },
  );

  it("scopes document-store adapters to one host-owned document namespace", async () => {
    const store = createInMemoryDocumentStore({ kinds: [applicationDocumentStoreKind] });
    const adapter = new DocumentStoreDocumentAdapter(store, {
      id: "journal-document-store",
      documentIdPrefix: "framework:journal:",
    });

    expect(adapter.id).toBe("journal-document-store");
    expect(adapter.supports({ kind: "document-store", documentId: "framework:journal:draft-1" })).toBe(true);
    expect(adapter.supports({ kind: "document-store", documentId: "framework:syncal:calendar" })).toBe(false);
    await expect(adapter.read({
      kind: "document-store",
      documentId: "framework:syncal:calendar",
    })).rejects.toThrow(/does not support|namespace/iu);
  });

  it("recovers an exact document-store write by idempotency key without creating another version", async () => {
    const store = createInMemoryDocumentStore({ kinds: [applicationDocumentStoreKind] });
    const adapter = new DocumentStoreDocumentAdapter(store, {
      id: "journal-document-store",
      documentIdPrefix: "framework:journal:",
    });
    const request = {
      location: { kind: "document-store" as const, documentId: "framework:journal:draft-1" },
      typeId: "com.syndromatic.journal.document",
      schemaVersion: 1,
      content: { title: "Recovered" },
      expectedVersion: null,
      idempotencyKey: "journal-write:1",
      metadata: { displayName: "Recovered" },
    };

    const written = await adapter.write(request);
    expect(await adapter.recoverWriteByIdempotencyKey(request)).toEqual(written);
    expect(await adapter.listVersions(request.location)).toHaveLength(1);

    await expect(adapter.recoverWriteByIdempotencyKey({
      ...request,
      content: { title: "Different" },
    })).rejects.toBeTruthy();
    expect(await adapter.listVersions(request.location)).toHaveLength(1);
  });
});
