import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as B from "../../../src/FX/BluetoothFX/public";
import { NSEData } from "../../../src/Foundation/public";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";
import { registerSCOSAppSession, scosSessionsForApp } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
import { createPrivacyStore } from "../../../src/SynCloudOS/Privacy";
import { dispatchQueueForSession } from "../../../src/FX/DispatchFX/internal/sessionBinding";
const cleanups: (() => void)[] = []; const jobs: (() => void)[] = [];
export const ticks = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); }; const flush = () => { while (jobs.length) jobs.shift()!(); };
async function fixture() {
  expect(Reflect.get(B, "BTFXCentralManager")).toBeTypeOf("function");
  const { associateBluetoothPort } = await import("../../../src/FX/BluetoothFX/internal/bluetoothPort"); const { createMountedBluetoothPort } = await import("../../../src/SynCloudOS/AppSDK/mountedBluetoothPort"); const { NSEUUID } = await import("../../../src/Foundation/public");
  const owner = new AbortController(); let allowed = true; let entitlements = ["bluetooth.access"]; const listeners = new Set<() => void>();
  const privacy = createPrivacyStore({ runtimeId: "bluetooth" }); const scope = { userId: "u", appId: "com.example.bluetooth", service: "bluetooth" };
  let notification: ((value: NSEData) => void) | undefined;
  const descriptor = { uuid: new B.BTFXUUID("2901"), read: vi.fn(async () => "Sensor"), write: vi.fn(async (_value: NSEData) => {}) };
  const characteristic = { uuid: new B.BTFXUUID("2A19"), properties: B.BTFXCharacteristicProperties.read | B.BTFXCharacteristicProperties.write | B.BTFXCharacteristicProperties.notify,
    read: vi.fn(async () => NSEData.from(new Uint8Array([42]))), write: vi.fn(async (_value: NSEData, _type: B.BTFXCharacteristicWriteType) => {}), discoverDescriptors: vi.fn(async () => [descriptor]), setNotify: vi.fn(async (_enabled: boolean, receive: (data: NSEData) => void) => { notification = receive; }) };
  const service = { uuid: new B.BTFXUUID("180F"), isPrimary: true, discoverCharacteristics: vi.fn(async () => [characteristic]) };
  const connection = { discoverServices: vi.fn(async () => [service]), disconnect: vi.fn(async () => {}) };
  const disconnections: ((error: unknown | null) => void)[] = [];
  const device = { identifier: new NSEUUID(), name: "Sensor", connect: vi.fn(async (_signal: AbortSignal, disconnected: (error: unknown | null) => void) => { disconnections.push(disconnected); return connection; }) };
  const scan = vi.fn(async () => ({ device, advertisementData: Object.freeze({}), rssi: 127 }));
  const port = createMountedBluetoothPort({ state: "poweredOn", scan }, owner.signal, () => entitlements, () => allowed, privacy.forApplication({ ...scope, signal: owner.signal }), listener => { listeners.add(listener); const releasePrivacy = privacy.subscribe(listener); return () => { listeners.delete(listener); releasePrivacy(); }; });
  const context = { appId: scope.appId, runtimeInfo: { id: "bluetooth" }, signal: owner.signal } as SynWareContextValue; associateBluetoothPort(context, port);
  const unregister = registerSCOSAppSession({ appId: scope.appId, displayName: "Bluetooth", version: "1", context }); cleanups.push(() => { owner.abort(); unregister(); privacy.dispose(); });
  const App = bindFXFamily(B, scope.appId); const discovered = vi.fn(); const connected = vi.fn(); const failed = vi.fn(); const disconnected = vi.fn(); const state = vi.fn(); const received = vi.fn();
  const central = new App.BTFXCentralManager({ centralManagerDidUpdateState: state, centralManagerDidDiscoverPeripheral: discovered, centralManagerDidConnectPeripheral: connected, centralManagerDidFailToConnectPeripheral: failed, centralManagerDidDisconnectPeripheral: disconnected });
  const discover = async () => { central.scanForPeripherals([new B.BTFXUUID("180F")]); await ticks(); flush(); return discovered.mock.calls.at(-1)![1] as B.BTFXPeripheral; };
  const connect = async () => { const peripheral = await discover(); central.connect(peripheral); await ticks(); flush(); return peripheral; };
  const ready = async () => { const peripheral = await connect(); peripheral.delegate = { peripheralDidDiscoverServices: received, peripheralDidDiscoverCharacteristicsForService: received, peripheralDidDiscoverDescriptorsForCharacteristic: received, peripheralDidUpdateValueForCharacteristic: received, peripheralDidUpdateValueForDescriptor: received, peripheralDidWriteValueForCharacteristic: received, peripheralDidWriteValueForDescriptor: received, peripheralDidUpdateNotificationStateForCharacteristic: received, peripheralDidReadRSSI: received }; peripheral.discoverServices(null); await ticks(); flush(); const s = peripheral.services![0]!; peripheral.discoverCharacteristics(null, s); await ticks(); flush(); const c = s.characteristics![0]!; peripheral.discoverDescriptors(c); await ticks(); flush(); received.mockClear(); return { peripheral, s, c, d: c.descriptors![0]! }; };
  return { App, central, discover, connect, ready, disconnections, state, received, discovered, connected, failed, disconnected, device, connection, service, characteristic, descriptor, scan, owner, context, port, scope, privacy, unregister, notify: () => notification?.(NSEData.from(new Uint8Array([9]))), access(value: boolean) { allowed = value; listeners.forEach(listener => listener()); }, entitlements(value: string[]) { entitlements = value; listeners.forEach(listener => listener()); } };
}
beforeEach(() => vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } }));
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); flush(); vi.unstubAllGlobals(); });
it("runs the exact central/peripheral/service/characteristic/descriptor delegate flow", async () => {
  const f = await fixture(); expect(() => new B.BTFXCentralManager()).toThrow(/application bundle/); expect(f.central).toBeInstanceOf(B.BTFXManager); expect(f.privacy.getSnapshot()).toEqual([]); expect(f.App.BTFXManager.authorization).toBe("notDetermined"); expect(f.state).not.toHaveBeenCalled(); flush(); expect(f.state).toHaveBeenCalledWith(f.central); expect(f.central.state).toBe("poweredOn");
  const { peripheral: p, s, c, d } = await f.ready(); expect(p).toBeInstanceOf(B.BTFXPeripheral); expect(s).toBeInstanceOf(B.BTFXAttribute); expect(c).toBeInstanceOf(B.BTFXCharacteristic); expect(d.characteristic).toBe(c); expect(c.service).toBe(s); expect(s.peripheral).toBe(p); expect(f.discovered).toHaveBeenCalledWith(f.central, p, {}, 127); expect(f.connected).toHaveBeenCalledWith(f.central, p); expect(p.state).toBe("connected"); expect(f.App.BTFXCentralManager.authorization).toBe("allowedAlways"); expect(f.central.retrievePeripherals([p.identifier])).toEqual([p]);
  expect(p.readValue(c)).toBeUndefined(); expect(p.readValue(d)).toBeUndefined(); await ticks(); expect(f.received).not.toHaveBeenCalled(); flush(); expect(c.value?.bytes).toEqual(new Uint8Array([42])); expect(d.value).toBe("Sensor"); expect(f.received).toHaveBeenCalledWith(p, c, null); expect(f.received).toHaveBeenCalledWith(p, d, null);
  f.received.mockClear(); p.writeValue(NSEData.from(new Uint8Array([5])), c, "withResponse"); p.writeValue(NSEData.from(new Uint8Array([6])), d); p.setNotifyValue(true, c); await ticks(); flush(); expect(f.received).toHaveBeenCalledWith(p, c, null); expect(f.received).toHaveBeenCalledWith(p, d, null); expect(c.isNotifying).toBe(true); f.notify(); flush(); expect(c.value?.bytes).toEqual(new Uint8Array([9]));
  f.received.mockClear(); p.readRSSI(); flush(); expect(f.received).toHaveBeenCalledWith(p, 127, expect.objectContaining({ code: "operationNotSupported" })); expect(() => p.maximumWriteValueLength("withResponse")).toThrow(expect.objectContaining({ code: "operationNotSupported" })); expect(() => f.central.retrieveConnectedPeripherals([s.uuid])).toThrow(expect.objectContaining({ code: "operationNotSupported" }));
  f.central.cancelPeripheralConnection(p); await ticks(); flush(); expect(p.state).toBe("disconnected"); expect(f.connection.disconnect).toHaveBeenCalledOnce(); expect(f.disconnected).toHaveBeenCalledWith(f.central, p, null);
});
it.each(["scan", "connect", "services", "characteristics", "descriptors", "read", "write", "descriptorRead", "descriptorWrite", "notify", "disconnect"])("native %s denial overrides saved consent before conversion", async boundary => {
  const f = await fixture(); const { peripheral: p, s, c, d } = await f.ready(); f.privacy.setAuthorization(f.scope, "granted"); const denied = () => { throw new DOMException("Denied", "SecurityError"); };
  if (boundary === "scan") f.scan.mockImplementationOnce(denied); if (boundary === "connect") { f.central.cancelPeripheralConnection(p); await ticks(); flush(); f.device.connect.mockImplementationOnce(denied); }
  const invoke = () => { switch(boundary) { case "scan": return f.central.scanForPeripherals(null); case "connect": return f.central.connect(p); case "services": f.connection.discoverServices.mockImplementationOnce(denied); return p.discoverServices(null); case "characteristics": f.service.discoverCharacteristics.mockImplementationOnce(denied); return p.discoverCharacteristics(null,s); case "descriptors": f.characteristic.discoverDescriptors.mockImplementationOnce(denied); return p.discoverDescriptors(c); case "read": f.characteristic.read.mockImplementationOnce(denied); return p.readValue(c); case "write": f.characteristic.write.mockImplementationOnce(denied); return p.writeValue(NSEData.from(new Uint8Array([1])),c,"withResponse"); case "descriptorRead": f.descriptor.read.mockImplementationOnce(denied); return p.readValue(d); case "descriptorWrite": f.descriptor.write.mockImplementationOnce(denied); return p.writeValue(NSEData.from(new Uint8Array([1])),d); case "notify": f.characteristic.setNotify.mockImplementationOnce(denied); return p.setNotifyValue(true,c); case "disconnect": f.connection.disconnect.mockImplementationOnce(denied); return f.central.cancelPeripheralConnection(p); } };
  f.received.mockClear(); f.disconnected.mockClear(); invoke(); await ticks(); flush(); expect(f.privacy.getSnapshot()[0]).toMatchObject({ browserStatus: "denied", authorizationStatus: "denied" }); expect(f.App.BTFXManager.authorization).toBe("denied"); expect(f.received).not.toHaveBeenCalled(); expect(f.disconnected).not.toHaveBeenCalled();
});
it.each(["revoke", "policy", "entitlement", "unregister", "teardown"])("ends the exact instance on %s before its first native operation and queued state delivery", async reason => {
  const f = await fixture(); if (reason === "revoke") { f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope,"granted"); } else if(reason === "policy") { f.access(false); f.access(true); } else if(reason === "entitlement") { f.entitlements([]); f.entitlements(["bluetooth.access"]); } else if(reason === "unregister") f.unregister(); else f.owner.abort(); flush(); expect(f.state).not.toHaveBeenCalled(); expect(() => f.central.scanForPeripherals(null)).toThrow(B.BTFXError); expect(f.scan).not.toHaveBeenCalled();
});
it("drops queued native values after revoke/regrant and keeps old peripheral handles terminal", async () => { const f = await fixture(); const {peripheral:p,c} = await f.ready(); p.readValue(c); await ticks(); f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope,"granted"); const next = new f.App.BTFXCentralManager(); flush(); expect(f.received).not.toHaveBeenCalled(); expect(c.value).toBeNull(); expect(() => p.readValue(c)).toThrow(B.BTFXError); expect(next.state).toBe("poweredOn"); });
it("closes only a late old connection after revoke/regrant and replacement connection", async () => { const f = await fixture(); const p = await f.discover(); let resolve!: (value: typeof f.connection) => void; f.device.connect.mockImplementationOnce(() => new Promise(done => {resolve=done;})); f.central.connect(p); f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope,"granted"); const discovered = vi.fn(); const next = new f.App.BTFXCentralManager({centralManagerDidUpdateState(){},centralManagerDidDiscoverPeripheral:discovered}); next.scanForPeripherals(null); await ticks(); flush(); const fresh={discoverServices:vi.fn(async()=>[]),disconnect:vi.fn(async()=>{})}; f.device.connect.mockResolvedValueOnce(fresh); next.connect(discovered.mock.calls[0]![1]); await ticks(); flush(); resolve(f.connection); await ticks(); flush(); expect(f.connection.disconnect).toHaveBeenCalledOnce(); expect(fresh.disconnect).not.toHaveBeenCalled(); expect(f.connected).not.toHaveBeenCalled(); });
it("keeps the selected default Dispatch queue after another session appears and supports explicit queue suspension", async()=>{ const f=await fixture(); const Queue=dispatchQueueForSession(scosSessionsForApp(f.scope.appId)[0]!); const queue=new Queue("bt-explicit"); queue.suspend(); const state=vi.fn(); const manager=new f.App.BTFXCentralManager({centralManagerDidUpdateState:state},queue); const other=await fixture(); flush(); expect(f.state).toHaveBeenCalledWith(f.central); expect(state).not.toHaveBeenCalled(); queue.resume(); flush(); expect(state).toHaveBeenCalledWith(manager); expect(other.scan).not.toHaveBeenCalled(); });

