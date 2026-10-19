/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** Add stable error codes here when introducing them; the build ships this data to offline developer tools. */
export interface ErrorCatalogueEntry {
  readonly code: string;
  readonly title: string;
  readonly cause: string;
  readonly fix: string;
  /** Version-matched path relative to the installed SDK package. */
  readonly docs?: string;
  readonly appliesTo?: string;
}
export const errorCatalogue: readonly ErrorCatalogueEntry[] = Object.freeze([
  {code:"APP_NOT_FOUND",title:"SynCloudOS could not find an app registered with that identifier",cause:"The requested app id is absent from the registered composition.",fix:"Check manifest.id and include the bundle in the host's bundles array.",docs:"docs/framework/getting-started.md"},
  {code:"ROUTE_NOT_FOUND",title:"SynCloudOS could not match the requested address to a registered SynWare",cause:"No registered manifest route matches the pathname.",fix:"Declare the route in Info.ts and register its bundle; check the host base path.",docs:"docs/framework/synware-sdk.md"},
  {code:"APP_LAUNCH_FAILED",title:"SynCloudOS could not load the requested content",cause:"Loading or starting the app rejected.",fix:"Inspect the original technical message, verify the app entry export and resolve failing imports or startup operations.",docs:"docs/framework/getting-started.md"},
  {code:"APP_NOT_RESPONDING",title:"Application has stopped responding",cause:"The app response deadline expired.",fix:"Inspect long synchronous work and unresolved startup operations; move expensive work off the main thread.",docs:"docs/framework/synware-sdk.md"},
  {code:"SITE_NOT_RESPONDING",title:"Site has stopped responding",cause:"The site response deadline expired.",fix:"Inspect blocked host initialization and main-thread work before retrying.",docs:"docs/framework/getting-started.md"},
  {code:"CONNECTION_ERROR",title:"Connection Error: could not connect to the server",cause:"The browser is offline or a server request failed.",fix:"Check connectivity, request URL, server availability and response details; retry only after resolving the connection failure.",docs:"docs/framework/getting-started.md"},
  {code:"APP_CONTENT_FAILED",title:"An unexpected error has prevented this application from working properly",cause:"An app's rendering boundary caught an exception.",fix:"Use the technical message and component stack to fix the throwing app code.",docs:"docs/framework/synware-sdk.md"},
  {code:"UNKNOWN_RUNTIME_ERROR",title:"SynCloudOS caught an unexpected rendering error before it could blank the screen",cause:"An exception reached the root runtime boundary.",fix:"Inspect the original stack and fix the failing host or framework operation.",docs:"docs/framework/getting-started.md"},
  {code:"GLOBAL_SCRIPT_ERROR",title:"A browser-level script error escaped the runtime watchdogs",cause:"An uncaught browser script error reached the global watchdog.",fix:"Inspect the script URL, line and original stack; handle the failure at its source.",docs:"docs/framework/synware-sdk.md"},
  {code:"UNHANDLED_PROMISE_REJECTION",title:"An asynchronous runtime operation failed without handling its rejection",cause:"A promise rejected without an attached rejection handler.",fix:"Await the operation in a try/catch or attach a rejection handler and surface the original cause.",docs:"docs/framework/synware-sdk.md"},
  {code:"RUNTIME_EVENT_LISTENER_FAILED",title:"An EventBus subscriber failed while SynCloudOS was dispatching a runtime event",cause:"A runtime event listener threw or rejected.",fix:"Inspect the listener's original stack and handle failures inside the subscriber; dispose subscriptions with their owner.",docs:"docs/framework/synware-sdk.md"},
  {code:"ASSET_LOAD_FAILED",title:"A page resource failed to load",cause:"A visual resource URL could not be loaded.",fix:"Check the resource path, emitted assets, deployment base URL and network response.",docs:"docs/framework/getting-started.md"},
  {code:"FEATURE_NOT_IMPLEMENTED",title:"The requested feature has not been implemented yet",cause:"A system action has no registered implementation.",fix:"Register the feature implementation or avoid presenting that action until it is available.",docs:"docs/framework/synware-sdk.md"},
  {code:"UNRECOVERABLE_LOGIN_SESSION_MISMATCH",title:"Login session mismatch",cause:"The active authentication session disagrees with the runtime's session ownership.",fix:"Inspect authentication configuration and session changes; end the invalid session and sign in again rather than reusing its resources.",docs:"docs/framework/authentication.md"},
  {code:"NSE_CONTROLLER_DISPOSED",title:"Controller is disposed: a disposed NSE controller was used",cause:"A component disposed a controller in effect cleanup during React StrictMode replay, or a shorter-lived owner ended before its consumer.",fix:"For component ownership use useNSEArrayController(options, deps?) or useNSETreeController(options, deps?). For session ownership pass ownerSignal: useSynWare().signal to the controller constructor; do not dispose session-owned controllers in component cleanup. Never dispose module singletons.",docs:"docs/framework/controllers.md#controller-lifetimes",appliesTo:"NSE controllers"},
  {code:"APP_DISABLED",title:"Application is disabled",cause:"A required service or declared application capability is unavailable.",fix:"Inspect the registered application's availability and its required services before offering launch.",docs:"docs/framework/synware-sdk.md"},
  {code:"POLICYKIT_AUTHORISE_THROWN",title:"Launch authorisation failed",cause:"The host's policy authorisation callback threw instead of returning a decision.",fix:"Inspect and fix the authorisation callback; return an explicit refusal for an expected denial.",docs:"docs/framework/synware-sdk.md"},
  {code:"RUNTIME_TRANSACTION_FAILED",title:"Runtime transaction failed",cause:"A runtime command or transaction observer threw.",fix:"Inspect the original exception and transaction identity; correct the failing command or observer.",docs:"docs/framework/commands-responders-undo.md"},
  {code:"NSE_MENU_DISPATCH_FAILED",title:"Menu command failed",cause:"The selected menu command threw or rejected.",fix:"Inspect the command's original failure and handle expected unavailability before dispatch.",docs:"docs/framework/commands-responders-undo.md"},
  {code:"NO_FOCUSED_WINDOW",title:"No window is key",cause:"The inspector found open windows without a focused window.",fix:"Inspect window activation and the focused-window identity.",docs:"docs/framework/windows.md"},
  {code:"FOCUSED_WINDOW_NOT_FRONT",title:"Key window is not front-most",cause:"The focused window does not match the front-most window in the stacking order.",fix:"Inspect window activation and z-order updates together.",docs:"docs/framework/windows.md"},
  {code:"WINDOW_PRESENTATION_GEOMETRY_INVALID",title:"Window geometry is invalid",cause:"A window presentation produced invalid bounds.",fix:"Supply finite window bounds and inspect the window's layout constraints.",docs:"docs/framework/windows.md"},
  ...([
    ["AFX_LAYER_DISPOSED", "AFXLayer"],
    ["AFX_EMITTER_LAYER_DISPOSED", "AFXEmitterLayer"],
    ["AFX_TILED_LAYER_DISPOSED", "AFXTiledLayer"],
    ["AFX_TRANSACTION_DISPOSED", "AFXTransaction"],
    ["AUFX_AUDIO_ENGINE_DISPOSED", "AUFXAudioEngine"],
    ["AUFX_AUDIO_FILE_DISPOSED", "AUFXAudioFile"],
    ["AUFX_AUDIO_PLAYER_NODE_DISPOSED", "AUFXAudioPlayerNode"],
    ["GFX_BITMAP_CONTEXT_DISPOSED", "GFXBitmapContext"],
    ["HFX_HAPTIC_ENGINE_DISPOSED", "HFXHapticEngine"],
    ["HFX_HAPTIC_ADVANCED_PATTERN_PLAYER_DISPOSED", "HFXHapticAdvancedPatternPlayer"],
    ["MEFX_BLOCK_BUFFER_DISPOSED", "MEFXBlockBuffer"],
    ["MEFX_BUFFER_QUEUE_DISPOSED", "MEFXBufferQueue"],
    ["TFX_FONT_DISPOSED", "TFXFont"],
    ["MFX_MOTION_MANAGER_DISPOSED", "MFXMotionManager"],
    ["NSE_TEXT_STORAGE_DISPOSED", "NSETextStorage"],
    ["NSE_TEXT_OWNER_DISPOSED", "NSETextOwner"],
    ["NSE_TEXT_HISTORY_OWNER_DISPOSED", "NSETextHistoryOwner"],
    ["NSE_TEXT_INPUT_CLIENT_DISPOSED", "NSETextInputClient"],
    ["NSE_TEXT_EDITING_SESSION_DISPOSED", "NSETextEditingSession"],
    ["NSE_DOCUMENT_TEXT_OWNER_DISPOSED", "NSEDocumentTextOwner"],
    ["NSE_TEXT_INSPECTOR_BINDING_DISPOSED", "NSETextInspectorBinding"],
    ["NSE_TOOLBAR_CONTROLLER_DISPOSED", "NSEToolbarController"],
    ["NSE_OVERLAY_MANAGER_DISPOSED", "NSEOverlayManager"],
  ] as const).map(([code, resource]) => ({
    code,
    title: `${resource} is no longer active`,
    cause: `An operation used ${resource} after disposal or after its owner ended.`,
    fix: "Stop using the resource once it is disposed, and do not keep it past its owner's lifetime; create a new one for the current owner. A dispose() in a useEffect cleanup also runs during React StrictMode's effect replay while the component stays mounted: let a managed hook or an owner signal own the resource instead. The error's disposal reason and development stacks show which owner ended it.",
    docs: "docs/framework/errors.md#lifecycle-errors",
    appliesTo: resource,
  })),
].map(entry => Object.freeze(entry)));
