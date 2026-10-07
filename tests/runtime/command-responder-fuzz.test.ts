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
import type { CommandDeclaration } from "../../src/SynCloudOS/SynCloudOS";
import { ResponderGraphError } from "../../src/SynCloudOS/Responders";
import { createTestRuntime } from "./helpers";

const noPayload = {
  description: "No payload.",
  parse: (value: unknown) => value === undefined
    ? { ok: true as const, value: undefined }
    : { ok: false as const, issues: ["No payload is accepted."] },
};

function command(id: string, responderId: string, execute = vi.fn(), validate?: CommandDeclaration<undefined, void>["validate"]): CommandDeclaration<undefined, void> {
  return {
    id,
    responderId,
    title: { key: id, fallback: id },
    payload: noPayload,
    defaultKeyBindings: [],
    scope: "focused",
    undo: { kind: "none" },
    validate,
    execute,
  };
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("seeded command and responder graph fuzz", () => {
  it("keeps generated chains acyclic, unique, enabled, and runtime-local", () => {
    const random = seeded(0x03_07_2026);
    const runtime = createTestRuntime({ id: "runtime:fuzz" });
    const ids = ["workspace"];
    for (let index = 0; index < 64; index += 1) {
      const parentId = ids[Math.floor(random() * ids.length)];
      const id = `fuzz:${index}`;
      runtime.responders.register({ id, kind: index % 5 === 0 ? "document" : "view", parentId, scopeId: `scope:${index % 7}` });
      ids.push(id);
      runtime.focus.requestFocus(id);
      const chain = runtime.responders.resolveChain();
      expect(new Set(chain.map((entry) => entry.id)).size).toBe(chain.length);
    }

    runtime.responders.register({ id: "cycle:a", kind: "view", parentId: "cycle:b", scopeId: "root" });
    expect(() => runtime.responders.register({ id: "cycle:b", kind: "view", parentId: "cycle:a", scopeId: "root" })).toThrow(ResponderGraphError);
    expect(() => runtime.responders.register({ id: "foreign", runtimeId: "runtime:other" as never, kind: "view", scopeId: "root" })).toThrow(ResponderGraphError);
    expect(runtime.responders.inspect().registrations.every((entry) => !entry.id.startsWith("foreign"))).toBe(true);
  });

  it("contains modal dispatch, skips disabled responders, and targets the first live declaration", async () => {
    const runtime = createTestRuntime();
    let enabled = false;
    runtime.responders.register({ id: "app:fuzz", kind: "application", parentId: "workspace", scopeId: "app:fuzz" });
    runtime.responders.register({ id: "document:outside", kind: "document", parentId: "app:fuzz", scopeId: "window:outside" });
    runtime.responders.register({ id: "disabled:control", kind: "control", parentId: "document:outside", scopeId: "window:outside", enabled: () => enabled });
    runtime.responders.register({ id: "modal:item", kind: "control", parentId: "app:fuzz", scopeId: "modal:fuzz" });
    runtime.focus.setActiveAnchors({ documentResponderId: "document:outside", applicationResponderId: "app:fuzz", workspaceResponderId: "workspace", runtimeResponderId: "runtime" });
    runtime.focus.requestFocus("disabled:control");

    const disabledExecute = vi.fn();
    const documentExecute = vi.fn();
    const appExecute = vi.fn();
    runtime.commands.register(command("fuzz.dispatch", "disabled:control", disabledExecute));
    runtime.commands.register(command("fuzz.dispatch", "document:outside", documentExecute));
    runtime.commands.register(command("fuzz.dispatch", "app:fuzz", appExecute));
    await runtime.commands.dispatch("fuzz.dispatch");
    expect(disabledExecute).not.toHaveBeenCalled();
    expect(documentExecute).toHaveBeenCalledTimes(1);

    runtime.focus.requestFocus("app:fuzz");
    const modal = runtime.focus.openScope({ id: "modal:fuzz", kind: "modal", parentResponderId: "app:fuzz", modal: true, trapFocus: true });
    runtime.focus.requestFocus("modal:item");
    expect(runtime.responders.resolveChain().map(({ id }) => id)).not.toContain("document:outside");
    await runtime.commands.dispatch("fuzz.dispatch");
    expect(documentExecute).toHaveBeenCalledTimes(1);
    expect(appExecute).toHaveBeenCalledTimes(1);
    enabled = true;
    expect(runtime.focus.requestFocus("disabled:control")).toMatchObject({ status: "blocked" });
    modal.close();
  });

  it("never executes after asynchronous validation becomes stale and restores only live responders", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app:stale", kind: "application", parentId: "workspace", scopeId: "app:stale" });
    const control = runtime.responders.register({ id: "control:stale", kind: "control", parentId: "app:stale", scopeId: "app:stale" });
    runtime.focus.requestFocus("control:stale");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const execute = vi.fn();
    runtime.commands.register(command("fuzz.stale", "control:stale", execute, async () => {
      await gate;
      return { enabled: true };
    }));

    const dispatch = runtime.commands.dispatch("fuzz.stale");
    await Promise.resolve();
    control.dispose();
    release();
    await expect(dispatch).resolves.toMatchObject({ status: "cancelled", reason: "Command validation became stale." });
    expect(execute).not.toHaveBeenCalled();

    runtime.responders.register({ id: "trigger:live", kind: "control", parentId: "app:stale", scopeId: "app:stale" });
    const transient = runtime.responders.register({ id: "trigger:transient", kind: "control", parentId: "app:stale", scopeId: "app:stale" });
    runtime.focus.requestFocus("trigger:transient");
    const scope = runtime.focus.openScope({ id: "popover:stale", kind: "popover", parentResponderId: "app:stale", modal: false, trapFocus: false });
    transient.dispose();
    expect(scope.close()).toMatchObject({ status: "closed", restoredResponderId: "app:stale" });
  });
});
