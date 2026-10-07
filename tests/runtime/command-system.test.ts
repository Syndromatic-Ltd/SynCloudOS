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
  CommandRegistrationError,
  CommandValidationRequestError,
  commandOperationResult,
  commandValidationRequestKey,
  commandValidationStaleReason,
} from "../../src/SynCloudOS/Commands";
import type {
  CommandDeclaration,
  CommandPayloadSchema,
  CommandResponderResolver,
  CommandValidationRequest,
} from "../../src/SynCloudOS/Commands";
import { createCommandSystem } from "../../src/SynCloudOS/Commands/CommandSystem";
import { defineSyncUndoAction } from "../../src/SynCloudOS/SynCloudOS";
import { createTestRuntime } from "./helpers";

const deltaSchema: CommandPayloadSchema<{ delta: number }> = {
  description: "A numeric delta.",
  parse(value) {
    const delta = (value as { delta?: unknown } | null)?.delta;
    return typeof delta === "number"
      ? { ok: true, value: { delta } }
      : { ok: false, issues: ["delta must be a number"] };
  },
};

function resolver(ids: string[]): CommandResponderResolver {
  return {
    resolveResponderChain: () => ids.map((id) => ({ id, scopeId: "root" })),
    getGeneration: () => 1,
  };
}

function declaration(overrides: Partial<CommandDeclaration<{ delta: number }, number>> = {}): CommandDeclaration<{ delta: number }, number> {
  return {
    id: "editor.indent",
    responderId: "editor:one",
    title: { key: "command.editor.indent", fallback: "Indent" },
    payload: deltaSchema,
    scope: "focused",
    defaultKeyBindings: [],
    undo: { kind: "none" },
    validate: () => ({ enabled: true }),
    execute: ({ payload }) => payload.delta + 1,
    ...overrides,
  };
}

