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
import { VideoCaptureService } from "../../src/SynCloudOS/VideoFX/VideoCaptureService";
import { createMountedVideoClient } from "../../src/SynCloudOS/AppSDK/mountedVideoClient";
import { AUFXAudioSession } from "../../src/FX/AudioFX/AUFXAudioSession";
import { createMountedAudioSessions } from "../../src/SynCloudOS/AppSDK/mountedAudioSessions";
const scope={userId:"visitor",appId:"com.example.capture",service:"camera"};
it("combines passive camera status with app consent and revokes the live session",async()=>{
 const privacy=createPrivacyStore({runtimeId:"capture"}),port=privacy.forApplication(scope);
 const request=vi.fn(async()=>({kind:"camera",width:640,height:480}));const dispose=vi.fn();
 const service=new VideoCaptureService({createSession:()=>({state:"idle",kind:null,settings:null,capabilities:{camera:true,display:true,deviceEnumeration:true}, getAuthorizationStatus:async()=>"granted",enumerateDevices:async()=>[],requestCamera:request,requestDisplay:request,suspend(){},resume:async()=>{},subscribe:()=>()=>{},dispose}) as never});
 const client=createMountedVideoClient(service,new AbortController().signal,()=>["video.capture.camera"],()=>true,scope.appId,{},undefined,undefined,{},undefined,undefined,()=>port);
 const session=client.createCaptureSession();
 expect(await session.getAuthorizationStatus("camera")).toBe("prompt");expect(request).not.toHaveBeenCalled();
 await session.requestCamera();expect(await session.getAuthorizationStatus("camera")).toBe("granted");
 privacy.revoke(scope);expect(dispose).toHaveBeenCalled();
 await expect(session.requestCamera()).rejects.toMatchObject({name:expect.stringMatching(/NotAllowedError|AbortError/)});
 expect(request).toHaveBeenCalledTimes(1);
});
it("records microphone consent independently of audio-session category permission",async()=>{
 const privacy=createPrivacyStore({runtimeId:"microphone"}),mic={...scope,service:"microphone"};
 let state="idle";const dispose=vi.fn(()=>{state="disposed";});const request=vi.fn(async()=>{state="authorized";});
 const host={createSession:()=>new AUFXAudioSession({get state(){return state;},route:{desiredInput:null,actualInput:null,desiredOutput:null,actualOutput:null},capabilities:{capture:true,inputSelection:false,outputSelection:false,mimeTypes:[],sessionType:true},requestRecordAuthorization:request,enumerateDevices:async()=>[],setPreferredInput:async()=>{},setPreferredOutput:async()=>{},createRecorder(){throw Error("unused");},createInputNode(){throw Error("unused");},subscribe:()=>()=>{},dispose} as never)};
 const client=createMountedAudioSessions(host,new AbortController().signal,()=>["audio.record","audio.session"],{},scope.appId,undefined,privacy.forApplication(mic));
 const session=client.createSession();expect(session.recordPermission).toBe("undetermined");
 await session.requestRecordAuthorization();expect(session.recordPermission).toBe("granted");
 privacy.revoke(mic);expect(dispose).toHaveBeenCalled();
 await expect(session.requestRecordAuthorization()).rejects.toMatchObject({name:expect.stringMatching(/NotAllowedError|AbortError/)});
 expect(request).toHaveBeenCalledTimes(1);
});
