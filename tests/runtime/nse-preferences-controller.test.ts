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

import { afterAll, expect, it, vi } from "vitest";

import { createUndoManager } from "../../src/SynCloudOS/Undo";
import {
  NSEPreferencesController,
  type PreferencesSchema,
} from "../../src/NSE/Controllers";
import { createTestRuntime } from "./helpers";

const runtime = createTestRuntime({ id: "runtime:preferences-controller" });
afterAll(() => runtime.dispose("test"));

const PREFERENCE_ENVELOPE_TAG = "syncloudos:nse-preferences:v1";

function schema() {
  return {
    version: 2,
    defaults: { theme: "system", lineNumbers: true },
    fields: {
      theme: {
        validate: (value: unknown): value is string => typeof value === "string",
      },
      lineNumbers: {
        validate: (value: unknown): value is boolean =>
          typeof value === "boolean",
      },
    },
    migrations: [
      {
        from: 1,
        to: 2,
        migrate: (value: Record<string, unknown>) => ({
          theme: value.theme === "grey" ? "system" : value.theme,
          lineNumbers: true,
        }),
      },
    ],
  } as const;
}

it.each([false, true])("supports scoped undo registration and rolls back on rejection (%s)", async (rejectRegistration) => {
  const values = new Map<string, unknown>();
  const undo = createUndoManager({ runtimeId: runtime.runtimeId, owner: { kind: "application", id: "scoped-preferences" }, maxEntries: 10 });
  const controller = new NSEPreferencesController({
    namespace: "scoped", schema: schema(),
    adapter: { read: key => values.get(key) ?? null, write: (key, value) => { values.set(key, value); }, remove: key => { values.delete(key); } },
  });
  try {
    const before = values.get("scoped");
    controller.beginEditing({ id: "edit", actionName: "Edit preferences", undoManager: {
      register(action) {
        if (rejectRegistration) throw new Error("History revoked");
        return undo.register(action);
      },
    } });
    controller.set("theme", "dark");
    if (rejectRegistration) {
      expect(() => controller.commitEditing()).toThrow("History revoked");
      expect(values.get("scoped")).toEqual(before);
      expect(controller.getSnapshot().committed.theme).toBe("system");
      expect(controller.isEditing).toBe(true);
    } else {
      expect(controller.commitEditing().status).toBe("committed");
      await undo.undo();
      expect(controller.getSnapshot().committed.theme).toBe("system");
      await undo.redo();
      expect(controller.getSnapshot().committed.theme).toBe("dark");
    }
  } finally { controller.dispose(); undo.dispose(); }
});

it("migrates, repairs and writes versioned preferences through one instance adapter", () => {
  const values = new Map<string, unknown>([
    ["editor", { version: 1, theme: "grey" }],
  ]);
  const writes: unknown[] = [];
  const controller = new NSEPreferencesController({
    namespace: "editor",
    schema: schema(),
    adapter: {
      read: (key) => values.get(key) ?? null,
      write: (key, value) => {
        writes.push(value);
        values.set(key, value);
      },
      remove: (key) => void values.delete(key),
    },
  });
  expect(controller.getSnapshot()).toMatchObject({
    value: { theme: "system", lineNumbers: true },
    committed: { theme: "system", lineNumbers: true },
    dirty: false,
    issues: [],
  });
  expect(writes).toEqual([
    [
      PREFERENCE_ENVELOPE_TAG,
      2,
      { theme: "system", lineNumbers: true },
    ],
  ]);
  expect(Object.isFrozen(controller.getSnapshot().value)).toBe(true);

  expect(controller.set("lineNumbers", false)).toBe(true);
  expect(values.get("editor")).toEqual([
    PREFERENCE_ENVELOPE_TAG,
    2,
    { theme: "system", lineNumbers: false },
  ]);
  expect(controller.set("lineNumbers", false)).toBe(false);
  controller.dispose();
});

