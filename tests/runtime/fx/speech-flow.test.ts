import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as S from "../../../src/FX/SpeechFX/public";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
import { associateSpeechPort, type SpeechAdapter, type SpeechSession, type SpeechEvent } from "../../../src/FX/SpeechFX/internal/speechPort";
import { createMountedSpeechPort } from "../../../src/SynCloudOS/AppSDK/mountedSpeechPort";
import { createPrivacyStore } from "../../../src/SynCloudOS/Privacy";
import { AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/AUFXAudioPCMBuffer";
import { AUFXAudioFormat } from "../../../src/FX/AudioFX/AUFXAudioFormat";
import { currentExecution } from "../../../src/FX/DispatchFX/internal/executionStack";
import { MEFXBlockBuffer, MEFXFormatDescription, MEFXSampleBuffer, MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import { BrowserSpeechAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserSpeechAdapter";
const App = bindFXFamily(S, "com.example.speech");
const cleanups: (() => void)[] = []; const queued: (() => void)[] = [];
const ticks = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const flush = () => { for (let i = 0; queued.length && i < 100; i++) queued.shift()!(); expect(queued).toHaveLength(0); };
const observation = (isFinal = false) => ({ isFinal, transcriptions: [{ formattedString: "hello", segments: [{ substring: "hello", substringRange: { location: 0, length: 5 }, timestamp: 0.25, duration: 0.5, confidence: 0.9, alternativeSubstrings: ["hallo"] }] }] });
function fixture(runtime = "speech") {
  const owner = new AbortController(); let allowed = true; let permissions = ["speech.recognize"]; const changes = new Set<() => void>();
  const store = createPrivacyStore({ runtimeId: runtime }); const scope = { userId: "u", appId: "com.example.speech", service: "speech" };
  const privacy = store.forApplication({ ...scope, signal: owner.signal });
  const sessions: { emit(event: SpeechEvent): void; native: SpeechSession & { cancel: ReturnType<typeof vi.fn>; append: ReturnType<typeof vi.fn> } }[] = [];
  let availability = (_available: boolean) => {};
  const adapter: SpeechAdapter = { authorizationStatus: vi.fn(() => "granted"), requestAuthorization: vi.fn(async () => "granted"), isAvailable: () => true, supportsOnDeviceRecognition: () => true,
    supportedLocales: () => new Set([new Intl.Locale("en-GB")]), subscribeAvailability: (_locale, listener) => { availability = listener; return vi.fn(); },
    start: vi.fn((_request, emit) => { const native = { nativeAudioFormat: new AUFXAudioFormat(16000, 1), append: vi.fn(), endAudio: vi.fn(), finish: vi.fn(), cancel: vi.fn() }; sessions.push({ emit, native }); return native; }),
  };
  const port = createMountedSpeechPort(adapter, owner.signal, () => permissions, () => allowed, privacy, listener => { changes.add(listener); return () => { changes.delete(listener); }; });
  const context = { appId: scope.appId, runtimeInfo: { id: runtime }, signal: owner.signal } as SynWareContextValue;
  associateSpeechPort(context, port); const unregister = registerSCOSAppSession({ appId: scope.appId, displayName: "Speech", version: "1", context });
  cleanups.push(() => { owner.abort(); unregister(); store.dispose(); });
  return { owner, unregister, store, scope, privacy, adapter, sessions, port, available: (value: boolean) => availability(value), access(value: boolean) { allowed = value; changes.forEach(fn => fn()); }, permissions(value: string[]) { permissions = value; changes.forEach(fn => fn()); } };
}
beforeEach(() => { vi.stubGlobal("scheduler", { postTask: (run: () => void) => { queued.push(run); return Promise.resolve(); } }); });
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); flush(); vi.unstubAllGlobals(); });
it("keeps construction passive and authorizes through the static handler on selected main", async () => {
  const f = fixture(); const recognizer = new App.SPFXSpeechRecognizer(new Intl.Locale("en-GB"));
  expect(recognizer.locale.baseName).toBe("en-GB"); expect(recognizer.isAvailable).toBe(true); expect(recognizer.supportsOnDeviceRecognition).toBe(true);
  expect(f.store.getSnapshot()).toEqual([]); expect(App.SPFXSpeechRecognizer.authorizationStatus()).toBe("notDetermined");
  const statuses: string[] = []; App.SPFXSpeechRecognizer.requestAuthorization(status => { expect(currentExecution()?.appId).toBe("com.example.speech"); statuses.push(status); });
  await ticks(); expect(statuses).toEqual([]); flush(); expect(statuses).toEqual(["authorized"]); expect(App.SPFXSpeechRecognizer.authorizationStatus()).toBe("authorized");
  expect([...App.SPFXSpeechRecognizer.supportedLocales()][0].baseName).toBe("en-GB"); expect(f.adapter.start).not.toHaveBeenCalled();
});
it("runs full buffer/delegate flow with observed segments, sender first and queued ordering", async () => {
  const f = fixture(); const recognizer = new App.SPFXSpeechRecognizer(); const request = new S.SPFXSpeechAudioBufferRecognitionRequest();
  const buffer = new AUFXAudioPCMBuffer(new AUFXAudioFormat(16000, 1), 1); buffer.frameLength = 1; buffer.setSample(0, 0, 0.25); request.append(buffer); buffer.setSample(0, 0, 0.75);
  request.taskHint = S.SPFXSpeechRecognitionTaskHint.dictation; request.contextualStrings = ["hello"]; request.addsPunctuation = true; request.requiresOnDeviceRecognition = true;
  const calls: string[] = []; let received!: S.SPFXSpeechRecognitionResult;
  const sender = (task: S.SPFXSpeechRecognitionTask, call: string) => { expect(task).toBe(active); expect(currentExecution()?.appId).toBe("com.example.speech"); calls.push(call); };
  const active = recognizer.recognitionTask(request, {
    speechRecognitionDidDetectSpeech: task => sender(task, "speech"), speechRecognitionTaskFinishedReadingAudio: task => sender(task, "audioEnd"),
    speechRecognitionTaskDidHypothesizeTranscription: (task, transcription) => { sender(task, "partial"); expect(transcription).toBeInstanceOf(S.SPFXTranscription); },
    speechRecognitionTaskDidProcessAudioDuration: (task, seconds) => { sender(task, "duration"); expect(seconds).toBe(0.75); },
    speechRecognitionTaskDidFinishRecognition: (task, result) => { sender(task, "final"); received = result; },
    speechRecognitionTaskDidFinishSuccessfully: (task, success) => { sender(task, "complete"); expect(success).toBe(true); },
  });
  expect(active.state).toBe("starting"); expect(active.isFinishing).toBe(false); expect(active.isCancelled).toBe(false); expect(active.error).toBeNull();
  await ticks(); expect(active.state).toBe("running"); const native = f.sessions[0]; expect(native.native.append.mock.calls[0][0].getSample(0, 0)).toBe(0.25); expect(request.nativeAudioFormat.sampleRate).toBe(16000);
  native.emit({ type: "speech" }); native.emit({ type: "result", result: observation() }); native.emit({ type: "duration", duration: 0.75 });
  request.endAudio(); native.emit({ type: "audioEnd" }); expect(active.state).toBe("finishing"); expect(active.isFinishing).toBe(true);
  const final = observation(true); native.emit({ type: "result", result: final }); final.transcriptions[0].segments[0].alternativeSubstrings[0] = "mutated";
  native.emit({ type: "complete" }); expect(calls).toEqual([]); flush();
  expect(calls).toEqual(["speech", "partial", "duration", "audioEnd", "final", "complete"]); expect(active.state).toBe("completed");
  expect(received).toBeInstanceOf(S.SPFXSpeechRecognitionResult); const segment = received.bestTranscription.segments[0]; expect(segment).toBeInstanceOf(S.SPFXTranscriptionSegment);
  expect(segment).toMatchObject({ substring: "hello", substringRange: { location: 0, length: 5 }, timestamp: 0.25, duration: 0.5, confidence: 0.9, alternativeSubstrings: ["hallo"] });
  expect(Object.isFrozen(segment.alternativeSubstrings)).toBe(true); expect(Object.isFrozen(received)).toBe(true); expect(native.native.cancel).toHaveBeenCalledOnce();
});
it("supports URL requests through a capable port and suppresses partials without inventing a promise", async () => {
  const f = fixture(); const request = new S.SPFXSpeechURLRecognitionRequest(new URL("https://example.com/audio.wav")); request.shouldReportPartialResults = false;
  const callback = vi.fn(); const task = new App.SPFXSpeechRecognizer().recognitionTask(request, callback); await ticks();
  expect(f.adapter.start).toHaveBeenCalledWith(expect.objectContaining({ source: "url", url: request.url }), expect.any(Function), expect.any(AbortSignal));
  f.sessions[0].emit({ type: "result", result: observation() }); f.sessions[0].emit({ type: "result", result: observation(true) }); flush();
  expect(callback).toHaveBeenCalledOnce(); expect(callback.mock.calls[0][1]).toBeNull(); expect("result" in task).toBe(false);
  task.finish(); expect(task.isFinishing).toBe(true); expect(f.sessions[0].native.finish).toHaveBeenCalledOnce();
});
it.each(["privacy", "policy", "entitlement"] as const)("drops old native and queued results after %s revocation and regrant with replacement", async mode => {
  const f = fixture(); const old = new App.SPFXSpeechRecognizer(); const callback = vi.fn(); const task = old.recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), callback); await ticks();
  const first = f.sessions[0]; first.emit({ type: "result", result: observation() });
  if (mode === "privacy") { f.store.revoke(f.scope); f.store.setAuthorization(f.scope, "granted"); } else if (mode === "policy") { f.access(false); f.access(true); } else { f.permissions([]); f.permissions(["speech.recognize"]); }
  new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), callback); await ticks();
  first.emit({ type: "result", result: observation(true) }); f.sessions[1].emit({ type: "result", result: observation(true) }); flush();
  expect(callback).toHaveBeenCalledOnce(); expect(first.native.cancel).toHaveBeenCalledOnce(); expect(task.isCancelled).toBe(true); expect(() => old.recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), callback)).toThrow(S.SPFXError);
});
it.each(["abort", "unregister"] as const)("ends selected resources on %s without rebinding", async mode => {
  const f = fixture(); const old = new App.SPFXSpeechRecognizer(); const callback = vi.fn(); old.recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), callback); await ticks();
  if (mode === "abort") f.owner.abort(); else f.unregister();
  f.sessions[0].emit({ type: "result", result: observation(true) }); flush(); expect(callback).not.toHaveBeenCalled(); expect(f.sessions[0].native.cancel).toHaveBeenCalledOnce(); fixture("replacement"); expect(() => old.recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), callback)).toThrow(S.SPFXError);
});
it("releases a native resource that arrives after revocation, even after replacement is running", async () => {
  const f = fixture(); let resolve!: (session: SpeechSession) => void; const late = { append() {}, endAudio() {}, finish() {}, cancel: vi.fn() };
  vi.mocked(f.adapter.start).mockImplementationOnce(() => new Promise(done => { resolve = done; })); const callback = vi.fn();
  new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), callback); await ticks(); f.store.revoke(f.scope); f.store.setAuthorization(f.scope, "granted");
  new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), callback); await ticks(); resolve(late); await ticks(); flush();
  expect(late.cancel).toHaveBeenCalledOnce(); expect(f.sessions[0].native.cancel).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
});
it("keeps browser denial authoritative over saved consent and cancels current tasks", async () => {
  const f = fixture(); const task = new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), vi.fn()); await ticks();
  vi.mocked(f.adapter.authorizationStatus).mockReturnValue("denied"); expect(App.SPFXSpeechRecognizer.authorizationStatus()).toBe("denied"); expect(f.sessions[0].native.cancel).toHaveBeenCalledOnce(); expect(task.isCancelled).toBe(true);
  expect(() => new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), vi.fn())).toThrow(S.SPFXError);
});
it("reports cancellation and error through Apple task state and delegate callbacks exactly once", async () => {
  const f = fixture(); const cancelled = vi.fn(), completed = vi.fn(); const task = new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), { speechRecognitionTaskWasCancelled: cancelled, speechRecognitionTaskDidFinishSuccessfully: completed }); await ticks();
  task.cancel(); task.cancel(); task.finish(); flush(); expect(task.isCancelled).toBe(true); expect(task.state).toBe("completed"); expect(task.error).toBeInstanceOf(S.SPFXError); expect(cancelled).toHaveBeenCalledExactlyOnceWith(task); expect(completed).toHaveBeenCalledExactlyOnceWith(task, false);
  const callback = vi.fn(); const next = new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(), callback); await ticks(); f.sessions[1].emit({ type: "error", error: new Error("service failed") }); flush(); expect(callback).toHaveBeenCalledExactlyOnceWith(null, next.error); expect(next.error?.message).toBe("service failed");
});
it("queues availability changes to the exact selected session even when another runtime appears", async () => {
  const f = fixture(); const recognizer = new App.SPFXSpeechRecognizer(); const changed = vi.fn(); recognizer.delegate = { speechRecognizerAvailabilityDidChange: changed };
  fixture("other"); f.available(false); expect(changed).not.toHaveBeenCalled(); flush(); expect(changed).toHaveBeenCalledExactlyOnceWith(recognizer, false);
});

