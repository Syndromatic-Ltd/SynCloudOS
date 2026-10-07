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
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserAnimationLayerHost } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerHost";
import { prepareRenderedCanvasCapture } from "../../../src/SynCloudOS/AnimationFX/renderedCanvasCapture";

const targets = vi.hoisted(() => [] as Array<{ available: boolean; loseDuringRender: boolean; calls: number }>);
vi.mock("../../../src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer", () => ({
  BrowserAFXCanvasRenderer: class {
    available = true;
    loseDuringRender = false;
    calls = 0;
    constructor() { targets.push(this); }
    setViewport() {}
    render() { this.calls++; if (this.loseDuringRender) { this.available = false; return false; } return true; }
    dispose() { this.available = false; }
  },
}));
const scenes: Array<{ dispose(): void }> = [];
afterEach(() => { for (const scene of scenes.splice(0)) scene.dispose(); targets.splice(0); });
function scene() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 8;
  const owner = new AbortController();
  const host = createBrowserAnimationLayerHost(document, { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false });
  const renderer = host.createRenderer(canvas, {}, owner.signal); scenes.push(renderer);
  const target = targets.at(-1)!;
  return { canvas, owner, host, renderer, target };
}

it("declines capture if the GPU becomes unavailable during the synchronous redraw", () => {
  const { canvas, target } = scene();
  target.loseDuringRender = true;
  expect(prepareRenderedCanvasCapture(canvas)).toBe(false);
  expect(target.calls).toBe(1);
});

it("redraws synchronously after availability recovers", () => {
  const { canvas, target } = scene();
  target.loseDuringRender = true;
  expect(prepareRenderedCanvasCapture(canvas)).toBe(false);
  target.available = true; target.loseDuringRender = false;
  expect(prepareRenderedCanvasCapture(canvas)).toBe(true);
  expect(target.calls).toBe(2);
});

it("skips an unavailable renderer without attempting a redraw", () => {
  const { canvas, target } = scene(); target.available = false;
  expect(prepareRenderedCanvasCapture(canvas)).toBe(false);
  expect(target.calls).toBe(0);
});

it("releases the old capture binding on abort and permits a fresh owner", () => {
  const { canvas, owner, host, target } = scene();
  owner.abort();
  prepareRenderedCanvasCapture(canvas);
  expect(target.calls).toBe(0);
  const next = host.createRenderer(canvas, {}, new AbortController().signal); scenes.push(next);
  expect(prepareRenderedCanvasCapture(canvas)).toBe(true);
  expect(targets.at(-1)!.calls).toBe(1);
});
