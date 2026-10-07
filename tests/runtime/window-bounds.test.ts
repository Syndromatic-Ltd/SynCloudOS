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

import { afterEach, describe, expect, it } from "vitest";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";
import { createControlledFrameEnvironment } from "../fixtures/windowMoveResizeFixture";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("WindowManager constrained bounds", () => {
  it("clamps size before position and keeps the complete 31px title bar reachable", async () => {
    const frames = createControlledFrameEnvironment({ width: 800, height: 600, devicePixelRatio: 3 });
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    const controller = fixture.manager.create(standardWindow("window-1", {
      bounds: { x: 100, y: 100, width: 400, height: 300 },
      minimumSize: { width: 240, height: 160 },
      maximumSize: { width: 600, height: 450 },
    }));
    await fixture.manager.open(controller.id);

    fixture.manager.setBounds(controller.id, { x: -10_000, y: -10_000, width: 20, height: 900 }, "programmatic");
    expect(controller.record.bounds).toEqual({ x: -144, y: 0, width: 240, height: 450 });

    fixture.manager.setBounds(controller.id, { x: 10_000, y: 10_000, width: 500, height: 300 }, "programmatic");
    expect(controller.record.bounds).toEqual({ x: 704, y: 569, width: 500, height: 300 });
  });

  it("rejects non-finite geometry and size changes on non-resizable windows", async () => {
    const frames = createControlledFrameEnvironment();
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    const controller = fixture.manager.create(standardWindow("fixed", {
      style: ["titled", "closable"],
      bounds: { x: 100, y: 100, width: 400, height: 300 },
    }));
    await fixture.manager.open(controller.id);

    expect(() => fixture.manager.setBounds(controller.id, { x: Number.NaN, y: 0, width: 400, height: 300 }, "programmatic")).toThrow(/finite CSS-pixel/i);
    expect(() => fixture.manager.setBounds(controller.id, { x: 120, y: 100, width: 401, height: 300 }, "programmatic")).toThrow(/not resizable/i);
    fixture.manager.setBounds(controller.id, { x: 120, y: 100, width: 400, height: 300 }, "programmatic");
    expect(controller.record.bounds.x).toBe(120);
  });

  it("lets a window the user cannot resize follow its own content's fitting size", async () => {
    const frames = createControlledFrameEnvironment();
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    const controller = fixture.manager.create(standardWindow("fitted", {
      style: ["titled", "closable"],
      bounds: { x: 100, y: 100, width: 360, height: 280 },
    }));
    await fixture.manager.open(controller.id);

    fixture.manager.setBounds(controller.id, { x: 100, y: 100, width: 340, height: 460 }, "content-size");
    expect(controller.record.bounds).toMatchObject({ width: 340, height: 460 });
    expect(() => fixture.manager.setBounds(controller.id, { x: 100, y: 100, width: 400, height: 460 }, "programmatic")).toThrow(/not resizable/i);
  });

  it("preserves exact normal geometry through zoom, minimise and constrained restore", async () => {
    const frames = createControlledFrameEnvironment({ width: 800, height: 600 });
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    const first = fixture.manager.create(standardWindow("first", { bounds: { x: 40, y: 40, width: 360, height: 280 } }));
    const second = fixture.manager.create(standardWindow("second", { bounds: { x: 120, y: 90, width: 420, height: 320 } }));
    await fixture.manager.open(first.id);
    await fixture.manager.open(second.id);
    const normal = second.record.bounds;

    fixture.manager.zoom(second.id);
    expect(second.record.bounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(second.geometryState).toEqual({ normalBounds: normal, zoomed: true, minimisedFrom: null });
    fixture.manager.minimise(second.id);
    expect(second.record.state).toBe("minimised");
    expect(first.record.isKey).toBe(true);
    expect(second.geometryState.minimisedFrom).toBe("zoomed");
    fixture.manager.restore(second.id);
    expect(second.record.bounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    fixture.manager.zoom(second.id);
    expect(second.record.bounds).toBe(normal);
    expect(second.geometryState).toEqual({ normalBounds: normal, zoomed: false, minimisedFrom: null });
  });

  it("never mutates desktop normal bounds for compact presentation", async () => {
    const frames = createControlledFrameEnvironment({ width: 600, height: 800, compact: true });
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    const controller = fixture.manager.create(standardWindow("compact"));
    await fixture.manager.open(controller.id);
    const before = controller.record.bounds;

    fixture.manager.setBounds(controller.id, { x: 0, y: 0, width: 600, height: 800 }, "programmatic");
    fixture.manager.zoom(controller.id);
    expect(controller.record.bounds).toBe(before);
    expect(controller.geometryState.normalBounds).toBe(before);
  });
});
