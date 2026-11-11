// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createDeterministicRuntimeEnvironment } from "../../../src/SynCloudOS/AppSDK/testing";
import { createBrowserRuntimeEnvironment } from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { BrowserXRAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserXRAdapter";
import { xrAdapterFor } from "../../../src/FX/XRFX/internal/xrPort";
import { createSynCloudOSHostContribution, prepareSynCloudOSHostContributions } from "../../../src/SynCloudOS/HostContributions/hostContribution";
it("keeps the XR transport private in browser, testing and host-contribution environments", async () => {
  const testing = createDeterministicRuntimeEnvironment();
  try {
    expect("xr" in testing.environment).toBe(false); expect(xrAdapterFor(testing.environment)).toBeDefined();
    let visited = false; await prepareSynCloudOSHostContributions([createSynCloudOSHostContribution("xr-boundary", "test", environment => { visited = true; expect("xr" in environment).toBe(false); return {}; })], testing.environment); expect(visited).toBe(true);
    const browser = createBrowserRuntimeEnvironment(); expect("xr" in browser).toBe(false); expect(xrAdapterFor(browser)).toBeInstanceOf(BrowserXRAdapter);
  } finally { testing.dispose(); }
});
it("observes privacy withdrawal after denied construction through the actual mounted runtime", async () => {
  const { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } = await import("../helpers");
  const { createSynWareContextValue } = await import("../../../src/SynCloudOS/AppSDK/createSynWareContextValue");
  const { bindFXFamily } = await import("../../../src/SynCloudOS/AppSDK/fx/bindFXFamily");
  const XR = await import("../../../src/FX/XRFX/public");
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } });
  const device = createDeterministicRuntimeEnvironment(), finishBootstrap = device.prepareRuntimeBootstrap();
  const runtime = (() => { try { return createTestRuntime({ environment: device.environment, authenticationPolicy: "optional" }); } finally { finishBootstrap(); } })();
  const appId = "com.example.xr-privacy-wiring"; let mount: ReturnType<typeof mountTestSynWareRuntime> | undefined;
  try {
    device.adapters.browser.allow(); device.adapters.permissions.allow(); device.adapters.policy.allow(); device.adapters.xr.allow(); await runtime.identity.session.refresh();
    registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: appId, version: "1.0.0", displayName: "XR privacy", routes: [{ path: "/xr-privacy", primary: true }], runtime: { policy: { public: true } }, entitlements: ["xr.session"] });
    mount = mountTestSynWareRuntime(runtime, appId); createSynWareContextValue(mount.runtime);
    const scope = { userId: runtime.configurationProfiles.getCurrentSubject().user.id, appId, service: "xr" }, App = bindFXFamily(XR, appId);
    runtime.privacy.revoke(scope); const session = new App.XRFXSession(); const configuration = new App.XRFXWorldTrackingConfiguration(); configuration.isLightEstimationEnabled = false;
    runtime.privacy.setAuthorization(scope, "granted"); runtime.privacy.revoke(scope); runtime.privacy.setAuthorization(scope, "granted"); while (jobs.length) jobs.shift()!();
    expect(() => session.run(configuration)).toThrow(XR.XRFXError); expect(device.adapters.xr.calls()).toEqual([]);
    const replacement = new App.XRFXSession(); replacement.run(configuration); for (let i = 0; i < 40; i++) await Promise.resolve(); expect(device.adapters.xr.activeSessionCount()).toBe(1);
  } finally { mount?.dispose("XR privacy regression cleanup"); await runtime.dispose({ reason: "XR privacy regression cleanup", inFlight: "cancel" }); device.dispose(); while (jobs.length) jobs.shift()!(); vi.unstubAllGlobals(); }
});
