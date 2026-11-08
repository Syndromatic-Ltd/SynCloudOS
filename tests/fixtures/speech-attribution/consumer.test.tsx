import { expect, it, vi } from "vitest";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { SPFXSpeechRecognizer as BaseRecognizer } from "@syndromatic/syncloudos/fx/speech";
import Application, { afterAwait, afterTimer, thirdParty, SPFXSpeechRecognizer, SPFXSpeechAudioBufferRecognitionRequest, SPFXSpeechRecognitionResult, SPFXError, AUFXAudioPCMBuffer, AUFXAudioFormat } from "./src/SynWare/First.app/Contents/index";
import info from "./src/SynWare/First.app/Contents/Info";
const ticks = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };
it("compiled Speech app keeps attributed constructors after await, timer, callback and authorizes full supplied-audio flow", async () => {
 const jobs: (()=>void)[]=[]; vi.stubGlobal("scheduler",{postTask:(job:()=>void)=>{jobs.push(job);return Promise.resolve();}}); const flush=()=>{while(jobs.length)jobs.shift()!();};
 const host=createSynWareTestHost({application:Application,manifest:{schemaVersion:1,...info},document});
 try {
  expect(()=>new BaseRecognizer()).toThrow(/application bundle/); expect(()=>new SPFXSpeechRecognizer()).toThrow(SPFXError);
  await host.render(); host.adapters.permissions.allow();host.adapters.policy.allow();
  expect("speech" in host.appContext).toBe(false); expect(host.adapters.speech).toBeDefined(); host.adapters.speech.allow();
  const statuses:string[]=[]; SPFXSpeechRecognizer.requestAuthorization(status=>statuses.push(status));await ticks();flush();expect(statuses).toEqual(["authorized"]);
  const first=await afterAwait(), second=await afterTimer();let third!:SPFXSpeechRecognizer;
  await new Promise<void>(resolve=>queueMicrotask(()=>thirdParty(create=>{third=create();resolve();})));
  const received:SPFXSpeechRecognitionResult[]=[];
  for(const recognizer of [first,second,third]){expect(recognizer).toBeInstanceOf(BaseRecognizer);expect(recognizer).toBeInstanceOf(SPFXSpeechRecognizer);const request=new SPFXSpeechAudioBufferRecognitionRequest();const buffer=new AUFXAudioPCMBuffer(new AUFXAudioFormat(16000,1),1);buffer.frameLength=1;request.append(buffer);recognizer.recognitionTask(request,(result,error)=>{expect(error).toBeNull();if(result)received.push(result);});}
  await ticks();expect(host.adapters.speech.appendedBufferCount()).toBe(3);host.adapters.speech.emitResult("hello",false);flush();expect(received).toHaveLength(3);expect(received[0]).toBeInstanceOf(SPFXSpeechRecognitionResult);
  host.adapters.speech.emitResult("stale",false);host.adapters.permissions.deny();expect(host.adapters.speech.activeTaskCount()).toBe(0);host.adapters.permissions.allow();flush();expect(received).toHaveLength(3);
  expect(()=>first.recognitionTask(new SPFXSpeechAudioBufferRecognitionRequest(),()=>{})).toThrow(SPFXError);
  const replacement=await afterAwait();replacement.recognitionTask(new SPFXSpeechAudioBufferRecognitionRequest(),result=>{if(result)received.push(result);});await ticks();host.adapters.speech.emitResult("final",true);flush();expect(received.at(-1)?.bestTranscription.formattedString).toBe("final");expect(host.adapters.speech.activeTaskCount()).toBe(0);
  replacement.recognitionTask(new SPFXSpeechAudioBufferRecognitionRequest(),()=>{});await ticks();await host.dispose();flush();expect(host.adapters.speech.activeTaskCount()).toBe(0);expect(replacement.isAvailable).toBe(false);
 }finally{await host.dispose();flush();vi.unstubAllGlobals();}
});
it("browser denial remains authoritative over an entitled Speech app",async()=>{
 const host=createSynWareTestHost({application:Application,manifest:{schemaVersion:1,...info},document});
 try{await host.render();host.adapters.permissions.allow();host.adapters.policy.allow();expect(host.adapters.speech).toBeDefined();expect(SPFXSpeechRecognizer.authorizationStatus()).toBe("denied");expect(()=>new SPFXSpeechRecognizer().recognitionTask(new SPFXSpeechAudioBufferRecognitionRequest(),()=>{})).toThrow(SPFXError);expect(host.adapters.speech.activeTaskCount()).toBe(0);}finally{await host.dispose();}
});
