import { describe, expect, it } from "vitest";
import {
  composeSynCloudOSHostContributions,
  createSynCloudOSHostInstallContext,
  prepareSynCloudOSHostContributions,
} from "../../src/SynCloudOS/HostContributions/hostContribution";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import { InMemoryDocumentRecoveryStore } from "../../src/SynCloudOS/Documents/DocumentRecoveryStore";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createIntegrationContribution, defineIntegration } from "../../src/Webspring/webspringIntegration";
import { noteType } from "../fixtures/noteDocumentType";
import type { NoteDocumentModel } from "../fixtures/noteDocumentType";
import { createTestRuntimeEnvironment } from "./helpers";

describe("integration document environment boundaries", () => {
  it("prepares recovery storage with the host environment and installs a working document adapter", async () => {
    const environment = createTestRuntimeEnvironment();
    const recoveryStore = new InMemoryDocumentRecoveryStore();
    let preparations = 0;
    const definition = defineIntegration({
      owners: ["com.example.notes"],
      applicationDocuments: async injected => {
        expect(injected).toBe(environment);
        preparations += 1;
        return { recoveryStore };
      },
      install(context) {
        context.documents.registerType(noteType);
        context.documents.registerAdapter(new InMemoryDocumentAdapter(context.environment));
      },
    });
    expect(preparations).toBe(0);
    const contribution = createIntegrationContribution(definition, { id: "notes", source: "tests/Notes.integration.ts" }, []);
    const prepared = await prepareSynCloudOSHostContributions([contribution], environment);
    const composition = composeSynCloudOSHostContributions(prepared);
    const runtime = createSynCloudOS({ environment, ...composition.runtimeConfig, applicationDocuments: composition.applicationDocuments });
    const handle = createSynCloudOSHostInstallContext(prepared[0]!, runtime);
    try {
      await prepared[0]!.install!(handle.context);
      expect(preparations).toBe(1);
      expect(Object.keys(handle.context.environment).sort()).toEqual(["clearTimeout", "now", "randomUUID", "setTimeout"]);
      const document = await runtime.documents.newDocument<NoteDocumentModel>({
        documentId: "integration-note", typeId: noteType.id,
        location: { kind: "memory", namespace: "integration", key: "note" },
      });
      document.update(model => ({ ...model, body: "Recovered through the host boundary" }), { actionName: "Type" });
      await document.flushRecovery();
      expect(document.recoveryRecord).not.toBeNull();
      await expect(recoveryStore.read(document.recoveryRecord!.recoveryId)).resolves.toEqual(document.recoveryRecord);
      await document.save({ reason: "explicit" });
      expect(document.hasUnsavedChanges).toBe(false);
    } finally {
      runtime.documents.registerCloseReviewer({ review: async () => "discard" });
      await handle.cleanup();
      await runtime.dispose();
    }
  });

  it("withdraws an installed adapter's environment when its contribution is cleaned up", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createSynCloudOS({ environment });
    const definition = defineIntegration({ owners: ["com.example.notes"] });
    const prepared = await prepareSynCloudOSHostContributions([
      createIntegrationContribution(definition, { id: "notes", source: "tests/Notes.integration.ts" }, []),
    ], environment);
    const handle = createSynCloudOSHostInstallContext(prepared[0]!, runtime);
    const adapter = new InMemoryDocumentAdapter(handle.context.environment);
    const request = {
      location: { kind: "memory" as const, namespace: "integration", key: "installed-note" }, typeId: noteType.id,
      schemaVersion: 1, content: { body: "Hello" }, expectedVersion: null, idempotencyKey: "initial",
    };
    try {
      await expect(adapter.write(request)).resolves.toMatchObject({ version: { sequence: 1 } });
      await handle.cleanup();
      expect(() => handle.context.environment.now()).toThrow(/aborted/iu);
      expect(() => handle.context.environment.randomUUID()).toThrow(/aborted/iu);
      expect(() => handle.context.environment.setTimeout(() => undefined, 0)).toThrow(/aborted/iu);
      await expect(adapter.write({ ...request, location: { kind: "memory", namespace: "integration", key: "after-cleanup" }, idempotencyKey: "after-cleanup" })).rejects.toThrow(/aborted/iu);
    } finally {
      await handle.cleanup();
      await runtime.dispose();
    }
  });
});
