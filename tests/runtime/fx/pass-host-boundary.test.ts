// @vitest-environment jsdom
import { expect, it } from "vitest";
import { createDeterministicRuntimeEnvironment } from "../../../src/SynCloudOS/AppSDK/testing";
import { createBrowserRuntimeEnvironment } from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { BrowserPaymentAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserPaymentAdapter";
import { createSynCloudOSHostContribution, prepareSynCloudOSHostContributions } from "../../../src/SynCloudOS/HostContributions/hostContribution";
import { paymentAdapterFor } from "../../../src/FX/PassFX/internal/paymentPort";
it("withholds payment adapters and factories from all public runtime environments", async () => {
  const testing = createDeterministicRuntimeEnvironment();
  try {
    expect("payment" in testing.environment).toBe(false); expect(testing.adapters.payment).toBeDefined(); expect("open" in testing.adapters.payment).toBe(false); expect(paymentAdapterFor(testing.environment)).toBeDefined();
    let called = false; await prepareSynCloudOSHostContributions([createSynCloudOSHostContribution("pass-test", "test", environment => { called = true; expect("payment" in environment).toBe(false); return {}; })], testing.environment); expect(called).toBe(true);
    const browser = createBrowserRuntimeEnvironment(); expect("payment" in browser).toBe(false); expect(paymentAdapterFor(browser)).toBeInstanceOf(BrowserPaymentAdapter);
  } finally { testing.dispose(); }
});