it("returns explicit browser authorization refusal through its handler without self-cancellation", async () => {
 const f=fixture();vi.mocked(f.adapter.requestAuthorization).mockResolvedValueOnce("denied");const handler=vi.fn();App.SPFXSpeechRecognizer.requestAuthorization(handler);await ticks();flush();expect(handler).toHaveBeenCalledExactlyOnceWith("denied");expect(f.store.getSnapshot()[0]).toMatchObject({decision:"denied",authorizationStatus:"denied"});
});
it("drops a pending authorization grant after revoke/regrant and a fresh successful authorization",async()=>{
 const f=fixture();let resolve!:(value:"granted")=>void;vi.mocked(f.adapter.requestAuthorization).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const stale=vi.fn();App.SPFXSpeechRecognizer.requestAuthorization(stale);await ticks();f.store.revoke(f.scope);f.store.setAuthorization(f.scope,"granted");const fresh=vi.fn();App.SPFXSpeechRecognizer.requestAuthorization(fresh);await ticks();resolve("granted");await ticks();flush();expect(stale).not.toHaveBeenCalled();expect(fresh).toHaveBeenCalledExactlyOnceWith("authorized");
});
it("drops queued authorization after revocation and regrant",async()=>{
 const f=fixture();const handler=vi.fn();App.SPFXSpeechRecognizer.requestAuthorization(handler);await ticks();f.store.revoke(f.scope);f.store.setAuthorization(f.scope,"granted");flush();expect(handler).not.toHaveBeenCalled();
});
it("never starts native recognition without the declared entitlement or allowed host policy",()=>{
 const f=fixture();f.permissions([]);expect(()=>new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(),()=>{})).toThrow(S.SPFXError);f.permissions(["speech.recognize"]);f.access(false);expect(()=>new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(),()=>{})).toThrow(S.SPFXError);expect(f.adapter.start).not.toHaveBeenCalled();
});
it("allows finish/cancel to release pending native work after consent loss and denies its data",async()=>{
 const f=fixture();const received=vi.fn();const task=new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(),received);await ticks();f.store.revoke(f.scope);expect(()=>task.finish()).not.toThrow();expect(()=>task.cancel()).not.toThrow();f.sessions[0].emit({type:"result",result:observation(true)});flush();expect(received).not.toHaveBeenCalled();expect(f.sessions[0].native.cancel).toHaveBeenCalledOnce();
});
it("reports unavailable source failure on the task instead of silently losing the error callback",async()=>{
 const f=fixture();vi.mocked(f.adapter.authorizationStatus).mockReturnValue("unavailable");vi.mocked(f.adapter.start).mockImplementation(()=>{throw new S.SPFXError("NSCocoaErrorDomain",3328,"Supplied audio unavailable");});
 const callback=vi.fn();const task=new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(),callback);await ticks();flush();expect(callback).toHaveBeenCalledExactlyOnceWith(null,task.error);expect(task.error).toBeInstanceOf(S.SPFXError);
});
it("retains supplied sample audio independently of caller closure and releases its owned copy",async()=>{
 const f=fixture();const block=new MEFXBlockBuffer(new Uint8Array([1,2,3,4]));const sample=new MEFXSampleBuffer({payload:block,format:new MEFXFormatDescription({mediaType:"audio",codec:"pcm"}),sampleCount:1,sampleSizes:[4],timings:[new MEFXSampleTimingInfo({presentationTime:MEFXTime.finite(0n,1),duration:MEFXTime.finite(1n,16000)})]});
 const request=new S.SPFXSpeechAudioBufferRecognitionRequest();request.appendAudioSampleBuffer(sample);sample.close();block.close();const task=new App.SPFXSpeechRecognizer().recognitionTask(request,()=>{});await ticks();const supplied=f.sessions[0].native.append.mock.calls[0][0] as MEFXSampleBuffer;expect(supplied).not.toBe(sample);expect(supplied.state).toBe("ready");const copy=new Uint8Array(4);const delivered=supplied.sampleBlock(0);delivered.copyTo(copy);delivered.close();expect([...copy]).toEqual([1,2,3,4]);task.cancel();expect(supplied.state).toBe("invalidated");
});
it("keeps unavailable on-device guarantees and native formats as explicit errors",async()=>{
 const f=fixture();f.adapter.supportsOnDeviceRecognition=()=>false;const request=new S.SPFXSpeechAudioBufferRecognitionRequest();expect(()=>request.nativeAudioFormat).toThrow(S.SPFXError);request.requiresOnDeviceRecognition=true;const callback=vi.fn();const task=new App.SPFXSpeechRecognizer().recognitionTask(request,callback);await ticks();flush();expect(callback).toHaveBeenCalledExactlyOnceWith(null,task.error);expect(task.error).toMatchObject({domain:"NSCocoaErrorDomain",code:3328});expect(f.adapter.start).not.toHaveBeenCalled();
});
it("aborts pending native authorization immediately when host access is revoked",async()=>{
 const f=fixture();let signal!:AbortSignal;vi.mocked(f.adapter.requestAuthorization).mockImplementationOnce(value=>{signal=value;return new Promise(()=>{});});App.SPFXSpeechRecognizer.requestAuthorization(vi.fn());await ticks();expect(signal.aborted).toBe(false);f.access(false);expect(signal.aborted).toBe(true);
});

