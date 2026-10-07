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

import { afterEach, describe, expect, it } from "vitest";
import {
  deriveWindowGestureBounds,
  type WindowResizeEdge,
} from "../../src/Webspring/WindowLayer/useWindowMoveResize";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";
import {
  createControlledFrameEnvironment,
  installPointerCaptureShims,
  pointerEvent,
  renderWindowMoveResize,
} from "../fixtures/windowMoveResizeFixture";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("deriveWindowGestureBounds", () => {
  const initial = { x: 100, y: 100, width: 400, height: 300 };
  const expected: Readonly<Record<WindowResizeEdge, { x: number; y: number; width: number; height: number }>> = {
    "block-start": { x: 100, y: 120, width: 400, height: 280 },
    "block-end": { x: 100, y: 100, width: 400, height: 320 },
    "inline-start": { x: 130, y: 100, width: 370, height: 300 },
    "inline-end": { x: 100, y: 100, width: 430, height: 300 },
    "block-start-inline-start": { x: 130, y: 120, width: 370, height: 280 },
    "block-start-inline-end": { x: 100, y: 120, width: 430, height: 280 },
    "block-end-inline-start": { x: 130, y: 100, width: 370, height: 320 },
    "block-end-inline-end": { x: 100, y: 100, width: 430, height: 320 },
  };

  for (const edge of Object.keys(expected) as WindowResizeEdge[]) {
    it(`derives the ${edge} edge from immutable gesture origin`, () => {
      expect(deriveWindowGestureBounds({
        kind: "resize",
        edge,
        initialBounds: initial,
        inlineDelta: 30,
        blockDelta: 20,
        minimumSize: { width: 240, height: 160 },
        maximumSize: { width: 600, height: 450 },
      })).toEqual(expected[edge]);
    });
  }

  it("anchors the opposing edge while clamping direction reversal to min/max size", () => {
    expect(deriveWindowGestureBounds({
      kind: "resize",
      edge: "block-start-inline-start",
      initialBounds: initial,
      inlineDelta: 500,
      blockDelta: 500,
      minimumSize: { width: 240, height: 160 },
      maximumSize: { width: 600, height: 450 },
    })).toEqual({ x: 260, y: 240, width: 240, height: 160 });
    expect(deriveWindowGestureBounds({
      kind: "resize",
      edge: "block-end-inline-end",
      initialBounds: initial,
      inlineDelta: 500,
      blockDelta: 500,
      minimumSize: { width: 240, height: 160 },
      maximumSize: { width: 600, height: 450 },
    })).toEqual({ x: 100, y: 100, width: 600, height: 450 });
  });
});

describe("useWindowMoveResize", () => {
  it("uses pointer capture, schedules absolute replacements and flushes without owning a frame", async () => {
    cleanups.push(installPointerCaptureShims());
    const frames = createControlledFrameEnvironment();
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    fixture.manager.create(standardWindow("window-1", { bounds: { x: 80, y: 60, width: 400, height: 300 } }));
    await fixture.manager.open("window-1");
    const rendered = renderWindowMoveResize(fixture.manager, { windowControllerId: "window-1", gesture: { kind: "move" } });
    cleanups.push(() => rendered.unmount());
    const target = rendered.getByTestId("gesture-target");

    target.dispatchEvent(pointerEvent("pointerdown", { pointerId: 7, clientX: 100, clientY: 100 }));
    expect(target.hasPointerCapture(7)).toBe(true);
    target.dispatchEvent(pointerEvent("pointermove", { pointerId: 7, clientX: 120, clientY: 130 }));
    target.dispatchEvent(pointerEvent("pointermove", { pointerId: 7, clientX: 140, clientY: 150 }));
    expect(frames.pending()).toBe(1);
    expect(fixture.manager.select("window-1").record.bounds).toEqual({ x: 80, y: 60, width: 400, height: 300 });
    target.dispatchEvent(pointerEvent("pointerup", { pointerId: 7, clientX: 140, clientY: 150 }));
    expect(target.hasPointerCapture(7)).toBe(false);
    expect(frames.pending()).toBe(0);
    expect(fixture.manager.select("window-1").record.bounds).toEqual({ x: 120, y: 110, width: 400, height: 300 });
  });

  it("cancels on pointer cancellation and unmount, and ignores non-primary buttons", async () => {
    cleanups.push(installPointerCaptureShims());
    const frames = createControlledFrameEnvironment();
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    fixture.manager.create(standardWindow("window-1"));
    await fixture.manager.open("window-1");
    const rendered = renderWindowMoveResize(fixture.manager, {
      windowControllerId: "window-1",
      gesture: { kind: "resize", edge: "block-end-inline-end" },
    });
    const target = rendered.getByTestId("gesture-target");

    target.dispatchEvent(pointerEvent("pointerdown", { button: 1, clientX: 0, clientY: 0 }));
    expect(target.hasPointerCapture(1)).toBe(false);
    target.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 100, clientY: 100 }));
    target.dispatchEvent(pointerEvent("pointermove", { pointerId: 2, clientX: 140, clientY: 140 }));
    expect(frames.pending()).toBe(1);
    target.dispatchEvent(pointerEvent("pointercancel", { pointerId: 2 }));
    expect(frames.pending()).toBe(0);

    target.dispatchEvent(pointerEvent("pointerdown", { pointerId: 3, clientX: 100, clientY: 100 }));
    target.dispatchEvent(pointerEvent("pointermove", { pointerId: 3, clientX: 120, clientY: 120 }));
    expect(frames.pending()).toBe(1);
    rendered.unmount();
    expect(frames.pending()).toBe(0);
  });
});
