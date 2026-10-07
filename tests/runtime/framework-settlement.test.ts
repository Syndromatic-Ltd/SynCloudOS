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
import { createElement, Fragment, useLayoutEffect, useRef, useState, act } from "react";
import { createRoot } from "react-dom/client";
import { DocumentController, InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType, type NoteDocumentModel } from "../fixtures/noteDocumentType";
import { createRenderRevisionSettlement } from "../../src/SynCloudOS/Testing/RenderRevisionSettlement";
import { AFXAnimation, AFXBasicAnimation, AFXLayer, type AFXFrameScheduler } from "../../src/FX/AnimationFX/public";
import { BrowserAnimationLayerSurface } from "../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";
import { createOperationCoordinator } from "../../src/SynCloudOS/Operations/OperationCoordinator";
import { createPresentationSettlementCoordinator } from "../../src/SynCloudOS/Operations/PresentationSettlementCoordinator";
import {
  createSettlementRegistry,
  registerOperationCoordinatorSettlement,
  registerPresentationSettlement,
} from "../../src/SynCloudOS/Testing/SettlementRegistry";
import { createSynWareTesting } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTesting";
import { createMountedSettlementPort } from "../../src/SynCloudOS/AppSDK/mountedSettlementPort";
import { createMountedAudioGraphs } from "../../src/SynCloudOS/AppSDK/mountedAudioGraphs";
import { createMountedAudioSessions } from "../../src/SynCloudOS/AppSDK/mountedAudioSessions";
import { createMountedLocationClient } from "../../src/SynCloudOS/AppSDK/mountedLocationClient";
import { getRuntimeSettlement, trackRuntimeSettlement } from "../../src/SynCloudOS/Testing/runtimeSettlement";
import { AUFXAudioFormat } from "../../src/FX/AudioFX/AUFXAudioFormat";
import { AUFXAudioSession } from "../../src/FX/AudioFX/AUFXAudioSession";
import { AUFXAudioRecorder } from "../../src/FX/AudioFX/AUFXAudioRecorder";
import { NSEOverlayProvider, NSEPopup } from "../../src/NSE/Overlays";
import type { NSEOverlayRuntimePort } from "../../src/NSE/Overlays/overlayTypes";
import { HostSiteBrandingProvider, ResponderScope, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { RouteOutlet } from "../../src/SynCloudOS/AppSDK/RouteOutlet";
import { createSynWare } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { createTestRuntime, registerTestSynWare } from "./helpers";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, deny) => { resolve = accept; reject = deny; });
  return { promise, resolve, reject };
}

function runtimeId(value: string) {
  return value as never;
}

afterEach(() => vi.useRealTimers());

