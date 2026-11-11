// @vitest-environment jsdom
import { expect, it } from "vitest";
import { createDeterministicRuntimeEnvironment } from "../../../src/SynCloudOS/AppSDK/testing";
import { createBrowserRuntimeEnvironment } from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { BrowserNetworkPathAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserNetworkPathAdapter";
import { createSynCloudOSHostContribution, prepareSynCloudOSHostContributions } from "../../../src/SynCloudOS/HostContributions/hostContribution";
import { networkAdapterFor } from "../../../src/FX/NetworkFX/internal/networkPort";
it("withholds native Network adapters from test and contribution environments while retaining private observation", async () => {
  const testing = createDeterministicRuntimeEnvironment();
  try {
    expect("networkPaths" in testing.environment).toBe(false);
    testing.adapters.network.allow();
    const adapter = networkAdapterFor(testing.environment)!; expect(adapter.currentPath().status).toBe("satisfied");
    const seen: string[] = []; const observation = adapter.subscribe(path => { seen.push(path.status); });
    testing.adapters.network.setStatus("unsatisfied"); expect(seen).toEqual(["unsatisfied"]);
    let called = false;
    await prepareSynCloudOSHostContributions([createSynCloudOSHostContribution("network-test", "test", environment => {
      called = true; expect("networkPaths" in environment).toBe(false); expect(environment.now()).toBe(testing.clock.now()); return {};
    })], testing.environment);
    expect(called).toBe(true); observation.dispose(); expect(testing.adapters.network.activeMonitorCount()).toBe(0);
  } finally { testing.dispose(); }
});
it("keeps the browser Network adapter in an internal association, absent from the returned environment", () => {
  const environment = createBrowserRuntimeEnvironment();
  expect("networkPaths" in environment).toBe(false); expect(networkAdapterFor(environment)).toBeInstanceOf(BrowserNetworkPathAdapter);
});
