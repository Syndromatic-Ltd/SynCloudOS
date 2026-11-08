# SpeechFX

SpeechFX mirrors Apple's Speech recognizer, request, task, result, transcription and delegate classes. Each class has its own file; the family entry only re-exports those types and the Apple enum cases. Declare `speech.recognize` in the app's `Info.ts` entitlements. The application compiler supplies private per-app attribution to `SPFXSpeechRecognizer`; import the public family from a real `.app` bundle. Unbound base construction explains that requirement. Objects pin the selected app session and cannot rebind after it ends.

```ts
import { SPFXSpeechRecognizer, SPFXSpeechAudioBufferRecognitionRequest } from "@syndromatic/syncloudos/fx/speech";
import { AUFXAudioPCMBuffer } from "@syndromatic/syncloudos/fx/audio";

const recognizer = new SPFXSpeechRecognizer(new Intl.Locale("en-GB"));
// Request app consent from a capable service. The current browser adapter returns restricted.
SPFXSpeechRecognizer.requestAuthorization(status => {
  if (status !== "authorized" || !recognizer.isAvailable) return;
  const request = new SPFXSpeechAudioBufferRecognitionRequest();
  request.shouldReportPartialResults = true;
  const task = recognizer.recognitionTask(request, (result, error) => {
    if (error) { console.error(error.domain, error.code, error.localizedDescription); return; }
    if (result) console.log(result.bestTranscription.formattedString, result.isFinal);
  });
  // Feed actual AUFXAudioPCMBuffer values from the application's audio pipeline:
  const acceptAudio = (buffer: AUFXAudioPCMBuffer) => request.append(buffer);
  // When that pipeline ends: request.endAudio(). task.finish() stops accepting
  // new audio while preserving final results; task.cancel() terminates the task.
  void [acceptAudio, task];
});
```

`useSpeech()` is an SDK convenience returning a real component-owned `SPFXSpeechRecognizer`. Construction is passive. React insertion lifetime preserves it across StrictMode effect replay, closes it on true unmount, and rejects queued results after unmount, even if native processing has already completed. App teardown and privacy/entitlement loss stop resources immediately. Speech has no public recognizer disposal method.

## Members and values

`SPFXSpeechRecognizer` exposes static `supportedLocales()`, `authorizationStatus()` and `requestAuthorization(handler)`, instance `locale`, `isAvailable`, `supportsOnDeviceRecognition`, `delegate`, and the two `recognitionTask(request, handlerOrDelegate)` overloads. The handler takes `(result | null, error | null)` and is called asynchronously for partial/final results or a failure. `SPFXSpeechRecognizerDelegate.speechRecognizerAvailabilityDidChange(recognizer, available)` observes service availability changes.

Apple Locale values use native `Intl.Locale`, and supportedLocales returns `ReadonlySet<Intl.Locale>`. Foundation currently has no NSELocale; its existing formatter conventions use locale identifier strings. Speech deliberately uses the standard locale object without introducing another Foundation type. Default construction uses the runtime's default Intl locale. URL requests use the standard `URL`; segment ranges use Foundation `NSERange` in UTF-16 coordinates. Apple's `OperationQueue` has no framework counterpart, so `SFSpeechRecognizer.queue` is explicitly omitted. Recognition/delegate and authorization callbacks run as synchronous work on the exact selected application's main Dispatch queue internally.

`SPFXSpeechRecognitionRequest` is abstract. Its mutable properties are `shouldReportPartialResults` (default true), `requiresOnDeviceRecognition` (false), `taskHint` (unspecified), `contextualStrings` (empty) and `addsPunctuation` (false). Hints are unspecified, dictation, search and confirmation. An `SPFXSpeechAudioBufferRecognitionRequest` accepts `append(AUFXAudioPCMBuffer)`, `appendAudioSampleBuffer(MEFXSampleBuffer)`, and `endAudio()`. PCM and ready audio sample input are copied on append; closing the caller’s sample does not invalidate the request. Owned sample copies close at task completion/cancellation. Buffers queued before asynchronous service startup are retained, bounded to 256 pending buffers and 64 MiB of audio per request, and flushed to that same task. The request is single-use. `nativeAudioFormat: AUFXAudioFormat` is available after a capable service attaches; earlier access fails with SPFXError. `SPFXSpeechURLRecognitionRequest(url)` retains an owned URL value.

