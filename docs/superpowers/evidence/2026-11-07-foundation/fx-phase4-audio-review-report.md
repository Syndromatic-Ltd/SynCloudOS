# AudioFX independent review

Reviewed and hardened only the authorised AudioFX synthesis/category files. Root retains runtime/context/hook integration. Speech recognition's `mountedSpeechClient.ts` was neither edited nor staged.

## Findings and fixes

- Category disposal previously reset the global browser type to auto even when another session owned it. Native-object-keyed arbitration now selects the most recently configured live owner, restores its predecessor on release, restores the original type after final release, leaves a sibling unchanged when an older owner exits, and respects a different externally assigned native type. Independently constructed browser adapters share the same arbitration.
- Category support was incorrectly contingent on getUserMedia and MediaRecorder. The platform now exists independently for native session types; capabilities report capture separately and unsupported capture rejects without requesting permission.
- Caller cancellation disposed native objects but retained mounted resource quota slots. Audio sessions and synthesis now release their leases on caller/mount abort. Disposal is idempotent, including release-triggered abort reentrancy.
- Synthesis attached voiceschanged listeners to already aborted owners. It now avoids both native and abort listeners in that case.
- A synchronous speaking-state observer could dispose before queue admission, leaving newly queued work after disposal. Admission now precedes notification, so disposal drains it safely before dispatch.
- Late callbacks retain job identity checks; active completion additionally checks current manifest authority and rejects revoked work. Saved callbacks cannot settle a subsequent owner.
- Cancelling a paused owner now resumes the shared native queue before handing off; cancellation failure cannot prevent promise settlement and ownership release.
- Speech voice/language inputs now validate runtime types and length. Synthesizer ports use a true private field.
- Added public guide details for audio.speech versus audio.session authority, ownership, cancellation, browser category hints and limitations. Included root's approved pre-existing API/facade changes in the bounded commit.

## Evidence

Three RED logs prove failures before fixes: `fx-phase4-audio-review-red.log` (5 failures), `fx-phase4-audio-review-leases-red.log` (3 failures), `fx-phase4-audio-review-values-red.log` (1 failure).

`npx.cmd vitest run tests/runtime/fx/speech-synthesis.test.ts tests/runtime/fx/audio-session-category.test.ts`: 15/15 pass (`fx-phase4-audio-review-green.log`).

`npx.cmd vitest run tests/runtime/fx/speech-synthesis.test.ts tests/runtime/fx/audio-session-category.test.ts tests/runtime/fx/audio-capture.test.ts tests/runtime/fx/audio-route-recovery.test.ts tests/runtime/fx/audio-teardown-regressions.test.ts tests/runtime/fx/audio-live.test.ts`: 39/39 pass in 6 files (`fx-phase4-audio-review-regression.log`).

Both required typechecks ran after tsconfig syntax settled: `npx.cmd tsc -b --pretty false` and `npx.cmd tsc -p tests/types/tsconfig.authoring-6e.json --noEmit`. Both exit 1 on concurrent work outside this review: AppManager policy/configurationProfiles migration, appRuntimeFacade implicit arguments and missing phase-5 mounted clients, LUFXHostService configurationProfiles options; tsc -b additionally reports useNetwork referencing absent SCOSFacade.network. Neither log contains diagnostics for owned files (`fx-phase4-audio-review-typecheck.log`, `fx-phase4-audio-review-authoring.log`).

`node scripts/quality/architecture-boundaries.mjs`: exit 1 on six missing phase-5 policy aliases: bluetooth, nfc, speech, contacts, pass and xr (`fx-phase4-audio-review-boundaries.log`). No alias/configuration edits made here.

## Limits and remaining integration

These are source runtime tests with injected native platforms, not real browser or physical speech/microphone acceptance. Root must finish runtime/context/hook/manifest wiring, rerun shared checks after concurrent migrations settle, package/adopt the SDK, and perform browser acceptance. Synthesis authority changes have no push notification: checks occur before admission, dispatch and completion. Native cancellation is best effort. Browser category mappings remain hints rather than AVAudioSession parity. External writes of exactly the same native type cannot be distinguished from the framework's own last write.

Commit SHA is supplied in the task completion message; commit uses `--only` explicit owned paths and does not consume the shared index.
