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

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SynCloudOSDocumentStoreAccessError,
  SynCloudOSDocumentStoreIndexError,
  SynCloudOSDocumentStorePayloadError,
  SynCloudOSDocumentStoreUnsupportedSchemaError,
  clearPersistenceDocumentStoreSnapshot,
  createInMemoryDocumentStore,
  createPersistenceDocumentStore
} from "../../src/SynCloudOS/DocumentStore";
import type { SynCloudOSDocumentKindMetadata } from "../../src/SynCloudOS/DocumentStore";
import type { SynCloudOSPolicyDecision, SynCloudOSPolicyRequest, SynCloudOSPolicySubject } from "../../src/SynCloudOS/PolicyKit/policyTypes";
import { createPersistence } from "../../src/SynCloudOS/Persistence/Persistence";
import { defineSyncUndoAction } from "../../src/SynCloudOS/Undo";
import { createTestRuntime } from "./helpers";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function persistedApplicationDocument(id: string) {
  return {
    id,
    applicationId: "journal-publisher",
    ownership: { kind: "application" as const, applicationId: "journal-publisher" },
    kind: "journal.post", version: 1, publishState: "draft" as const,
    createdAt: "2026-05-31T10:00:00.000Z", updatedAt: "2026-05-31T10:00:00.000Z",
  };
}

const policyAudit: SynCloudOSPolicyDecision[] = [];

function authorise(request: SynCloudOSPolicyRequest): SynCloudOSPolicyDecision {
  const capabilities = request.subject?.capabilities ?? [];
  const requiredCapabilities = request.requiredCapabilities ?? [];
  const requiredRoles = request.requiredRoles ?? [];
  const matchedCapabilities = requiredCapabilities.filter((capability) => capabilities.includes("*") || capabilities.includes(capability));
  const missingCapabilities = requiredCapabilities.filter((capability) => !matchedCapabilities.includes(capability));
  const matchedRoles = requiredRoles.filter((role) => request.subject?.role === role);
  const missingRoles = requiredRoles.filter((role) => !matchedRoles.includes(role));
  const allowed = missingCapabilities.length === 0 && missingRoles.length === 0;
  const decision = {
    id: `test-policy-${policyAudit.length + 1}`,
    action: request.action,
    decision: allowed ? "allow" : "deny",
    allowed,
    reason: allowed ? "requirements-met" : "requirements-missing",
    mode: "standard",
    subjectRole: request.subject?.role ?? "public",
    at: Date.now(),
    origin: request.origin,
    source: request.source,
    sessionAuthorised: request.subject?.isAuthenticated ?? false,
    requiredCapabilities,
    requiredRoles,
    requiredAccessClasses: [],
    matchedCapabilities,
    missingCapabilities,
    matchedRoles,
    missingRoles,
    matchedAccessClasses: [],
    missingAccessClasses: [],
  } as SynCloudOSPolicyDecision;
  policyAudit.push(decision);
  return decision;
}

function createSubject(capabilities: string[], role: SynCloudOSPolicySubject["role"] = "employee"): SynCloudOSPolicySubject {
  return {
    user: {
      id: `subject.${role}`,
      displayName: role,
      role,
      isAuthenticated: role !== "public",
      isAnonymous: role === "public"
    },
    role,
    capabilities,
    isAuthenticated: role !== "public"
  };
}

const journalKind: SynCloudOSDocumentKindMetadata = {
  kind: "journal.post",
  version: 1,
  displayName: "Journal Post",
  indexes: [
    { name: "journal.slug", fields: ["kind", "slug"], unique: true },
    { name: "journal.published", fields: ["kind", "publishState", "publishedAt"] }
  ],
  permissions: {
    listDrafts: { requiredCapabilities: ["journal.drafts.read"] },
    getDraft: { requiredCapabilities: ["journal.drafts.read"] },
    saveDraft: { requiredCapabilities: ["journal.draft.write"] },
    createRevision: { requiredCapabilities: ["journal.revision.create"] },
    publish: { requiredCapabilities: ["journal.publish"] },
    unpublish: { requiredCapabilities: ["journal.unpublish"] },
    attachMedia: { requiredCapabilities: ["journal.media.write"] }
  }
};

