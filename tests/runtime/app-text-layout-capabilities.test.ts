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

import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import type { TFXTextGeometryCapabilities } from "../../src/FX/TextFX/textLayoutTypes";
import type { AppTextLayoutClient } from "../../src/SynCloudOS/AppSDK/appEnvironmentClientTypes";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createSynWareNSETextLayoutPort } from "../../src/SynCloudOS/AppSDK/SynWareNSEMediaAdapters";
import { createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function fixture() {
  const runtime = createTestRuntime({ environment: createTestRuntimeEnvironment() });
  cleanups.push(async () => { await runtime.dispose("capability forwarding test"); });
  registerTestSynWare(runtime, { schemaVersion: 1, id: "geometry-owner", version: "1.0.0", title: "Geometry owner", routes: [{ path: "/geometry-owner", primary: true }] });
  const mounted = mountTestSynWareRuntime(runtime, "geometry-owner");
  cleanups.push(() => mounted.dispose("capability forwarding test"));
  const client = createSynWareContextValue(mounted.runtime).textLayout;
  return { runtime, mounted, client };
}

describe("mounted text geometry capability forwarding", () => {
  it("declares the actual runtime capability on the internal mounted port", () => {
    const { runtime, mounted } = fixture();
    expect(mounted.runtime.textLayout.geometryCapabilities).toEqual(runtime.textLayout.geometryCapabilities);
    expect(mounted.runtime.textLayout.geometryCapabilities).toEqual({ kind: "logical-dom", units: "css-pixels", exclusions: false, shapedCarets: false });
    expect(Object.isFrozen(mounted.runtime.textLayout.geometryCapabilities)).toBe(true);
    expectTypeOf(mounted.runtime.textLayout.geometryCapabilities).toEqualTypeOf<TFXTextGeometryCapabilities | undefined>();
  });

  it("exposes typed readonly truthful capabilities to the public application client", () => {
    const { runtime, client } = fixture();
    expect(client.geometryCapabilities).toEqual(runtime.textLayout.geometryCapabilities);
    expect(client.geometryCapabilities?.kind).toBe("logical-dom");
    expect(client.geometryCapabilities?.shapedCarets).toBe(false);
    expect(Object.isFrozen(client.geometryCapabilities)).toBe(true);
    expect(Reflect.set(client.geometryCapabilities!, "exclusions", true)).toBe(false);
    expect(runtime.textLayout.geometryCapabilities?.exclusions).toBe(false);
    expectTypeOf(client.geometryCapabilities).toEqualTypeOf<TFXTextGeometryCapabilities | undefined>();
    if (false) {
      // @ts-expect-error Capability metadata is readonly at the public client boundary.
      client.geometryCapabilities = undefined;
      // @ts-expect-error Individual capability facts are readonly too.
      client.geometryCapabilities!.shapedCarets = true;
    }
  });

  it("preserves the declared logical geometry through the NSE text layout adapter", () => {
    const { runtime, client } = fixture();
    const port = createSynWareNSETextLayoutPort(client);
    expect(port.geometryCapabilities).toEqual(runtime.textLayout.geometryCapabilities);
    expect(port.geometryCapabilities).toEqual({ kind: "logical-dom", units: "css-pixels", exclusions: false, shapedCarets: false });
    expect(Object.isFrozen(port)).toBe(true);
    expect(Object.isFrozen(port.geometryCapabilities)).toBe(true);
    expectTypeOf(port.geometryCapabilities).toEqualTypeOf<TFXTextGeometryCapabilities | undefined>();
  });

  it("leaves an undeclared client capability unknown without guessing from available layout methods", () => {
    const { client } = fixture();
    const unknown: AppTextLayoutClient = { ...client, geometryCapabilities: undefined };
    expect(createSynWareNSETextLayoutPort(unknown).geometryCapabilities).toBeUndefined();
  });

  it("forwards an explicitly declared client capability rather than hard-coding a backend kind", () => {
    const { client } = fixture();
    const declared = Object.freeze({ kind: "shaped", units: "points", exclusions: true, shapedCarets: true } as const);
    // This injects metadata only; it is not a claim that the runtime logical service shapes text.
    const explicit: AppTextLayoutClient = { ...client, geometryCapabilities: declared };
    expect(createSynWareNSETextLayoutPort(explicit).geometryCapabilities).toEqual(declared);
  });
});
