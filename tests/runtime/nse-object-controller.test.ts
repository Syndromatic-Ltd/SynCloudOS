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

import { afterAll, expect, it } from "vitest";

import {
  NumberFormatter,
  createValueTransformer,
} from "../../src/SynCloudOS/Models";
import { createUndoManager } from "../../src/SynCloudOS/Undo";
import { NSEObjectController } from "@syndromatic/syncloudos/nse";
import { createTestRuntime } from "./helpers";

const runtime = createTestRuntime({ id: "runtime:object-controller" });
afterAll(() => runtime.dispose("test"));

it("validates, discards and registers committed object edits with runtime undo", async () => {
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "invoice" },
    maxEntries: 50,
  });
  const controller = new NSEObjectController({
    id: "invoice",
    content: { id: "invoice", totalPennies: 1250 },
    fields: {
      total: {
        read: (invoice) => invoice.totalPennies,
        write: (invoice, value: number) => ({
          ...invoice,
          totalPennies: value,
        }),
        formatter: new NumberFormatter({ minimum: 0 }),
        transformer: createValueTransformer({
          id: "pounds-to-pennies",
          transform: (pounds: number) => Math.round(pounds * 100),
          reverse: (pennies: number) => pennies / 100,
        }),
      },
    },
  });

  controller.beginEditing({
    id: "edit-total",
    actionName: "Change invoice total",
    undoManager: undo,
  });
  expect(
    controller.setFieldText("total", "20.75", { locale: "en-GB" }),
  ).toMatchObject({ ok: true });
  expect(controller.getSnapshot().draft?.totalPennies).toBe(2075);
  controller.discardEditing();
  expect(controller.getSnapshot().content.totalPennies).toBe(1250);

  controller.beginEditing({
    id: "edit-total-again",
    actionName: "Change invoice total",
    undoManager: undo,
  });
  controller.setFieldText("total", "20.75", { locale: "en-GB" });
  expect(controller.commitEditing()).toMatchObject({
    status: "committed",
    transactionId: "edit-total-again",
    undoActionId: expect.any(String),
  });
  expect(controller.getSnapshot().content.totalPennies).toBe(2075);
  await undo.undo();
  expect(controller.getSnapshot().content.totalPennies).toBe(1250);
  await undo.redo();
  expect(controller.getSnapshot().content.totalPennies).toBe(2075);

  controller.dispose();
  undo.dispose();
});

it("retains immutable content and reports validation without throwing user input", () => {
  const source = { id: "profile", age: 20 };
  const controller = new NSEObjectController({
    id: "profile",
    content: source,
    fields: {
      age: {
        read: (profile) => profile.age,
        write: (profile, age: number) => ({ ...profile, age }),
        formatter: new NumberFormatter({ minimum: 0 }),
        validate: (age) =>
          age >= 18
            ? []
            : [{ code: "age.minimum", message: "Age must be at least 18." }],
      },
    },
  });
  source.age = 99;
  expect(controller.getSnapshot().content.age).toBe(20);
  expect(Object.isFrozen(controller.getSnapshot().content)).toBe(true);

  controller.beginEditing({ id: "age", actionName: "Change age" });
  expect(controller.setFieldText("age", "12", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "controller.validation" },
  });
  expect(controller.commitEditing()).toMatchObject({
    status: "invalid",
    issues: [{ code: "age.minimum" }],
  });
  controller.discardEditing();
  controller.dispose();
});

it("owns nested map, set and date values without leaking mutation through callbacks", () => {
  interface RichProfile {
    readonly id: string;
    readonly labels: Map<string, { readonly enabled: boolean }>;
    readonly tags: Set<string>;
    readonly savedAt: Date;
  }

  const source: RichProfile = {
    id: "rich-profile",
    labels: new Map([["primary", { enabled: true }]]),
    tags: new Set(["stable"]),
    savedAt: new Date("2026-08-08T12:00:00.000Z"),
  };
  const controller = new NSEObjectController<RichProfile>({
    id: "rich-profile",
    content: source,
    fields: {},
  });
  const value = controller.getSnapshot().content;
  source.labels.set("external", { enabled: false });
  source.tags.add("external");
  source.savedAt.setUTCFullYear(2030);

  expect(value.labels.has("external")).toBe(false);
  expect(value.tags.has("external")).toBe(false);
  expect(value.savedAt.toISOString()).toBe("2026-08-08T12:00:00.000Z");
  expect(() => value.labels.set("unsafe", { enabled: false })).toThrow(TypeError);
  expect(() => value.tags.add("unsafe")).toThrow(TypeError);
  expect(() => value.savedAt.setTime(0)).toThrow(TypeError);
  let callbackMap: Map<string, { readonly enabled: boolean }> | undefined;
  value.labels.forEach((_entry, _key, map) => {
    callbackMap = map;
  });
  expect(() => callbackMap?.set("unsafe-callback", { enabled: false })).toThrow(
    TypeError,
  );
  expect(value.labels.has("unsafe-callback")).toBe(false);
  controller.dispose();
});

it("rejects inherited prototype names as unknown object fields", () => {
  const controller = new NSEObjectController({
    id: "prototype-fields",
    content: { value: 1 },
    fields: {},
  });

  for (const field of ["constructor", "toString", "__proto__"]) {
    expect(() => controller.setField(field, 2)).toThrow(/Unknown controller field/);
  }
  controller.dispose();
});

it("fails closed with the snapshot ownership error for hostile proxy content", () => {
  const hostile = new Proxy({ id: "hostile", value: 1 }, {});
  expect(
    () =>
      new NSEObjectController({
        id: "hostile-proxy",
        content: hostile,
        fields: {},
      }),
  ).toThrow(/Controller snapshots require cloneable own-data values/);
});

it("rejects accessor-backed object content without evaluating the accessor", () => {
  let reads = 0;
  const content = {} as { readonly value: number };
  Object.defineProperty(content, "value", {
    enumerable: true,
    get: () => {
      reads += 1;
      throw new Error("object accessor escaped ownership");
    },
  });

  expect(
    () =>
      new NSEObjectController({
        id: "accessor-object",
        content,
        fields: {},
      }),
  ).toThrow(/Controller snapshots require cloneable own-data values/);
  expect(reads).toBe(0);
});

it("keeps an object edit intact when undo registration rejects", () => {
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "object-registration" },
    maxEntries: 10,
  });
  undo.dispose();
  const controller = new NSEObjectController({
    id: "object-registration",
    content: { id: "invoice", total: 1 },
    fields: {
      total: {
        read: (value) => value.total,
        write: (value, total: number) => ({ ...value, total }),
      },
    },
  });
  controller.beginEditing({
    id: "object-registration",
    actionName: "Change total",
    undoManager: undo,
  });
  controller.setField("total", 2);
  const before = controller.getSnapshot();

  expect(() => controller.commitEditing()).toThrow(/undo manager is disposed/i);
  expect(controller.getSnapshot()).toBe(before);
  expect(controller.isEditing).toBe(true);
  expect(controller.getSnapshot().content.total).toBe(1);
  expect(controller.getSnapshot().draft?.total).toBe(2);
  controller.discardEditing();
  controller.dispose();
});
