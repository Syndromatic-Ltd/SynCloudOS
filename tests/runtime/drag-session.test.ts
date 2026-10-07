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
import { createDragSessionManager } from "../../src/SynCloudOS/Drag";
import { createRuntimeOwnerToken } from "../../src/SynCloudOS/Runtime/runtimeOwner";
import { authoriseTestRuntime, createTestBundle, createTestRuntime as createRuntime } from "./helpers";

function createTestRuntime(options: Parameters<typeof createRuntime>[0] = {}) {
  return authoriseTestRuntime(createRuntime({
    ...options,
    initialBundles: options.initialBundles ?? [
      createTestBundle({ id: "studio", route: "/studio" }),
      createTestBundle({ id: "publisher", route: "/publisher" }),
      createTestBundle({ id: "one", route: "/one" }),
    ],
  }));
}

function scopedDrag(runtime: ReturnType<typeof createTestRuntime>, appId: "studio" | "publisher" | "one") {
  const applicationResponderId = `application:${appId}`;
  if (!runtime.responders.get(applicationResponderId)) {
    runtime.responders.register({ id: applicationResponderId, kind: "application", parentId: "workspace", scopeId: applicationResponderId });
  }
  const scope = runtime.transfers.mountApp(runtime.apps.getApp(appId)!, { responderId: applicationResponderId }).scope;
  return Object.freeze({
    scope,
    manager: scope.drag.manager,
    endpoint: (responderId: string) => {
      const ownedResponderId = `${appId}:${responderId}`;
      if (!runtime.responders.get(ownedResponderId)) {
        runtime.responders.register({ id: ownedResponderId, kind: "view", parentId: applicationResponderId, scopeId: applicationResponderId });
      }
      return scope.drag.endpoint({ responderId: ownedResponderId });
    },
  });
}