describe("framework finite-work settlement", () => {
  it("waits on a registered real finite AFX completion and leaves no frame callback after disposal", async () => {
    const registry = createSettlementRegistry({ runtimeId: runtimeId("afx"), now: () => 0,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const testing = createSynWareTesting({ settlement: registry, navigation: { openRoute() {} } });
    let now = 0;
    const frames = new Set<(time: number) => void>();
    const scheduler: AFXFrameScheduler = { now: () => now, reducedMotion: false, suspended: false,
      requestFrame(callback) { frames.add(callback); return () => { frames.delete(callback); }; } };
    const element = document.createElement("div");
    const layer = new AFXLayer(new BrowserAnimationLayerSurface(element), scheduler);
    const handle = layer.addAnimation(new AFXBasicAnimation({ targetId: "panel", keyPath: "opacity", from: 0, to: 1,
      animation: new AFXAnimation({ duration: 1, timing: "linear" }) }));
    const tracked = testing.track("explicit AFX completion", handle.finished);
    let settled = false;
    const waiting = testing.settled().then(result => { settled = true; return result; });
    const frame = (time: number) => { now = time; const callbacks = [...frames]; frames.clear(); for (const callback of callbacks) callback(time); };
    frame(0.5);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(Number(element.style.opacity)).toBeCloseTo(0.5);
    frame(1);
    await expect(tracked).resolves.toMatchObject({ state: "completed" });
    await expect(waiting).resolves.toMatchObject({ status: "settled" });
    expect(Number(element.style.opacity)).toBe(1);
    layer.dispose(); testing.dispose(); registry.dispose();
    expect(frames.size).toBe(0);
  });
  it("observes real DocumentController saves, failures and closes through their actual operation IDs", async () => {
    const dependencies = createDocumentTestDependencies();
    const registry = createSettlementRegistry({ runtimeId: dependencies.runtimeId, now: () => 0,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const remove = registerOperationCoordinatorSettlement(registry, dependencies.operations);
    const controller = new DocumentController(dependencies);
    const adapter = new InMemoryDocumentAdapter(dependencies.environment);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const testing = createSynWareTesting({ settlement: registry, navigation: { openRoute() {} } });
    try {
      const note = await controller.newDocument<NoteDocumentModel>({ typeId: noteType.id });
      await controller.saveAsDocument({ documentId: note.id, destination: { kind: "memory", namespace: "settlement", key: "note" } });
      note.update(model => ({ ...model, body: "saved body" }), { actionName: "Edit" });
      expect(note.state).toBe("dirty");
      await expect(testing.settled()).resolves.toMatchObject({ status: "settled" });
      let release!: () => void;
      let entered!: () => void;
      const writeGate = new Promise<void>(resolve => { release = resolve; });
      const writeEntered = new Promise<void>(resolve => { entered = resolve; });
      const originalWrite = adapter.write.bind(adapter);
      const write = vi.spyOn(adapter, "write").mockImplementation(async request => { entered(); await writeGate; return originalWrite(request); });
      const saving = controller.saveDocument(note.id);
      await writeEntered;
      const operation = dependencies.operations.inspectPending().find(item => item.kind === "documents.save")!;
      expect(operation).toBeDefined();
      expect(registry.getState().pending).toContainEqual(expect.objectContaining({ id: operation.operationId, kind: "documents.save", correlationId: operation.correlationId }));
      let settled = false;
      const waiting = testing.settled().then(result => { settled = true; return result; });
      await Promise.resolve();
      expect(settled).toBe(false);
      release();
      await saving;
      await expect(waiting).resolves.toMatchObject({ status: "settled" });
      expect(note.state).toBe("clean");
      note.update(model => ({ ...model, body: "failed body" }), { actionName: "Edit" });
      write.mockRejectedValueOnce(new Error("disk rejected write"));
      await expect(controller.saveDocument(note.id)).rejects.toThrow("disk rejected write");
      expect(registry.getState().recent).toContainEqual(expect.objectContaining({ kind: "documents.save", status: "failed" }));
      await expect(testing.settled()).resolves.toMatchObject({ failures: expect.arrayContaining([expect.objectContaining({ kind: "documents.save" })]) });
      let review!: (value: "discard") => void;
      let reviewEntered!: () => void;
      const reviewing = new Promise<void>(resolve => { reviewEntered = resolve; });
      controller.registerCloseReviewer({ review: () => { reviewEntered(); return new Promise(resolve => { review = resolve; }); } });
      const closing = controller.closeDocument(note.id, "window-command");
      await reviewing;
      expect(registry.getState().pending).toContainEqual(expect.objectContaining({ kind: "documents.close" }));
      review("discard");
      await closing;
      await testing.settled();
      expect(note.state).toBe("closed");
    } finally { testing.dispose(); remove(); registry.dispose(); await dependencies.cleanup(); }
  });

  it("holds settlement until an actual React layout effect acknowledges the exact operation and revision", async () => {
    const registry = createSettlementRegistry({ runtimeId: runtimeId("react"), now: () => 0,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const bridge = createRenderRevisionSettlement(registry, { owner: "route-render", label: "destination" });
    bridge.request(1, "route:old");
    bridge.request(2, "route:current");
    expect(bridge.acknowledge(1, "route:old")).toBe(false);
    expect(bridge.acknowledge(2, "route:foreign")).toBe(false);
    const container = document.createElement("div");
    const root = createRoot(container);
    function Destination() {
      useLayoutEffect(() => { bridge.acknowledge(2, "route:current"); }, []);
      return createElement("p", null, "committed destination");
    }
    let settled = false;
    const waiting = registry.settled({ timeoutMs: 500 }).then(result => { settled = true; return result; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await act(async () => { root.render(createElement(Destination)); });
    await expect(waiting).resolves.toMatchObject({ status: "settled" });
    expect(container.textContent).toBe("committed destination");
    expect(bridge.acknowledge(2, "route:current")).toBe(false);
    await act(async () => root.unmount());
    bridge.request(3, "route:unmount");
    bridge.dispose();
    expect(registry.getState().recent.at(-1)).toMatchObject({ status: "cancelled", reason: "render-owner-disposed" });
    registry.dispose();
  });

  it("observes the real overlay focus-restoration receipt after close", async () => {
    const runtime = createTestRuntime({ id: "runtime:overlay-settlement" });
    const registry = getRuntimeSettlement(runtime);
    let restoreTask: (() => void) | null = null;
    const restoreFocus = vi.fn();
    const workArea = Object.freeze({ width: 1024, height: 768, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
    const presentation = Object.freeze({
      contentBounds: Object.freeze({ x: 0, y: 0, width: 1024, height: 768 }),
      safeAreaInsets: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
      virtualKeyboardInset: 0,
      horizontalSizeClass: "regular" as const,
      verticalSizeClass: "regular" as const,
      primaryPointer: "fine" as const,
      anyPointerCoarse: false,
      hover: true,
      reducedMotion: false,
      displayMode: "browser" as const,
    });
    const runtimePort = {
      runtimeId: runtime.runtimeId,
      signal: runtime.signal,
      environment: {
        browser: { getDocument: () => document, getWindow: () => window },
        workArea: {
          getSnapshot: () => workArea,
          subscribe: () => () => undefined,
        },
        visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
        presentation: {
          getSnapshot: () => presentation,
          subscribe: () => () => undefined,
        },
        setTimeout(callback: () => void) { restoreTask = callback; return 1; },
        clearTimeout() { restoreTask = null; },
      },
      restoreFocus,
      reportPlacementFailure: vi.fn(),
      wrapFocusScope: (_options: unknown, children: React.ReactNode) => children,
      observeFiniteWork(receipt: Promise<void>, input: { readonly kind: string; readonly label: string }) {
        trackRuntimeSettlement(runtime, receipt, { owner: "overlay", kind: input.kind, label: input.label });
      },
    } as NSEOverlayRuntimePort & {
      observeFiniteWork(receipt: Promise<void>, input: { readonly kind: string; readonly label: string }): void;
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderPopup = (open: boolean) => createElement(
      NSEOverlayProvider,
      { runtimePort },
      createElement(NSEPopup, {
        id: "settlement-overlay",
        open,
        anchor: null,
        parentResponderId: "runtime",
        onOpenChange: () => undefined,
      }, "Overlay content"),
    );
    try {
      await act(async () => { root.render(renderPopup(true)); });
      await act(async () => { root.render(renderPopup(false)); });
      expect(restoreTask).not.toBeNull();
      expect(registry.getState().pending).toContainEqual(expect.objectContaining({
        owner: "overlay",
        kind: "focus-restore",
        label: "settlement-overlay",
      }));
      let settled = false;
      const waiting = registry.settled({ timeoutMs: 500 }).then(result => { settled = true; return result; });
      await Promise.resolve();
      expect(settled).toBe(false);
      await act(async () => { restoreTask?.(); });
      await expect(waiting).resolves.toMatchObject({ status: "settled", pending: [] });
      expect(restoreFocus).toHaveBeenCalledWith("runtime", null);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      await runtime.dispose("overlay settlement complete");
    }
  });

  it("settles one real cross-owner action chain only after every finite owner completes", async () => {
    const runtime = createTestRuntime({ id: "runtime:test03-cross-owner-chain" });
    const registry = getRuntimeSettlement(runtime);
    const testing = createSynWareTesting({
      settlement: registry,
      navigation: { openRoute() {} },
    }, { defaultTimeoutMs: 2_000 });
    const branding = Object.freeze({
      name: "TEST-03 host",
      logoAlt: "",
      logoUrl: null,
      lightLogoUrl: null,
      darkLogoUrl: null,
      compactLogoUrl: null,
    });
    const lazyModule = deferred<{
      component: ({ routeData }: { routeData: unknown }) => ReturnType<typeof createElement>;
      load: () => Promise<string>;
    }>();
    const routeData = deferred<string>();
    const routeDataStarted = deferred<void>();
    const Music = () => createElement("section", { "data-testid": "chain-music" }, "Music", createElement(RouteOutlet));
    const Artist = () => createElement("section", { "data-testid": "chain-artist" }, "Artist", createElement(RouteOutlet));
    const Album = ({ routeData: data }: { routeData: unknown }) => createElement("div", { "data-testid": "chain-album" }, String(data));
    const routeGraph = defineSynWareRoutes({
      id: "test03.chain.routes",
      routes: [{
        name: "music",
        path: "",
        component: Music,
        children: [{
          name: "music.artist",
          path: "artist/:artistId",
          component: Artist,
          children: [{
            name: "music.artist.album",
            path: "album/:albumId",
            lazy: () => lazyModule.promise,
          }],
        }],
      }],
    } as const);
    registerTestSynWare(runtime, createSynWare({
      manifest: {
        schemaVersion: 1,
        id: "journal",
        version: "1.0.0",
        title: "Journal",
        routes: [{ path: "/journal", primary: true }],
        permissions: ["app.open.public"],
      },
      root: () => null,
    }));
    const musicApp = registerTestSynWare(runtime, createSynWare({
      manifest: {
        schemaVersion: 1,
        id: "music",
        version: "1.0.0",
        title: "Music",
        routes: [{ path: "/music", match: "prefix", primary: true }],
        permissions: ["app.open.public"],
      },
      root: () => createElement(RouteOutlet),
      routes: routeGraph,
    }));
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });

    runtime.documents.registerType(noteType);
    const note = await runtime.documents.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    await runtime.documents.saveAsDocument({
      documentId: note.id,
      destination: { kind: "memory", namespace: "test03-chain", key: "note" },
    });
    note.update(model => ({ ...model, body: "pending chain save" }), { actionName: "Edit" });

    let closeOverlay: (() => void) | null = null;
    function MountedSurface() {
      const [open, setOpen] = useState(true);
      const anchorRef = useRef<HTMLButtonElement | null>(null);
      closeOverlay = () => setOpen(false);
      return createElement(Fragment, null,
        createElement("button", { ref: anchorRef, type: "button" }, "Overlay anchor"),
        createElement(RouteOutlet),
        createElement(NSEPopup, {
          id: "test03-chain-overlay",
          open,
          anchor: anchorRef.current,
          parentResponderId: "application:music",
          onOpenChange: (nextOpen: boolean) => setOpen(nextOpen),
        }, "Chain overlay"),
      );
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let now = 0;
    const frames = new Set<(time: number) => void>();
    const scheduler: AFXFrameScheduler = {
      now: () => now,
      reducedMotion: false,
      suspended: false,
      requestFrame(callback) { frames.add(callback); return () => { frames.delete(callback); }; },
    };
    const animatedElement = document.createElement("div");
    const layer = new AFXLayer(new BrowserAnimationLayerSurface(animatedElement), scheduler);
    const animation = layer.addAnimation(new AFXBasicAnimation({
      targetId: "test03-panel",
      keyPath: "opacity",
      from: 0,
      to: 1,
      animation: new AFXAnimation({ duration: 1, timing: "linear" }),
    }));
    const animationReceipt = testing.track("finite AFX completion", animation.finished);
    const resource = deferred<void>();
    const resourceReceipt = testing.track("explicit resource waiter", resource.promise);
    const frame = (time: number) => {
      now = time;
      const callbacks = [...frames];
      frames.clear();
      for (const callback of callbacks) callback(time);
    };

    try {
      await act(async () => {
        root.render(createElement(
          SynCloudOSProvider,
          { runtime },
          createElement(ResponderScope, {
            responderId: "application:music",
            kind: "application",
            parentResponderId: "runtime",
            scopeId: "application:music",
          }, createElement(
            HostSiteBrandingProvider,
            { value: branding },
            createElement(SynWareRuntimeMount, {
              runtime,
              app: musicApp,
              responderId: "application:music",
            }, createElement(MountedSurface)),
          )),
        ));
      });
      await expect(runtime.routes.openRoute("/journal").result).resolves.toMatchObject({ status: "completed", committed: true });
      expect(runtime.store.getSnapshot().application.activeAppId).toBe("journal");

      const route = runtime.routes.openRoute("/music/artist/air/album/cross");
      await Promise.resolve();
      expect(registry.getState().pending).toContainEqual(expect.objectContaining({ id: route.operationId, owner: "operations" }));

      lazyModule.resolve({
        component: Album,
        load: async () => {
          routeDataStarted.resolve();
          return routeData.promise;
        },
      });
      await routeDataStarted.promise;
      const multiSwitch = runtime.store.getSnapshot().application.multiSwitch;
      expect(multiSwitch).toMatchObject({ status: "switching", fromAppId: "journal", toAppId: "music" });
      expect(registry.getState().pending).toContainEqual(expect.objectContaining({
        id: multiSwitch.id,
        owner: "application",
        kind: "multiswitch",
      }));

      let checkpointSettled = false;
      const checkpoint = testing.settled({ timeoutMs: 2_000 }).then(result => { checkpointSettled = true; return result; });
      await Promise.resolve();
      expect(checkpointSettled).toBe(false);
      expect(registry.getState().pending).toEqual(expect.arrayContaining([
        expect.objectContaining({ owner: "operations" }),
        expect.objectContaining({ owner: "application", kind: "multiswitch" }),
        expect.objectContaining({ owner: "app-waiter", label: "finite AFX completion" }),
        expect.objectContaining({ owner: "app-waiter", label: "explicit resource waiter" }),
      ]));

      const saving = runtime.documents.saveDocument(note.id);
      expect(registry.getState().pending).toContainEqual(expect.objectContaining({ owner: "operations" }));
      await act(async () => { closeOverlay?.(); });
      expect(registry.getState().recent.some(item => item.owner === "overlay" && item.kind === "focus-restore")
        || registry.getState().pending.some(item => item.owner === "overlay" && item.kind === "focus-restore")).toBe(true);

      await act(async () => { routeData.resolve("album-ready"); await Promise.resolve(); });
      await expect(route.result).resolves.toMatchObject({ status: "completed", committed: true });
      expect(container.textContent).toContain("album-ready");
      expect(checkpointSettled).toBe(false);

      await saving;
      expect(checkpointSettled).toBe(false);
      resource.resolve();
      await resourceReceipt;
      expect(checkpointSettled).toBe(false);
      expect(runtime.launchServices.completeMultiSwitch(multiSwitch.id ?? "")).toBe(true);
      await Promise.resolve();
      expect(checkpointSettled).toBe(false);
      frame(1);
      await animationReceipt;
      await expect(checkpoint).resolves.toMatchObject({ status: "settled", pending: [] });
      expect(registry.getState().recent).toEqual(expect.arrayContaining([
        expect.objectContaining({ owner: "overlay", kind: "focus-restore", status: "completed" }),
        expect.objectContaining({ owner: "app-waiter", label: "finite AFX completion", status: "completed" }),
        expect.objectContaining({ owner: "app-waiter", label: "explicit resource waiter", status: "completed" }),
      ]));
    } finally {
      routeData.resolve("cleanup");
      resource.resolve();
      lazyModule.resolve({ component: Album, load: async () => "cleanup" });
      await act(async () => root.unmount());
      container.remove();
      layer.dispose();
      testing.dispose();
      await runtime.dispose("TEST-03 cross-owner chain complete");
    }
  });

  it("retains the exact missing role after the real presentation owner's own deadline expires", async () => {
    vi.useFakeTimers();
    const options = { runtimeId: runtimeId("role-timeout"), now: () => Date.now(), randomUUID: () => "role",
      setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
    const registry = createSettlementRegistry(options);
    const presentation = createPresentationSettlementCoordinator(options);
    registerPresentationSettlement(registry, presentation);
    const role = presentation.begin({ operationId: "route:role", roles: ["content", "focus"], timeoutMs: 10 });
    role.completeRole("content");
    const waiting = registry.settled({ timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(waiting).resolves.toMatchObject({ failures: [expect.objectContaining({ id: role.id, owner: "presentation", label: "focus", status: "failed" })] });
    presentation.dispose();
    registry.dispose();
  });
  it("cancels an in-flight settlement when the registry is disposed", async () => {
    vi.useFakeTimers();
    const registry = createSettlementRegistry({ runtimeId: runtimeId("disposed"), now: () => 0,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    registry.begin({ owner: "app", kind: "request", label: "pending disposal" });
    const waiting = registry.settled({ timeoutMs: 50 });
    registry.dispose();
    await expect(waiting).resolves.toMatchObject({ status: "cancelled", reason: "runtime-disposed" });
    expect(registry.getState().recent).toEqual([expect.objectContaining({ status: "cancelled", reason: "runtime-disposed" })]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("requires one unchanged revision across the entire checkpoint", async () => {
    const registry = createSettlementRegistry({ runtimeId: runtimeId("revision"), now: () => 0,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    let settled = false;
    const waiting = registry.settled({ timeoutMs: 500 }).then(result => { settled = true; return result; });
    let child!: ReturnType<typeof registry.begin>;
    queueMicrotask(() => {
      registry.begin({ owner: "completion", kind: "callback", label: "transient" }).complete();
      queueMicrotask(() => queueMicrotask(() => { child = registry.begin({ owner: "completion", kind: "callback", label: "child" }); }));
    });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(settled).toBe(false);
    child.complete();
    await expect(waiting).resolves.toMatchObject({ status: "settled" });
    registry.dispose();
  });
  it("waits for operations, presentation roles and work spawned by a completion microtask", async () => {
    vi.useFakeTimers();
    let serial = 0;
    const registry = createSettlementRegistry({
      runtimeId: runtimeId("runtime:settlement"),
      now: () => Date.now(),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const operations = createOperationCoordinator({
      runtimeId: runtimeId("runtime:settlement"),
      now: () => Date.now(),
      randomUUID: () => String(++serial),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const presentation = createPresentationSettlementCoordinator({
      runtimeId: runtimeId("runtime:settlement"),
      randomUUID: () => String(++serial),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const removeOperations = registerOperationCoordinatorSettlement(registry, operations);
    const removePresentation = registerPresentationSettlement(registry, presentation);

    let finishOperation!: () => void;
    const operationGate = new Promise<void>(resolve => { finishOperation = resolve; });
    operations.run({
      kind: "test.settlement",
      input: null,
      commit: async () => {
        await operationGate;
        queueMicrotask(() => {
          const spawned = registry.begin({ owner: "test", kind: "microtask", label: "spawned after operation" });
          queueMicrotask(() => spawned.complete());
        });
        return undefined;
      },
    });
    const roles = presentation.begin({ operationId: "test", roles: ["route", "content"], timeoutMs: 1_000 });

    const pending = registry.settled({ timeoutMs: 500 });
    await Promise.resolve();
    expect(registry.getState()).toMatchObject({
      status: "pending",
      pending: expect.arrayContaining([
        expect.objectContaining({ owner: "operations" }),
        expect.objectContaining({ owner: "presentation" }),
      ]),
    });

    finishOperation();
    roles.completeRole("route");
    await Promise.resolve();
    expect(registry.getState().status).toBe("pending");
    roles.completeRole("content");
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ status: "settled", pending: [] });
    expect(registry.getState().pending).toEqual([]);

    removeOperations();
    removePresentation();
    operations.dispose();
    presentation.dispose();
    registry.dispose();
    vi.useRealTimers();
  });

  it("reports structured timeout diagnostics while excluded continuous work does not block", async () => {
    vi.useFakeTimers();
    const registry = createSettlementRegistry({
      runtimeId: runtimeId("runtime:timeout"),
      now: () => Date.now(),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const excluded = registry.exclude({ owner: "motion", kind: "stream", label: "live sensor" });
    const finite = registry.begin({ owner: "documents", kind: "save", label: "save note" });
    const waiting = registry.settled({ timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);
    await expect(waiting).resolves.toEqual({
      status: "timed-out",
      pending: [expect.objectContaining({ owner: "documents", kind: "save", label: "save note" })],
      excluded: [expect.objectContaining({ owner: "motion", kind: "stream", label: "live sensor" })],
    });
    finite.cancel("test cleanup");
    excluded.release();
    registry.dispose();
    vi.useRealTimers();
  });

  it("keeps runtimes independent and clears producer subscriptions on teardown", () => {
    const options = (id: string) => ({
      runtimeId: runtimeId(id),
      now: () => 0,
      setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const first = createSettlementRegistry(options("runtime:first"));
    const second = createSettlementRegistry(options("runtime:second"));
    const listeners = new Set<() => void>();
    first.registerProducer({
      id: "fixture",
      inspect: () => [{ id: "pending", owner: "fixture", kind: "load", label: "first only" }],
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    });
    expect(first.getState().pending).toHaveLength(1);
    expect(second.getState().pending).toHaveLength(0);
    expect(listeners.size).toBe(1);
    first.dispose();
    expect(listeners.size).toBe(0);
    second.dispose();
  });

  it("releases a producer acquired during reentrant runtime disposal", () => {
    const registry = createSettlementRegistry({ runtimeId: runtimeId("reentrant"), now: () => 0,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const release = vi.fn();
    expect(() => registry.registerProducer({ id: "reentrant", inspect: () => [],
      subscribe() { registry.dispose(); return release; },
    })).toThrow(/disposed/);
    expect(release).toHaveBeenCalledOnce();
  });

  it("observes real mounted audio startup and stop while continuous media remains excluded", async () => {
    let serial = 0;
    const id = runtimeId("runtime:mounted-media-settlement");
    const owner = new AbortController();
    const operations = createOperationCoordinator({
      runtimeId: id,
      now: () => performance.now(),
      randomUUID: () => "media-op:" + ++serial,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const presentation = createPresentationSettlementCoordinator({
      runtimeId: id,
      randomUUID: () => "media-presentation:" + ++serial,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const disposalParticipants: Array<{ prepare(): unknown }> = [];
    const runtimeOwner = {
      runtimeId: id,
      signal: owner.signal,
      environment: { now: () => performance.now() },
      operations,
      presentationSettlements: presentation,
      registerDisposalParticipant(participant: { prepare(): unknown }) {
        disposalParticipants.push(participant);
      },
    } as any;
    const registry = getRuntimeSettlement(runtimeOwner);
    const settlement = createMountedSettlementPort(runtimeOwner);

    let resolveStart!: () => void;
    const startReceipt = new Promise<void>(resolve => { resolveStart = resolve; });
    const engine = {
      start: vi.fn(() => startReceipt),
      stop: vi.fn(),
      dispose: vi.fn(),
    };
    const graphOwner = new AbortController();
    const graph = createMountedAudioGraphs(
      { createEngine: vi.fn(() => engine) } as any,
      graphOwner.signal,
      () => ["audio.play"],
      "com.syndromatic.media-probe",
      Object.freeze({}),
      settlement,
    ).createEngine(new AUFXAudioFormat(48_000, 1));
    const starting = graph.start();
    expect(registry.getState().pending).toContainEqual(expect.objectContaining({
      owner: "audio",
      kind: "start",
      label: "com.syndromatic.media-probe",
    }));

    let startupSettled = false;
    const startupSettlement = registry.settled({ timeoutMs: 500 }).then(result => {
      startupSettled = true;
      return result;
    });
    await Promise.resolve();
    expect(startupSettled).toBe(false);
    resolveStart();
    await starting;
    expect(registry.getState().excluded).toContainEqual(expect.objectContaining({
      owner: "audio",
      kind: "stream",
      label: "com.syndromatic.media-probe",
    }));
    await expect(startupSettlement).resolves.toMatchObject({
      status: "settled",
      excluded: expect.arrayContaining([expect.objectContaining({ owner: "audio", kind: "stream" })]),
    });
    graph.stop();
    expect(registry.getState().excluded).not.toContainEqual(expect.objectContaining({ owner: "audio", kind: "stream" }));

    let recorderListener: ((event: any) => void) | null = null;
    const recorderPort = {
      mimeType: "audio/webm",
      now: () => performance.now() / 1000,
      subscribe: (listener: (event: any) => void) => {
        recorderListener = listener;
        return () => { recorderListener = null; };
      },
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
      dispose: vi.fn(),
      decode: vi.fn(async () => ({ duration: 1, frameCount: 48_000, sampleRate: 48_000, channelCount: 1 })),
    };
    const recorder = new AUFXAudioRecorder(recorderPort);
    const captureSession = new AUFXAudioSession({
      state: "active",
      route: { desiredInput: null, actualInput: null, desiredOutput: null, actualOutput: null },
      capabilities: { capture: true, inputSelection: false, outputSelection: false, mimeTypes: ["audio/webm"] },
      requestRecordAuthorization: async () => undefined,
      enumerateDevices: async () => [],
      setPreferredInput: async () => undefined,
      setPreferredOutput: async () => undefined,
      createRecorder: () => recorder,
      createInputNode: () => { throw new Error("unused"); },
      subscribe: () => () => {},
      dispose: vi.fn(),
    } as any);
    const sessionOwner = new AbortController();
    const mountedSession = createMountedAudioSessions(
      { createSession: () => captureSession },
      sessionOwner.signal,
      () => ["audio.record"],
      Object.freeze({}),
      "com.syndromatic.media-probe",
      settlement,
    ).createSession();
    const take = mountedSession.createRecorder();
    take.record();
    expect(registry.getState().excluded).toContainEqual(expect.objectContaining({
      owner: "audio",
      kind: "recording",
      label: "com.syndromatic.media-probe",
    }));
    await expect(registry.settled({ timeoutMs: 250 })).resolves.toMatchObject({ status: "settled" });

    const stopping = take.stop();
    expect(registry.getState().excluded).not.toContainEqual(expect.objectContaining({ owner: "audio", kind: "recording" }));
    expect(registry.getState().pending).toContainEqual(expect.objectContaining({
      owner: "audio",
      kind: "stop",
      label: "com.syndromatic.media-probe",
    }));
    let stopSettled = false;
    const stopSettlement = registry.settled({ timeoutMs: 500 }).then(result => {
      stopSettled = true;
      return result;
    });
    await Promise.resolve();
    expect(stopSettled).toBe(false);
    recorderListener?.({ type: "data", data: new Blob([new Uint8Array([1, 2])], { type: "audio/webm" }) });
    recorderListener?.({ type: "stop" });
    await stopping;
    await expect(stopSettlement).resolves.toMatchObject({ status: "settled", pending: [] });

    mountedSession.dispose();
    graph.dispose();
    graphOwner.abort();
    sessionOwner.abort();
    owner.abort();
    registry.dispose();
    operations.dispose();
    presentation.dispose();
    expect(disposalParticipants).toHaveLength(1);
  });

  it("settles route navigation while mounted audio and Location stay live, then joins real recorder finalization", async () => {
    const runtime = createTestRuntime({ id: "runtime:test03-continuous-route" });
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
    registerTestSynWare(runtime, createSynWare({
      manifest: {
        schemaVersion: 1,
        id: "journal",
        version: "1.0.0",
        title: "Journal",
        routes: [{ path: "/journal", primary: true }],
        permissions: ["app.open.public"],
      },
      root: () => null,
    }));
    const registry = getRuntimeSettlement(runtime);
    const settlement = createMountedSettlementPort(runtime);
    const audioOwner = new AbortController();
    const engine = { start: vi.fn(async () => undefined), stop: vi.fn(), dispose: vi.fn() };
    const graph = createMountedAudioGraphs(
      { createEngine: vi.fn(() => engine) } as any,
      audioOwner.signal,
      () => ["audio.play"],
      "com.syndromatic.continuous-route",
      Object.freeze({}),
      settlement,
    ).createEngine(new AUFXAudioFormat(48_000, 1));
    await graph.start();

    const locationOwner = new AbortController();
    const locationWatchDispose = vi.fn();
    const locationManagerDispose = vi.fn();
    const location = createMountedLocationClient(
      {
        createManager: () => ({
          getAuthorizationStatus: async () => "granted",
          current: async () => { throw new Error("unused"); },
          watch: () => ({ dispose: locationWatchDispose }),
          dispose: locationManagerDispose,
        }),
      } as any,
      locationOwner.signal,
      () => ["location.read", "location.request"],
      () => true,
      "com.syndromatic.continuous-route",
      settlement,
    );
    const manager = location.createManager();
    const watch = manager.watch({ accuracy: "balanced", maximumAgeSeconds: 0, minimumIntervalSeconds: 0 }, () => undefined);
    expect(registry.getState().excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: "audio", kind: "stream", label: "com.syndromatic.continuous-route" }),
      expect.objectContaining({ owner: "location", kind: "watch", label: "com.syndromatic.continuous-route" }),
    ]));

    const navigation = runtime.routes.openRoute("/journal");
    const routeSettlement = registry.settled({ timeoutMs: 1_000 });
    await expect(navigation.result).resolves.toMatchObject({ status: "completed", committed: true });
    await expect(routeSettlement).resolves.toMatchObject({
      status: "settled",
      excluded: expect.arrayContaining([
        expect.objectContaining({ owner: "audio", kind: "stream" }),
        expect.objectContaining({ owner: "location", kind: "watch" }),
      ]),
    });

    let recorderListener: ((event: any) => void) | null = null;
    const recorderPort = {
      mimeType: "audio/webm",
      now: () => performance.now() / 1000,
      subscribe(listener: (event: any) => void) { recorderListener = listener; return () => { recorderListener = null; }; },
      start: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), dispose: vi.fn(),
      decode: vi.fn(async () => ({ duration: 1, frameCount: 48_000, sampleRate: 48_000, channelCount: 1 })),
    };
    const recorder = new AUFXAudioRecorder(recorderPort);
    const captureSession = new AUFXAudioSession({
      state: "active",
      route: { desiredInput: null, actualInput: null, desiredOutput: null, actualOutput: null },
      capabilities: { capture: true, inputSelection: false, outputSelection: false, mimeTypes: ["audio/webm"] },
      requestRecordAuthorization: async () => undefined,
      enumerateDevices: async () => [],
      setPreferredInput: async () => undefined,
      setPreferredOutput: async () => undefined,
      createRecorder: () => recorder,
      createInputNode: () => { throw new Error("unused"); },
      subscribe: () => () => undefined,
      dispose: vi.fn(),
    } as any);
    const recordingOwner = new AbortController();
    const mountedSession = createMountedAudioSessions(
      { createSession: () => captureSession },
      recordingOwner.signal,
      () => ["audio.record"],
      Object.freeze({}),
      "com.syndromatic.continuous-route",
      settlement,
    ).createSession();
    const take = mountedSession.createRecorder();
    take.record();
    const stopping = take.stop();
    expect(registry.getState().pending).toContainEqual(expect.objectContaining({
      owner: "audio",
      kind: "stop",
      label: "com.syndromatic.continuous-route",
    }));
    let stopSettled = false;
    const finiteStopSettlement = registry.settled({ timeoutMs: 1_000 }).then(result => { stopSettled = true; return result; });
    await Promise.resolve();
    expect(stopSettled).toBe(false);
    recorderListener?.({ type: "data", data: new Blob([new Uint8Array([1])], { type: "audio/webm" }) });
    recorderListener?.({ type: "stop" });
    await stopping;
    await expect(finiteStopSettlement).resolves.toMatchObject({
      status: "settled",
      excluded: expect.arrayContaining([
        expect.objectContaining({ owner: "audio", kind: "stream" }),
        expect.objectContaining({ owner: "location", kind: "watch" }),
      ]),
    });

    mountedSession.dispose();
    watch.dispose();
    manager.dispose();
    graph.stop();
    graph.dispose();
    recordingOwner.abort();
    locationOwner.abort();
    audioOwner.abort();
    await runtime.dispose("TEST-03 continuous route complete");
    expect(locationWatchDispose).toHaveBeenCalledOnce();
    expect(locationManagerDispose).toHaveBeenCalledOnce();
  });


  it("names a missing presentation role in timeout diagnostics and only tracks promises that explicitly opt in", async () => {
    vi.useFakeTimers();
    const registry = createSettlementRegistry({
      runtimeId: runtimeId("runtime:diagnostics"),
      now: () => Date.now(),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const presentation = createPresentationSettlementCoordinator({
      runtimeId: runtimeId("runtime:diagnostics"),
      randomUUID: () => "presentation:missing-role",
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const removePresentation = registerPresentationSettlement(registry, presentation);
    const watchdog = {
      now: () => Date.now(),
      setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
    const testing = createSynWareTesting({
      settlement: {
        getState: () => registry.getState(),
        subscribe: listener => registry.subscribe(listener),
        settled: options => registry.settled(options),
        begin: input => registry.begin(input),
        exclude: input => registry.exclude(input),
      },
      navigation: { openRoute: () => undefined },
    }, { defaultTimeoutMs: 1_000, watchdog });

    let resolveRaw!: () => void;
    const raw = new Promise<void>(resolve => { resolveRaw = resolve; });
    await expect(testing.settled({ timeoutMs: 25 })).resolves.toMatchObject({ status: "settled" });

    let resolveRegistered!: () => void;
    const registeredSource = new Promise<void>(resolve => { resolveRegistered = resolve; });
    const registered = testing.track("registered fetch", registeredSource, { timeoutMs: 1_000 });
    await Promise.resolve();
    expect(registry.getState().pending).toEqual([
      expect.objectContaining({ owner: "app-waiter", label: "registered fetch" }),
    ]);
    resolveRegistered();
    await registered;

    const missing = presentation.begin({ operationId: "route:missing-role", roles: ["route", "content"], timeoutMs: 1_000 });
    missing.completeRole("route");
    const timedOut = testing.settled({ timeoutMs: 30 });
    await vi.advanceTimersByTimeAsync(30);
    await expect(timedOut).resolves.toEqual({
      status: "timed-out",
      pending: [expect.objectContaining({ owner: "presentation", kind: "roles", label: "content" })],
      excluded: [],
    });

    resolveRaw();
    missing.cancel("test cleanup");
    testing.dispose();
    removePresentation();
    presentation.dispose();
    registry.dispose();
    vi.useRealTimers();
    await raw;
  });
});
