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
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AFXAnimationSettlement } from "../../src/FX/AnimationFX/animationTypes";
import { NSEAnimationEnvironmentProvider, type NSEAnimator } from "../../src/NSE/Animation";
import { NSEPicker } from "../../src/NSE/Menus";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { createTransientWindowSurfaceBridge, WindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { WindowLayer } from "../../src/Webspring/WindowLayer/WindowLayer";
import { createTestRuntime } from "./helpers";

describe("window-hosted transient surface bridge", () => {
  it("creates one real window sheet for an application stage and cleans both renderer registries", async () => {
    const runtime = createTestRuntime({ id: "runtime:p07-surface" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({
      runtime,
      renderers,
      physicalHostId: "test:first-sheet",
      owner: { workspaceId: "workspace:default", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" },
    });
    const request = {
      id: "gallery:toolbar-configuration",
      role: "sheet" as const,
      title: "Customize toolbar",
      parentWindowControllerId: null,
      anchor: null,
      bounds: { x: 180, y: 120, width: 520, height: 420 },
    };

    const [first, replay] = await Promise.all([
      bridge.present(request, <div data-testid="p07-sheet-content">Toolbar configuration</div>),
      bridge.present(request, <div data-testid="p07-sheet-content">Toolbar configuration</div>),
    ]);

    expect(replay).toBe(first);
    expect(runtime.windows.snapshot().windowControllerIds).toEqual([first]);
    expect(runtime.windows.select(first).record).toMatchObject({
      role: "sheet",
      applicationId: "com.example.gallery",
      applicationSessionId: "com.example.gallery",
      parentWindowControllerId: null,
      state: "open",
    });
    expect(renderers.size).toBe(1);
    expect(document.querySelector("[data-nse-overlay-kind='action-sheet']")).toBeNull();

    await bridge.dismiss(request.id);
    expect(runtime.windows.snapshot().windowControllerIds).toEqual([]);
    expect(renderers.size).toBe(0);
    bridge.dispose();
    await runtime.dispose("test");
  });

  it("presents a system-owned panel that belongs to no app", async () => {
    const runtime = createTestRuntime({ id: "runtime:p07-system-panel" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({
      runtime,
      renderers,
      physicalHostId: "system-panels",
      owner: { workspaceId: "workspace:default", applicationId: null, applicationSessionId: null },
    });
    const id = await bridge.present({ id: "fonts", role: "panel", title: "Font", parentWindowControllerId: null, anchor: null, bounds: { x: 40, y: 40, width: 400, height: 320 } }, <p>Fonts</p>);
    expect(runtime.windows.select(id).record).toMatchObject({ applicationId: null, applicationSessionId: null, role: "panel", level: "floating", state: "open" });
    await bridge.dismiss("fonts");
    bridge.dispose();
    await runtime.dispose("test");
  });

  it("fades a closed panel out with its last frame instead of cutting it", async () => {
    const runtime = createTestRuntime({ id: "runtime:p07-panel-exit" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({
      runtime,
      renderers,
      physicalHostId: "system-panels",
      owner: { workspaceId: "workspace:default", applicationId: null, applicationSessionId: null },
    });
    const exits = new Map<Element, () => Promise<void>>();
    const animator: NSEAnimator = {
      ownerAppId: "syncloudos.system",
      animations: {
        acquireOwner: (owner) => Object.freeze({ ...owner, epoch: 1, release() {} }),
        animate(target, definition) {
          let resolve!: (settlement: AFXAnimationSettlement) => void;
          const finished = new Promise<AFXAnimationSettlement>((done) => { resolve = done; });
          if ((definition as { fill?: string }).fill === "forwards") {
            exits.set(target as Element, async () => { resolve({ state: "completed", reduced: false }); await act(async () => { await finished; }); });
          }
          return { id: "exit", finished, progress: 0, cancel: () => resolve({ state: "cancelled", reduced: false }), seek() {}, pause() {}, resume() {} };
        },
      } as NSEAnimator["animations"],
    };
    await bridge.present({ id: "fonts", role: "panel", title: "Font", parentWindowControllerId: null, anchor: null, bounds: { x: 40, y: 40, width: 400, height: 320 } }, <p>Font panel content</p>);
    render(
      <SynCloudOSProvider runtime={runtime}>
        <NSEAnimationEnvironmentProvider animator={animator}><WindowLayer contentRegistry={renderers} /></NSEAnimationEnvironmentProvider>
      </SynCloudOSProvider>,
    );
    await screen.findByText("Font panel content");

    await act(async () => { await bridge.dismiss("fonts"); });
    expect(runtime.windows.snapshot().windowControllerIds).toEqual([]);
    const exiting = document.querySelector("[data-window-exiting]");
    expect(exiting?.textContent).toContain("Font panel content");
    expect(exiting?.hasAttribute("inert")).toBe(true);

    await exits.get(exiting!)!();
    expect(document.querySelector("[data-window-host]")).toBeNull();
    bridge.dispose();
    await runtime.dispose("test");
  });

  it("hangs an untitled popover off its anchor, flipping above when only that fits", async () => {
    const runtime = createTestRuntime({ id: "runtime:p07-popover-placement" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:popover-placement", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const anchor = document.createElement("button");
    anchor.id = "popover-anchor";
    document.body.append(anchor);
    const place = (top: number) => vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 300, y: top, width: 100, height: 30 }));
    place(400);
    const request = { id: "placed", role: "popover" as const, title: "Popover", parentWindowControllerId: null, anchor, bounds: { x: 180, y: 120, width: 360, height: 280 } };
    const windowControllerId = await bridge.present(request, <p>Placed</p>);
    const record = () => runtime.windows.select(windowControllerId).record;

    // Centred on the anchor, 10px below it (jsdom's viewport is 1024 x 768).
    expect(record()).toMatchObject({
      style: ["closable"],
      bounds: { x: 170, y: 440, width: 360, height: 280 },
      anchor: { id: "popover-anchor", edge: "block-end", alignment: "center" },
    });

    place(700);
    await bridge.present({ ...request }, <p>Placed</p>);
    expect(record()).toMatchObject({
      bounds: { x: 170, y: 410 },
      anchor: { edge: "block-start", alignment: "center" },
    });
    anchor.remove();
    bridge.dispose();
    await Promise.resolve();
    await runtime.dispose("test");
  });

  it("keeps identical surface IDs isolated across two runtime-owned bridges", async () => {
    const firstRuntime = createTestRuntime({ id: "runtime:p07:first" });
    const secondRuntime = createTestRuntime({ id: "runtime:p07:second" });
    const firstRenderers = new WindowContentRendererRegistry();
    const secondRenderers = new WindowContentRendererRegistry();
    const first = createTransientWindowSurfaceBridge({ runtime: firstRuntime, renderers: firstRenderers, physicalHostId: "stage:first", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const second = createTransientWindowSurfaceBridge({ runtime: secondRuntime, renderers: secondRenderers, physicalHostId: "stage:second", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const request = { id: "shared", role: "panel" as const, title: "Media", parentWindowControllerId: null, anchor: null, bounds: { x: 0, y: 0, width: 400, height: 320 } };

    await first.present(request, <p>First</p>);
    await second.present(request, <p>Second</p>);
    expect(firstRuntime.windows.snapshot().windowControllerIds).toHaveLength(1);
    expect(secondRuntime.windows.snapshot().windowControllerIds).toHaveLength(1);

    first.dispose();
    await Promise.resolve();
    expect(secondRuntime.windows.snapshot().windowControllerIds).toHaveLength(1);
    second.dispose();
    await Promise.all([firstRuntime.dispose("test"), secondRuntime.dispose("test")]);
  });

  it("propagates a native window close to the originating surface exactly once", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-native-close" });
    const renderers = new WindowContentRendererRegistry();
    const onDidClose = vi.fn();
    const bridge = createTransientWindowSurfaceBridge({
      runtime,
      renderers,
      physicalHostId: "test:native-close",
      owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" },
    });
    const request = {
      id: "toolbar-configuration",
      role: "sheet" as const,
      title: "Customize toolbar",
      parentWindowControllerId: null,
      anchor: null,
      bounds: { x: 0, y: 0, width: 520, height: 420 },
      onDidClose,
    };

    const windowControllerId = await bridge.present(request, <p>Configuration</p>);
    await runtime.windows.requestClose(windowControllerId, { reason: "control" });

    expect(onDidClose).toHaveBeenCalledTimes(1);
    expect(renderers.size).toBe(0);
    expect(runtime.windows.snapshot().windowControllerIds).toEqual([]);
    bridge.dispose();
    await runtime.dispose("test");
  });

  it("preserves the renderer and entry when window refuses a requested close", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-refused-close" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({
      runtime,
      renderers,
      physicalHostId: "test:refused-close",
      owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" },
    });
    const request = { id: "media", role: "panel" as const, title: "Media", parentWindowControllerId: null, anchor: null, bounds: { x: 0, y: 0, width: 500, height: 400 } };
    const windowControllerId = await bridge.present(request, <p>Media</p>);
    const requestClose = vi.spyOn(runtime.windows, "requestClose").mockResolvedValue({ outcome: "refused", windowControllerId, reason: "blocked" });

    await bridge.dismiss(request.id);

    expect(renderers.size).toBe(1);
    expect(runtime.windows.snapshot().windowControllerIds).toEqual([windowControllerId]);
    requestClose.mockRestore();
    bridge.dispose();
    await Promise.resolve();
    await runtime.dispose("test");
  });

  it("keeps factory ownership alive until a noncooperative pending open settles after disposal", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-pending-dispose" });
    const renderers = new WindowContentRendererRegistry();
    let continueOpen!: () => void;
    const gate = new Promise<void>((resolve) => { continueOpen = resolve; });
    const originalOpen = runtime.windows.open.bind(runtime.windows);
    vi.spyOn(runtime.windows, "open").mockImplementation(async (id, options) => {
      await gate;
      return originalOpen(id, options);
    });
    const bridge = createTransientWindowSurfaceBridge({
      runtime,
      renderers,
      physicalHostId: "test:pending-dispose",
      owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" },
    });
    const pending = bridge.present({ id: "pending", role: "panel", title: "Pending", parentWindowControllerId: null, anchor: null, bounds: { x: 0, y: 0, width: 400, height: 320 } }, <p>Pending</p>);
    await Promise.resolve();

    bridge.dispose();
    continueOpen();

    await expect(pending).rejects.toThrow(/disposed/i);
    await vi.waitFor(() => expect(runtime.windows.snapshot().windowControllerIds).toEqual([]));
    expect(renderers.size).toBe(0);
    await runtime.dispose("test");
  });

  it("isolates same-owner bridge instances by stable physical host identity", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-hosts" });
    const renderers = new WindowContentRendererRegistry();
    const createForHost = createTransientWindowSurfaceBridge;
    const owner = { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" };
    const first = createForHost({ runtime, renderers, owner, physicalHostId: "stage:gallery" });
    const second = createForHost({ runtime, renderers, owner, physicalHostId: "window:gallery-main" });
    const request = { id: "shared", role: "panel" as const, title: "Media", parentWindowControllerId: null, anchor: null, bounds: { x: 0, y: 0, width: 400, height: 320 } };

    const [firstId, secondId] = await Promise.all([
      first.present(request, <p>Stage</p>),
      second.present(request, <p>Window</p>),
    ]);

    expect(firstId).not.toBe(secondId);
    expect(runtime.windows.snapshot().windowControllerIds).toHaveLength(2);
    expect(renderers.size).toBe(2);
    first.dispose();
    second.dispose();
    await Promise.resolve();
    await runtime.dispose("test");
  });

  it("applies authoritative request changes while a surface remains open", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-update" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({
      runtime,
      renderers,
      physicalHostId: "test:update",
      owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" },
    });
    const first = { id: "mutable", role: "panel" as const, title: "Media", parentWindowControllerId: null, anchor: null, bounds: { x: 0, y: 0, width: 400, height: 320 } };
    const windowControllerId = await bridge.present(first, <p>First content</p>);
    const updated = { ...first, title: "Updated media", bounds: { x: 20, y: 30, width: 620, height: 480 } };

    const updatedControllerId = await bridge.present(updated, <p>Updated content</p>);

    const record = runtime.windows.select(updatedControllerId).record;
    expect(record.title).toBe("Updated media");
    expect(record.bounds).toEqual(updated.bounds);
    expect(updatedControllerId).toBe(windowControllerId);
    bridge.dispose();
    await Promise.resolve();
    await runtime.dispose("test");
  });

  it("publishes title and anchor changes through the window manager", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-publication" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({
      runtime,
      renderers,
      physicalHostId: "test:publication",
      owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" },
    });
    const firstAnchor = document.createElement("button");
    const secondAnchor = document.createElement("button");
    firstAnchor.id = "first-anchor";
    secondAnchor.id = "second-anchor";
    document.body.append(firstAnchor, secondAnchor);
    const request = { id: "anchored", role: "popover" as const, title: "First", parentWindowControllerId: null, anchor: firstAnchor, bounds: { x: 0, y: 0, width: 360, height: 280 } };
    await bridge.present(request, <p>First</p>);
    const published = vi.fn();
    const unsubscribe = runtime.windows.subscribe(published);

    await bridge.present({ ...request, title: "Second", anchor: secondAnchor }, <p>Second</p>);

    expect(published).toHaveBeenCalled();
    expect(runtime.windows.select(runtime.windows.snapshot().windowControllerIds[0]!).record).toMatchObject({
      title: "Second",
      anchor: { id: "second-anchor" },
    });
    unsubscribe();
    bridge.dispose();
    await Promise.resolve();
    await runtime.dispose("test");
  });

  it("restores close notification after a refused reconfiguration", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-refused-reconfigure" });
    const renderers = new WindowContentRendererRegistry();
    const onDidClose = vi.fn();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:refused-reconfigure", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const request = { id: "adaptive", role: "panel" as const, title: "Panel", parentWindowControllerId: null, anchor: null, bounds: { x: 0, y: 0, width: 400, height: 320 }, onDidClose };
    const windowControllerId = await bridge.present(request, <p>Panel</p>);
    const originalClose = runtime.windows.requestClose.bind(runtime.windows);
    const requestClose = vi.spyOn(runtime.windows, "requestClose").mockResolvedValueOnce({ outcome: "refused", windowControllerId, reason: "blocked" });

    await expect(bridge.present({ ...request, role: "sheet" }, <p>Sheet</p>)).rejects.toThrow(/refused/i);
    requestClose.mockImplementation(originalClose);
    await runtime.windows.requestClose(windowControllerId, { reason: "control" });

    expect(onDidClose).toHaveBeenCalledOnce();
    bridge.dispose();
    await runtime.dispose("test");
  });

  it("replays only the latest presentation requested while close is pending", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-latest-intent" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:latest-intent", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const request = { id: "latest", role: "panel" as const, title: "Initial", parentWindowControllerId: null, anchor: null, bounds: { x: 0, y: 0, width: 400, height: 320 } };
    await bridge.present(request, <p>Initial</p>);
    let continueClose!: () => void;
    const closeGate = new Promise<void>((resolve) => { continueClose = resolve; });
    const originalClose = runtime.windows.requestClose.bind(runtime.windows);
    vi.spyOn(runtime.windows, "requestClose").mockImplementation(async (...args) => {
      await closeGate;
      return originalClose(...args);
    });
    const closing = bridge.dismiss(request.id);
    await Promise.resolve();

    const stale = bridge.present({ ...request, title: "Stale" }, <p>Stale</p>);
    const latest = bridge.present({ ...request, title: "Latest", bounds: { x: 20, y: 20, width: 520, height: 420 } }, <p>Latest</p>);
    continueClose();
    await closing;
    const [staleId, latestId] = await Promise.all([stale, latest]);

    expect(staleId).toBe(latestId);
    expect(runtime.windows.snapshot().windowControllerIds).toEqual([latestId]);
    expect(runtime.windows.select(latestId).record).toMatchObject({ title: "Latest", bounds: { x: 20, y: 20, width: 520, height: 420 } });
    expect(renderers.size).toBe(1);
    bridge.dispose();
    await Promise.resolve();
    await runtime.dispose("test");
  });

  it("does not let a superseded generation notify or restore focus", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-generation-fence" });
    const renderers = new WindowContentRendererRegistry();
    const restored = vi.fn();
    const firstClosed = vi.fn();
    const secondClosed = vi.fn();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:generation-fence", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" }, restoreFocus: restored });
    const firstAnchor = document.createElement("button");
    const secondAnchor = document.createElement("button");
    document.body.append(firstAnchor, secondAnchor);
    const base = { id: "generation", role: "popover" as const, title: "First", parentWindowControllerId: null, bounds: { x: 0, y: 0, width: 360, height: 280 } };
    await bridge.present({ ...base, anchor: firstAnchor, onDidClose: firstClosed }, <p>First</p>);
    await bridge.dismiss(base.id);
    await bridge.present({ ...base, title: "Second", anchor: secondAnchor, onDidClose: secondClosed }, <p>Second</p>);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(firstClosed).toHaveBeenCalledOnce();
    expect(secondClosed).not.toHaveBeenCalled();
    expect(restored).not.toHaveBeenCalledWith(firstAnchor);
    bridge.dispose();
    await waitFor(() => expect(renderers.size).toBe(0));
    await runtime.dispose("test");
  });

  it("recovers from a rejected manager close so a fresh dismissal can close the same owned window", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-close-retry" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:close-retry", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const request = { id: "retry-close", role: "panel" as const, title: "Retry close", parentWindowControllerId: null, anchor: null, bounds: { x: 0, y: 0, width: 400, height: 320 } };
    const windowControllerId = await bridge.present(request, <p>Retry close</p>);
    const originalClose = runtime.windows.requestClose.bind(runtime.windows);
    const failure = new Error("manager close failed");
    const requestClose = vi.spyOn(runtime.windows, "requestClose")
      .mockRejectedValueOnce(failure)
      .mockImplementation(originalClose);

    await expect(bridge.dismiss(request.id)).rejects.toBe(failure);
    expect(runtime.windows.snapshot().windowControllerIds).toEqual([windowControllerId]);
    expect(runtime.windows.select(windowControllerId).record.state).toBe("open");
    expect(renderers.size).toBe(1);

    await expect(bridge.dismiss(request.id)).resolves.toMatchObject({ outcome: "closed", windowControllerId });
    expect(requestClose).toHaveBeenCalledTimes(2);
    expect(runtime.windows.snapshot().windowControllerIds).toEqual([]);
    expect(renderers.size).toBe(0);
    bridge.dispose();
    await runtime.dispose("test");
  });

  it("restores focus only for the latest closed generation when an ID reopens and closes before timers run", async () => {
    const runtime = createTestRuntime({ id: "runtime:surface-latest-focus" });
    const scheduled: Array<() => void> = [];
    vi.spyOn(runtime.environment, "setTimeout").mockImplementation((callback) => {
      scheduled.push(callback);
      return scheduled.length;
    });
    const renderers = new WindowContentRendererRegistry();
    const restored = vi.fn();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:latest-focus", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" }, restoreFocus: restored });
    const firstAnchor = document.createElement("button");
    const secondAnchor = document.createElement("button");
    document.body.append(firstAnchor, secondAnchor);
    const base = { id: "reopened-focus", role: "popover" as const, title: "First", parentWindowControllerId: null, bounds: { x: 0, y: 0, width: 360, height: 280 } };

    await bridge.present({ ...base, anchor: firstAnchor }, <p>First</p>);
    await bridge.dismiss(base.id);
    await bridge.present({ ...base, title: "Second", anchor: secondAnchor }, <p>Second</p>);
    await bridge.dismiss(base.id);
    scheduled.forEach((callback) => callback());

    expect(restored).toHaveBeenCalledTimes(1);
    expect(restored.mock.calls[0]?.[0]).not.toBe(firstAnchor);
    expect(restored.mock.calls[0]?.[0]).toBe(secondAnchor);
    bridge.dispose();
    await runtime.dispose("test");
  });

  it("composes canonical runtime providers around content rendered later by WindowHost", async () => {
    const runtime = createTestRuntime({ id: "runtime:hosted-providers" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({
      runtime,
      renderers,
      physicalHostId: "test:hosted-providers",
      owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" },
    });
    const request = { id: "hosted", role: "panel" as const, title: "Hosted controls", parentWindowControllerId: null, anchor: null, bounds: { x: 0, y: 0, width: 500, height: 400 } };
    const windowControllerId = await bridge.present(request, <p>Loading</p>);
    await bridge.present(request, (
      <NSEPicker
        label="Hosted density"
        options={[{ value: "regular", label: "Regular" }, { value: "compact", label: "Compact" }]}
        listboxOverlay={{ id: "hosted-density", parentResponderId: `window:${windowControllerId}` }}
      />
    ));

    render(<SynCloudOSProvider runtime={runtime}><WindowLayer contentRegistry={renderers} /></SynCloudOSProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /hosted density regular/i }));

    expect((await screen.findByRole("listbox")).getAttribute("data-nse-overlay-kind")).toBe("listbox");
    bridge.dispose();
    await Promise.resolve();
    await runtime.dispose("test");
  });
});