const editorSubject = createSubject([
  "documentStore.drafts.read",
  "documentStore.draft.write",
  "documentStore.revision.create",
  "documentStore.publish",
  "documentStore.unpublish",
  "documentStore.media.write",
  "journal.drafts.read",
  "journal.draft.write",
  "journal.revision.create",
  "journal.publish",
  "journal.unpublish",
  "journal.media.write"
]);

describe("SynCloudOS DocumentStore in-memory adapter", () => {
  beforeEach(() => {
    policyAudit.length = 0;
  });

  it("gates draft writes through PolicyKit capabilities", async () => {
    const store = createInMemoryDocumentStore({ kinds: [journalKind], authorise });
    const publicSubject = createSubject(["app.open.public"], "public");

    await expect(
      store.saveDraft(
        { kind: "journal.post", id: "draft-denied", title: "Denied", slug: "denied", body: "Nope" },
        { subject: publicSubject, origin: "test", source: "document-store.test" }
      )
    ).rejects.toBeInstanceOf(SynCloudOSDocumentStoreAccessError);

    const draft = await store.saveDraft(
      { kind: "journal.post", id: "draft-allowed", title: "Allowed", slug: "allowed", body: "Draft body" },
      { subject: editorSubject, origin: "test", source: "document-store.test", now: "2026-05-31T10:00:00.000Z" }
    );

    expect(draft).toMatchObject({
      id: "draft-allowed",
      publishState: "draft",
      ownerId: "subject.employee",
      lastEditorId: "subject.employee"
    });
    expect(policyAudit.at(-1)).toMatchObject({
      action: "documentStore.saveDraft",
      allowed: true,
      matchedCapabilities: expect.arrayContaining(["documentStore.draft.write", "journal.draft.write"])
    });
  });

  it("publishes, resolves, revises, attaches media, and unpublishes documents", async () => {
    const store = createInMemoryDocumentStore({ kinds: [journalKind], authorise });
    const context = { subject: editorSubject, origin: "test", source: "document-store.test", now: "2026-05-31T10:00:00.000Z" };
    const draft = await store.saveDraft(
      {
        kind: "journal.post",
        id: "webspring-4",
        title: "Webspring 4",
        slug: "webspring-4",
        body: "Webspring 4 enters first implementation.",
        tags: ["webspring"]
      },
      context
    );
    const drafts = await store.listDrafts({ kind: "journal.post" }, context);
    const revision = await store.createRevision(draft.id, { label: "Before publish" }, context);
    const withMedia = await store.attachMedia(
      draft.id,
      { assetId: "hero-1", usage: "hero", url: "/test-assets/journal/hero.png", altText: "Journal hero" },
      context
    );
    const published = await store.publish(
      draft.id,
      { canonicalUrl: "https://syndromatic.com/journal/webspring-4", publishedAt: "2026-05-31T10:05:00.000Z" },
      context
    );

    expect(drafts.map((item) => item.id)).toEqual(["webspring-4"]);
    expect(revision).toMatchObject({ documentId: "webspring-4", parentRevisionId: undefined, label: "Before publish" });
    expect(withMedia.media?.[0]).toMatchObject({ assetId: "hero-1", usage: "hero" });
    expect(published).toMatchObject({ publishState: "published", publishedAt: "2026-05-31T10:05:00.000Z" });
    await expect(store.readPublished("webspring-4")).resolves.toMatchObject({ id: "webspring-4" });
    await expect(store.resolveSlug("webspring-4", { kind: "journal.post" })).resolves.toMatchObject({ id: "webspring-4" });
    await expect(store.listPublished({ kind: "journal.post", tags: ["webspring"] })).resolves.toHaveLength(1);

    const unpublished = await store.unpublish(draft.id, { state: "archived" }, context);
    expect(unpublished).toMatchObject({ publishState: "archived", unpublishedAt: "2026-05-31T10:00:00.000Z" });
    await expect(store.listPublished({ kind: "journal.post" })).resolves.toHaveLength(0);
    await expect(store.listDrafts({ kind: "journal.post", includeArchived: true }, context)).resolves.toHaveLength(1);
  });

  it("keeps kind migrations behind the DocumentStore boundary", async () => {
    const store = createInMemoryDocumentStore({
      authorise,
      kinds: [
        {
          ...journalKind,
          version: 2,
          migrations: [
            {
              fromVersion: 1,
              toVersion: 2,
              migrate(document) {
                return {
                  ...document,
                  metadata: {
                    ...(document.metadata ?? {}),
                    migratedFromVersion: 1
                  }
                };
              }
            }
          ]
        }
      ]
    });

    const migrated = await store.saveDraft(
      { kind: "journal.post", id: "migration-draft", version: 1, title: "Migration", slug: "migration", body: "Draft" },
      { subject: editorSubject, origin: "test", source: "document-store.test" }
    );

    expect(migrated).toMatchObject({
      version: 2,
      metadata: { migratedFromVersion: 1 }
    });
  });

  it("enforces declared unique indexes before persisting documents", async () => {
    const store = createInMemoryDocumentStore({ kinds: [journalKind], authorise });
    const context = { subject: editorSubject, origin: "test", source: "document-store.test" };

    await store.saveDraft({ kind: "journal.post", id: "first", title: "First", slug: "shared", body: "Draft" }, context);

    await expect(
      store.saveDraft({ kind: "journal.post", id: "second", title: "Second", slug: "shared", body: "Draft" }, context)
    ).rejects.toBeInstanceOf(SynCloudOSDocumentStoreIndexError);
  });

  it("hydrates drafts, revisions, and migrations through the Persistence adapter", async () => {
    const preferenceKey = "document-store.test.persistence";
    const persistence = createPersistence({
      runtimeId: "runtime:document-store-test" as never,
      storage: createMemoryStorage(),
      namespace: "SynCloudOS4:document-store-test",
    });
    clearPersistenceDocumentStoreSnapshot(preferenceKey, persistence);

    const firstStore = createPersistenceDocumentStore({ preferenceKey, kinds: [journalKind], authorise, persistence });
    const context = { subject: editorSubject, origin: "test", source: "document-store.test", now: "2026-05-31T10:00:00.000Z" };

    await firstStore.saveDraft(
      { kind: "journal.post", id: "persistent-draft", version: 1, title: "Persistent", slug: "persistent", body: "Draft" },
      context
    );
    await firstStore.createRevision("persistent-draft", { id: "persistent-revision", label: "Persisted" }, context);

    const migratedKind: SynCloudOSDocumentKindMetadata = {
      ...journalKind,
      version: 2,
      migrations: [
        {
          fromVersion: 1,
          toVersion: 2,
          migrate(document) {
            return {
              ...document,
              metadata: {
                ...(document.metadata ?? {}),
                persistenceMigrated: true
              }
            };
          }
        }
      ]
    };
    const secondStore = createPersistenceDocumentStore({ preferenceKey, kinds: [migratedKind], authorise, persistence });

    await expect(secondStore.getDraft("persistent-draft", context)).resolves.toMatchObject({
      id: "persistent-draft",
      version: 2,
      metadata: { persistenceMigrated: true },
      revisionId: "persistent-revision"
    });
    expect(secondStore.exportSnapshot().revisions.map((revision) => revision.id)).toContain("persistent-revision");
  });
  it("accepts only explicit V2 ownership and preserves valid snapshots on restore", () => {
    const storage = createMemoryStorage();
    const persistence = createPersistence({
      runtimeId: "runtime:document-store-strict" as never,
      storage,
      namespace: "SynCloudOS4:document-store-strict",
    });
    const document = persistedApplicationDocument("strict-document");
    const ownership = document.ownership;
    const snapshot = {
      schemaVersion: 2 as const,
      savedAt: "2026-05-31T10:00:00.000Z",
      kinds: [journalKind],
      documents: [document],
      revisions: [{
        id: "strict-revision",
        documentId: document.id,
        kind: document.kind,
        version: document.version,
        ownership,
        createdAt: document.updatedAt,
        snapshot: document,
      }],
      draftVersions: [{ documentId: document.id, documents: [document] }],
      idempotentDraftWrites: [{
        key: "strict-save",
        fingerprint: "strict-fingerprint",
        operation: "saveDraft" as const,
        document,
      }],
    };
    persistence.setPreference("documentStore:v1", snapshot);
    const restored = createPersistenceDocumentStore({ persistence, kinds: [journalKind] });

    expect(JSON.parse(JSON.stringify(restored.exportSnapshot()))).toEqual(JSON.parse(JSON.stringify(snapshot)));
    const restoredAgain = createPersistenceDocumentStore({ persistence, kinds: [journalKind] });
    expect(JSON.parse(JSON.stringify(restoredAgain.exportSnapshot()))).toEqual(JSON.parse(JSON.stringify(snapshot)));
  });

  it.each([
    ["schema V1", { schemaVersion: 1 }],
    ["unsupported schema", { schemaVersion: 3 }],
    ["ownerless record", { schemaVersion: 2, documents: [{ id: "ownerless", kind: "journal.post", version: 1, publishState: "draft", createdAt: "2026-05-31T10:00:00.000Z", updatedAt: "2026-05-31T10:00:00.000Z" }] }],
    ["ambiguous application owner", { schemaVersion: 2, documents: [{ ...persistedApplicationDocument("ambiguous-owner"), applicationId: "foreign-app" }] }],
    ["revision ownership conflict", {
      schemaVersion: 2,
      documents: [persistedApplicationDocument("revision-conflict")],
      revisions: [{
        id: "revision-conflict-record", documentId: "revision-conflict", kind: "journal.post", version: 1,
        ownership: { kind: "system" }, createdAt: "2026-05-31T10:00:00.000Z",
        snapshot: persistedApplicationDocument("revision-conflict"),
      }],
    }],
  ])("rejects %s before mutating persisted bytes", (label, patch) => {
    const storage = createMemoryStorage();
    const persistence = createPersistence({
      runtimeId: `runtime:document-store-invalid:${label}` as never,
      storage,
      namespace: `SynCloudOS4:document-store-invalid:${label}`,
    });
    const value = {
      schemaVersion: 2 as const,
      savedAt: "2026-05-31T10:00:00.000Z",
      kinds: [journalKind],
      documents: [],
      revisions: [],
      draftVersions: [],
      idempotentDraftWrites: [],
      ...patch,
    };
    persistence.setPreference("documentStore:v1", value);
    const before = storage.getItem("SynCloudOS4:document-store-invalid:" + label + ":documentStore:v1");

    const create = () => createPersistenceDocumentStore({ persistence, kinds: [journalKind] });
    if (label === "unsupported schema") expect(create).toThrow(SynCloudOSDocumentStoreUnsupportedSchemaError);
    else expect(create).toThrow(SynCloudOSDocumentStorePayloadError);
    expect(storage.getItem("SynCloudOS4:document-store-invalid:" + label + ":documentStore:v1")).toBe(before);
  });


  it("marks a document undo owner clean only after save and publish succeed", async () => {
    const markClean = vi.fn();
    const undo = { get: vi.fn(() => ({ markClean })) };
    const store = createPersistenceDocumentStore({
      kinds: [journalKind],
      authorise,
      storage: createMemoryStorage(),
      undo,
    });
    const context = { subject: editorSubject, origin: "test", source: "document-store.test" };

    await store.saveDraft({ kind: "journal.post", id: "clean-draft", title: "Clean", slug: "clean", body: "Draft" }, context);
    await store.publish("clean-draft", undefined, context);

    expect(undo.get).toHaveBeenNthCalledWith(1, { kind: "document", id: "clean-draft" });
    expect(undo.get).toHaveBeenNthCalledWith(2, { kind: "document", id: "clean-draft" });
    expect(markClean).toHaveBeenCalledTimes(2);
  });

  it("does not mark a document clean when persistence rejects an otherwise valid semantic save", async () => {
    const markClean = vi.fn();
    const undo = { get: vi.fn(() => ({ markClean })) };
    const storage = createMemoryStorage();
    storage.setItem = () => { throw new Error("disk-failed"); };
    const store = createPersistenceDocumentStore({
      kinds: [journalKind],
      authorise,
      storage,
      undo,
    });
    const context = { subject: editorSubject, origin: "test", source: "document-store.test" };

    await expect(store.saveDraft({ kind: "journal.post", id: "failed-clean", title: "Failed", slug: "failed-clean", body: "Draft" }, context))
      .resolves.toMatchObject({ id: "failed-clean" });
    expect(undo.get).not.toHaveBeenCalled();
    expect(markClean).not.toHaveBeenCalled();
  });

  it("exposes the complete persistence-backed document capability from each runtime", async () => {
    const runtime = createTestRuntime({ id: "runtime-document-service" });
    runtime.documentStore.registerKind({
      ...journalKind,
      kind: "runtime.document",
      permissions: {
        listDrafts: { public: true },
        getDraft: { public: true },
        saveDraft: { public: true },
        createRevision: { public: true },
        publish: { public: true },
        unpublish: { public: true },
        attachMedia: { public: true },
      },
    });

    const saved = await runtime.documentStore.saveDraft({
      kind: "runtime.document",
      id: "runtime-document",
      title: "Runtime document",
      slug: "runtime-document",
      body: "Runtime-owned document service",
    });
    const revision = await runtime.documentStore.createRevision(saved.id, { label: "Initial revision" });
    await runtime.documentStore.attachMedia(saved.id, { assetId: "runtime-hero", usage: "hero", url: "/hero.png", altText: "Hero" });
    const published = await runtime.documentStore.publish(saved.id);

    expect(runtime.documentStore.runtimeId).toBe(runtime.runtimeId);
    expect(await runtime.documentStore.getDraft(saved.id)).toBeNull();
    expect(revision).toMatchObject({ documentId: saved.id });
    expect(await runtime.documentStore.readPublished(saved.id)).toMatchObject({ id: saved.id, publishState: "published" });
    expect(published.media).toEqual(expect.arrayContaining([expect.objectContaining({ assetId: "runtime-hero" })]));
  });

  it("marks an existing runtime document undo entry clean after its durable save", async () => {
    const runtime = createTestRuntime({ id: "runtime-document-clean-commit" });
    const documentId = "runtime-clean-document";
    const manager = runtime.undo.create({ kind: "document", id: documentId });
    manager.register(defineSyncUndoAction({ name: "Typing", asyncPolicy: "forbid", undo: () => {}, redo: () => {} }));
    runtime.documentStore.registerKind({
      ...journalKind,
      kind: "runtime.clean-document",
      permissions: { saveDraft: { public: true } },
    });

    await runtime.documentStore.saveDraft({
      id: documentId,
      kind: "runtime.clean-document",
      title: "Saved runtime document",
      body: "The document became durable.",
    });

    expect(manager.isDirty).toBe(false);
  });

  it("disposes the canonical document service with its runtime identity", async () => {
    const runtime = createTestRuntime({ id: "runtime-document-disposal" });
    const documents = runtime.documentStore;
    await runtime.dispose("document-service-test");
    expect(() => documents.listKinds()).toThrow("DocumentStore is disposed.");
  });
});
