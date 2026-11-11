// @vitest-environment jsdom
import {expect,it} from "vitest";
import {createDeterministicRuntimeEnvironment} from "../../../src/SynCloudOS/AppSDK/testing";
import {createBrowserRuntimeEnvironment} from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import {BrowserSpeechAdapter} from "../../../src/SynCloudOS/PlatformAdapters/BrowserSpeechAdapter";
import {createSynCloudOSHostContribution,prepareSynCloudOSHostContributions} from "../../../src/SynCloudOS/HostContributions/hostContribution";
import {speechAdapterFor} from "../../../src/FX/SpeechFX/internal/speechPort";
it("withholds private Speech adapters from browser, testing and host contributions",async()=>{
 const testing=createDeterministicRuntimeEnvironment();try{
 expect("speech" in testing.environment).toBe(false);expect("start" in testing.adapters.speech).toBe(false);testing.adapters.speech.allow();const adapter=speechAdapterFor(testing.environment)!;expect(adapter.authorizationStatus()).toBe("granted");
 let called=false;await prepareSynCloudOSHostContributions([createSynCloudOSHostContribution("speech-test","test",environment=>{called=true;expect("speech" in environment).toBe(false);return{};})],testing.environment);expect(called).toBe(true);
 const browser=createBrowserRuntimeEnvironment();expect("speech" in browser).toBe(false);expect(speechAdapterFor(browser)).toBeInstanceOf(BrowserSpeechAdapter);
 }finally{testing.dispose();}
});
