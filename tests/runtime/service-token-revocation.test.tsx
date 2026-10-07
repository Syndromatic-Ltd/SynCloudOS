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
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SynWareProvider,
  defineSynWareServiceToken,
  useSynWareService,
  type AppServiceClient,
  type SynWareContextValue,
} from "../../src/SynCloudOS/AppSDK";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createSynCloudOSHostContribution } from "../../src/SynCloudOS/HostContributions/hostContribution";
import { createSettlementRegistry } from "../../src/SynCloudOS/Testing/SettlementRegistry";
import { createSynWareTesting } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTesting";
import {
  createTestRuntime,
  installTestHostContributions,
  mountTestSynWareRuntime,
  registerTestSynWare,
  unlockRuntime,
  type TestHostContributionsInstallation,
} from "./helpers";

interface CatalogueClient {
  readonly appId: string;
  read(): string;
  load(label: string): Promise<string>;
}

const catalogueToken = defineSynWareServiceToken<CatalogueClient>({
  id: "com.syndromatic.catalogue",
  minimumVersion: "2.0.0",
  contractVersion: "catalogue.v1",
});

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function serviceManifest(appId: string, minimumVersion = "1.0.0") {
  return {
    schemaVersion: 1,
    id: appId,
    version: "1.0.0",
    title: appId,
    services: [{ id: catalogueToken.id, required: true, minimumVersion }],
  } as const;
}

function createCatalogueContribution(providerVersion = "2.1.0") {
  const pending = new Map<string, ReturnType<typeof Promise.withResolvers<string>>>();
  const liveAbortListeners = new Map<string, number>();
  let clientCreations = 0;
  const contribution = createSynCloudOSHostContribution(
    "service-token-catalogue",
    "tests/service-token-catalogue",
    () => ({
      install(context) {
        context.services.registerDescriptor({
          id: catalogueToken.id,
          displayName: "Catalogue",
          description: "Typed service-token catalogue fixture.",
          availability: "available",
        });
        context.services.registerClient({
          id: catalogueToken.id,
          version: providerVersion,
          contractVersion: catalogueToken.contractVersion,
          createAppClient(serviceContext) {
            clientCreations += 1;
            const ensureLive = () => serviceContext.signal.throwIfAborted();
            return Object.freeze<CatalogueClient>({
              appId: serviceContext.appId,
              read() {
                ensureLive();
                return serviceContext.appId;
              },
              load(label) {
                ensureLive();
                const source = Promise.withResolvers<string>();
                pending.set(serviceContext.appId, source);
                liveAbortListeners.set(
                  serviceContext.appId,
                  (liveAbortListeners.get(serviceContext.appId) ?? 0) + 1,
                );
                return new Promise<string>((resolve, reject) => {
                  let listening = true;
                  const cleanup = () => {
                    if (!listening) return;
                    listening = false;
                    serviceContext.signal.removeEventListener("abort", onAbort);
                    liveAbortListeners.set(
                      serviceContext.appId,
                      Math.max(0, (liveAbortListeners.get(serviceContext.appId) ?? 1) - 1),
                    );
                  };
                  const onAbort = () => {
                    cleanup();
                    reject(serviceContext.signal.reason ?? new DOMException("Service client revoked.", "AbortError"));
                  };
                  serviceContext.signal.addEventListener("abort", onAbort, { once: true });
                  source.promise.then(
                    value => {
                      cleanup();
                      if (serviceContext.signal.aborted) {
                        reject(serviceContext.signal.reason ?? new DOMException("Service client revoked.", "AbortError"));
                        return;
                      }
                      resolve(`${serviceContext.appId}:${label}:${value}`);
                    },
                    error => {
                      cleanup();
                      reject(error);
                    },
                  );
                });
              },
            });
          },
        });
      },
    }),
  );
  return {
    contribution,
    clientCreations: () => clientCreations,
    resolve(appId: string, value: string) {
      const request = pending.get(appId);
      if (!request) throw new Error(`No pending catalogue request for ${appId}.`);
      request.resolve(value);
    },
    liveAbortListeners: (appId: string) => liveAbortListeners.get(appId) ?? 0,
  };
}

async function installCatalogueFixture(
  appIds: readonly string[],
  options: { readonly providerVersion?: string; readonly minimumVersion?: string } = {},
) {
  const runtime = createTestRuntime({ id: `runtime:service-token-revocation:${Math.random()}` });
  const apps = appIds.map(appId => registerTestSynWare(
    runtime,
    serviceManifest(appId, options.minimumVersion ?? "1.0.0"),
  ));
  const provider = createCatalogueContribution(options.providerVersion);
  const installation = await installTestHostContributions(runtime, [provider.contribution]);
  cleanups.push(async () => {
    await installation.cleanup();
    await runtime.dispose("service token revocation cleanup");
  });
  return { runtime, apps, provider, installation };
}

