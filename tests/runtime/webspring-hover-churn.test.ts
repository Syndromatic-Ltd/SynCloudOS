import { expect, it, vi } from "vitest";
import { createRuntimeHarness, createTestBundle, createTestRuntime } from "./helpers";

it("publishes a hover once, however often the pointer repeats it", async () => {
  const runtime = createTestRuntime();
  const harness = createRuntimeHarness(runtime);
  const appId = "com.example.hover-churn";
  harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, policy: { public: true } }));
  const published = vi.fn();
  const release = runtime.store.subscribe(published);

  harness.SynCloudOS.WebspringState.hoverApp(appId);
  const afterFirst = published.mock.calls.length;
  expect(afterFirst).toBeGreaterThan(0);
  expect(runtime.store.getSnapshot().webspring.hoveredAppId).toBe(appId);
  for (let repeat = 0; repeat < 20; repeat += 1) harness.SynCloudOS.WebspringState.hoverApp(appId);
  expect(published).toHaveBeenCalledTimes(afterFirst);

  harness.SynCloudOS.WebspringState.hoverApp(null);
  const afterClear = published.mock.calls.length;
  expect(afterClear).toBeGreaterThan(afterFirst);
  expect(runtime.store.getSnapshot().webspring.lowerShelfMode).toBe("news");
  for (let repeat = 0; repeat < 20; repeat += 1) harness.SynCloudOS.WebspringState.hoverApp(null);
  expect(published).toHaveBeenCalledTimes(afterClear);

  // A selection moves the selector, so the next hover has something to write again.
  harness.SynCloudOS.WebspringState.selectApp(appId);
  const afterSelect = published.mock.calls.length;
  harness.SynCloudOS.WebspringState.hoverApp(null);
  expect(published.mock.calls.length).toBeGreaterThan(afterSelect);

  release();
  await runtime.dispose("test");
});
