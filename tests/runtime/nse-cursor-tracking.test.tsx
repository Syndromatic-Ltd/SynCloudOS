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
import React, { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSECursor, useNSETrackingRegion } from "../../src/NSE/NSE";
import type {
  RuntimeCursorImageLease,
  RuntimePointerAdapter,
  RuntimePointerAdapterEvent,
  RuntimeResolvedCursor,
} from "../../src/SynCloudOS/SynCloudOS";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";
import { BrowserPointerAdapter } from "../../src/SynCloudOS/PlatformAdapters/BrowserPointerAdapter";
import { standardWindow } from "../fixtures/windowTestDependencies";

class RecordingPointerAdapter implements RuntimePointerAdapter {
  readonly roots = new Map<object, (event: RuntimePointerAdapterEvent) => void>();
  readonly regions = new Map<string, { root: object; element: object }>();
  readonly cursors = new Map<object, RuntimeResolvedCursor | null>();
  readonly releases: string[] = [];
  rootListenerCount = 0;
  resizeObserverCount = 0;
  intersectionObserverCount = 0;
  resolveImage = vi.fn(async (resourceId: string, signal: AbortSignal): Promise<RuntimeCursorImageLease> => {
    signal.throwIfAborted();
    const handle = Object.freeze({ resourceId });
    return Object.freeze({
      handle,
      resourceId,
      byteLength: 4096,
      intrinsicWidth: 64,
      intrinsicHeight: 64,
      devicePixelRatio: 2,
      release: () => { this.releases.push(resourceId); },
    });
  });

  bindRoot(root: object, listener: (event: RuntimePointerAdapterEvent) => void) {
    this.roots.set(root, listener);
    this.rootListenerCount += 7;
    this.resizeObserverCount += 1;
    this.intersectionObserverCount += 1;
    const focus = (event: FocusEvent, kind: "in" | "out") => {
      const target = kind === "in" ? event.target : event.relatedTarget;
      const path = [...this.regions.entries()].filter(([, binding]) => binding.root === root && target instanceof Node && (binding.element as Node).contains(target))
        .sort((left, right) => (left[1].element as Node).contains(right[1].element as Node) ? 1 : -1)
        .map(([id]) => id);
      listener({ kind: "update", input: "keyboard", pointerId: 0, x: 0, y: 0, regionPath: path });
    };
    const focusIn = (event: Event) => focus(event as FocusEvent, "in");
    const focusOut = (event: Event) => focus(event as FocusEvent, "out");
    if (root instanceof HTMLElement) {
      root.addEventListener("focusin", focusIn);
      root.addEventListener("focusout", focusOut);
    }
    return () => {
      if (root instanceof HTMLElement) {
        root.removeEventListener("focusin", focusIn);
        root.removeEventListener("focusout", focusOut);
      }
      this.roots.delete(root);
      this.rootListenerCount -= 7;
      this.resizeObserverCount -= 1;
      this.intersectionObserverCount -= 1;
      this.cursors.delete(root);
    };
  }

  bindRegion(root: object, element: object, regionId: string) {
    this.regions.set(regionId, { root, element });
    return () => { this.regions.delete(regionId); };
  }

  orderRegionIds(root: object, regionIds: readonly string[]) {
    const indexed = regionIds.map((id, index) => ({ id, index, element: this.regions.get(id)?.element }));
    return Object.freeze(indexed.sort((left, right) => {
      if (left.element instanceof Node && right.element instanceof Node) {
        if (left.element.contains(right.element)) return -1;
        if (right.element.contains(left.element)) return 1;
      }
      return left.index - right.index;
    }).map(({ id }) => id));
  }

  applyCursor(root: object, cursor: RuntimeResolvedCursor | null) {
    this.cursors.set(root, cursor);
  }

  resolveCursorImage(resourceId: string, signal: AbortSignal) {
    return this.resolveImage(resourceId, signal);
  }

  dispatch(root: object, event: RuntimePointerAdapterEvent) {
    this.roots.get(root)?.(event);
  }
}

