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
import { JSDOM } from "jsdom";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const runtimes: Array<ReturnType<typeof createTestRuntime>> = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("test cleanup")));
});

function fixture(id = "repair-5-command", proxyBrandProbe: "host" | "omit" = "host") {
  const environment = createTestRuntimeEnvironment({ proxyBrandProbe });
  if (proxyBrandProbe === "omit") {
    expect("isNativeProxy" in environment).toBe(false);
    expect(Object.hasOwn(environment, "isNativeProxy")).toBe(false);
  }
  const runtime = createTestRuntime({
    environment,
    initialBundles: [createTestBundle({ id, route: `/${id}` })],
  });
  runtimes.push(runtime);
  const app = runtime.apps.getApp(id)!;
  const responderId = `application:${id}`;
  runtime.responders.register({
    id: responderId,
    kind: "application",
    parentId: "workspace",
    scopeId: responderId,
    undoOwner: { kind: "application", id },
  });
  return { runtime, app, responderId };
}

const noPayload = {
  description: "No payload.",
  parse: (value: unknown) => value === undefined
    ? { ok: true as const, value: undefined }
    : { ok: false as const, issues: ["No payload is accepted."] },
};

describe("mounted command result projection", () => {
  it("keeps an ordinary object result synchronous when the browser has no Proxy probe", async () => {
    const { app, responderId, runtime } = fixture("repair-5-command-sync-object", "omit");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const source = { nested: { value: "ordinary" } };
    mounted.runtime.commands.register({
      id: "repair-5-command-sync-object.sync-object",
      responderId,
      title: { key: "repair-5-command.sync-object", fallback: "Synchronous object" },
      payload: noPayload,
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      execute: () => {
        queueMicrotask(() => mounted.dispose("synchronous object timing probe"));
        return source;
      },
    });

    const result = await mounted.runtime.commands.dispatch("repair-5-command-sync-object.sync-object");

    expect(result).toMatchObject({ status: "executed", value: source });
    if (result.status !== "executed") throw new Error("The ordinary object command did not execute.");
    expect(result.value).not.toBe(source);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen((result.value as typeof source).nested)).toBe(true);
  });

  it("assimilates a custom execution thenable before detached projection without a native Proxy probe", async () => {
    const { app, responderId, runtime } = fixture("repair-5-command-custom-thenable", "omit");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const then = vi.fn((resolve: (value: { readonly kind: string }) => void) => {
      resolve({ kind: "custom-settlement" });
    });
    mounted.runtime.commands.register({
      id: "repair-5-command-custom-thenable.custom-thenable",
      responderId,
      title: { key: "repair-5-command.custom-thenable", fallback: "Custom thenable" },
      payload: noPayload,
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      execute: () => ({ then }) as unknown as { readonly kind: string },
    });

    await expect(mounted.runtime.commands.dispatch("repair-5-command-custom-thenable.custom-thenable"))
      .resolves.toMatchObject({ status: "executed", value: { kind: "custom-settlement" } });
    expect(then).toHaveBeenCalledOnce();
  });

  it("assimilates a Promise from a foreign JSDOM realm without a native Proxy probe", async () => {
    const { app, responderId, runtime } = fixture("repair-5-command-foreign-promise", "omit");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const realm = new JSDOM("", { runScripts: "outside-only" });
    try {
      const foreign = new realm.window.Promise<string>((resolve) => resolve("foreign-settlement"));
      expect(realm.window.Promise).not.toBe(Promise);
      expect(foreign).not.toBeInstanceOf(Promise);
      mounted.runtime.commands.register({
        id: "repair-5-command-foreign-promise.foreign-promise",
        responderId,
        title: { key: "repair-5-command.foreign-promise", fallback: "Foreign Promise" },
        payload: noPayload,
        defaultKeyBindings: [],
        scope: "application",
        undo: { kind: "none" },
        execute: () => foreign as unknown as string,
      });

      await expect(mounted.runtime.commands.dispatch("repair-5-command-foreign-promise.foreign-promise"))
        .resolves.toMatchObject({ status: "executed", value: "foreign-settlement" });
    } finally {
      realm.window.close();
    }
  });

  it("registers browser-safe undo and redo callbacks without reflecting over function properties", async () => {
    const id = "repair-5-command-browser-history";
    const { app, responderId, runtime } = fixture(id, "omit");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const history = mounted.runtime.undo.get({ kind: "application", id });
    if (!history) throw new Error("The mounted application history was not created.");
    let model = "before";
    let reflectionTraps = 0;
    let undoCalls = 0;
    let redoCalls = 0;
    const reflectionTrap = () => {
      reflectionTraps += 1;
      throw new Error("Function properties must not be reflected.");
    };
    const undo = new Proxy(() => { model = "before"; }, {
      apply(target, thisArgument, argumentsList) {
        undoCalls += 1;
        return Reflect.apply(target, thisArgument, argumentsList);
      },
      get: reflectionTrap,
      getOwnPropertyDescriptor: reflectionTrap,
      getPrototypeOf: reflectionTrap,
      ownKeys: reflectionTrap,
    });
    const redo = new Proxy(() => { model = "after"; }, {
      apply(target, thisArgument, argumentsList) {
        redoCalls += 1;
        return Reflect.apply(target, thisArgument, argumentsList);
      },
      get: reflectionTrap,
      getOwnPropertyDescriptor: reflectionTrap,
      getPrototypeOf: reflectionTrap,
      ownKeys: reflectionTrap,
    });
    mounted.runtime.commands.register({
      id: "repair-5-command-browser-history.browser-history",
      responderId,
      title: { key: "repair-5-command.browser-history", fallback: "Browser history" },
      payload: noPayload,
      defaultKeyBindings: [],
      scope: "application",
      undo: {
        kind: "register",
        createAction: () => ({
          name: "Browser-safe history",
          asyncPolicy: "forbid",
          undo,
          redo,
        }),
      },
      execute: () => { model = "after"; return "after"; },
    });

    await expect(mounted.runtime.commands.dispatch("repair-5-command-browser-history.browser-history"))
      .resolves.toMatchObject({ status: "executed", value: "after" });
    expect(history.canUndo).toBe(true);
    await expect(history.undo()).resolves.toMatchObject({ status: "completed" });
    expect(model).toBe("before");
    await expect(history.redo()).resolves.toMatchObject({ status: "completed" });
    expect(model).toBe("after");
    expect(undoCalls).toBe(1);
    expect(redoCalls).toBe(1);
    expect(reflectionTraps).toBe(0);
  });

  it("uses the declared Proxy-function inverse after mount revocation and reports cancellation only after restoration", async () => {
    const { app, responderId, runtime } = fixture("repair-5-command-proxy-inverse", "omit");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    let model = "before";
    let inverseCalls = 0;
    let reflectionTraps = 0;
    const inverse = new Proxy(() => { model = "before"; }, {
      apply(target, thisArgument, argumentsList) {
        inverseCalls += 1;
        return Reflect.apply(target, thisArgument, argumentsList);
      },
      get() { reflectionTraps += 1; throw new Error("Inverse properties must not be reflected."); },
      getOwnPropertyDescriptor() { reflectionTraps += 1; throw new Error("Inverse properties must not be reflected."); },
      getPrototypeOf() { reflectionTraps += 1; throw new Error("Inverse properties must not be reflected."); },
      ownKeys() { reflectionTraps += 1; throw new Error("Inverse properties must not be reflected."); },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });

    mounted.runtime.commands.register({
      id: "repair-5-command-proxy-inverse.compensate-revoked",
      responderId,
      title: { key: "repair-5-command.compensate-revoked", fallback: "Compensate revoked" },
      payload: noPayload,
      defaultKeyBindings: [],
      scope: "application",
      undo: {
        kind: "register",
        createAction: () => ({
          name: "Restore mounted mutation",
          asyncPolicy: "forbid",
          undo: inverse,
          redo: () => { model = "updated"; },
        }),
      },
      execute: async () => {
        model = "updated";
        entered();
        await gate;
        return "updated";
      },
    });

    const pending = mounted.runtime.commands.dispatch("repair-5-command-proxy-inverse.compensate-revoked");
    await started;
    mounted.dispose("revoke while command is gated");
    release();

    await expect(pending).resolves.toMatchObject({ status: "cancelled" });
    expect(model).toBe("before");
    expect(inverseCalls).toBe(1);
    expect(reflectionTraps).toBe(0);
  });

  it("reports unknown after a revoked command's failing inverse was actually invoked", async () => {
    const { app, responderId, runtime } = fixture("repair-5-command-failing-inverse", "omit");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    let model = "before";
    let inverseCalls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });

    mounted.runtime.commands.register({
      id: "repair-5-command-failing-inverse.inverse-failure",
      responderId,
      title: { key: "repair-5-command.inverse-failure", fallback: "Inverse failure" },
      payload: noPayload,
      defaultKeyBindings: [],
      scope: "application",
      undo: {
        kind: "register",
        createAction: () => ({
          name: "Unreliable mounted inverse",
          asyncPolicy: "forbid",
          undo: () => { inverseCalls += 1; throw new Error("inverse failed"); },
          redo: () => { model = "updated"; },
        }),
      },
      execute: async () => {
        model = "updated";
        entered();
        await gate;
        return "updated";
      },
    });

    const pending = mounted.runtime.commands.dispatch("repair-5-command-failing-inverse.inverse-failure");
    await started;
    mounted.dispose("revoke while an inverse cannot settle");
    release();

    await expect(pending).resolves.toMatchObject({ status: "unknown", error: { code: "command-outcome-unknown" } });
    expect(model).toBe("updated");
    expect(inverseCalls).toBe(1);
  });

  it("contains a hostile then getter inside the command outcome fence", async () => {
    const { app, responderId, runtime } = fixture("repair-5-command-hostile-then", "omit");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    let model = "before";
    let getterCalls = 0;
    mounted.runtime.commands.register({
      id: "repair-5-command-hostile-then.hostile-then",
      responderId,
      title: { key: "repair-5-command.hostile-then", fallback: "Hostile then getter" },
      payload: noPayload,
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      execute: () => {
        model = "mutated";
        return Object.defineProperty({}, "then", {
          enumerable: true,
          get() {
            getterCalls += 1;
            queueMicrotask(() => mounted.dispose("hostile then settlement fence"));
            throw new Error("hostile then getter");
          },
        });
      },
    });

    const result = await mounted.runtime.commands.dispatch("repair-5-command-hostile-then.hostile-then");

    expect(result.status).toBe("unknown");
    expect(result.status).not.toBe("executed");
    expect(result.status).not.toBe("cancelled");
    expect(model).toBe("mutated");
    expect(getterCalls).toBe(1);
  });

  it("assimilates a mounted validation thenable instead of projecting its then member", async () => {
    const { app, responderId, runtime } = fixture("repair-5-command-thenable-validation", "omit");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    mounted.runtime.commands.register({
      id: "repair-5-command-thenable-validation.thenable-validation",
      responderId,
      title: { key: "repair-5-command.thenable-validation", fallback: "Thenable validation" },
      payload: noPayload,
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      validate: () => ({
        then(resolve: (value: { readonly enabled: boolean; readonly title: { readonly key: string; readonly fallback: string } }) => void) {
          resolve({ enabled: true, title: { key: "repair-5-command.thenable-validation.result", fallback: "Thenable result" } });
        },
      }) as unknown as { readonly enabled: boolean },
      execute: () => "unused",
    });

    await expect(mounted.runtime.commands.validate("repair-5-command-thenable-validation.thenable-validation"))
      .resolves.toMatchObject({ enabled: true, title: "Thenable result" });
  });

  it("preflights empty and duplicate mounted validation keys before any declaration validation runs", async () => {
    const { app, responderId, runtime } = fixture();
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const validate = vi.fn(() => ({ enabled: true }));
    mounted.runtime.commands.register({
      id: "repair-5-command.validation-keys",
      responderId,
      title: { key: "repair-5-command.validation-keys", fallback: "Validation keys" },
      payload: noPayload,
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      validate,
      execute: () => "unused",
    });

    await expect(mounted.runtime.commands.validateMany([
      { key: " ", commandId: "repair-5-command.validation-keys" },
    ] as never)).rejects.toMatchObject({ code: "empty-key", requestIndex: 0 });
    await expect(mounted.runtime.commands.validateMany([
      { key: "same", commandId: "repair-5-command.validation-keys" },
      { key: "same", commandId: "repair-5-command.validation-keys" },
    ] as never)).rejects.toMatchObject({ code: "duplicate-key", requestIndex: 1 });
    expect(validate).not.toHaveBeenCalled();
  });

  it("rejects cyclic, over-depth, over-node, oversized, and Proxy callback values before they reach the kernel", async () => {
    const { app, responderId, runtime } = fixture();
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const overDepth: { value: unknown } = { value: null };
    let deep: { value: unknown } = overDepth;
    for (let index = 0; index < 65; index += 1) {
      const next = { value: null };
      deep.value = next;
      deep = next;
    }
    const overNodes = Array.from({ length: 10_000 }, (_, index) => index);
    const overBytes = "x".repeat(1_100_000);
    let proxyReads = 0;
    const proxy = new Proxy({ enabled: true }, {
      get(target, key, receiver) { proxyReads += 1; return Reflect.get(target, key, receiver); },
      ownKeys(target) { proxyReads += 1; return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) { proxyReads += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
    });
    const invalid = [cycle, overDepth, overNodes, overBytes, proxy];
    let value: unknown = invalid[0];
    let phase: "validate" | "execute" = "validate";
    mounted.runtime.commands.register({
      id: "repair-5-command.output-graphs",
      responderId,
      title: { key: "repair-5-command.output-graphs", fallback: "Output graphs" },
      payload: noPayload,
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      validate: () => phase === "validate" ? value as { readonly enabled: boolean } : { enabled: true },
      execute: () => value,
    });

    for (const output of invalid) {
      value = output;
      phase = "validate";
      await expect(mounted.runtime.commands.validate("repair-5-command.output-graphs")).rejects.toThrow(/callback|command|depth|node|byte|proxy|detached|cycle/i);
      phase = "execute";
      await expect(mounted.runtime.commands.dispatch("repair-5-command.output-graphs")).resolves.toMatchObject({ status: "failed" });
    }
    expect(proxyReads).toBe(0);
  });

  it("rejects a hostile undo-action callback result before it can read Proxy traps", async () => {
    const { app, responderId, runtime } = fixture();
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    let reads = 0;
    const action = new Proxy({
      name: "Hostile action",
      asyncPolicy: "forbid" as const,
      undo: () => undefined,
      redo: () => undefined,
    }, {
      get(target, key, receiver) { reads += 1; return Reflect.get(target, key, receiver); },
      ownKeys(target) { reads += 1; return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) { reads += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
    });
    mounted.runtime.commands.register({
      id: "repair-5-command.undo-output",
      responderId,
      title: { key: "repair-5-command.undo-output", fallback: "Undo output" },
      payload: noPayload,
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "register", createAction: () => action },
      execute: () => "mutated",
    });

    await expect(mounted.runtime.commands.dispatch("repair-5-command.undo-output"))
      .resolves.toMatchObject({ status: "failed", error: { code: "command-outcome-unknown" } });
    expect(reads).toBe(0);
  });
});
