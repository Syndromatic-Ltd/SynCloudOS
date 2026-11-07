# SpeechFX

SpeechFX (`SPFX`) follows Speech's recognizer, request, task and result model. The browser implementation uses Web Speech recognition, including the prefixed implementation where available. It provides foreground microphone recognition. It does not promise offline or on-device processing: browsers often send microphone audio to a vendor service.

Declare `speech.recognize` in the app's `Info.ts` entitlements. Mounted declaration and policy checks run before authorization requests and recognition, and before delivering results. Browser permission and browser service availability are separate from those checks.

```ts
import { useSpeech } from "@syndromatic/syncloudos/sdk";

const speech = useSpeech(); // In a component; creates an owner after commit.

// In a user action handler:
if (speech.getCapabilities().recognition) {
  const task = speech.recognitionTask({
    locale: "en-GB",
    reportsPartialResults: true,
  }, result => {
    console.log(result.bestTranscription.formattedString, result.isFinal);
  });
  const result = await task.result;
  console.log(result.bestTranscription.formattedString);
}
```

`SPFXSpeechClient.getCapabilities()` and `createRecognizer(signal?)` are passive. `getAuthorizationStatus()` is also passive: it returns `unknown` until this recognizer observes a browser start or denial, then `granted` or `denied`. This is the last observed recognition authorization, not a guarantee that the browser will permit a future request. Unsupported, insecure or disposed owners report `unavailable`. A mounted owner reports `denied` when the app declaration or host policy blocks access. The status vocabulary is `unknown`, `prompt`, `granted`, `denied`, `unavailable`.

`requestAuthorization(signal?)` makes a real browser recognition request and aborts it immediately after the browser signals that recognition started. The web has no independent speech-authorization request equivalent to Apple's. This method can activate the microphone and the browser's recognition service, and can show a browser prompt; call it from a user action. It returns `denied` for browser permission denial and rejects for cancellation, service failures or an already active request. Apps may instead begin `recognitionTask` directly.

`SPFXSpeechRecognitionRequest` accepts `locale`, `reportsPartialResults`, `continuous`, `maximumAlternatives` and a cancellation `signal`. One task can run per recognizer. `task.finish()` asks the browser to stop audio and finalize recognition; `task.cancel()` aborts and rejects `task.result` with `AbortError`. Both remain available after app access is revoked; final results still require authority before delivery. The result promise settles with the last browser result when recognition ends, or rejects if no result was produced. Interim snapshots carry `isFinal: false`. Results and transcription arrays are immutable copies, so later browser updates cannot change a delivered snapshot. Segment boundary whitespace is trimmed before transcripts are joined with one space; text within each segment is preserved. Web alternatives do not provide Apple's word timing or segment metadata.

The component hook owns the recognizer in a layout effect. Aborted renders start no recognition owner. StrictMode replay disposes the previous owner; component unmount and session unmount abort active recognition, detach handlers and reject pending work. The explicit `dispose()` method has the same effect. A request signal only cancels its own task. No recognition is started by mounting, factory creation or capability inspection.

Host integration injects `BrowserSpeechAdapter({ isSecureContext, browserWindow })`, where `browserWindow` supplies `SpeechRecognition` and/or `webkitSpeechRecognition`. The adapter never obtains a global window or navigator. Feature presence does not prove that a language, browser service, microphone, embedded frame or permission policy will work. Real browser microphone prompts and remote service behavior require interactive device testing; deterministic adapter tests verify snapshots, status mapping, permission checks and cleanup.
