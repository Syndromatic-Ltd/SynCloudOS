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
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { standardWindow } from "../fixtures/windowTestDependencies";
import { createTestRuntime, registerTestSynWare } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
const mounts: ReturnType<typeof createMountedSynWareRuntime>[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const mount of mounts.splice(0)) mount.dispose("App presentation client test cleanup");
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("App presentation client test cleanup")));
});

it("projects only a mounted window's content-bound, read-only presentation traits and tombstones it on abort", async () => {
  vi.useFakeTimers();
  const runtime = createTestRuntime({ id: "runtime:app-presentation-client" });
  runtimes.push(runtime);
  registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.presentation-client", version: "1.0.0", displayName: "Presentation client" });
  const app = runtime.apps.getApp("com.example.presentation-client");
  if (!app) throw new Error("The presentation fixture app did not register.");
  runtime.responders.register({
    id: `application:${app.bundleIdentifier}`,
    kind: "application",
    parentId: "workspace",
    scopeId: `application:${app.bundleIdentifier}`,
  });
  const window = runtime.windows.create(standardWindow("presentation-client-window", {
    applicationId: app.bundleIdentifier,
    applicationSessionId: `${app.bundleIdentifier}:window`,
    bounds: { x: 80, y: 60, width: 640, height: 520 },
  }));
  const mount = createMountedSynWareRuntime({
    runtime,
    app,
    responderId: `application:${app.bundleIdentifier}`,
    windowControllerId: window.id,
  });
  mounts.push(mount);
  const context = createSynWareContextValue(mount.runtime);
  const client = context.presentation;

  expect(Object.keys(client).sort()).toEqual(["getSnapshot", "subscribe"]);
  expect(Object.isFrozen(client)).toBe(true);
  expect((client as Record<string, unknown>).runtime).toBeUndefined();
  expect(client.getSnapshot()).toMatchObject({
    horizontalSizeClass: "compact",
    contentBounds: { width: 640, height: 520 },
    hostViewportBounds: { width: 1440, height: 900 },
  });
  expect(Object.isFrozen(client.getSnapshot())).toBe(true);
  expect(context.runtimeInfo).not.toHaveProperty("presentation");

  const observed: number[] = [];
  const unsubscribe = client.subscribe(() => observed.push(client.getSnapshot().revision));
  window.replaceRecord({ ...window.record, bounds: { x: 80, y: 60, width: 1320, height: 520 } });
  await vi.advanceTimersByTimeAsync(20);
  expect(client.getSnapshot()).toMatchObject({ horizontalSizeClass: "wide", contentBounds: { width: 1320 } });
  expect(observed).toHaveLength(1);

  const tombstone = client.getSnapshot();
  mount.dispose("Presentation client revoked");
  window.replaceRecord({ ...window.record, bounds: { x: 80, y: 60, width: 640, height: 520 } });
  await vi.advanceTimersByTimeAsync(20);
  expect(client.getSnapshot()).toBe(tombstone);
  expect(observed).toHaveLength(1);
  unsubscribe();
});
