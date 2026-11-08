/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { SPFXSpeechRecognitionTask } from "../SPFXSpeechRecognitionTask";
import type { SPFXSpeechRecognitionTaskState } from "../SPFXSpeechRecognitionTaskState";
import type { SPFXSpeechRecognitionTaskDelegate } from "../SPFXSpeechRecognitionTaskDelegate";
import type { SPFXSpeechRecognitionResult } from "../SPFXSpeechRecognitionResult";
import type { SPFXError } from "../SPFXError";
import { SPFXSpeechAudioBufferRecognitionRequest } from "../SPFXSpeechAudioBufferRecognitionRequest";
import { SPFXSpeechURLRecognitionRequest } from "../SPFXSpeechURLRecognitionRequest";
import type { SPFXSpeechRecognitionRequest } from "../SPFXSpeechRecognitionRequest";
import { SPFXSpeechRecognitionTaskHint } from "../SPFXSpeechRecognitionTaskHint";
import { observeFXSessionEnd, type FXAppSession } from "../../../SynCloudOS/fxRuntimeContracts";
import { dispatchQueueForSession } from "../../DispatchFX/internal/sessionBinding";
import { audioRequests, endAudio } from "./audioRequests";
import { createSpeechResult } from "./transcriptionValues";
import { speechCancelled, speechFailure, unsupportedSpeech, type SpeechPort, type SpeechSession, type SpeechEvent } from "./speechPort";
type Receiver = SPFXSpeechRecognitionTaskDelegate | ((result: SPFXSpeechRecognitionResult | null, error: SPFXError | null) => void);
interface TaskControl { state: SPFXSpeechRecognitionTaskState; finishing: boolean; cancelled: boolean; error: SPFXError | null; finish(): void; cancel(): void; invalidate(): void; }
export const speechTasks = new WeakMap<SPFXSpeechRecognitionTask, TaskControl>();
export function createSpeechTask(session: FXAppSession, port: SpeechPort, generation: number, request: SPFXSpeechRecognitionRequest, locale: Intl.Locale, receiver: Receiver, complete: () => void, ownerLive: () => boolean): SPFXSpeechRecognitionTask {
  const queue = dispatchQueueForSession(session).main;
  const task = Object.create(SPFXSpeechRecognitionTask.prototype) as SPFXSpeechRecognitionTask;
  const owner = new AbortController();
  const audio = request instanceof SPFXSpeechAudioBufferRecognitionRequest ? audioRequests.get(request)! : undefined;
  if (!audio && !(request instanceof SPFXSpeechURLRecognitionRequest)) throw speechFailure(new Error("Use an audio-buffer or URL speech recognition request."));
  if (audio?.used) throw speechFailure(new Error("An audio recognition request can be used only once."));
  if (!Object.values(SPFXSpeechRecognitionTaskHint).includes(request.taskHint)) throw speechFailure(new Error("Invalid speech recognition task hint."));
  if (audio) audio.used = true;
  const partial = request.shouldReportPartialResults;
  let native: SpeechSession | undefined; let terminal = false; let invalidated = false; let epoch = 0; let detected = false; let readFinished = false;
  let releaseSession = () => {}; let releaseAccess = () => {};
  const live = () => { if (invalidated || !ownerLive() || session.context.signal.aborted) return false; try { port.assertAccess(generation); return true; } catch { return false; } };
  const enqueue = (callback: () => void, captured = epoch) => { try { queue.async(() => { if (captured !== epoch || !live()) return; callback(); }); } catch { invalidate(); } };
  const cleanup = () => {
    releaseSession(); releaseAccess(); owner.abort();
    if (audio) { audio.buffers.length = 0; for (const sample of audio.samples) sample.close(); audio.samples.clear(); audio.append = undefined; audio.end = undefined; audio.ended = true; audio.failure = state.error ?? speechCancelled(); }
    try { native?.cancel(); } catch { /* Native work is already terminal. */ }
    complete();
  };
  const fail = (error: unknown) => {
    if (terminal) return; terminal = true; state.error = speechFailure(error); state.state = "completed"; cleanup();
    enqueue(() => { if (typeof receiver === "function") receiver(null, state.error); else receiver.speechRecognitionTaskDidFinishSuccessfully?.(task, false); });
  };
  const invalidate = () => { if (invalidated) return; invalidated = true; epoch++; if (!terminal) { terminal = true; state.cancelled = true; state.error = speechCancelled(); state.state = "completed"; cleanup(); } };
  const finishAudio = () => { if (readFinished) return; readFinished = true; state.finishing = true; state.state = "finishing"; if (typeof receiver !== "function") enqueue(() => receiver.speechRecognitionTaskFinishedReadingAudio?.(task)); };
  const state: TaskControl = { state: "starting", finishing: false, cancelled: false, error: null,
    finish() { if (terminal || state.finishing) return; state.finishing = true; state.state = "finishing"; if (audio) endAudio(request as SPFXSpeechAudioBufferRecognitionRequest); try { native?.finish(); } catch (error) { fail(error); } },
    cancel() { if (terminal) return; epoch++; terminal = true; state.cancelled = true; state.error = speechCancelled(); state.state = "canceling"; cleanup(); state.state = "completed"; enqueue(() => { if (typeof receiver === "function") receiver(null, state.error); else { receiver.speechRecognitionTaskWasCancelled?.(task); receiver.speechRecognitionTaskDidFinishSuccessfully?.(task, false); } }); },
    invalidate,
  };
  speechTasks.set(task, state);
  releaseSession = observeFXSessionEnd(session, invalidate); releaseAccess = port.observeAccessLoss(invalidate);
  const receive = (event: SpeechEvent) => {
    if (terminal || !live()) { if (!terminal) invalidate(); return; }
    try {
      if (event.type === "speech") { if (!detected) { detected = true; if (typeof receiver !== "function") enqueue(() => receiver.speechRecognitionDidDetectSpeech?.(task)); } }
      else if (event.type === "audioEnd") finishAudio();
      else if (event.type === "duration") { if (!Number.isFinite(event.duration) || event.duration < 0) throw new Error("Invalid processed audio duration."); if (typeof receiver !== "function") enqueue(() => receiver.speechRecognitionTaskDidProcessAudioDuration?.(task, event.duration)); }
      else if (event.type === "result") { if (!event.result.isFinal && !partial) return; const result = createSpeechResult(event.result); enqueue(() => { if (typeof receiver === "function") receiver(result, null); else if (result.isFinal) receiver.speechRecognitionTaskDidFinishRecognition?.(task, result); else receiver.speechRecognitionTaskDidHypothesizeTranscription?.(task, result.bestTranscription); }); }
      else if (event.type === "error") fail(event.error);
      else if (event.type === "complete") { terminal = true; state.state = "completed"; cleanup(); if (typeof receiver !== "function") enqueue(() => receiver.speechRecognitionTaskDidFinishSuccessfully?.(task, true)); }
    } catch (error) { fail(error); }
  };
  void (async () => {
    try {
      if (request.requiresOnDeviceRecognition && !port.supportsOnDeviceRecognition(locale)) unsupportedSpeech("requiresOnDeviceRecognition");
      const acquired = await port.start({ locale, source: audio ? "buffers" : "url", ...(request instanceof SPFXSpeechURLRecognitionRequest ? { url: request.url } : {}), requiresOnDeviceRecognition: request.requiresOnDeviceRecognition,
        shouldReportPartialResults: partial, addsPunctuation: request.addsPunctuation, taskHint: request.taskHint, contextualStrings: Object.freeze([...request.contextualStrings]) }, receive, owner.signal);
      native = acquired;
      if (terminal || !live()) { acquired.cancel(); return; }
      state.state = state.finishing ? "finishing" : "running";
      if (audio) {
        audio.format = acquired.nativeAudioFormat;
        audio.append = buffer => { if (!live() || terminal) throw speechCancelled(); try { acquired.append(buffer); } catch (error) { fail(error); throw speechFailure(error); } };
        audio.end = () => { if (terminal) return; try { acquired.endAudio(); } catch (error) { fail(error); } };
        for (const buffer of audio.buffers.splice(0)) audio.append(buffer);
        if (audio.ended) acquired.endAudio();
      }
      if (state.finishing) acquired.finish();
    } catch (error) { if (!terminal) fail(error); }
  })();
  return Object.freeze(task);
}
