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
  {code:"ROUTE_NOT_FOUND",title:"SynCloudOS could not match the requested address to a registered SynWare",cause:"No registered manifest route matches the pathname.",fix:"Declare the route in Info.ts and register its bundle; check the host base path.",docs:"docs/framework/routing.md"},
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
].map(entry => Object.freeze(entry)));
