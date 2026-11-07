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

import { afterEach, describe, expect, it } from "vitest";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import {
  getTrustedSynWareBundleProvenance,
  preserveTrustedSynWareBundleProvenance,
  trustSynWareBundleForTest,
} from "../../src/SynCloudOS/BundleLoader/trustedBundleProvenance";
const defaultSynWareBundles = [
  trustSynWareBundleForTest(createSynWareBundle(trustedDefinition("com.example.diagnostics")), { sourceKey: "tests/fixtures/diagnostics", privileges: ["diagnostics"] }),
  trustSynWareBundleForTest(createSynWareBundle(trustedDefinition("com.example.nse-control-gallery")), { sourceKey: "tests/fixtures/conformance", privileges: ["conformance"] }),
  trustSynWareBundleForTest(createSynWareBundle(trustedDefinition("com.example.journal-publisher")), { sourceKey: "tests/fixtures/provider-admin", privileges: ["journal-provider-admin"] }),
  createSynWareBundle(trustedDefinition("com.example.portfolio")),
];
import { createTestRuntime, mountTestSynWareRuntime } from "./helpers";

const mounted: Array<ReturnType<typeof mountTestSynWareRuntime>> = [];
let trustedRuntimeSequence = 0;

afterEach(() => {
  for (const entry of mounted.splice(0)) entry.dispose("trusted provenance test complete");
});

function trustedDefinition(id: string, permissions: readonly string[] = ["diagnostics.view", "journal.publisher.open"]) {
  return createSynWare({
    manifest: {
      schemaVersion: 1,
      bundleIdentifier: id,
      version: "1.0.0",
      displayName: id,
      permissions,
    },
    root: () => null,
  });
}

function mountBundle(bundle: ReturnType<typeof createSynWareBundle>) {
  const runtime = createTestRuntime({ id: `runtime:trusted:${bundle.manifest.bundleIdentifier}:${++trustedRuntimeSequence}`, initialBundles: [bundle] });
  const app = runtime.apps.getApp(bundle.manifest.bundleIdentifier);
  if (!app) throw new Error("The trusted fixture did not register.");
  const entry = mountTestSynWareRuntime(runtime, app.bundleIdentifier);
  mounted.push(entry);
  return { runtime, app, mounted: entry, context: createSynWareContextValue(entry.runtime) };
}

function requireTrustedClient<T>(client: T | undefined, label: string): T {
  if (!client) throw new Error(`Trusted ${label} client was not minted.`);
  return client;
}

