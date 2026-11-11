import { createSynCloudOSHostContribution } from "@syndromatic/syncloudos/browser";
import { createDeterministicRuntimeEnvironment, type SynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { SCOS, useSpeech, type SynWareContextValue } from "@syndromatic/syncloudos/sdk";
import { SCOS as RootSCOS } from "@syndromatic/syncloudos";
import type { NSERange } from "@syndromatic/syncloudos/foundation";
import { SPFXSpeechRecognizer, SPFXSpeechAudioBufferRecognitionRequest, SPFXSpeechURLRecognitionRequest, SPFXSpeechRecognitionRequest, SPFXSpeechRecognitionTask, SPFXSpeechRecognitionResult, SPFXTranscription, SPFXTranscriptionSegment, SPFXError, SPFXSpeechRecognizerAuthorizationStatus, SPFXSpeechRecognitionTaskState, SPFXSpeechRecognitionTaskHint, type SPFXSpeechRecognizerDelegate, type SPFXSpeechRecognitionTaskDelegate } from "@syndromatic/syncloudos/fx/speech";
import { AUFXAudioPCMBuffer, AUFXAudioFormat } from "@syndromatic/syncloudos/fx/audio";
createSynCloudOSHostContribution("speech-boundary","installed-test",environment=>{
 const now:number=environment.now();void now;
 // @ts-expect-error No native Speech adapter in inferred browser environment.
 environment.speech;
 // @ts-expect-error No indexed type extraction route.
 type Adapter=typeof environment["speech"];
 return {};
});
const testing=createDeterministicRuntimeEnvironment();testing.adapters.speech.allow();testing.adapters.speech.emitResult("test",true);
// @ts-expect-error Testing exposes controls, not native Speech adapters.
testing.environment.speech;
// @ts-expect-error No adapter type extraction route.
type TestingAdapter=typeof testing.environment["speech"];
declare const host:SynWareTestHost;
// @ts-expect-error Test control cannot open native sessions.
host.adapters.speech.start();
// @ts-expect-error Removed app factory.
host.appContext.speech;
// @ts-expect-error Removed context factory.
type ContextSpeech=SynWareContextValue["speech"];
// @ts-expect-error Removed SDK SCOS factory.
SCOS.speech;
// @ts-expect-error Removed root SCOS factory.
RootSCOS.speech;
const recognizer:SPFXSpeechRecognizer=useSpeech();const specified=new SPFXSpeechRecognizer(new Intl.Locale("en-GB"));
const status:SPFXSpeechRecognizerAuthorizationStatus=SPFXSpeechRecognizer.authorizationStatus();SPFXSpeechRecognizer.requestAuthorization(value=>{const received:SPFXSpeechRecognizerAuthorizationStatus=value;void received;});
const locales:ReadonlySet<Intl.Locale>=SPFXSpeechRecognizer.supportedLocales();const locale:Intl.Locale=recognizer.locale;
const availability:SPFXSpeechRecognizerDelegate={speechRecognizerAvailabilityDidChange(sender,available){const same:SPFXSpeechRecognizer=sender;void[same,available];}};recognizer.delegate=availability;
const request=new SPFXSpeechAudioBufferRecognitionRequest();request.taskHint=SPFXSpeechRecognitionTaskHint.dictation;request.shouldReportPartialResults=true;request.contextualStrings=["hello"];request.requiresOnDeviceRecognition=true;request.addsPunctuation=true;request.append(new AUFXAudioPCMBuffer(new AUFXAudioFormat(16000,1),1));request.endAudio();
const task:SPFXSpeechRecognitionTask=recognizer.recognitionTask(request,(result,error)=>{if(result){const transcript:SPFXTranscription=result.bestTranscription;const segment:SPFXTranscriptionSegment=transcript.segments[0];const range:NSERange=segment.substringRange;void range;}const failure:SPFXError|null=error;void failure;});
const delegate:SPFXSpeechRecognitionTaskDelegate={speechRecognitionTaskDidFinishRecognition(sender,result){const r:SPFXSpeechRecognitionResult=result;void[sender,r];}};specified.recognitionTask(new SPFXSpeechURLRecognitionRequest(new URL("https://example.com/audio.wav")),delegate);
const state:SPFXSpeechRecognitionTaskState=task.state;task.finish();task.cancel();void[status,locales,locale,state,SPFXError];
// @ts-expect-error Apple's OperationQueue is absent, no Dispatch replacement.
recognizer.queue;
// @ts-expect-error No invented public disposal.
recognizer.dispose();
// @ts-expect-error No browser-style result promise.
task.result;
// @ts-expect-error No browser-only request signal.
request.signal;
// @ts-expect-error No browser-only request continuous flag.
request.continuous;
// @ts-expect-error No browser-only request alternatives limit.
request.maximumAlternatives;
// @ts-expect-error Recognition base request is abstract.
new SPFXSpeechRecognitionRequest();
// @ts-expect-error Tasks are issued by the framework.
new SPFXSpeechRecognitionTask();
// @ts-expect-error No old client export.
import type {SPFXSpeechClient} from "@syndromatic/syncloudos/fx/speech";
// @ts-expect-error Private ports are absent.
import {speechPortFor} from "@syndromatic/syncloudos/fx/speech";
