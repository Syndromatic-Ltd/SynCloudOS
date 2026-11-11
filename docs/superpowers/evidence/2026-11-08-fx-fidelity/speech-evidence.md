# SpeechFX fidelity evidence - 8 November 2026

## Scope and authority

Framework worktree: `C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/framework`, branch `fix/blind-rewrite-friction`. Reviewed base: `3c197869240af3cf594bd04087e6ca70b3f7cdb4` (Network). Option A and Dispatch 1-6 were prerequisites. Root owns main PLAN/REPORT. This change implements Speech only and the necessary private runtime, hook, test-host, consumer, documentation and package gates. No other family implementation, site source/config, Fusion, server, protected port, branch, push, stash or extra worktree was changed.

Apple primary documentation was read directly as Markdown over HTTPS after the search connector could not fetch text/markdown: [SFSpeechRecognizer](https://developer.apple.com/documentation/speech/sfspeechrecognizer), [recognitionTask result handler](https://developer.apple.com/documentation/speech/sfspeechrecognizer/recognitiontask(with:resulthandler:)), [authorizationStatus](https://developer.apple.com/documentation/speech/sfspeechrecognizer/authorizationstatus()), [request](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest), [audio-buffer request](https://developer.apple.com/documentation/speech/sfspeechaudiobufferrecognitionrequest), [task](https://developer.apple.com/documentation/speech/sfspeechrecognitiontask), [task state](https://developer.apple.com/documentation/speech/sfspeechrecognitiontaskstate), [task hint](https://developer.apple.com/documentation/speech/sfspeechrecognitiontaskhint), [recognizer delegate](https://developer.apple.com/documentation/speech/sfspeechrecognizerdelegate), [task delegate](https://developer.apple.com/documentation/speech/sfspeechrecognitiontaskdelegate), [segment](https://developer.apple.com/documentation/speech/sftranscriptionsegment), and the individual isCancelled/isFinishing/shouldReportPartialResults pages. These confirm partial results default true, synchronous task return with asynchronous callbacks, sender-first delegate signatures and source-driven audio input.

## Complete admitted Apple member mapping

All files below are under `src/FX/SpeechFX`. Twelve runtime exports and two interface-only exports are enumerated through the runtime import and TypeScript symbol checker; every export is in appkit-counterparts.json and developer-MCP lookup tests. The three enum objects also provide same-named TypeScript union types. public.ts contains re-exports only.

| Apple type/member | SpeechFX member | File | Support/error |
|---|---|---|---|
| SFSpeechRecognizer.init(), init(locale:) | new SPFXSpeechRecognizer(locale?) | SPFXSpeechRecognizer.ts | Real private attributed subclass; passive selected-session binding. Base constructor explains plugin/application bundle requirement. Absent/ambiguous/ended sessions give SPFXError. |
| SFSpeechRecognizer.supportedLocales() | static supportedLocales(): ReadonlySet<Intl.Locale> | SPFXSpeechRecognizer.ts | Native Locale representation; capable port returns actual supported set. Browser enumeration throws NSCocoaErrorDomain/3328, never guesses from navigator languages. |
| SFSpeechRecognizer.authorizationStatus() | static authorizationStatus() | SPFXSpeechRecognizer.ts | Apple's four cases; shared app consent plus observed browser state. Origin grant alone leaves notDetermined. Saved consent cannot defeat denial. |
| SFSpeechRecognizer.requestAuthorization(handler) | static requestAuthorization(handler): void | SPFXSpeechRecognizer.ts | Speech-only authorization on capable ports; current browser adapter returns restricted without acquisition. Handler queued on selected main. Pending native authorization aborts on policy/privacy/session loss; stale grants stay invalid after regrant. Completed refusal is delivered as denied, not self-cancelled. |
| SFSpeechRecognizer.isAvailable, locale, supportsOnDeviceRecognition | same properties | SPFXSpeechRecognizer.ts | Intl.Locale is the standard Locale value because NSELocale does not exist. Browser isAvailable=false because supplied sources cannot be recognized; on-device=false. |
| SFSpeechRecognizer.delegate | delegate | SPFXSpeechRecognizer.ts | Nullable protocol, actual native availability observations, selected-session main delivery. |
| SFSpeechRecognizer.recognitionTask(with:resultHandler:), recognitionTask(with:delegate:) | recognitionTask(request, resultHandler), recognitionTask(request, delegate) | SPFXSpeechRecognizer.ts | Real task, two overloads. Result/error ordering is (result or null, error or null). Partial/final callbacks and full delegate flow run on capable ports. Unsupported sources report task SPFXError without microphone substitution. |
| SFSpeechRecognizerDelegate.speechRecognizer(_:availabilityDidChange:) | speechRecognizerAvailabilityDidChange(recognizer, available) | SPFXSpeechRecognizerDelegate.ts | Sender first. |
| SFSpeechRecognizerAuthorizationStatus | SPFXSpeechRecognizerAuthorizationStatus | SPFXSpeechRecognizerAuthorizationStatus.ts | notDetermined, restricted, denied, authorized. |
| SFSpeechRecognitionRequest.shouldReportPartialResults, requiresOnDeviceRecognition, taskHint, contextualStrings, addsPunctuation | same properties on abstract SPFXSpeechRecognitionRequest | SPFXSpeechRecognitionRequest.ts | Defaults true/false/unspecified/[]/false. Captured into native request. On-device guarantee unavailable produces SPFXError/3328. |
| SFSpeechRecognitionTaskHint | SPFXSpeechRecognitionTaskHint | SPFXSpeechRecognitionTaskHint.ts | unspecified, dictation, search, confirmation. |
| SFSpeechAudioBufferRecognitionRequest.append(AVAudioPCMBuffer), appendAudioSampleBuffer(CMSampleBuffer), endAudio() | append(AUFXAudioPCMBuffer), appendAudioSampleBuffer(MEFXSampleBuffer), endAudio() | SPFXSpeechAudioBufferRecognitionRequest.ts | Existing AudioFX/MediaFX types. Owned PCM/sample copies are delivered intact; ready audio sample data required. Caller closing its sample cannot invalidate appended audio. Request is single-use, bounded to 256 pending buffers and 64 MiB input. Native sample copies close at task completion/cancel. |
| SFSpeechAudioBufferRecognitionRequest.nativeAudioFormat | nativeAudioFormat: AUFXAudioFormat | SPFXSpeechAudioBufferRecognitionRequest.ts | Actual capable service format after asynchronous attachment; earlier/browser read throws SPFXError/3328. |
| SFSpeechURLRecognitionRequest.init(url:), url | new SPFXSpeechURLRecognitionRequest(URL), url | SPFXSpeechURLRecognitionRequest.ts | Standard owned URL value; capable port receives it. Browser task fails SPFXError/3328, without URL fetching or substituted capture. |
| SFSpeechRecognitionTask.state, isFinishing, isCancelled, error, finish(), cancel() | same members on issued SPFXSpeechRecognitionTask | SPFXSpeechRecognitionTask.ts | No public initializer or promise. finish permits final delivery; cancel terminally drops queued results. starting lasts through asynchronous acquisition. Native teardown may complete cancellation synchronously. |
| SFSpeechRecognitionTaskState | SPFXSpeechRecognitionTaskState | SPFXSpeechRecognitionTaskState.ts | starting, running, finishing, canceling, completed. |
| SFSpeechRecognitionTaskDelegate.speechRecognitionDidDetectSpeech, speechRecognitionTaskFinishedReadingAudio | same names | SPFXSpeechRecognitionTaskDelegate.ts | Sender first, speech detection/reading completion. |
| SFSpeechRecognitionTaskDelegate.speechRecognitionTask(_:didHypothesizeTranscription:), (_:didFinishRecognition:), (_:didFinishSuccessfully:), (_:didProcessAudioDuration:) | speechRecognitionTaskDidHypothesizeTranscription, speechRecognitionTaskDidFinishRecognition, speechRecognitionTaskDidFinishSuccessfully, speechRecognitionTaskDidProcessAudioDuration | SPFXSpeechRecognitionTaskDelegate.ts | Sender first, actual immutable transcription/final result/success/audio duration; final recognition precedes completion. |
| SFSpeechRecognitionTaskDelegate.speechRecognitionTaskWasCancelled | same name | SPFXSpeechRecognitionTaskDelegate.ts | One cancellation notification while authority remains; revoked owners receive no stale deliveries. |
| SFSpeechRecognitionResult.bestTranscription, transcriptions, isFinal | same properties | SPFXSpeechRecognitionResult.ts | Immutable issued class; native observations copied before queueing. |
| SFTranscription.formattedString, segments | same properties | SPFXTranscription.ts | Immutable issued transcription with actual segments; no invented aggregate confidence. |
| SFTranscriptionSegment.substring, substringRange, timestamp, duration, confidence, alternativeSubstrings | same properties | SPFXTranscriptionSegment.ts | Foundation NSERange in UTF-16 units; real timings/confidence/alternatives, validated and copied. Browser never fabricates them. |
| Speech NSError failures | SPFXError.domain, code, localizedDescription | SPFXError.ts | NSError-shaped class, mapped to NSError. Unsupported=NSCocoaErrorDomain/3328; authorization=kAFAssistantErrorDomain/1700; cancellation=216; generic service failure=203; unavailable app binding=1101. No DOMException/browser types in public Speech API. |

Apple's OperationQueue-valued recognizer.queue is explicitly omitted by owner decision: NSEOperationQueue does not exist and DispatchQueue is not substituted publicly. The admitted member list, not all newer/legacy Apple Speech functionality, defines this pass; no language-model or deprecated interaction/voice-analysis API was added.

## Private ownership and decisions

- Recognition consumes the supplied audio source. The current browser adapter has no backend for either admitted source, so both fail with SPFXError. isAvailable remains false; no fake timing, locale support or on-device claim is emitted. Following review, authorization is Speech-only: the current adapter reports unavailable/restricted without constructing recognition, capturing a microphone, transmitting audio or granting app consent. Capable internal services retain full authorization. This describes the current adapter rather than permanent browser-platform limits.
- No NSELocale exists. The owner accepted Intl.Locale/ReadonlySet<Intl.Locale> for Speech, alongside existing Foundation formatter string-locale conventions. Standard URL and NSERange, existing AUFXAudioPCMBuffer/AUFXAudioFormat and MEFXSampleBuffer are reused. No Foundation family was added.
- Constructors and static operations use createFXSessionBinding/fxAttributedClass only through fxRuntimeContracts. Object.defineProperty attaches attribution without a public computed-symbol declaration. Selected sessions are terminal. Callback defaults use dispatchQueueForSession(selectedSession).main; no ambient lookup or unbound main getter.
- Environment adapters live in a private WeakMap. A second private WeakMap associates the existing frozen app context with its mounted Speech port before session registration. No old client is retained on SynWareContextValue, SCOSFacade or SynCloudOSRuntimeEnvironment, including inferred browser contribution and testing environment signatures.
- Mounted authority combines launch entitlements, host policy, shared privacy, native observed denial and captured generations. Policy/store/session changes release native work. Pending authorization binds its privacy generation before awaiting native permission; policy loss also aborts its operation controller. Revocation followed by regrant cannot restore pending results. Late-produced native sessions are cancelled before dropping them, without cancelling replacement resources.
- Native and queued delivery both check lifetime/access. A recognizer ownership predicate also guards already-completed task deliveries queued before a component unmount. The hook returns the actual class and uses useInsertionEffect for true unmount, preserving StrictMode replay.
- SynWareRuntimeMount adds branding through a context copy. The hook resolves a unique matching app session by the exact mount AbortSignal plus runtime identity (or original context identity), never first/latest. Multiple exact matches fail SPFXError. Another mount with a duplicate configured runtime ID but distinct signal cannot be selected. Tests cover both this branded clone and the real mounted host path.
- The analogous previously committed Network hook still uses object-only matching; this investigation was reported to root and reserved for the authorised aggregate hooks phase. No Network source was changed.
- createSynWareTestHost's signature and exported entry remain unchanged. Its existing controls had no Speech service. The owner authorised narrow adapters.speech allow/deny/test-transcript controls plus counters for actual installed proof; these expose formattedString/isFinal, not private adapter/session/event types. Source/internal tests supply full timing and segment observations. Other families' controls and implementations were preserved.

## Removed public contracts and every consumer route

Deleted SPFXAuthorizationStatus, SPFXCapabilities and SPFXSpeechClient; replaced interface-only recognizer/request/task/result/transcription definitions with separate classes/protocols/enums. Removed public getCapabilities, getAuthorizationStatus, instance requestAuthorization, createRecognizer, dispose, request locale/reportsPartialResults/continuous/maximumAlternatives/signal, task.result promise and transcription.confidence. No aliases remain. Negative type tests intentionally mention removed names to prove rejection.

Deleted mountedSpeechClient.ts. Added mountedSpeechPort and private Speech internals. Migrated appRuntimeFacade, createSynWareContextValue, mountedEnvironmentClientRegistry, appContextTypes, SCOS bound/unbound projections, runtime environment type, BrowserRuntimeEnvironment, InstalledApplications capability report and BrowserSpeechAdapter. useSpeech now returns the real attributed recognizer.

Migrated phase5 browser Speech tests, mounted hook tests, shared privacy coverage, strict installed consumer probe and empty-entry package gate. Speech privacy cases formerly in the generic factory table now live as public-class authorization/task/ownership regressions in speech-flow.test.ts; unrelated family cases remain intact. Contacts-only hook coverage remains in phase5-speech-contacts-hooks.test.tsx; Speech has its real-context StrictMode tests. Updated phase5-packed.ts's installed type probe; created dedicated installed Speech .app and public-boundary fixtures. Added every new public counterpart/developer lookup assertion. Existing sdk-entries, sdk-package-manifest and compiler family routing already register fx/speech, so no extra entry or alias was needed.

Updated speech.md, FX README and authorization docs. Source/test/script searches find no remaining live old Speech consumer names (the AudioFX synthesis client is unrelated). Site `prerelease` has no SPFX/useSpeech/recognitionTask consumer in src/tests; its Gallery “Speech” example is AudioFX synthesis. Final Gallery/adoption may add the new recognition demonstration and must respect unsupported web sources. Site's existing SDK remains unchanged and its typecheck passes. No interim compatibility shim was created.

## Verification and RED/green evidence

- speech-initial-red.log: 2 expected missing-runtime-class failures; actual Apple exports/attribution then passed.
- speech-browser-red.log: 7 expected missing source/authorization adapter member failures; migrated browser tests now pass without substituting capture.
- speech-hook-red.log: queued completed result leaked after unmount; owner delivery guard fixes it.
- speech-branding-context-red.log: real branding-copy lookup failure reproduced; clone-safe exact mount lookup passes.
- speech-hook-ambiguity-red.log: first-match selection reached the wrong port instead of reporting ambiguity; unique-match check fixes it.
- speech-plugin-red.log: 2 genuine compiled .app failures for absent deterministic Speech control; narrow private fake association enables full flow.
- speech-package-red.log: 3 missing counterpart/runtime/package-probe failures; mappings and installed gate migrated.
- speech-unavailable-red.log: pending grant resurfaced after revoke/regrant, and unavailable source suppressed its error callback; privacy-generation-before-await and explicit unsupported-task failure paths fix both.
- speech-sample-red.log: supplied sample reused caller-owned object; independent copy/terminal cleanup fixes it.
- speech-authorization-abort-red.log: pending native authorization was not aborted by policy loss; per-operation controller now aborts immediately.
- speech-flow-red.log was an early broad contract run after the class scaffold and already passed; despite its filename it is not presented as RED evidence.
- speech-lifetime-green.log: 46/46 tests in 4 files after privacy, branding and owner-lifetime repairs.
- speech-boundary-green.log: 4/4 in 3 files, including source strict public signature compilation and runtime environment property absence.
- speech-sample-green.log: 22/22 in 2 files; final authorization-abort-green.log: 21/21 flow tests.
- speech-focused.log: **152/152 tests in 22/22 files pass**, covering Speech, shared privacy, actual mounted hooks, context/SCOS/test-host, app attribution, Dispatch binding, browser runtime and host contributions.
- speech-plugin-final.log: **2/2 actual plugin-compiled .app tests pass** after native await/timer/callback, including authorization, supplied PCM, real class results, denial, revocation/replacement, true teardown.
- speech-framework-typecheck.log and speech-site-typecheck.log: **both repository npx tsc -b --pretty false checks pass**; site branch remains prerelease and tracked status clean.
- speech-architecture.log: **1,700 files / 7,742 edges validated**, no exceptions.
- C: free space measured 274,422,050,816 bytes before build, above 20 GB throughout.
- Full suite intentionally not run; final serial acceptance belongs to root after all families.

## Staged bytes and SDK freeze

58 explicit owned source/test/doc paths were staged; each working file was byte-compared against its index object. Main PLAN/REPORT, unrelated evidence, .superpowers and site config are excluded. Source/shipped-doc/build inputs froze before SDK build. The SDK fingerprint explicitly excludes tests/receipts. A subsequent stronger whitespace split found three newly generated fixture files at Windows-default CRLF; only those new tests were normalized to LF and restaged before installed proof. No SDK fingerprint input changed, and the SDK build's frozen-input assertion passed.

The pre-existing phase5-mounted.test.tsx is wholly CRLF in HEAD (56/56 lines), so its original format was preserved (57/57 after the narrow edit). Byte checks confirm no CRCRLF and no trailing spaces/tabs. For all other 57 owned paths run ordinary `git diff --check -- <explicit paths>` and `git diff --cached --check -- <explicit paths>`. For this single pre-existing CRLF path run `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff [--cached] --check -- tests/runtime/fx/phase5-mounted.test.tsx`. Both staged and working split checks pass. No git configuration or gitattributes changes were made.

speech-sdk-build.log records the successful single SDK rebuild on those frozen inputs. Final immutable installed proof and commit receipts follow below.

## Exhaustive file inventory

This inventory has 58 explicit paths plus this evidence file. The original Speech recognizer/public files are replaced; mountedSpeechClient is deleted; all other new/modified ownership is listed. No wildcard staging was used.

- docs/framework/appkit-counterparts.json
- docs/framework/authorization.md
- docs/framework/fx/README.md
- docs/framework/fx/speech.md
- scripts/quality/architecture-boundaries.json
- scripts/synware/installed-consumer.mjs
- src/FX/SpeechFX/SPFXError.ts
- src/FX/SpeechFX/SPFXSpeechAudioBufferRecognitionRequest.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionRequest.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionResult.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionTask.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionTaskDelegate.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionTaskHint.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionTaskState.ts
- src/FX/SpeechFX/SPFXSpeechRecognizer.ts
- src/FX/SpeechFX/SPFXSpeechRecognizerAuthorizationStatus.ts
- src/FX/SpeechFX/SPFXSpeechRecognizerDelegate.ts
- src/FX/SpeechFX/SPFXSpeechURLRecognitionRequest.ts
- src/FX/SpeechFX/SPFXTranscription.ts
- src/FX/SpeechFX/SPFXTranscriptionSegment.ts
- src/FX/SpeechFX/internal/audioRequests.ts
- src/FX/SpeechFX/internal/speechPort.ts
- src/FX/SpeechFX/internal/speechSessionBindings.ts
- src/FX/SpeechFX/internal/speechTasks.ts
- src/FX/SpeechFX/internal/transcriptionValues.ts
- src/FX/SpeechFX/public.ts
- src/SynCloudOS/AppSDK/appContextTypes.ts
- src/SynCloudOS/AppSDK/appRuntimeFacade.ts
- src/SynCloudOS/AppSDK/createSynWareContextValue.ts
- src/SynCloudOS/AppSDK/hooks/useSpeech.ts
- src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts
- src/SynCloudOS/AppSDK/mountedSpeechClient.ts
- src/SynCloudOS/AppSDK/mountedSpeechPort.ts
- src/SynCloudOS/AppSDK/scos/scosFacade.ts
- src/SynCloudOS/AppSDK/testing/fakeAdapters.ts
- src/SynCloudOS/AppSDK/testing/testHostTypes.ts
- src/SynCloudOS/InstalledApplications/capabilityReport.ts
- src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts
- src/SynCloudOS/PlatformAdapters/BrowserSpeechAdapter.ts
- src/SynCloudOS/Runtime/runtimeInstanceTypes.ts
- tests/fixtures/speech-attribution/consumer.test.tsx
- tests/fixtures/speech-attribution/public-types.ts
- tests/fixtures/speech-attribution/src/SynWare/First.app/Contents/Info.ts
- tests/fixtures/speech-attribution/src/SynWare/First.app/Contents/index.tsx
- tests/fixtures/speech-attribution/vitest.config.mjs
- tests/runtime/fx/phase5-mounted.test.tsx
- tests/runtime/fx/phase5-package-gate.test.ts
- tests/runtime/fx/phase5-packed.test.ts
- tests/runtime/fx/phase5-speech-contacts-hooks.test.tsx
- tests/runtime/fx/phase5-speech.test.ts
- tests/runtime/fx/speech-apple.test.ts
- tests/runtime/fx/speech-counterparts.test.ts
- tests/runtime/fx/speech-flow.test.ts
- tests/runtime/fx/speech-hook.test.tsx
- tests/runtime/fx/speech-host-boundary.test.ts
- tests/runtime/fx/speech-packed.test.ts
- tests/runtime/fx/speech-public-types.test.ts
- tests/runtime/privacy-new-fx.test.ts

## Initial frozen artifact acceptance (superseded by review correction below)

- speech-sdk-build.log: the single SDK build passed its frozen-source assertion. No production source, shipped documentation or build-input edits followed freeze.
- speech-packed.log: **3/3 installed tests in 3/3 files pass** (speech-packed, phase5-packed, packed-fx). Speech includes **2/2 nested actual installed plugin .app flow tests**, after await/timer/callback, supplied audio, authorization, denial, stale revocation/replacement and teardown. Vite production build/import and one shared attribution-runtime module also pass. The consumer is independently npm-installed outside the repository without links and is removed by the existing harness.
- Strict installed public-types.ts compiles with skipLibCheck:false against /browser, /sdk/testing, /sdk, root, /foundation, /fx/audio and /fx/speech. Removed names and inferred adapter extraction are required type errors; positive real class/delegate/request/task/Foundation usage compiles.
- Actual emitted declaration graphs from root, /sdk, /sdk/testing, /browser and /fx/speech each reach **zero Speech internal modules**. Direct class declaration text has no internal ports, attribution symbols, browser fields, old clients or promises. Runtime probes reject private package paths and inspect actual family exports.
- Installed SDK resource integrity remains identical after the real app, production bundle/import, strict typing and graph proofs. A final captureSdkSourceFingerprint comparison matches the built archive after proof.
- Archive SHA-256: `3385175b7faa597e7efd5bdef4c0a9f1d132cf9cdcdfdd10790938d74b7e548a`.
- Source SHA-256: `b799d0d9aa99b044998339fd25f94067115a19f1e43f2c6bf32018e4832f0887`.
- Resources SHA-256: `689d5d6cf278711523017659d8f45c6240fd2edbc4bacf3fb35d7b852b85047f`.
- C: free after proof: 274,372,628,480 bytes. Site SDK adoption/Gallery and physical browser acceptance remain deferred as scoped; no unsupported-source support claim is made.

Commit: one explicit-path commit titled **FX: rebuild SpeechFX with attributed Apple recognition tasks**. It contains the 58 listed paths plus this evidence file. Exact SHA is written to speech-commit.txt after commit and returned to root, avoiding a self-referential hash. Root PLAN/REPORT and unrelated files remain outside it.

## Review correction: Speech-only authorization and authoritative refusal

Review of initial commit 6940da82064c1541398ffc4a1c6c354f5770cbbf found an Important bug: a native NotAllowedError normalized to SPFXError could leave a prior grant intact and cause the public requestAuthorization callback to report authorized. A raw refusal could also revoke the completed request's own lease and lose its denied completion. Root additionally identified that starting browser microphone recognition merely to authorize was incompatible with Apple's source-free Speech authorization and could acquire/transmit audio outside an AudioFX capture request. Both findings supersede the initial authorization implementation and acceptance above.

The current BrowserSpeechAdapter now has **no native recognition constructor, browser-window options, event handlers or microphone-start code**. authorizationStatus and requestAuthorization return unavailable internally (public restricted); an already-ended request owner still fails with SPFXError cancellation. A request does not grant app consent. No AudioFX permission/capture flow or new microphone API was added. Its source requests remain explicit unsupported failures. Documentation states a limitation of this current adapter, not that all browser implementations are permanently incapable.

Capable private services retain the full authorization flow. createMountedSpeechPort detects raw NotAllowedError and already-normalized SPFXError(kAFAssistantErrorDomain, 1700) inside the native request operation. It returns a denied result into PrivacyApplicationPort.requestAuthorization before further normalization. The existing shared denial path records decision/browserStatus denied and releases the completed request lease before revoking active resources. Thus the public completion reports denied exactly once, subsequent authorizationStatus stays denied despite the adapter's previous granted status, and running tasks are cancelled. The captured generation and ended-operation checks still precede committing the result, so pending refusals/grants do not bypass revocation or revive after regrant.

Five unintended copyright changes are restored from Â© to © in hooks/useSpeech.ts, BrowserSpeechAdapter.ts, phase5-package-gate.test.ts, phase5-speech-contacts-hooks.test.tsx and privacy-new-fx.test.ts. Exact UTF-8 byte checks compare each restored header line to the reviewed Network parent 3c19786. All other bytes in those header-only corrections are preserved; there is no encoding-driven broad rewrite.

Correction inventory (12 existing owned paths; no additional public exports or new host API):

- docs/framework/authorization.md
- docs/framework/fx/speech.md
- docs/superpowers/evidence/2026-11-08-fx-fidelity/speech-evidence.md
- src/SynCloudOS/AppSDK/hooks/useSpeech.ts (header only)
- src/SynCloudOS/AppSDK/mountedSpeechPort.ts
- src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts
- src/SynCloudOS/PlatformAdapters/BrowserSpeechAdapter.ts
- tests/runtime/fx/phase5-package-gate.test.ts (header only)
- tests/runtime/fx/phase5-speech-contacts-hooks.test.tsx (header only)
- tests/runtime/fx/phase5-speech.test.ts
- tests/runtime/fx/speech-flow.test.ts
- tests/runtime/privacy-new-fx.test.ts (header only)

Exact covering command: `npx vitest run tests/runtime/fx/phase5-speech.test.ts tests/runtime/fx/speech-flow.test.ts`.

- speech-review-red.log: **5 failed / 24 passed, 2 files**. Three browser failures prove the old passive status and authorization requests instantiate native recognition. Two capable-port tests start from a saved grant and prove raw denial loses its completion while normalized denial incorrectly reports authorized.
- speech-review-green.log: **29/29 passed, 2 files** after both fixes.
- speech-review-covering.log: **30/30 passed, 2 files**, including an additional public-browser regression showing restricted completion/status, shared decision remaining prompt, browserStatus unavailable and zero recognition-start calls. Full capable flow, real buffers/segments/delegates, policy/privacy/session teardown and stale-generation tests remain intact. Removed browser capture tests covered the now-deleted behavior; cancellation/service denial guarantees remain exercised through capable private ports.
- speech-review-focused.log: **154/154 tests, 22/22 files pass** with the same full focused file set listed in speech-focused.log. This includes every new covering regression plus shared privacy, hooks, actual mounted path, public types, attribution, Dispatch, host/context/browser integration.
- speech-review-plugin.log: exact command `npx vitest run --config tests/fixtures/speech-attribution/vitest.config.mjs`; **2/2 actual plugin-compiled .app tests pass**.
- speech-review-framework-typecheck.log and speech-review-site-typecheck.log: exact command `npx tsc -b --pretty false` in each repository; **both exit 0**. Site remains prerelease with no tracked changes or SDK adoption.
- speech-review-architecture.log: exact command `node scripts/quality/architecture-boundaries.mjs`; **1,700 files / 7,743 edges validated**.

The 12 correction paths were explicitly staged and every file byte-compared with the index before SDK freeze. Default working/staged whitespace checks apply to all normal files; the previously committed wholly-CRLF phase5-mounted.test.tsx alone uses the documented cr-at-eol check. The full intended amended diff against 3c19786 passes the same split, and that test remains ordinary CRLF without CRCRLF or trailing blanks. Root PLAN/REPORT and review evidence outside this file are excluded from staging. The correction performs one replacement SDK rebuild; the final immutable proof is recorded next. No full suite, other family implementation, site config, server or protected-port operation was added.

### Review correction final frozen acceptance

- `npm run sdk:build` → speech-review-sdk-build.log: **exit 0**, one replacement SDK rebuild, frozen-source assertion passed. No production source, shipped documentation, fixture or build input changed after this correction freeze.
- `npx vitest run tests/runtime/fx/speech-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → speech-review-packed.log: **3/3 tests, 3/3 files passed**, exit 0. This repeats the immutable installed actual-entry proof, including **2/2 nested compiled .app flow tests**, after await/timer/callback, full capable audio/result flow, denied access, stale replacement and teardown.
- The repeated installed proof also passes Vite production bundle/import checks, strict public types with skipLibCheck:false, exact runtime class exports, blocked private package routes and one shared attribution runtime. Actual declaration graphs for root, /sdk, /sdk/testing, /browser and /fx/speech again each contain **zero Speech internal modules**. Installed resources remain byte-identical after proof.
- Corrected archive SHA-256: `6f25d1417457125aba2002d66c36a52008c38f282af26d6b35d974c1dfebe9b6`.
- Corrected source SHA-256: `3ca899baa8042f50b31bd70c35953aa7ab9f164ccc6887e992302ec5e73915bb`.
- Corrected resources SHA-256: `e13c15ca15aac936d1ee95b4f966207af14bcf56d60f4fcf2c57c279a950192a`.
- speech-review-installed.json and speech-installed.json identify this corrected artifact; the initial hashes above are superseded. captureSdkSourceFingerprint still matches after all installed checks and is rechecked after amendment.
- Default/scoped whitespace checks and exact staged-byte comparisons pass again before amendment. All five restored copyright lines are byte-equal to the pre-Speech parent. Last measured C: free space was 274,354,896,896 bytes, above the 20 GB floor.
- One Speech commit is retained by amending 6940da8 with only these 12 explicit paths. The revised SHA is written to speech-commit.txt and speech-review-commit.txt and returned to root for scoped independent re-review. Main PLAN/REPORT remain root-owned and unstaged. Full suite/site adoption/physical capable-service testing remain deferred; current browser authorization performs no capture.
