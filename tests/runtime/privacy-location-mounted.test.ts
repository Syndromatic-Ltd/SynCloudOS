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

import { expect, it, vi } from "vitest";
import { createPrivacyStore } from "../../src/SynCloudOS/Privacy";
import { LocationService } from "../../src/SynCloudOS/LocationFX/LocationService";
import { createMountedLocationClient } from "../../src/SynCloudOS/AppSDK/mountedLocationClient";
import { LFXLocation, LFXCoordinate } from "../../src/FX/LocationFX/public";
const fix = new LFXLocation({ coordinate:new LFXCoordinate(53,-2), observedAtUnixMilliseconds:1,receivedAtMonotonicSeconds:1,horizontalAccuracyMetres:1,altitudeMetres:null,altitudeAccuracyMetres:null,speedMetresPerSecond:null,courseRadians:null });
function fixture() {
 const store=createPrivacyStore({runtimeId:"privacy-location"});
 const scope={appId:"com.example.location",userId:"visitor",service:"location"};
 const owner=new AbortController();
 let deliver:((location:LFXLocation)=>void)|undefined;
 const stop=vi.fn();
 const current=vi.fn(async()=>fix);
 const service=new LocationService({getAuthorizationStatus:async()=>"granted",current,watch(options,listener){deliver=listener;options.signal.addEventListener("abort",stop,{once:true});return{dispose:stop};},nowMonotonicSeconds:()=>1});
 const client=createMountedLocationClient(service,owner.signal,()=>["location.read","location.request"],()=>true,scope.appId,undefined,store.forApplication({...scope,signal:owner.signal}));
 return {store,scope,owner,client,current,stop,emit:()=>deliver?.(fix)};
}
it("reports origin grants as prompt until this app explicitly requests",async()=>{
 const f=fixture(),manager=f.client.createManager();
 expect(await manager.getAuthorizationStatus()).toBe("prompt");
 expect(f.current).not.toHaveBeenCalled();
 await manager.current();
 expect(await manager.getAuthorizationStatus()).toBe("granted");
 expect(f.store.getSnapshot()[0]).toMatchObject({appId:f.scope.appId,decision:"granted"});
});
it("blocks a locally denied request before device access",async()=>{
 const f=fixture(),manager=f.client.createManager();f.store.revoke(f.scope);
 await expect(manager.current()).rejects.toMatchObject({name:expect.stringMatching(/NotAllowedError|AbortError/)});
 expect(f.current).not.toHaveBeenCalled();
});
it("revokes a live watch before it can deliver another fix",async()=>{
 const f=fixture(),manager=f.client.createManager();let fixes=0;
 manager.watch({accuracy:"balanced"},()=>{fixes++;});f.emit();expect(fixes).toBe(1);
 f.store.revoke(f.scope);f.emit();expect(fixes).toBe(1);expect(f.stop).toHaveBeenCalled();
});
