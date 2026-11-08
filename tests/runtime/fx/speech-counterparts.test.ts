import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import * as Speech from "../../../src/FX/SpeechFX/public";
import { appkitCounterpartFor } from "../../../scripts/developer-mcp/lookup.mjs";
const counterparts = { SPFXSpeechRecognizer:"SFSpeechRecognizer", SPFXSpeechRecognizerDelegate:"SFSpeechRecognizerDelegate", SPFXSpeechRecognizerAuthorizationStatus:"SFSpeechRecognizerAuthorizationStatus", SPFXSpeechRecognitionRequest:"SFSpeechRecognitionRequest", SPFXSpeechAudioBufferRecognitionRequest:"SFSpeechAudioBufferRecognitionRequest", SPFXSpeechURLRecognitionRequest:"SFSpeechURLRecognitionRequest", SPFXSpeechRecognitionTask:"SFSpeechRecognitionTask", SPFXSpeechRecognitionTaskState:"SFSpeechRecognitionTaskState", SPFXSpeechRecognitionTaskHint:"SFSpeechRecognitionTaskHint", SPFXSpeechRecognitionTaskDelegate:"SFSpeechRecognitionTaskDelegate", SPFXSpeechRecognitionResult:"SFSpeechRecognitionResult", SPFXTranscription:"SFTranscription", SPFXTranscriptionSegment:"SFTranscriptionSegment", SPFXError:"NSError" };
it("maps every runtime/type Speech export to its Apple counterpart and exposes only classes/enums/protocols",()=>{
 const mapping=JSON.parse(readFileSync("docs/framework/appkit-counterparts.json","utf8"));expect(Object.keys(Speech).sort()).toEqual(Object.keys(counterparts).filter(name=>!name.endsWith("Delegate")).sort());for(const[name,apple]of Object.entries(counterparts))expect(appkitCounterpartFor(name,mapping)).toBe(apple);
 const program=ts.createProgram(["src/FX/SpeechFX/public.ts"],{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,skipLibCheck:true});const checker=program.getTypeChecker();const file=program.getSourceFile("src/FX/SpeechFX/public.ts")!;expect(checker.getExportsOfModule(checker.getSymbolAtLocation(file)!).map(symbol=>symbol.name).sort()).toEqual(Object.keys(counterparts).sort());
 for(const cases of [Speech.SPFXSpeechRecognizerAuthorizationStatus,Speech.SPFXSpeechRecognitionTaskState,Speech.SPFXSpeechRecognitionTaskHint])expect(Object.isFrozen(cases)).toBe(true);
});