it("keeps edits draft-only, discards without writes and replays one undo action", async () => {
  const values = new Map<string, unknown>();
  const write = vi.fn((key: string, value: unknown) => void values.set(key, value));
  const controller = new NSEPreferencesController({
    namespace: "editor-undo",
    schema: schema(),
    adapter: {
      read: () => null,
      write,
      remove: (key) => void values.delete(key),
    },
  });
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "preferences" },
    maxEntries: 20,
  });

  controller.beginEditing({ id: "discard", actionName: "Discard preferences" });
  controller.set("theme", "dark");
  expect(controller.getSnapshot()).toMatchObject({
    value: { theme: "dark" },
    committed: { theme: "system" },
    dirty: true,
  });
  controller.discardEditing();
  expect(write).not.toHaveBeenCalled();
  expect(controller.getSnapshot().value.theme).toBe("system");

  controller.beginEditing({
    id: "commit",
    actionName: "Change preferences",
    undoManager: undo,
  });
  controller.set("theme", "dark");
  controller.reset(["lineNumbers"]);
  expect(controller.commitEditing()).toMatchObject({
    status: "committed",
    transactionId: "commit",
    undoActionId: expect.any(String),
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().committed.theme).toBe("dark");
  await undo.undo();
  expect(controller.getSnapshot().committed.theme).toBe("system");
  await undo.redo();
  expect(controller.getSnapshot().committed.theme).toBe("dark");
  controller.dispose();
  undo.dispose();
});

it("repairs invalid fields and refuses broken migration chains", () => {
  const values = new Map<string, unknown>([
    ["repair", { version: 2, theme: 42, lineNumbers: false }],
  ]);
  const controller = new NSEPreferencesController({
    namespace: "repair",
    schema: schema(),
    adapter: {
      read: (key) => values.get(key) ?? null,
      write: (key, value) => void values.set(key, value),
      remove: (key) => void values.delete(key),
    },
  });
  expect(controller.getSnapshot().value).toEqual({
    theme: "system",
    lineNumbers: false,
  });
  expect(controller.getSnapshot().issues).toContainEqual(
    expect.objectContaining({ field: "theme" }),
  );
  expect(values.get("repair")).toEqual([
    PREFERENCE_ENVELOPE_TAG,
    2,
    { theme: "system", lineNumbers: false },
  ]);
  controller.dispose();

  expect(
    () =>
      new NSEPreferencesController({
        namespace: "broken",
        schema: { ...schema(), version: 3 },
        adapter: {
          read: () => ({ version: 1, theme: "grey" }),
          write: () => undefined,
          remove: () => undefined,
        },
      }),
  ).toThrow(/migration chain/);
});

it("rejects inherited prototype names as preference schema fields", () => {
  const controller = new NSEPreferencesController({
    namespace: "prototype-preferences",
    schema: schema(),
    adapter: { read: () => null, write: () => undefined, remove: () => undefined },
  });
  expect(() => controller.reset(["constructor" as "theme"])).toThrow(
    /Preference "constructor" failed schema validation/,
  );
  controller.dispose();

  const defaults = Object.create(null) as { constructor: number };
  Object.defineProperty(defaults, "constructor", {
    value: 1,
    enumerable: true,
  });
  expect(
    () =>
      new NSEPreferencesController({
        namespace: "invalid-prototype-schema",
        schema: {
          version: 0,
          defaults,
          fields: {},
          migrations: [],
        } as unknown as PreferencesSchema<{ constructor: number }>,
        adapter: { read: () => null, write: () => undefined, remove: () => undefined },
      }),
  ).toThrow('Preference default "constructor" does not satisfy its schema.');
});

it("fails closed for future-version preferences without overwriting their bytes", () => {
  const futureRecord = Object.freeze({
    version: 9,
    values: {
      theme: "future-theme",
      lineNumbers: false,
      futureOnly: { preserved: true },
    },
  });
  const values = new Map<string, unknown>([["future", futureRecord]]);
  const write = vi.fn((key: string, value: unknown) => values.set(key, value));

  expect(
    () =>
      new NSEPreferencesController({
        namespace: "future",
        schema: schema(),
        adapter: {
          read: (key) => values.get(key) ?? null,
          write,
          remove: (key) => void values.delete(key),
        },
      }),
  ).toThrow(/future version/i);
  expect(write).not.toHaveBeenCalled();
  expect(values.get("future")).toBe(futureRecord);
});