it.each(["scan","connect","services","characteristics","descriptors","read","write","descriptorRead","descriptorWrite","notify","disconnect"].flatMap(boundary=>["resolve","reject"].map(outcome=>({boundary,outcome}))))("drops old pending $boundary $outcome after revoke/regrant and replacement without poisoning it",async ({boundary,outcome})=>{
 const f=await fixture();const {peripheral:p,s,c,d}=await f.ready();let reject!:(error:unknown)=>void;let resolve!:(value:unknown)=>void;const pending=()=>new Promise<never>((done,fail)=>{reject=fail;resolve=value=>done(value as never);});
 switch(boundary){case "scan":f.scan.mockImplementationOnce(pending);f.central.scanForPeripherals(null);break;case "connect":f.central.cancelPeripheralConnection(p);await ticks();flush();f.device.connect.mockImplementationOnce(pending);f.central.connect(p);break;case "services":f.connection.discoverServices.mockImplementationOnce(pending);p.discoverServices(null);break;case "characteristics":f.service.discoverCharacteristics.mockImplementationOnce(pending);p.discoverCharacteristics(null,s);break;case "descriptors":f.characteristic.discoverDescriptors.mockImplementationOnce(pending);p.discoverDescriptors(c);break;case "read":f.characteristic.read.mockImplementationOnce(pending);p.readValue(c);break;case "write":f.characteristic.write.mockImplementationOnce(pending);p.writeValue(NSEData.from(new Uint8Array([1])),c,"withResponse");break;case "descriptorRead":f.descriptor.read.mockImplementationOnce(pending);p.readValue(d);break;case "descriptorWrite":f.descriptor.write.mockImplementationOnce(pending);p.writeValue(NSEData.from(new Uint8Array([1])),d);break;case "notify":f.characteristic.setNotify.mockImplementationOnce(pending);p.setNotifyValue(true,c);break;case "disconnect":f.connection.disconnect.mockImplementationOnce(pending);f.central.cancelPeripheralConnection(p);break;}
 f.received.mockClear();f.disconnected.mockClear();f.privacy.revoke(f.scope);f.privacy.setAuthorization(f.scope,"granted");const next=new f.App.BTFXCentralManager();next.scanForPeripherals(null);await ticks();if(outcome==="reject")reject(new DOMException("Stale native refusal","SecurityError"));else resolve(({scan:{device:f.device,advertisementData:{},rssi:127},connect:f.connection,services:[f.service],characteristics:[f.characteristic],descriptors:[f.descriptor],read:NSEData.from(new Uint8Array([7])),descriptorRead:"old"} as Record<string,unknown>)[boundary]);await ticks();flush();expect(f.App.BTFXManager.authorization).toBe("allowedAlways");expect(next.state).toBe("poweredOn");expect(f.received).not.toHaveBeenCalled();expect(f.disconnected).not.toHaveBeenCalled();expect(()=>f.central.scanForPeripherals(null)).toThrow(B.BTFXError);
});
it("owns each lifetime subscription once and releases it once on unregister",async()=>{const f=await fixture();const {associateBluetoothPort}=await import("../../../src/FX/BluetoothFX/internal/bluetoothPort");const {bluetoothManagers}=await import("../../../src/FX/BluetoothFX/internal/bluetoothBindings");const releases:ReturnType<typeof vi.fn>[]=[];associateBluetoothPort(f.context,{...f.port,observeAccessLoss(listener){const release=vi.fn(f.port.observeAccessLoss(listener));releases.push(release);return release;}});const central=new f.App.BTFXCentralManager();central.scanForPeripherals(null);await ticks();flush();expect(releases).toHaveLength(1);f.unregister();expect(releases[0]).toHaveBeenCalledOnce();bluetoothManagers.get(central)!.dispose();f.owner.abort();expect(releases[0]).toHaveBeenCalledOnce();});
it("does not enumerate browser origin grants before this application's consent",async()=>{const f=await fixture();expect(()=>f.central.retrievePeripherals([])).toThrow(B.BTFXError);expect(f.scan).not.toHaveBeenCalled();expect(f.privacy.getSnapshot()).toEqual([]);const p=await f.discover();expect(f.central.retrievePeripherals([p.identifier])).toEqual([p]);});
it("rejects missing launch entitlement and does not contact hardware",async()=>{const f=await fixture();f.entitlements([]);const central=new f.App.BTFXCentralManager();expect(central.state).toBe("unauthorized");expect(f.App.BTFXManager.authorization).toBe("restricted");expect(()=>central.scanForPeripherals(null)).toThrow(B.BTFXError);expect(f.scan).not.toHaveBeenCalled();});
it("drops queued unsupported RSSI and included-service failures irrevocably after regrant",async()=>{const f=await fixture();const {peripheral:p,s}=await f.ready();p.readRSSI();p.discoverIncludedServices(null,s);f.privacy.revoke(f.scope);f.privacy.setAuthorization(f.scope,"granted");flush();expect(f.received).not.toHaveBeenCalled();});
it("canceling a pending connection drops a late handle while an independent new manager stays connected",async()=>{const f=await fixture();const p=await f.discover();let resolve!:(value:typeof f.connection)=>void;f.device.connect.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));f.central.connect(p);f.central.cancelPeripheralConnection(p);const fresh={discoverServices:vi.fn(async()=>[]),disconnect:vi.fn(async()=>{})};f.device.connect.mockResolvedValueOnce(fresh);f.central.connect(p);await ticks();flush();resolve(f.connection);await ticks();flush();expect(f.connection.disconnect).toHaveBeenCalledOnce();expect(fresh.disconnect).not.toHaveBeenCalled();expect(p.state).toBe("connected");});

