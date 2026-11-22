# Errors and outcomes

This page explains how SynCloudOS reports failures: which outcomes throw and which return a result, the lifecycle error class, what an error report contains, and every stable error code. Decide how to handle an error from its type and code, never its message, because message wording can change between releases. The installed SDK includes this guide and the matching `tooling/error-catalogue.json`, and the [Developer MCP](developer-mcp.md) can explain a code offline.

## Outcome rules

| Situation | Contract | Application handling |
| --- | --- | --- |
| Programming error, including use after disposal | Throw an error; lifetime violations use `SynCloudOSLifecycleError` where listed below | Fix the owner or the order of calls. Don't retry with the same disposed object. |
| Unavailable optional capability | Return the API's structured availability or denial result | Inspect the result and offer a supported alternative. Required-capability acquisition may throw as its API documents. |
| Stale UI event after its resource ended | Ignore the event and warn in development | NSE data views retain their last snapshot, become inert and warn once per view. Direct controller calls still throw. See [controller lifetime](data-views.md#controller-lifetime). |
| Cancellation | Reject or throw `DOMException` named `AbortError`, or propagate the supplied signal's reason | End the operation without presenting cancellation as a crash. An explicit abort reason need not be a `DOMException`. |
| Security or ownership violation | Throw the documented security, access or ownership error | Fix the permission or resource owner; never quietly fall back to something another owner holds. |

Where an API documents its own result type, that takes precedence. Expected refusals, limits and unsupported features keep their own contracts.

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

The message is one short sentence, such as `Cannot set AFXLayer.hidden after disposal.` or `Cannot call NSEArrayController.select() after disposal.` A resource that doesn't record how the operation was reached says `Cannot use …`. The code, resource identity, disposal reason and stacks are fields, not part of the message, and the fix is in the code's catalogue hint. The built-in disposal reasons are `explicit`, `owner-unmounted`, `owner-signal-aborted` and `application-closed`, and some resources give a more specific one. Creation, disposal and React owner stacks aren't captured in production.

The first disposal is the one recorded, even when an owner signal aborts before a later explicit `dispose()`. An application that closes needs new resources when it opens again, and a resource a component owns must not outlive it. For NSE controllers, use the managed hooks instead of `useMemo` with effect cleanup, because React StrictMode runs effect cleanup again without unmounting the component. See [controller lifetimes](controllers.md#controller-lifetimes).

## Error reports

An error alert has two layers. The part everyone sees is plain language, a title and one sentence, such as "SynCloudOS stopped unexpectedly." with "An unexpected error has prevented SynCloudOS from working properly." for the root watchdog, or "Notes stopped unexpectedly." with "An unexpected error has prevented this application from working properly." for an application. Titles use the application's display name. Codes, class names and thrown messages never appear here.

Everything meant for developers is inside the Technical details disclosure, which opens with the error's identity:

```text
Exception: SynCloudOSLifecycleError
Code: AFX_LAYER_DISPOSED
Message: Cannot set AFXLayer.hidden after disposal.
Caught by: SynCloudOS.RootWatchdog
```

- Exception: the thrown value's class name, such as `SynCloudOSLifecycleError` or `TypeError`. A thrown non-`Error` value reads `Non-Error value (string)` or similar.
- Code: the error's one authoritative code (see below).
- Message: the thrown error's own message.
- Caught by: the boundary that caught the error. The stack further down shows where it started.

A condition the framework reports itself, such as a connection error or an unknown route, has no Exception or Message line, and says Reported by in place of Caught by.

The rest of the details follow, leaving out anything unknown: the condition's detail line, the lifecycle resource identity and disposal reason, the problem, the source location, the application, window and route, severity and whether it's recoverable, the catalogue hint and docs, and the stack. The thrown error's cause, the development-only disposal stack and the React component stack come last. Unknown fields are left out instead of printed as `none`, and nothing appears twice. The report you can copy (`toTechnicalReport`, also shown in the Inspector) holds the title, the message, the technical details and the time of capture.

The Hint and Docs lines come from the code's catalogue entry. A generic boundary code such as `APP_CONTENT_FAILED` covers any error that has no code of its own, so its entry also lists known failures by message, in `diagnoses`. When the thrown message, or one in its cause chain, matches, the report shows that failure's own hint and docs. For example, `NSEMenuBar requires an NSEOverlayProvider.` points you to where overlay controls must render. A diagnosis changes only the hint; the code stays the same.

Inside an application, report a failure you caught with `SCOS.errors.capture(error, { operation, code?, timeoutMs?, retry? })`; [Webspring's recovery alerts](webspring.md#recovery-alerts) describe the codes and `retry`. Host code that captures through the runtime's error manager supplies a plain `title` and `message` for the user and passes the thrown value as `error`, whose identity goes into the technical details.

### Code identity

One error has one code:

- A thrown value with a catalogue code keeps it. Every `SynCloudOSLifecycleError` has one, as does any error whose `code` property is a catalogue code.
- The catching boundary's generic code applies only when the thrown value has no catalogue code. Examples are `UNKNOWN_RUNTIME_ERROR` at the root watchdog, `APP_CONTENT_FAILED` at an application watchdog, `APP_LAUNCH_FAILED`, `GLOBAL_SCRIPT_ERROR` and `UNHANDLED_PROMISE_REJECTION`.

Branch on `captured.code` and `captured.exception`, never on message text.

## Contracts kept unchanged

Some resources kept their existing cancellation and invalid-state errors when the lifecycle errors were introduced, and still throw these instead of `SynCloudOSLifecycleError`:

| Resource or area | Preserved type | Reason |
| --- | --- | --- |
| Animation runtime, ImageFX operations, LuminaFX, MIDIFX, LocationFX, MediaFX clocks/timebases, VideoFX frame processing | `DOMException` named `AbortError` | These operations already expose cancellation, including disposal, through the web-platform cancellation contract. |
| Data-view drag operations and shaped text layout adapters | `DOMException` named `AbortError` | Ending an owner cancels work in progress, which isn't a programming error. |
| `AFXRenderer`, TextFX layout cache, VideoFX decoders, encoders and pixel-buffer pools | `DOMException` named `InvalidStateError` | Their documented states stay distinguishable from other errors. |
| PDF resources | `GFXPDFError` with code `"disposed"` | PDF code already handles this error union. |
| Other existing `DOMException` sites | Existing `name` and abort reason | Security, quota, access, state and cancellation errors keep their types. |

The document store and internal host services also keep their own errors and result types, as do ordinary validation errors, graph rendering errors and registrations invalidated by a haptic reset.

## Source maps

The SDK ships `.js.map` files beside its JavaScript entries, chunks and workers. The maps embed the original source (`sourcesContent`), so browser developer tools can show framework stack frames without a framework checkout. They help with the ordinary stack of a thrown error, but can't recover the lifecycle stacks that production builds never capture. Package fingerprints include the map files, and the maps contain no absolute paths from the build machine.

## Code catalogue

This table lists every stable uppercase code in the offline catalogue. Lowercase codes (for example PDF `"disposed"` or the route result `"route-not-found"`) belong to their own APIs, not to this list. A test checks that this table matches the catalogue exactly.

| Code | Meaning |
| --- | --- |
| `APP_NOT_FOUND` | Requested application is not registered. |
| `ROUTE_NOT_FOUND` | No registered application route matches the address. |
| `APP_LAUNCH_FAILED` | Application launch or lifecycle transition failed. |
| `APP_NOT_RESPONDING` | Application response deadline expired. |
| `SITE_NOT_RESPONDING` | Host response deadline expired. |
| `CONNECTION_ERROR` | Network operation failed or the browser is offline. |
| `APP_CONTENT_FAILED` | Application rendering or an application operation failed. |
| `LIFECYCLE_HOOK_FAILED` | An application lifecycle method such as `applicationDidFinishLaunching` threw or rejected. It raises no alert of its own; a later fatal report for the same application lists it in its technical details, because a failure after launch often causes the error that finally stops the application. |
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
| `SCOS_APP_NOT_FOUND` | `SCOS.open` could not find the requested bundle identifier or route in the catalogue. |
| `APP_DISABLED` | A required application service or capability is unavailable. |
| `CONFIGURATION_AUTHORISE_THROWN` | Launch authorisation callback threw. |
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
