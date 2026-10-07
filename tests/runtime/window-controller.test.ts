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

import { describe, expect, it, vi } from "vitest";
import {
  WindowContentRegistry,
  WindowController,
  type WindowContentController,
  type WindowRecord,
} from "../../src/SynCloudOS/Windows";
import type { ResponderGraph } from "../../src/SynCloudOS/Responders";
import { createTestRuntime } from "./helpers";

function serialisableWindowRecord(runtimeId: WindowRecord["runtimeId"], overrides: Partial<WindowRecord> = {}): WindowRecord {
  return Object.freeze({
    id: "window-1",
    runtimeId,
    workspaceId: "workspace-main",
    applicationId: "com.syndromatic.Notes",
    applicationSessionId: "session-1",
    documentId: "document-1",
    documentAssociationRole: "primary",
    representedDocument: null,
    toolbar: null,
    role: "standard",
    style: Object.freeze(["titled", "closable", "minimisable", "resizable", "zoomable"] as const),
    title: "Notes",
    content: Object.freeze({ rendererId: "notes", parameters: null }),
    bounds: Object.freeze({ x: 80, y: 60, width: 720, height: 520 }),
    minimumSize: Object.freeze({ width: 320, height: 240 }),
    maximumSize: null,
    level: "normal",
    parentWindowControllerId: null,
    anchor: null,
    pinned: false,
    state: "closed",
    isKey: false,
    isMain: false,
    zIndex: 0,
    chromeMode: "system",
    mobilePolicy: "fullscreen",
    restorationKey: "notes.primary",
    ...overrides,
  });
}

function loggingResponders(base: ResponderGraph, order: string[]): ResponderGraph {
  return {
    ...base,
    register(registration) {
      const handle = base.register(registration);
      return {
        id: handle.id,
        dispose(options) {
          order.push(registration.kind === "controller" ? "content-responder" : `${registration.kind}-responder`);
          return handle.dispose(options);
        },
      };
    },
  };
}

function fixture(options: { failLoad?: boolean; systemWindow?: boolean } = {}) {
  const runtime = createTestRuntime({ id: `runtime:window-controller:${options.failLoad ? "fail" : "pass"}:${options.systemWindow ? "system" : "app"}` });
  const order: string[] = [];
  const appHandle = options.systemWindow ? null : runtime.responders.register({
    id: "application:session-1",
    kind: "application",
    parentId: "workspace",
    scopeId: "application:session-1",
    undoOwner: { kind: "application", id: "com.syndromatic.Notes" },
  });
  const content: WindowContentController = {
    mountKey: "mount:notes:window-1",
    responderId: "control:notes-editor",
    load: vi.fn(async () => {
      if (options.failLoad) throw new Error("content failed");
    }),
    prepareClose: vi.fn(async () => ({
      status: "ready" as const,
      token: "content-close-token",
      commit: vi.fn(),
      rollback: vi.fn(),
    })),
    unload: vi.fn((reason) => order.push(`unload:${reason}`)),
    dispose: vi.fn(() => order.push("content-controller")),
  };
  const registry = new WindowContentRegistry();
  registry.register({ typeId: "notes", create: () => content });
  const responders = loggingResponders(runtime.responders, order);
  const record = serialisableWindowRecord(runtime.runtimeId, options.systemWindow ? {
    applicationId: null,
    applicationSessionId: null,
    documentId: null,
    documentAssociationRole: null,
    representedDocument: null,
    content: Object.freeze({ rendererId: "notes", parameters: null }),
  } : {});
  const controller = new WindowController(record, {
    responders,
    contentRegistry: registry,
    parentResponderId: options.systemWindow ? "workspace" : "application:session-1",
    workspaceResponderId: "workspace",
    webspringResponderId: "webspring",
    runtimeResponderId: "runtime",
  });
  return {
    runtime,
    order,
    content,
    registry,
    controller,
    record,
    appHandle,
    cleanup: async () => {
      controller.dispose("runtime-dispose");
      registry.dispose();
      appHandle?.dispose({ cascade: true });
      await runtime.dispose("window-controller-test");
    },
  };
}

describe("WindowController", () => {
  it("rolls every content and responder acquisition back when loading fails", async () => {
    const f = fixture({ failLoad: true });
    const before = f.controller.record;
    const idsBefore = f.runtime.responders.inspect().registrations.map(({ id }) => id);

    await expect(f.controller.loadContent(new AbortController().signal)).rejects.toThrow("content failed");

    expect(f.controller.record).toBe(before);
    expect(f.controller.contentState).toEqual({ status: "unloaded" });
    expect(f.content.unload).toHaveBeenCalledWith("load-rollback");
    expect(f.content.dispose).toHaveBeenCalledOnce();
    expect(f.runtime.responders.inspect().registrations.map(({ id }) => id)).toEqual(idsBefore);
    expect(f.order).toEqual([
      "unload:load-rollback",
      "content-responder",
      "document-responder",
      "window-responder",
      "content-controller",
    ]);
    await f.cleanup();
  });

  it("establishes the exact application/document responder chain and reverses it on disposal", async () => {
    const f = fixture();
    await f.controller.loadContent(new AbortController().signal);

    expect(f.controller.contentState).toEqual({
      status: "loaded",
      mountKey: "mount:notes:window-1",
      rootResponderId: "control:notes-editor",
    });
    expect(f.runtime.responders.resolveChain("control:notes-editor").map(({ id }) => id)).toEqual([
      "control:notes-editor",
      "document:document-1:window:window-1",
      "window:window-1",
      "application:session-1",
      "workspace",
      "webspring",
      "runtime",
    ]);

    f.controller.dispose("runtime-dispose");
    f.controller.dispose("runtime-dispose");
    expect(f.order).toEqual([
      "unload:runtime-dispose",
      "content-responder",
      "document-responder",
      "window-responder",
      "content-controller",
    ]);
    await f.cleanup();
  });

  it("parents a non-document system window directly beneath the workspace", async () => {
    const f = fixture({ systemWindow: true });
    await f.controller.loadContent(new AbortController().signal);
    expect(f.runtime.responders.resolveChain("control:notes-editor").map(({ id }) => id)).toEqual([
      "control:notes-editor",
      "window:window-1",
      "workspace",
      "webspring",
      "runtime",
    ]);
    await f.cleanup();
  });
});