it("exposes no mutable map, set or date state from preference snapshots", () => {
  interface RichPreferences {
    readonly settings: {
      readonly tags: Set<string>;
      readonly lookup: Map<string, number>;
      readonly savedAt: Date;
    };
  }

  const source: RichPreferences = {
    settings: {
      tags: new Set(["owned"]),
      lookup: new Map([["first", 1]]),
      savedAt: new Date("2026-08-08T12:00:00.000Z"),
    },
  };
  const richSchema: PreferencesSchema<RichPreferences> = {
    version: 1,
    defaults: source,
    fields: {
      settings: {
        validate: (value: unknown): value is RichPreferences["settings"] =>
          typeof value === "object" && value !== null,
      },
    },
    migrations: [],
  };
  const controller = new NSEPreferencesController({
    namespace: "rich-preferences",
    schema: richSchema,
    adapter: { read: () => null, write: () => undefined, remove: () => undefined },
  });
  const value = controller.getSnapshot().value.settings;
  source.settings.tags.add("external");
  source.settings.lookup.set("external", 2);
  source.settings.savedAt.setUTCDate(9);

  expect(value.tags.has("external")).toBe(false);
  expect(value.lookup.has("external")).toBe(false);
  expect(value.savedAt.toISOString()).toBe("2026-08-08T12:00:00.000Z");
  expect(() => value.tags.add("unsafe")).toThrow(TypeError);
  expect(() => value.lookup.set("unsafe", 3)).toThrow(TypeError);
  expect(() => value.savedAt.setUTCDate(1)).toThrow(TypeError);
  controller.dispose();
});

it("keeps a preference draft and storage unchanged when undo registration rejects", () => {
  const values = new Map<string, unknown>();
  const write = vi.fn((key: string, value: unknown) => values.set(key, value));
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "preferences-registration" },
    maxEntries: 10,
  });
  undo.dispose();
  const controller = new NSEPreferencesController({
    namespace: "preferences-registration",
    schema: schema(),
    adapter: { read: () => null, write, remove: () => undefined },
  });
  controller.beginEditing({
    id: "preferences-registration",
    actionName: "Change theme",
    undoManager: undo,
  });
  controller.set("theme", "dark");
  const before = controller.getSnapshot();

  expect(() => controller.commitEditing()).toThrow(/undo manager is disposed/i);
  expect(controller.getSnapshot()).toBe(before);
  expect(controller.isEditing).toBe(true);
  expect(controller.getSnapshot().committed.theme).toBe("system");
  expect(controller.getSnapshot().value.theme).toBe("dark");
  expect(write).not.toHaveBeenCalled();
  controller.discardEditing();
  controller.dispose();
});

it("keeps persistence, undo history and editing state atomic when a commit write throws", () => {
  const values = new Map<string, unknown>([
    [
      "write-atomicity",
      Object.freeze([
        PREFERENCE_ENVELOPE_TAG,
        2,
        Object.freeze({ theme: "system", lineNumbers: true }),
      ]),
    ],
  ]);
  let rejectWrites = false;
  const write = vi.fn((key: string, value: unknown) => {
    if (rejectWrites) throw new Error("persistence rejected the write");
    values.set(key, value);
  });
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "preferences-write-atomicity" },
    maxEntries: 10,
  });
  const controller = new NSEPreferencesController({
    namespace: "write-atomicity",
    schema: schema(),
    adapter: { read: (key) => values.get(key) ?? null, write, remove: () => undefined },
  });
  controller.beginEditing({
    id: "write-atomicity",
    actionName: "Change theme",
    undoManager: undo,
  });
  controller.set("theme", "dark");
  const before = controller.getSnapshot();
  const persistedBefore = values.get("write-atomicity");
  let publications = 0;
  const unsubscribe = controller.subscribe(() => publications += 1);
  rejectWrites = true;

  expect(() => controller.commitEditing()).toThrow("persistence rejected the write");
  expect(controller.getSnapshot()).toBe(before);
  expect(controller.isEditing).toBe(true);
  expect(values.get("write-atomicity")).toBe(persistedBefore);
  expect(undo.inspect()).toMatchObject({ cursor: 0, entries: [] });
  expect(publications).toBe(0);
  unsubscribe();
  controller.discardEditing();

  const writesBeforeNoOp = write.mock.calls.length;
  controller.beginEditing({
    id: "no-op-preferences",
    actionName: "No-op preferences",
    undoManager: undo,
  });
  rejectWrites = false;
  expect(controller.commitEditing()).toMatchObject({
    status: "committed",
    undoActionId: null,
  });
  expect(write).toHaveBeenCalledTimes(writesBeforeNoOp);
  expect(undo.inspect()).toMatchObject({ cursor: 0, entries: [] });
  controller.dispose();
  undo.dispose();
});

