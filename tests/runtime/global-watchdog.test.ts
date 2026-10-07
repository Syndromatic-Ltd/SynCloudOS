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
import { createTestRuntime, createRuntimeHarness, createTestRuntimeEnvironment } from "./helpers";

function listenerFor(environment: ReturnType<typeof createTestRuntimeEnvironment>, type: string) {
  const calls = vi.mocked(environment.addWindowListener).mock.calls;
  const call = calls.find(([eventType]) => eventType === type);
  if (!call) throw new Error(`Missing ${type} listener.`);
  return call[1] as EventListener;
}

describe("SynCloudOSGlobalWatchdog", () => {
  it("installs and uninstalls idempotently", async () => {
    const environment = createTestRuntimeEnvironment();
    const { SynCloudOS } = createRuntimeHarness(createTestRuntime({ environment }));

    SynCloudOS.GlobalWatchdog.install();
    SynCloudOS.GlobalWatchdog.install();

    expect(SynCloudOS.GlobalWatchdog.isInstalled()).toBe(true);
    expect(vi.mocked(environment.addWindowListener).mock.calls.filter(([type]) => type === "error")).toHaveLength(1);
    expect(vi.mocked(environment.addWindowListener).mock.calls.filter(([type]) => type === "unhandledrejection")).toHaveLength(1);
    expect(environment.activeListenerCount()).toBe(2);

    SynCloudOS.GlobalWatchdog.uninstall();
    expect(SynCloudOS.GlobalWatchdog.isInstalled()).toBe(false);
    expect(environment.activeListenerCount()).toBe(0);
  });

  it("captures window script errors", async () => {
    const environment = createTestRuntimeEnvironment();
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime({ environment }));
    SynCloudOS.GlobalWatchdog.install();

    listenerFor(environment, "error")({
      colno: 8,
      error: new Error("global render drift"),
      filename: "main.tsx",
      lineno: 42,
      message: "global render drift",
      target: window,
      type: "error"
    } as unknown as ErrorEvent);

    expect(RuntimeController.getSnapshot().errors.at(-1)).toMatchObject({
      code: "GLOBAL_SCRIPT_ERROR",
      source: "SynCloudOS.GlobalWatchdog.error"
    });
    expect(SynCloudOS.GlobalWatchdog.getStatus().capturedGlobalErrors).toBe(1);
  });

  it("captures unhandled promise rejections", async () => {
    const environment = createTestRuntimeEnvironment();
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime({ environment }));
    SynCloudOS.GlobalWatchdog.install();

    listenerFor(environment, "unhandledrejection")({
      reason: new Error("lost async work")
    } as PromiseRejectionEvent);

    expect(RuntimeController.getSnapshot().errors.at(-1)).toMatchObject({
      code: "UNHANDLED_PROMISE_REJECTION",
      source: "SynCloudOS.GlobalWatchdog.unhandledrejection"
    });
    expect(SynCloudOS.GlobalWatchdog.getStatus().capturedPromiseRejections).toBe(1);
  });

  it("captures resource load failures from capture-phase error events", async () => {
    const environment = createTestRuntimeEnvironment();
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime({ environment }));
    SynCloudOS.GlobalWatchdog.install();

    listenerFor(environment, "error")({
      target: {
        currentSrc: "/assets/missing.png",
        tagName: "IMG"
      },
      type: "error"
    } as unknown as Event);

    expect(RuntimeController.getSnapshot().errors.at(-1)).toMatchObject({
      code: "ASSET_LOAD_FAILED",
      source: "SynCloudOS.GlobalWatchdog.resource"
    });
    expect(SynCloudOS.GlobalWatchdog.getStatus().capturedResourceErrors).toBe(1);
  });
});
