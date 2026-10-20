import { describe, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { captureLazySynWareDefinition } from "../../src/SynCloudOS/BundleLoader/definitionModule";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import type { SynWareManifestV1 } from "../../src/SynCloudOS/AppSDK/manifest";

const manifest: SynWareManifestV1 = { schemaVersion: 1, id: "notes", title: "Notes", version: "1.0.0" };
const bundle = createSynWareBundle(createSynWare({ manifest, root: () => null }));

describe("application entry modules", () => {
  it.each([function Notes() { return null; }, class NotesApp extends NSEApplication {}])("captures a component or application class and its named migrations", App => {
    const migrated: unknown[] = [];
    const definition = captureLazySynWareDefinition({ default: App, migrations: [{ fromVersion: 1, toVersion: 2, migrate(value: unknown) { migrated.push(value); return { revised: value }; } }] }, bundle);
    expect(definition.manifest).toEqual(manifest);
    expect(definition.migrations?.[0].migrate("note", { signal: new AbortController().signal })).toEqual({ revised: "note" });
    expect(migrated).toEqual(["note"]);
  });
  it("retains named chrome, document rematerialisation and background behaviour", async () => {
    const calls: string[] = [];
    const chrome = () => null;
    const definition = captureLazySynWareDefinition({ default: function Notes() { return null; }, windowChrome: chrome,
      rematerialiseOwnedDocument: async () => { calls.push("document"); return null; },
      createBackgroundHandler: () => ({ handle: async (taskId: string) => { calls.push(taskId); } }),
    }, bundle);
    expect(definition.windowChrome).toBe(chrome);
    const handler = definition.createBackgroundHandler?.();
    await handler?.handle("refresh", { signal: new AbortController().signal });
    expect(calls).toEqual(["refresh"]);
  });
  it("rejects missing and incorrect default exports with the expected application entry", () => {
    expect(() => captureLazySynWareDefinition({}, bundle)).toThrow(/default/);
    expect(() => captureLazySynWareDefinition({ default: 42 }, bundle)).toThrow(/React component or an NSEApplication subclass/);
  });
  it("rejects duplicate class and module migrations", () => {
    class Notes extends NSEApplication { static override migrations = []; }
    expect(() => captureLazySynWareDefinition({ default: Notes, migrations: [] }, bundle)).toThrow(/declares migrations twice/);
  });
});
