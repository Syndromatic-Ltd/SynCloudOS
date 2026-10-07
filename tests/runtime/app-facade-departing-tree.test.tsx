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

import { act, cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTestRuntime,
  createTestRuntimeEnvironment,
  mountTestSynWareRuntime,
  registerTestSynWare,
} from "./helpers";
import { getMountedAppEnvironmentClients } from "../../src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry";
import type { MountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { useNSEDeferredDisposal } from "../../src/NSE/interactionLifecycle";

interface DepartingFacade {
  readonly windows: {
    getSnapshot(): unknown;
    subscribe(listener: () => void): () => void;
  };
  readonly locale: {
    subscribe(listener: () => void): () => void;
  };
  readonly application: {
    subscribe(listener: (event: unknown) => void): () => void;
  };
  readonly textLayout: {
    readonly fontReadinessGeneration: number;
    readonly attachmentReadinessGeneration: number;
  };
}

const activeRuntimes: SynCloudOSRuntime[] = [];
const activeMounts: MountedSynWareRuntime[] = [];

afterEach(async () => {
  cleanup();
  for (const mounted of activeMounts.splice(0)) mounted.dispose("test complete");
  for (const runtime of activeRuntimes.splice(0)) await runtime.dispose("test complete");
});

describe("AppSDK facade departing-tree read safety", () => {
  it("serves last-issued snapshots and inert subscriptions after mount revocation", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createTestRuntime({ id: "runtime:facade-departing-tree", environment });
    activeRuntimes.push(runtime);
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      id: "window-owner",
      version: "1.0.0",
      title: "Window Owner",
      routes: [{ path: "/window-owner", primary: true }],
      windowDefaults: { title: "Window Owner", width: 480, height: 360 },
    });
    const mounted = mountTestSynWareRuntime(runtime, "window-owner");
    activeMounts.push(mounted);

    const facade = mounted.runtime as unknown as DepartingFacade;
    const liveSnapshot = facade.windows.getSnapshot();
    const runtimeFontReadinessGeneration = facade.textLayout.fontReadinessGeneration;
    const runtimeAttachmentReadinessGeneration = facade.textLayout.attachmentReadinessGeneration;
    const clients = getMountedAppEnvironmentClients(mounted.runtime);
    const workAreaSnapshot = clients.workArea.getSnapshot();
    const fontReadinessGeneration = clients.textLayout.fontReadinessGeneration;
    const attachmentReadinessGeneration = clients.textLayout.attachmentReadinessGeneration;
    expect(liveSnapshot).toBeTruthy();

    mounted.dispose("generation replacement");

    // The departing tree reads its last-issued snapshot instead of throwing
    // from useSyncExternalStore during a mount-generation transition.
    expect(facade.windows.getSnapshot()).toBe(liveSnapshot);
    expect(typeof facade.windows.subscribe(() => {})).toBe("function");
    expect(typeof facade.locale.subscribe(() => {})).toBe("function");
    expect(typeof facade.application.subscribe(() => {})).toBe("function");
    expect(clients.workArea.getSnapshot()).toBe(workAreaSnapshot);
    expect(typeof clients.workArea.subscribe(() => {})).toBe("function");
    expect(facade.textLayout.fontReadinessGeneration).toBe(runtimeFontReadinessGeneration);
    expect(facade.textLayout.attachmentReadinessGeneration).toBe(runtimeAttachmentReadinessGeneration);
    expect(clients.textLayout.fontReadinessGeneration).toBe(fontReadinessGeneration);
    expect(clients.textLayout.attachmentReadinessGeneration).toBe(attachmentReadinessGeneration);
  });

  it("revokes fresh preference and media reads after mount revocation", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createTestRuntime({ id: "runtime:facade-ambient-revoked", environment });
    activeRuntimes.push(runtime);
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      id: "window-owner",
      version: "1.0.0",
      title: "Window Owner",
      routes: [{ path: "/window-owner", primary: true }],
      windowDefaults: { title: "Window Owner", width: 480, height: 360 },
    });
    const mounted = mountTestSynWareRuntime(runtime, "window-owner");
    activeMounts.push(mounted);

    const clients = getMountedAppEnvironmentClients(mounted.runtime);
    mounted.dispose("generation replacement");

    // A revoked mount must not keep reading fresh persistence or live
    // environment state; assertLive fires before any platform access.
    expect(() => clients.persistence.getPreference("theme", "light")).toThrow(/revoked/i);
    expect(() => clients.mediaQueries.getSnapshot("(min-width: 100px)")).toThrow(/revoked/i);
  });

  it("disposes once after unmount with the actual revoked mounted scheduler", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createTestRuntime({ id: "runtime:facade-revoked-disposal", environment });
    activeRuntimes.push(runtime);
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      id: "window-owner",
      version: "1.0.0",
      title: "Window Owner",
      routes: [{ path: "/window-owner", primary: true }],
      windowDefaults: { title: "Window Owner", width: 480, height: 360 },
    });
    const mounted = mountTestSynWareRuntime(runtime, "window-owner");
    activeMounts.push(mounted);
    const scheduler = getMountedAppEnvironmentClients(mounted.runtime).scheduler;
    let disposals = 0;
    const resource = { dispose: () => { disposals += 1; } };
    function Harness() {
      useNSEDeferredDisposal(resource, scheduler);
      return null;
    }

    const view = render(<React.StrictMode><Harness /></React.StrictMode>);
    await act(async () => { await Promise.resolve(); });
    expect(disposals).toBe(0);

    mounted.dispose("generation replacement");
    view.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(disposals).toBe(1);
  });

  it("keeps live reads and subscriptions throwing nothing while the mount is alive", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createTestRuntime({ id: "runtime:facade-live-tree", environment });
    activeRuntimes.push(runtime);
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      id: "window-owner",
      version: "1.0.0",
      title: "Window Owner",
      routes: [{ path: "/window-owner", primary: true }],
      windowDefaults: { title: "Window Owner", width: 480, height: 360 },
    });
    const mounted = mountTestSynWareRuntime(runtime, "window-owner");
    activeMounts.push(mounted);

    const facade = mounted.runtime as unknown as DepartingFacade;
    expect(() => facade.windows.getSnapshot()).not.toThrow();
    const unsubscribe = facade.windows.subscribe(() => {});
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });
});
