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

import { NSEObjectController } from "../../src/NSE/Controllers";
import { createTestRuntime } from "./helpers";

const runtime = createTestRuntime({ id: "runtime:controller-responder" });
afterAll(() => runtime.dispose("test"));

it("participates between a focused view and its document responder", () => {
  const graph = runtime.responders;
  const document = graph.register({
    id: "document:invoice",
    kind: "document",
    parentId: "runtime",
    scopeId: "window:invoice",
  });
  const controller = new NSEObjectController({
    id: "invoice",
    content: { id: "invoice", totalPennies: 1250 },
    fields: {},
  });
  const attachment = controller.attachResponder({
    graph,
    parentResponderId: "document:invoice",
    scopeId: "window:invoice",
    undoOwner: { kind: "document", id: "invoice" },
  });
  const view = graph.register({
    id: "view:invoice-form",
    kind: "view",
    parentId: controller.responderId,
    scopeId: "window:invoice",
  });

  runtime.focus.requestFocus("view:invoice-form");
  expect(graph.resolveChain().map(({ id }) => id).slice(0, 4)).toEqual([
    "view:invoice-form",
    "controller:invoice",
    "document:invoice",
    "runtime",
  ]);
  expect(graph.resolveChain()[1]?.undoOwner).toEqual({
    kind: "document",
    id: "invoice",
  });

  view.dispose();
  attachment.dispose();
  expect(graph.get("controller:invoice")).toBeNull();
  expect(attachment.dispose()).toBe(false);
  document.dispose();
  controller.dispose();
});

it("rejects two simultaneous responder attachments", () => {
  const graph = runtime.responders;
  const document = graph.register({
    id: "document:second",
    kind: "document",
    parentId: "runtime",
    scopeId: "window:second",
  });
  const controller = new NSEObjectController({
    id: "second",
    content: { id: "second" },
    fields: {},
  });
  const attachment = controller.attachResponder({
    graph,
    parentResponderId: "document:second",
  });

  expect(() =>
    controller.attachResponder({
      graph,
      parentResponderId: "document:second",
    }),
  ).toThrow(/already has a live responder attachment/i);
  expect(controller.detachResponder()).toBe(true);
  expect(attachment.dispose()).toBe(false);
  document.dispose();
  controller.dispose();
});

it("does not permit listener-driven edits while disposing", () => {
  const controller = new NSEObjectController({
    id: "dispose-reentrancy",
    content: { id: "dispose-reentrancy", value: 1 },
    fields: {
      value: {
        read: (content) => content.value,
        write: (content, value: number) => ({ ...content, value }),
      },
    },
  });
  let armed = false;
  let reentered = false;
  controller.subscribeChanges(() => {
    if (!armed || reentered) return;
    reentered = true;
    controller.beginEditing({ id: "reentered", actionName: "Reentered disposal" });
    controller.setField("value", 2);
  });
  controller.beginEditing({ id: "initial", actionName: "Initial edit" });
  controller.setField("value", 2);
  armed = true;

  controller.dispose();

  expect(reentered).toBe(false);
  expect(controller.isEditing).toBe(false);
  expect(() =>
    controller.beginEditing({ id: "after-dispose", actionName: "After dispose" }),
  ).toThrow(expect.objectContaining({ code: "NSE_CONTROLLER_DISPOSED" }));
});
