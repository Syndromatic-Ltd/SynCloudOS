import { afterEach, expect, it } from "vitest";
import * as Speech from "../../../src/FX/SpeechFX/public";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";

afterEach(() => {});
it("exports real Apple Speech classes and exact enum cases without browser factories", () => {
  const api = Speech as Record<string, unknown>;
  for (const name of ["SPFXSpeechRecognizer", "SPFXSpeechRecognitionRequest", "SPFXSpeechAudioBufferRecognitionRequest", "SPFXSpeechURLRecognitionRequest", "SPFXSpeechRecognitionTask", "SPFXSpeechRecognitionResult", "SPFXTranscription", "SPFXTranscriptionSegment", "SPFXError"]) expect(typeof api[name], name).toBe("function");
  expect(api.SPFXSpeechRecognizerAuthorizationStatus).toEqual({ notDetermined: "notDetermined", restricted: "restricted", denied: "denied", authorized: "authorized" });
  expect(api.SPFXSpeechRecognitionTaskState).toEqual({ starting: "starting", running: "running", finishing: "finishing", canceling: "canceling", completed: "completed" });
  expect(api.SPFXSpeechRecognitionTaskHint).toEqual({ unspecified: "unspecified", dictation: "dictation", search: "search", confirmation: "confirmation" });
});
it("requires plugin attribution and uses family errors for absent selected applications", () => {
  const Recognizer = (Speech as any).SPFXSpeechRecognizer;
  expect(typeof Recognizer).toBe("function");
  expect(() => new Recognizer()).toThrow(/application bundle/);
  const App = bindFXFamily(Speech, "com.example.speech") as any;
  expect(() => new App.SPFXSpeechRecognizer()).toThrow((Speech as any).SPFXError);
});
