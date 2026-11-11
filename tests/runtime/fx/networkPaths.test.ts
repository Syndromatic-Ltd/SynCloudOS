import { describe, expect, it, vi } from "vitest";
import { BrowserNetworkPathAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserNetworkPathAdapter";
import { createNetworkPath } from "../../../src/FX/NetworkFX/internal/pathValues";
import { NWFXError } from "../../../src/FX/NetworkFX/public";
function fixture(info = false) {
  const target = new EventTarget();
  const connection = Object.assign(new EventTarget(), { effectiveType: "2g", downlink: 0.2, rtt: 900, saveData: true, type: undefined as string | undefined, metered: undefined as boolean | undefined });
  const navigator = { onLine: true, ...(info ? { connection } : {}) };
  const adapter = new BrowserNetworkPathAdapter({ navigator, eventTarget: target });
  return { target, connection, navigator, adapter };
}
describe("NetworkFX browser observations", () => {
  it("reports unavailable observation with NWError without a browser", () => {
    const adapter = new BrowserNetworkPathAdapter({}); expect(() => adapter.currentPath()).toThrow(NWFXError); expect(() => adapter.subscribe(() => {})).toThrow(NWFXError);
  });
  it("maps Save-Data but does not infer transports, cost, routing, DNS, reasons or interface enumeration", () => {
    const { adapter } = fixture(true); const path = createNetworkPath(adapter.currentPath());
    expect(path.status).toBe("satisfied"); expect(path.isConstrained).toBe(true);
    for (const read of [() => path.supportsIPv4, () => path.supportsIPv6, () => path.supportsDNS, () => path.isExpensive, () => path.unsatisfiedReason, () => path.availableInterfaces, () => path.usesInterfaceType("cellular")]) expect(read).toThrow(NWFXError);
    for (const name of ["effectiveType", "saveData", "source", "interfaceType", "downlinkMegabitsPerSecond", "roundTripTimeMilliseconds"]) expect(name in path).toBe(false);
  });
  it("uses actual cellular and metered observations for expensive and transport", () => {
    const f = fixture(true); f.connection.type = "cellular";
    const cellular = createNetworkPath(f.adapter.currentPath()); expect(cellular.isExpensive).toBe(true); expect(cellular.usesInterfaceType("cellular")).toBe(true); expect(() => cellular.availableInterfaces).toThrow(NWFXError);
    f.connection.type = "wifi"; f.connection.metered = false; expect(createNetworkPath(f.adapter.currentPath()).isExpensive).toBe(false);
    f.connection.metered = true; expect(createNetworkPath(f.adapter.currentPath()).isExpensive).toBe(true);
  });
  it("delivers online/offline and connection changes and disposes browser listeners once", () => {
    const f = fixture(true); const removeWindow = vi.spyOn(f.target, "removeEventListener"); const removeInfo = vi.spyOn(f.connection, "removeEventListener"); const listener = vi.fn(); const subscription = f.adapter.subscribe(listener);
    f.navigator.onLine = false; f.target.dispatchEvent(new Event("offline")); expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: "unsatisfied" }));
    f.connection.saveData = false; f.connection.dispatchEvent(new Event("change")); expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ isConstrained: false }));
    subscription.dispose(); subscription.dispose(); f.target.dispatchEvent(new Event("online")); expect(listener).toHaveBeenCalledTimes(2); expect(removeWindow).toHaveBeenCalledTimes(2); expect(removeInfo).toHaveBeenCalledOnce();
  });
});
