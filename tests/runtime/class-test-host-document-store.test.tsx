// @vitest-environment jsdom
import * as React from "react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import type { DocumentType } from "../../src/SynCloudOS/Documents/documentTypes";
import type { AppDocumentSnapshot, AppWorkspaceDocumentsClient } from "../../src/SynCloudOS/AppSDK/appClientTypes";
import { createAppSCOS } from "../../src/SynCloudOS/AppSDK/scos/scosFacade";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";
import type {
  SynWareTestApplicationDocumentsConfiguration,
  SynWareTestDocumentInstallContext,
  SynWareTestHost,
} from "../../src/SynCloudOS/AppSDK/testing/testHostTypes";

const bundleIdentifier = "com.example.class-document-store";
const typeId = "com.example.class-document-store.note";
const documentId = "class-note";
const storedDocumentId = "class-documents:note";
const trustedKind = { kind: "application.document", version: 1, displayName: "Application document" };
const hosts: SynWareTestHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0).reverse()) await host.dispose(); });

interface NoteModel {
  readonly text: string;
}

function noteType(owner = bundleIdentifier): DocumentType<NoteModel> {
  return {
    id: typeId,
    displayName: "Class note",
    schemaVersion: 1,
    extensions: ["classnote"],
    mimeTypes: ["application/x-class-note+json"],
    creatingApplicationId: owner,
    openingApplicationIds: [owner],
    capabilities: { versions: true, conflicts: true },
    autosave: "disabled",
    create: () => ({ text: "Untitled" }),
    read: value => ({ ...value }),
    write: value => ({ ...value }),
    validate: (value): value is NoteModel => Boolean(value) && typeof value === "object" && typeof (value as Record<string, unknown>).text === "string",
  };
}

async function seedNote(context: SynWareTestDocumentInstallContext, text: string) {
  context.documents.registerDocumentStoreAdapter({ id: "class-document-store", documentIdPrefix: "class-documents:" });
  await context.seed.saveDraft({
    id: storedDocumentId,
    kind: trustedKind.kind,
    version: 1,
    ownership: { kind: "system" },
    title: "Class note",
    body: { typeId, schemaVersion: 1, content: { text }, metadata: { displayName: "Class note" } },
  });
}

function provisionNote(owner = bundleIdentifier, text = "Seeded before launch"): SynWareTestApplicationDocumentsConfiguration {
  return {
    initialTypes: [noteType(owner)],
    trustedDocumentKinds: [trustedKind],
    install: context => seedNote(context, text),
  };
}

interface ClassFixtureOptions {
  readonly bundleIdentifier?: string;
  readonly declaredTypeId?: string;
  readonly openOnLaunch?: boolean;
  readonly permissions?: readonly string[];
}

function createClassFixture(configuration = provisionNote(), options: ClassFixtureOptions = {}) {
  const owner = options.bundleIdentifier ?? bundleIdentifier;
  const SCOS = createAppSCOS(owner);
  let provision: SynWareTestDocumentInstallContext | null = null;
  class MainWindow extends NSEWindowController {
    static override view = () => <p>{SCOS.documents.workspaceDocuments.getDocument<NoteModel>(documentId)?.model.text ?? "No open note"}</p>;
  }
  class Application extends NSEApplication {
    static override mainWindow = MainWindow;
    documents!: AppWorkspaceDocumentsClient;
    opened: AppDocumentSnapshot<NoteModel> | null = null;
    override async applicationDidFinishLaunching() {
      this.documents = SCOS.documents.workspaceDocuments;
      if (options.openOnLaunch !== false) {
        this.opened = await this.documents.openDocument<NoteModel>({
          documentId,
          typeId,
          location: { kind: "document-store", documentId: storedDocumentId },
        });
      }
    }
  }
  const host = createSynWareTestHost({
    application: Application,
    manifest: {
      schemaVersion: 1,
      bundleIdentifier: owner,
      displayName: "Class document store",
      version: "1.0.0",
      documentTypes: [{ id: options.declaredTypeId ?? typeId, displayName: "Class note" }],
      permissions: options.permissions ?? ["documentStore.drafts.read", "documentStore.draft.write"],
    },
    applicationDocuments: {
      ...configuration,
      install: context => {
        provision = context;
        return configuration.install?.(context);
      },
    },
    now: "2026-01-01T00:00:00Z",
    document,
  });
  hosts.push(host);
  host.adapters.storage.local.allow();
  return {
    host,
    Application,
    get application(): Application {
      if (!(host.application instanceof Application)) throw new Error("The class application has not launched.");
      return host.application;
    },
    get provision(): SynWareTestDocumentInstallContext {
      if (!provision) throw new Error("The document installation has not started.");
      return provision;
    },
  };
}