const runtimes: ReturnType<typeof createTestRuntime>[] = [];

afterEach(async () => {
  cleanup();
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose("test");
});

function runtimeWithPointer(id: string): { runtime: ReturnType<typeof createTestRuntime>; pointer: RecordingPointerAdapter };
function runtimeWithPointer<T extends RuntimePointerAdapter>(id: string, pointer: T): { runtime: ReturnType<typeof createTestRuntime>; pointer: T };
function runtimeWithPointer(id: string, pointer: RuntimePointerAdapter = new RecordingPointerAdapter()) {
  const environment = createTestRuntimeEnvironment();
  Object.defineProperty(environment, "pointer", { enumerable: true, value: pointer });
  const runtime = createTestRuntime({ id, environment });
  runtimes.push(runtime);
  return { runtime, pointer };
}

describe("NSE cursor values", () => {
  it("releases browser cursor resources when abort or CSS-source validation prevents ownership transfer", async () => {
    let settleLate!: (lease: {
      readonly resourceId: string;
      readonly source: string;
      readonly byteLength: number;
      readonly intrinsicWidth: number;
      readonly intrinsicHeight: number;
      readonly devicePixelRatio: number;
      release(): void;
    }) => void;
    const lateRelease = vi.fn();
    const invalidRelease = vi.fn();
    const acquireCursorImage = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { settleLate = resolve; }))
      .mockResolvedValueOnce(Object.freeze({
        resourceId: "cursor:invalid-source", source: "bad\nsource", byteLength: 16,
        intrinsicWidth: 16, intrinsicHeight: 16, devicePixelRatio: 1, release: invalidRelease,
      }));
    const adapter = new BrowserPointerAdapter({
      cursorImages: { acquireCursorImage },
      createResizeObserver: () => null,
      createIntersectionObserver: () => null,
    });

    const controller = new AbortController();
    const pending = adapter.resolveCursorImage("cursor:late", controller.signal);
    controller.abort(new DOMException("owner gone", "AbortError"));
    settleLate(Object.freeze({
      resourceId: "cursor:late", source: "cursor.png", byteLength: 16,
      intrinsicWidth: 16, intrinsicHeight: 16, devicePixelRatio: 1, release: lateRelease,
    }));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(lateRelease).toHaveBeenCalledTimes(1);

    await expect(adapter.resolveCursorImage("cursor:invalid-source", new AbortController().signal))
      .rejects.toThrow(/CSS source/i);
    expect(invalidRelease).toHaveBeenCalledTimes(1);
  });

  it("normalises system and resource-backed image cursors without reading hostile accessors", () => {
    expect(NSECursor.system("crosshair")).toEqual({ kind: "crosshair" });
    expect(NSECursor.image({ resourceId: "document:cursor/paint", hotspot: { x: 8, y: 12 }, fallback: "pointer" })).toEqual({
      kind: "image",
      resourceId: "document:cursor/paint",
      hotspot: { x: 8, y: 12 },
      fallback: "pointer",
    });
    expect(() => NSECursor.image({ resourceId: "document:cursor/paint", hotspot: { x: -1, y: 0 }, fallback: "pointer" })).toThrow(/hotspot/i);
    expect(() => NSECursor.image({ resourceId: "document:cursor/paint", hotspot: { x: Number.NaN, y: 0 }, fallback: "pointer" })).toThrow(/finite/i);
    const getter = vi.fn(() => "pointer");
    const hostile = { resourceId: "document:cursor/paint", hotspot: { x: 0, y: 0 } };
    Object.defineProperty(hostile, "fallback", { enumerable: true, get: getter });
    expect(() => NSECursor.image(hostile as never)).toThrow(/data propert/i);
    expect(getter).not.toHaveBeenCalled();
  });

  it("validates decoded cursor metadata, byte and DPR bounds before applying the image", async () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:cursor-policy");
    const root = {};
    pointer.resolveImage.mockResolvedValueOnce(Object.freeze({
      handle: Object.freeze({ bad: true }), resourceId: "cursor:oversize", byteLength: 2_000_000,
      intrinsicWidth: 64, intrinsicHeight: 64, devicePixelRatio: 2, release: vi.fn(),
    }));
    const token = runtime.tracking.cursors.push({
      ownerId: "window:paint", root, pointerId: 1,
      cursor: NSECursor.image({ resourceId: "cursor:oversize", hotspot: { x: 1, y: 1 }, fallback: "crosshair" }),
    });
    await act(async () => { await Promise.resolve(); });
    expect(runtime.tracking.cursors.current).toEqual({ kind: "crosshair" });
    expect(pointer.cursors.get(root)).toEqual({ kind: "crosshair" });
    token.dispose();

    const release = vi.fn();
    pointer.resolveImage.mockResolvedValueOnce(Object.freeze({
      handle: Object.freeze({ bounds: true }), resourceId: "cursor:bounds", byteLength: 1024,
      intrinsicWidth: 16, intrinsicHeight: 16, devicePixelRatio: 2, release,
    }));
    const bounded = runtime.tracking.cursors.push({
      ownerId: "window:paint", root, pointerId: 1,
      cursor: NSECursor.image({ resourceId: "cursor:bounds", hotspot: { x: 8, y: 1 }, fallback: "default" }),
    });
    await act(async () => { await Promise.resolve(); });
    expect(runtime.tracking.cursors.current).toEqual({ kind: "default" });
    expect(release).toHaveBeenCalledTimes(1);
    bounded.dispose();
  });

  it("keeps cursor pushes owner-scoped and idempotent without disturbing intervening entries", () => {
    const { runtime } = runtimeWithPointer("runtime:cursor-stack");
    const root = {};
    const lower = runtime.tracking.cursors.push({ ownerId: "owner:a", root, pointerId: 1, cursor: NSECursor.system("crosshair") });
    const middle = runtime.tracking.cursors.push({ ownerId: "owner:b", root, pointerId: 2, cursor: NSECursor.system("text") });
    runtime.tracking.cursors.push({ ownerId: "owner:a", root, pointerId: 1, cursor: NSECursor.system("copy") });
    expect(runtime.tracking.cursors.currentFor(root)).toEqual({ kind: "copy" });
    runtime.tracking.cursors.disposeOwner("owner:a");
    expect(runtime.tracking.cursors.currentFor(root)).toEqual({ kind: "text" });
    lower.dispose();
    lower.dispose();
    middle.dispose();
    expect(runtime.tracking.cursors.currentFor(root)).toBeNull();
  });

  it("releases a custom cursor lease that settles after its token was replaced", async () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:cursor-late");
    let resolveLease!: (lease: RuntimeCursorImageLease) => void;
    pointer.resolveImage.mockImplementationOnce(() => new Promise((resolve) => { resolveLease = resolve; }));
    const release = vi.fn();
    const token = runtime.tracking.cursors.push({
      ownerId: "window:late", root: {}, pointerId: 3,
      cursor: NSECursor.image({ resourceId: "cursor:late", hotspot: { x: 2, y: 2 }, fallback: "default" }),
    });
    token.dispose();
    resolveLease(Object.freeze({
      handle: Object.freeze({}), resourceId: "cursor:late", byteLength: 1024,
      intrinsicWidth: 32, intrinsicHeight: 32, devicePixelRatio: 1, release,
    }));
    await act(async () => { await Promise.resolve(); });
    expect(release).toHaveBeenCalledTimes(1);
    expect(runtime.tracking.diagnostics().cursorEntryCount).toBe(0);
  });
});

