import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as N from "../../../src/FX/NetworkFX/public";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
import { associateNetworkPort, type NetworkPathSnapshot } from "../../../src/FX/NetworkFX/internal/networkPort";
import { createMountedNetworkPort } from "../../../src/SynCloudOS/AppSDK/mountedNetworkPort";
import { dispatchQueueForSession } from "../../../src/FX/DispatchFX/internal/sessionBinding";
import { currentExecution } from "../../../src/FX/DispatchFX/internal/executionStack";

const cleanup: (() => void)[] = [];
const tasks: (() => void)[] = [];
const App = bindFXFamily(N, "com.example.network");
const flush = () => { for (let n = 0; tasks.length && n < 100; n++) tasks.shift()!(); expect(tasks).toHaveLength(0); };
export const snapshot = (): NetworkPathSnapshot => ({ status: "satisfied", unsatisfiedReason: "notAvailable", isExpensive: false, isConstrained: false, supportsIPv4: true, supportsIPv6: false, supportsDNS: true, interfaceTypes: ["wifi"], interfaces: [{ type: "wifi", name: "en0", index: 4 }] });
function mount(runtimeID = "network-test") {
  const owner = new AbortController(); let allowed = true; let entitlements = ["network.read"];
  const changes = new Set<() => void>(); let deliver = (_path: NetworkPathSnapshot) => {};
  const dispose = vi.fn(); const read = vi.fn(snapshot);
  const port = createMountedNetworkPort({ currentPath: read, subscribe: listener => { deliver = listener; return { dispose }; } }, owner.signal, () => entitlements, () => allowed, listener => { changes.add(listener); return () => { changes.delete(listener); }; });
  const context = { appId: "com.example.network", runtimeInfo: { id: runtimeID }, signal: owner.signal } as SynWareContextValue;
  associateNetworkPort(context, port);
  const session = { appId: context.appId, displayName: "Network", version: "1", context };
  const unregister = registerSCOSAppSession(session); cleanup.push(() => { owner.abort(); unregister(); });
  return { session, owner, read, dispose, unregister, deliver: (path = snapshot()) => deliver(path), access(value: boolean) { allowed = value; changes.forEach(fn => fn()); }, entitlements(value: string[]) { entitlements = value; changes.forEach(fn => fn()); } };
}
beforeEach(() => { vi.stubGlobal("scheduler", { postTask: (run: () => void) => { tasks.push(run); return Promise.resolve(); } }); });
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); flush(); vi.unstubAllGlobals(); });
describe("NetworkFX Apple monitor", () => {
  it("requires plugin attribution, reports absent/ambiguous sessions with NWError, keeps stable classes", () => {
    expect(() => new N.NWFXPathMonitor()).toThrow(/application bundle/);
    expect(App.NWFXPathMonitor).toBe(bindFXFamily(N, "COM.EXAMPLE.NETWORK").NWFXPathMonitor);
    expect(() => new App.NWFXPathMonitor()).toThrow(N.NWFXError);
    mount(); mount("other"); expect(() => new App.NWFXPathMonitor()).toThrow(/ambiguous/);
  });
  it("constructs passively then queues initial and changed paths on the exact selected queue", () => {
    const f = mount(); const monitor = new App.NWFXPathMonitor();
    expect(monitor).toBeInstanceOf(N.NWFXPathMonitor); expect(monitor).toBeInstanceOf(App.NWFXPathMonitor);
    expect(f.read).not.toHaveBeenCalled(); expect(monitor.queue).toBeNull(); expect(() => monitor.currentPath).toThrow(N.NWFXError);
    const calls: N.NWFXPath[] = []; monitor.pathUpdateHandler = path => { calls.push(path); expect(currentExecution()?.appId).toBe("com.example.network"); };
    const queue = dispatchQueueForSession(f.session).main; monitor.start(queue); expect(monitor.queue).toBe(queue); expect(calls).toHaveLength(0);
    flush(); expect(calls).toHaveLength(1); expect(calls[0]).toBe(monitor.currentPath); expect(calls[0]).toBeInstanceOf(N.NWFXPath);
    const path = calls[0]; expect(path.availableInterfaces[0]).toBeInstanceOf(N.NWFXInterface); expect(path.availableInterfaces[0]).toMatchObject({ type: "wifi", name: "en0", index: 4 });
    expect([path.supportsIPv4, path.supportsIPv6, path.supportsDNS, path.usesInterfaceType(N.NWFXInterfaceType.wifi)]).toEqual([true, false, true, true]);
    f.deliver({ ...snapshot(), status: "unsatisfied" }); flush(); expect(monitor.currentPath.status).toBe(N.NWFXPathStatus.unsatisfied);
    monitor.cancel(); monitor.cancel(); f.deliver(); flush(); expect(calls).toHaveLength(2); expect(f.dispose).toHaveBeenCalledOnce(); expect(() => monitor.start()).toThrow(N.NWFXError);
  });
  it.each([undefined, null] as const)("uses the selected main default even after a second runtime appears (%s)", defaultQueue => {
    const f = mount(); const monitor = new App.NWFXPathMonitor(); const main = dispatchQueueForSession(f.session).main;
    mount("other"); monitor.start(defaultQueue); expect(monitor.queue).toBe(main); flush();
  });
  it("filters required and prohibited types and never substitutes a transport observation", () => {
    mount(); const wifi = new App.NWFXPathMonitor(N.NWFXInterfaceType.wifi); const cellular = new App.NWFXPathMonitor(N.NWFXInterfaceType.cellular); const prohibited = new App.NWFXPathMonitor([N.NWFXInterfaceType.wifi]);
    wifi.start(); cellular.start(); prohibited.start(); flush();
    expect(wifi.currentPath.status).toBe("satisfied");
    for (const monitor of [cellular, prohibited]) { expect(monitor.currentPath.status).toBe("unsatisfied"); expect(monitor.currentPath.unsatisfiedReason).toBe("notAvailable"); expect(monitor.currentPath.availableInterfaces).toEqual([]); expect(monitor.currentPath.usesInterfaceType("wifi")).toBe(false); }
  });
  it("revocation invalidates both native callbacks and queued paths even after access restoration", () => {
    const f = mount(); const old = new App.NWFXPathMonitor(); const listener = vi.fn(); old.pathUpdateHandler = listener; old.start();
    f.access(false); expect(f.dispose).toHaveBeenCalledOnce(); f.access(true);
    const replacement = new App.NWFXPathMonitor(); replacement.pathUpdateHandler = listener; replacement.start(); flush(); expect(listener).toHaveBeenCalledOnce();
    expect(() => old.start()).toThrow(N.NWFXError); expect(() => old.currentPath).toThrow(N.NWFXError);
  });
  it("revokes an idle selected instance across an access loss and restoration", () => {
    const f = mount(); const monitor = new App.NWFXPathMonitor(); f.access(false); f.access(true); expect(() => monitor.start()).toThrow(N.NWFXError);
  });
  it.each(["abort", "unregister"] as const)("terminates native resources and queued work on %s and cannot rebind", mode => {
    const f = mount(); const monitor = new App.NWFXPathMonitor(); const listener = vi.fn(); monitor.pathUpdateHandler = listener; monitor.start();
    if (mode === "abort") f.owner.abort(); else f.unregister();
    f.deliver(); flush(); expect(listener).not.toHaveBeenCalled(); expect(f.dispose).toHaveBeenCalledOnce(); mount(); expect(() => monitor.start()).toThrow(N.NWFXError);
  });
  it("enforces entitlement and host denial before reading observations", () => {
    const f = mount(); f.entitlements([]); expect(() => new App.NWFXPathMonitor()).toThrow(/network.read/); expect(f.read).not.toHaveBeenCalled();
    f.entitlements(["network.read"]); f.access(false); expect(() => new App.NWFXPathMonitor()).toThrow(N.NWFXError); expect(f.read).not.toHaveBeenCalled();
  });
  it("checks access at queued delivery and cancels on a queued cancellation", () => {
    const f = mount(); const monitor = new App.NWFXPathMonitor(); const listener = vi.fn(); monitor.pathUpdateHandler = listener; monitor.start(); monitor.cancel(); flush(); expect(listener).not.toHaveBeenCalled();
  });
  it("fails terminally if filtered transport becomes unobservable and drops older queued paths", () => {
    const f = mount(); const monitor = new App.NWFXPathMonitor("wifi"); const listener = vi.fn(); monitor.pathUpdateHandler = listener; monitor.start();
    expect(() => f.deliver({ status: "satisfied" })).toThrow(N.NWFXError); expect(f.dispose).toHaveBeenCalledOnce(); flush(); expect(listener).not.toHaveBeenCalled(); expect(() => monitor.start()).toThrow(N.NWFXError);
  });
  it("rejects an unknown interface filter without acquiring browser observations", () => {
    const f = mount(); expect(() => new App.NWFXPathMonitor("bogus" as N.NWFXInterfaceType)).toThrow(N.NWFXError); expect(f.read).not.toHaveBeenCalled();
  });

});
