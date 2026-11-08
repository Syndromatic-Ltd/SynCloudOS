import { createSynCloudOSHostContribution } from "@syndromatic/syncloudos/browser";
import { createDeterministicRuntimeEnvironment, type SynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { SCOS, useNetwork, type SynWareContextValue } from "@syndromatic/syncloudos/sdk";
import { SCOS as RootSCOS } from "@syndromatic/syncloudos";
createSynCloudOSHostContribution("network-boundary", "installed-test", environment => {
  const now: number = environment.now(); void now;
  // @ts-expect-error Network adapters are private even in an inferred browser host environment.
  environment.networkPaths;
  // @ts-expect-error Network adapter types cannot be extracted from the public callback environment.
  type NetworkAdapter = typeof environment["networkPaths"];
  return {};
});
const testing = createDeterministicRuntimeEnvironment();
testing.adapters.network.setStatus("satisfied");
// @ts-expect-error Testing exposes controls, not native Network adapters.
testing.environment.networkPaths;
// @ts-expect-error The testing environment type has no Network adapter route.
type TestingNetworkAdapter = typeof testing.environment["networkPaths"];
declare const host: SynWareTestHost;
// @ts-expect-error The test-host control does not expose native observation methods.
host.adapters.network.currentPath();
// @ts-expect-error No factory via test-host app context.
host.appContext.network;
// @ts-expect-error No factory via exported context type.
type ContextNetwork = SynWareContextValue["network"];
// @ts-expect-error No factory on SDK SCOS.
SCOS.network;
// @ts-expect-error No factory on root SCOS.
RootSCOS.network;
const monitor = useNetwork(); monitor.start(); monitor.cancel();
