// @vitest-environment jsdom
import React, { StrictMode, Suspense, useLayoutEffect } from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSpeech } from "../../../src/SynCloudOS/AppSDK/hooks/useSpeech";
import { SPFXSpeechRecognizer, SPFXSpeechAudioBufferRecognitionRequest } from "../../../src/FX/SpeechFX/public";
import { associateSpeechPort, type SpeechAdapter, type SpeechEvent } from "../../../src/FX/SpeechFX/internal/speechPort";
import { createMountedSpeechPort } from "../../../src/SynCloudOS/AppSDK/mountedSpeechPort";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
const selection = vi.hoisted(() => ({ context: null as unknown }));
vi.mock("../../../src/SynCloudOS/AppSDK/SynWareContext", () => ({ useSynWareContext: () => selection.context }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const ticks=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
it("survives StrictMode replay with a real recognizer and drops completed queued results on true unmount",async()=>{
 const jobs:(()=>void)[]=[];vi.stubGlobal("scheduler",{postTask:(job:()=>void)=>{jobs.push(job);return Promise.resolve();}});
 const owner=new AbortController();const cancel=vi.fn();let emit!:(event:SpeechEvent)=>void;
 const adapter:SpeechAdapter={authorizationStatus:()=>"granted",requestAuthorization:async()=>"granted",isAvailable:()=>true,supportsOnDeviceRecognition:()=>false,supportedLocales:()=>new Set(),start:vi.fn((_request,listener)=>{emit=listener;return{append(){},endAudio(){},finish(){},cancel};})};
 const context={appId:"com.example.hook",runtimeInfo:{id:"hook"},signal:owner.signal} as SynWareContextValue;selection.context={...context};
 associateSpeechPort(context,createMountedSpeechPort(adapter,owner.signal,()=>["speech.recognize"],()=>true));
 const unregister=registerSCOSAppSession({appId:context.appId,displayName:"Hook",version:"1",context});const other=registerSCOSAppSession({appId:context.appId,displayName:"Other",version:"1",context:{...context,signal:new AbortController().signal}});
 try{let held!:SPFXSpeechRecognizer;let setups=0;const result=vi.fn();
 function Probe(){const recognizer=useSpeech();held=recognizer;useLayoutEffect(()=>{setups++;expect(recognizer.isAvailable).toBe(true);},[recognizer]);return null;}
 const view=render(<StrictMode><Probe/></StrictMode>);expect(setups).toBe(2);expect(held).toBeInstanceOf(SPFXSpeechRecognizer);held.recognitionTask(new SPFXSpeechAudioBufferRecognitionRequest(),result);await ticks();
 emit({type:"result",result:{isFinal:true,transcriptions:[{formattedString:"secret",segments:[]}]}});emit({type:"complete"});view.unmount();while(jobs.length)jobs.shift()!();expect(result).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledOnce();expect(held.isAvailable).toBe(false);
 const pending=new Promise(()=>{});function Suspended():React.ReactNode{useSpeech();throw pending;}render(<StrictMode><Suspense fallback={null}><Suspended/></Suspense></StrictMode>);expect(adapter.start).toHaveBeenCalledOnce();
 }finally{owner.abort();unregister();other();}
});
it("rejects ambiguous exact mount aliases rather than choosing the first registered session",()=>{
 const owner=new AbortController();const context={appId:"com.example.ambiguous",runtimeInfo:{id:"duplicate"},signal:owner.signal} as SynWareContextValue;selection.context={...context};
 const a=registerSCOSAppSession({appId:context.appId,displayName:"A",version:"1",context});const b=registerSCOSAppSession({appId:context.appId,displayName:"B",version:"1",context:{...context}});
 function Probe(){useSpeech();return null;}
 try{expect(()=>render(<Probe/>)).toThrow(/ambiguous/);}finally{owner.abort();a();b();}
});
