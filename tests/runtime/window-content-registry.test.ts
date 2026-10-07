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
import {
  DuplicateWindowContentFactoryError,
  WindowContentFactoryUnavailableError,
  WindowContentRegistry,
  type WindowContentController,
  type WindowContentDescriptor,
} from "../../src/SynCloudOS/Windows";

function contentController(mountKey = "mount:notes"): WindowContentController {
  return {
    mountKey,
    responderId: `${mountKey}:responder`,
    load: vi.fn(async () => undefined),
    prepareClose: vi.fn(async () => ({
      status: "ready" as const,
      token: "content-token",
      commit: vi.fn(),
      rollback: vi.fn(),
    })),
    unload: vi.fn(),
    dispose: vi.fn(),
  };
}

const descriptor: WindowContentDescriptor = {
  rendererId: "notes",
  parameters: { documentMode: "editor" },
};

describe("WindowContentRegistry", () => {
  it("rejects duplicate factories and lets an exact renderer override the application fallback", () => {
    const registry = new WindowContentRegistry();
    const renderer = vi.fn(() => contentController("mount:renderer"));
    const application = vi.fn(() => contentController("mount:application"));
    registry.register({ typeId: "notes", create: renderer });
    registry.register({ typeId: "application:com.syndromatic.Notes", create: application });

    expect(() => registry.register({ typeId: "notes", create: renderer })).toThrow(
      DuplicateWindowContentFactoryError,
    );
    expect(registry.createController(descriptor, "window-1").mountKey).toBe("mount:renderer");
    expect(registry.createController(descriptor, "window-2", "com.syndromatic.Notes").mountKey).toBe(
      "mount:renderer",
    );
    expect(renderer).toHaveBeenCalledWith({ descriptor, windowControllerId: "window-2" });
  });

  it("looks up restoration factories and registration disposal removes only its live factory", async () => {
    const registry = new WindowContentRegistry();
    const restore = vi.fn(async ({ descriptor: restoredDescriptor, state }) => ({
      descriptor: restoredDescriptor,
      state,
    }));
    const registration = registry.register({
      typeId: "notes",
      create: () => contentController(),
      restore,
    });
    const signal = new AbortController().signal;

    await expect(registry.restore(descriptor, { cursor: 4 }, signal)).resolves.toEqual({
      descriptor,
      state: { cursor: 4 },
    });
    expect(restore).toHaveBeenCalledWith({ descriptor, state: { cursor: 4 }, signal });
    registration.dispose();
    registration.dispose();
    expect(() => registry.createController(descriptor, "window-1")).toThrow(
      WindowContentFactoryUnavailableError,
    );
  });

  it("disposes every registration and rejects later use", () => {
    const registry = new WindowContentRegistry();
    const first = registry.register({ typeId: "first", create: () => contentController() });
    registry.register({ typeId: "second", create: () => contentController() });
    registry.dispose();
    first.dispose();

    expect(registry.size).toBe(0);
    expect(() => registry.register({ typeId: "third", create: () => contentController() })).toThrow(
      /disposed/i,
    );
    expect(() => registry.createController({ rendererId: "first", parameters: null }, "window-1")).toThrow(
      /disposed/i,
    );
    registry.dispose();
  });
});
