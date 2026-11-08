/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom
import React, { StrictMode, Suspense, useLayoutEffect } from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useContacts } from "../../../src/SynCloudOS/AppSDK/hooks/useContacts";
import { CNFXContactStore } from "../../../src/FX/ContactsFX/public";
import { associateContactsPort } from "../../../src/FX/ContactsFX/internal/contactsPort";
import { createMountedContactsPort } from "../../../src/SynCloudOS/AppSDK/mountedContactsPort";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
const selection=vi.hoisted(()=>({context:null as unknown}));
vi.mock("../../../src/SynCloudOS/AppSDK/SynWareContext",()=>({useSynWareContext:()=>selection.context}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("retains a real per-app store through StrictMode replay and drops queued work on true unmount",()=>{
 const jobs:(()=>void)[]=[];vi.stubGlobal("scheduler",{postTask:(job:()=>void)=>{jobs.push(job);return Promise.resolve();}});
 const owner=new AbortController();const select=vi.fn(async()=>[]);const context={appId:"com.example.contacts-hook",runtimeInfo:{id:"hook"},signal:owner.signal} as SynWareContextValue;selection.context={...context};associateContactsPort(context,createMountedContactsPort({available:true,select},owner.signal,()=>["contacts.select"],()=>true));
 const unregister=registerSCOSAppSession({appId:context.appId,displayName:"Hook",version:"1",context});const other=registerSCOSAppSession({appId:context.appId,displayName:"Other",version:"1",context:{...context,signal:new AbortController().signal}});
 try{let held!:CNFXContactStore;let setups=0;const received=vi.fn();function Probe(){held=useContacts();useLayoutEffect(()=>{setups++;},[]);return null;}
 const view=render(<StrictMode><Probe/></StrictMode>);expect(setups).toBe(2);expect(held).toBeInstanceOf(CNFXContactStore);held.requestAccess("contacts",received);while(jobs.length)jobs.shift()!();expect(received).toHaveBeenCalledOnce();held.requestAccess("contacts",received);view.unmount();while(jobs.length)jobs.shift()!();expect(received).toHaveBeenCalledOnce();expect(()=>held.requestAccess("contacts",received)).toThrow();
 const pending=new Promise(()=>{});function Suspended():React.ReactNode{useContacts();throw pending;}render(<StrictMode><Suspense fallback={null}><Suspended/></Suspense></StrictMode>);expect(select).not.toHaveBeenCalled();
 }finally{owner.abort();unregister();other();}
});
it("rejects ambiguous exact mount aliases",()=>{const owner=new AbortController();const context={appId:"com.example.ambiguous-contacts",runtimeInfo:{id:"duplicate"},signal:owner.signal} as SynWareContextValue;selection.context={...context};const a=registerSCOSAppSession({appId:context.appId,displayName:"A",version:"1",context});const b=registerSCOSAppSession({appId:context.appId,displayName:"B",version:"1",context:{...context}});function Probe(){useContacts();return null;}try{expect(()=>render(<Probe/>)).toThrow(/ambiguous/);}finally{owner.abort();a();b();}});