it("keeps a user preference named version separate from the persistence schema version", () => {
  interface VersionPreferences {
    readonly version: string;
    readonly theme: string;
  }

  const versionSchema: PreferencesSchema<VersionPreferences> = {
    version: 3,
    defaults: { version: "editor-v1", theme: "system" },
    fields: {
      version: { validate: (value: unknown): value is string => typeof value === "string" },
      theme: { validate: (value: unknown): value is string => typeof value === "string" },
    },
    migrations: [],
  };
  const values = new Map<string, unknown>();
  const adapter = {
    read: (key: string) => values.get(key) ?? null,
    write: (key: string, value: unknown) => void values.set(key, value),
    remove: (key: string) => void values.delete(key),
  };
  const controller = new NSEPreferencesController({
    namespace: "version-preference",
    schema: versionSchema,
    adapter,
  });
  controller.set("version", "editor-v2");
  expect(values.get("version-preference")).toEqual([
    PREFERENCE_ENVELOPE_TAG,
    3,
    { version: "editor-v2", theme: "system" },
  ]);
  const reloaded = new NSEPreferencesController({
    namespace: "version-preference",
    schema: versionSchema,
    adapter,
  });
  expect(reloaded.getSnapshot().value).toEqual({
    version: "editor-v2",
    theme: "system",
  });
  controller.dispose();
  reloaded.dispose();
});

it("preserves a legacy flat values field before migrating it into the tagged envelope", () => {
  interface ValuesPreferences {
    readonly values: { readonly preserved: string };
  }

  const valuesSchema: PreferencesSchema<ValuesPreferences> = {
    version: 1,
    defaults: { values: { preserved: "default" } },
    fields: {
      values: {
        validate: (value: unknown): value is ValuesPreferences["values"] =>
          typeof value === "object" &&
          value !== null &&
          typeof (value as { readonly preserved?: unknown }).preserved === "string",
      },
    },
    migrations: [],
  };
  const storage = new Map<string, unknown>([
    ["legacy-values", { version: 1, values: { preserved: "legacy-value" } }],
  ]);
  const write = vi.fn((key: string, value: unknown) => storage.set(key, value));
  const adapter = {
    read: (key: string) => storage.get(key) ?? null,
    write,
    remove: (key: string) => void storage.delete(key),
  };

  const controller = new NSEPreferencesController({
    namespace: "legacy-values",
    schema: valuesSchema,
    adapter,
  });
  expect(controller.getSnapshot().value).toEqual({
    values: { preserved: "legacy-value" },
  });
  expect(storage.get("legacy-values")).toEqual([
    PREFERENCE_ENVELOPE_TAG,
    1,
    { values: { preserved: "legacy-value" } },
  ]);

  const reloaded = new NSEPreferencesController({
    namespace: "legacy-values",
    schema: valuesSchema,
    adapter,
  });
  expect(reloaded.getSnapshot().value).toEqual({
    values: { preserved: "legacy-value" },
  });
  expect(write).toHaveBeenCalledTimes(1);
  controller.dispose();
  reloaded.dispose();
});