it("opens a seeded real DocumentStore envelope during class launch and saves a transaction to the same store", async () => {
  const fixture = createClassFixture();
  const view = await fixture.host.render();
  expect(fixture.host.application).toBeInstanceOf(fixture.Application);
  expect(view.container.textContent).toContain("Seeded before launch");
  const opened = fixture.application.opened!;
  expect(opened).toMatchObject({ id: documentId, applicationId: bundleIdentifier, typeId, state: "clean", model: { text: "Seeded before launch" } });
  const before = await fixture.provision.seed.getDraft(storedDocumentId);
  expect(before).toMatchObject({ kind: "application.document", storageVersion: { sequence: 1 } });
  expect(opened.currentVersion).toEqual(before!.storageVersion);

  fixture.host.clock.advance(1_000);
  expect(fixture.application.documents.transactDocument<NoteModel>(documentId, model => ({ ...model, text: "Saved by the class application" }), {
    expectedRevision: opened.dirtyRevision,
    actionName: "Edit class note",
  })).toMatchObject({ status: "committed", afterRevision: opened.dirtyRevision + 1 });
  expect(fixture.application.documents.getDocument<NoteModel>(documentId)).toMatchObject({ state: "dirty", model: { text: "Saved by the class application" } });
  await fixture.application.documents.saveDocument(documentId, { reason: "explicit" });

  const saved = await fixture.provision.seed.getDraft(storedDocumentId);
  expect(saved).toMatchObject({
    id: storedDocumentId,
    kind: "application.document",
    body: { typeId, schemaVersion: 1, content: { text: "Saved by the class application" }, metadata: {} },
    storageVersion: { sequence: 2, savedAt: "2026-01-01T00:00:01.000Z" },
  });
  expect(saved!.storageVersion!.etag).not.toBe(before!.storageVersion!.etag);
  expect(fixture.application.documents.getDocument<NoteModel>(documentId)).toMatchObject({ state: "clean", currentVersion: saved!.storageVersion, model: { text: "Saved by the class application" } });
  expect(await fixture.provision.seed.listDraftVersions(storedDocumentId)).toHaveLength(2);
});

it("commits exactly one concurrent conditional write and reports the other stale version", async () => {
  const fixture = createClassFixture();
  await fixture.host.render();
  const before = await fixture.provision.seed.getDraft(storedDocumentId);
  const results = await Promise.allSettled(["First writer", "Second writer"].map(text => fixture.provision.seed.saveDraft({
    id: storedDocumentId,
    kind: "application.document",
    version: 1,
    ownership: { kind: "system" },
    title: "Concurrent note",
    body: { typeId, schemaVersion: 1, content: { text }, metadata: { displayName: "Concurrent note" } },
  }, { ifMatch: before!.storageVersion!.etag })));
  const committed = results.filter(result => result.status === "fulfilled");
  const rejected = results.filter(result => result.status === "rejected");
  expect(committed, JSON.stringify(results)).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason).toMatchObject({ code: "document-store-version-conflict" });
  const saved = await fixture.provision.seed.getDraft(storedDocumentId);
  expect(saved!.body).toEqual(committed[0].value.body);
  expect(saved!.storageVersion!.sequence).toBe(before!.storageVersion!.sequence + 1);
  expect(await fixture.provision.seed.listDraftVersions(storedDocumentId)).toHaveLength(2);
});

it("denies retained host seed writes outside the declared owner and kind without altering the admitted record", async () => {
  const fixture = createClassFixture();
  await fixture.host.render();
  const before = await fixture.provision.seed.getDraft(storedDocumentId);
  await expect(fixture.provision.seed.saveDraft({
    id: storedDocumentId,
    kind: "application.document",
    applicationId: "com.example.foreign-document-owner",
    body: { text: "Foreign replacement" },
  })).rejects.toMatchObject({ name: "SecurityError" });
  await expect(fixture.provision.seed.saveDraft({ id: "foreign-owner", kind: "application.document", applicationId: "com.example.foreign-document-owner", body: {} })).rejects.toMatchObject({ name: "SecurityError" });
  await expect(fixture.provision.seed.saveDraft({ id: "foreign-kind", kind: "tests.undeclared-kind", applicationId: bundleIdentifier, body: {} })).rejects.toMatchObject({ name: "SecurityError" });
  expect(await fixture.provision.seed.getDraft(storedDocumentId)).toEqual(before);
  await expect(fixture.provision.seed.getDraft("foreign-owner")).resolves.toBeNull();
  await expect(fixture.provision.seed.getDraft("foreign-kind")).resolves.toBeNull();
});

it("requires explicit trusted kind metadata even when the application's document codec is provisioned", async () => {
  const fixture = createClassFixture({
    initialTypes: [noteType()],
    install: async context => {
      await expect(context.seed.saveDraft({ id: storedDocumentId, kind: "application.document", applicationId: bundleIdentifier, body: {} })).rejects.toMatchObject({ name: "SecurityError" });
    },
  }, { openOnLaunch: false });
  await fixture.host.render();
  expect(fixture.application.documents.hasType(typeId)).toBe(true);
  await expect(fixture.provision.seed.getDraft(storedDocumentId)).resolves.toBeNull();
});

