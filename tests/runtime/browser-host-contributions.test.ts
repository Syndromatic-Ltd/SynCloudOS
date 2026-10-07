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
import {
  composeSynCloudOSHostContributions,
  createSynCloudOSHostContribution,
  createSynCloudOSHostInstallContext,
  prepareSynCloudOSHostContributions,
} from "../../src/SynCloudOS/HostContributions/hostContribution";
import type { SynCloudOSRuntimeEnvironment } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { createTestBundle, createTestRuntime } from "./helpers";

const environment = {} as SynCloudOSRuntimeEnvironment;

describe("browser host contributions", () => {
  it("exposes Lumina privileged authority only through contribution-owned application scope", async () => {
    const publisher = createTestBundle({ id: "lumina-publisher" });
    const reader = createTestBundle({ id: "lumina-reader" });
    const foreign = createTestBundle({ id: "lumina-foreign" });
    const runtime = createTestRuntime({ initialBundles: [publisher, reader, foreign] });
    const contribution = createSynCloudOSHostContribution("lumina-owner", "tests/lumina-owner", () => ({
      initialBundles: [publisher, reader],
    }));
    const [prepared] = await prepareSynCloudOSHostContributions([contribution], runtime.environment);
    const handle = createSynCloudOSHostInstallContext(prepared!, runtime, {});
    try {
      expect((runtime as any).luminaHost).toBeDefined();
      expect((handle.context as any).lumina).toBeDefined();
      expect(() => (handle.context as any).lumina.registerDomain({
        ownerAppId: "lumina-foreign",
        domain: "journal.entry",
        destinationAppId: "lumina-reader",
        routeName: "journal.entry",
        resolve: () => ({ pathname: "/lumina-reader" }),
      })).toThrowError(expect.objectContaining({ name: "SecurityError" }));
      expect(() => (handle.context as any).lumina.registerDomain({
        ownerAppId: "lumina-publisher",
        domain: "journal.entry",
        destinationAppId: "lumina-foreign",
        routeName: "journal.entry",
        resolve: () => ({ pathname: "/lumina-foreign" }),
      })).toThrowError(expect.objectContaining({ name: "SecurityError" }));

      const unregister = (handle.context as any).lumina.registerDomain({
        ownerAppId: "lumina-publisher",
        domain: "journal.entry",
        destinationAppId: "lumina-reader",
        routeName: "journal.entry",
        resolve: ({ item }: any) => ({ pathname: `/lumina-reader?item=${encodeURIComponent(item.id)}` }),
      });
      expect(typeof unregister).toBe("function");
      expect((handle.context as any).lumina.setEligibility({
        ownerAppId: "lumina-publisher",
        domain: "journal.entry",
        itemId: "entry-one",
        revision: "r1",
        eligible: true,
      })).toBeGreaterThan(1);
      unregister();
    } finally {
      await handle.cleanup();
      await runtime.dispose("lumina host contribution authority test");
    }
  });

  it("reads absent seeds without exposing another contribution's documents", async () => {
    const ownBundle = createTestBundle({ id: "seed-owner" });
    const otherBundle = createTestBundle({ id: "other-owner" });
    const ownKind = { kind: "fixture.seed", version: 1, displayName: "Seed", permissions: { saveDraft: { public: true }, getDraft: { public: true } } };
    const runtime = createTestRuntime({ initialBundles: [ownBundle, otherBundle], trustedDocumentKinds: [ownKind] });
    const contributions = [ownBundle, otherBundle].map((bundle) => createSynCloudOSHostContribution(
      bundle.manifest.id, `tests/${bundle.manifest.id}`, () => ({ initialBundles: [bundle], trustedDocumentKinds: [ownKind] }),
    ));
    const prepared = await prepareSynCloudOSHostContributions(contributions, runtime.environment);
    const own = createSynCloudOSHostInstallContext(prepared[0]!, runtime, {});
    const other = createSynCloudOSHostInstallContext(prepared[1]!, runtime, {});
    try {
      await expect(own.context.seed.getDraft("absent-seed")).resolves.toBeNull();
      const foreign = await other.context.seed.saveDraft({ id: "foreign-seed", kind: ownKind.kind, applicationId: "other-owner", body: {} });
      await expect(own.context.seed.getDraft(foreign.id)).rejects.toMatchObject({ name: "SecurityError" });
      await expect(own.context.seed.saveDraft({ id: foreign.id, kind: ownKind.kind, applicationId: "seed-owner", body: {} })).rejects.toMatchObject({ name: "SecurityError" });
      await own.cleanup();
      await expect(own.context.seed.getDraft("absent-seed")).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      await own.cleanup();
      await other.cleanup();
      await runtime.dispose("seed scope regression");
    }
  });

  it("keeps preparation callbacks behind opaque contribution provenance", async () => {
    const contribution = createSynCloudOSHostContribution("journal", "tests/journal", () => ({
      runtimeConfig: { persistenceNamespace: "journal" },
    }));

    expect(Object.keys(contribution)).toEqual(["id"]);
    const [prepared] = await prepareSynCloudOSHostContributions([contribution], environment);

    expect(prepared).toMatchObject({ id: "journal", source: "tests/journal", runtimeConfig: { persistenceNamespace: "journal" } });
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared?.runtimeConfig)).toBe(true);
  });

  it("rejects copied handles and copied prepared objects before composition", async () => {
    const contribution = createSynCloudOSHostContribution("journal", "tests/journal", () => ({}));
    const prepared = await prepareSynCloudOSHostContributions([contribution], environment);

    await expect(prepareSynCloudOSHostContributions([{ id: "journal" }], environment)).rejects.toThrow(/not created by this host registry/iu);
    expect(() => composeSynCloudOSHostContributions([{ ...prepared[0]! }])).toThrow(/provenance is invalid/iu);
  });

  it("rejects duplicate contribution IDs before invoking the second preparer", async () => {
    let invoked = 0;
    const first = createSynCloudOSHostContribution("journal", "tests/one", () => { invoked += 1; return {}; });
    const second = createSynCloudOSHostContribution("journal", "tests/two", () => { invoked += 1; return {}; });

    await expect(prepareSynCloudOSHostContributions([first, second], environment)).rejects.toThrow(/Duplicate host contribution ID journal/iu);
    expect(invoked).toBe(1);
  });
});
