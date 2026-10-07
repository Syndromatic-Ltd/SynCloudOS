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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { validateSynWareManifest } from "../../src/SynCloudOS/AppSDK/manifest";
import { webspringPresentationRoles } from "../../src/SynCloudOS/SynCloudOS";
import { createRuntimeHarness, createTestBundle, createTestRuntime, flushMultiSwitchLaunch, unlockRuntime } from "./helpers";

afterEach(() => vi.useRealTimers());

describe("explicit frame presentation ownership", () => {
  it("captures and projects content motion without retaining mutable author data", () => {
    const manifest = { schemaVersion: 1, id: "owned-motion", version: "1.0.0", title: "Owned Motion", frame: { presentationMotion: "content" } };
    const definition = createSynWare({ manifest, root: () => null } as never);
    manifest.frame.presentationMotion = "host";
    const runtime = createTestRuntime();
    const app = runtime.apps.registerBundle(createSynWareBundle(definition))!;
    expect(definition.manifest.frame).toMatchObject({ presentationMotion: "content" });
    expect(app.frame).toMatchObject({ presentationMotion: "content" });
    expect(Object.isFrozen(definition.manifest.frame)).toBe(true);
  });

  it("defaults to host motion even when the app has no top bar", () => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle({ id: "plain", frame: { topBar: "none" } as never }));
    expect(runtime.apps.getApp("plain")!.frame).toMatchObject({ topBar: "none", presentationMotion: "host" });
  });

  it.each(["none", true, 1])("rejects invalid SDK motion policy %s", (presentationMotion) => {
    expect(validateSynWareManifest({ schemaVersion: 1, id: "bad-policy", version: "1.0.0", title: "Bad", frame: { presentationMotion } }).ok).toBe(false);
  });

  it.each(["host", "content"] as const)("keeps canonical launch and return with %s motion", async (presentationMotion) => {
    vi.useFakeTimers();
    const runtime = createTestRuntime({ presentationRolesForRoute: webspringPresentationRoles });
    const { LoginServices, Statechart, RouteManager } = createRuntimeHarness(runtime);
    runtime.apps.registerBundle(createTestBundle({ id: "curtain-app", route: "/curtain-app", frame: { presentationMotion } as never }));
    unlockRuntime(LoginServices);
    await Statechart.gotoState("active.webspring", { source: "test" });
    const phases: string[] = [];
    const unsubscribe = runtime.store.subscribe(() => phases.push(runtime.store.getSnapshot().webspring.launchPhase));
    const returns: unknown[] = [];
    const release = runtime.events.subscribe("webspring.return.begin", event => returns.push(event));
    const mounted = new AbortController();
    const releaseMount = runtime.routes.mountedRoutes.attach("curtain-app", { signal: mounted.signal, loadAndRender: async () => undefined });
    const launch = RouteManager.openRoute("/curtain-app", { syncRoute: false });
    await flushMultiSwitchLaunch();
    await launch.result;
    expect(runtime.lifecycle.getState("curtain-app")).toBe("active");
    expect(phases).toContain("staging");
    const stage = runtime.store.getSnapshot().webspring;
    expect(stage.launchPhase).toBe("staging");
    expect(stage.presentationSettlementId).toEqual(expect.any(String));
    expect(runtime.webspring.completeLaunchStage("obsolete-launch", "curtain-app")).toBe(false);
    expect(runtime.webspring.completeLaunchStage(stage.launchTransitionId!, "curtain-app")).toBe(true);
    expect(runtime.webspring.completeLaunchStage(stage.launchTransitionId!, "curtain-app")).toBe(false);
    expect(runtime.presentationSettlements.inspect(stage.presentationSettlementId!)).toMatchObject({
      status: "pending",
      completedRoles: presentationMotion === "content" ? ["webspring-shell-return"] : [],
    });
    if (presentationMotion === "content") {
      expect(runtime.store.getSnapshot().webspring.launchPhase).toBe("idle");
      expect(phases).not.toContain("launching");
      expect(runtime.store.getSnapshot().webspring.launchingAppId).toBeNull();
    } else {
      expect(runtime.store.getSnapshot().webspring.launchPhase).toBe("launching");
      expect(runtime.webspring.completeLaunchCover(stage.launchTransitionId!, "curtain-app")).toBe(true);
    }
    runtime.presentationSettlements.get(stage.presentationSettlementId!)!.completeRole("application-enter");
    expect(runtime.presentationSettlements.inspect(stage.presentationSettlementId!)).toEqual({ status: "settled" });
    const restore = RouteManager.openRoute("/", { source: "test:curtain-complete", syncRoute: false });
    await flushMultiSwitchLaunch();
    expect(await restore.result).toMatchObject({ status: "completed" });
    expect(runtime.lifecycle.getState("curtain-app")).toBe("suspended");
    expect(runtime.store.getSnapshot().application).toMatchObject({ activeAppId: null, routePath: "/" });
    expect(returns).toHaveLength(presentationMotion === "content" ? 0 : 1);
    if (presentationMotion === "content") expect(runtime.store.getSnapshot().webspring).toMatchObject({ launchPhase: "idle", returnTransitionId: null });
    if (presentationMotion === "content") {
      phases.length = 0;
      await vi.advanceTimersByTimeAsync(1500);
      expect(phases).not.toContain("returning");
      expect(phases).not.toContain("launching");
    }
    unsubscribe(); release(); releaseMount(); mounted.abort();
    await runtime.dispose("motion policy regression");
  });
});
