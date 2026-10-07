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
import type { CommandDeclaration } from "../../src/SynCloudOS/Commands";
import type { KeyBindingDeclaration, KeyBindingEvent } from "../../src/SynCloudOS/KeyBindings";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const noPayload = { description: "No payload.", parse: (value: unknown) => value === undefined ? ({ ok: true as const, value: undefined }) : ({ ok: false as const, issues: ["No payload is accepted."] }) };

function event(key: string, overrides: Partial<KeyBindingEvent> = {}): KeyBindingEvent {
  return { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, isComposing: false, getModifierState: () => false, ...overrides };
}

function bindingCommand(id: string, responderId: string, binding: KeyBindingDeclaration, execute = vi.fn(), allowReservedBrowserShortcut = false): CommandDeclaration<undefined, void> {
  return { id, responderId, title: { key: id, fallback: id }, payload: noPayload, scope: binding.scope, defaultKeyBindings: [binding], undo: { kind: "none" }, allowReservedBrowserShortcut, execute };
}

function runtimeFor(platform: "mac" | "windows" | "linux") {
  return createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), platform } });
}

describe("KeyBindingManager", () => {
  it("settles asynchronous validation into a one-shot acceptance without validating twice", async () => {
    const runtime = runtimeFor("windows");
    let release!: (value: { enabled: boolean }) => void;
    const validate = vi.fn(() => new Promise<{ enabled: boolean }>((resolve) => { release = resolve; }));
    const execute = vi.fn();
    runtime.commands.register({
      ...bindingCommand("async.accepted", "runtime", { key: "j", modifiers: ["primary"], scope: "runtime" }, execute),
      validate,
    });
    const keyEvent = event("j", { ctrlKey: true });

    expect(runtime.keyBindings.claimKeyboardEvent(keyEvent, {})).toBeNull();
    expect(runtime.keyBindings.claimKeyboardEvent(keyEvent, {})).toBeNull();
    expect(validate).toHaveBeenCalledTimes(1);
    release({ enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const claim = runtime.keyBindings.claimKeyboardEvent(keyEvent, {});
    expect(claim).not.toBeNull();
    await runtime.keyBindings.handleKeyboardEvent(keyEvent, {}, claim!);
    expect(execute).toHaveBeenCalledOnce();
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it("invalidates a settled acceptance when the declaration generation changes", async () => {
    const runtime = runtimeFor("windows");
    let release!: (value: { enabled: boolean }) => void;
    const registration = runtime.commands.register({
      ...bindingCommand("async.stale", "runtime", { key: "j", modifiers: ["primary"], scope: "runtime" }),
      validate: () => new Promise<{ enabled: boolean }>((resolve) => { release = resolve; }),
    });
    const keyEvent = event("j", { ctrlKey: true });
    expect(runtime.keyBindings.claimKeyboardEvent(keyEvent, {})).toBeNull();
    release({ enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    registration.dispose();
    runtime.commands.register(bindingCommand("async.stale", "runtime", { key: "j", modifiers: ["primary"], scope: "runtime" }));
    expect(runtime.keyBindings.claimKeyboardEvent(keyEvent, {})).not.toBeNull();
  });
  it.each([
    { platform: "mac" as const, keyEvent: event("k", { metaKey: true }), matches: true },
    { platform: "windows" as const, keyEvent: event("k", { ctrlKey: true }), matches: true },
    { platform: "linux" as const, keyEvent: event("k", { metaKey: true }), matches: false },
  ])("maps primary on $platform", ({ platform, keyEvent, matches }) => {
    const runtime = runtimeFor(platform);
    runtime.commands.register(bindingCommand("webspring.quickSwitch.toggle", "runtime", { key: "k", modifiers: ["primary"], scope: "runtime" }));
    expect(Boolean(runtime.keyBindings.resolve(keyEvent, {}))).toBe(matches);
  });

  it("normalises modifier order and protects composition, AltGraph, repeat, editable text, and reserved shortcuts", () => {
    const runtime = runtimeFor("windows");
    runtime.commands.register(bindingCommand("shell.action", "runtime", { key: "K", modifiers: ["shift", "primary"], scope: "runtime" }));
    expect(runtime.keyBindings.resolve(event("k", { ctrlKey: true, shiftKey: true }), {})?.binding.display).toBe("Ctrl+Shift+K");
    expect(runtime.keyBindings.resolve(event("k", { ctrlKey: true, shiftKey: true, isComposing: true }), {})).toBeNull();
    expect(runtime.keyBindings.resolve(event("k", { ctrlKey: true, shiftKey: true, getModifierState: (key) => key === "AltGraph" }), {})).toBeNull();
    expect(runtime.keyBindings.resolve(event("k", { ctrlKey: true, shiftKey: true, repeat: true }), {})).toBeNull();
    expect(runtime.keyBindings.resolve(event("k", { ctrlKey: true, shiftKey: true }), { editable: true })).toBeNull();
    runtime.commands.register(bindingCommand("browser.reserved", "runtime", { key: "l", modifiers: ["primary"], scope: "runtime", allowInEditable: true }));
    expect(runtime.keyBindings.resolve(event("l", { ctrlKey: true }), {})).toBeNull();
    runtime.commands.register(bindingCommand("browser.reserved.optIn", "runtime", { key: "t", modifiers: ["primary"], scope: "runtime" }, vi.fn(), true));
    expect(runtime.keyBindings.resolve(event("t", { ctrlKey: true }), {})?.binding.commandId).toBe("browser.reserved.optIn");
    expect(runtime.keyBindings.resolve(event("t", { ctrlKey: true, isComposing: true }), {})).toBeNull();
    expect(runtime.keyBindings.resolve(event("t", { ctrlKey: true, getModifierState: (key) => key === "AltGraph" }), {})).toBeNull();
    expect(runtime.keyBindings.resolve(event("t", { ctrlKey: true }), { editable: true })).toBeNull();
  });

  it("permits composition only for an explicit opt-in binding while retaining AltGraph protection", () => {
    const runtime = runtimeFor("windows");
    runtime.commands.register(bindingCommand("editor.composition.commit", "runtime", {
      key: "Enter",
      modifiers: [],
      scope: "runtime",
      allowDuringComposition: true,
    }));

    expect(runtime.keyBindings.resolve(event("Enter", { isComposing: true }), {})?.binding.commandId).toBe("editor.composition.commit");
    expect(runtime.keyBindings.resolve(event("Enter", {
      isComposing: true,
      getModifierState: (key) => key === "AltGraph",
    }), {})).toBeNull();
  });

  it("ignores malformed persisted overrides without poisoning either runtime", () => {
    const first = runtimeFor("windows");
    const second = runtimeFor("windows");
    first.commands.register(bindingCommand("persisted.command", "runtime", { key: "p", modifiers: ["primary"], scope: "runtime" }));
    second.commands.register(bindingCommand("persisted.command", "runtime", { key: "p", modifiers: ["primary"], scope: "runtime" }));
    first.persistence.setPreference("commands.keyBindings.overrides", [
      ["persisted.command", { key: "x" }],
      ["persisted.command", { key: "x", modifiers: ["bogus"], scope: "runtime" }],
      ["persisted.command", { key: "x", modifiers: ["primary"], scope: "wrong" }],
      ["persisted.command", { key: "x", modifiers: ["primary"], scope: "runtime", priority: "high" }],
      ["persisted.command", { key: "x", modifiers: ["primary"], scope: "runtime", allowInEditable: true }],
      [42, null],
    ]);

    expect(first.keyBindings.resolve(event("x", { ctrlKey: true }), {})?.binding.commandId).toBe("persisted.command");
    expect(first.keyBindings.resolve(event("p", { ctrlKey: true }), {})).toBeNull();
    expect(second.keyBindings.resolve(event("p", { ctrlKey: true }), {})?.binding.commandId).toBe("persisted.command");
    expect(first.keyBindings.inspect()).toMatchObject({ invalidOverrides: expect.any(Array) });
    expect(first.keyBindings.inspect().invalidOverrides).toHaveLength(4);
  });

  it("does not select a declaration from an unrelated active scope anchor", () => {
    const runtime = runtimeFor("windows");
    runtime.responders.register({ id: "app:a", kind: "application", parentId: "runtime", scopeId: "app:a" });
    runtime.responders.register({ id: "control:a", kind: "control", parentId: "app:a", scopeId: "app:a" });
    runtime.responders.register({ id: "app:b", kind: "application", parentId: "runtime", scopeId: "app:b" });
    runtime.responders.register({ id: "control:b", kind: "control", parentId: "app:b", scopeId: "app:b" });
    runtime.focus.requestFocus("control:a");
    runtime.focus.setActiveAnchors({ documentResponderId: "control:b", applicationResponderId: "app:b", runtimeResponderId: "runtime" });
    runtime.commands.register(bindingCommand("scope.b.command", "control:b", { key: "j", modifiers: ["primary"], scope: "focused" }));

    expect(runtime.keyBindings.resolve(event("j", { ctrlKey: true }), { scopeId: "app:a" })).toBeNull();
    expect(runtime.keyBindings.resolve(event("j", { ctrlKey: true }), { scopeId: "app:b" })?.binding.commandId).toBe("scope.b.command");
  });

  it("contains keyboard lookup within a modal and its nested descendants", () => {
    const runtime = runtimeFor("windows");
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "app" });
    runtime.responders.register({ id: "modal:item", kind: "control", parentId: "app", scopeId: "modal" });
    runtime.responders.register({ id: "modal:child:item", kind: "control", parentId: "modal:item", scopeId: "modal:child" });
    runtime.focus.openScope({ id: "modal", kind: "modal", parentResponderId: "app", modal: true, trapFocus: true });
    runtime.focus.openScope({ id: "modal:child", kind: "popover", parentScopeId: "modal", parentResponderId: "modal:item", modal: false, trapFocus: false });
    runtime.focus.requestFocus("modal:child:item");
    runtime.commands.register(bindingCommand("app.ancestry", "app", { key: "q", modifiers: ["primary"], scope: "application" }));

    expect(runtime.keyBindings.resolve(event("q", { ctrlKey: true }), { scopeId: "modal:child" })).toBeNull();
  });

  it("ranks active responders before priority and lexical collision ties", () => {
    const runtime = runtimeFor("windows");
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "app" });
    runtime.responders.register({ id: "editor", kind: "control", parentId: "app", scopeId: "app" });
    runtime.focus.requestFocus("editor");
    const chord = { key: "p", modifiers: ["primary"] as const, scope: "focused" as const };
    runtime.commands.register(bindingCommand("z.app", "app", { ...chord, priority: 100 }));
    runtime.commands.register(bindingCommand("z.editor", "editor", { ...chord, priority: 0 }));
    runtime.commands.register(bindingCommand("a.editor", "editor", { ...chord, priority: 0 }));
    const resolved = runtime.keyBindings.resolve(event("p", { ctrlKey: true }), {});
    expect(resolved?.binding.commandId).toBe("a.editor");
    expect(resolved?.candidates.map(({ reason }) => reason)).toEqual(expect.arrayContaining(["lower-responder-rank", "lexical-tie-break"]));
  });

  it("treats user bindings as replacement, not a precedence bonus", () => {
    const runtime = runtimeFor("windows");
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "app" });
    runtime.responders.register({ id: "editor", kind: "control", parentId: "app", scopeId: "app" });
    runtime.focus.requestFocus("editor");
    runtime.commands.register(bindingCommand("editor.command", "editor", { key: "k", modifiers: ["primary"], scope: "focused" }));
    runtime.commands.register(bindingCommand("app.command", "app", { key: "j", modifiers: ["primary"], scope: "application" }));
    runtime.keyBindings.setOverride("app.command", { key: "k", modifiers: ["primary"], scope: "application" });
    expect(runtime.keyBindings.resolve(event("k", { ctrlKey: true }), {})?.binding.commandId).toBe("editor.command");
    runtime.keyBindings.setOverride("editor.command", { key: "x", modifiers: ["primary"], scope: "focused" });
    expect(runtime.keyBindings.resolve(event("k", { ctrlKey: true }), {})?.binding.commandId).toBe("app.command");
    runtime.keyBindings.setOverride("editor.command", null);
    expect(runtime.keyBindings.resolve(event("x", { ctrlKey: true }), {})).toBeNull();
    runtime.keyBindings.clearOverride("editor.command");
    expect(runtime.keyBindings.resolve(event("k", { ctrlKey: true }), {})?.binding.commandId).toBe("editor.command");
  });

  it("dispatches once, respects disposal, and isolates runtime overrides", async () => {
    const first = runtimeFor("windows");
    const second = runtimeFor("windows");
    const execute = vi.fn();
    const registration = first.commands.register(bindingCommand("one", "runtime", { key: "1", modifiers: ["primary"], scope: "runtime" }, execute));
    second.commands.register(bindingCommand("one", "runtime", { key: "1", modifiers: ["primary"], scope: "runtime" }));
    first.keyBindings.setOverride("one", null);
    expect(first.keyBindings.resolve(event("1", { ctrlKey: true }), {})).toBeNull();
    expect(second.keyBindings.resolve(event("1", { ctrlKey: true }), {})).not.toBeNull();
    first.keyBindings.clearOverride("one");
    await expect(first.keyBindings.handleKeyboardEvent(event("1", { ctrlKey: true }), {})).resolves.toMatchObject({ handled: true });
    expect(execute).toHaveBeenCalledTimes(1);
    registration.dispose();
    expect(first.keyBindings.resolve(event("1", { ctrlKey: true }), {})).toBeNull();
  });
});
