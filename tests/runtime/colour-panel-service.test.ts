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

import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import type { ColourPanelTargetRegistration } from "../../src/SynCloudOS/ColourPanel";
import { createTestRuntimeEnvironment } from "./helpers";

const target = (id: string, initial = "#000000") => {
  let value = initial;
  const registration: ColourPanelTargetRegistration = {
    id,
    responderId: `${id}:responder`,
    read: () => value,
    preview: vi.fn((change) => { value = change.currentCSS; }),
    commit: vi.fn((change) => { value = change.currentCSS; }),
    cancel: vi.fn((change) => { value = change.currentCSS; }),
  };
  return registration;
};

describe("ColourPanelService", () => {
  it("preserves a reentrant target activated while switching away from the current target", () => {
    const runtime = createSynCloudOS({ id: "colour:reentrant-switch", environment: createTestRuntimeEnvironment() });
    const third = target("third", "#0000ff");
    let reentered = false;
    const first = {
      ...target("first", "#000000"),
      commit: vi.fn(() => {
        if (reentered) return;
        reentered = true;
        runtime.colourPanel.activateTarget(third);
      }),
    };
    runtime.colourPanel.activateTarget(first);
    runtime.colourPanel.preview("#ff0000", "pointer");

    runtime.colourPanel.activateTarget(target("second", "#00ff00"));

    expect(runtime.colourPanel.getSnapshot().activeTargetId).toBe("third");
    expect(first.commit).toHaveBeenCalledTimes(1);
  });

  it("preserves a reentrant target activated by the disconnect cancellation callback", () => {
    const runtime = createSynCloudOS({ id: "colour:reentrant-release", environment: createTestRuntimeEnvironment() });
    const third = target("third", "#0000ff");
    const first = {
      ...target("first", "#000000"),
      cancel: vi.fn(() => { runtime.colourPanel.activateTarget(third); }),
    };
    const release = runtime.colourPanel.activateTarget(first);
    runtime.colourPanel.preview("#ff0000", "pointer");

    release();

    expect(runtime.colourPanel.getSnapshot().activeTargetId).toBe("third");
    expect(first.cancel).toHaveBeenCalledTimes(1);
  });
  it("stays open without a target when its target goes away, as NSColorPanel does", () => {
    const runtime = createSynCloudOS({ id: "colour:target-gone", environment: createTestRuntimeEnvironment() });
    const release = runtime.colourPanel.activateTarget(target("well", "#336699"));
    runtime.colourPanel.open();

    release();

    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ open: true, activeTargetId: null, currentCSS: "#336699" });
    // Still a colour chooser: a colour can be picked with nothing to apply it to.
    runtime.colourPanel.commit("#00ff00", "swatch");
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ currentCSS: "#00ff00", previousCSS: "#00ff00" });
    expect(runtime.colourPanel.getSnapshot().recents[0]).toBe("#00ff00");
    runtime.colourPanel.activateTarget(target("next", "#aa0000"));
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ open: true, activeTargetId: "next", currentCSS: "#aa0000" });
  });

  it("is allocated once per runtime and isolates concurrent runtimes", async () => {
    const first = createSynCloudOS({ id: "colour:first", environment: createTestRuntimeEnvironment() });
    const second = createSynCloudOS({ id: "colour:second", environment: createTestRuntimeEnvironment() });
    expect(first.colourPanel).not.toBe(second.colourPanel);
    first.colourPanel.activateTarget(target("first"));
    first.colourPanel.open();
    first.colourPanel.preview("#ff0000", "keyboard");
    expect(first.colourPanel.getSnapshot()).toMatchObject({ open: true, currentCSS: "#ff0000" });
    expect(second.colourPanel.getSnapshot()).toMatchObject({ open: false, currentCSS: null });
    await first.dispose("test");
    await second.dispose("test");
  });

  it("orders pickers deterministically and returns idempotent registrations", () => {
    const runtime = createSynCloudOS({ id: "colour:pickers", environment: createTestRuntimeEnvironment() });
    const removeB = runtime.colourPanel.registerPicker({ id: "b", label: "B", order: 1, supportedSpaces: ["srgb"] });
    runtime.colourPanel.registerPicker({ id: "a", label: "A", order: 1, supportedSpaces: ["srgb"] });
    runtime.colourPanel.registerPicker({ id: "z", label: "Z", order: 0, supportedSpaces: ["srgb"] });
    expect(runtime.colourPanel.getPickers().map(({ id }) => id)).toEqual(["z", "a", "b"]);
    removeB();
    removeB();
    expect(runtime.colourPanel.getPickers().map(({ id }) => id)).toEqual(["z", "a"]);
    expect(runtime.colourPanel.getSnapshot().pickers.map(({ id }) => id)).toEqual(["z", "a"]);
  });

  it("publishes immutable recents and swatches without exposing mutable service state", () => {
    const runtime = createSynCloudOS({ id: "colour:palettes", environment: createTestRuntimeEnvironment() });
    runtime.colourPanel.setSwatches(["rgb(255 0 0)", "rgb(0 128 0)"]);
    runtime.colourPanel.addRecent("rgb(255 0 0)");
    const snapshot = runtime.colourPanel.getSnapshot();
    expect(snapshot.swatches).toEqual(["rgb(255 0 0)", "rgb(0 128 0)"]);
    expect(snapshot.recents).toEqual(["rgb(255 0 0)"]);
    expect(Object.isFrozen(snapshot.swatches)).toBe(true);
  });

  it("keeps replacement picker and target leases alive after stale same-ID cleanup", () => {
    const runtime = createSynCloudOS({ id: "colour:leases", environment: createTestRuntimeEnvironment() });
    const stalePicker = runtime.colourPanel.registerPicker({ id: "wheel", label: "Old", order: 1, supportedSpaces: ["srgb"] });
    runtime.colourPanel.registerPicker({ id: "wheel", label: "Current", order: 1, supportedSpaces: ["srgb"] });
    stalePicker();
    expect(runtime.colourPanel.getSnapshot().pickers.map(({ label }) => label)).toEqual(["Current"]);
    const staleTarget = runtime.colourPanel.activateTarget(target("well", "#000"));
    runtime.colourPanel.activateTarget(target("well", "#fff"));
    staleTarget();
    expect(runtime.colourPanel.getSnapshot().activeTargetId).toBe("well");
  });

  it("rejects malformed nonfinite and noncanonical ingress without publication or target mutation", () => {
    const runtime = createSynCloudOS({ id: "colour:ingress", environment: createTestRuntimeEnvironment() });
    const active = target("well", "#000");
    runtime.colourPanel.activateTarget(active);
    const revision = runtime.colourPanel.getSnapshot().revision;
    for (const invalid of ["rgb(NaN 0 0)", "rgb(Infinity 0 0)", "rgb(-0 0 0)", "rgb(999 0 0)", "hsl(0 100% 50%)", "#12345"]) {
      expect(() => runtime.colourPanel.preview(invalid, "text")).toThrow(/valid bounded CSS/);
    }
    expect(runtime.colourPanel.getSnapshot().revision).toBe(revision);
    expect(active.preview).not.toHaveBeenCalled();
    expect(runtime.colourPanel.getSnapshot().recents).toEqual([]);
  });

  it("commits the previous target before switching and cancels on disconnect", () => {
    const runtime = createSynCloudOS({ id: "colour:handoff", environment: createTestRuntimeEnvironment() });
    const first = target("first", "#000000");
    const second = target("second", "#ffffff");
    const disconnect = runtime.colourPanel.activateTarget(first);
    runtime.colourPanel.preview("#ff0000", "pointer");
    runtime.colourPanel.activateTarget(second);
    expect(first.commit).toHaveBeenCalledWith(expect.objectContaining({ phase: "commit", reason: "target-switch" }));
    disconnect();
    expect(runtime.colourPanel.getSnapshot().activeTargetId).toBe("second");
    const disconnectSecond = runtime.colourPanel.activateTarget(second);
    runtime.colourPanel.preview("#00ff00", "keyboard");
    disconnectSecond();
    expect(second.cancel).toHaveBeenCalledWith(expect.objectContaining({ phase: "cancel", reason: "disconnect" }));
  });

  it("does not publish equal values and isolates throwing subscribers", () => {
    const runtime = createSynCloudOS({ id: "colour:notify", environment: createTestRuntimeEnvironment() });
    const listener = vi.fn();
    runtime.colourPanel.subscribe(() => { throw new Error("subscriber"); });
    runtime.colourPanel.subscribe(listener);
    runtime.colourPanel.activateTarget(target("well", "#000000"));
    const revision = runtime.colourPanel.getSnapshot().revision;
    runtime.colourPanel.preview("#000000", "keyboard");
    expect(runtime.colourPanel.getSnapshot().revision).toBe(revision);
    runtime.colourPanel.preview("#ffffff", "keyboard");
    expect(listener).toHaveBeenCalled();
  });

  it("cancels the active target and rejects mutation after idempotent disposal", async () => {
    const runtime = createSynCloudOS({ id: "colour:dispose", environment: createTestRuntimeEnvironment() });
    const active = target("well");
    runtime.colourPanel.activateTarget(active);
    runtime.colourPanel.preview("#ff0000", "pointer");
    const listener = vi.fn();
    runtime.colourPanel.subscribe(listener);
    await runtime.dispose("test");
    expect(runtime.colourPanel.getSnapshot().status).toBe("disposed");
    expect(active.cancel).toHaveBeenCalledWith(expect.objectContaining({ phase: "cancel", reason: "dispose" }));
    expect(() => runtime.colourPanel.open()).toThrow(/disposed/);
    const calls = listener.mock.calls.length;
    await runtime.dispose("test");
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("maps overlay dismissal and target disconnect to exact cancellation reasons", () => {
    const runtime = createSynCloudOS({ id: "colour:dismiss", environment: createTestRuntimeEnvironment() });
    const active = target("well");
    runtime.colourPanel.activateTarget(active);
    runtime.colourPanel.open();
    runtime.colourPanel.close("escape");
    expect(active.cancel).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "cancel", reason: "escape" }));
    const disconnect = runtime.colourPanel.activateTarget(active);
    disconnect();
    expect(active.cancel).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "cancel", reason: "disconnect" }));
  });

  it.each(["outside-pointer", "focus-left", "anchor-removed", "parent-dismissed", "programmatic"] as const)(
    "preserves the %s overlay reason without leaking a close reason into changes",
    (reason) => {
      const runtime = createSynCloudOS({ id: `colour:dismiss:${reason}`, environment: createTestRuntimeEnvironment() });
      const active = target("well");
      runtime.colourPanel.activateTarget(active);
      runtime.colourPanel.preview("#ff0000", "pointer");
      runtime.colourPanel.open();
      runtime.colourPanel.close(reason);
      expect(active.cancel).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "cancel", reason }));
      expect(runtime.colourPanel.getSnapshot().open).toBe(false);
    },
  );

  it("keeps service state atomic when target reads or commits fail", () => {
    const runtime = createSynCloudOS({ id: "colour:atomic", environment: createTestRuntimeEnvironment() });
    const first = target("first", "#000000");
    runtime.colourPanel.activateTarget(first);
    const beforeReplacement = runtime.colourPanel.getSnapshot();

    expect(() => runtime.colourPanel.activateTarget({
      ...target("broken"),
      read: () => "not-a-colour",
    })).toThrow(/valid bounded CSS/);
    expect(runtime.colourPanel.getSnapshot()).toBe(beforeReplacement);
    expect(first.commit).not.toHaveBeenCalled();

    runtime.colourPanel.preview("#ff0000", "pointer");
    const beforeCommit = runtime.colourPanel.getSnapshot();
    vi.mocked(first.commit).mockImplementation(() => { throw new Error("commit failed"); });
    expect(() => runtime.colourPanel.commit("#ff0000", "pointer")).toThrow("commit failed");
    expect(runtime.colourPanel.getSnapshot()).toBe(beforeCommit);
    expect(runtime.colourPanel.getSnapshot().recents).toEqual([]);
  });

  it("does not create service transactions for equal values or duplicate palettes", () => {
    const runtime = createSynCloudOS({ id: "colour:no-op", environment: createTestRuntimeEnvironment() });
    const active = target("well", "#000000");
    runtime.colourPanel.activateTarget(active);
    const activeRevision = runtime.colourPanel.getSnapshot().revision;
    runtime.colourPanel.commit("#000000", "keyboard");
    expect(runtime.colourPanel.getSnapshot().revision).toBe(activeRevision);
    expect(active.commit).not.toHaveBeenCalled();

    runtime.colourPanel.setSwatches(["#ff0000"]);
    const paletteRevision = runtime.colourPanel.getSnapshot().revision;
    runtime.colourPanel.setSwatches(["#ff0000"]);
    runtime.colourPanel.addRecent("#ffffff");
    const recentRevision = runtime.colourPanel.getSnapshot().revision;
    runtime.colourPanel.addRecent("#ffffff");
    expect(recentRevision).toBe(paletteRevision + 1);
    expect(runtime.colourPanel.getSnapshot().revision).toBe(recentRevision);
  });

  it("survives cancelled runtime disposal and disposes live leases on retry", async () => {
    const runtime = createSynCloudOS({ id: "colour:disposal-retry", environment: createTestRuntimeEnvironment() });
    const active = target("well");
    runtime.colourPanel.activateTarget(active);
    runtime.colourPanel.registerPicker({ id: "wheel", label: "Wheel", order: 0, supportedSpaces: ["srgb"] });
    const blocker = runtime.registerDisposalParticipant({
      id: "colour-disposal-review",
      prepare: () => ({ status: "cancelled", reason: "keep runtime live" }),
    });

    await expect(runtime.dispose("first attempt")).resolves.toMatchObject({ status: "cancelled" });
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ status: "active", activeTargetId: "well" });
    expect(runtime.colourPanel.getSnapshot().pickers).toHaveLength(1);
    expect(blocker.unregister()).toBe(true);

    await expect(runtime.dispose("retry")).resolves.toMatchObject({ status: "disposed" });
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ status: "disposed", activeTargetId: null, pickers: [] });
    expect(() => runtime.colourPanel.registerPicker({ id: "late", label: "Late", order: 0, supportedSpaces: ["srgb"] })).toThrow(/disposed/);
  });

  it("finishes service disposal and reports a throwing target cancellation", async () => {
    const runtime = createSynCloudOS({ id: "colour:dispose-failure", environment: createTestRuntimeEnvironment() });
    runtime.colourPanel.activateTarget({
      ...target("well"),
      cancel: () => { throw new Error("target cancel failed"); },
    });
    runtime.colourPanel.preview("#ff0000", "pointer");

    const result = await runtime.dispose("test");
    expect(result).toMatchObject({
      status: "disposed",
      errors: [expect.objectContaining({ participantId: "runtime:colour-panel", phase: "commit", message: "target cancel failed" })],
    });
    expect(runtime.colourPanel.getSnapshot().status).toBe("disposed");
    expect(() => runtime.colourPanel.open()).toThrow(/disposed/);
  });

  it("does not publish a preview after the callback releases its own target", () => {
    const runtime = createSynCloudOS({ id: "colour:self-release", environment: createTestRuntimeEnvironment() });
    let release = () => undefined;
    release = runtime.colourPanel.activateTarget({
      ...target("well"),
      preview: () => release(),
    });
    runtime.colourPanel.open();
    runtime.colourPanel.preview("rgb(255 0 0)", "pointer");
    // The panel stays up for the next target, showing the target's colour,
    // not the preview it never acknowledged.
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({
      open: true,
      activeTargetId: null,
      currentCSS: "#000000",
      previousCSS: "#000000",
    });
  });

  it("rejects sparse and accessor-backed palette ingress before executing getters", () => {
    const runtime = createSynCloudOS({ id: "colour:palette-ingress", environment: createTestRuntimeEnvironment() });
    const sparse = new Array<string>(2);
    sparse[1] = "rgb(255 0 0)";
    expect(() => runtime.colourPanel.setSwatches(sparse)).toThrow(TypeError);

    const getter = vi.fn(() => "rgb(255 0 0)");
    const accessor = Object.create(Array.prototype, {
      length: { value: 1 },
      0: { get: getter },
    }) as readonly string[];
    expect(() => runtime.colourPanel.setSwatches(accessor)).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
    expect(runtime.colourPanel.getSnapshot().swatches).toEqual([]);
  });
});
