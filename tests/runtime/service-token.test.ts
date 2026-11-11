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
import {
  SynWareServiceAcquisitionError,
  createSynWare,
  createSynWareBundle,
  defineSynWareServiceToken,
} from "../../src/SynCloudOS/AppSDK";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createTestRuntime, mountTestSynWareRuntime } from "./helpers";

interface SearchClient {
  search(query: string): string;
}

const searchToken = defineSynWareServiceToken<SearchClient>({
  id: "com.syndromatic.search",
  minimumVersion: "2.0.0",
  contractVersion: "search.v1",
});

function createMountedServiceFixture(options: {
  readonly declared?: boolean;
  readonly providerVersion?: string;
  readonly contractVersion?: string;
} = {}) {
  const runtime = createTestRuntime({ id: `runtime:service-token:${Math.random()}` });
  const definition = createSynWare({
    manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.example.service-token-app",
      version: "1.0.0",
      displayName: "Service token app",
      services: options.declared === false ? [] : [{
        id: searchToken.id,
        required: true,
        minimumVersion: "1.5.0",
      }],
    },
    root: () => null,
  });
  const app = runtime.apps.register(createSynWareBundle(definition));
  if (!app) throw new Error("Service-token test app did not register.");
  runtime.services.register({
    id: searchToken.id,
    version: options.providerVersion ?? "2.1.0",
    contractVersion: options.contractVersion ?? "search.v1",
    createAppClient: () => Object.freeze<SearchClient>({ search: (query) => `result:${query}` }),
  });
  const mounted = mountTestSynWareRuntime(runtime, app.bundleIdentifier);
  const context = createSynWareContextValue(mounted.runtime);
  return { runtime, mounted, context, services: context.services };
}

describe("typed SynWare service tokens", () => {
  it("has no retired string lookup or raw route state on a real mounted context", async () => {
    const fixture = createMountedServiceFixture();
    try {
      expect(fixture.services).not.toHaveProperty("resolve");
      expect(fixture.mounted.runtime.services).not.toHaveProperty("resolve");
      expect(fixture.context).not.toHaveProperty("routeState");
      const legacy = fixture.services as unknown as { resolve?: (id: string) => unknown };
      expect(legacy.resolve).toBeUndefined();
      expect(fixture.services.optional(searchToken.id as unknown as typeof searchToken).available).toBe(false);
      expect(() => fixture.services.require(searchToken.id as unknown as typeof searchToken)).toThrow();
      const legacyListener = vi.fn();
      const tokenListener = vi.fn();
      const unsubscribeLegacy = fixture.services.subscribe(searchToken.id as unknown as typeof searchToken, legacyListener);
      const unsubscribeToken = fixture.services.subscribe(searchToken, tokenListener);
      fixture.runtime.events.publish("service.available", { serviceId: searchToken.id });
      expect(legacyListener).not.toHaveBeenCalled();
      expect(tokenListener).toHaveBeenCalledOnce();
      unsubscribeLegacy();
      unsubscribeToken();
      expect(fixture.services.require(searchToken).search("kept")).toBe("result:kept");
    } finally {
      fixture.mounted.dispose();
      await fixture.runtime.dispose();
    }
  });

  it("infers the client while preserving manifest and token minimum-version checks", async () => {
    const fixture = createMountedServiceFixture();
    expect(fixture.services.optional(searchToken)).toMatchObject({ available: true, denial: null });
    expect(fixture.services.require(searchToken).search("justice")).toBe("result:justice");
    fixture.mounted.dispose();
    await fixture.runtime.dispose("service token test cleanup");

    const tooOld = createMountedServiceFixture({ providerVersion: "1.9.9" });
    expect(tooOld.services.optional(searchToken)).toMatchObject({ available: false, client: null });
    tooOld.mounted.dispose();
    await tooOld.runtime.dispose("service token test cleanup");
  });

  it("rejects undeclared, fabricated and contract-mismatched tokens", async () => {
    const undeclared = createMountedServiceFixture({ declared: false });
    expect(undeclared.services.optional(searchToken)).toMatchObject({ available: false, client: null });
    expect(() => undeclared.services.require(searchToken)).toThrowError(SynWareServiceAcquisitionError);
    undeclared.mounted.dispose();
    await undeclared.runtime.dispose("service token test cleanup");

    const fabricatedFixture = createMountedServiceFixture();
    const fabricated = Object.freeze({
      id: searchToken.id,
      minimumVersion: searchToken.minimumVersion,
      contractVersion: searchToken.contractVersion,
    }) as typeof searchToken;
    expect(fabricatedFixture.services.optional(fabricated)).toMatchObject({ available: false, client: null });
    expect(fabricatedFixture.services.optional(fabricated).denial?.message).toMatch(/token/i);
    fabricatedFixture.mounted.dispose();
    await fabricatedFixture.runtime.dispose("service token test cleanup");

    const contractMismatch = createMountedServiceFixture({ contractVersion: "search.v2" });
    expect(contractMismatch.services.optional(searchToken)).toMatchObject({ available: false, client: null });
    expect(contractMismatch.services.optional(searchToken).denial?.message).toMatch(/contract/i);
    contractMismatch.mounted.dispose();
    await contractMismatch.runtime.dispose("service token test cleanup");
  });
});
