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
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";
import type { WindowHostEnvironment, WindowHostEvent } from "../../src/SynCloudOS/Windows/WindowHostEnvironment";

function hostFixture() {
  let listener: ((event: WindowHostEvent) => void) | undefined;
  const host: WindowHostEnvironment = {
    capabilities: { nativeWindowControls: null, menuBar: "drawn", fullScreen: "native", separateSurfaces: true },
    requestFullScreen: vi.fn(),
    subscribe(callback) {
      listener = callback;
      return () => { listener = undefined; };
    },
  };
  return { host, send: (event: WindowHostEvent) => listener?.(event) };
}

describe("window host full screen", () => {
  it("queues the latest intent and preserves normal geometry while the host confirms it", async () => {
    const { host, send } = hostFixture();
    const f = createWindowTestDependencies({ host });
    try {
      const window = f.manager.create(standardWindow("document", { collectionBehavior: "fullScreenPrimary" }));
      await f.manager.open(window.id);
      const originalGeometry = window.geometryState;

      f.manager.toggleFullScreen(window.id);
      expect(window.record.fullScreen).toBe("entering");
      expect(window.record.style).not.toContain("fullScreen");
      f.manager.toggleFullScreen(window.id);
      expect(host.requestFullScreen).toHaveBeenCalledTimes(1);
      send({ kind: "fullScreenChanged", windowId: window.id, state: "on" });
      expect(window.record.fullScreen).toBe("exiting");
      expect(host.requestFullScreen).toHaveBeenLastCalledWith(window.id, false);
      send({ kind: "fullScreenChanged", windowId: window.id, state: "off" });

      expect(window.record.fullScreen).toBe("off");
      expect(window.geometryState).toBe(originalGeometry);
    } finally {
      await f.cleanup();
    }
  });

  it("rolls back refusal, reflects unsolicited host changes, and ignores events after close", async () => {
    const { host, send } = hostFixture();
    const f = createWindowTestDependencies({ host });
    try {
      const window = f.manager.create(standardWindow("document", { collectionBehavior: "fullScreenPrimary" }));
      await f.manager.open(window.id);
      f.manager.toggleFullScreen(window.id);
      send({ kind: "fullScreenChanged", windowId: window.id, state: "refused" });
      expect(window.record.fullScreen).toBe("off");
      send({ kind: "fullScreenChanged", windowId: window.id, state: "on" });
      expect(window.record.style).toContain("fullScreen");
      f.manager.toggleFullScreen(window.id);
      expect(window.record.fullScreen).toBe("exiting");
      expect((await f.manager.requestClose(window.id, { reason: "control" })).outcome).toBe("closed");
      send({ kind: "fullScreenChanged", windowId: window.id, state: "on" });
      expect(window.record.fullScreen).toBe("off");
    } finally {
      await f.cleanup();
    }
  });
});
