// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createDeterministicRuntimeEnvironment } from "../../../src/SynCloudOS/AppSDK/testing";
import { createBrowserRuntimeEnvironment } from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { BrowserBluetoothAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserBluetoothAdapter";
import { createSynCloudOSHostContribution, prepareSynCloudOSHostContributions } from "../../../src/SynCloudOS/HostContributions/hostContribution";
import { bluetoothAdapterFor } from "../../../src/FX/BluetoothFX/internal/bluetoothPort";
it("withholds bluetooth adapters and factories from all public runtime environments", async () => {
  const testing = createDeterministicRuntimeEnvironment();
  try {
    expect("bluetooth" in testing.environment).toBe(false); expect(bluetoothAdapterFor(testing.environment)).toBeDefined();
    let called = false; await prepareSynCloudOSHostContributions([createSynCloudOSHostContribution("bluetooth-test", "test", environment => { called = true; expect("bluetooth" in environment).toBe(false); return {}; })], testing.environment); expect(called).toBe(true);
    const browser = createBrowserRuntimeEnvironment(); expect("bluetooth" in browser).toBe(false); expect(bluetoothAdapterFor(browser)).toBeInstanceOf(BrowserBluetoothAdapter);
  } finally { testing.dispose(); }
});

it("observes privacy withdrawals for denied-constructed centrals through real mounted runtime wiring", async () => {
  const { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } = await import("../helpers");
  const { createSynWareContextValue } = await import("../../../src/SynCloudOS/AppSDK/createSynWareContextValue");
  const { bindFXFamily } = await import("../../../src/SynCloudOS/AppSDK/fx/bindFXFamily");
  const B = await import("../../../src/FX/BluetoothFX/public");
  const jobs: (() => void)[] = [];
  vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } });
  const device = createDeterministicRuntimeEnvironment();
  const finishBootstrap = device.prepareRuntimeBootstrap();
  const runtime = (() => { try { return createTestRuntime({ environment: device.environment, authenticationPolicy: "optional" }); } finally { finishBootstrap(); } })();
  const appId = "com.example.bluetooth-privacy-wiring";
  let mount: ReturnType<typeof mountTestSynWareRuntime> | undefined;
  try {
    device.adapters.browser.allow(); device.adapters.permissions.allow(); device.adapters.policy.allow(); device.adapters.bluetooth.allow();
    await runtime.identity.session.refresh();
    registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: appId, version: "1.0.0", displayName: "Bluetooth privacy", routes: [{ path: "/bluetooth-privacy", primary: true }], runtime: { policy: { public: true } }, entitlements: ["bluetooth.access"] });
    mount = mountTestSynWareRuntime(runtime, appId);
    createSynWareContextValue(mount.runtime);
    const scope = { userId: runtime.configurationProfiles.getCurrentSubject().user.id, appId, service: "bluetooth" };
    const App = bindFXFamily(B, appId);
    expect(App.BTFXManager.authorization).toBe("notDetermined");
    runtime.privacy.revoke(scope);
    const state = vi.fn();
    const central = new App.BTFXCentralManager({ centralManagerDidUpdateState: state });
    expect(central.state).toBe("unauthorized");
    runtime.privacy.setAuthorization(scope, "granted");
    runtime.privacy.revoke(scope);
    runtime.privacy.setAuthorization(scope, "granted");
    while (jobs.length) jobs.shift()!();
    expect(state).not.toHaveBeenCalled();
    expect(() => central.scanForPeripherals(null)).toThrow(B.BTFXError);
    expect(device.adapters.bluetooth.calls()).toEqual([]);
    const replacement = new App.BTFXCentralManager();
    expect(replacement.state).toBe("poweredOn");
  } finally {
    mount?.dispose("Bluetooth privacy regression cleanup");
    await runtime.dispose({ reason: "Bluetooth privacy regression cleanup", inFlight: "cancel" });
    device.dispose();
    while (jobs.length) jobs.shift()!();
    vi.unstubAllGlobals();
  }
});