describe("SynWare trusted bundle provenance", () => {
  it("mints and retains provenance for explicit host-trusted bundles only", () => {
    const journalBundle = defaultSynWareBundles.find((bundle) => bundle.manifest.bundleIdentifier === "com.example.journal-publisher");
    const diagnosticsBundle = defaultSynWareBundles.find((bundle) => bundle.manifest.bundleIdentifier === "com.example.diagnostics");
    const galleryBundle = defaultSynWareBundles.find((bundle) => bundle.manifest.bundleIdentifier === "com.example.nse-control-gallery");
    const ordinaryBundle = defaultSynWareBundles.find((bundle) => bundle.manifest.bundleIdentifier === "com.example.portfolio");
    if (!journalBundle || !diagnosticsBundle || !galleryBundle || !ordinaryBundle) {
      throw new Error("The host-trusted fixtures were not discovered.");
    }

    expect(getTrustedSynWareBundleProvenance(journalBundle)).toMatchObject({ sourceKey: "tests/fixtures/provider-admin" });
    expect(getTrustedSynWareBundleProvenance(journalBundle)?.privileges.has("journal-provider-admin")).toBe(true);
    expect(getTrustedSynWareBundleProvenance(diagnosticsBundle)).toMatchObject({ sourceKey: "tests/fixtures/diagnostics" });
    expect(getTrustedSynWareBundleProvenance(galleryBundle)).toMatchObject({ sourceKey: "tests/fixtures/conformance" });
    expect(getTrustedSynWareBundleProvenance(ordinaryBundle)).toBeNull();

    const runtime = createTestRuntime({ id: "runtime:trusted-canonical-journal", initialBundles: [journalBundle] });
    expect(runtime.bundles.getTrustedBundleProvenance("com.example.journal-publisher")).toMatchObject({
      sourceKey: "tests/fixtures/provider-admin",
    });
  });

  it("preserves host provenance through post-construction AppRegistry registration", () => {
    const definition = trustedDefinition("com.example.post-construction-trusted", ["diagnostics.view"]);
    const bundle = trustSynWareBundleForTest(createSynWareBundle(definition), {
      sourceKey: "tests/post-construction-trusted",
      privileges: ["diagnostics"],
    });
    const runtime = createTestRuntime({ id: "runtime:trusted-post-construction" });

    expect(getTrustedSynWareBundleProvenance(runtime.bundles.createBundle(bundle))).toMatchObject({
      sourceKey: "tests/post-construction-trusted",
    });
    expect(runtime.apps.register(bundle)).toMatchObject({ bundleIdentifier: "com.example.post-construction-trusted" });
    expect(runtime.bundles.getTrustedBundleProvenance("com.example.post-construction-trusted")).toMatchObject({
      sourceKey: "tests/post-construction-trusted",
    });
  });

  it("does not carry host provenance across an identity-changing bundle copy", () => {
    const bundle = trustSynWareBundleForTest(createSynWareBundle(trustedDefinition("com.example.provenance-source", ["diagnostics.view"])), {
      sourceKey: "tests/provenance-source",
      privileges: ["diagnostics"],
    });
    const rebased = preserveTrustedSynWareBundleProvenance(bundle, {
      ...bundle,
      manifest: { ...bundle.manifest, bundleIdentifier: "com.example.provenance-target" },
    });

    expect(getTrustedSynWareBundleProvenance(rebased)).toBeNull();
  });

  it("mints bounded trusted clients only for explicit host-trusted bundles", async () => {
    const diagnosticsBundle = defaultSynWareBundles.find((bundle) => bundle.manifest.bundleIdentifier === "com.example.diagnostics");
    const galleryBundle = defaultSynWareBundles.find((bundle) => bundle.manifest.bundleIdentifier === "com.example.nse-control-gallery");
    const journalBundle = defaultSynWareBundles.find((bundle) => bundle.manifest.bundleIdentifier === "com.example.journal-publisher");
    if (!diagnosticsBundle || !galleryBundle || !journalBundle) {
      throw new Error("The canonical trusted client fixtures were not discovered.");
    }
    const diagnostics = mountBundle(diagnosticsBundle);
    const gallery = mountBundle(galleryBundle);
    const journal = mountBundle(journalBundle);
    const diagnosticsClient = requireTrustedClient(diagnostics.context.trusted.diagnostics, "diagnostics");
    const conformanceClient = requireTrustedClient(gallery.context.trusted.conformance, "conformance");

    await expect(diagnosticsClient.refreshConformanceSnapshot()).resolves.toMatchObject({ runtimeId: expect.any(String) });
    const evidence = conformanceClient.registerAppearanceFact({ slot: "trusted.fixture", status: "covered" });
    expect(gallery.runtime.inspector.getConformanceAppearanceFacts()).toEqual([{ slot: "trusted.fixture", status: "covered" }]);
    expect(evidence.dispose()).toBe(true);
    expect("journalProvider" in journal.context.trusted).toBe(false);
  });

  it("keeps Gallery conformance diagnostics and locale evidence host-owned", () => {
    const galleryBundle = defaultSynWareBundles.find((bundle) => bundle.manifest.bundleIdentifier === "com.example.nse-control-gallery");
    if (!galleryBundle) throw new Error("The canonical Gallery bundle was not discovered.");
    const gallery = mountBundle(galleryBundle);
    const conformance = requireTrustedClient(gallery.context.trusted.conformance, "conformance") as unknown as {
      readonly getRuntimeEvidence?: () => unknown;
      readonly getLocaleEvidence?: () => unknown;
    };

    expect(typeof conformance.getRuntimeEvidence).toBe("function");
    expect(typeof conformance.getLocaleEvidence).toBe("function");
    expect(conformance.getRuntimeEvidence?.()).toMatchObject({
      trackingRegionCount: expect.any(Number),
      activeTextMeasurementNodeCount: expect.any(Number),
      activeImageReferenceCount: expect.any(Number),
      activeAnimationCount: expect.any(Number),
      soundHandleCount: expect.any(Number),
      webContentSessionCount: expect.any(Number),
    });
    expect(conformance.getLocaleEvidence?.()).toMatchObject({
      locale: expect.any(String),
      supportedLocales: expect.any(Array),
    });
  });

  it("denies a forged same-ID, system-type, capability-bearing manifest", async () => {
    const definition = trustedDefinition("com.example.diagnostics", ["diagnostics.view"]);
    const bundle = createSynWareBundle(definition);
    const forged = Object.freeze({
      ...bundle,
      manifest: { ...bundle.manifest, type: "system" as const },
      trustedBundleProvenance: Object.freeze({
        sourceKey: "forged/diagnostics",
        privileges: new Set(["diagnostics"]),
      }),
    });
    const { context } = mountBundle(forged);

    expect(context.trusted.diagnostics).toBeUndefined();
  });

  it("requires the declared capability in addition to trusted provenance", async () => {
    const definition = trustedDefinition("com.example.trusted-without-capability", []);
    const bundle = trustSynWareBundleForTest(createSynWareBundle(definition), {
      sourceKey: "tests/trusted-without-capability",
      privileges: ["diagnostics"],
    });
    const { context } = mountBundle(bundle);

    expect(context.trusted.diagnostics).toBeUndefined();
  });

  it("revalidates provenance against the current bundle before each privileged operation", async () => {
    const definition = trustedDefinition("com.example.trusted-replaced", ["diagnostics.view"]);
    const bundle = trustSynWareBundleForTest(createSynWareBundle(definition), {
      sourceKey: "tests/trusted-replaced",
      privileges: ["diagnostics"],
    });
    const { runtime, context } = mountBundle(bundle);
    const diagnosticsClient = requireTrustedClient(context.trusted.diagnostics, "diagnostics");

    await expect(diagnosticsClient.refreshConformanceSnapshot()).resolves.toMatchObject({ runtimeId: expect.any(String) });
    runtime.bundles.registerBundle(createSynWareBundle(definition));
    await expect(diagnosticsClient.refreshConformanceSnapshot()).rejects.toThrow(/provenance|trusted/i);
  });

  it.each(["same-ID bundle replacement", "mount abort"])(
    "does not deliver a deferred trusted Diagnostics result after %s",
    async (revocation) => {
      const definition = trustedDefinition(`com.example.trusted-diagnostics-deferred-${revocation.replace(/[^a-z]+/gu, "-")}`, ["diagnostics.view"]);
      const bundle = trustSynWareBundleForTest(createSynWareBundle(definition), {
        sourceKey: `tests/${definition.manifest.bundleIdentifier}`,
        privileges: ["diagnostics"],
      });
      const { runtime, context, mounted: entry } = mountBundle(bundle);
      const diagnosticsClient = requireTrustedClient(context.trusted.diagnostics, "diagnostics");
      let delivered = false;
      const request = diagnosticsClient.refreshConformanceSnapshot().then((value) => {
        delivered = true;
        return value;
      });

      if (revocation === "same-ID bundle replacement") {
        runtime.bundles.registerBundle(createSynWareBundle(definition));
      } else {
        entry.dispose("trusted diagnostics operation aborted");
      }

      await expect(request).rejects.toThrow(/abort|revoked|provenance|trusted/i);
      expect(delivered).toBe(false);
    },
  );

  it("does not let a trusted client select another application identity", async () => {
    const trusted = trustSynWareBundleForTest(createSynWareBundle(trustedDefinition("com.example.trusted-diagnostics", ["diagnostics.view"])), {
      sourceKey: "tests/trusted-diagnostics",
      privileges: ["diagnostics"],
    });
    const other = createSynWareBundle(trustedDefinition("com.example.other-diagnostics", ["diagnostics.view"]));
    const runtime = createTestRuntime({ id: "runtime:trusted-cross-app", initialBundles: [trusted, other] });
    const otherApp = runtime.apps.getApp("com.example.other-diagnostics");
    if (!otherApp) throw new Error("The cross-app fixture did not register.");
    const otherMount = mountTestSynWareRuntime(runtime, otherApp.bundleIdentifier);
    mounted.push(otherMount);
    const context = createSynWareContextValue(otherMount.runtime);

    expect(context.trusted.diagnostics).toBeUndefined();
  });

  it("fails closed after the mounted capability is revoked", async () => {
    const bundle = trustSynWareBundleForTest(createSynWareBundle(trustedDefinition("com.example.trusted-abort", ["diagnostics.view"])), {
      sourceKey: "tests/trusted-abort",
      privileges: ["diagnostics"],
    });
    const { context, mounted: entry } = mountBundle(bundle);
    const diagnosticsClient = requireTrustedClient(context.trusted.diagnostics, "diagnostics");
    entry.dispose("trusted client revoked");

    await expect(diagnosticsClient.refreshConformanceSnapshot()).rejects.toThrow(/abort|revoked/i);
  });
});
