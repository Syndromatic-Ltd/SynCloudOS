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

import React from "react";
import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import type { RuntimeDisposalRegistration } from "../../src/SynCloudOS/Runtime/disposalTypes";
import { createSynCloudOSHostContribution } from "../../src/SynCloudOS/HostContributions/hostContribution";
import { mountSynCloudOS, type MountedSynCloudOSHost } from "../../src/SynCloudOSReact/browserRuntime";
import { defineWebspring } from "../../src/Webspring/public";

vi.mock("../../src/SynCloudOS/Runtime/createSynCloudOS", { spy: true });
// Exercise the real React root, browser environment and runtime lifetime while
// keeping this transaction test independent of product rendering and artwork.
vi.mock("../../src/App", () => ({ App: () => <div data-testid="mounted-browser-host">Mounted host</div> }));

const shell = defineWebspring({
  manifest: {
    schemaVersion: 1,
    bundleIdentifier: "com.example.lifetime-shell",
    version: "1.0.0",
    displayName: "Lifetime shell",
    webspringShell: {
      views: [{ id: "site", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
      defaults: { desktop: "site", tablet: "site", mobile: "site" },
      homeRoute: "/",
      branding: { name: { key: "site.name", fallback: "Lifetime shell" } },
    },
  },
  components: { site: () => null },
});

const registrations: RuntimeDisposalRegistration[] = [];
const mounts: Array<{ host: MountedSynCloudOSHost; runtime: SynCloudOSRuntime; element: HTMLElement }> = [];

async function mount(contributions: Parameters<typeof mountSynCloudOS>[0]["contributions"] = []) {
  const element = document.createElement("div");
  document.body.append(element);
  let host!: MountedSynCloudOSHost;
  await act(async () => { host = await mountSynCloudOS({ element, shell, contributions }); });
  const result = vi.mocked(createSynCloudOS).mock.results.at(-1);
  if (result?.type !== "return") throw new Error("The browser host did not construct its runtime.");
  const runtime = result.value;
  const mounted = { host, runtime, element };
  mounts.push(mounted);
  expect(element.querySelector('[data-testid="mounted-browser-host"]')).not.toBeNull();
  return mounted;
}

afterEach(async () => {
  for (const registration of registrations.splice(0)) registration.unregister();
  for (const { host, runtime, element } of mounts.splice(0)) {
    await act(async () => {
      await host.dispose("test-cleanup");
      await runtime.dispose({ reason: "test-cleanup", inFlight: "cancel" });
    });
    element.remove();
  }
  vi.clearAllMocks();
});

describe("browser host disposal transaction", () => {
  it("keeps the root and installed capabilities live after cancellation and permits retry", async () => {
    const cleanup = vi.fn();
    let installationSignal!: AbortSignal;
    const contribution = createSynCloudOSHostContribution("lifetime", "tests/browser-lifetime", () => ({
      install(context) {
        installationSignal = context.signal;
        context.services.registerDescriptor({ id: "lifetime.service", displayName: "Lifetime", availability: "available" });
        return cleanup;
      },
    }));
    const { host, runtime, element } = await mount([contribution]);
    const registration = runtime.registerDisposalParticipant({
      id: "test:user-cancel",
      prepare: () => ({ status: "cancelled", reason: "Keep editing" }),
    });
    registrations.push(registration);

    let first!: Awaited<ReturnType<MountedSynCloudOSHost["dispose"]>>;
    await act(async () => { first = await host.dispose("close"); });
    expect(first.status).toBe("cancelled");
    expect(runtime.disposalState).toBe("running");
    expect(runtime.signal.aborted).toBe(false);
    expect(installationSignal.aborted).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();
    expect(runtime.services.getService("lifetime.service")).not.toBeNull();
    expect(element.querySelector('[data-testid="mounted-browser-host"]')).not.toBeNull();

    registration.unregister();
    await act(async () => {
      const retry = host.dispose("confirmed-close");
      expect(host.dispose("duplicate-close")).toBe(retry);
      expect((await retry).status).toBe("disposed");
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(installationSignal.aborted).toBe(true);
    expect(element.childElementCount).toBe(0);
  });

  it("retains the host throughout asynchronous preparation and cleans it when the runtime commits directly", async () => {
    const cleanup = vi.fn();
    const contribution = createSynCloudOSHostContribution("direct", "tests/browser-direct", () => ({ install: () => cleanup }));
    const { host, runtime, element } = await mount([contribution]);
    const preparation = Promise.withResolvers<{ status: "ready"; commit: () => void }>();
    const preparing = Promise.withResolvers<void>();
    runtime.registerDisposalParticipant({
      id: "test:async-preparation",
      prepare() { preparing.resolve(); return preparation.promise; },
    });
    const disposal = runtime.dispose("direct-runtime-close");
    await preparing.promise;
    expect(element.childElementCount).toBeGreaterThan(0);
    expect(cleanup).not.toHaveBeenCalled();
    preparation.resolve({ status: "ready", commit: () => undefined });
    await act(async () => { expect((await disposal).status).toBe("disposed"); });
    expect(element.childElementCount).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
    await act(async () => { expect((await host.dispose()).status).toBe("disposed"); });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("awaits reverse-order async cleanup and reports cleanup errors without skipping later owners", async () => {
    const events: string[] = [];
    const first = createSynCloudOSHostContribution("first", "tests/browser-first", () => ({
      install: () => () => { events.push("first"); },
    }));
    const second = createSynCloudOSHostContribution("second", "tests/browser-second", () => ({
      install: () => async () => {
        events.push("second:start");
        await Promise.resolve();
        events.push("second:end");
        throw new Error("Second cleanup failed");
      },
    }));
    const { host, runtime, element } = await mount([first, second]);
    await act(async () => {
      const result = await host.dispose();
      expect(result.status).toBe("disposed");
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ phase: "commit", participantId: "browser-host", message: expect.stringContaining("Second cleanup failed") }),
      ]));
    });
    expect(events).toEqual(["second:start", "second:end", "first"]);
    expect(runtime.disposalState).toBe("disposed");
    expect(element.childElementCount).toBe(0);
  });
});