it("preserves nested legacy data named values when the shape matches the former envelope", () => {
  interface NestedValuesPreferences {
    readonly values: {
      readonly values: { readonly preserved: string };
    };
  }

  const valuesSchema: PreferencesSchema<NestedValuesPreferences> = {
    version: 1,
    defaults: { values: { values: { preserved: "default" } } },
    fields: {
      values: {
        validate: (value: unknown): value is NestedValuesPreferences["values"] =>
          typeof value === "object" &&
          value !== null &&
          typeof (value as { readonly values?: { readonly preserved?: unknown } }).values ===
            "object" &&
          (value as { readonly values: { readonly preserved?: unknown } }).values !== null &&
          typeof (value as { readonly values: { readonly preserved?: unknown } }).values
            .preserved === "string",
      },
    },
    migrations: [],
  };
  const storage = new Map<string, unknown>([
    [
      "legacy-nested-values",
      { version: 1, values: { values: { preserved: "legacy-value" } } },
    ],
  ]);
  const controller = new NSEPreferencesController({
    namespace: "legacy-nested-values",
    schema: valuesSchema,
    adapter: {
      read: (key) => storage.get(key) ?? null,
      write: (key, value) => void storage.set(key, value),
      remove: (key) => void storage.delete(key),
    },
  });

  expect(controller.getSnapshot().value).toEqual({
    values: { values: { preserved: "legacy-value" } },
  });
  expect(storage.get("legacy-nested-values")).toEqual([
    PREFERENCE_ENVELOPE_TAG,
    1,
    { values: { values: { preserved: "legacy-value" } } },
  ]);
  controller.dispose();
});

it("migrates an unambiguous prior object envelope into the tagged envelope", () => {
  interface PriorEnvelopePreferences {
    readonly theme: string;
  }

  const priorEnvelopeSchema: PreferencesSchema<PriorEnvelopePreferences> = {
    version: 1,
    defaults: { theme: "default" },
    fields: {
      theme: {
        validate: (value: unknown): value is string => typeof value === "string",
      },
    },
    migrations: [],
  };
  const storage = new Map<string, unknown>([
    ["prior-object-envelope", { version: 1, values: { theme: "prior-theme" } }],
  ]);
  const controller = new NSEPreferencesController({
    namespace: "prior-object-envelope",
    schema: priorEnvelopeSchema,
    adapter: {
      read: (key) => storage.get(key) ?? null,
      write: (key, value) => void storage.set(key, value),
      remove: (key) => void storage.delete(key),
    },
  });

  expect(controller.getSnapshot().value).toEqual({ theme: "prior-theme" });
  expect(storage.get("prior-object-envelope")).toEqual([
    PREFERENCE_ENVELOPE_TAG,
    1,
    { theme: "prior-theme" },
  ]);
  controller.dispose();
});

it("fails closed before publication when an adapter returns a rejecting write promise", async () => {
  const values = new Map<string, unknown>([
    [
      "rejecting-write",
      Object.freeze([
        PREFERENCE_ENVELOPE_TAG,
        2,
        Object.freeze({ theme: "system", lineNumbers: true }),
      ]),
    ],
  ]);
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "preferences-rejecting-write" },
    maxEntries: 10,
  });
  const controller = new NSEPreferencesController({
    namespace: "rejecting-write",
    schema: schema(),
    adapter: {
      read: (key) => values.get(key) ?? null,
      write: (key, value) => {
        values.set(key, value);
        return Promise.reject(new Error("adapter rejected asynchronously"));
      },
      remove: () => undefined,
    },
  });
  controller.beginEditing({
    id: "rejecting-write",
    actionName: "Reject write",
    undoManager: undo,
  });
  controller.set("theme", "dark");
  const before = controller.getSnapshot();
  const persistedBefore = values.get("rejecting-write");

  expect(() => controller.commitEditing()).toThrow(/synchronous/i);
  await Promise.resolve();
  expect(controller.getSnapshot()).toBe(before);
  expect(controller.isEditing).toBe(true);
  expect(values.get("rejecting-write")).toBe(persistedBefore);
  expect(undo.inspect()).toMatchObject({ cursor: 0, entries: [] });
  controller.discardEditing();
  controller.dispose();
  undo.dispose();
});
