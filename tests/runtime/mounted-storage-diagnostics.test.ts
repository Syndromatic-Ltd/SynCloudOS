// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare, unlockRuntime } from "./helpers";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createAppSCOS } from "../../src/SynCloudOS/AppSDK/scos/scosFacade";
import { standardWindow } from "../fixtures/windowTestDependencies";

const cleanups: (() => void | Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); vi.restoreAllMocks(); });
async function fixture() {
  let resolve!: (v: object) => void; const pending = new Promise<object>(yes => { resolve = yes; });
  const estimate = vi.fn(() => pending), persisted = vi.fn(async () => false), env = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ environment: { ...env, browser: { ...env.browser, getNavigator: () => ({ storage: { estimate, persisted } }) as unknown as Navigator } } }); cleanups.push(() => runtime.dispose());
  unlockRuntime(runtime); await runtime.identity.session.refresh();
  const app = registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.storage-observation", displayName: "Generated storage observation", version: "1.0.0" });
  const responderId = `application:${app.bundleIdentifier}`; runtime.responders.register({ id: responderId, kind: "application", parentId: "runtime", scopeId: responderId });
  runtime.store.mutate(draft => { draft.lifecycle[app.bundleIdentifier] = "active"; draft.application.activeAppId = app.bundleIdentifier; });
  const windowController = runtime.windows.create(standardWindow("window:storage", { applicationId: app.bundleIdentifier, applicationSessionId: app.bundleIdentifier, content: { rendererId: "application", parameters: { appId: app.bundleIdentifier } }, restorationKey: "storage" }));
  await runtime.windows.open(windowController.id);
  const mounted = createMountedSynWareRuntime({ runtime, app: runtime.apps.getApp(app.bundleIdentifier)!, responderId, windowControllerId: windowController.id }); cleanups.push(() => mounted.dispose());
  const context = createSynWareContextValue(mounted.runtime), scos = createAppSCOS(app.bundleIdentifier);
  return { runtime, mounted, context, scos, windowController, resolve, estimate, persisted };
}
describe("mounted storage diagnostics boundary", () => {
  it("projects the same reader through public context and bound SCOS, without raw storage authority", async () => {
    const f = await fixture(); expect(f.scos.storageDiagnostics).toBe(f.context.storageDiagnostics); expect(Object.keys(f.scos.storageDiagnostics)).toEqual(["inspect"]); expect(f.estimate).not.toHaveBeenCalled();
    const pending = f.scos.storageDiagnostics.inspect(); f.resolve({ usage: 2, quota: 4 });
    expect(await pending).toEqual({ estimate: { state: "observed", usageBytes: 2, quotaBytes: 4, approximate: true }, persistence: { state: "observed", persisted: false } });
  });
  it.each(["account", "window", "mount", "runtime"])("rejects pending/retained readers after %s disposal, even if native success is late", async mode => {
    const f = await fixture(), reader = f.scos.storageDiagnostics;
    const pending = reader.inspect(), outcome = pending.then(value => ({ value, reason: undefined }), reason => ({ value: undefined, reason }));
    if (mode === "account") await f.runtime.identity.session.end({ reason: "Generated account transition" });
    else if (mode === "window") expect((await f.runtime.windows.requestClose(f.windowController.id, { reason: "command" })).outcome).toBe("closed");
    else if (mode === "mount") f.mounted.dispose();
    else await f.runtime.dispose();
    const result = await outcome; expect(result.value).toBeUndefined();
    if (mode === "runtime") expect(result.reason).toBe(f.runtime.signal.reason);
    else expect(result.reason).toMatchObject({ name: "AbortError" });
    f.resolve({ usage: 111, quota: 222 }); await Promise.resolve();
    await expect(reader.inspect()).rejects.toBeDefined(); expect(f.estimate).toHaveBeenCalledOnce();
  });
});
