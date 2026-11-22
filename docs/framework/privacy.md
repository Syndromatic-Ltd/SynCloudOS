# Per-application privacy authorisation

This page explains how the runtime records a user's consent for each application to use each device service. The privacy store sits behind every FX framework's `authorizationStatus` and request methods. Each record belongs to a user, an application's bundle identifier and a service (`location`, `camera`, `microphone`, `screenCapture`, `motion`, `midi`, `midi.sysex`, `bluetooth`, `nfc`, `speech`, `contacts`, `payment`, `xr`, or another service a framework defines).

The store and its ports are internal to the framework: `createPrivacyStore` and `PrivacyApplicationPort` aren't exported from any package entry. Applications use the FX request methods, and users manage their choices in System Preferences. This page is for understanding how those behave, and for contributors adding a framework.

An entitlement declares what an application can ask for, and the privacy store records what the user has allowed. Browser permissions are a third input: no local grant can override a browser denial or make an unavailable device work. These checks coordinate trusted applications in one runtime and can't contain other JavaScript running in the same page or origin.

## Host service

`createPrivacyStore({ runtimeId, persistence?, preferenceKey?, now?, requestConsent? })` creates a store. `persistence` is a `getPreference`/`setPreference` port already scoped to the runtime's namespace, and the store never reads `localStorage` directly. Runtimes that share a persistence namespace share their consent records; otherwise each runtime has its own.

The runtime can:

- get a port for one application with `forApplication({ userId, appId, service, signal? })`; the port can't be pointed at another application afterwards;
- record the user's choice from Privacy & Security with `setAuthorization(scope, "granted" | "denied" | "prompt")`;
- deny access and stop active work with `revoke(scope)`;
- read immutable snapshots with `getSnapshot()` and subscribe to changes, for Privacy & Security;
- dispose the store, which stops all work and makes every port unusable.

Bundle identifiers are compared without regard to case. User IDs must match exactly, so different users never share consent. Saved records are versioned, size-limited and validated as one document: an unknown version, a malformed entry or a duplicate discards the whole document, so bad data never becomes a grant. If saving fails, the decision still applies for the current session, but isn't reported as saved.

## Framework integration

A `PrivacyApplicationPort` for one application and service provides:

| Method | Behaviour |
|---|---|
| `authorizationStatus(browserStatus?)` | Combines the user's choice with the browser status, synchronously. A browser denial or unavailable device wins. An application that hasn't asked yet gets `prompt`, even if the browser already granted the site. With a local grant, a browser `prompt` or `unknown` is reported as it is. Leave out the browser status only to read the user's choice or the last status observed. |
| `getAuthorizationStatus(query?)` | Asks the browser for its status, asynchronously, without requesting anything or granting the application. The query receives a cancellation signal. |
| `observe(browserStatus)` | Records a status the browser reported, for display. A browser denial also revokes live work. It never changes the user's choice. |
| `assertRequestAllowed()` | Throws before any browser work if access is denied or unavailable, or the application has ended. `prompt` is allowed through so a real request can start. |
| `request(operation, { signal?, dispose? }?)` | Runs a framework request with a cancellation signal. Success records consent and a permission error records a denial; cancellation, timeouts and device errors record nothing. `dispose` releases a resource that arrives after revocation or cancellation. |
| `requestAuthorization(operation, { signal? }?)` | For frameworks whose request returns a permission status: `granted` records a grant and `denied` a refusal. Any other status is only recorded as an observation. |
| `bindResource(dispose)` | Ties a live watch or session to the application's consent and lifetime. It returns a function that removes the binding when the framework releases the resource normally. |

For example, a location manager passes its browser status query to `getAuthorizationStatus`, a single position fix to `request`, and a running watch's disposer to `bindResource`. The browser operation must honour the signal it's given, and an operation that returns a resource should supply `dispose` even if the browser promise ignores cancellation.

The optional `requestConsent(scope, signal)` callback lets the host show its own consent prompt first. If that prompt is refused, fails or is cancelled, the browser is never asked. Without it, the FX request and the browser's permission prompt decide consent. A status read from the browser never counts as consent.

Revoking consent aborts active requests at once, releases bound resources and stops late results from reaching the application. Turning access back on allows a new request, but doesn't restart a cancelled watch or operation. When an application ends, its port stops working for good. When the user changes, the old user's ports must be cancelled, or new ones created with the new user ID.

## Verification and limits

`tests/runtime/privacy-store.test.ts` covers status queries, browser precedence, isolation between applications, users and runtimes, validation of saved records, requests, error classification, host consent prompts, immutable snapshots, revoking live resources, disposing late results and disposing the store. Real browser prompts and devices have to be checked separately for each FX framework. Local consent records and the diagnostic history aren't tamper-proof evidence for a server audit.
