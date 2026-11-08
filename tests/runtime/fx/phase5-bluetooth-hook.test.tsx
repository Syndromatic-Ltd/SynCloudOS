// @vitest-environment jsdom
import React,{StrictMode,useLayoutEffect} from "react";
import {render,cleanup} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {useBluetooth} from "../../../src/SynCloudOS/AppSDK/hooks/useBluetooth";
import * as B from "../../../src/FX/BluetoothFX/public";
import {NSEUUID} from "../../../src/Foundation/public";
import {associateBluetoothPort} from "../../../src/FX/BluetoothFX/internal/bluetoothPort";
import {createMountedBluetoothPort} from "../../../src/SynCloudOS/AppSDK/mountedBluetoothPort";
import {registerSCOSAppSession} from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type {SynWareContextValue} from "../../../src/SynCloudOS/AppSDK/appContextTypes";
const selection=vi.hoisted(()=>({context:null as unknown}));
vi.mock("../../../src/SynCloudOS/AppSDK/SynWareContext",()=>({useSynWareContext:()=>selection.context}));
vi.mock("../../../src/SynCloudOS/AppSDK/scos/useSCOS",()=>({useSCOS:()=>({bluetooth:{createCentralManager:()=>({dispose(){}})}})}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("returns a real central for a branding clone, survives StrictMode and drops delivery on true unmount",async()=>{
 const jobs:(()=>void)[]=[];vi.stubGlobal("scheduler",{postTask:(job:()=>void)=>{jobs.push(job);return Promise.resolve();}});const owner=new AbortController();const received=vi.fn();const scan=vi.fn(async()=>({device:{identifier:new NSEUUID(),name:"Sensor",connect:async()=>({discoverServices:async()=>[],disconnect:async()=>{}})},advertisementData:{},rssi:127}));
 const context={appId:"com.example.bluetooth-hook",runtimeInfo:{id:"duplicate"},signal:owner.signal} as SynWareContextValue;selection.context={...context};associateBluetoothPort(context,createMountedBluetoothPort({state:"poweredOn",scan},owner.signal,()=>["bluetooth.access"],()=>true));const unregister=registerSCOSAppSession({appId:context.appId,displayName:"Hook",version:"1",context});const other=registerSCOSAppSession({appId:context.appId,displayName:"Other",version:"1",context:{...context,signal:new AbortController().signal}});
 try{let held!:B.BTFXCentralManager;let setups=0;const delegate={centralManagerDidUpdateState:received,centralManagerDidDiscoverPeripheral:received};function Probe(){held=useBluetooth(delegate);useLayoutEffect(()=>{setups++;},[]);return null;}const view=render(<StrictMode><Probe/></StrictMode>);expect(setups).toBe(2);expect(held).toBeInstanceOf(B.BTFXCentralManager);expect(scan).not.toHaveBeenCalled();const original=held;view.rerender(<StrictMode><Probe/></StrictMode>);expect(held).toBe(original);while(jobs.length)jobs.shift()!();expect(received).toHaveBeenCalledTimes(1);received.mockClear();held.scanForPeripherals(null);view.unmount();for(let i=0;i<40;i++)await Promise.resolve();while(jobs.length)jobs.shift()!();expect(received).not.toHaveBeenCalled();expect(()=>held.scanForPeripherals(null)).toThrow(B.BTFXError);}finally{owner.abort();unregister();other();}
});
it("rejects duplicate exact sessions even if configured runtime IDs are identical",()=>{const owner=new AbortController();const context={appId:"com.example.bluetooth-ambiguous",runtimeInfo:{id:"duplicate"},signal:owner.signal} as SynWareContextValue;selection.context={...context};const a=registerSCOSAppSession({appId:context.appId,displayName:"A",version:"1",context}),b=registerSCOSAppSession({appId:context.appId,displayName:"B",version:"1",context:{...context}});function Probe(){useBluetooth();return null;}try{expect(()=>render(<Probe/>)).toThrow(/ambiguous/);}finally{owner.abort();a();b();}});
