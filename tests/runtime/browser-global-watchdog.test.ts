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

import { describe, expect, it } from "vitest";
import { createBrowserGlobalWatchdog } from "../../src/SynCloudOS/PlatformAdapters/BrowserGlobalWatchdog";
import { createTestRuntime } from "./helpers";

describe("browser global watchdog adapter", () => {
  it("captures browser failures in its supplied runtime and tears down its listeners", () => {
    const runtime = createTestRuntime();
    const other = createTestRuntime();
    const listeners = new Map<string, EventListener>();
    const target = {
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners.set(type, listener as EventListener);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
    } as unknown as Window;
    const watchdog = createBrowserGlobalWatchdog(runtime, target, () => 42);

    expect(watchdog.install()).toMatchObject({ installed: true, installedAt: 42 });
    listeners.get("error")?.({
      error: new Error("isolated global failure"),
      message: "isolated global failure",
      target,
    } as unknown as ErrorEvent);
    expect(runtime.store.getSnapshot().errors.at(-1)).toMatchObject({
      code: "GLOBAL_SCRIPT_ERROR",
      exception: "Error",
      message: "isolated global failure",
    });
    expect(other.store.getSnapshot().errors).toEqual([]);

    watchdog.uninstall();
    expect(listeners.size).toBe(0);
  });
});