describe("runtime drag sessions", () => {
  it("chooses the first destination operation shared with source and policy", async () => {
    const runtime = createTestRuntime({ id: "runtime:drag:negotiation" });
    const authorise = vi.fn(async ({ operation }: { operation: string }, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return operation === "copy";
    });
    const manager = createDragSessionManager({
      runtimeId: runtime.runtimeId,
      ownerToken: createRuntimeOwnerToken(),
      signal: new AbortController().signal,
      pasteboard: runtime.pasteboards.drag,
      randomUUID: () => "drag-1",
      authorise,
    });
    const session = manager.begin({
      source: { appId: "studio", windowId: "studio-main", responderId: "assets" },
      representations: [{ type: "text/plain", value: "cloud" }],
      operations: ["move", "copy"],
    });

    const result = await manager.updateDestination(session.id, {
      endpoint: { appId: "publisher", windowId: "publisher-main", responderId: "editor" },
      operations: ["copy", "link"],
    });

    expect(result.operation).toBe("copy");
    expect(result.representations).toEqual([{ type: "text/plain", value: "cloud" }]);
    expect(authorise).toHaveBeenCalledTimes(1);
  });

  it("clears a session and payload when terminal authorisation rejects", async () => {
    const runtime = createTestRuntime({ id: "runtime:drag:authorisation-error" });
    let rejectAuthorisation!: (error: Error) => void;
    const authorisation = new Promise<boolean>((_resolve, reject) => { rejectAuthorisation = reject; });
    const manager = createDragSessionManager({
      runtimeId: runtime.runtimeId,
      ownerToken: createRuntimeOwnerToken(),
      signal: new AbortController().signal,
      pasteboard: runtime.pasteboards.drag,
      randomUUID: () => "drag-authorisation-error",
      authorise: () => authorisation,
    });
    const session = manager.begin({
      source: { appId: "source", windowId: "window", responderId: "row" },
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });

    const update = manager.updateDestination(session.id, {
      endpoint: { appId: "target", windowId: "window", responderId: "drop" },
      operations: ["copy"],
    });
    rejectAuthorisation(new Error("policy service unavailable"));
    await expect(update).rejects.toThrow("policy service unavailable");
    expect(manager.snapshot().active).toBeNull();
    expect(runtime.pasteboards.drag.snapshot()).toEqual([]);
    await runtime.dispose("drag authorisation error test");
  });

  it("makes a cancelled late validation and drop inert", async () => {
    const runtime = createTestRuntime({ id: "runtime:drag:fence" });
    let settle!: (allowed: boolean) => void;
    let entered!: () => void;
    const authoriseEntered = new Promise<void>((resolve) => { entered = resolve; });
    const manager = createDragSessionManager({
      runtimeId: runtime.runtimeId,
      ownerToken: createRuntimeOwnerToken(),
      signal: new AbortController().signal,
      pasteboard: runtime.pasteboards.drag,
      randomUUID: () => "drag-2",
      authorise: (_request, signal) => new Promise<boolean>((resolve) => {
        entered();
        signal.addEventListener("abort", () => resolve(true), { once: true });
        settle = resolve;
      }),
    });
    const session = manager.begin({
      source: { appId: "source", windowId: "one", responderId: "row" },
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    const update = manager.updateDestination(session.id, {
      endpoint: { appId: "target", windowId: "two", responderId: "row" },
      operations: ["copy"],
    });
    await authoriseEntered;
    manager.cancel(session.id, "owner closed");
    settle(true);

    await expect(update).rejects.toMatchObject({ name: "AbortError" });
    expect(manager.snapshot().active).toBeNull();
  });

  it("is isolated and disposed with its owning runtime", async () => {
    const first = createTestRuntime({ id: "runtime:drag:first" });
    const second = createTestRuntime({ id: "runtime:drag:second" });
    const firstDrag = scopedDrag(first, "one");
    expect(first.drag).not.toBe(second.drag);
    firstDrag.manager.begin({
      source: firstDrag.endpoint("one"),
      representations: [{ type: "text/plain", value: "one" }],
      operations: ["copy"],
    });
    await first.dispose("drag test");
    expect(first.drag.snapshot().active).toBeNull();
    expect(second.drag.snapshot().active).toBeNull();
  });

  it("denies by default and includes exact transfer authority fields", async () => {
    const runtime = createTestRuntime({ id: "runtime:drag:default-deny" });
    const manager = createDragSessionManager({
      runtimeId: runtime.runtimeId,
      ownerToken: createRuntimeOwnerToken(),
      signal: new AbortController().signal,
      pasteboard: runtime.pasteboards.drag,
      randomUUID: () => "drag-denied",
    });
    const session = manager.begin({
      source: { appId: "source", windowId: "source-window", responderId: "source-row" },
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    const result = await manager.updateDestination(session.id, {
      endpoint: { appId: "target", windowId: "target-window", responderId: "target-row" },
      operations: ["copy"],
    });
    expect(result.operation).toBe("none");
  });

  it("rechecks policy with MIME, origin and capability at the commit boundary", async () => {
    const runtime = createTestRuntime({ id: "runtime:drag:commit-policy" });
    const accept = vi.fn();
    const authorise = vi.fn(async (request: { phase: string; capability: string; representationTypes: readonly string[] }) => {
      expect(request.capability).toBe("transfer.cross-application");
      expect(request.representationTypes).toEqual(["text/plain"]);
      return request.phase === "negotiate";
    });
    const manager = createDragSessionManager({
      runtimeId: runtime.runtimeId,
      ownerToken: createRuntimeOwnerToken(),
      signal: new AbortController().signal,
      pasteboard: runtime.pasteboards.drag,
      randomUUID: () => "drag-recheck",
      authorise,
    });
    const session = manager.begin({
      source: { appId: "source", windowId: "one", responderId: "source" },
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    await manager.updateDestination(session.id, {
      endpoint: { appId: "target", windowId: "two", responderId: "target" },
      operations: ["copy"],
      accept,
    });

    await expect(manager.performDrop(session.id)).resolves.toEqual({ accepted: false, operation: "none" });
    expect(accept).not.toHaveBeenCalled();
    expect(authorise).toHaveBeenCalledTimes(2);
    expect(authorise.mock.calls[0]![0]).toMatchObject({ phase: "negotiate", origin: "drag" });
    expect(authorise.mock.calls[1]![0]).toMatchObject({ phase: "commit", origin: "drag" });
  });

  it("rejects accessor-backed and sparse session descriptors without executing them", () => {
    const runtime = createTestRuntime({ id: "runtime:drag:hostile-begin" });
    const manager = createDragSessionManager({
      runtimeId: runtime.runtimeId,
      ownerToken: createRuntimeOwnerToken(),
      signal: new AbortController().signal,
      pasteboard: runtime.pasteboards.drag,
      randomUUID: () => "drag-hostile",
    });
    const endpointGetter = vi.fn(() => "source");
    const source = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(source, "appId", { enumerable: true, get: endpointGetter });
    Object.defineProperties(source, {
      windowId: { enumerable: true, value: "window" },
      responderId: { enumerable: true, value: "responder" },
    });

    expect(() => manager.begin({
      source: source as never,
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    })).toThrow(/data propert|descriptor/i);
    expect(endpointGetter).not.toHaveBeenCalled();

    const operations = Array(1) as unknown as ["copy"];
    expect(() => manager.begin({
      source: { appId: "source", windowId: "window", responderId: "responder" },
      representations: [{ type: "text/plain", value: "payload" }],
      operations,
    })).toThrow(/dense|operation/i);
  });

  it("rejects accessor-backed destination requests without executing them", async () => {
    const runtime = createTestRuntime({ id: "runtime:drag:hostile-destination" });
    const manager = createDragSessionManager({
      runtimeId: runtime.runtimeId,
      ownerToken: createRuntimeOwnerToken(),
      signal: new AbortController().signal,
      pasteboard: runtime.pasteboards.drag,
      randomUUID: () => "drag-hostile-destination",
      authorise: () => true,
    });
    const session = manager.begin({
      source: { appId: "source", windowId: "window", responderId: "responder" },
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    const endpointGetter = vi.fn(() => ({ appId: "target", windowId: "window", responderId: "target" }));
    const request = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(request, "endpoint", { enumerable: true, get: endpointGetter });
    Object.defineProperty(request, "operations", { enumerable: true, value: ["copy"] });

    await expect(manager.updateDestination(session.id, request as never)).rejects.toThrow(/data propert|descriptor/i);
    expect(endpointGetter).not.toHaveBeenCalled();
  });

  it("keeps the authoritative session when a replacement fails validation", () => {
    const runtime = createTestRuntime({ id: "runtime:drag:failure-atomic" });
    const manager = createDragSessionManager({
      runtimeId: runtime.runtimeId,
      ownerToken: createRuntimeOwnerToken(),
      signal: new AbortController().signal,
      pasteboard: runtime.pasteboards.drag,
      randomUUID: () => "drag-authoritative",
    });
    const authoritative = manager.begin({
      source: { appId: "source", windowId: "window", responderId: "responder" },
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });

    expect(() => manager.begin({
      source: { appId: "source", windowId: "window", responderId: "responder" },
      representations: [{ type: "application/pdf" as never, value: "unsupported" }],
      operations: ["copy"],
    })).toThrow(/unsupported pasteboard/i);
    expect(manager.snapshot().active?.id).toBe(authoritative.id);
  });

  it("allows explicit same-app runtime transfer but denies cross-app transfer without capability", async () => {
    const runtime = createTestRuntime({ id: "runtime:drag:policy-integration" });
    const studio = scopedDrag(runtime, "studio");
    const publisher = scopedDrag(runtime, "publisher");
    const sameApp = studio.manager.begin({
      source: studio.endpoint("assets"),
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    await expect(studio.manager.updateDestination(sameApp.id, {
      endpoint: studio.endpoint("editor"),
      operations: ["copy"],
    })).resolves.toMatchObject({ operation: "copy" });

    const crossApp = studio.manager.begin({
      source: studio.endpoint("assets"),
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    await expect(studio.manager.updateDestination(crossApp.id, {
      endpoint: publisher.endpoint("editor"),
      operations: ["copy"],
    })).resolves.toMatchObject({ operation: "none" });
  });

  it("keeps the ordinary runtime factory deny-by-default for cross-application transfer", async () => {
    const runtime = createTestRuntime({ id: "runtime:drag:factory-default-deny" });
    const studio = scopedDrag(runtime, "studio");
    const publisher = scopedDrag(runtime, "publisher");
    const session = studio.manager.begin({
      source: studio.endpoint("assets"),
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });

    await expect(studio.manager.updateDestination(session.id, {
      endpoint: publisher.endpoint("editor"),
      operations: ["copy"],
    })).resolves.toMatchObject({ operation: "none" });
  });

  it("binds an explicit cross-app grant to the exact session lease and rechecks revocation at commit", async () => {
    let allowed = true;
    const requests: Array<Record<string, unknown>> = [];
    const runtime = createTestRuntime({
      id: "runtime:drag:leased-authorisation",
      dragAuthorisation: {
        authorise: (request, signal) => {
          signal.throwIfAborted();
          requests.push(request as unknown as Record<string, unknown>);
          return allowed;
        },
      },
    });
    runtime.store.mutate((draft) => { draft.loginServices.accessClass = "team"; });
    const accept = vi.fn();
    const studio = scopedDrag(runtime, "studio");
    const publisher = scopedDrag(runtime, "publisher");
    const session = studio.manager.begin({
      source: studio.endpoint("assets"),
      representations: [{ type: "application/x-syncloudos-fixture", value: { ids: ["one"] } }],
      operations: ["copy"],
    });

    await expect(studio.manager.updateDestination(session.id, {
      endpoint: publisher.endpoint("editor"),
      operations: ["copy"],
      accept,
    })).resolves.toMatchObject({ operation: "copy" });

    expect(requests[0]).toMatchObject({
      phase: "negotiate",
      sessionId: session.id,
      source: { appId: "studio", windowId: "application:studio", responderId: "studio:assets" },
      destination: { appId: "publisher", windowId: "application:publisher", responderId: "publisher:editor" },
      operation: "copy",
      representationTypes: ["application/x-syncloudos-fixture"],
      capability: "transfer.cross-application",
    });
    expect(requests[0]?.leaseId).toEqual(expect.any(String));
    expect(requests[0]?.generation).toEqual(expect.any(Number));

    allowed = false;
    await expect(studio.manager.performDrop(session.id)).resolves.toEqual({ accepted: false, operation: "none" });
    expect(accept).not.toHaveBeenCalled();
    expect(requests[1]).toMatchObject({
      phase: "commit",
      sessionId: session.id,
      leaseId: requests[0]?.leaseId,
      generation: requests[0]?.generation,
    });
  });

  it("keeps session payload ownership inside the active dropping lease", async () => {
    const first = createTestRuntime({ id: "runtime:drag:payload-first" });
    const second = createTestRuntime({ id: "runtime:drag:payload-second" });
    const firstDrag = scopedDrag(first, "studio");
    const secondDrag = scopedDrag(second, "studio");
    const manager = firstDrag.manager;
    const session = manager.begin({
      source: firstDrag.endpoint("source"),
      representations: [{ type: "text/plain", value: "authoritative" }],
      operations: ["copy"],
    });
    await manager.updateDestination(session.id, {
      endpoint: firstDrag.endpoint("target"),
      operations: ["copy"],
      accept: (dropping, signal) => {
        expect(() => manager.readPayload(dropping.id, ["text/plain"], new AbortController().signal)).toThrow(/lease/i);
        expect(manager.readPayload(dropping.id, ["text/plain"], signal)).toEqual([
          { type: "text/plain", value: "authoritative" },
        ]);
        return true;
      },
    });
    await expect(firstDrag.scope.pasteboards.drag.write([{ type: "text/plain", value: "overwritten" }]))
      .rejects.toMatchObject({ name: "SecurityError" });
    manager.claimDrop(session.id);
    await expect(manager.performDrop(session.id)).resolves.toMatchObject({ accepted: true });

    expect(() => secondDrag.manager.readPayload(session.id, ["text/plain"], new AbortController().signal)).toThrow(/authoritative|session|lease/i);
  });

  it("routes same-app and cross-app negotiation through PolicyKit allow/deny", async () => {
    const runtime = createTestRuntime({ id: "runtime:drag:policykit", dragAuthorisation: { authorise: () => true } });
    const studio = scopedDrag(runtime, "studio");
    const publisher = scopedDrag(runtime, "publisher");
    const authorise = vi.spyOn(runtime.policy, "authorise");

    const sameApp = studio.manager.begin({
      source: studio.endpoint("assets"),
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    await expect(studio.manager.updateDestination(sameApp.id, {
      endpoint: studio.endpoint("editor"),
      operations: ["copy"],
    })).resolves.toMatchObject({ operation: "copy" });
    expect(authorise).toHaveBeenCalled();
    expect(authorise.mock.calls.some(([request]) =>
      request.action === "transfer.negotiate"
      && request.requiredCapabilities?.includes("transfer.same-application"),
    )).toBe(true);

    runtime.policy.registerPolicy("deny-studio", (request, decision) =>
      request.app?.id === "studio" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );
    const deniedSame = studio.manager.begin({
      source: studio.endpoint("assets"),
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    await expect(studio.manager.updateDestination(deniedSame.id, {
      endpoint: studio.endpoint("editor"),
      operations: ["copy"],
    })).rejects.toMatchObject({ name: "SecurityError" });
    expect(runtime.policy.removePolicy("deny-studio")).toBe(true);

    runtime.store.mutate((draft) => { draft.loginServices.accessClass = "team"; });
    const authorisedCross = studio.manager.begin({
      source: studio.endpoint("assets"),
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    await expect(studio.manager.updateDestination(authorisedCross.id, {
      endpoint: publisher.endpoint("editor"),
      operations: ["copy"],
    })).resolves.toMatchObject({ operation: "copy" });
    expect(authorise.mock.calls.some(([request]) =>
      request.action === "transfer.negotiate"
      && request.requiredCapabilities?.includes("transfer.cross-application"),
    )).toBe(true);

    runtime.policy.registerPolicy("deny-publisher", (request, decision) =>
      request.action === "transfer.negotiate" && request.app?.id === "publisher"
        ? { ...decision, allowed: false, decision: "deny" }
        : decision,
    );
    const destinationDenied = studio.manager.begin({
      source: studio.endpoint("assets"),
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    await expect(studio.manager.updateDestination(destinationDenied.id, {
      endpoint: publisher.endpoint("editor"),
      operations: ["copy"],
    })).resolves.toMatchObject({ operation: "none" });
  });

  it("does not let a parallel dragAuthorisation port bypass a PolicyKit denial", async () => {
    const runtime = createTestRuntime({
      id: "runtime:drag:policykit-no-bypass",
      dragAuthorisation: { authorise: () => true },
    });
    runtime.policy.registerPolicy("deny-publisher", (request, decision) =>
      request.app?.id === "publisher" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );
    const studio = scopedDrag(runtime, "studio");
    const publisher = scopedDrag(runtime, "publisher");
    const session = studio.manager.begin({
      source: studio.endpoint("assets"),
      representations: [{ type: "text/plain", value: "payload" }],
      operations: ["copy"],
    });
    await expect(studio.manager.updateDestination(session.id, {
      endpoint: publisher.endpoint("editor"),
      operations: ["copy"],
    })).resolves.toMatchObject({ operation: "none" });
  });
});
