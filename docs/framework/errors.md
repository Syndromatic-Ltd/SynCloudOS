# Errors and outcomes

Choose handling by the outcome's type and stable code, not its message. Error prose explains the failure and can change between releases. The installed SDK includes this guide and the version-matched `tooling/error-catalogue.json`; the [Developer MCP](developer-mcp.md) can explain a code offline.

## Outcome rules

| Situation | Contract | Application handling |
| --- | --- | --- |
| Programming error, including use after disposal | Throw an error; lifetime violations use `SynCloudOSLifecycleError` where listed below | Correct the owner or call sequence. Do not retry with the same disposed object. |
| Unavailable optional capability | Return the API's structured availability or denial result | Inspect the result and offer a supported alternative. Required-capability acquisition may throw as its API documents. |
| Stale UI event after its resource ended | Ignore the event and warn in development | NSE data views retain their last snapshot, become inert and warn once per view. Direct controller calls still throw. See [controller lifetime](data-views.md#controller-lifetime). |
| Cancellation | Reject or throw `DOMException` named `AbortError`, or propagate the supplied signal's reason | End the operation without presenting cancellation as a crash. An explicit abort reason need not be a `DOMException`. |
| Security or ownership violation | Throw the documented security, access or ownership error | Fix the permission or resource owner; never silently fall back across an ownership boundary. |

These rules do not replace an API's documented result type. Expected refusals, limits and unsupported features retain their specific contracts.

## Lifecycle errors

Import the public class from the SDK entry:

```ts
import { SynCloudOSLifecycleError } from "@syndromatic/syncloudos/sdk";

try {
  controller.select([itemId]);
} catch (error) {
  if (error instanceof SynCloudOSLifecycleError) {
    console.error(error.code, error.resource, error.operation, error.disposal);
  }
  throw error;
}
```

`SynCloudOSLifecycleError` extends `Error` and has `name: "SynCloudOSLifecycleError"`.

| Field | Meaning |
| --- | --- |
| `code: string` | Stable diagnostic identifier in the code table below. |
| `resource: { kind: string; id?: string }` | Resource family and the caller-provided identity, where available. |
| `operation: string` | Public operation that could not run. |
| `access?: "call" \| "get" \| "set"` | How the operation was reached, when the resource records it. |
| `problem?: string` | A resource-specific cause, when the disposal reason alone does not explain it. |
| `disposal?: { reason: string; stack?: string }` | First recorded disposal reason and, in development, its stack. |
| `creationStack?: string` | Development-only resource creation stack. |
| `ownerStack?: string` | Development-only React owner stack, when React can supply one. |

The message is one short factual sentence, such as `Cannot set AFXLayer.hidden after disposal.` or `Cannot call NSEArrayController.select() after disposal.` A resource that does not record how the operation was reached says `Cannot use …`. The code, resource identity, disposal reason and stacks are fields, not message text, and the remedy is the code's catalogue hint. Built-in disposal reasons are `explicit`, `owner-unmounted`, `owner-signal-aborted` and `application-closed`; some resources supply a more specific reason. Creation, disposal and React owner stacks are not captured in production.

The first disposal wins, including when an owner signal aborts before a later explicit `dispose()`. A closed application needs a new resource when it opens again. Component-owned resources must not outlive their component. For NSE controllers use the managed hooks rather than `useMemo` plus effect cleanup: React StrictMode replays effect cleanup without unmounting the component. See [controller lifetimes](controllers.md#controller-lifetimes).

## Error reports

An error alert has two layers. What everyone sees is plain language: a title and one sentence, such as "SynCloudOS stopped unexpectedly." with "An unexpected error has prevented SynCloudOS from working properly." for the root watchdog, or "Notes stopped unexpectedly." with "An unexpected error has prevented this application from working properly." for an application. Titles name an application by its display name. Codes, class names and thrown messages never appear in this layer.

Everything developer-facing is inside the single **Technical details** disclosure. It opens with the error's identity:

```text
Exception: SynCloudOSLifecycleError
Code: AFX_LAYER_DISPOSED
Message: Cannot set AFXLayer.hidden after disposal.
Caught by: SynCloudOS.RootWatchdog
```

- **Exception** is the thrown value's class name, such as `SynCloudOSLifecycleError` or `TypeError`. A thrown non-`Error` value reads `Non-Error value (string)` or similar.
- **Code** is the error's one authoritative code (see below).
- **Message** is the thrown error's own message.
- **Caught by** names the boundary that caught the error. Where it originated is the stack further down.

A condition the framework reports itself, such as a connection error or an unknown route, has no Exception or Message line, and says **Reported by** instead of Caught by.

The rest of the technical details follows, and only what is known: the condition's detail line, the lifecycle resource identity and disposal reason, the problem, the source location, the application, window and route, severity and recoverability, the catalogue hint and docs, and the stack. The thrown error's cause, the development-only disposal stack and the React component stack come last. Unknown fields are omitted rather than printed as `none`, and no text appears twice. The copyable report (`toTechnicalReport`, also in the Inspector's error report) is the title, the message, the technical details and the capture time.

When you capture through `runtime.errors.capture`, supply a plain `title` and `message` for the person, and pass the thrown value as `error`; its identity goes into the technical details.

### Code identity

One error has one code:

- A thrown value that carries a catalogue code keeps it. Every `SynCloudOSLifecycleError` does, as does any error whose `code` property is a catalogue code.
- The capturing boundary's generic code applies only when the thrown value has no catalogue code. Examples are `UNKNOWN_RUNTIME_ERROR` at the root watchdog, `APP_CONTENT_FAILED` at an application watchdog, `APP_LAUNCH_FAILED`, `GLOBAL_SCRIPT_ERROR` and `UNHANDLED_PROMISE_REJECTION`.

Branch on `captured.code` and `captured.exception`, never on message text.

## Contracts kept unchanged

The lifecycle migration intentionally preserves typed cancellation and invalid-state contracts. In particular:

| Resource or area | Preserved type | Reason |
| --- | --- | --- |
| Animation runtime, ImageFX operations, LuminaFX, MIDIFX, LocationFX, MediaFX clocks/timebases, VideoFX frame processing | `DOMException` named `AbortError` | These operations already expose cancellation, including disposal, through the web-platform cancellation contract. |
| Data-view drag operations and shaped text layout adapters | `DOMException` named `AbortError` | Ending an owner cancels in-flight work rather than reporting a new programming-error type. |
| `AFXRenderer`, TextFX layout cache, VideoFX decoders, encoders and pixel-buffer pools | `DOMException` named `InvalidStateError` | Their documented state-machine contract remains distinguishable from other errors. |
| PDF resources | `GFXPDFError` with code `"disposed"` | PDF clients rely on the existing domain error union. |
| Other existing `DOMException` sites | Existing `name` and abort reason | Security, quota, access, state and cancellation types are not converted by this migration. |

DocumentStore and internal host services are outside this lifecycle cutover. Their existing domain errors and result types remain unchanged. Ordinary validation errors, graph-rendering errors and registration invalidated by a haptic reset also retain their existing types.

## Source maps

The SDK ships separate `.js.map` files alongside its reviewed JavaScript entries, chunks and workers. Maps embed original source text (`sourcesContent`) so browser developer tools can resolve framework stack frames without a framework checkout. Production lifecycle provenance stacks remain disabled; source maps help inspect the normal thrown-error stack, not recover stacks that were never captured. Package fingerprints include map bytes. Source-map metadata must not contain build-machine absolute paths.

## Code catalogue

This table lists every stable uppercase diagnostic code in the offline catalogue. Lowercase domain codes (for example PDF `"disposed"` or route result `"route-not-found"`) belong to their own API unions, not this global namespace. The catalogue coverage test scans source property literals, conditional branches and lifecycle code literals, and checks this table matches the catalogue exactly.

| Code | Meaning |
| --- | --- |
| `APP_NOT_FOUND` | Requested application is not registered. |
| `ROUTE_NOT_FOUND` | No registered application route matches the address. |
| `APP_LAUNCH_FAILED` | Application launch or lifecycle transition failed. |
| `APP_NOT_RESPONDING` | Application response deadline expired. |
| `SITE_NOT_RESPONDING` | Host response deadline expired. |
| `CONNECTION_ERROR` | Network operation failed or the browser is offline. |
| `APP_CONTENT_FAILED` | Application rendering or an application operation failed. |
| `UNKNOWN_RUNTIME_ERROR` | An unexpected error reached a runtime boundary. |
| `GLOBAL_SCRIPT_ERROR` | An uncaught script error reached the watchdog. |
| `UNHANDLED_PROMISE_REJECTION` | A promise rejected without a handler. |
| `RUNTIME_EVENT_LISTENER_FAILED` | Runtime subscriber threw or rejected. |
| `ASSET_LOAD_FAILED` | A visual resource failed to load. |
| `FEATURE_NOT_IMPLEMENTED` | A requested system action has no implementation. |
| `UNRECOVERABLE_LOGIN_SESSION_MISMATCH` | Authentication session and runtime ownership disagree. |
| `NSE_CONTROLLER_DISPOSED` | NSE controller was used outside its lifetime. |
| `NSE_CONTROLLER_UNOWNED` | A controller constructed outside an owner needs `owner` or `ownerSignal`. |
| `NSE_VIEW_NOT_LOADED` | A view controller's element or layer was accessed before mounting or after unmounting. |
| `SCOS_APP_NOT_RUNNING` | The app bound to `SCOS` has no running session. |
| `SCOS_AMBIGUOUS_SESSION` | Several runtimes mount the same app; select one with `useSCOS()`. |
| `SCOS_UNBOUND` | The calling file has no app binding; use `SCOS` in an app folder or `useSCOS()` in a shared component. |
| `SCOS_APP_NOT_FOUND` | `SCOS.open` could not find the requested app ID in the catalogue. |
| `APP_DISABLED` | A required application service or capability is unavailable. |
| `POLICYKIT_AUTHORISE_THROWN` | Launch authorisation callback threw. |
| `RUNTIME_TRANSACTION_FAILED` | Runtime command or transaction observer threw. |
| `NSE_MENU_DISPATCH_FAILED` | Menu command failed. |
| `NO_FOCUSED_WINDOW` | Open windows exist but none is key. |
| `FOCUSED_WINDOW_NOT_FRONT` | Key window is not front-most. |
| `WINDOW_PRESENTATION_GEOMETRY_INVALID` | Window presentation bounds are invalid. |
| `AFX_LAYER_DISPOSED` | Animation layer was used after disposal. |
| `AFX_EMITTER_LAYER_DISPOSED` | Particle emitter layer was used after disposal. |
| `AFX_TILED_LAYER_DISPOSED` | Tiled layer was used after disposal. |
| `AFX_TRANSACTION_DISPOSED` | Animation transaction was run after disposal. |
| `AUFX_AUDIO_ENGINE_DISPOSED` | Audio engine was used after disposal. |
| `AUFX_AUDIO_FILE_DISPOSED` | Disposed audio file data was requested. |
| `AUFX_AUDIO_PLAYER_NODE_DISPOSED` | Audio player node was used after disposal. |
| `GFX_BITMAP_CONTEXT_DISPOSED` | Bitmap context was used after disposal. |
| `HFX_HAPTIC_ENGINE_DISPOSED` | Haptic engine was used after disposal. |
| `HFX_HAPTIC_ADVANCED_PATTERN_PLAYER_DISPOSED` | Haptic pattern player was used after disposal. |
| `MEFX_BLOCK_BUFFER_DISPOSED` | Closed block buffer was used. |
| `MEFX_BUFFER_QUEUE_DISPOSED` | Media buffer queue was used after disposal. |
| `TFX_FONT_DISPOSED` | Font was used after disposal. |
| `MFX_MOTION_MANAGER_DISPOSED` | Motion manager was used after disposal. |
| `NSE_TEXT_STORAGE_DISPOSED` | Text storage was used after disposal. |
| `NSE_TEXT_OWNER_DISPOSED` | Text owner was used after disposal. |
| `NSE_TEXT_HISTORY_OWNER_DISPOSED` | Text history owner was used after disposal. |
| `NSE_TEXT_INPUT_CLIENT_DISPOSED` | Text input client was used after disposal. |
| `NSE_TEXT_EDITING_SESSION_DISPOSED` | Text editing session was used after disposal. |
| `NSE_DOCUMENT_TEXT_OWNER_DISPOSED` | Document text owner ended or lost its native identity. |
| `NSE_TEXT_INSPECTOR_BINDING_DISPOSED` | Text inspector binding was used after disposal. |
| `NSE_TOOLBAR_CONTROLLER_DISPOSED` | Toolbar controller was used after disposal. |
| `NSE_OVERLAY_MANAGER_DISPOSED` | Overlay manager was used after disposal. |