it("does not grant application document-store capabilities through trusted host seeding", async () => {
  const fixture = createClassFixture(provisionNote(), { permissions: [] });
  await expect(fixture.host.render()).rejects.toThrow(/getDraft denied.*capabilities/iu);
  expect(await fixture.provision.seed.getDraft(storedDocumentId)).toMatchObject({
    body: { content: { text: "Seeded before launch" } },
    storageVersion: { sequence: 1 },
  });
});

it("does not turn a manifest-only document declaration into a trusted codec", async () => {
  const fixture = createClassFixture({ trustedDocumentKinds: [trustedKind], install: context => seedNote(context, "No codec") }, { openOnLaunch: false });
  await fixture.host.render();
  expect(fixture.application.documents.hasType(typeId)).toBe(false);
  await expect(fixture.application.documents.openDocument({ documentId, typeId, location: { kind: "document-store", documentId: storedDocumentId } })).rejects.toMatchObject({ name: "SecurityError" });
  await expect(fixture.application.documents.newDocument({ typeId })).rejects.toMatchObject({ name: "SecurityError" });
  expect(fixture.host.documents.records()).toEqual([]);
  expect(await fixture.provision.seed.getDraft(storedDocumentId)).toMatchObject({ storageVersion: { sequence: 1 }, body: { content: { text: "No codec" } } });
});

it("does not admit a registered foreign-owner codec through an application manifest declaration", async () => {
  const foreignOwner = "com.example.foreign-codec-owner";
  const fixture = createClassFixture(provisionNote(foreignOwner, "Foreign codec"), { openOnLaunch: false });
  await fixture.host.render();
  expect(fixture.application.documents.hasType(typeId)).toBe(false);
  await expect(fixture.application.documents.openDocument({ documentId, typeId, location: { kind: "document-store", documentId: storedDocumentId } })).rejects.toMatchObject({ name: "SecurityError" });
  await expect(fixture.application.documents.newDocument({ typeId })).rejects.toMatchObject({ name: "SecurityError" });
  expect(fixture.host.documents.records()).toEqual([]);
  expect(await fixture.provision.seed.getDraft(storedDocumentId)).toMatchObject({ ownership: { kind: "system" }, storageVersion: { sequence: 1 }, body: { content: { text: "Foreign codec" } } });
});

it("isolates two deterministic class hosts using identical document and adapter identifiers", async () => {
  const firstOwner = "com.example.first-class-documents";
  const secondOwner = "com.example.second-class-documents";
  const first = createClassFixture(provisionNote(firstOwner, "First host"), { bundleIdentifier: firstOwner });
  const second = createClassFixture(provisionNote(secondOwner, "Second host"), { bundleIdentifier: secondOwner });
  await first.host.render();
  await second.host.render();
  expect(first.application.opened?.model).toEqual({ text: "First host" });
  expect(second.application.opened?.model).toEqual({ text: "Second host" });
  const secondBefore = await second.provision.seed.getDraft(storedDocumentId);
  first.host.clock.advance(5_000);
  expect(first.application.documents.transactDocument<NoteModel>(documentId, () => ({ text: "First host saved" }), {
    expectedRevision: first.application.opened!.dirtyRevision,
    actionName: "Edit first host",
  }).status).toBe("committed");
  await first.application.documents.saveDocument(documentId);
  expect(await first.provision.seed.getDraft(storedDocumentId)).toMatchObject({ body: { content: { text: "First host saved" } }, storageVersion: { sequence: 2, savedAt: "2026-01-01T00:00:05.000Z" } });
  expect(await second.provision.seed.getDraft(storedDocumentId)).toEqual(secondBefore);
  expect(second.application.documents.getDocument<NoteModel>(documentId)).toMatchObject({ state: "clean", model: { text: "Second host" } });
  expect(second.host.clock.now()).toBe(Date.parse("2026-01-01T00:00:00Z"));
  await first.host.dispose();
  expect(await second.provision.seed.getDraft(storedDocumentId)).toEqual(secondBefore);
});

