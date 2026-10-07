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
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEMenuController } from "../../src/NSE/Menus/NSEMenuController";
import type { NSEMenuRuntimePort } from "../../src/NSE/Menus/menuTypes";
import { SynWareProvider } from "../../src/SynCloudOS/AppSDK/SynWareContext";
import { useSynWareNSEMenuPort } from "../../src/SynCloudOS/AppSDK/SynWareNSEMenuPort";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { commandValidationRequestKey } from "../../src/SynCloudOS/Commands/commandTypes";
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
const mounts: ReturnType<typeof mountTestSynWareRuntime>[] = [];
const controllers: NSEMenuController[] = [];

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.dispose();
  cleanup();
  for (const mount of mounts.splice(0)) mount.dispose();
  for (const runtime of runtimes.splice(0)) await runtime.dispose();
});

function fixture() {
  const runtime = createTestRuntime();
  runtimes.push(runtime);
  const app = registerTestSynWare(runtime, {
    schemaVersion: 1, id: "menu-revision", version: "1.0.0", title: "Menu revision",
  });
  const mount = mountTestSynWareRuntime(runtime, app.id);
  mounts.push(mount);
  runtime.focus.requestFocus(`application:${app.id}`);
  const context = createSynWareContextValue(mount.runtime);
  let port!: NSEMenuRuntimePort;
  function Probe() {
    port = useSynWareNSEMenuPort();
    return null;
  }
  render(<SynWareProvider value={context}><Probe /></SynWareProvider>);
  const execute = vi.fn();
  const register = (title = "Original", handler = execute) => context.commands.register({
    id: "menu-revision.action", responderId: context.responderId,
    title: { key: "menu-revision.action", fallback: title },
    payload: {
      description: "none",
      parse: (value: unknown) => value === undefined
        ? { ok: true, value: undefined }
        : { ok: false, issues: ["No payload expected."] },
    },
    scope: "application", defaultKeyBindings: [], undo: { kind: "none" }, execute: handler,
  });
  const registration = register();
  const controller = new NSEMenuController({
    model: { id: "actions", entries: [{ kind: "command", id: "action", commandId: "menu-revision.action" }] },
    runtime: port,
  });
  controllers.push(controller);
  return { runtime, mount, context, port, controller, execute, register, registration };
}

describe("scoped SynWare menu revision evidence", () => {
  it("projects genuine registry and responder generations instead of fabricated zeros", () => {
    const { runtime, context, port, registration } = fixture();
    const initial = port.commands.getPresentationGeneration();
    expect(context.commands.getPresentationGeneration()).toEqual(initial);
    expect(Object.keys(initial).sort()).toEqual(["registryGeneration", "responderGeneration"]);
    expect(initial).toEqual({
      registryGeneration: runtime.commands.inspect().generation,
      responderGeneration: runtime.responders.generation,
    });
    expect(Object.isFrozen(initial)).toBe(true);
    registration.dispose();
    expect(port.commands.getPresentationGeneration().registryGeneration).toBeGreaterThan(initial.registryGeneration);
    runtime.responders.register({ id: "menu-revision:child", kind: "control", parentId: "application:menu-revision", scopeId: "application:menu-revision" });
    expect(port.commands.getPresentationGeneration().responderGeneration).toBeGreaterThan(initial.responderGeneration);
    expect(initial.registryGeneration).toBeLessThan(port.commands.getPresentationGeneration().registryGeneration);
    expect(initial.responderGeneration).toBeLessThan(port.commands.getPresentationGeneration().responderGeneration);
  });

  it("keeps revision evidence local to the mounted runtime", () => {
    const first = fixture();
    const second = fixture();
    const initial = first.context.commands.getPresentationGeneration();
    second.registration.dispose();
    second.runtime.responders.register({ id: "second:child", kind: "control", parentId: second.context.responderId, scopeId: second.context.responderId });

    expect(first.context.commands.getPresentationGeneration()).toEqual(initial);
    expect(second.context.commands.getPresentationGeneration()).not.toEqual(initial);
  });

  it("cancels a displayed command after its declaration is replaced, then executes a fresh opening", async () => {
    const { controller, registration, register, execute } = fixture();
    await controller.open();
    expect(controller.snapshot.entries[0]).toMatchObject({ label: "Original", enabled: true });
    const replacementExecute = vi.fn();
    registration.dispose();
    register("Replacement", replacementExecute);

    await expect(controller.dispatch("action")).resolves.toMatchObject({
      status: "cancelled", reason: "The displayed command authority became stale.",
    });
    expect(execute).not.toHaveBeenCalled();
    expect(replacementExecute).not.toHaveBeenCalled();

    await controller.open();
    expect(controller.snapshot.entries[0]).toMatchObject({ label: "Replacement", enabled: true });
    await expect(controller.dispatch("action")).resolves.toMatchObject({ status: "executed" });
    expect(replacementExecute).toHaveBeenCalledTimes(1);
  });

  it("cancels a displayed command when the real responder graph changes", async () => {
    const { runtime, controller, execute } = fixture();
    await controller.open();
    const generation = runtime.responders.generation;
    runtime.responders.register({ id: "menu-revision:child", kind: "control", parentId: "application:menu-revision", scopeId: "application:menu-revision" });
    expect(runtime.responders.generation).toBeGreaterThan(generation);

    await expect(controller.dispatch("action")).resolves.toMatchObject({
      status: "cancelled", reason: "The displayed command authority became stale.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("revokes revision reads with the mounted client and dismisses its open menu", async () => {
    const { mount, port, controller, execute } = fixture();
    await controller.open();
    mount.dispose();

    expect(port.signal.aborted).toBe(true);
    expect(controller.snapshot.open).toBe(false);
    expect(() => port.commands.getPresentationGeneration()).toThrow(expect.objectContaining({ name: "AbortError" }));
    await expect(controller.dispatch("action")).resolves.toMatchObject({ status: "cancelled" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps foreign commands denied through the same scoped menu client", async () => {
    const { runtime, port, execute } = fixture();
    runtime.commands.register({
      id: "foreign.action", responderId: "runtime", title: { key: "foreign.action", fallback: "Foreign" },
      payload: { description: "none", parse: () => ({ ok: true, value: undefined }) },
      scope: "runtime", defaultKeyBindings: [], undo: { kind: "none" }, execute,
    });
    const controller = new NSEMenuController({
      model: { id: "foreign", entries: [{ kind: "command", id: "action", commandId: "foreign.action" }] },
      runtime: port,
    });
    controllers.push(controller);
    await controller.open();
    expect(controller.snapshot.entries[0]).toMatchObject({ enabled: false });
    await expect(controller.dispatch("action")).resolves.toMatchObject({ status: "cancelled" });
    expect(await port.commands.prepareDispatch("foreign.action")).toMatchObject({ status: "denied" });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["dispatch", "prepareDispatch", "validateMany"] as const)("preserves scoped option checks through %s", async (operation) => {
    const { port, execute } = fixture();
    const readSource = vi.fn(() => "menu");
    const options = Object.defineProperty({}, "source", { enumerable: true, get: readSource });
    const pending = Promise.resolve().then(() => operation === "validateMany"
      ? port.commands.validateMany([{ key: commandValidationRequestKey("action"), commandId: "menu-revision.action" }], options)
      : port.commands[operation]("menu-revision.action", undefined, options));

    await expect(pending).rejects.toMatchObject({ name: "SecurityError" });
    expect(readSource).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
