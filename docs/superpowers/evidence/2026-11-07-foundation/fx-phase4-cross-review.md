# Phase 4 cross-area review

Read-only source review of CryptoFX, AudioFX synthesis/category additions and NSERoutePickerView against the approved phase-4 requirements. Reviewed their focused tests and crypto/audio review reports. Pending shared context/runtime/site integration is excluded. No source changes or full test reruns. Only this report was written.

## Findings

### P2 — P256 public-key wrappers admit other curves and algorithms

`src/FX/CryptoFX/CRFXCrypto.ts:105` and `:118` expose public constructors taking arbitrary CryptoKey objects without checking key.type, algorithm.name, namedCurve or usages. `fromRawRepresentation` correctly enforces P-256, but direct construction bypasses that invariant.

An in-memory esbuild bundle of the actual CryptoFX public entry (write:false) wrapped a WebCrypto P-384 ECDSA public key as CRFXP256SigningPublicKey. `rawRepresentation()` returned a 97-byte P-384 point and `isValidSignature()` returned true for its P-384 signature: `{"wrappedCurve":"P-384","rawPointBytes":97,"signatureAccepted":true}`. Thus an object advertised as P256 can emit bytes its own P256 raw importer rejects, and can validate signatures on a different curve. Agreement wrappers likewise admit invalid/wrong-curve keys and defer failure to later deriveBits calls.

Make native-key construction private/internal, or reject anything except an appropriate public ECDSA/ECDH P-256 key with expected usages. Add narrow wrong-curve, wrong-algorithm and private-key construction regressions. This is an API/algorithm invariant defect, not evidence of a WebCrypto primitive failure or secret leak.

### P2 — Route lifecycle changes do not reliably refresh the control

`src/SynCloudOS/PlatformAdapters/BrowserVideoPresentationAdapter.ts:116` resets availability/state during stopDiscovery without notifying observers; `:125` clears subscribers during disposal without a final state notification. Revocation detected by `update` at `:124` takes that silent disposal path. A connected/enabled picker can therefore retain stale UI after explicit stop, caller/mount abort, or revoked authority, until another React render happens. The native prompt still enforces authority; this is stale interaction/accessibility state rather than permission bypass.

An in-memory bundle of the actual adapter reproduced `{"before":{"state":"disconnected","enabled":true},"after":{"state":"unknown","enabled":false},"notifications":0}` when authority was revoked and a native disconnect event arrived.

Additionally `src/NSE/Controls/Media/NSERoutePickerView.tsx:34` snapshots only connectionState while rendering capability-dependent enablement at `:38`. Even a delivered notification with unchanged connectionState cannot refresh changed capabilities through useSyncExternalStore. Publish lifecycle state changes before clearing observers and snapshot the primitive state needed for enablement as well as connection state. Add narrow tests for disposal/stop/revocation while mounted and capability-only changes.

## Checked without additional findings

- CRFX bytes: input snapshots precede awaits; NSEData copies inputs and returned byte views. AES-GCM combined nonce/ciphertext/tag framing, 12-byte nonce and 16-byte tag checks, HKDF limits, IEEE P1363 ECDSA documentation, and raw SEC1 public-key imports align with the declared API. Existing vector tests cover algorithm results; this review did not rerun them.
- Audio synthesis: shared native-object queue serialises framework owners; queued cancellation avoids cancelling siblings, active cancellation hands off, paused cancellation resumes, callback identity prevents late settlement of another job, and mounted abort returns leases. Authority rechecks before admission/dispatch/completion match the explicitly documented lack of push revocation notification.
- Audio categories: native-object-keyed last-live-owner arbitration restores predecessor/baseline, older-owner removal does not clobber the active owner, external different-type writes survive release, and category support remains independent of microphone capture. Category permission is separate from record permission.
- Route control invokes the browser chooser directly from an NSEButton click, delegates rejection to onError, exposes a meaningful accessible label and connected pressed state, and respects unsupported capability at initial render. Actual browser/physical route acceptance remains outside this review.

## Authorised remediation and element capability extension

After the read-only review, root authorised source fixes for both findings and the missing element capability query. Both findings above describe the pre-fix state and are now resolved in these working-tree changes.

- CRFX constructors now use intrinsic CryptoKey accessors for genuine native-key brand checking and reject anything except public ECDSA/ECDH P-256 keys with the expected verification/empty agreement usages. Tests reject P384, private keys, wrong algorithms, empty verification usages, shaped fake keys, forged CryptoKey prototypes and own-property type spoofing; valid public-key round trips still work.
- Route detector reset/disposal publishes the final state before clearing observers; observer exceptions cannot prevent cleanup. Revocation emits a terminal state notification without delivering a route. The picker external-store snapshot includes capability and connection state, so capability-only changes update enablement. Tests cover actual detector stop/abort while rendered plus capability-only mocked updates.
- Added host-only `elementCaptureCapabilities(track?)` and public optional capture capability flags `elementRestriction`/`elementCrop`. Before grant these report factory availability; after grant they also require the private live display track's matching method. Missing helper/factory, camera and disposed paths report false. Updated video guide and the existing exact capability fixture.

TDD evidence: focused review run initially failed three regressions (P384 wrapper accepted; route reset lacked notification; capability-only picker change stayed enabled). Element-query test separately failed because the query did not exist. Final focused command covering cryptofx, video presentation, video element capture, existing video capture and route picker passed **34/34 tests in 5 files**.

Both full and authoring typechecks ran after edits and remain blocked by concurrent root-owned manifest.permissions/entitlements migration and pending facade fields; neither reported diagnostics in remediated sources. Architecture currently stops on missing network/crypto policy alias registrations. No full-suite, browser-device or installed-package acceptance claimed. Only explicitly owned source/test/doc/report paths enter the remediation commit.