`SPFXSpeechRecognitionTask` has readonly `state`, `isFinishing`, `isCancelled`, `error`, plus `finish()` and `cancel()`. States are starting, running, finishing, canceling and completed. Native acquisition is asynchronous, so starting persists until the service attaches. Cancellation is terminal; synchronous native shutdown may transition through canceling to completed within cancel(). There is no result promise. `finish()` permits final results, while `cancel()` discards pending results and reports cancellation where the app still has authority. Teardown/revocation suppresses callbacks.

The task delegate methods retain the sender first: `speechRecognitionDidDetectSpeech`, `speechRecognitionTaskFinishedReadingAudio`, `speechRecognitionTaskDidHypothesizeTranscription`, `speechRecognitionTaskDidFinishRecognition`, `speechRecognitionTaskDidFinishSuccessfully`, `speechRecognitionTaskDidProcessAudioDuration`, `speechRecognitionTaskWasCancelled`. A final utterance result precedes successful completion. Partial delivery follows shouldReportPartialResults. `SPFXSpeechRecognitionResult` contains `bestTranscription`, `transcriptions` and `isFinal`. Transcriptions have `formattedString` and `segments`; segments carry `substring`, `substringRange`, `timestamp`, `duration`, `confidence`, `alternativeSubstrings`. Issued results are immutable copies of actual observations; apps do not construct task/result/transcription/segment objects.

## Browser support and errors

The current browser adapter has no backend for this family's supplied PCM/sample-buffer or URL source contracts. Both recognition sources report `SPFXError` without starting microphone recognition, fetching the URL, silently ignoring data, or manufacturing timing/segments. Consequently browser recognizers report `isAvailable === false`. Supported locale discovery throws SPFXError; navigator languages do not establish recognition support. `supportsOnDeviceRecognition` is false, and a request requiring on-device processing fails rather than sending audio remotely. Punctuation, hints and contextual strings remain the Apple members; no unsupported browser promise is represented as implemented. Capable internal services receive all these settings and source data.

The current browser adapter has no Speech-only authorization operation. Its authorization query and request return unavailable internally, which the public API maps to restricted. They never construct or start recognition, acquire a microphone, transmit audio, or grant app consent. Apple's requestAuthorization is not an audio-source capture operation. A future capable internal service can supply that contract; this is a limitation of the current adapter, not a claim about every browser implementation. Capable services retain the shared per-app authorization flow and selected-session callback queue. A raw NotAllowedError or an already normalized kAFAssistantErrorDomain/1700 refusal is committed through the shared privacy denial path before further normalization, so a prior grant cannot yield an authorized reply. Existing native resources are revoked while the completed request still delivers denied. A late callback cannot grant access after revocation; recognition operation failures carry SPFXError.

Authorization cases are notDetermined, restricted, denied and authorized. App consent is distinct from origin permission; a passive granted browser observation does not grant app consent. Saved app consent never overrides a browser denial. Privileged operations require the launch entitlement, host policy, current privacy lease and selected session. Revocation invalidates captured generations permanently, including pending authorization and recognition operations; restoring permission or creating a replacement does not resurrect old callbacks. Late-created resources are stopped before being dropped.

`SPFXError` models Speech's NSError result with `domain`, numeric `code`, `localizedDescription`. Unsupported members use NSCocoaErrorDomain / 3328 (featureUnsupported). Speech authorization denial uses kAFAssistantErrorDomain / 1700, cancellation 216, service failure 203, and unavailable app-session binding 1101. Foundation value validation failures are wrapped as SPFXError where the Speech operation owns them. The browser adapter, ports, bindings and session factories remain private and are absent from public root, SDK, browser and testing environment types.

Deterministic tests cover the full capable-port flow and real plugin-compiled installed `.app` imports after await, timers and callbacks. The public test-host factory is unchanged; a narrow speech control provides allow/deny and test transcript delivery without exposing the native adapter. Real speech-service behavior through a future capable host requires interactive device testing; the current browser adapter has no microphone or recognition-source support to validate.
