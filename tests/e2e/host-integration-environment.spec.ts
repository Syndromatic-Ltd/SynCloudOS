import { expect, test } from "playwright/test";
import { randomUUID } from "node:crypto";

test("a declared integration uses the browser environment for durable recovery and installed document storage", async ({ page }) => {
  const databaseName = `syncloudos-integration-recovery-${randomUUID()}`;
  await page.goto("/");
  const result = await page.evaluate(async databaseName => {
    const paths = [
      "/src/Webspring/webspringIntegration.ts",
      "/src/SynCloudOS/HostContributions/hostContribution.ts",
      "/src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts",
      "/src/SynCloudOS/Runtime/createSynCloudOS.ts",
      "/src/SynCloudOS/Documents/IndexedDBDocumentRecoveryStore.ts",
      "/src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter.ts",
      "/tests/fixtures/noteDocumentType.ts",
    ];
    const [integrations, contributions, platform, runtimes, recovery, adapters, fixtures] = await Promise.all(
      paths.map(path => import(/* @vite-ignore */ path)),
    );
    const environment = platform.createBrowserRuntimeEnvironment();
    let preparedWithHostEnvironment = false;
    const definition = integrations.defineIntegration({
      owners: ["com.example.notes"],
      applicationDocuments(injected: typeof environment) {
        preparedWithHostEnvironment = injected === environment;
        return { recoveryStore: new recovery.IndexedDBDocumentRecoveryStore({
          indexedDB, databaseName, persistenceNamespace: "integration-boundary", environment: injected,
        }) };
      },
      install(context: { documents: { registerType: (type: unknown) => void; registerAdapter: (adapter: unknown) => void }; environment: typeof environment }) {
        context.documents.registerType(fixtures.noteType);
        context.documents.registerAdapter(new adapters.InMemoryDocumentAdapter(context.environment));
      },
    });
    const contribution = integrations.createIntegrationContribution(definition, { id: "notes", source: "tests/Notes.integration.ts" }, []);
    const prepared = await contributions.prepareSynCloudOSHostContributions([contribution], environment);
    const composition = contributions.composeSynCloudOSHostContributions(prepared);
    const runtime = runtimes.createSynCloudOS({ environment, applicationDocuments: composition.applicationDocuments });
    const handle = contributions.createSynCloudOSHostInstallContext(prepared[0], runtime);
    const reopened = new recovery.IndexedDBDocumentRecoveryStore({
      indexedDB, databaseName, persistenceNamespace: "integration-boundary", environment,
    });
    try {
      await prepared[0].install(handle.context);
      const document = await runtime.documents.newDocument({
        documentId: "durable-integration-note", typeId: fixtures.noteType.id,
        location: { kind: "memory", namespace: "integration", key: "durable-note" },
      });
      document.update((model: { title: string; body: string }) => ({ ...model, body: "Durable integration recovery" }), { actionName: "Type" });
      await document.flushRecovery();
      const recovered = await reopened.read(document.recoveryRecord.recoveryId);
      await document.save({ reason: "explicit" });
      return { preparedWithHostEnvironment, recoveredBody: recovered.serializedContent.body, saved: !document.hasUnsavedChanges };
    } finally {
      runtime.documents.registerCloseReviewer({ review: async () => "discard" });
      await runtime.dispose();
      await handle.cleanup();
      await reopened.dispose();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }, databaseName);
  expect(result).toEqual({ preparedWithHostEnvironment: true, recoveredBody: "Durable integration recovery", saved: true });
});
