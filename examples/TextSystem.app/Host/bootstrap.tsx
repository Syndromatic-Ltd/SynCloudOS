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

import React from "react";
import { atmoTheme } from "@syndromatic/syncloudos/nse/themes/atmo";
import type { NSEThemeDefinition } from "@syndromatic/syncloudos/nse/theme";
// Packaged browser JS extracts host CSS; loading the documented public stylesheet is a host responsibility.
import "@syndromatic/syncloudos/browser/styles.css";
import { mountSynCloudOS, createSynCloudOSHostContribution, InMemoryDocumentAdapter, createIndexedDBDocumentAssetStore } from "@syndromatic/syncloudos/browser";
import { defineWebspring, type WebspringViewProps } from "@syndromatic/syncloudos/webspring";
import type { AppDocumentLocation } from "@syndromatic/syncloudos/sdk";
import { createTextSystemExampleApp, textSystemDocumentType, type TextSystemExampleAppOptions } from "../Contents";
import type { TextSystemExampleModel } from "../Contents/model";
import manifest from "../Contents/Info";

/** Trusted PRIVATE host bootstrap. Application files never import browser, raw runtime, stores or adapters. */
export function createExamplePersistenceHost(options: { readonly databaseName: string; readonly indexedDB: IDBFactory; readonly theme?: NSEThemeDefinition }) {
  const scope = Object.freeze({ authorizationId: "com.syncloudos.examples.text-system", documentId: "example-native" });
  const nativeLocation: AppDocumentLocation = Object.freeze({ kind: "memory", namespace: options.databaseName, key: scope.documentId });
  // This explicitly memory provider survives two host instances only through this host-owned handle.
  const nativeAdapter = new InMemoryDocumentAdapter({ now: () => Date.now(), randomUUID: () => crypto.randomUUID() });
  let storesCreated = 0, storesDisposed = 0, hostsMounted = 0;
  const runtimeIds: string[] = [];
  function Outlet({ applicationOutlet }: WebspringViewProps) { return <>{applicationOutlet}</>; }
  const shell = defineWebspring({ manifest: { schemaVersion: 1, bundleIdentifier: "com.syncloudos.examples.text-system-shell", version: "0.1.0", displayName: "Example host",
    webspringShell: { views: [{ id: "example", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
      defaults: { desktop: "example", tablet: "example", mobile: "example" }, homeRoute: "/",
      branding: { name: { key: "example.host", fallback: "Text System example" } } } }, components: { example: Outlet } });
  return {
    nativeLocation,
    getReceipt() { return { nativeDurability: "memory" as const, assetDurability: "durable" as const, crossStoreAtomicity: false as const,
      scope, nativeLocation, storesCreated, storesDisposed, hostsMounted, runtimeIds: [...runtimeIds], fullPageReload: false as const }; },
    async readNativeRecord() { return nativeAdapter.read<TextSystemExampleModel>(nativeLocation); },
    async mount(element: Element, appOptions: TextSystemExampleAppOptions, reopen = false) {
      const runtimeId = `example-text-host:${crypto.randomUUID()}`;
      const contribution = createSynCloudOSHostContribution(`example-persistence-${hostsMounted + 1}`, "private TextSystem example host", () => ({
        runtimeConfig: { id: runtimeId, persistenceNamespace: runtimeId },
        applicationDocuments: { initialTypes: [textSystemDocumentType], initialAdapters: [nativeAdapter], assetBacking: {
          createStore: () => {
            const store = createIndexedDBDocumentAssetStore({ indexedDB: options.indexedDB, databaseName: options.databaseName }); storesCreated++;
            let disposed = false;
            return Object.freeze({ ...store, dispose() { if (disposed) return; disposed = true; storesDisposed++; store.dispose(); } });
          },
          scopeForDocument: () => scope,
          manifest: { enumerateReferences: native => (native as TextSystemExampleModel).assets, scopeForLocation: () => scope, nativeDurability: "memory" },
        } },
      }));
      const app = createTextSystemExampleApp({ ...appOptions, nativeDestination: nativeLocation, ...(reopen ? { openLocation: nativeLocation } : {}) });
      // Browser routing starts from the browser location. This host-only launch selects the declared app route.
      history.replaceState(history.state, "", "/examples/text-system");
      const composition = { bundles: [{ manifest, modulePath: "./TextSystem.app/Contents/index.tsx", loadModule: async () => ({ default: app }) }], preferences: [], widgets: [], contributions: [contribution], shell, shellResources: {} };
      const host = await mountSynCloudOS({ element, composition, theme: options.theme ?? atmoTheme, authentication: "disabled" }); hostsMounted++; runtimeIds.push(runtimeId);
      return host;
    },
  };
}
