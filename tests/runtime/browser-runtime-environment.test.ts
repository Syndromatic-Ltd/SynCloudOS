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
import { createBrowserRuntimeEnvironment } from "../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";

describe("BrowserRuntimeEnvironment snapshot sources", () => {
  it("returns referentially stable browser snapshots until its injected event source publishes a change", () => {
    const environment = createBrowserRuntimeEnvironment();

    const initialLayout = environment.layoutViewport.getSnapshot();
    const initialScreen = environment.screen.getSnapshot();
    const initialWorkArea = environment.workArea.getSnapshot();
    expect(initialWorkArea.safeAreaAvailability).toBe("unavailable");
    expect(initialWorkArea.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(environment.layoutViewport.getSnapshot()).toBe(initialLayout);
    expect(environment.screen.getSnapshot()).toBe(initialScreen);
    expect(environment.workArea.getSnapshot()).toBe(initialWorkArea);

    const notified = vi.fn();
    const unsubscribe = environment.layoutViewport.subscribe(notified);
    // Installing a subscription must not turn an otherwise unchanged browser
    // read into a new external-store value.
    expect(environment.layoutViewport.getSnapshot()).toBe(initialLayout);

    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth + 1 });
    try {
      window.dispatchEvent(new Event("resize"));

      expect(notified).toHaveBeenCalledTimes(1);
      expect(environment.layoutViewport.getSnapshot()).not.toBe(initialLayout);
      expect(environment.layoutViewport.getSnapshot()).toBe(environment.layoutViewport.getSnapshot());
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
      unsubscribe();
    }
  });

  it("places windows in the page, wherever the browser sits on the desktop", () => {
    // A browser on a second monitor reports that monitor's desktop origin;
    // windows are laid out in the page, so the work area must not inherit it.
    const restore = [
      ["availLeft", 1920], ["availTop", 40], ["availWidth", 1755], ["availHeight", 1057],
    ].map(([key, value]) => {
      const previous = Object.getOwnPropertyDescriptor(window.screen, key);
      Object.defineProperty(window.screen, key, { configurable: true, value });
      return () => previous ? Object.defineProperty(window.screen, key, previous) : delete (window.screen as unknown as Record<string, unknown>)[key as string];
    });
    const previousWidth = window.innerWidth;
    const previousHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1755 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 940 });
    try {
      const environment = createBrowserRuntimeEnvironment();
      expect(environment.workArea.getSnapshot()).toMatchObject({ x: 0, y: 0, width: 1755, height: 940 });

      const notified = vi.fn();
      const unsubscribe = environment.workArea.subscribe(notified);
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
      window.dispatchEvent(new Event("resize"));
      expect(notified).toHaveBeenCalledTimes(1);
      expect(environment.workArea.getSnapshot()).toMatchObject({ x: 0, y: 0, width: 1200, height: 940 });
      unsubscribe();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: previousHeight });
      restore.forEach((undo) => undo());
    }
  });
});