it("revokes retained provisioning ports and runs returned installation cleanup exactly once on disposal", async () => {
  let cleanupCount = 0;
  const fixture = createClassFixture({
    ...provisionNote(),
    install: async context => {
      await seedNote(context, "Installed once");
      return () => { cleanupCount += 1; };
    },
  });
  await fixture.host.render();
  const provision = fixture.provision;
  const documents = fixture.application.documents;
  expect(provision.signal.aborted).toBe(false);
  await fixture.host.dispose();
  await fixture.host.dispose();
  expect(cleanupCount).toBe(1);
  expect(provision.signal.aborted).toBe(true);
  await expect(provision.seed.getDraft(storedDocumentId)).rejects.toMatchObject({ name: "AbortError" });
  await expect(provision.seed.saveDraft({ id: "after-disposal", kind: "application.document", body: {} })).rejects.toMatchObject({ name: "AbortError" });
  expect(() => provision.documents.registerDocumentStoreAdapter({ id: "after-disposal", documentIdPrefix: "after:" })).toThrow(expect.objectContaining({ name: "AbortError" }));
  expect(() => documents.getDocument(documentId)).toThrow();
});

it("revokes partially installed provision ports when installation rejects before class launch", async () => {
  const failure = new Error("Document installation failed");
  const fixture = createClassFixture({
    ...provisionNote(),
    install: async context => {
      await seedNote(context, "Partially installed");
      throw failure;
    },
  });
  await expect(fixture.host.render()).rejects.toThrow("Document installation failed");
  expect(fixture.host.application).toBeNull();
  expect(fixture.provision.signal.aborted).toBe(true);
  await expect(fixture.provision.seed.getDraft(storedDocumentId)).rejects.toMatchObject({ name: "AbortError" });
  expect(() => fixture.provision.documents.registerDocumentStoreAdapter({ id: "after-failure", documentIdPrefix: "after:" })).toThrow(expect.objectContaining({ name: "AbortError" }));
  await fixture.host.dispose();
});

function withinDisposalDeadline<T>(promise: Promise<T>): Promise<T> {
  let cancel!: () => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Pending document installation did not settle after revocation.")), 250);
    cancel = () => { clearTimeout(timer); };
  });
  return Promise.race([promise, deadline]).finally(() => { cancel(); });
}

it.each(["resolved", "rejected"] as const)("settles disposal during a pending timer-backed installer and observes late %s cleanup", async outcome => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let resume!: () => void;
  let cleaned!: () => void;
  const cleanupFinished = new Promise<void>(resolve => { cleaned = resolve; });
  let cleanupCount = 0;
  const fixture = createClassFixture({
    ...provisionNote(),
    install: async context => {
      await new Promise<void>(resolve => {
        resume = resolve;
        context.environment.setTimeout(resolve, 10);
        entered();
      });
      return async () => {
        cleanupCount += 1;
        cleaned();
        if (outcome === "rejected") throw new Error("Late cleanup rejected after disposal");
      };
    },
  }, { openOnLaunch: false });
  const rendering = fixture.host.render();
  const renderOutcome = rendering.then(() => null, error => error);
  await withinDisposalDeadline(started);
  const disposal = fixture.host.dispose();
  try {
    fixture.host.clock.advance(20);
    expect(fixture.provision.signal.aborted).toBe(true);
    await expect(fixture.provision.seed.getDraft(storedDocumentId)).rejects.toMatchObject({ name: "AbortError" });
    expect(() => fixture.provision.documents.registerDocumentStoreAdapter({ id: "revoked-pending", documentIdPrefix: "revoked:" })).toThrow(expect.objectContaining({ name: "AbortError" }));
    expect(await withinDisposalDeadline(disposal)).toMatchObject({ runtimeDisposed: true, remaining: [], leaked: [] });
    expect(await withinDisposalDeadline(renderOutcome)).toMatchObject({ name: "AbortError" });
    expect(fixture.host.application).toBeNull();
    expect(cleanupCount).toBe(0);
    resume();
    await withinDisposalDeadline(cleanupFinished);
    await new Promise<void>(resolve => { setTimeout(resolve, 0); });
    await fixture.host.dispose();
    expect(cleanupCount).toBe(1);
  } finally {
    resume();
    await renderOutcome;
    await disposal;
  }
});

it("observes a late installer rejection without keeping render or disposal pending", async () => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let rejectInstaller!: (error: Error) => void;
  const fixture = createClassFixture({
    ...provisionNote(),
    install: () => new Promise<void>((_resolve, reject) => {
      rejectInstaller = reject;
      entered();
    }),
  }, { openOnLaunch: false });
  const rendering = fixture.host.render();
  const renderOutcome = rendering.then(() => null, error => error);
  await withinDisposalDeadline(started);
  const disposal = fixture.host.dispose();
  const lateFailure = new Error("Installer rejected after its host was disposed");
  try {
    await withinDisposalDeadline(disposal);
    expect(await withinDisposalDeadline(renderOutcome)).toMatchObject({ name: "AbortError" });
    expect(fixture.provision.signal.aborted).toBe(true);
    rejectInstaller(lateFailure);
    await new Promise<void>(resolve => { setTimeout(resolve, 0); });
    await expect(fixture.provision.seed.getDraft(storedDocumentId)).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    rejectInstaller(lateFailure);
    await renderOutcome;
    await disposal;
  }
});
