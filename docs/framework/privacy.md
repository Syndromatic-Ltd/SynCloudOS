# Per-application privacy authorisation

The runtime privacy store is the shared consent database behind device framework `authorizationStatus` and request methods. A record belongs to a user, an application bundle identifier and a framework service (`location`, `camera`, `microphone`, `screenCapture`, `motion`, `midi`, `midi.sysex`, `bluetooth`, `nfc`, `speech`, `contacts`, `payment`, `xr`, or another framework-owned service).

An entitlement declares what an app can request. The privacy database records what the user has permitted. Browser permissions are a third input: no local grant can override browser denial or make an unavailable device work. These client-side checks coordinate trusted applications in one runtime; they are not a sandbox against arbitrary JavaScript sharing the page or origin.

## Host service

`createPrivacyStore({ runtimeId, persistence?, preferenceKey?, now?, requestConsent? })` creates one independent store. Persistence is an injected `getPreference`/`setPreference` port already scoped to the host/runtime namespace; the store does not read global local storage. A host deliberately sharing a persistence namespace shares its persisted consent records. Otherwise separate runtimes have independent state.

The host can:

- obtain `forApplication({ userId, appId, service, signal? })`, a scoped port that cannot choose another app after construction;
- call `setAuthorization(scope, "granted" | "denied" | "prompt")` for an explicit user choice in Privacy & Security;
- call `revoke(scope)` to deny access and abort/release active work;
- subscribe to immutable `getSnapshot()` values for Privacy & Security;
- dispose the service, aborting all work and making retained ports unavailable.

Bundle identifiers are compared without case. User IDs remain exact and do not share consent. Persisted records are versioned, bounded and validated as one document: an unknown version, malformed entry or duplicate identity discards the document. No malformed input becomes a grant. Persistence failures leave the current session's in-memory decision effective; they do not fabricate persistence success.

## Framework integration

A scoped `PrivacyApplicationPort` supplies:

| Method | Behaviour |
|---|---|
| `authorizationStatus(browserStatus?)` | Synchronous combination. Browser denial/unavailability wins. A fresh app returns `prompt`, even when the origin's browser permission is already granted. With an existing local grant, browser `prompt` and `unknown` remain visible as such. Omit browser status only when reading the app's local gate or the last observed status. |
| `getAuthorizationStatus(query?)` | Passive asynchronous browser query. It never requests consent or grants the app. The query receives an owner cancellation signal. |
| `observe(browserStatus)` | Records a passive browser observation for presentation. A browser denial also revokes live work. It never changes local app consent. |
| `assertRequestAllowed()` | Stops denied/unavailable or cancelled owners before adapter work. `prompt` is allowed to initiate a real request. |
| `request(operation, { signal?, dispose? }?)` | Runs an explicit framework request with a cancellation signal; success records app consent. Permission errors record denial; cancellation/timeouts/device errors do not. `dispose` releases a resource returned too late after revocation/cancellation. |
| `requestAuthorization(operation, { signal? }?)` | For frameworks returning a permission status: only `granted` records a grant, `denied` records a refusal. Other status results remain observations. |
| `bindResource(dispose)` | Binds a live watch/session to its app consent and mount lifetime. The returned function unregisters the binding when the framework releases it normally. |

For example, the mounted location manager can pass its browser status query to `getAuthorizationStatus`, pass one-shot fix acquisition to `request`, and bind an ongoing watch's disposer with `bindResource`. The browser operation must honour the supplied signal, and resource-returning operations should supply `dispose` even when the underlying browser promise ignores cancellation.

The optional `requestConsent(scope, signal)` host callback can draw a separate app consent prompt. A rejected, failed or cancelled host prompt never reaches the browser operation. Without it, the explicit FX request and browser permission interaction are the consent authority. Passive browser observation never serves as app consent.

A consent revocation aborts active requests immediately, releases bound resources, and prevents stale successful values from reaching an app. Re-enabling the local gate permits a new request; it does not resurrect a cancelled watch or in-flight operation. Mount cancellation permanently invalidates that mount's port. Switching user must cancel the former user's mounted ports or bind new ones with the new user ID.

## Verification and limits

`tests/runtime/privacy-store.test.ts` covers passive-query behaviour, browser precedence, app/user/runtime isolation, persisted-record validation, explicit requests, error classification, host consent, immutable snapshots, live resource revocation, late-result disposal and service disposal. Browser prompts and actual device acceptance require browser/device verification by each FX family. Local consent records and the diagnostic history are not tamper-proof server audit evidence.