function testingDriver() {
  const registry = createSettlementRegistry({
    runtimeId: "runtime:service-token-revocation" as never,
    now: () => 0,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  const testing = createSynWareTesting({
    settlement: {
      getState: () => registry.getState(),
      subscribe: listener => registry.subscribe(listener),
      settled: options => registry.settled(options),
      begin: input => registry.begin(input),
      exclude: input => registry.exclude(input),
    },
    navigation: { openRoute: () => ({ result: Promise.resolve({ status: "completed" }) }) },
  }, { defaultTimeoutMs: 250 });
  cleanups.push(() => {
    testing.dispose();
    registry.dispose();
  });
  return { registry, testing };
}

describe("typed service revocation and installed-lifetime semantics", () => {
  it("publishes available -> denied -> available hook revisions and cleans its live subscription", async () => {
    const { runtime, apps } = await installCatalogueFixture(["service-hook-app"]);
    const mounted = mountTestSynWareRuntime(runtime, apps[0]!.id);
    cleanups.push(() => mounted.dispose());
    const base = createSynWareContextValue(mounted.runtime);
    let activeSubscriptions = 0;
    const services = Object.freeze({
      ...base.services,
      subscribe(service: Parameters<AppServiceClient["subscribe"]>[0], listener: () => void) {
        activeSubscriptions += 1;
        const unsubscribe = base.services.subscribe(service, listener);
        let live = true;
        return () => {
          if (!live) return;
          live = false;
          activeSubscriptions -= 1;
          unsubscribe();
        };
      },
    }) satisfies AppServiceClient;
    const value = Object.freeze({ ...base, services }) as SynWareContextValue;

    function Probe() {
      const service = useSynWareService(catalogueToken);
      return <output>{service.available ? "available" : service.denial?.code ?? "missing"}</output>;
    }

    const view = render(<SynWareProvider value={value}><Probe /></SynWareProvider>);
    cleanups.push(() => view.unmount());
    expect(screen.getByText("available")).toBeTruthy();
    expect(activeSubscriptions).toBe(1);

    act(() => {
      runtime.policy.registerPolicy("deny-token-service", (request, decision) =>
        request.action === "service.use"
          ? { ...decision, allowed: false, decision: "deny", reason: "Service denied by test policy." }
          : decision,
      );
    });
    await waitFor(() => expect(screen.getByText("denied")).toBeTruthy());

    act(() => { expect(runtime.policy.removePolicy("deny-token-service")).toBe(true); });
    await waitFor(() => expect(screen.getByText("available")).toBeTruthy());

    view.unmount();
    expect(activeSubscriptions).toBe(0);
  });

  it("isolates two app leases, aborts awaited work on unmount, and fences a late provider result", async () => {
    const { runtime, apps, provider } = await installCatalogueFixture(["service-app-a", "service-app-b"]);
    const first = mountTestSynWareRuntime(runtime, apps[0]!.id);
    const second = mountTestSynWareRuntime(runtime, apps[1]!.id);
    cleanups.push(() => first.dispose(), () => second.dispose());
    const firstClient = createSynWareContextValue(first.runtime).services.require(catalogueToken);
    const secondClient = createSynWareContextValue(second.runtime).services.require(catalogueToken);
    const { testing, registry } = testingDriver();

    expect(firstClient.read()).toBe("service-app-a");
    expect(secondClient.read()).toBe("service-app-b");
    expect(firstClient).not.toHaveProperty("register");
    expect(firstClient).not.toHaveProperty("unregister");

    const tracked = testing.track("catalogue load", firstClient.load("albums"));
    expect(registry.getState().pending).toEqual([
      expect.objectContaining({ owner: "app-waiter", label: "catalogue load" }),
    ]);
    expect(provider.liveAbortListeners("service-app-a")).toBe(1);

    first.dispose();
    await expect(tracked).rejects.toBeTruthy();
    expect(provider.liveAbortListeners("service-app-a")).toBe(0);
    await expect(testing.settled()).resolves.toMatchObject({ status: "settled", pending: [] });
    expect(registry.getState().recent.at(-1)).toMatchObject({ status: "failed", label: "catalogue load" });
    expect(() => firstClient.read()).toThrow();
    expect(secondClient.read()).toBe("service-app-b");

    provider.resolve("service-app-a", "late");
    await Promise.resolve();
    expect(registry.getState().pending).toHaveLength(0);
  });

  it("never lets a token weaken the manifest minimum version", async () => {
    const { runtime, apps } = await installCatalogueFixture(
      ["service-version-app"],
      { providerVersion: "2.5.0", minimumVersion: "3.0.0" },
    );
    const mounted = mountTestSynWareRuntime(runtime, apps[0]!.id);
    cleanups.push(() => mounted.dispose());
    const result = createSynWareContextValue(mounted.runtime).services.optional(catalogueToken);
    expect(result).toMatchObject({
      available: false,
      client: null,
      denial: expect.objectContaining({ code: "unavailable", message: expect.stringContaining("3.0.0") }),
    });
  });


});
