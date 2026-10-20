import { describe, expect, it } from "vitest";
import { normalizeBundleIdentifier } from "../../src/SynCloudOS/Identity/bundleIdentifier.mjs";
import { createInMemoryDocumentStore } from "../../src/SynCloudOS/DocumentStore/InMemoryDocumentStore";
import { createUndoManagerRegistry } from "../../src/SynCloudOS/Undo/UndoManagerRegistry";
import { createResponderGraph } from "../../src/SynCloudOS/Responders/ResponderGraph";
import { createTestRuntime } from "./helpers";
import { createPasteboardRegistry, getPasteboardRuntimeControl } from "../../src/SynCloudOS/Pasteboard/Pasteboard";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";
import { LUFXSearchableItem } from "../../src/FX/LuminaFX/LUFXSearchableItem";
import type { LUFXIndexBackendSnapshot } from "../../src/FX/LuminaFX/LUFXIndexBackend";
import { LUFX_TOKENIZER_VERSION } from "../../src/FX/LuminaFX/LUFXTokenizer";
import { LuminaIndexService, type LuminaIndexBackendFactory } from "../../src/SynCloudOS/LuminaFX/LuminaIndexService";
import { LuminaEligibilityRegistry, luminaSubjectFingerprint } from "../../src/SynCloudOS/LuminaFX/LuminaEligibility";
import { LUFXHostService } from "../../src/SynCloudOS/LuminaFX/LUFXHostService";
import type { SynCloudOSPolicySubject } from "../../src/SynCloudOS/PolicyKit/policyTypes";
import { createSettingsService } from "../../src/SynCloudOS/Settings/settingsService";

const identitySubject: SynCloudOSPolicySubject = { user: { id: "tester", displayName: "Tester" }, role: "user", capabilities: [], isAuthenticated: true };

function identityItem(id: string, revision: string) {
  return new LUFXSearchableItem({
    id,
    domain: "com.example.notes",
    contentType: "note",
    title: `Note ${id}`,
    visibility: "eligible-donation",
    revision,
    activation: { version: 1, kind: "named-route", routeName: "notes.item", parameters: { id } },
  });
}

function identityIndexes(items: LUFXIndexBackendSnapshot["items"] = []) {
  return new LuminaIndexService({
    create() {
      return {
        async mutate() { throw new Error("not used"); },
        async snapshot() { return { state: "ready", schemaVersion: 1, checkpoint: { generation: 1, revision: 1 }, items }; },
        async replaceAll() { throw new Error("not used"); },
        async eraseOwner() {
          return { state: "erased", schemaVersion: 1, tokenizerVersion: LUFX_TOKENIZER_VERSION, checkpoint: { generation: 2, revision: 2 }, itemCount: 0, approximateBytes: 0 };
        },
        async diagnostics() { throw new Error("not used"); },
        dispose() {},
      };
    },
  } satisfies LuminaIndexBackendFactory);
}

function identityHost(indexes: LuminaIndexService, eligibility: LuminaEligibilityRegistry) {
  return new LUFXHostService({
    runtimeId: "runtime:identity",
    indexes,
    eligibility,
    policy: { getCurrentSubject: () => identitySubject, authorise: () => ({ allowed: true }) },
    subscribeState: () => () => {},
    apps: { getApp: (appId: string) => ({ bundleIdentifier: appId }) },
    routes: {
      getAppForRoute: () => ({ bundleIdentifier: "com.example.journal" }),
      openRoute: () => ({
        correlationId: "route",
        cancel() {},
        result: Promise.resolve({ status: "completed", committed: true, postCommit: "completed", value: {}, issues: [], skipped: [] }),
      }),
    },
    presentationSettlements: { get: () => null },
    randomUUID: () => "activation",
  });
}