describe("runtime command system", () => {
  it("cannot use an accepted tuple to execute a replacement declaration", async () => {
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["editor:one", "runtime"]) });
    const oldExecute = vi.fn(() => 1);
    const replacementExecute = vi.fn(() => 2);
    const payload = { delta: 1 };
    const registration = commands.register(declaration({ execute: oldExecute }));
    const prepared = commands.prepareDispatch("editor.indent", payload);
    expect(prepared).toMatchObject({ status: "accepted" });
    if (prepared instanceof Promise || prepared.status !== "accepted") throw new Error("Expected synchronous acceptance.");
    registration.dispose();
    commands.register(declaration({ execute: replacementExecute }));

    await expect(commands.dispatch("editor.indent", payload, {
      acceptance: prepared.acceptance,
    })).resolves.toMatchObject({ status: "cancelled" });
    expect(oldExecute).not.toHaveBeenCalled();
    expect(replacementExecute).not.toHaveBeenCalled();
  });
  it("validates payload and dispatches the focused responder's typed declaration", async () => {
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["editor:one", "runtime"]) });
    commands.register(declaration());

    await expect(commands.dispatch<number>("editor.indent", { delta: 2 })).resolves.toMatchObject({
      status: "executed",
      responderId: "editor:one",
      value: 3,
    });
    await expect(commands.dispatch("editor.indent", { delta: "2" })).resolves.toMatchObject({
      status: "invalid-payload",
      issues: ["delta must be a number"],
    });
  });

  it("stops at a disabled or denied first declaration", async () => {
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["editor:one", "runtime"]) });
    const fallback = vi.fn(() => 99);
    commands.register(declaration({ validate: () => ({ enabled: false, disabledReason: "Nothing to indent." }) }));
    commands.register(declaration({ responderId: "runtime", execute: fallback }));

    await expect(commands.dispatch("editor.indent", { delta: 1 })).resolves.toMatchObject({
      status: "disabled",
      responderId: "editor:one",
      reason: "Nothing to indent.",
    });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("rejects duplicate registrations and disposal removes authority", async () => {
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["editor:one"]) });
    const registration = commands.register(declaration());
    expect(() => commands.register(declaration())).toThrow(CommandRegistrationError);
    expect(registration.dispose()).toBe(true);
    expect(registration.dispose()).toBe(false);
    await expect(commands.dispatch("editor.indent", { delta: 1 })).resolves.toEqual({
      status: "unhandled",
      commandId: "editor.indent",
    });
  });

  it("uses dynamic titles and asynchronous validation", async () => {
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["editor:one"]) });
    commands.register(declaration({
      title: ({ payload }) => ({ key: "indent.dynamic", fallback: `Indent ${payload.delta}` }),
      validate: async () => ({ enabled: true, state: "on" }),
    }));
    await expect(commands.validate("editor.indent", { delta: 4 })).resolves.toMatchObject({
      title: "Indent 4",
      enabled: true,
      state: "on",
    });
  });

  it("returns repeated command IDs by ordered caller key without collapsing distinct payloads", async () => {
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["runtime"]) });
    const validate = vi.fn(async ({ payload }: { payload: { delta: number } }) => ({
      enabled: true,
      title: { key: "open", fallback: `Open ${payload.delta}` },
    }));
    commands.register(declaration({ id: "workspace.openApp", responderId: "runtime", validate } as Partial<CommandDeclaration<{ delta: number }, number>>));
    const firstPayload = { delta: 1 };
    const requests = [
      { key: commandValidationRequestKey("open:first"), commandId: "workspace.openApp", payload: firstPayload },
      { key: commandValidationRequestKey("open:shared"), commandId: "workspace.openApp", payload: firstPayload },
      { key: commandValidationRequestKey("open:second"), commandId: "workspace.openApp", payload: { delta: 2 } },
    ] satisfies readonly CommandValidationRequest[];

    const result = await commands.validateMany(requests);
    expect([...result.keys()]).toEqual(["open:first", "open:shared", "open:second"]);
    expect(result.get(requests[0].key)?.title).toBe("Open 1");
    expect(result.get(requests[2].key)?.title).toBe("Open 2");
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it("does not publish a replaced declaration's stale asynchronous presentation", async () => {
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["editor:one"]) });
    let release!: (value: { enabled: boolean; title: { key: string; fallback: string } }) => void;
    const staleValidation = new Promise<{ enabled: boolean; title: { key: string; fallback: string } }>((resolve) => { release = resolve; });
    const previous = commands.register(declaration({
      title: { key: "previous", fallback: "Previous title" },
      validate: () => staleValidation,
      execute: () => 1,
    }));

    const validating = commands.validate("editor.indent", { delta: 1 });
    await Promise.resolve();
    previous.dispose();
    const executeCurrent = vi.fn(() => 2);
    commands.register(declaration({ title: { key: "current", fallback: "Current title" }, execute: executeCurrent }));
    release({ enabled: true, title: { key: "previous", fallback: "Previous title" } });

    await expect(validating).resolves.toMatchObject({
      stale: true,
      enabled: false,
      disabledReason: commandValidationStaleReason,
      title: "editor.indent",
    });
    await expect(commands.dispatch("editor.indent", { delta: 1 })).resolves.toMatchObject({ status: "executed", value: 2 });
    expect(executeCurrent).toHaveBeenCalledTimes(1);
  });

  it("marks a batch stale for registry replacement or caller cancellation", async () => {
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["editor:one"]) });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const registration = commands.register(declaration({ validate: async () => { await gate; return { enabled: true }; } }));
    const request = [{ key: commandValidationRequestKey("current"), commandId: "editor.indent", payload: { delta: 1 } }];
    const validating = commands.validateMany(request);
    await Promise.resolve();
    registration.dispose();
    commands.register(declaration({ title: { key: "replacement", fallback: "Replacement" } }));
    release();
    await expect(validating).resolves.toEqual(expect.any(Map));
    const stale = (await validating).get(request[0].key);
    expect(stale).toMatchObject({ stale: true, enabled: false, disabledReason: commandValidationStaleReason });

    const controller = new AbortController();
    controller.abort("menu closed");
    await expect(commands.validate("editor.indent", { delta: 1 }, { signal: controller.signal })).resolves.toMatchObject({
      stale: false,
      enabled: false,
      disabledReason: "Command validation was cancelled.",
    });
  });

  it("rejects empty and duplicate batch request keys", async () => {
    expect(() => commandValidationRequestKey("  ")).toThrow(CommandValidationRequestError);
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["runtime"]) });
    const key = commandValidationRequestKey("same");
    await expect(commands.validateMany([
      { key, commandId: "one" },
      { key, commandId: "two" },
    ])).rejects.toMatchObject({ code: "duplicate-key", key: "same", requestIndex: 1 });
  });

  it("propagates operation identity and reports execution failure", async () => {
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["editor:one"]) });
    let seen: unknown;
    commands.register(declaration({ execute: (context) => { seen = context; throw new Error("broken command"); } }));
    const result = await commands.dispatch("editor.indent", { delta: 3 }, { correlationId: "correlation:test" });
    expect(result).toMatchObject({ status: "failed", commandId: "editor.indent" });
    expect(seen).toMatchObject({
      runtime,
      runtimeId: runtime.runtimeId,
      commandId: "editor.indent",
      responderId: "editor:one",
      correlationId: "correlation:test",
    });
  });

  it("maps an explicitly adapted nested operation terminal result without mistaking ordinary result objects for operations", async () => {
    const runtime = createTestRuntime();
    const commands = createCommandSystem({ runtime, responderResolver: resolver(["editor:one"]) });
    commands.register(declaration({
      execute: () => commandOperationResult({
        status: "cancelled",
        committed: false,
        reason: "Nested route was superseded.",
      }),
    }));

    await expect(commands.dispatch("editor.indent", { delta: 1 })).resolves.toMatchObject({
      status: "cancelled",
      reason: "Nested route was superseded.",
    });

    const plainCommands = createCommandSystem({ runtime, responderResolver: resolver(["editor:one"]) });
    const ordinaryValue = { status: "failed", label: "A valid command value" } as const;
    const ordinaryValueDeclaration: CommandDeclaration<{ delta: number }, typeof ordinaryValue> = {
      ...declaration(),
      execute: () => ordinaryValue,
    };
    plainCommands.register(ordinaryValueDeclaration);
    await expect(plainCommands.dispatch("editor.indent", { delta: 1 })).resolves.toMatchObject({
      status: "executed",
      value: { status: "failed", label: "A valid command value" },
    });
  });

  it("disposes with its runtime and retains bounded redacted diagnostics", async () => {
    const runtime = createTestRuntime({ commandHistoryLimit: 2 });
    runtime.commands.register(declaration({ responderId: "runtime", telemetry: { category: "editing", sensitivePayload: true } }));
    await runtime.commands.dispatch("editor.indent", { delta: 1 });
    await runtime.commands.dispatch("editor.indent", { delta: 2 });
    await runtime.commands.dispatch("editor.indent", { delta: "secret" });
    const before = runtime.commands.inspect();
    expect(before.history).toHaveLength(2);
    expect(JSON.stringify(before)).not.toContain("secret");
    await runtime.dispose("test complete");
    expect(runtime.commands.inspect().registrations).toEqual([]);
    await expect(runtime.commands.dispatch("editor.indent", { delta: 1 })).resolves.toEqual({
      status: "cancelled",
      commandId: "editor.indent",
      operationId: "",
      reason: "Runtime commands are disposed.",
    });
  });

  it("registers declared inverse work with the resolved responder owner", async () => {
    const runtime = createTestRuntime();
    const owner = { kind: "document" as const, id: "draft:one" };
    runtime.responders.register({ id: "document:one", kind: "document", parentId: "workspace", scopeId: "document:one", undoOwner: owner });
    runtime.focus.requestFocus("document:one");
    const manager = runtime.undo.create(owner);
    let value = 0;
    runtime.commands.register(declaration({
      id: "document.increment",
      responderId: "document:one",
      execute: ({ payload, undoManager }) => {
        expect(undoManager).toMatchObject({ owner });
        value += payload.delta;
        return payload.delta;
      },
      undo: {
        kind: "register",
        createAction: (_context, delta) => defineSyncUndoAction({
          name: "Increment",
          asyncPolicy: "forbid",
          undo: () => { value -= delta; },
          redo: () => { value += delta; },
        }),
      },
    }));

    await expect(runtime.commands.dispatch("document.increment", { delta: 3 })).resolves.toMatchObject({ status: "executed" });
    expect(value).toBe(3);
    expect(manager.undoTitle).toBe("Undo Increment");
    await manager.undo();
    expect(value).toBe(0);
    await manager.redo();
    expect(value).toBe(3);
  });
});
