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
import { NSEPopUpButton } from "../../src/NSE/Menus";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { createTransientWindowSurfaceBridge, WindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { WindowLayer } from "../../src/Webspring/WindowLayer/WindowLayer";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

function geometrySource<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(snapshot: T) => void>();
  return {
    source: { getSnapshot: () => value, subscribe: (listener: (snapshot: T) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    } },
    set(next: T) { value = next; for (const listener of listeners) listener(next); },
  };
}

function geometryEnvironment() {
  const base = createTestRuntimeEnvironment();
  const layout = geometrySource({ width: 1024, height: 768 });
  const visual = geometrySource({ width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 });
  const work = geometrySource({ x: 0, y: 0, width: 1024, height: 768, devicePixelRatio: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
  return { layout, visual, work, environment: { ...base, layoutViewport: layout.source, visualViewport: visual.source, workArea: work.source } };
}

describe("window-hosted transient surface bridge", () => {
  it("keeps closing paint inert and replaces it when the same popover reopens before its exit finishes", async () => {
    const runtime = createTestRuntime();
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "popover-reopen", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const animator: NSEAnimator = { ownerAppId: "syncloudos.system", animations: {
      acquireOwner: owner => ({ ...owner, epoch: 1, release() {} }),
      animate() {
        let resolve!: (settlement: AFXAnimationSettlement) => void;
        const finished = new Promise<AFXAnimationSettlement>(done => { resolve = done; });
        return { id: "held-exit", finished, progress: 0, cancel: () => resolve({ state: "cancelled", reduced: false }), seek() {}, pause() {}, resume() {} };
      },
    } as NSEAnimator["animations"] };
    const anchor = document.createElement("button"); document.body.append(anchor);
    const request = { id: "reopen", role: "popover" as const, title: "Reopened", parentWindowControllerId: null, anchor, drawsBackground: true, bounds: { x: 20, y: 20, width: 240, height: 140 } };
    await bridge.present(request, <button>First generation</button>);
    const view = render(<SynCloudOSProvider runtime={runtime}><NSEAnimationEnvironmentProvider animator={animator}><WindowLayer contentRegistry={renderers} /></NSEAnimationEnvironmentProvider></SynCloudOSProvider>);
    try {
      await screen.findByRole("button", { name: "First generation" });
      await act(async () => { await bridge.dismiss(request.id); });
      const closing = document.querySelector("[data-window-exiting]");
      expect(closing?.hasAttribute("inert")).toBe(true);
      expect(closing?.textContent).toContain("First generation");
      await act(async () => { await bridge.present(request, <button>Second generation</button>); });
      expect(await screen.findByRole("button", { name: "Second generation" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "First generation" })).toBeNull();
      expect(document.querySelectorAll("[data-nse-window-popover]")).toHaveLength(1);
    } finally { view.unmount(); bridge.dispose(); anchor.remove(); await runtime.dispose("test"); }
  });

  it.each(["transient", "semitransient", "applicationDefined"] as const)("draws a real content-painted %s popover with the shared frame and dismissal policy", async behavior => {
    const runtime = createTestRuntime();
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: `shared-${behavior}`, owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" }, restoreFocus: anchor => anchor.focus() });
    const anchor = document.createElement("button"); anchor.textContent = "Positioning view";
    const root = document.createElement("div"); root.dataset.syncloudosRuntimeOwner = runtime.runtimeId;
    document.body.append(root); root.append(anchor);
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 500, y: 300, width: 100, height: 40 }));
    const id = await bridge.present({ id: "paper", role: "popover", title: "Paper", parentWindowControllerId: null, anchor,
      relativeTo: { x: 20, y: 8, width: 20, height: 20 }, preferredEdge: "minX", behavior, drawsBackground: false,
      bounds: { x: 0, y: 0, width: 240, height: 140 } }, <div style={{ "--nse-popover-content-fill": "#efe2c6" } as React.CSSProperties}><input aria-label="Hosted draft" defaultValue="Keep this" /></div>);
    const view = render(<SynCloudOSProvider runtime={runtime}><WindowLayer contentRegistry={renderers} /></SynCloudOSProvider>, { container: root.appendChild(document.createElement("div")) });
    try {
      const surface = await screen.findByRole("dialog", { name: "Paper" });
      expect(surface.closest("[data-window-host]")?.getAttribute("data-window-host")).toBe(id);
      expect(surface.querySelector('[data-nse-part="popover-frame"]')).not.toBeNull();
      expect(surface.dataset.nsePopoverDrawsBackground).toBe("false");
      await waitFor(() => expect(surface.dataset.placement).toBe("left"));
      expect(surface.style.getPropertyValue("--nse-popover-arrow-fill")).toBe("#efe2c6");
      expect(runtime.windows.select(id).record.bounds).toMatchObject({ x: 268, y: 248 });
      expect(runtime.windows.select(id).record.anchor?.rect).toEqual({ x: 520, y: 308, width: 20, height: 20 });
      fireEvent.pointerDown(anchor);
      if (behavior === "transient") await waitFor(() => expect(runtime.windows.list({ role: "popover" })).toHaveLength(0));
      else {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
        expect(runtime.windows.list({ role: "popover" })).toHaveLength(1);
        fireEvent.keyDown(surface, { key: "Escape" });
        if (behavior === "semitransient") await waitFor(() => expect(runtime.windows.list({ role: "popover" })).toHaveLength(0));
        else expect(runtime.windows.list({ role: "popover" })).toHaveLength(1);
      }
    } finally { view.unmount(); bridge.dispose(); root.remove(); await runtime.dispose("test"); }
  });

  it.each(["modal", "sheet"] as const)("restores a user-positioned normal %s after book changes and removes geometry work", async role => {
    const geometry = geometryEnvironment();
    geometry.layout.set({ width: 900, height: 700 }); geometry.visual.set({ width: 900, height: 700, offsetLeft: 0, offsetTop: 0, scale: 1 });
    geometry.work.set({ ...geometry.work.source.getSnapshot(), width: 900, height: 700 });
    const features = geometrySource<{ posture: "continuous" | "folded"; segments: readonly { x: number; y: number; width: number; height: number }[] | null }>({ posture: "continuous", segments: null });
    const frames = new Map<number, (time: number) => void>(); let nextFrame = 0;
    const flush = () => { for (let pass = 0; pass < 20 && frames.size; pass++) { const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback(0); } expect(frames.size).toBe(0); };
    const runtime = createTestRuntime({ environment: { ...geometry.environment, viewportFeatures: features.source,
      requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; }, cancelAnimationFrame(handle) { frames.delete(handle as number); } } });
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers: new WindowContentRendererRegistry(), physicalHostId: "book-" + role, owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const request = { id: "book-owned", role, title: "Generated modal", parentWindowControllerId: null, anchor: null, bounds: { x: 180, y: 120, width: 520, height: 420 } };
    const id = await bridge.present(request, <input defaultValue="Retained generated work" />); const controller = runtime.windows.select(id), content = controller.record.content;
    runtime.windows.setBounds(id, { x: 500, y: 80, width: 520, height: 420 }, "programmatic"); flush();
    const normal = controller.record.bounds; expect(normal.x).toBe(500);
    const folded = { posture: "folded" as const, segments: [{ x: 0, y: 0, width: 440, height: 700 }, { x: 460, y: 0, width: 440, height: 700 }] };
    for (let repeat = 0; repeat < 3; repeat++) {
      features.set(folded); flush(); expect(controller.record.bounds.x).toBe(468); expect(controller.record.bounds.width).toBe(424);
      const held = controller.record.bounds; geometry.layout.set({ width: 0, height: 0 }); flush(); expect(controller.record.bounds).toBe(held);
      geometry.layout.set({ width: 900, height: 700 }); flush(); features.set({ posture: "continuous", segments: null }); flush(); expect(controller.record.bounds).toEqual(normal);
      expect(runtime.windows.select(id)).toBe(controller); expect(controller.record.content).toBe(content);
    }
    const setBounds = vi.spyOn(runtime.windows, "setBounds"); features.set(folded); await bridge.dismiss(request.id); flush(); const settledCalls = setBounds.mock.calls.length;
    bridge.dispose(); features.set({ posture: "continuous", segments: null }); flush(); expect(setBounds.mock.calls.length).toBe(settledCalls); expect(runtime.windows.snapshot().windowControllerIds).toEqual([]);
    await runtime.dispose("test");
  });

  it("retains the fitted frame while host geometry is invalid even if the anchor moves", async () => {
    const geometry = geometryEnvironment();
    const runtime = createTestRuntime({ environment: geometry.environment });
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers: new WindowContentRendererRegistry(), physicalHostId: "invalid-anchor", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const rect = vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 300, y: 100, width: 100, height: 30 }));
    const id = await bridge.present({ id: "retained", role: "popover", title: "Retained", parentWindowControllerId: null, anchor, bounds: { x: 0, y: 0, width: 360, height: 280 } }, <input defaultValue="Retained" />);
    const controller = runtime.windows.select(id);
    const bounds = controller.record.bounds;
    const content = controller.record.content;
    rect.mockReturnValue(DOMRect.fromRect({ x: 800, y: 100, width: 100, height: 30 }));
    geometry.visual.set({ width: 0, height: 0, offsetLeft: 0, offsetTop: 0, scale: 1 });
    await waitFor(() => expect(runtime.screen.getSnapshot().geometryState).toBe("retained"));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(controller.record.bounds).toBe(bounds);
    geometry.visual.set({ width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 });
    await waitFor(() => expect(controller.record.anchor?.rect.x).toBe(800));
    expect(controller.record.content).toBe(content);
    expect(runtime.windows.select(id)).toBe(controller);
    await bridge.dismiss("retained");
    bridge.dispose(); anchor.remove(); await runtime.dispose("test");
  });

  it("remeasures an open popover from canonical visual bounds without reopening or losing its preferred size", async () => {
    const geometry = geometryEnvironment();
    const runtime = createTestRuntime({ environment: geometry.environment });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "geometry", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const rect = vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 300, y: 400, width: 100, height: 30 }));
    const id = await bridge.present({ id: "live", role: "popover", title: "Live", parentWindowControllerId: null, anchor, bounds: { x: 0, y: 0, width: 360, height: 280 } }, <input defaultValue="Retained draft" />);
    const controller = runtime.windows.select(id);
    const content = controller.record.content;
    rect.mockReturnValue(DOMRect.fromRect({ x: 400, y: 160, width: 100, height: 30 }));
    geometry.visual.set({ width: 800, height: 400, offsetLeft: 100, offsetTop: 80, scale: 1 });
    await waitFor(() => expect(controller.record.bounds).toEqual({ x: 270, y: 202, width: 360, height: 270 }));
    expect(runtime.windows.select(id)).toBe(controller);
    expect(controller.record.content).toBe(content);
    expect(renderers.size).toBe(1);
    geometry.visual.set({ width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 });
    await waitFor(() => expect(controller.record.bounds.height).toBe(280));
    await bridge.dismiss("live");
    bridge.dispose(); anchor.remove(); await runtime.dispose("test");
  });

  it("remeasures an anchor after a captured scroll without another present request", async () => {
    const geometry = geometryEnvironment();
    const runtime = createTestRuntime({ environment: geometry.environment });
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers: new WindowContentRendererRegistry(), physicalHostId: "scroll", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const rect = vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 300, y: 100, width: 100, height: 30 }));
    const id = await bridge.present({ id: "scrolling", role: "popover", title: "Scrolling", parentWindowControllerId: null, anchor, bounds: { x: 0, y: 0, width: 360, height: 280 } }, <p>Retained</p>);
    rect.mockReturnValue(DOMRect.fromRect({ x: 800, y: 100, width: 100, height: 30 }));
    const listener = geometry.environment.addWindowListener.mock.calls.find(([type]) => type === "scroll")?.[1] as (() => void) | undefined;
    expect(listener).toBeTypeOf("function");
    listener?.();
    await waitFor(() => expect(runtime.windows.select(id).record.anchor?.rect.x).toBe(800));
    expect(runtime.windows.select(id).record.bounds.x).toBe(656);
    await bridge.dismiss("scrolling");
    bridge.dispose(); anchor.remove(); await runtime.dispose("test");
  });

  it("fits narrow shallow viewports and recovers from invalid visual measurements without persisting an invalid frame", async () => {
    const geometry = geometryEnvironment();
    const runtime = createTestRuntime({ environment: geometry.environment });
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers: new WindowContentRendererRegistry(), physicalHostId: "shallow", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const anchor = document.createElement("button");
    document.body.append(anchor);
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 100, y: 70, width: 30, height: 20 }));
    const id = await bridge.present({ id: "shallow", role: "popover", title: "Shallow", parentWindowControllerId: null, anchor, bounds: { x: 0, y: 0, width: 360, height: 280 } }, <p>Retained</p>);
    geometry.visual.set({ width: 260, height: 100, offsetLeft: 50, offsetTop: 50, scale: 1 });
    await waitFor(() => expect(runtime.windows.select(id).record.bounds.width).toBeLessThanOrEqual(244));
    const fitted = runtime.windows.select(id).record.bounds;
    expect(fitted.x).toBeGreaterThanOrEqual(50);
    expect(fitted.y).toBeGreaterThanOrEqual(50);
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(310);
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(150);
    geometry.visual.set({ width: Number.NaN, height: 0, offsetLeft: 0, offsetTop: 0, scale: 1 });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(runtime.windows.select(id).record.bounds).toBe(fitted);
    geometry.visual.set({ width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 });
    await waitFor(() => expect(runtime.windows.select(id).record.bounds.width).toBe(360));
    await bridge.dismiss("shallow");
    bridge.dispose(); anchor.remove(); await runtime.dispose("test");
  });

  it("remeasures resized anchors and releases the observer after the final popover closes", async () => {
    let resized = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    class ResizeFixture {
      constructor(callback: () => void) { resized = callback; }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", ResizeFixture);
    const geometry = geometryEnvironment();
    const runtime = createTestRuntime({ environment: geometry.environment });
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers: new WindowContentRendererRegistry(), physicalHostId: "anchor-resize", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const rect = vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 300, y: 100, width: 100, height: 30 }));
    const id = await bridge.present({ id: "resize", role: "popover", title: "Resize", parentWindowControllerId: null, anchor, bounds: { x: 0, y: 0, width: 360, height: 280 } }, <p>Retained</p>);
    expect(observe).toHaveBeenCalledWith(anchor);
    rect.mockReturnValue(DOMRect.fromRect({ x: 300, y: 100, width: 220, height: 30 }));
    resized();
    await waitFor(() => expect(runtime.windows.select(id).record.anchor?.rect.width).toBe(220));
    await bridge.dismiss("resize");
    expect(disconnect).toHaveBeenCalled();
    const scrollIndex = geometry.environment.addWindowListener.mock.calls.findIndex(([type]) => type === "scroll");
    expect(geometry.environment.addWindowListener.mock.results[scrollIndex].value).toHaveBeenCalledTimes(1);
    bridge.dispose(); anchor.remove(); await runtime.dispose("test");
    vi.unstubAllGlobals();
  });

  it("uses the host work area once rather than adding its safe-area insets again", async () => {
    const geometry = geometryEnvironment();
    geometry.work.set({ x: 100, y: 80, width: 400, height: 200, devicePixelRatio: 1, safeArea: { top: 80, right: 20, bottom: 30, left: 100 } });
    const runtime = createTestRuntime({ environment: geometry.environment });
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers: new WindowContentRendererRegistry(), physicalHostId: "work-area", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const anchor = document.createElement("button");
    document.body.append(anchor);
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 100, y: 30, width: 30, height: 20 }));
    const id = await bridge.present({ id: "insets", role: "popover", title: "Insets", parentWindowControllerId: null, anchor, bounds: { x: 0, y: 0, width: 360, height: 220 } }, <p>Retained</p>);
    expect(runtime.windows.select(id).record.bounds.y).toBe(88);
    await bridge.dismiss("insets");
    bridge.dispose(); anchor.remove(); await runtime.dispose("test");
  });

  it("cancels scheduled placement when disposed", async () => {
    const geometry = geometryEnvironment();
    const runtime = createTestRuntime({ environment: geometry.environment });
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers: new WindowContentRendererRegistry(), physicalHostId: "dispose-geometry", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const anchor = document.createElement("button");
    document.body.append(anchor);
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 300, y: 100, width: 100, height: 30 }));
    await bridge.present({ id: "dispose", role: "popover", title: "Dispose", parentWindowControllerId: null, anchor, bounds: { x: 0, y: 0, width: 360, height: 280 } }, <p>Retained</p>);
    const setBounds = vi.spyOn(runtime.windows, "setBounds");
    geometry.visual.set({ width: 800, height: 400, offsetLeft: 0, offsetTop: 0, scale: 1 });
    bridge.dispose();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(setBounds).not.toHaveBeenCalled();
    expect(runtime.windows.snapshot().windowControllerIds).toHaveLength(0);
    anchor.remove(); await runtime.dispose("test");
  });
  it("keeps a popover anchored to an ordinary idless element until that element is removed", async () => {
    const runtime = createTestRuntime({ id: "runtime:idless-popover" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:idless", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const view = render(<SynCloudOSProvider runtime={runtime}>
      <div data-syncloudos-runtime-owner={runtime.runtimeId}>
        <button>Ordinary anchor</button><WindowLayer contentRegistry={renderers} />
      </div>
    </SynCloudOSProvider>);
    const anchor = screen.getByRole("button", { name: "Ordinary anchor" });
    const onDidClose = vi.fn();
    let id = "";
    await act(async () => {
      id = await bridge.present({ id: "details", role: "popover", title: "Details", parentWindowControllerId: null, anchor, bounds: { x: 0, y: 0, width: 240, height: 150 }, onDidClose }, <p>Popover details</p>);
    });
    await act(async () => { anchor.after(document.createElement("span")); });
    expect(runtime.windows.snapshot().windowControllerIds).toContain(id);
    expect(onDidClose).not.toHaveBeenCalled();
    await act(async () => { anchor.remove(); });
    await waitFor(() => expect(runtime.windows.snapshot().windowControllerIds).not.toContain(id));
    expect(onDidClose).toHaveBeenCalledTimes(1);
    expect(anchor.hasAttribute("id")).toBe(false);
    view.unmount(); bridge.dispose(); await runtime.dispose("test");
  });

  it("retains a shared anchor until its final surface closes and preserves a caller's replacement ID", async () => {
    const runtime = createTestRuntime({ id: "runtime:shared-idless-anchor" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:shared-anchor", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const request = { role: "popover" as const, title: "Details", parentWindowControllerId: null, anchor, bounds: { x: 0, y: 0, width: 240, height: 150 } };
    const first = await bridge.present({ ...request, id: "first" }, <p>First</p>);
    const second = await bridge.present({ ...request, id: "second" }, <p>Second</p>);
    expect(anchor.id).toBeTruthy();
    expect(runtime.windows.select(first).record.anchor?.id).toBe(anchor.id);
    expect(runtime.windows.select(second).record.anchor?.id).toBe(anchor.id);
    await bridge.dismiss("first");
    expect(anchor.id).toBe(runtime.windows.select(second).record.anchor?.id);
    anchor.id = "caller-replacement";
    await bridge.dismiss("second");
    expect(anchor.id).toBe("caller-replacement");
    anchor.remove(); bridge.dispose(); await runtime.dispose("test");
  });

  it("switches idless anchors without a stale removal observer closing the current popover", async () => {
    const runtime = createTestRuntime({ id: "runtime:replacement-idless-anchor" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:replacement-anchor", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const view = render(<SynCloudOSProvider runtime={runtime}>
      <div data-syncloudos-runtime-owner={runtime.runtimeId}>
        <button>First anchor</button><button>Second anchor</button><WindowLayer contentRegistry={renderers} />
      </div>
    </SynCloudOSProvider>);
    const first = screen.getByRole("button", { name: "First anchor" });
    const second = screen.getByRole("button", { name: "Second anchor" });
    const request = { id: "details", role: "popover" as const, title: "Details", parentWindowControllerId: null, bounds: { x: 0, y: 0, width: 240, height: 150 } };
    let id = "";
    await act(async () => { id = await bridge.present({ ...request, anchor: first }, <p>Details</p>); });
    await act(async () => { await bridge.present({ ...request, anchor: second }, <p>Updated details</p>); });
    expect(runtime.windows.snapshot().windowControllerIds).toContain(id);
    expect(runtime.windows.select(id).record.anchor?.id).toBe(second.id);
    expect(first.hasAttribute("id")).toBe(false);
    await act(async () => { await bridge.dismiss(request.id); });
    expect(second.hasAttribute("id")).toBe(false);
    view.unmount(); bridge.dispose(); await runtime.dispose("test");
  });

  it("retains a replacement anchor lease when a render clears the same element's generated ID", async () => {
    const runtime = createTestRuntime({ id: "runtime:renewed-idless-anchor" });
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:renewed-anchor", owner: { workspaceId: "workspace", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const request = { id: "details", role: "popover" as const, title: "Details", parentWindowControllerId: null, anchor, bounds: { x: 0, y: 0, width: 240, height: 150 } };
    const id = await bridge.present(request, <p>Details</p>);
    anchor.removeAttribute("id");
    await bridge.present(request, <p>Updated details</p>);
    expect(anchor.id).toBeTruthy();
    expect(runtime.windows.select(id).record.anchor?.id).toBe(anchor.id);
    await bridge.dismiss(request.id);
    expect(anchor.hasAttribute("id")).toBe(false);
    anchor.remove(); bridge.dispose(); await runtime.dispose("test");
  });

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

    // Shared joined frame: centred on the anchor, 12px below it.
    expect(record()).toMatchObject({
      style: ["closable"],
      bounds: { x: 170, y: 442, width: 360, height: 280 },
      anchor: { id: "popover-anchor", edge: "block-end", alignment: "center" },
    });

    place(700);
    await bridge.present({ ...request }, <p>Placed</p>);
    expect(record()).toMatchObject({
      bounds: { x: 170, y: 408 },
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
      <NSEPopUpButton
        label="Hosted density"
        items={[{ value: "regular", title: "Regular" }, { value: "compact", title: "Compact" }]}
        overlay={{ id: "hosted-density", parentResponderId: `window:${windowControllerId}` }}
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