describe("bundle identifier comparison keys", () => {
  it("matches mixed case without changing the authored identity", () => {
    const app = Object.freeze({ bundleIdentifier: "com.Example.Notes" });
    expect(normalizeBundleIdentifier(app.bundleIdentifier)).toBe(normalizeBundleIdentifier("COM.EXAMPLE.NOTES"));
    expect(normalizeBundleIdentifier(app.bundleIdentifier)).toBe("com.example.notes");
    expect(app.bundleIdentifier).toBe("com.Example.Notes");
  });

  it("does not conflate different bundle identifiers", () => {
    expect(normalizeBundleIdentifier("com.example.notes")).not.toBe(normalizeBundleIdentifier("org.example.notes"));
  });

  it("preserves absent optional owners", () => {
    expect(normalizeBundleIdentifier(null)).toBeNull();
    expect(normalizeBundleIdentifier(undefined)).toBeUndefined();
  });

  it("finds a locale loader by another case while returning its authored identity", async () => {
    const runtime = createTestRuntime();
    runtime.locale.registerBundleLocaleResourceLoader("com.Example.Notes", async () => ({
      "Base.locale": { "Localisable.strings": "\"headline\" = \"Your notes\";" },
    }));
    const result = await runtime.locale.loadBundleLocaleResources(["COM.EXAMPLE.NOTES"]);
    expect(result).toEqual([{ appId: "com.Example.Notes", registered: 1 }]);
    expect(runtime.locale.t("headline", undefined, "synapps.com.example.notes")).toBe("Your notes");
    await runtime.dispose();
  });

  it("shares a private pasteboard across identifier case without crossing app ownership", async () => {
    const lifetime = new AbortController();
    const boards = createPasteboardRegistry({ runtimeId: "runtime:identity-board" as never, signal: lifetime.signal });
    const control = getPasteboardRuntimeControl(boards);
    const context = { appId: "com.Example.Notes" };
    const lease = control.issueLease(context, () => ({ appId: "COM.EXAMPLE.NOTES" }), { ownsPrivateBoard: true });
    const client = control.forLease(lease);
    await client.named("app:COM.EXAMPLE.NOTES").write([{ type: "text/plain", value: "Notes" }]);
    await expect(client.named("app:com.example.notes").snapshot()).resolves.toEqual([{ type: "text/plain", value: "Notes" }]);
    expect(() => client.named("app:org.example.notes")).toThrow();
    await control.clearLease(lease);
    boards.dispose();
  });

  it("supersedes animation authority for another casing of the same app", async () => {
    const runtime = createTestRuntime();
    const first = runtime.animations.acquireOwner({ appId: "com.Example.Notes", viewId: "editor" });
    const replacement = runtime.animations.acquireOwner({ appId: "COM.EXAMPLE.NOTES", viewId: "editor" });
    expect(first.appId).toBe("com.Example.Notes");
    const stale = runtime.animations.animate({}, {
      animations: [{ targetId: "editor", keyPath: "opacity", from: 0, to: 1 }],
      duration: 0.1,
    }, first);
    await expect(stale.finished).resolves.toMatchObject({ state: "cancelled", reason: "animation owner lease superseded" });
    replacement.release();
    await runtime.dispose();
  });

  it("finds windows by differently cased owner without rewriting their owner", async () => {
    const harness = createWindowTestDependencies({ id: "runtime:identity-window" });
    const controller = harness.manager.create(standardWindow("notes-window", {
      applicationId: "com.Example.Notes",
      applicationSessionId: "session:notes",
    }));
    await harness.manager.open(controller.id);
    expect(harness.manager.list({ applicationId: "COM.EXAMPLE.NOTES" }).map(({ id }) => id)).toEqual([controller.id]);
    expect(controller.record.applicationId).toBe("com.Example.Notes");
    expect(harness.manager.list({ applicationId: "org.example.notes" })).toEqual([]);
    harness.manager.dispose();
  });

  it("shares app-owned drafts across case variants while preserving the written owner", async () => {
    const store = createInMemoryDocumentStore({ kinds: [{ kind: "note", displayName: "Note", version: 1 }] });
    const saved = await store.saveDraft({ id: "note-1", kind: "note", body: "First" }, { appId: "com.Example.Notes" });
    expect(saved.applicationId).toBe("com.Example.Notes");
    expect((await store.getDraft("note-1", { appId: "COM.EXAMPLE.NOTES" }))?.id).toBe("note-1");
    expect(await store.listDrafts({}, { appId: "com.example.notes" })).toHaveLength(1);
    const updated = await store.saveDraft({ ...saved, body: "Updated" }, { appId: "COM.EXAMPLE.NOTES" });
    expect(updated.body).toBe("Updated");
    expect(updated.applicationId).toBe("com.Example.Notes");
    expect(await store.listDraftVersions("note-1", { appId: "COM.EXAMPLE.NOTES" })).toEqual(
      expect.arrayContaining([saved.storageVersion, updated.storageVersion]),
    );
    expect((await store.readDraftVersion("note-1", saved.storageVersion.id, { appId: "COM.EXAMPLE.NOTES" }))?.body).toBe("First");
    expect(await store.getDraft("note-1", { appId: "org.example.notes" })).toBeNull();
  });

  it("shares application undo ownership without folding document identities", () => {
    const runtimeId = "runtime:identity-normalisation" as never;
    const responders = createResponderGraph({ runtimeId });
    const registry = createUndoManagerRegistry({ runtimeId, responders });
    const appUndo = registry.create({ kind: "application", id: "com.Example.Notes" });
    expect(registry.get({ kind: "application", id: "COM.EXAMPLE.NOTES" })).toBe(appUndo);
    const documentUndo = registry.create({ kind: "document", id: "NoteA" });
    expect(registry.get({ kind: "document", id: "notea" })).toBeNull();
    expect(documentUndo).not.toBe(appUndo);
    registry.dispose();
    responders.dispose();
  });

  it("refuses a donation coordinator for another casing of an owner while its erasure is in progress", async () => {
    let finishClear!: () => void;
    const clearing = new Promise<void>((resolve) => { finishClear = resolve; });
    const eligibility = new LuminaEligibilityRegistry(() => 1_000);
    const host = identityHost(identityIndexes(), eligibility);
    const donation = (ownerAppId: string) => ({
      ownerAppId,
      domain: "com.example.notes",
      checkpointStore: { load: () => null, save: () => {}, clear: () => clearing },
      readSource: async () => [],
      project: () => { throw new Error("not used"); },
      now: () => 1_000,
    });
    host.createDonationCoordinator(donation("com.Example.Notes"));
    const erasing = host.eraseOwner("com.Example.Notes");
    expect(() => host.createDonationCoordinator(donation("COM.EXAMPLE.NOTES"))).toThrow("Lumina owner erasure is in progress.");
    finishClear();
    await erasing;
    expect(() => host.createDonationCoordinator(donation("com.example.notes"))).not.toThrow();
    host.dispose();
  });

  it("resolves a projection and its activation registration across owner casing", async () => {
    const eligibility = new LuminaEligibilityRegistry(() => 1_000);
    const note = identityItem("note-1", "r1");
    const host = identityHost(identityIndexes([note.toJSON()]), eligibility);
    host.registerDomain({
      ownerAppId: "Com.Example.Notes",
      domain: "com.example.notes",
      destinationAppId: "com.example.journal",
      routeName: "notes.item",
      resolve: ({ item }) => ({ pathname: `/journal?note=${encodeURIComponent(item.id)}` }),
    });
    host.setEligibility({ ownerAppId: "COM.EXAMPLE.NOTES", domain: "com.example.notes", itemId: "note-1", revision: "r1", eligible: true });
    expect(eligibility.bindingFor("com.example.notes", note)).toMatchObject({ ownerAppId: "Com.Example.Notes", destinationAppId: "com.example.journal" });
    expect(eligibility.owners()).toEqual(["Com.Example.Notes"]);
    const reference = {
      runtimeId: "runtime:identity",
      ownerAppId: "com.example.notes",
      domain: "com.example.notes",
      itemId: "note-1",
      revision: "r1",
      policyGeneration: eligibility.generation,
      subjectFingerprint: luminaSubjectFingerprint(identitySubject),
    };
    await expect(host.activate(reference)).resolves.toMatchObject({ status: "activated", committed: true, appId: "com.example.journal" });
    host.dispose();
  });

  it("updates one eligible item when setItem names its owner in another casing", () => {
    const eligibility = new LuminaEligibilityRegistry(() => 1_000);
    eligibility.registerProjection({ ownerAppId: "com.Example.Notes", domain: "com.example.notes", destinationAppId: "com.example.journal", routeName: "notes.item" });
    const first = eligibility.setItem({ ownerAppId: "com.Example.Notes", domain: "com.example.notes", itemId: "note-1", revision: "r1", eligible: true });
    const second = eligibility.setItem({ ownerAppId: "COM.EXAMPLE.NOTES", domain: "com.example.notes", itemId: "note-1", revision: "r2", eligible: true });
    expect(second).toBeGreaterThan(first);
    expect(eligibility.bindingFor("com.example.notes", identityItem("note-1", "r1"))).toBeNull();
    expect(eligibility.bindingFor("com.example.notes", identityItem("note-1", "r2"))).toMatchObject({ itemId: "note-1", revision: "r2" });
    expect(eligibility.restrictionFor("com.example.notes").items).toEqual([["com.example.notes", "note-1", "r2"]]);
    const revoked = eligibility.setItem({ ownerAppId: "com.example.notes", domain: "com.example.notes", itemId: "note-1", revision: "r2", eligible: false });
    expect(revoked).toBeGreaterThan(second);
    expect(eligibility.bindingFor("com.example.notes", identityItem("note-1", "r2"))).toBeNull();
    expect(eligibility.restrictionFor("com.example.notes").items).toEqual([]);
  });

  it("keys per-app volume by identifier so a write in one casing reads in another", async () => {
    let saved: unknown = { appVolumes: { "Com.Example.Notes": 0.4 } };
    // In-process fake: the preference was written under this key with the same shape.
    const persistence = {
      getPreference<T>(_key: string, fallback: T): T { return saved === undefined ? fallback : saved as T; },
      setPreference<T>(_key: string, value: T): boolean { saved = value; return true; },
    };
    const settings = createSettingsService({ runtimeId: "runtime:identity-settings" as never, persistence });
    expect(settings.get().appVolumes).toEqual({ "com.example.notes": 0.4 });
    settings.set("appVolumes", { "COM.EXAMPLE.NOTES": 0.25 });
    expect(settings.get().appVolumes["com.example.notes"]).toBe(0.25);
    expect(saved).toMatchObject({ appVolumes: { "com.example.notes": 0.25 } });
    settings.dispose();
    const runtime = createTestRuntime();
    runtime.settings.set("appVolumes", { "Com.Example.Notes": 0.25 });
    expect(runtime.settings.get().appVolumes["com.example.notes"]).toBe(0.25);
    expect(runtime.audio.getOwnerPolicy("COM.EXAMPLE.NOTES").volume).toBe(0.25);
    runtime.audio.setAppVolume("COM.EXAMPLE.NOTES", 0.5);
    expect(runtime.settings.get().appVolumes).toEqual({ "com.example.notes": 0.5 });
    expect(runtime.audio.getOwnerPolicy("com.Example.Notes").volume).toBe(0.5);
    await runtime.dispose();
  });

  it("erases data indexed under another casing of the owner", async () => {
    const partitions = new Map<string, Map<string, LUFXIndexBackendSnapshot["items"][number]>>();
    const indexes = new LuminaIndexService({
      create(ownerKey) {
        const items = partitions.get(ownerKey) ?? new Map<string, LUFXIndexBackendSnapshot["items"][number]>();
        partitions.set(ownerKey, items);
        return {
          async mutate(mutation) {
            if (mutation.kind !== "upsert") throw new Error("not used");
            items.set(mutation.item.id, mutation.item);
            return { mutationId: mutation.mutationId, checkpoint: { generation: 1, revision: 1 }, replayed: false };
          },
          async snapshot() {
            return { state: "ready", schemaVersion: 1, checkpoint: { generation: 1, revision: 1 }, items: [...items.values()] };
          },
          async replaceAll() { throw new Error("not used"); },
          async eraseOwner() {
            partitions.delete(ownerKey);
            return { state: "erased", schemaVersion: 1, tokenizerVersion: LUFX_TOKENIZER_VERSION, checkpoint: { generation: 2, revision: 2 }, itemCount: 0, approximateBytes: 0 };
          },
          async diagnostics() { throw new Error("not used"); },
          dispose() {},
        };
      },
    } satisfies LuminaIndexBackendFactory);
    const host = identityHost(indexes, new LuminaEligibilityRegistry(() => 1_000));
    const lifetime = new AbortController();
    const written = indexes.createIndex("Com.Example.X", lifetime.signal);
    await written.upsert(identityItem("note-1", "r1"), "mutation-1");
    written.dispose();
    await host.eraseOwner("com.example.x");
    const remaining = indexes.createIndex("Com.Example.X", lifetime.signal);
    await expect(remaining.snapshot()).resolves.toMatchObject({ items: [] });
    remaining.dispose();
    host.dispose();
  });
});
