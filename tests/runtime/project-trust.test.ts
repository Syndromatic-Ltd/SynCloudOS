import { expect, it } from "vitest";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { requireTrustedBundlePrivilege, trustSynWareBundleForProject } from "../../src/SynCloudOS/BundleLoader/trustedBundleProvenance";
import { createTestRuntime } from "./helpers";

it("grants a project app only the privileged capabilities its manifest requests", async () => {
  const runtime = createTestRuntime();
  try {
    const bundle = createSynWareBundle(createSynWare({ manifest: { schemaVersion: 1, id: "diagnostics", title: "Diagnostics", version: "1.0.0", permissions: ["diagnostics.view"] }, root: () => null }));
    trustSynWareBundleForProject(bundle, "./Diagnostics.app/Contents/index.tsx");
    runtime.apps.register(bundle);
    expect(() => requireTrustedBundlePrivilege(runtime, "diagnostics", "diagnostics", "diagnostics.view")).not.toThrow();
    expect(() => requireTrustedBundlePrivilege(runtime, "diagnostics", "diagnostics", "diagnostics.control")).toThrow(/must declare capability/);
  } finally { await runtime.dispose("test"); }
});

it("does not grant externally supplied apps first-party privileges from their manifest alone", async () => {
  const runtime = createTestRuntime();
  try {
    runtime.apps.register(createSynWareBundle(createSynWare({ manifest: { schemaVersion: 1, id: "external-diagnostics", title: "External diagnostics", version: "1.0.0", permissions: ["diagnostics.view"] }, root: () => null })));
    expect(() => requireTrustedBundlePrivilege(runtime, "external-diagnostics", "diagnostics", "diagnostics.view")).toThrow(/does not hold host-owned trusted provenance/);
  } finally { await runtime.dispose("test"); }
});
