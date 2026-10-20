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

import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeWebContentService, RuntimeWebContentSession } from "../../src/SynCloudOS/WebContent";

import { authoriseTestRuntime, createTestBundle, createTestRuntime } from "./helpers";

const runtimes: Array<ReturnType<typeof createTestRuntime>> = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("transfer authority test cleanup")));
});

function ownedRuntime(id: string, options: Record<string, unknown> = {}) {
  const runtime = authoriseTestRuntime(createTestRuntime({
    id,
    initialBundles: [
      createTestBundle({ bundleIdentifier: "com.example.source", route: "/source" }),
      createTestBundle({ bundleIdentifier: "com.example.destination", route: "/destination" }),
    ],
    ...options,
  } as never));
  runtimes.push(runtime);
  return runtime;
}

function registeredScope(runtime: ReturnType<typeof ownedRuntime>, appId: "com.example.source" | "com.example.destination") {
  const responderId = `application:${appId}`;
  if (!runtime.responders.get(responderId)) {
    runtime.responders.register({
      id: responderId,
      kind: "application",
      parentId: "workspace",
      scopeId: responderId,
    });
  }
  return runtime.transfers.mountApp(runtime.apps.getApp(appId)!, { responderId }).scope;
}

describe("runtime-issued transfer authority", () => {
  it("settles non-cooperative pending web creation on mount disposal and disposes a late session once", async () => {
    const runtime = ownedRuntime("runtime:transfer-authority:web-pending");
    const app = runtime.apps.getApp("com.example.source")!;
    const responderId = "application:com.example.source";
    runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
    let releaseCreated!: (session: RuntimeWebContentSession) => void;
    const created = new Promise<RuntimeWebContentSession>((resolve) => { releaseCreated = resolve; });
    const disposed = vi.fn();
    const lateSession = {
      id: "late-session",
      getSnapshot: () => ({ id: "late-session", title: "Late", state: "loading", navigationEpoch: 1, navigationId: "navigation:late", frameSource: "https://late.example", expectedOrigin: "https://late.example", sandbox: "" }),
      subscribe: () => () => undefined,
      bindFrame: () => undefined,
      didLoad: () => undefined,
      didFail: () => undefined,
      navigate: async () => false,
      postMessage: async () => false,
      openExternal: async () => false,
      dispose: disposed,
    } as unknown as RuntimeWebContentSession;
    const never = new Promise<RuntimeWebContentSession>(() => undefined);
    const createSession = vi.fn()
      .mockReturnValueOnce(never)
      .mockReturnValueOnce(created);
    const fakeService = {
      runtimeId: runtime.runtimeId,
      createSession,
      get: () => null,
      suspendOwner: () => undefined,
      resumeOwner: () => undefined,
      closeOwner: () => undefined,
      closeWindowController: () => undefined,
      diagnostics: () => ({ sessionCount: 0, listenerCount: 0, objectURLCount: 0, frameCount: 0, pendingOperationCount: 0 }),
      dispose: () => undefined,
    } as unknown as RuntimeWebContentService;
    const transfers = (runtime as unknown as { readonly transfers: any }).transfers;
    transfers.bindWebContent(fakeService);

    const first = transfers.mountApp(app, { responderId });
    const neverSettling = first.scope.webContent.createSession({ title: "Never", source: { kind: "url", url: "https://late.example" }, capabilities: [] });
    first.dispose();
    await expect(neverSettling).rejects.toMatchObject({ name: "SecurityError" });

    const second = transfers.mountApp(app, { responderId });
    const late = second.scope.webContent.createSession({ title: "Late", source: { kind: "url", url: "https://late.example" }, capabilities: [] });
    second.dispose();
    releaseCreated(lateSession);
    await expect(late).rejects.toMatchObject({ name: "SecurityError" });
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledTimes(2);
  });

  it("requires a responder-bound canonical app scope and activates it only when that responder is live", async () => {
    const runtime = ownedRuntime("runtime:transfer-authority:responder-bound");
    const app = runtime.apps.getApp("com.example.source")!;
    const transfers = runtime.transfers;
    const getter = vi.fn(() => "com.example.source");
    const forged = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(forged, "bundleIdentifier", { enumerable: true, get: getter });

    expect(() => transfers.mountApp(app, undefined as never)).toThrow(/responder/i);
    expect(() => transfers.mountApp(forged as never, { responderId: "application:com.example.source" })).toThrow(/canonical|registered|application/i);
    expect(getter).not.toHaveBeenCalled();

    const mount = transfers.mountApp(app, { responderId: "application:com.example.source" });
    const scope = mount.scope;
    await expect(scope.pasteboards.find.write([{ type: "text/plain", value: "before responder registration" }]))
      .rejects.toMatchObject({ name: "SecurityError" });

    runtime.responders.register({
      id: "application:com.example.source",
      kind: "application",
      parentId: "workspace",
      scopeId: "application:com.example.source",
    });
    await expect(scope.pasteboards.find.write([{ type: "text/plain", value: "after responder registration" }])).resolves.toBeUndefined();
    mount.dispose();
  });

  it("revokes a mounted scope generation permanently across StrictMode cleanup and same-ID responder replacement", async () => {
    const runtime = ownedRuntime("runtime:transfer-authority:mount-generation");
    const app = runtime.apps.getApp("com.example.source")!;
    const responderId = "application:com.example.source";
    const responder = runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });

    const firstMount = runtime.transfers.mountApp(app, { responderId });
    const manager = firstMount.scope.drag.manager;
    const endpoint = firstMount.scope.drag.endpoint();
    const ownerToken = manager.ownerToken;
    await expect(firstMount.scope.pasteboards.find.write([{ type: "text/plain", value: "first mount" }])).resolves.toBeUndefined();

    // React StrictMode and an actual unmount both run cleanup before a fresh
    // mount. Re-registering the deterministic responder id must never revive
    // the old authority by coincidence.
    responder.dispose({ cascade: true });
    firstMount.dispose();
    expect(firstMount.signal.aborted).toBe(true);
    expect(manager.runtimeId).toBe(runtime.runtimeId);
    expect(manager.ownerToken).toBe(ownerToken);
    runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
    await expect(firstMount.scope.pasteboards.find.write([{ type: "text/plain", value: "stale mount" }]))
      .rejects.toMatchObject({ name: "SecurityError" });
    expect(() => manager.begin({
      source: endpoint,
      representations: [{ type: "text/plain", value: "stale" }],
      operations: ["copy"],
    })).toThrow(/authority|scope|security/i);

    const secondMount = runtime.transfers.mountApp(app, { responderId });
    await expect(secondMount.scope.pasteboards.find.write([{ type: "text/plain", value: "fresh mount" }])).resolves.toBeUndefined();
    secondMount.dispose();
  });

  it("issues opaque live app scopes and rejects forged or foreign endpoint provenance", async () => {
    const runtime = ownedRuntime("runtime:transfer-authority");
    const source = registeredScope(runtime, "com.example.source");
    const destination = registeredScope(runtime, "com.example.destination");
    runtime.store.mutate((draft) => { draft.loginServices.accessClass = "team"; });

    expect(Reflect.get(runtime.pasteboards, "forApp")).toBeUndefined();

    await source.pasteboards.find.write([{ type: "text/plain", value: "owned" }]);
    await expect(source.pasteboards.find.snapshot()).resolves.toEqual([{ type: "text/plain", value: "owned" }]);
    await source.pasteboards.find.clear();
    await expect(source.pasteboards.find.snapshot()).resolves.toEqual([]);
    const pasteboardAudit = (runtime.policy as typeof runtime.policy & { getAuditLog(limit?: number): readonly unknown[] }).getAuditLog(24);
    expect(pasteboardAudit).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "pasteboard.read",
        appId: "com.example.source",
        contextSummary: expect.objectContaining({ values: expect.objectContaining({ operation: "snapshot", responderId: "application:com.example.source" }) }),
      }),
      expect.objectContaining({
        action: "pasteboard.write",
        appId: "com.example.source",
        contextSummary: expect.objectContaining({ values: expect.objectContaining({ operation: "clear", responderId: "application:com.example.source" }) }),
      }),
    ]));

    const privateBoard = source.pasteboards.named("app:com.example.source");
    await privateBoard.write([{ type: "text/plain", value: "source private value" }]);
    expect(() => destination.pasteboards.named("app:com.example.source")).toThrow(/denied/i);
    await expect(privateBoard.snapshot()).resolves.toEqual([{ type: "text/plain", value: "source private value" }]);
    await expect(source.pasteboards.drag.clear()).rejects.toMatchObject({ name: "SecurityError" });

    const sourceEndpoint = source.drag.endpoint();
    const destinationEndpoint = destination.drag.endpoint();
    const unregisteredEndpoint = source.drag.endpoint({ responderId: "source:forged-control" });
    expect(() => source.drag.manager.begin({
      source: unregisteredEndpoint,
      representations: [{ type: "text/plain", value: "forged responder" }],
      operations: ["copy"],
    }))
      .toThrow(/responder|scope|authority|security/i);
    const forged = { ...sourceEndpoint };
    expect(() => source.drag.manager.begin({
      source: forged,
      representations: [{ type: "text/plain", value: "forged" }],
      operations: ["copy"],
    })).toThrow(/authority|lease|security/i);

    const first = source.drag.manager.begin({
      source: sourceEndpoint,
      representations: [{ type: "text/plain", value: "owned" }],
      operations: ["copy"],
    });
    await expect(source.drag.manager.updateDestination(first.id, {
      endpoint: destinationEndpoint,
      operations: ["copy"],
    })).resolves.toMatchObject({ operation: "none" });

    const otherRuntime = ownedRuntime("runtime:transfer-authority:foreign");
    const foreignScope = registeredScope(otherRuntime, "com.example.destination");
    expect(() => source.drag.manager.begin({
      source: foreignScope.drag.endpoint(),
      representations: [{ type: "text/plain", value: "foreign" }],
      operations: ["copy"],
    })).toThrow(/authority|lease|security/i);
  });

  it("revokes app transfer authority on closure and does not allow a positive legacy override to replace a missing cross-app port", async () => {
    const runtime = ownedRuntime("runtime:transfer-authority:revoked");
    const source = registeredScope(runtime, "com.example.source");
    const destination = registeredScope(runtime, "com.example.destination");
    runtime.store.mutate((draft) => { draft.loginServices.accessClass = "team"; });
    runtime.policy.registerPolicy("grant-source", (request, decision) =>
      request.app?.bundleIdentifier === "com.example.source" ? { ...decision, allowed: true } : decision,
    );

    const session = source.drag.manager.begin({
      source: source.drag.endpoint(),
      representations: [{ type: "text/plain", value: "cross-app" }],
      operations: ["copy"],
    });
    await expect(source.drag.manager.updateDestination(session.id, {
      endpoint: destination.drag.endpoint(),
      operations: ["copy"],
    })).resolves.toMatchObject({ operation: "none" });

    runtime.store.mutate((draft) => { draft.lifecycle["com.example.source"] = "closed"; });
    await expect(source.pasteboards.find.write([{ type: "text/plain", value: "after-close" }]))
      .rejects.toMatchObject({ name: "SecurityError" });
    expect(() => source.drag.endpoint()).toThrow(/authority|closed|security/i);
  });

  it("allows an employee subject only through the explicit cross-app port and records both endpoint decisions", async () => {
    const authorise = vi.fn(() => true);
    const runtime = ownedRuntime("runtime:transfer-authority:explicit-grant", {
      dragAuthorisation: { authorise },
    });
    runtime.store.mutate((draft) => { draft.loginServices.accessClass = "team"; });
    const source = registeredScope(runtime, "com.example.source");
    const destination = registeredScope(runtime, "com.example.destination");
    const accepted = vi.fn(() => true);

    const session = source.drag.manager.begin({
      source: source.drag.endpoint(),
      representations: [{ type: "text/plain", value: "explicitly-authorised" }],
      operations: ["copy"],
    });
    await expect(source.drag.manager.updateDestination(session.id, {
      endpoint: destination.drag.endpoint(),
      operations: ["copy"],
      accept: accepted,
    })).resolves.toMatchObject({ operation: "copy" });
    source.drag.manager.claimDrop(session.id);
    await expect(source.drag.manager.performDrop(session.id)).resolves.toEqual({ accepted: true, operation: "copy" });

    expect(authorise).toHaveBeenCalledTimes(2);
    const policy = runtime.policy as typeof runtime.policy & { getAuditLog(limit?: number): readonly unknown[] };
    expect(policy.getAuditLog(8)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "transfer.negotiate",
        appId: "com.example.source",
        requiredCapabilities: ["transfer.cross-application"],
        contextSummary: expect.objectContaining({ values: expect.objectContaining({ policyEndpoint: "source" }) }),
      }),
      expect.objectContaining({
        action: "transfer.negotiate",
        appId: "com.example.destination",
        requiredCapabilities: ["transfer.cross-application"],
        contextSummary: expect.objectContaining({ values: expect.objectContaining({ policyEndpoint: "destination" }) }),
      }),
    ]));
  });

  it("makes native source cleanup idempotent after its own committed drag", async () => {
    const runtime = ownedRuntime("runtime:transfer-authority:native-cleanup", {
      dragAuthorisation: { authorise: () => true },
    });
    const source = registeredScope(runtime, "com.example.source");
    const sourceEndpoint = source.drag.endpoint();
    const destinationEndpoint = source.drag.endpoint();
    const session = source.drag.manager.begin({
      source: sourceEndpoint,
      representations: [{ type: "text/plain", value: "native cleanup" }],
      operations: ["copy"],
    });

    await expect(source.drag.manager.updateDestination(session.id, {
      endpoint: destinationEndpoint,
      operations: ["copy"],
      accept: () => true,
    })).resolves.toMatchObject({ operation: "copy" });
    source.drag.manager.claimDrop(session.id);
    await expect(source.drag.manager.performDrop(session.id)).resolves.toEqual({ accepted: true, operation: "copy" });

    // Chromium dispatches the source's dragend after the drop handler has
    // committed. The scoped facade must retain DragSessionManager's no-op
    // cleanup contract without giving this app access to another session.
    expect(source.drag.manager.cancelUnclaimed(session.id, "native drag ended")).toBe(false);
  });
});
