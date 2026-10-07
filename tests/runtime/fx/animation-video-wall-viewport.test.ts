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
import { expect, it, vi } from "vitest";
import { AFXRenderer, type AFXRendererScene } from "../../../src/FX/AnimationFX/public";
import { BrowserAFXCanvasRenderer } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer";

const scheduler = { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false };

it("resizes CSS scene and physical backing while preserving the same layer tree", () => {
  const canvas = document.createElement("canvas"); canvas.width = 100; canvas.height = 50;
  const calls: unknown[][] = [];
  const context = { clearRect(...args: unknown[]) { calls.push(args); }, save() {}, restore() {}, setTransform() {}, drawImage() {} };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement, kind: string) {
    return kind === "2d" ? context : null;
  } as HTMLCanvasElement["getContext"]);
  const wall = new AFXRenderer({ scheduler, target: new BrowserAFXCanvasRenderer(canvas), width: 100, height: 50 });
  const layer = wall.makeLayer();
  wall.setViewport({ width: 240, height: 120, pixelRatio: 1.5 });
  expect(canvas.width).toBe(360); expect(canvas.height).toBe(180);
  expect(canvas.style.width).toBe("240px"); expect(canvas.style.height).toBe("120px");
  expect(wall.layer.frame).toEqual({ x: 0, y: 0, width: 240, height: 120 });
  expect(layer.superlayer).toBe(wall.layer);
  wall.render();
  expect(calls.at(-1)).toEqual([0, 0, 240, 120]);
  expect(() => wall.setViewport({ width: 0, height: 10, pixelRatio: 1 })).toThrow();
  expect(canvas.width).toBe(360);
  wall.dispose();
  getContext.mockRestore();
});

it("passes updated logical size and DPR to a renderer without replacing scene identity", () => {
  const scenes: AFXRendererScene[] = [];
  const viewports: unknown[] = [];
  const wall = new AFXRenderer({ scheduler, target: { render: scene => { scenes.push(scene); }, setViewport: viewport => { viewports.push(viewport); }, dispose() {} }, width: 100, height: 50 });
  const layer = wall.makeLayer();
  wall.setViewport({ width: 101, height: 51, pixelRatio: 2 });
  wall.render();
  expect(viewports).toEqual([{ width: 101, height: 51, pixelRatio: 2 }]);
  expect(scenes.at(-1)).toMatchObject({ width: 101, height: 51, pixelRatio: 2 });
  expect(layer.superlayer).toBe(wall.layer);
  wall.dispose();
});

it("submits resize synchronously and rolls the wall viewport back when submission fails", () => {
  const scenes: AFXRendererScene[] = [];
  let fail = false;
  const wall = new AFXRenderer({ scheduler, target: {
    render(scene) { if (fail) throw new Error("resize failed"); scenes.push(scene); },
    setViewport() {}, dispose() {},
  }, width: 100, height: 50 });
  wall.render();
  wall.setViewport({ width: 200, height: 100, pixelRatio: 2 });
  expect(scenes.at(-1)).toMatchObject({ width: 200, height: 100, pixelRatio: 2 });
  expect(wall.layer.frame.width).toBe(200);
  fail = true;
  expect(() => wall.setViewport({ width: 240, height: 120, pixelRatio: 2 })).toThrow(/resize failed/);
  expect(wall.layer.frame).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  fail = false;
  wall.render();
  expect(scenes.at(-1)?.width).toBe(200);
  wall.dispose();
});

it("preserves the visible Canvas2D backing when staged resize drawing fails", () => {
  const canvas = document.createElement("canvas"); canvas.width = 100; canvas.height = 50;
  let fail = false;
  const context = { save() {}, restore() {}, setTransform() {}, drawImage() {}, clearRect() { if (fail) throw new Error("staging failed"); } };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement, kind: string) {
    return kind === "2d" ? context : null;
  } as HTMLCanvasElement["getContext"]);
  try {
    const wall = new AFXRenderer({ scheduler, target: new BrowserAFXCanvasRenderer(canvas), width: 100, height: 50 });
    wall.render();
    fail = true;
    expect(() => wall.setViewport({ width: 200, height: 100, pixelRatio: 2 })).toThrow(/staging failed/);
    expect(canvas.width).toBe(100); expect(canvas.height).toBe(50);
    expect(wall.layer.frame.width).toBe(100);
    wall.dispose();
  } finally { getContext.mockRestore(); }
});
