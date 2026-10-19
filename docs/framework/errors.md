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
| `disposal?: { reason: string; stack?: string }` | First recorded disposal reason and, in development, its stack. |
| `creationStack?: string` | Development-only resource creation stack. |
| `ownerStack?: string` | Development-only React owner stack, when React can supply one. |

The message names the resource, operation, problem and suggested fix, ending with `[CODE]`. An unidentified resource omits the quoted id. Built-in disposal reasons are `explicit`, `owner-unmounted`, `owner-signal-aborted` and `application-closed`; some resources supply a more specific reason. Creation, disposal and React owner stacks are not captured in production.

The first disposal wins, including when an owner signal aborts before a later explicit `dispose()`. A closed application needs a new resource when it opens again. Component-owned resources must not outlive their component. For NSE controllers use the managed hooks rather than `useMemo` plus effect cleanup: React StrictMode replays effect cleanup without unmounting the component. See [controller lifetimes](controllers.md#controller-lifetimes).

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
