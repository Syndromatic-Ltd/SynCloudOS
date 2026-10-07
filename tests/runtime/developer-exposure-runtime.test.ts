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
import { exposeSynCloudOS } from "../../src/SynCloudOS/Developer/exposeSynCloudOS";
import {
  clearDefaultSynCloudOSRuntime,
  getDefaultSynCloudOSRuntime,
  setDefaultSynCloudOSRuntime,
} from "../../src/SynCloudOS/Runtime/defaultRuntime";
import { createSynCloudOSFacade } from "../../src/SynCloudOS/SynCloudOS";
import { createTestRuntime } from "./helpers";

describe("developer runtime exposure", () => {
  afterEach(() => {
    window.SynCloudOS = undefined;
    clearDefaultSynCloudOSRuntime();
  });

  it("exposes the exact canonical facade without replacing its service graph", () => {
    const runtime = createTestRuntime();
    runtime.store.mutate((draft) => { draft.booted = true; });
    const facade = createSynCloudOSFacade(runtime) as Record<string, any>;
    const before = {
      AppManager: facade.AppManager,
      EventBus: facade.EventBus,
      GlobalWatchdog: facade.GlobalWatchdog,
      LaunchServices: facade.LaunchServices,
      RouteManager: facade.RouteManager,
      Runtime: facade.Runtime,
    };

    const exposure = exposeSynCloudOS(runtime, facade);
    expect(exposure).not.toBeNull();
    expect(facade).toBe(createSynCloudOSFacade(runtime));
    expect(facade.Runtime.getSnapshot().booted).toBe(true);
    expect(facade.AppManager).toBe(before.AppManager);
    expect(facade.EventBus).toBe(before.EventBus);
    expect(facade.GlobalWatchdog).toBe(before.GlobalWatchdog);
    expect(facade.LaunchServices).toBe(before.LaunchServices);
    expect(facade.RouteManager).toBe(before.RouteManager);
    expect(facade.Runtime).toBe(before.Runtime);
    expect(facade.Developer.getConformanceSnapshot).toBeTypeOf("function");
    expect(window.SynCloudOS).toBe(facade);

    exposure?.dispose();
    expect(facade).not.toHaveProperty("Developer");
  });

  it("rejects a partial test facade instead of bypassing production semantics", () => {
    const runtime = createTestRuntime();
    expect(() => exposeSynCloudOS(runtime, { Runtime: {} })).toThrow(/canonical runtime facade/i);
  });

  it("owns diagnostic-default exposure and clears it by runtime identity", () => {
    const runtime = createTestRuntime({ id: "runtime:developer-exposure" });
    const successor = createTestRuntime({ id: "runtime:developer-successor" });

    const exposure = exposeSynCloudOS(runtime, createSynCloudOSFacade(runtime));
    expect(getDefaultSynCloudOSRuntime()).toBe(runtime);

    clearDefaultSynCloudOSRuntime(runtime);
    setDefaultSynCloudOSRuntime(successor);
    exposure?.dispose();
    expect(getDefaultSynCloudOSRuntime()).toBe(successor);
  });
});
