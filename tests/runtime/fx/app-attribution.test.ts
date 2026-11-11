import { afterEach, describe, expect, it } from "vitest";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";
import { fxAttributedClass, fxApplicationID, createFXSessionBinding } from "../../../src/SynCloudOS/fxRuntimeContracts";
import { createSynWareContextValue } from "../../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "../helpers";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); });
const unavailable = (reason: string) => Object.assign(new Error(reason), { name: "ProbeUnavailable", reason });
class Probe {
  static readonly [fxAttributedClass] = true;
  static identity() { return fxApplicationID(this); }
  readonly appID = fxApplicationID(new.target);
  readonly session = createFXSessionBinding(new.target, unavailable);
  use() { return this.session.resolve().context.runtimeInfo.id; }
}
function mount(appID = "com.example.first", runtimeID = "runtime:first") {
  const runtime = createTestRuntime({ id: runtimeID });
  registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: appID, displayName: "Probe", version: "1.0.0", routes: [{ path: "/probe", primary: true }] });
  const mounted = mountTestSynWareRuntime(runtime, appID);
  cleanup.push(() => mounted.dispose());
  return { mounted, context: createSynWareContextValue(mounted.runtime) };
}

describe("compiled FX class attribution", () => {
  it("binds once per canonical app and base type, preserving pure and specialised identities", () => {
    class Pure {}
    const family = { Probe, Alias: Probe, Pure, specialised: Object.freeze({ Type: Pure }) };
    const first = bindFXFamily(family, "COM.EXAMPLE.FIRST");
    expect(first.Probe).toBe(bindFXFamily({ Probe }, "com.example.first").Probe);
    expect(first.Probe).toBe(first.Alias);
    expect(first.Probe).not.toBe(bindFXFamily(family, "com.example.second").Probe);
    expect(first.Pure).toBe(Pure);
    expect(first.specialised).toBe(family.specialised);
    expect(new first.Probe()).toBeInstanceOf(Probe);
    expect(first.Probe.identity()).toBe("com.example.first");
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("rejects attributed base construction and statics outside compiled app code", () => {
    const message = "Probe must be created by an application compiled with the SynCloudOS plugin; import it from code inside an application bundle";
    expect(() => new Probe()).toThrow(message);
    expect(() => Probe.identity()).toThrow(message);
  });

  it("carries identity before mounting and across native awaits, timers and third-party callbacks", async () => {
    const First = bindFXFamily({ Probe }, "com.example.first").Probe;
    const Second = bindFXFamily({ Probe }, "com.example.second").Probe;
    const early = new First(); // ApplicationSession constructs apps before publishing services.
    expect(() => early.use()).toThrow(expect.objectContaining({ reason: "notRunning" }));
    mount(); mount("com.example.second", "runtime:second");
    await Promise.resolve();
    expect(new First().use()).toBe("runtime:first");
    expect(early.use()).toBe("runtime:first");
    await new Promise<void>(resolve => setTimeout(() => {
      expect(new Second().use()).toBe("runtime:second"); resolve();
    }, 0));
    const libraryCallback = (callback: () => Probe) => queueMicrotask(() => {
      expect(callback().use()).toBe("runtime:first");
    });
    libraryCallback(() => new First());
    await Promise.resolve();
  });

  it("captures the selected session and never rebinds after it ends", () => {
    const Bound = bindFXFamily({ Probe }, "com.example.first").Probe;
    const first = mount();
    const instance = new Bound();
    expect(instance.use()).toBe("runtime:first");
    mount("com.example.first", "runtime:second");
    expect(instance.use()).toBe("runtime:first");
    first.mounted.dispose();
    expect(() => instance.use()).toThrow(expect.objectContaining({ reason: "ended" }));
    expect(new Bound().use()).toBe("runtime:second");
  });

  it("uses SCOS ambiguity and same-runtime selection semantics at first access", () => {
    const first = mount();
    const Bound = bindFXFamily({ Probe }, "com.example.first").Probe;
    const dispose = registerSCOSAppSession({ appId: "com.example.first", displayName: "Same runtime", version: "1", context: first.context });
    cleanup.push(dispose);
    const same = new Bound();
    expect(same.session.resolve().displayName).toBe("Same runtime");
    mount("com.example.first", "runtime:second");
    expect(() => new Bound().use()).toThrow(expect.objectContaining({ reason: "ambiguous" }));
  });

  it("treats an unpublished captured session as terminal even if its signal remains live", () => {
    const first = mount();
    const dispose = registerSCOSAppSession({ appId: "com.example.first", displayName: "Transient", version: "1", context: first.context });
    const Bound = bindFXFamily({ Probe }, "com.example.first").Probe;
    const instance = new Bound(); instance.use(); dispose();
    expect(first.context.signal.aborted).toBe(false);
    expect(() => instance.use()).toThrow(expect.objectContaining({ reason: "ended" }));
  });
});
