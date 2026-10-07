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
import { describe, expect, it, vi } from "vitest";
import { createAppearanceService, pickMode } from "../../src/SynCloudOS/Appearance/appearanceService";
import { createTestRuntimeEnvironment } from "./helpers";

describe("AppearanceService", () => {
  it("keeps explicit appearance state isolated between runtime-owned services", () => {
    const firstEnvironment = createTestRuntimeEnvironment();
    const secondEnvironment = createTestRuntimeEnvironment();
    const first = createAppearanceService({
      runtimeId: "runtime:appearance:first",
      persistence: { getPreference: <T,>(_key: string, fallback: T) => fallback, setPreference: vi.fn(() => true) },
      matchMedia: firstEnvironment.matchMedia,
    });
    const second = createAppearanceService({
      runtimeId: "runtime:appearance:second",
      persistence: { getPreference: <T,>(_key: string, fallback: T) => fallback, setPreference: vi.fn(() => true) },
      matchMedia: secondEnvironment.matchMedia,
    });

    first.set("dark");
    expect(first.resolved()).toBe("dark");
    expect(second.get()).toBe("auto");
    expect(second.resolved()).toBe("light");
  });

  it("notifies subscribers on change", () => {
    const environment = createTestRuntimeEnvironment();
    const service = createAppearanceService({
      runtimeId: "runtime:appearance:listener",
      persistence: { getPreference: <T,>(_key: string, fallback: T) => fallback, setPreference: vi.fn(() => true) },
      matchMedia: environment.matchMedia,
    });
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    service.set("dark");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("pickMode falls back and never returns undefined", () => {
    expect(pickMode({ light: "L" }, "dark")).toBe("L");
    expect(pickMode({ dark: "D" }, "light")).toBe("D");
    expect(pickMode({ light: "L", dark: "D" }, "dark")).toBe("D");
  });
});
