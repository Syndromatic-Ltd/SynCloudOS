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

import { GFXColour } from "../../../src/FX/GraphicsFX/public";
import { NSEColourCommitCompensationError, NSEColourPanelController, createNSEColourPanelPreferences } from "../../../src/NSE/Colour";
import { createUndoManager } from "../../../src/SynCloudOS/Undo/UndoManager";
import { createSynCloudOS } from "../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createTestRuntimeEnvironment } from "../../runtime/helpers";

describe("NSEColourPanelController", () => {
  it("reports preference rollback failure while restoring the acknowledged target and service preview", () => {
    const runtime = createSynCloudOS({ id: "colour:partial-rollback", environment: createTestRuntimeEnvironment() });
    let preferenceWrites = 0;
    const preferences = {
      getSnapshot: () => ({ value: { recents: [] as readonly string[], swatches: [] as readonly string[] } }),
      set: vi.fn(() => {
        preferenceWrites += 1;
        if (preferenceWrites === 2) throw new Error("preference rollback rejected");
      }),
    };
    const cancel = vi.fn();
    const undo = {
      isExecuting: false,
      register: vi.fn(),
      reserve: () => ({ commit: () => { throw new Error("undo action admission rejected"); }, cancel }),
    };
    const controller = new NSEColourPanelController(runtime, { preferences: preferences as never, undoManager: undo });
    let value = GFXColour.parse("#000000");
    const commits = vi.fn(({ current }: { readonly current: typeof value }) => { value = current; });
    const previews = vi.fn(({ current }: { readonly current: typeof value }) => { value = current; });
    controller.activateTarget({
      id: "partial-target",
      responderId: "runtime",
      read: () => value,
      preview: previews,
      commit: commits,
      cancel: vi.fn(),
    });

    expect(() => controller.commit(GFXColour.parse("#ff0000"), "keyboard"))
      .toThrow(NSEColourCommitCompensationError);
    expect(value.toHex()).toBe("#000000");
    expect(runtime.colourPanel.getSnapshot().currentCSS).toBe(GFXColour.parse("#000000").toCSS());
    expect(commits).toHaveBeenCalledTimes(2);
    expect(previews).toHaveBeenCalledWith(expect.objectContaining({ current: GFXColour.parse("#000000") }));
    expect(preferences.set).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects accessor and sparse swatch arrays without reading getters or mutating authority", () => {
    const runtime = createSynCloudOS({ id: "colour:hostile-swatches", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime);
    let reads = 0;
    const accessor = [] as GFXColour[];
    Object.defineProperty(accessor, "0", {
      configurable: true,
      enumerable: true,
      get: () => { reads += 1; return GFXColour.parse("#ff0000"); },
    });
    Object.defineProperty(accessor, "length", { value: 1 });

    expect(() => controller.setSwatches(accessor)).toThrow(/dense data-only/i);
    expect(reads).toBe(0);
    expect(runtime.colourPanel.getSnapshot().swatches).toEqual([]);
    expect(() => controller.setSwatches(new Array<GFXColour>(1))).toThrow(/dense data-only/i);
    expect(runtime.colourPanel.getSnapshot().swatches).toEqual([]);
  });
  it("returns a stable facade snapshot until the runtime service revision changes", () => {
    const runtime = createSynCloudOS({ id: "colour:snapshot", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime);
    const first = controller.getSnapshot();
    expect(controller.getSnapshot()).toBe(first);
    runtime.colourPanel.addRecent("rgb(255 0 0)");
    expect(controller.getSnapshot()).not.toBe(first);
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
  });
  it("adapts immutable colours to the runtime service and deduplicates recents", () => {
    const runtime = createSynCloudOS({ id: "colour:facade", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime);
    const preview = vi.fn();
    const commit = vi.fn();
    controller.activateTarget({
      id: "well",
      responderId: "well:responder",
      read: () => GFXColour.parse("#000"),
      preview,
      commit,
      cancel: vi.fn(),
    });
    controller.preview(GFXColour.parse("#ff0000"), "keyboard");
    controller.commit(GFXColour.parse("rgb(255 0 0)"), "keyboard");
    controller.commit(GFXColour.parse("#00ff00"), "swatch");
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ current: GFXColour.parse("#ff0000") }));
    expect(commit).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().recents.map((colour) => colour.toHex())).toEqual(["#00ff00", "#ff0000"]);
  });

  it("preserves picker renderers outside the DOM-free runtime service", () => {
    const runtime = createSynCloudOS({ id: "colour:renderers", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime);
    const render = () => null;
    const unregister = controller.registerPicker({ id: "wheel", label: "Wheel", order: 10, supportedSpaces: ["srgb"], render });
    expect(controller.getPicker("wheel")?.render).toBe(render);
    expect(runtime.colourPanel.getPickers()[0]).not.toHaveProperty("render");
    unregister();
    expect(controller.getPicker("wheel")).toBeNull();
  });

  it("publishes immutable picker, recent, and swatch authority from the runtime snapshot", () => {
    const runtime = createSynCloudOS({ id: "colour:public-snapshot", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime);
    controller.registerPicker({ id: "wheel", label: "Wheel", order: 10, supportedSpaces: ["srgb"], render: () => null });
    runtime.colourPanel.setSwatches(["#ff0000", "#00ff00"]);
    runtime.colourPanel.addRecent("#0000ff");

    const snapshot = controller.getSnapshot();
    expect(snapshot.pickers.map(({ id }) => id)).toEqual(["wheel"]);
    expect(snapshot.recents.map((colour) => colour.toHex())).toEqual(["#0000ff"]);
    expect(snapshot.swatches.map((colour) => colour.toHex())).toEqual(["#ff0000", "#00ff00"]);
    expect(Object.isFrozen(snapshot.pickers)).toBe(true);
    expect(Object.isFrozen(snapshot.recents)).toBe(true);
    expect(Object.isFrozen(snapshot.swatches)).toBe(true);
  });

  it("registers exactly one canonical undo action for a committed gesture", async () => {
    const runtime = createSynCloudOS({ id: "colour:undo", environment: createTestRuntimeEnvironment() });
    const undo = createUndoManager({ runtimeId: runtime.runtimeId, owner: { kind: "application", id: "paint" }, maxEntries: 20, randomUUID: () => "colour-undo" });
    const controller = new NSEColourPanelController(runtime, { undoManager: undo });
    let value = GFXColour.parse("#000000");
    const commit = vi.fn((change) => { value = change.current; });
    controller.activateTarget({ id: "well", responderId: "well:responder", read: () => value, preview: (change) => { value = change.current; }, commit, cancel: (change) => { value = change.current; } });
    for (let index = 1; index <= 120; index += 1) controller.preview(GFXColour.rgba(index / 120, 0, 0), "pointer");
    controller.commit(GFXColour.parse("#ff0000"), "pointer");

    expect(undo.inspect().entries).toEqual([expect.objectContaining({ actionCount: 1 })]);
    expect(commit).toHaveBeenCalledTimes(1);
    await undo.undo();
    expect(value.toHex()).toBe("#000000");
    expect(undo.inspect().entries).toHaveLength(1);
  });

  it("creates no undo entry for preview cancellation or equal commits", () => {
    const runtime = createSynCloudOS({ id: "colour:undo-noop", environment: createTestRuntimeEnvironment() });
    const undo = createUndoManager({ runtimeId: runtime.runtimeId, owner: { kind: "application", id: "paint" }, maxEntries: 20, randomUUID: () => "colour-undo-noop" });
    const controller = new NSEColourPanelController(runtime, { undoManager: undo });
    let value = GFXColour.parse("#000000");
    controller.activateTarget({ id: "well", responderId: "well:responder", read: () => value, preview: (change) => { value = change.current; }, commit: (change) => { value = change.current; }, cancel: (change) => { value = change.current; } });
    controller.preview(GFXColour.parse("#ff0000"), "pointer");
    controller.cancel("escape");
    controller.commit(GFXColour.parse("#000000"), "keyboard");
    expect(undo.inspect().entries).toEqual([]);
  });

  it("restores the target and service preview when undo admission rejects", () => {
    const runtime = createSynCloudOS({ id: "colour:undo-reject", environment: createTestRuntimeEnvironment() });
    const cancel = vi.fn();
    const undo = {
      reserve: () => ({ commit: () => { throw new Error("undo admission rejected"); }, cancel }),
    } as never;
    const controller = new NSEColourPanelController(runtime, { undoManager: undo });
    let value = GFXColour.parse("#000000");
    controller.activateTarget({
      id: "well",
      responderId: "well:responder",
      read: () => value,
      preview: ({ current }) => { value = current; },
      commit: ({ current }) => { value = current; },
      cancel: ({ current }) => { value = current; },
    });

    expect(() => controller.commit(GFXColour.parse("#ff0000"), "keyboard")).toThrow(/undo admission/i);
    expect(value.toCSS()).toBe(GFXColour.parse("#000000").toCSS());
    expect(controller.getSnapshot().current?.toCSS()).toBe(GFXColour.parse("#000000").toCSS());
    expect(controller.getSnapshot().previous?.toCSS()).toBe(GFXColour.parse("#000000").toCSS());
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("reports an unknown target outcome rather than firing an unproven inverse", () => {
    const runtime = createSynCloudOS({ id: "colour:target-reject", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime);
    let value = GFXColour.parse("#000000");
    let commits = 0;
    controller.activateTarget({
      id: "well",
      responderId: "well:responder",
      read: () => value,
      preview: ({ current }) => { value = current; },
      commit: ({ current }) => {
        value = current;
        commits += 1;
        if (commits === 1) throw new Error("target commit failed after publish");
      },
      cancel: ({ current }) => { value = current; },
    });

    expect(() => controller.commit(GFXColour.parse("#ff0000"), "keyboard")).toThrow(/unknown/i);
    // The target threw before it acknowledged publication. It may already
    // have changed its host model, so the controller must not issue a second
    // target commit that only pretends to roll it back.
    expect(value.toCSS()).toBe(GFXColour.parse("#ff0000").toCSS());
    // The service must retain its uncommitted preview rather than issuing a
    // rollback preview that could overwrite the target's unknown commit.
    expect(controller.getSnapshot().current?.toCSS()).toBe(GFXColour.parse("#ff0000").toCSS());
    expect(controller.getSnapshot().previous?.toCSS()).toBe(GFXColour.parse("#000000").toCSS());
    expect(commits).toBe(1);
  });

  it("retains an unacknowledged preview when its target throws after changing the host model", () => {
    const runtime = createSynCloudOS({ id: "colour:preview-reject", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime);
    let value = GFXColour.parse("#000000");
    const commit = vi.fn();
    controller.activateTarget({
      id: "well",
      responderId: "well:responder",
      read: () => value,
      preview: ({ current }) => {
        value = current;
        throw new Error("target preview failed after publish");
      },
      commit,
      cancel: vi.fn(),
    });

    expect(() => controller.commit(GFXColour.parse("#ff0000"), "keyboard")).toThrow(/unknown/i);
    expect(value.toCSS()).toBe(GFXColour.parse("#ff0000").toCSS());
    expect(commit).not.toHaveBeenCalled();
    expect(controller.getSnapshot().current?.toCSS()).toBe(GFXColour.parse("#ff0000").toCSS());
    expect(controller.getSnapshot().previous?.toCSS()).toBe(GFXColour.parse("#000000").toCSS());
  });

  it("hydrates validated palettes through the preferences controller", () => {
    const values = new Map<string, unknown>();
    values.set("paint.palette", ["syncloudos:nse-preferences:v1", 1, { recents: ["rgb(0 0 255)"], swatches: ["rgb(255 0 0)"] }]);
    const preferences = createNSEColourPanelPreferences({
      getPreference: (key, fallback) => values.has(key) ? values.get(key) as typeof fallback : fallback,
      setPreference: (key, value) => { values.set(key, value); return true; },
      removePreference: (key) => { values.delete(key); },
    }, "paint.palette");
    const runtime = createSynCloudOS({ id: "colour:preferences", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime, { preferences });
    expect(controller.getSnapshot().recents.map((colour) => colour.toHex())).toEqual(["#0000ff"]);
    expect(controller.getSnapshot().swatches.map((colour) => colour.toHex())).toEqual(["#ff0000"]);
  });

  it("rejects failed runtime preference writes before mutating palette authority", () => {
    const preferences = createNSEColourPanelPreferences({
      getPreference: (_key, fallback) => fallback,
      setPreference: () => false,
      removePreference: () => undefined,
    }, "paint.palette");
    const runtime = createSynCloudOS({ id: "colour:preferences-fail", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime, { preferences });
    expect(() => controller.setSwatches([GFXColour.parse("#ff0000")])).toThrow(/persist/i);
    expect(runtime.colourPanel.getSnapshot().swatches).toEqual([]);
  });

  it("repairs corrupt and oversized palettes and rejects future preference versions", () => {
    const values = new Map<string, unknown>([["paint.palette", ["syncloudos:nse-preferences:v1", 1, { recents: Array.from({ length: 17 }, () => "rgb(0 0 0)"), swatches: ["not-a-colour"] }]]]);
    const writes = vi.fn((key: string, value: unknown) => { values.set(key, value); return true; });
    const repaired = createNSEColourPanelPreferences({ getPreference: (key, fallback) => values.get(key) as typeof fallback ?? fallback, setPreference: writes, removePreference: (key) => { values.delete(key); } }, "paint.palette");
    expect(repaired.getSnapshot().value).toEqual({ recents: [], swatches: [] });
    expect(writes).toHaveBeenCalledTimes(1);

    values.set("paint.palette", ["syncloudos:nse-preferences:v1", 2, { recents: [], swatches: [] }]);
    expect(() => createNSEColourPanelPreferences({ getPreference: (key, fallback) => values.get(key) as typeof fallback ?? fallback, setPreference: writes, removePreference: () => undefined }, "paint.palette")).toThrow(/future version/);
  });

  it("registers validated runtime commands over the injected transfer seam", async () => {
    const runtime = createSynCloudOS({ id: "colour:commands", environment: createTestRuntimeEnvironment() });
    let value = GFXColour.parse("#000000");
    const write = vi.fn(async () => ({ kind: "written" as const }));
    const controller = new NSEColourPanelController(runtime, { transferAdapter: { write, read: async () => ({ kind: "accepted", payload: { type: "application/x-syncloudos-colour", value: "rgb(255 0 0)" } }) } });
    controller.activateTarget({ id: "well", responderId: "runtime", read: () => value, preview: (change) => { value = change.current; }, commit: (change) => { value = change.current; }, cancel: (change) => { value = change.current; } });
    const unregister = controller.registerCommands(runtime.commands, "runtime");

    await expect(runtime.commands.dispatch("colour-panel.show")).resolves.toMatchObject({ status: "executed" });
    expect(runtime.colourPanel.getSnapshot().open).toBe(true);
    await runtime.commands.dispatch("colour-panel.copy");
    expect(write).toHaveBeenCalledWith({ type: "application/x-syncloudos-colour", value: "rgb(0 0 0)" }, expect.any(AbortSignal));
    await runtime.commands.dispatch("colour-panel.paste");
    expect(value.toHex()).toBe("#ff0000");
    unregister();
    expect(runtime.commands.inspect().registrations.filter(({ commandId }) => commandId.startsWith("colour-panel."))).toEqual([]);
  });

  it("fences deferred paste to the accepted target generation", async () => {
    const runtime = createSynCloudOS({ id: "colour:deferred-paste", environment: createTestRuntimeEnvironment() });
    let resolveRead!: (result: { readonly kind: "accepted"; readonly payload: { readonly type: "application/x-syncloudos-colour"; readonly value: string } }) => void;
    const controller = new NSEColourPanelController(runtime, {
      transferAdapter: {
        read: () => new Promise((resolve) => { resolveRead = resolve; }),
        write: async () => ({ kind: "written" }),
      },
    });
    let first = GFXColour.parse("black");
    let second = GFXColour.parse("black");
    const releaseFirst = controller.activateTarget({
      id: "first",
      responderId: "runtime",
      read: () => first,
      preview: ({ current }) => { first = current; },
      commit: ({ current }) => { first = current; },
      cancel: ({ current }) => { first = current; },
    });
    const unregister = controller.registerCommands(runtime.commands, "runtime");
    const dispatch = runtime.commands.dispatch("colour-panel.paste");
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    releaseFirst();
    controller.activateTarget({
      id: "second",
      responderId: "runtime",
      read: () => second,
      preview: ({ current }) => { second = current; },
      commit: ({ current }) => { second = current; },
      cancel: ({ current }) => { second = current; },
    });
    resolveRead({ kind: "accepted", payload: { type: "application/x-syncloudos-colour", value: "rgb(255 0 0)" } });
    await dispatch;
    expect(first.toHex()).toBe("#000000");
    expect(second.toHex()).toBe("#000000");
    unregister();
  });
});