describe("runtime tracking regions", () => {
  it("treats assume-inside as a modifier and seeds an exit without an initial enter", () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:assume-inside");
    const modifier = runtime.tracking.register({
      ownerId: "view:invalid", root: {}, element: {},
      options: ["entered-and-exited", "assume-inside"],
    });
    expect(modifier.id).toMatch(/tracking/);
    modifier.dispose();

    const root = {};
    const events: string[] = [];
    const region = runtime.tracking.register({
      ownerId: "view:seeded", root, element: {},
      options: ["entered-and-exited", "active-always", "assume-inside"],
      cursor: NSECursor.system("crosshair"),
      onEvent: ({ type }) => events.push(type),
    });
    expect(events).toEqual([]);
    expect(runtime.tracking.cursors.currentFor(root)).toEqual({ kind: "crosshair" });
    expect(runtime.tracking.diagnostics().activePointerCount).toBe(1);

    pointer.dispatch(root, {
      kind: "update", input: "pointer", pointerId: 0, x: 20, y: 30, regionPath: [],
    });
    expect(events).toEqual(["exited"]);
    expect(runtime.tracking.cursors.currentFor(root)).toBeNull();
    expect(runtime.tracking.diagnostics().activePointerCount).toBe(0);
    region.dispose();
  });

  it("reconciles child-first assumed registration to the first canonical nested path without false transitions", () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:assume-inside-nested");
    const root = {};
    const events: string[] = [];
    const inner = runtime.tracking.register({
      ownerId: "view:inner", root, element: {},
      options: ["entered-and-exited", "active-always", "assume-inside"],
      cursor: NSECursor.system("copy"),
      onEvent: ({ type }) => events.push(`inner:${type}`),
    });
    const outer = runtime.tracking.register({
      ownerId: "view:outer", root, element: {},
      options: ["entered-and-exited", "active-always", "assume-inside"],
      cursor: NSECursor.system("crosshair"),
      onEvent: ({ type }) => events.push(`outer:${type}`),
    });

    pointer.dispatch(root, {
      kind: "update", input: "pointer", pointerId: 7, x: 10, y: 12,
      regionPath: [inner.id, outer.id],
    });
    expect(events).toEqual([]);
    expect(runtime.tracking.cursors.currentFor(root)).toEqual({ kind: "copy" });

    pointer.dispatch(root, {
      kind: "update", input: "pointer", pointerId: 7, x: 3, y: 4,
      regionPath: [outer.id],
    });
    expect(events).toEqual(["inner:exited"]);
    expect(runtime.tracking.cursors.currentFor(root)).toEqual({ kind: "crosshair" });
    outer.dispose();
    inner.dispose();
  });

  it("consumes pending assumed membership on the next event from an already-active pointer", async () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:assume-existing-pointer");
    const root = {};
    const stable = runtime.tracking.register({
      ownerId: "view:stable", root, element: {}, options: ["entered-and-exited", "active-always"],
    });
    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 1, x: 1, y: 1, regionPath: [stable.id] });
    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 2, x: 2, y: 2, regionPath: [stable.id] });
    const exits: number[] = [];
    const assumed = runtime.tracking.register({
      ownerId: "view:pending", root, element: {},
      options: ["entered-and-exited", "active-always", "assume-inside"],
      cursor: NSECursor.image({ resourceId: "cursor:pending-assumption", hotspot: { x: 1, y: 1 }, fallback: "crosshair" }),
      onEvent: ({ type, pointerId }) => { if (type === "exited") exits.push(pointerId); },
    });
    await act(async () => { await Promise.resolve(); });
    expect(runtime.tracking.diagnostics()).toMatchObject({ activePointerCount: 3, cursorEntryCount: 1 });

    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 1, x: 3, y: 3, regionPath: [stable.id] });
    expect(exits).toEqual([1]);
    expect(pointer.releases).toEqual(["cursor:pending-assumption"]);
    expect(runtime.tracking.cursors.currentFor(root)).toBeNull();
    expect(runtime.tracking.diagnostics()).toMatchObject({ activePointerCount: 2, cursorEntryCount: 0 });
    assumed.dispose();
    stable.dispose();
  });

  it("retains pending assumption ownership when injected containment ordering is invalid", async () => {
    const pointer = new RecordingPointerAdapter();
    const order = vi.spyOn(pointer, "orderRegionIds");
    const { runtime } = runtimeWithPointer("runtime:assume-invalid-order", pointer);
    const root = {};
    const stable = runtime.tracking.register({
      ownerId: "view:stable-order", root, element: {}, options: ["entered-and-exited", "active-always"],
    });
    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 1, x: 1, y: 1, regionPath: [stable.id] });
    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 2, x: 2, y: 2, regionPath: [stable.id] });
    const assumed = runtime.tracking.register({
      ownerId: "view:pending-order", root, element: {},
      options: ["entered-and-exited", "active-always", "assume-inside"],
      cursor: NSECursor.image({ resourceId: "cursor:pending-order", hotspot: { x: 1, y: 1 }, fallback: "crosshair" }),
    });
    await act(async () => { await Promise.resolve(); });

    order.mockImplementationOnce((_root, ids) => Object.freeze([ids[0], ids[0]]));
    expect(() => pointer.dispatch(root, {
      kind: "update", input: "pointer", pointerId: 1, x: 3, y: 3, regionPath: [stable.id],
    })).toThrow(/membership/i);
    expect(runtime.tracking.diagnostics()).toMatchObject({ activePointerCount: 3, cursorEntryCount: 1 });
    expect(pointer.releases).toEqual([]);

    pointer.dispatch(root, {
      kind: "update", input: "pointer", pointerId: 1, x: 4, y: 4, regionPath: [stable.id],
    });
    expect(pointer.releases).toEqual(["cursor:pending-order"]);
    expect(runtime.tracking.diagnostics()).toMatchObject({ activePointerCount: 2, cursorEntryCount: 0 });
    assumed.dispose();
    stable.dispose();
  });

  it("orders an empty first leave by containment and releases each assumed cursor exactly once", async () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:assume-empty-nested");
    const root = document.createElement("div");
    const outerElement = document.createElement("div");
    const innerElement = document.createElement("div");
    root.append(outerElement);
    outerElement.append(innerElement);
    const events: string[] = [];
    const inner = runtime.tracking.register({
      ownerId: "view:empty-inner", root, element: innerElement,
      options: ["entered-and-exited", "active-always", "assume-inside"],
      cursor: NSECursor.image({ resourceId: "cursor:assumed-inner", hotspot: { x: 1, y: 1 }, fallback: "copy" }),
      onEvent: ({ type }) => { if (type === "exited") events.push("inner"); },
    });
    const outer = runtime.tracking.register({
      ownerId: "view:empty-outer", root, element: outerElement,
      options: ["entered-and-exited", "active-always", "assume-inside"],
      cursor: NSECursor.image({ resourceId: "cursor:assumed-outer", hotspot: { x: 1, y: 1 }, fallback: "crosshair" }),
      onEvent: ({ type }) => { if (type === "exited") events.push("outer"); },
    });
    await act(async () => { await Promise.resolve(); });

    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 9, x: 30, y: 30, regionPath: [] });
    expect(events).toEqual(["inner", "outer"]);
    expect(pointer.releases).toEqual(["cursor:assumed-inner", "cursor:assumed-outer"]);
    expect(runtime.tracking.diagnostics()).toMatchObject({ activePointerCount: 0, cursorEntryCount: 0 });
    outer.dispose();
    inner.dispose();
  });

  it("rejects accessor and sparse tracking options before binding any browser ownership", () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:hostile-options");
    const getter = vi.fn(() => "entered-and-exited");
    const accessor: unknown[] = [];
    Object.defineProperty(accessor, "0", { enumerable: true, get: getter });
    Object.defineProperty(accessor, "length", { value: 1 });
    expect(() => runtime.tracking.register({
      ownerId: "hostile", root: {}, element: {}, options: accessor as never,
    })).toThrow(/data propert/i);
    expect(getter).not.toHaveBeenCalled();
    expect(() => runtime.tracking.register({
      ownerId: "sparse", root: {}, element: {}, options: Object.assign(new Array(2), { 1: "active-always" }) as never,
    })).toThrow(/dense|data propert/i);
    expect(pointer.rootListenerCount).toBe(0);
    expect(runtime.tracking.diagnostics()).toMatchObject({ rootCount: 0, regionCount: 0 });
  });

  it("orders nested enter and exit transitions and restores the enclosing cursor", () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:nested");
    const root = {};
    const elements = [{}, {}];
    const events: string[] = [];
    const outer = runtime.tracking.register({
      ownerId: "window:canvas", root, element: elements[0], options: ["entered-and-exited", "moved", "active-always"],
      cursor: NSECursor.system("crosshair"), onEvent: ({ type }) => events.push(`outer:${type}`),
    });
    const inner = runtime.tracking.register({
      ownerId: "window:canvas", root, element: elements[1], options: ["entered-and-exited", "moved", "active-always"],
      cursor: NSECursor.system("copy"), onEvent: ({ type }) => events.push(`inner:${type}`),
    });

    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 4, x: 10, y: 12, regionPath: [outer.id] });
    expect(runtime.tracking.cursors.current).toEqual({ kind: "crosshair" });
    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 4, x: 11, y: 13, regionPath: [inner.id, outer.id] });
    expect(runtime.tracking.cursors.current).toEqual({ kind: "copy" });
    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 4, x: 12, y: 14, regionPath: [outer.id] });
    expect(runtime.tracking.cursors.current).toEqual({ kind: "crosshair" });
    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 4, x: 20, y: 30, regionPath: [] });

    expect(events).toEqual([
      "outer:entered", "outer:moved",
      "inner:entered", "inner:moved", "outer:moved",
      "inner:exited", "outer:moved",
      "outer:exited",
    ]);
    expect(runtime.tracking.cursors.current).toBeNull();
  });

  it("owns simultaneous pointer tokens independently and synthesises exactly one exit on cancellation and owner close", () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:multi-pointer");
    const root = {};
    const exited: number[] = [];
    const region = runtime.tracking.register({
      ownerId: "window:one", root, element: {}, options: ["entered-and-exited", "active-always"],
      cursor: NSECursor.system("grab"), onEvent: (event) => { if (event.type === "exited") exited.push(event.pointerId); },
    });
    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 1, x: 1, y: 1, regionPath: [region.id] });
    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 2, x: 2, y: 2, regionPath: [region.id] });
    expect(runtime.tracking.diagnostics().activePointerCount).toBe(2);
    pointer.dispatch(root, { kind: "cancel", input: "pointer", pointerId: 1, x: 1, y: 1, regionPath: [], reason: "pointercancel" });
    pointer.dispatch(root, { kind: "cancel", input: "pointer", pointerId: 1, x: 1, y: 1, regionPath: [], reason: "lostpointercapture" });
    runtime.tracking.disposeOwner("window:one", "window closed");

    expect(exited).toEqual([1, 2]);
    expect(runtime.tracking.diagnostics()).toMatchObject({ activePointerCount: 0, regionCount: 0, cursorEntryCount: 0 });
    expect(pointer.rootListenerCount).toBe(0);
    expect(pointer.resizeObserverCount).toBe(0);
    expect(pointer.intersectionObserverCount).toBe(0);
  });

  it("disposes view-owned regions through their distinct real window controller on removal", async () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:window-owned-region");
    const controller = runtime.windows.create(standardWindow("tracking-window", {
      applicationId: "com.syndromatic.PointerFixture",
      applicationSessionId: "session:pointer-fixture",
      content: { rendererId: "application", parameters: { appId: "com.syndromatic.PointerFixture" } },
    }));
    await runtime.windows.open(controller.id);
    const root = {};
    const exits: string[] = [];
    const region = runtime.tracking.register({
      ownerId: "view:canvas", windowControllerId: controller.id,
      root, element: {}, options: ["entered-and-exited", "active-always"],
      cursor: NSECursor.image({ resourceId: "cursor:window-owned", hotspot: { x: 2, y: 2 }, fallback: "crosshair" }),
      onEvent: ({ type, reason }) => { if (type === "exited") exits.push(reason ?? ""); },
    });
    pointer.dispatch(root, {
      kind: "update", input: "pointer", pointerId: 5, x: 2, y: 3, regionPath: [region.id],
    });
    await act(async () => { await Promise.resolve(); });
    expect(runtime.tracking.diagnostics()).toMatchObject({ regionCount: 1, cursorEntryCount: 1 });

    await expect(runtime.windows.requestClose(controller.id, { reason: "command" }))
      .resolves.toMatchObject({ outcome: "closed", windowControllerId: controller.id });
    expect(exits).toEqual(["window closed"]);
    expect(pointer.releases).toEqual(["cursor:window-owned"]);
    expect(runtime.tracking.diagnostics()).toMatchObject({
      rootCount: 0, regionCount: 0, activePointerCount: 0, cursorEntryCount: 0,
    });
  });

  it("isolates two runtimes sharing one document root and never changes a cursor outside its exact root", () => {
    const first = runtimeWithPointer("runtime:first");
    const second = runtimeWithPointer("runtime:second");
    const firstRoot = document.createElement("section");
    const secondRoot = document.createElement("section");
    const outside = document.createElement("section");
    document.body.append(firstRoot, secondRoot, outside);
    const firstRegion = first.runtime.tracking.register({
      ownerId: "first", root: firstRoot, element: {}, options: ["entered-and-exited", "active-always"], cursor: NSECursor.system("copy"),
    });
    second.runtime.tracking.register({
      ownerId: "second", root: secondRoot, element: {}, options: ["entered-and-exited", "active-always"], cursor: NSECursor.system("text"),
    });

    first.pointer.dispatch(firstRoot, { kind: "update", input: "pointer", pointerId: 1, x: 0, y: 0, regionPath: [firstRegion.id] });
    expect(first.pointer.cursors.get(firstRoot)).toEqual({ kind: "copy" });
    expect(first.pointer.cursors.has(outside)).toBe(false);
    expect(second.runtime.tracking.cursors.current).toBeNull();
    expect(second.pointer.cursors.has(secondRoot)).toBe(false);
    firstRoot.remove();
    secondRoot.remove();
    outside.remove();
  });

  it("connects the NSE hook to the injected root adapter and provides focus-equivalent transitions", () => {
    const { runtime } = runtimeWithPointer("runtime:hook");
    const events: string[] = [];
    function Fixture() {
      const root = useRef<HTMLDivElement>(null);
      const outer = useNSETrackingRegion({
        manager: runtime.tracking, ownerId: "window:hook", root,
        options: ["entered-and-exited", "moved", "active-always"], cursor: NSECursor.system("crosshair"),
        onEvent: ({ type, input }) => events.push(`${input}:${type}`),
      });
      return <div ref={root} data-testid="root"><button ref={outer.ref} {...outer.focusProps}>Track</button></div>;
    }
    const view = render(<Fixture />);
    const button = screen.getByRole("button", { name: "Track" });
    fireEvent.focusIn(button);
    fireEvent.focusOut(button);
    fireEvent.focusIn(button);
    view.unmount();
    expect(events).toEqual([
      "keyboard:entered", "keyboard:moved", "keyboard:exited",
      "keyboard:entered", "keyboard:moved", "keyboard:exited",
    ]);
    expect(runtime.tracking.diagnostics()).toMatchObject({ activePointerCount: 0, regionCount: 0, cursorEntryCount: 0 });
  });

  it("makes a non-button tracking host keyboard-reachable through focusProps", () => {
    const { runtime } = runtimeWithPointer("runtime:hook-div");
    const events: string[] = [];
    function Fixture() {
      const root = useRef<HTMLDivElement>(null);
      const region = useNSETrackingRegion({
        manager: runtime.tracking, ownerId: "window:hook-div", root,
        options: ["entered-and-exited", "moved", "active-always"],
        onEvent: ({ type, input }) => events.push(`${input}:${type}`),
      });
      return <div ref={root}><div ref={region.ref} {...region.focusProps}>Hover surface</div></div>;
    }
    render(<Fixture />);
    const host = screen.getByText("Hover surface");
    expect(host.tabIndex).toBe(0);
    expect(Object.keys(host).length >= 0).toBe(true);
    fireEvent.focusIn(host);
    fireEvent.focusOut(host);
    expect(events).toEqual(["keyboard:entered", "keyboard:moved", "keyboard:exited"]);
  });

  it("disconnects all root resources and releases pending image leases on runtime disposal", async () => {
    const { runtime, pointer } = runtimeWithPointer("runtime:pointer-dispose");
    const root = {};
    const region = runtime.tracking.register({
      ownerId: "view:cursor", root, element: {}, options: ["entered-and-exited", "active-always"],
      cursor: NSECursor.image({ resourceId: "cursor:brush", hotspot: { x: 4, y: 4 }, fallback: "crosshair" }),
    });
    pointer.dispatch(root, { kind: "update", input: "pointer", pointerId: 9, x: 2, y: 3, regionPath: [region.id] });
    await act(async () => { await Promise.resolve(); });
    expect(pointer.resolveImage).toHaveBeenCalledTimes(1);

    await runtime.dispose("pointer disposal test");
    runtimes.splice(runtimes.indexOf(runtime), 1);
    expect(pointer.releases).toEqual(["cursor:brush"]);
    expect(pointer.rootListenerCount).toBe(0);
    expect(pointer.resizeObserverCount).toBe(0);
    expect(pointer.intersectionObserverCount).toBe(0);
    expect(runtime.tracking.diagnostics()).toMatchObject({ activePointerCount: 0, regionCount: 0, cursorEntryCount: 0, rootCount: 0 });
  });

  it("keeps browser listeners, observers and cursor mutation inside the bound runtime root", () => {
    const observed = new Set<Element>();
    let disconnected = 0;
    const adapter = new BrowserPointerAdapter({
      createResizeObserver: () => ({
        observe: (element) => { observed.add(element); },
        unobserve: (element) => { observed.delete(element); },
        disconnect: () => { disconnected += 1; observed.clear(); },
      }),
      createIntersectionObserver: () => ({
        observe: (element) => { observed.add(element); },
        unobserve: (element) => { observed.delete(element); },
        disconnect: () => { disconnected += 1; observed.clear(); },
      }),
    });
    const { runtime } = runtimeWithPointer("runtime:browser-pointer", adapter);
    const root = document.createElement("div");
    const outer = document.createElement("div");
    const inner = document.createElement("button");
    const outside = document.createElement("div");
    document.body.append(root, outside);
    root.append(outer);
    outer.append(inner);
    const outerRegion = runtime.tracking.register({
      ownerId: "window:browser", root, element: outer, options: ["entered-and-exited", "active-always"], cursor: NSECursor.system("crosshair"),
    });
    const pointerTypes: string[] = [];
    const innerRegion = runtime.tracking.register({
      ownerId: "window:browser", root, element: inner, options: ["entered-and-exited", "active-always"], cursor: NSECursor.system("copy"),
      onEvent: (event) => { if (event.pointerType) pointerTypes.push(event.pointerType); },
    });

    fireEvent.pointerOver(inner, { pointerId: 7, clientX: 4, clientY: 5 });
    expect(root.style.cursor).toBe("copy");
    const pen = new Event("pointermove", { bubbles: true });
    Object.defineProperties(pen, {
      pointerId: { value: 8 },
      pointerType: { value: "pen" },
      clientX: { value: 6 },
      clientY: { value: 7 },
    });
    inner.dispatchEvent(pen);
    expect(pointerTypes).toContain("pen");
    expect(document.body.style.cursor).toBe("");
    expect(outside.style.cursor).toBe("");
    innerRegion.dispose();
    expect(root.style.cursor).toBe("crosshair");
    outerRegion.dispose();
    expect(root.style.cursor).toBe("");
    expect(observed.size).toBe(0);
    expect(disconnected).toBe(2);
    root.remove();
    outside.remove();
  });
});