it("keeps the constructor state callback when a scan grants consent before the queue drains",async()=>{const f=await fixture();f.central.scanForPeripherals(null);await ticks();flush();expect(f.state).toHaveBeenCalledOnce();expect(f.state).toHaveBeenCalledWith(f.central);});

it("retires a denied-constructed central across grant/revoke/regrant without a native operation", async () => {
  const f = await fixture();
  f.privacy.revoke(f.scope);
  const state = vi.fn();
  const central = new f.App.BTFXCentralManager({ centralManagerDidUpdateState: state });
  expect(central.state).toBe("unauthorized");
  f.privacy.setAuthorization(f.scope, "granted");
  f.privacy.revoke(f.scope);
  f.privacy.setAuthorization(f.scope, "granted");
  flush();
  expect(state).not.toHaveBeenCalled();
  expect(() => central.scanForPeripherals(null)).toThrow(B.BTFXError);
  expect(f.scan).not.toHaveBeenCalled();
  expect(new f.App.BTFXCentralManager().state).toBe("poweredOn");
});
it("drops a queued spontaneous disconnect after reconnecting the same peripheral", async () => {
  const f = await fixture();
  const p = await f.connect();
  const queue = dispatchQueueForSession(scosSessionsForApp(f.scope.appId)[0]!).main;
  queue.suspend();
  f.disconnections[0]!(null);
  expect(p.state).toBe("disconnected");
  f.central.connect(p);
  await ticks();
  expect(p.state).toBe("connected");
  queue.resume();
  flush();
  expect(f.disconnected).not.toHaveBeenCalled();
  expect(f.connected).toHaveBeenCalledTimes(2);
});
it.each(["explicit", "spontaneous"])("retires notification flags and old updates on %s disconnect without altering a replacement", async reason => {
  const f = await fixture();
  const { peripheral: p, c } = await f.ready();
  p.setNotifyValue(true, c);
  await ticks(); flush();
  expect(c.isNotifying).toBe(true);
  const oldReceive = f.characteristic.setNotify.mock.calls.at(-1)![1];
  // Retained notification objects must retire even after services are rediscovered.
  p.discoverServices(null);
  await ticks(); flush();
  if (reason === "explicit") f.central.cancelPeripheralConnection(p);
  else f.disconnections[0]!(null);
  await ticks(); flush();
  expect(c.isNotifying).toBe(false);
  f.central.connect(p);
  await ticks(); flush();
  p.discoverServices(null);
  await ticks(); flush();
  p.discoverCharacteristics(null, p.services![0]!);
  await ticks(); flush();
  const replacement = p.services![0]!.characteristics![0]!;
  p.setNotifyValue(true, replacement);
  await ticks(); flush();
  f.received.mockClear();
  oldReceive(NSEData.from(new Uint8Array([99])));
  flush();
  expect(c.isNotifying).toBe(false);
  expect(replacement.isNotifying).toBe(true);
  expect(f.received).not.toHaveBeenCalled();
  f.notify(); flush();
  expect(replacement.value?.bytes).toEqual(new Uint8Array([9]));
});

it.each([false, true])("delivers the current state after denied construction becomes granted (initial state drained: %s)", async drainInitial => {
  const f = await fixture();
  f.privacy.revoke(f.scope);
  const states: B.BTFXManagerState[] = [];
  const central = new f.App.BTFXCentralManager({ centralManagerDidUpdateState(sender) { states.push(sender.state); } });
  if (drainInitial) { flush(); expect(states).toEqual(["unauthorized"]); }
  f.privacy.setAuthorization(f.scope, "granted");
  flush();
  expect(states).toEqual(drainInitial ? ["unauthorized", "poweredOn"] : ["poweredOn"]);
  expect(central.state).toBe("poweredOn");
  expect(f.scan).not.toHaveBeenCalled();
});
