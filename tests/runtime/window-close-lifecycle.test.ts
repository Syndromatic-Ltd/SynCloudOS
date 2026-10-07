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
  InvalidWindowClosePreparationError,
  type WindowClosePreparationToken,
  type WindowContentController,
  type WindowContentDescriptor,
} from "../../src/SynCloudOS/Windows";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";

function loggingContent(log: string[], descriptor: WindowContentDescriptor, id: string): WindowContentController {
  const parameters = descriptor.parameters as { abortDuringPrepare?: boolean } | null;
  return {
    mountKey: `logging:${id}`,
    responderId: `control:${id}:content`,
    load: vi.fn(async () => undefined),
    prepareClose: vi.fn(async (request) => {
      log.push(`prepare:${id}`);
      if (parameters?.abortDuringPrepare) (request.signal as AbortSignal & { abort?: () => void }).abort?.();
      return {
        status: "ready" as const,
        token: `token:${id}`,
        commit: () => log.push(`commit:${id}`),
        rollback: () => log.push(`rollback:${id}`),
      };
    }),
    unload: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("window close transactions", () => {
  it("reserves a close forest across awaits so an overlapping preflight is refused", async () => {
    let releaseFirst!: () => void;
    let markEntered!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    let calls = 0;
    const f = createWindowTestDependencies({
      contentFactory: (_descriptor, id) => ({
        mountKey: `critical:${id}`,
        responderId: `control:${id}:content`,
        load: vi.fn(async () => undefined),
        prepareClose: vi.fn(async () => {
          calls += 1;
          if (calls === 1) {
            markEntered();
            await firstGate;
          }
          return {
            status: "ready" as const,
            token: id,
            commit: vi.fn(),
            rollback: vi.fn(),
          };
        }),
        unload: vi.fn(),
        dispose: vi.fn(),
      }),
    });
    const root = f.manager.create(standardWindow("critical-root"));
    const child = f.manager.create(standardWindow("critical-child", { parentWindowControllerId: root.id }));
    await f.manager.open(root.id);
    await f.manager.open(child.id);

    const first = f.manager.prepareClose(root.id, { reason: "command" });
    await entered;
    const overlapping = await f.manager.prepareClose(child.id, { reason: "command" });
    releaseFirst();
    const prepared = await first;

    expect(overlapping).toEqual({
      status: "refused",
      windowControllerId: "critical-child",
      reason: "blocked",
    });
    expect(calls).toBe(2);
    if (prepared.status === "ready") f.manager.rollbackClose(prepared.token);
    await f.cleanup();
  });

  it("prepares descendants topmost first and rolls ready nodes back in strict reverse order", async () => {
    const log: string[] = [];
    const f = createWindowTestDependencies({ contentFactory: (descriptor, id) => loggingContent(log, descriptor, id) });
    const root = f.manager.create(standardWindow("root"));
    const child = f.manager.create(standardWindow("child", { parentWindowControllerId: root.id }));
    const grandchild = f.manager.create(standardWindow("grandchild", { parentWindowControllerId: child.id }));
    await f.manager.open(root.id);
    await f.manager.open(child.id);
    await f.manager.open(grandchild.id);

    const preparation = await f.manager.prepareClose(root.id, { reason: "parent-close" });
    expect(preparation.status).toBe("ready");
    if (preparation.status !== "ready") throw new Error("Expected ready preparation.");
    expect(preparation.token.preparedWindowControllerIds).toEqual(["grandchild", "child", "root"]);
    f.manager.rollbackClose(preparation.token);
    expect(log).toEqual([
      "prepare:grandchild",
      "prepare:child",
      "prepare:root",
      "rollback:root",
      "rollback:child",
      "rollback:grandchild",
    ]);
    await f.cleanup();
  });

  it("propagates one AbortSignal and reverses already-ready descendants on abort", async () => {
    const log: string[] = [];
    const abort = new AbortController();
    const seenSignals: AbortSignal[] = [];
    const f = createWindowTestDependencies({
      contentFactory: (_descriptor, id) => ({
        ...loggingContent(log, _descriptor, id),
        prepareClose: vi.fn(async (request) => {
          seenSignals.push(request.signal!);
          log.push(`prepare:${id}`);
          if (id === "child") abort.abort(new Error("stop close"));
          return {
            status: "ready" as const,
            token: id,
            commit: vi.fn(),
            rollback: () => log.push(`rollback:${id}`),
          };
        }),
      }),
    });
    const root = f.manager.create(standardWindow("root"));
    const child = f.manager.create(standardWindow("child", { parentWindowControllerId: root.id }));
    const grandchild = f.manager.create(standardWindow("grandchild", { parentWindowControllerId: child.id }));
    await f.manager.open(root.id);
    await f.manager.open(child.id);
    await f.manager.open(grandchild.id);

    await expect(f.manager.prepareClose(root.id, { reason: "parent-close", signal: abort.signal })).resolves.toEqual({
      status: "cancelled",
      windowControllerId: "root",
      reason: "aborted",
    });
    expect(seenSignals.every((signal) => signal === abort.signal)).toBe(true);
    expect(log).toEqual(["prepare:grandchild", "prepare:child", "rollback:child", "rollback:grandchild"]);
    await f.cleanup();
  });

  it("enters document close exactly once for the ordinary last document presentation", async () => {
    const f = createWindowTestDependencies();
    await f.createDocument("last-document");
    const controller = f.manager.create(standardWindow("document-window", {
      documentId: "last-document",
      documentAssociationRole: "primary",
    }));
    await f.manager.open(controller.id);
    f.documents.registerCloseReviewer({ review: vi.fn(async () => "discard") });
    const prepareCloseDocuments = vi.spyOn(f.documents, "prepareCloseDocuments");
    const closeDocument = vi.spyOn(f.documents, "closeDocument");

    await expect(f.manager.requestClose(controller.id, { reason: "control" })).resolves.toEqual({
      outcome: "closed",
      windowControllerId: "document-window",
    });
    expect(prepareCloseDocuments).toHaveBeenCalledOnce();
    expect(prepareCloseDocuments).toHaveBeenCalledWith(
      ["last-document"],
      "window-control",
      undefined,
      ["document-window"],
    );
    expect(closeDocument).not.toHaveBeenCalled();
    expect(f.documents.getDocument("last-document")).toBeNull();
    expect(f.manager.list()).toEqual([]);
    await f.cleanup();
  });

  it("closes every presentation tree in one document transaction", async () => {
    const log: string[] = [];
    const f = createWindowTestDependencies({ contentFactory: (descriptor, id) => loggingContent(log, descriptor, id) });
    await f.createDocument("multi-presentation");
    f.documents.registerCloseReviewer({ review: vi.fn(async () => "discard") });
    const primary = f.manager.create(standardWindow("multi-primary", {
      documentId: "multi-presentation",
      documentAssociationRole: "primary",
    }));
    const inspector = f.manager.create(standardWindow("multi-inspector", {
      documentId: "multi-presentation",
      documentAssociationRole: "inspector",
    }));
    await f.manager.open(primary.id);
    await f.manager.open(inspector.id);

    await expect(f.documents.closeDocument("multi-presentation", "application-quit")).resolves.toEqual({
      outcome: "closed",
      documentId: "multi-presentation",
    });
    expect(log).toEqual([
      "prepare:multi-primary",
      "prepare:multi-inspector",
      "commit:multi-primary",
      "commit:multi-inspector",
    ]);
    expect(f.manager.list()).toEqual([]);
    expect(f.documents.getDocument("multi-presentation")).toBeNull();
    await f.cleanup();
  });

  it("rejects foreign, forged, rolled-back and reused close tokens before mutation", async () => {
    const first = createWindowTestDependencies({ id: "runtime:tokens:first" });
    const second = createWindowTestDependencies({ id: "runtime:tokens:second" });
    const controller = first.manager.create(standardWindow("token-window"));
    await first.manager.open(controller.id);
    const prepared = await first.manager.prepareClose(controller.id, { reason: "command" });
    if (prepared.status !== "ready") throw new Error("Expected ready close token.");

    expect(() => second.manager.commitClose(prepared.token)).toThrow(InvalidWindowClosePreparationError);
    const forged = { ...prepared.token } as WindowClosePreparationToken;
    expect(() => first.manager.commitClose(forged)).toThrow(InvalidWindowClosePreparationError);
    first.manager.rollbackClose(prepared.token);
    expect(() => first.manager.rollbackClose(prepared.token)).toThrow(InvalidWindowClosePreparationError);

    const next = await first.manager.prepareClose(controller.id, { reason: "command" });
    if (next.status !== "ready") throw new Error("Expected second close token.");
    first.manager.commitClose(next.token);
    expect(() => first.manager.commitClose(next.token)).toThrow(InvalidWindowClosePreparationError);
    await first.cleanup();
    await second.cleanup();
  });
});
