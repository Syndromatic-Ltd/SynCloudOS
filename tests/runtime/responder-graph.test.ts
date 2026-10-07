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

import { describe, expect, it } from "vitest";
import { ResponderGraphError } from "../../src/SynCloudOS/Responders";
import { createTestRuntime } from "./helpers";

describe("ResponderGraph", () => {
  it("resolves the complete active chain exactly once", () => {
    const runtime = createTestRuntime({ id: "runtime:graph" });
    expect(runtime.responders.get("webspring")).toMatchObject({ parentId: "runtime", kind: "webspring" });
    expect(runtime.responders.get("workspace")).toMatchObject({ parentId: "webspring", kind: "workspace" });
    runtime.responders.register({ id: "app:studio", kind: "application", parentId: "workspace", scopeId: "app:studio" });
    runtime.responders.register({ id: "window:studio", kind: "window", parentId: "app:studio", scopeId: "window:studio" });
    runtime.responders.register({ id: "document:one", kind: "document", parentId: "window:studio", scopeId: "window:studio" });
    runtime.responders.register({ id: "editor:one", kind: "control", parentId: "document:one", scopeId: "window:studio" });
    runtime.focus.setActiveAnchors({
      documentResponderId: "document:one",
      windowResponderId: "window:studio",
      applicationResponderId: "app:studio",
      workspaceResponderId: "workspace",
      webspringResponderId: "webspring",
      runtimeResponderId: "runtime",
    });
    runtime.focus.requestFocus("editor:one");

    expect(runtime.responders.resolveChain().map(({ id }) => id)).toEqual([
      "editor:one", "document:one", "window:studio", "app:studio", "workspace", "webspring", "runtime",
    ]);
    expect(runtime.responders.inspect().diagnostics).toEqual([]);
  });

  it("rejects cycles, cross-runtime records, duplicate IDs, and unsafe parent removal", () => {
    const runtime = createTestRuntime({ id: "runtime:guard" });
    runtime.responders.register({ id: "a", kind: "view", parentId: "b", scopeId: "root" });
    expect(() => runtime.responders.register({ id: "b", kind: "view", parentId: "a", scopeId: "root" })).toThrow(ResponderGraphError);
    expect(() => runtime.responders.register({ id: "a", kind: "view", scopeId: "root" })).toThrow(ResponderGraphError);
    expect(() => runtime.responders.register({ id: "foreign", runtimeId: "runtime:other" as never, kind: "view", scopeId: "root" })).toThrow(ResponderGraphError);
    const parent = runtime.responders.register({ id: "parent", kind: "view", scopeId: "root" });
    runtime.responders.register({ id: "child", kind: "control", parentId: "parent", scopeId: "root" });
    expect(() => parent.dispose()).toThrow(ResponderGraphError);
    expect(parent.dispose({ cascade: true })).toBe(true);
    expect(runtime.responders.has("child")).toBe(false);
  });

  it("omits disabled responders, removes stale focus, and deduplicates anchors", () => {
    const runtime = createTestRuntime();
    let enabled = true;
    const app = runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    runtime.responders.register({ id: "control", kind: "control", parentId: "app", scopeId: "root", enabled: () => enabled });
    runtime.focus.setActiveAnchors({ applicationResponderId: "app", runtimeResponderId: "runtime" });
    runtime.focus.requestFocus("control");
    expect(runtime.responders.resolveChain().map(({ id }) => id)).toEqual(["control", "app", "runtime"]);
    enabled = false;
    expect(runtime.responders.resolveChain().map(({ id }) => id)).toEqual(["app", "runtime"]);
    app.dispose({ cascade: true });
    expect(runtime.focus.getFocusedResponderId()).toBe("runtime");
  });

  it("defers responder subscriber notifications until insertion effects have finished", async () => {
    const runtime = createTestRuntime({ id: "runtime:notification-boundary" });
    const notifications: number[] = [];
    runtime.responders.subscribe(() => notifications.push(runtime.responders.generation));

    const registration = runtime.responders.register({ id: "application:notification-boundary", kind: "application", parentId: "runtime", scopeId: "root" });
    expect(notifications).toEqual([]);

    await Promise.resolve();
    expect(notifications).toHaveLength(1);

    registration.dispose();
    expect(notifications).toHaveLength(1);
    await Promise.resolve();
    expect(notifications).toHaveLength(2);
  });

  it("does not let a stale registration handle remove a newer same-id responder generation", () => {
    const runtime = createTestRuntime({ id: "runtime:stale-responder-handle" });
    const first = runtime.responders.register({
      id: "application:studio",
      kind: "application",
      parentId: "runtime",
      scopeId: "application:studio",
    });
    const firstToken = runtime.responders.getRegistrationToken(first.id);
    expect(firstToken).not.toBeNull();

    expect(runtime.responders.remove(first.id, { cascade: true })).toBe(true);
    const second = runtime.responders.register({
      id: "application:studio",
      kind: "application",
      parentId: "runtime",
      scopeId: "application:studio",
    });
    const secondToken = runtime.responders.getRegistrationToken(second.id);
    expect(secondToken).not.toBeNull();
    expect(secondToken).not.toEqual(firstToken);
    const generationBeforeStaleDispose = runtime.responders.generation;

    expect(first.dispose({ cascade: true })).toBe(false);
    expect(runtime.responders.has(second.id)).toBe(true);
    expect(runtime.responders.getRegistrationToken(second.id)).toEqual(secondToken);
    expect(runtime.responders.generation).toBe(generationBeforeStaleDispose);
    expect(second.dispose({ cascade: true })).toBe(true);
  });
});
