# SpeechFX

SpeechFX turns spoken audio into text. You create a recogniser for a locale, hand it a request that carries audio, and receive transcriptions, with timing and confidence for each segment, through a callback or a delegate. For text to speech, use `AUFXSpeechSynthesizer` in [AudioFX](audio.md) instead.

Import from `@syndromatic/syncloudos/fx/speech` inside a real `.app` bundle and declare `speech.recognize` in the app's `Info.ts` entitlements. The application compiler attaches per-app attribution to `SPFXSpeechRecognizer`; constructing the unbound base class throws an error that explains this. Each object stays bound to its app session and cannot move to another once that session ends.

> **Browser status.** The current browser adapter has no recognition backend. In a browser, `isAvailable` is `false`, authorisation reports `restricted`, and recognition requests fail with `SPFXError`. The API is complete so that capable hosts can supply a service; see [Browser support](#browser-support).

```ts
import { SPFXSpeechRecognizer, SPFXSpeechAudioBufferRecognitionRequest } from "@syndromatic/syncloudos/fx/speech";
import { AUFXAudioPCMBuffer } from "@syndromatic/syncloudos/fx/audio";

const recognizer = new SPFXSpeechRecognizer(new Intl.Locale("en-GB"));
SPFXSpeechRecognizer.requestAuthorization(status => {
  if (status !== "authorized" || !recognizer.isAvailable) return;
  const request = new SPFXSpeechAudioBufferRecognitionRequest();
  request.shouldReportPartialResults = true;
  const task = recognizer.recognitionTask(request, (result, error) => {
    if (error) { console.error(error.domain, error.code, error.localizedDescription); return; }
    if (result) console.log(result.bestTranscription.formattedString, result.isFinal);
  });
  // Feed AUFXAudioPCMBuffer values from your audio pipeline:
  const acceptAudio = (buffer: AUFXAudioPCMBuffer) => request.append(buffer);
  // When the pipeline ends, call request.endAudio(). task.finish() stops accepting
  // audio but still delivers final results; task.cancel() ends the task outright.
  void [acceptAudio, task];
});
```

In a component, `useSpeech()` from `@syndromatic/syncloudos/sdk` returns an `SPFXSpeechRecognizer` owned by that component. Creating it does nothing on its own. It survives React StrictMode's effect replay, closes when the component unmounts, and drops any queued results after unmount, even ones the service has already finished. App teardown, or losing privacy consent or the entitlement, stops its resources at once. There is no public method to dispose of a recogniser yourself.

## Recognisers

`SPFXSpeechRecognizer` has three static members: `supportedLocales()`, `authorizationStatus()` and `requestAuthorization(handler)`. Each instance has `locale`, `isAvailable`, `supportsOnDeviceRecognition` and a `delegate`, and two `recognitionTask(request, …)` overloads: one takes a `(result | null, error | null)` handler, the other an `SPFXSpeechRecognitionTaskDelegate`. The handler is called asynchronously for each partial or final result, or once for a failure. Set `delegate.speechRecognizerAvailabilityDidChange(recogniser, available)` to hear when the service comes and goes.

Locales are standard `Intl.Locale` objects, and `supportedLocales()` returns a `ReadonlySet<Intl.Locale>`. With no argument, the recogniser uses the runtime's default locale. URL requests take a standard `URL`, and segment ranges are Foundation `NSERange` values in UTF-16 units. There is no `queue` property: recognition, delegate and authorisation callbacks always run as synchronous work on the app's main Dispatch queue.

## Requests

`SPFXSpeechRecognitionRequest` is the abstract base. Its settings, with defaults:

| Property | Default |
|---|---|
| `shouldReportPartialResults` | `true` |
| `requiresOnDeviceRecognition` | `false` |
| `taskHint` | `"unspecified"` (also `dictation`, `search`, `confirmation`) |
| `contextualStrings` | `[]` |
| `addsPunctuation` | `false` |

`SPFXSpeechAudioBufferRecognitionRequest` takes audio through `append(AUFXAudioPCMBuffer)` and `appendAudioSampleBuffer(MEFXSampleBuffer)`, and `endAudio()` marks the end. Both append methods copy their input, so closing your own sample buffer afterwards is safe; the request's copies close when the task completes or is cancelled. Audio you append before the service has started is held, up to 256 buffers and 64 MiB per request, and then flushed to the same task. Each request can be used once. `nativeAudioFormat` (an `AUFXAudioFormat`) becomes readable once a capable service attaches; reading it earlier throws `SPFXError`.

`SPFXSpeechURLRecognitionRequest(url)` keeps its own copy of the URL.

## Tasks and results

`SPFXSpeechRecognitionTask` exposes read-only `state`, `isFinishing`, `isCancelled` and `error`, plus `finish()` and `cancel()`. The states are `starting`, `running`, `finishing`, `canceling` and `completed`. Acquiring the service is asynchronous, so a task stays in `starting` until it attaches. There is no result promise.

`finish()` lets final results through. `cancel()` is final: it discards pending results and reports the cancellation if the app still has authority, and it may pass through `canceling` to `completed` before returning. Teardown or revocation suppresses all callbacks.

Task delegate methods take the task first:

- `speechRecognitionDidDetectSpeech`
- `speechRecognitionTaskFinishedReadingAudio`
- `speechRecognitionTaskDidHypothesizeTranscription`
- `speechRecognitionTaskDidFinishRecognition`
- `speechRecognitionTaskDidFinishSuccessfully`
- `speechRecognitionTaskDidProcessAudioDuration`
- `speechRecognitionTaskWasCancelled`

A final result for an utterance always arrives before successful completion, and partial results follow `shouldReportPartialResults`.

`SPFXSpeechRecognitionResult` holds `bestTranscription`, `transcriptions` and `isFinal`. Each `SPFXTranscription` has a `formattedString` and `segments`. Each `SPFXTranscriptionSegment` has `substring`, `substringRange`, `timestamp`, `duration`, `confidence` and `alternativeSubstrings`. Results are immutable copies of what the service observed. You never construct tasks, results, transcriptions or segments yourself.

## Browser support

The browser adapter has no backend for audio-buffer, sample-buffer or URL recognition. Both kinds of request fail with `SPFXError`. SpeechFX does not fall back to microphone recognition, fetch the URL, quietly drop your audio, or make up timings and segments. As a result:

- `isAvailable` is `false`.
- `supportedLocales()` throws `SPFXError`. The browser's language list says nothing about recognition support.
- `supportsOnDeviceRecognition` is `false`, and a request with `requiresOnDeviceRecognition` fails instead of sending audio elsewhere.

Punctuation, hints and contextual strings are passed to capable services; the browser adapter does not claim to honour them.

## Authorisation

The statuses are `notDetermined`, `restricted`, `denied` and `authorized`.

The browser adapter has no speech-specific authorisation, so `authorizationStatus()` and `requestAuthorization` report `restricted`. Neither call starts recognition, opens the microphone, sends audio or grants app consent. A capable service would use the shared per-app authorisation flow and deliver its callback on the session's queue.

App consent is separate from the browser's origin permission. A passive "granted" browser observation does not grant app consent, and saved app consent never overrides a browser denial. Privileged operations need the launch entitlement, host policy, a current privacy lease and the selected session. A raw `NotAllowedError`, or a refusal already normalised to `kAFAssistantErrorDomain` 1700, is recorded as a privacy denial first, so an earlier grant cannot produce `authorized`. Existing resources are revoked and the request still delivers `denied`.

Revocation invalidates captured generations for good, including pending authorisation and recognition work. Restoring permission or creating a new recogniser does not revive old callbacks, and resources that finish starting after revocation are stopped before they are dropped.

## Errors

`SPFXError` carries a `domain`, a numeric `code` and a `localizedDescription`.

| Domain | Code | Meaning |
|---|---|---|
| `NSCocoaErrorDomain` | 3328 | The member is not supported by this service. |
| `kAFAssistantErrorDomain` | 1700 | Entitlement or authorisation denied or revoked. |
| `kAFAssistantErrorDomain` | 216 | Recognition cancelled, or the app session ended. |
| `kAFAssistantErrorDomain` | 203 | Service failure. |
| `kAFAssistantErrorDomain` | 1101 | No app session is bound. |

Foundation validation failures are wrapped in `SPFXError` when a speech operation owns them. The browser adapter, ports, bindings and session factories are private and do not appear on the public root, SDK, browser or testing environment types.

## Testing

The deterministic tests cover the full flow through a capable port, and real plugin-compiled `.app` imports used after awaits, timers and callbacks. A narrow speech control in the test host lets you allow or deny access and deliver test transcripts without exposing the native adapter. Behaviour against a real speech service needs interactive testing on a capable host.
