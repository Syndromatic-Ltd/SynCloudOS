// @vitest-environment jsdom
import { expect, it } from "vitest";
import { createDeterministicRuntimeEnvironment } from "../../../src/SynCloudOS/AppSDK/testing";
import { createBrowserRuntimeEnvironment } from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { BrowserNFCAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserNFCAdapter";
import { createSynCloudOSHostContribution, prepareSynCloudOSHostContributions } from "../../../src/SynCloudOS/HostContributions/hostContribution";
import { nfcAdapterFor } from "../../../src/FX/NFCFX/internal/nfcPort";
it("withholds nfc adapters and factories from all public runtime environments", async () => {
  const testing = createDeterministicRuntimeEnvironment();
  try {
    expect("nfc" in testing.environment).toBe(false); expect(nfcAdapterFor(testing.environment)).toBeDefined();
    let called = false; await prepareSynCloudOSHostContributions([createSynCloudOSHostContribution("nfc-test", "test", environment => { called = true; expect("nfc" in environment).toBe(false); return {}; })], testing.environment); expect(called).toBe(true);
    const browser = createBrowserRuntimeEnvironment(); expect("nfc" in browser).toBe(false); expect(nfcAdapterFor(browser)).toBeInstanceOf(BrowserNFCAdapter);
  } finally { testing.dispose(); }
});