it.each([
 ["raw browser denial", new DOMException("Native authorization was refused", "NotAllowedError")],
 ["normalized Speech denial", new S.SPFXError("kAFAssistantErrorDomain", 1700, "Native authorization was refused")],
] as const)("reports %s after a prior grant as denied and revokes live tasks",async(_name,denial)=>{
 const f=fixture();const first=vi.fn();App.SPFXSpeechRecognizer.requestAuthorization(first);await ticks();flush();expect(first).toHaveBeenCalledExactlyOnceWith("authorized");expect(App.SPFXSpeechRecognizer.authorizationStatus()).toBe("authorized");
 const received=vi.fn();const task=new App.SPFXSpeechRecognizer().recognitionTask(new S.SPFXSpeechAudioBufferRecognitionRequest(),received);await ticks();
 vi.mocked(f.adapter.requestAuthorization).mockRejectedValueOnce(denial);const refused=vi.fn();App.SPFXSpeechRecognizer.requestAuthorization(refused);await ticks();flush();
 expect(refused).toHaveBeenCalledExactlyOnceWith("denied");expect(f.store.getSnapshot()[0]).toMatchObject({decision:"denied",browserStatus:"denied",authorizationStatus:"denied"});
 expect(App.SPFXSpeechRecognizer.authorizationStatus()).toBe("denied");expect(task.isCancelled).toBe(true);expect(f.sessions[0].native.cancel).toHaveBeenCalledOnce();
 f.sessions[0].emit({type:"result",result:observation(true)});flush();expect(received).not.toHaveBeenCalled();
});
it("maps the current browser's unsupported authorization to restricted without granting consent or starting recognition",async()=>{
 const f=fixture();const browser=new BrowserSpeechAdapter();f.adapter.authorizationStatus=()=>browser.authorizationStatus();f.adapter.requestAuthorization=signal=>browser.requestAuthorization(signal);
 const handler=vi.fn();App.SPFXSpeechRecognizer.requestAuthorization(handler);await ticks();flush();expect(handler).toHaveBeenCalledExactlyOnceWith("restricted");expect(App.SPFXSpeechRecognizer.authorizationStatus()).toBe("restricted");
 expect(f.store.getSnapshot()[0]).toMatchObject({decision:"prompt",browserStatus:"unavailable",authorizationStatus:"unavailable"});expect(f.adapter.start).not.toHaveBeenCalled();
});
