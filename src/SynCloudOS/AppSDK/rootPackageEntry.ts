/** Application authoring surface; the Vite plugin binds SCOS per app folder. */
export * from "./sdkPackageEntry";
export { SCOS, useSCOS } from "./scos";
export { definePreferencePane } from "../Preferences";
export { defineWidget, defineIntegration, defineWebspring } from "../../Webspring/public";
export type { SynWareIntegrationInput, SynWareIntegrationDefinition } from "../../Webspring/webspringIntegration";
export { NSEObject, observable, observe, useObserve } from "../../NSE/Objects";
export type { NSEObservable } from "../../NSE/Objects";
export { NSEActionScopeProvider } from "../../NSE/Controls/Core/useNSEControlAction";
export type { NSEActionScopeProviderProps } from "../../NSE/Controls/Core/useNSEControlAction";
export { NSEApplication, NSEWindowController, NSEViewController } from "../../NSE/Application";
export type {
  NSEAnyWindowController, NSEApplicationClass, NSEApplicationContext, NSEControllerView, NSEOpenWindowOptions,
  NSEViewComponent, NSEViewControllerClass, NSEViewControllerOptions, NSEViewControllerFX, NSEViewControllerFXClients,
  NSEWindow, NSEWindowCloseOutcome, NSEWindowControllerClass, NSEWindowControllerContext, NSEWindowControllerOptions, NSEWindowDocument,
} from "../../NSE/Application";
