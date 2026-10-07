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
  prepareSynCloudOSHostContributions,
} from "../../src/SynCloudOS/HostContributions/hostContribution";
import type { TrustedSynWareBundle } from "../../src/SynCloudOS/BundleLoader/bundleTypes";
import type { SynCloudOSRuntimeEnvironment } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { InMemoryDocumentRecoveryStore, type DocumentRecoveryStore } from "../../src/SynCloudOS/Documents/DocumentRecoveryStore";
import type { DocumentStorageAdapter } from "../../src/SynCloudOS/Documents/Adapters/documentAdapterTypes";
import type { DocumentType } from "../../src/SynCloudOS/Documents/documentTypes";
import type { SynCloudOSDocumentKindMetadata } from "../../src/SynCloudOS/DocumentStore";

const environment = {} as SynCloudOSRuntimeEnvironment;
const bundle = (id: string) => ({ synWareManifest: { id } } as unknown as TrustedSynWareBundle);
const kind = (kindId: string) => ({ kind: kindId, version: 1, displayName: kindId } as SynCloudOSDocumentKindMetadata);
const type = (id: string) => ({ id } as unknown as DocumentType<unknown, unknown>);
const adapter = (id: string) => ({ id } as unknown as DocumentStorageAdapter);


async function prepare(...definitions: Array<Parameters<typeof createSynCloudOSHostContribution>>) {
  const contributions = definitions.map(([id, source, callback]) => createSynCloudOSHostContribution(id, source, callback));
  return prepareSynCloudOSHostContributions(contributions, environment);
}

describe("host contribution composition", () => {
  it("composes scalar configuration and additive registries in stable order", async () => {
    const [first, second] = await prepare(
      ["journal", "tests/journal", () => ({
        runtimeConfig: { persistenceNamespace: "journal" },
        initialBundles: [bundle("journal")],
        trustedDocumentKinds: [kind("journal.document")],
        applicationDocuments: { initialTypes: [type("journal")], initialAdapters: [adapter("journal")] },
      })],
      ["calendar", "tests/calendar", () => ({
        runtimeConfig: { presentationTimeoutMs: 500 },
        initialBundles: [bundle("calendar")],
        trustedDocumentKinds: [kind("calendar.event")],
        applicationDocuments: { initialTypes: [type("calendar")], initialAdapters: [adapter("calendar")] },
      })],
    );

    const composition = composeSynCloudOSHostContributions([first!, second!], {
      initialBundles: [bundle("host")],
      trustedDocumentKinds: [kind("host.document")],
      applicationDocuments: { initialTypes: [type("host")], initialAdapters: [adapter("host")] },
    });

    expect(Object.keys(composition.runtimeConfig)).toEqual(["persistenceNamespace", "presentationTimeoutMs"]);
    expect(composition.initialBundles.map((entry) => entry.synWareManifest?.id)).toEqual(["journal", "calendar", "host"]);
    expect(composition.trustedDocumentKinds.map((entry) => entry.kind)).toEqual(["journal.document", "calendar.event", "host.document"]);
    expect(composition.applicationDocuments?.initialTypes?.map((entry) => entry.id)).toEqual(["journal", "calendar", "host"]);
    expect(composition.applicationDocuments?.initialAdapters?.map((entry) => entry.id)).toEqual(["journal", "calendar", "host"]);
  });

  it("rejects conflicting scalar slots and singleton recovery stores", async () => {
    const firstRecoveryStore = new InMemoryDocumentRecoveryStore();
    const secondRecoveryStore = new InMemoryDocumentRecoveryStore();
    const [first, second] = await prepare(
      ["first", "tests/first", () => ({ runtimeConfig: { persistenceNamespace: "shared" }, applicationDocuments: { recoveryStore: firstRecoveryStore as unknown as DocumentRecoveryStore } })],
      ["second", "tests/second", () => ({ runtimeConfig: { persistenceNamespace: "other" }, applicationDocuments: { recoveryStore: secondRecoveryStore as unknown as DocumentRecoveryStore } })],
    );

    expect(() => composeSynCloudOSHostContributions([first!, second!])).toThrow(/Conflicting host runtime configuration for persistenceNamespace/iu);
    const compatible = await prepare(
      ["first", "tests/first", () => ({ applicationDocuments: { recoveryStore: firstRecoveryStore as unknown as DocumentRecoveryStore } })],
      ["second", "tests/second", () => ({ applicationDocuments: { recoveryStore: secondRecoveryStore as unknown as DocumentRecoveryStore } })],
    );
    expect(() => composeSynCloudOSHostContributions(compatible)).toThrow(/Conflicting application document recovery stores/iu);
  });

  it("rejects duplicate additive IDs across contributions and the host base", async () => {
    const [first, second] = await prepare(
      ["first", "tests/first", () => ({ initialBundles: [bundle("same")], trustedDocumentKinds: [kind("same")], applicationDocuments: { initialTypes: [type("same")], initialAdapters: [adapter("same")] } })],
      ["second", "tests/second", () => ({ initialBundles: [bundle("same")], trustedDocumentKinds: [kind("second")], applicationDocuments: { initialTypes: [type("second")], initialAdapters: [adapter("second")] } })],
    );

    expect(() => composeSynCloudOSHostContributions([first!, second!])).toThrow(/Duplicate SynWare bundle ID same/iu);
    const [single] = await prepare(["single", "tests/single", () => ({ initialBundles: [bundle("bundle")], trustedDocumentKinds: [kind("kind")], applicationDocuments: { initialTypes: [type("type")], initialAdapters: [adapter("adapter")] } })]);
    expect(() => composeSynCloudOSHostContributions([single!], {
      initialBundles: [bundle("bundle")],
    })).toThrow(/Duplicate SynWare bundle ID bundle/iu);
    expect(() => composeSynCloudOSHostContributions([single!], {
      trustedDocumentKinds: [kind("kind")],
    })).toThrow(/Duplicate trusted document kind ID kind/iu);
    expect(() => composeSynCloudOSHostContributions([single!], {
      applicationDocuments: { initialTypes: [type("type")] },
    })).toThrow(/Duplicate application document type ID type/iu);
    expect(() => composeSynCloudOSHostContributions([single!], {
      applicationDocuments: { initialAdapters: [adapter("adapter")] },
    })).toThrow(/Duplicate application document adapter ID adapter/iu);
  });
});
