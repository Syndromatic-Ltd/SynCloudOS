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

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const runtimes: Array<ReturnType<typeof createTestRuntime>> = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("test cleanup")));
});

function fixture(id = "repair-4-command", browserProxyFallback = false) {
  const environment = createTestRuntimeEnvironment({
    proxyBrandProbe: browserProxyFallback ? "omit" : "host",
  });
  if (browserProxyFallback) {
    expect("isNativeProxy" in environment).toBe(false);
    expect(Object.hasOwn(environment, "isNativeProxy")).toBe(false);
  }
  const runtime = createTestRuntime({
    initialBundles: [createTestBundle({ id, route: `/${id}` })],
    environment,
  });
  runtimes.push(runtime);
  const app = runtime.apps.getApp(id)!;
  const responderId = `application:${id}`;
  if (!runtime.responders.get(responderId)) {
    runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId, undoOwner: { kind: "application", id } });
  }
  return { runtime, app, responderId };
}

describe("mounted command payload authority", () => {
  it("rejects a nested-object proxy payload without reaching the mounted command handler", async () => {
    const { app, responderId, runtime } = fixture();
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const execute = vi.fn();
    mounted.runtime.commands.register({
      id: "repair-4-command.proxy",
      responderId,
      title: { key: "repair.proxy", fallback: "Proxy" },
      payload: { description: "payload", parse: (value: unknown) => ({ ok: true as const, value }) },
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      execute,
    });

    let reads = 0;
    let ownKeys = 0;
    let descriptorReads = 0;
    const payload = new Proxy([{ nested: "accepted" }], {
      get(target, key, receiver) {
        reads += 1;
        return Reflect.get(target, key, receiver);
      },
      ownKeys(target) {
        ownKeys += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        descriptorReads += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    await expect(mounted.runtime.commands.dispatch("repair-4-command.proxy", payload)).rejects.toThrow(/proxy|native|detached|payload/i);
    expect(reads).toBe(0);
    expect(ownKeys).toBe(0);
    expect(descriptorReads).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    mounted.dispose();
  });

  it("does not touch Proxy traps when a browser host fails closed for raw payloads", async () => {
    const { app, responderId, runtime } = fixture("repair-4-command-browser-proxy", true);
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const execute = vi.fn();
    mounted.runtime.commands.register({
      id: "repair-4-command-browser-proxy.browser-proxy",
      responderId,
      title: { key: "repair.browser-proxy", fallback: "Browser Proxy" },
      payload: { description: "payload", parse: (value: unknown) => ({ ok: true as const, value }) },
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      execute,
    });

    let prototypeTraps = 0;
    let keyTraps = 0;
    let descriptorTraps = 0;
    const payload = new Proxy([{ nested: "hostile" }], {
      getPrototypeOf() { prototypeTraps += 1; return Array.prototype; },
      ownKeys() { keyTraps += 1; return ["0", "length"]; },
      getOwnPropertyDescriptor(target, key) {
        descriptorTraps += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    await expect(mounted.runtime.commands.dispatch("repair-4-command-browser-proxy.browser-proxy", payload)).rejects.toThrow(/proxy|native|detached|payload/i);
    expect(prototypeTraps).toBe(0);
    expect(keyTraps).toBe(0);
    expect(descriptorTraps).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    mounted.dispose();
  });

  it("does not evaluate an accessor when the browser host lacks a native Proxy probe", async () => {
    const { app, responderId, runtime } = fixture("repair-4-command-browser-accessor", true);
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const execute = vi.fn();
    mounted.runtime.commands.register({
      id: "repair-4-command-browser-accessor.accessor",
      responderId,
      title: { key: "repair.accessor", fallback: "Accessor" },
      payload: { description: "payload", parse: (value: unknown) => ({ ok: true as const, value }) },
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      execute,
    });
    let getterCalls = 0;
    const payload = Object.defineProperty({}, "secret", {
      enumerable: true,
      get() { getterCalls += 1; return "hostile"; },
    });

    await expect(mounted.runtime.commands.dispatch("repair-4-command-browser-accessor.accessor", payload))
      .rejects.toThrow(/payload|native|detached|runtime-created/i);
    expect(getterCalls).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    mounted.dispose();
  });

  it("accepts an immutable payload created by the mounted runtime in a browser fallback", async () => {
    const { app, responderId, runtime } = fixture("repair-4-command-browser-created", true);
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const execute = vi.fn();
    mounted.runtime.commands.register({
      id: "repair-4-command-browser-created.created",
      responderId,
      title: { key: "repair.created", fallback: "Created" },
      payload: { description: "payload", parse: (value: unknown) => ({ ok: true as const, value }) },
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      execute,
    });
    const payload = mounted.runtime.commands.createPayload("locale", "fr-FR");

    await expect(mounted.runtime.commands.dispatch("repair-4-command-browser-created.created", payload))
      .resolves.toMatchObject({ status: "executed" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ payload: { locale: "fr-FR" } }));
    mounted.dispose();
  });

  it("returns an explicit unknown outcome after a late non-reversible command mutation", async () => {
    const { responderId, runtime } = fixture();
    let live = true;
    let resolveExecution!: () => void;
    const started = new Promise<void>((resolve) => { resolveExecution = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let model = "before";
    runtime.commands.register({
      id: "repair-4-command.late-none",
      responderId,
      title: { key: "repair.late", fallback: "Late" },
      payload: { description: "none", parse: (value: unknown) => value === undefined ? { ok: true as const, value } : { ok: false as const, issues: ["No payload."] } },
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      execute: async () => {
        model = "mutated";
        resolveExecution();
        await gate;
        return "late";
      },
    });

    const pending = runtime.commands.dispatch("repair-4-command.late-none", undefined, { responderId, isLive: () => live });
    await started;
    live = false;
    release();

    await expect(pending).resolves.toMatchObject({ status: "unknown", commandId: "repair-4-command.late-none" });
    expect(model).toBe("mutated");
  });

  it("does not invalidate an admitted async command when focus is idempotently reaffirmed", async () => {
    const { responderId, runtime } = fixture("repair-4-command-idempotent-focus");
    runtime.focus.requestFocus(responderId);
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    const settled = new Promise<void>((resolve) => { release = resolve; });
    runtime.commands.register({
      id: "repair-4-command.idempotent-focus",
      responderId,
      title: { key: "repair.idempotent-focus", fallback: "Idempotent focus" },
      payload: { description: "none", parse: (value: unknown) => value === undefined ? { ok: true as const, value } : { ok: false as const, issues: ["No payload."] } },
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      execute: async () => {
        entered();
        await settled;
        return "settled";
      },
    });

    const pending = runtime.commands.dispatch("repair-4-command.idempotent-focus", undefined, { responderId });
    await started;
    runtime.focus.requestFocus(responderId);
    runtime.focus.setActiveAnchors(runtime.focus.getActiveAnchors());
    release();

    await expect(pending).resolves.toMatchObject({ status: "executed", value: "settled" });
  });

  it("fences a late non-native thenable exactly like a Promise-returning command", async () => {
    const { responderId, runtime } = fixture("repair-4-command-thenable");
    let live = true;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    const settled = new Promise<void>((resolve) => { release = resolve; });
    let model = "before";
    runtime.commands.register({
      id: "repair-4-command.thenable",
      responderId,
      title: { key: "repair.thenable", fallback: "Thenable" },
      payload: { description: "none", parse: (value: unknown) => value === undefined ? { ok: true as const, value } : { ok: false as const, issues: ["No payload."] } },
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      execute: () => {
        model = "mutated";
        entered();
        return {
          then(resolve: (value: string) => void) {
            void settled.then(() => resolve("late"));
          },
        } as unknown as string;
      },
    });

    const pending = runtime.commands.dispatch("repair-4-command.thenable", undefined, { responderId, isLive: () => live });
    await started;
    live = false;
    release();

    await expect(pending).resolves.toMatchObject({ status: "unknown", commandId: "repair-4-command.thenable" });
    expect(model).toBe("mutated");
  });

  it("restores a command model when its undo factory fails but the declaration supplies a compensation", async () => {
    const { responderId, runtime } = fixture("repair-4-command-compensated");
    let model = "before";
    const compensate = vi.fn(() => { model = "before"; });
    runtime.commands.register({
      id: "repair-4-command.compensated-factory",
      responderId,
      title: { key: "repair.compensated", fallback: "Compensated" },
      payload: { description: "none", parse: (value: unknown) => value === undefined ? { ok: true as const, value } : { ok: false as const, issues: ["No payload."] } },
      defaultKeyBindings: [],
      scope: "application",
      undo: {
        kind: "register",
        createAction: () => { throw new Error("undo factory failed"); },
        compensate,
      },
      execute: () => { model = "mutated"; return "mutated"; },
    });

    await expect(runtime.commands.dispatch("repair-4-command.compensated-factory", undefined, { responderId }))
      .resolves.toMatchObject({ status: "failed" });
    expect(compensate).toHaveBeenCalledOnce();
    expect(model).toBe("before");
  });

  it("never reports factory failure after mutation as an executed command when no compensation exists", async () => {
    const { responderId, runtime } = fixture("repair-4-command-unknown");
    let model = "before";
    runtime.commands.register({
      id: "repair-4-command.unknown-factory",
      responderId,
      title: { key: "repair.unknown", fallback: "Unknown" },
      payload: { description: "none", parse: (value: unknown) => value === undefined ? { ok: true as const, value } : { ok: false as const, issues: ["No payload."] } },
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "register", createAction: () => { throw new Error("undo factory failed"); } },
      execute: () => { model = "may-have-mutated"; return "mutated"; },
    });

    await expect(runtime.commands.dispatch("repair-4-command.unknown-factory", undefined, { responderId }))
      .resolves.toMatchObject({ status: "failed", error: { code: "command-outcome-unknown" } });
    expect(model).toBe("may-have-mutated");
  });
});
