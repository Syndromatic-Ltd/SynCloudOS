/** Application authoring surface; the Vite plugin binds SCOS per app folder. */
export * from "./sdkPackageEntry";
export { SCOS, useSCOS } from "./scos";
export { definePreferencePane } from "../Preferences";
export { defineWidget, defineIntegration, defineWebspring } from "../../Webspring/public";
export type { SynWareIntegrationInput, SynWareIntegrationDefinition } from "../../Webspring/public";
export { NSEObject, observable, observe, useObserve } from "../../NSE/sdkPackageEntry";
export type { NSEObservable } from "../../NSE/sdkPackageEntry";
export { preference } from "../../NSE/sdkPackageEntry";
export type { NSEPreferenceDescriptor } from "../../NSE/sdkPackageEntry";
export { observes } from "../../NSE/sdkPackageEntry";
export type { NSEObservationOptions } from "../../NSE/sdkPackageEntry";
export { createNSETabSelectionRestoration } from "../../NSE/sdkPackageEntry";
export type { NSENavigationRestorationDescriptor } from "../../NSE/sdkPackageEntry";
export { bind, createNSEBinding, useNSEBinding } from "../../NSE/sdkPackageEntry";
export type { NSEBinding, NSEBindingValue, NSEBindingSnapshot, NSEBindingCommitResult, NSEBindingEdit, NSEBindingOwner, NSEBindingAdapter, NSEBoundValueProps, NSEBindingView, NSEWritableBindingKey } from "../../NSE/sdkPackageEntry";
export { managedTask, NSETaskQueueFullError } from "../../NSE/sdkPackageEntry";
export type { NSETaskLifetime, NSETaskSettlement, NSETaskContext, NSETaskRun, NSETaskSnapshot, NSEManagedTask, NSETaskOptions } from "../../NSE/sdkPackageEntry";
export { NSEApplication, NSEWindowController, NSEViewController, NSETitlebarAccessoryViewController, NSEAlert, NSEAlertButton, NSEModalResponse } from "../../NSE/sdkPackageEntry";
export type { NSEAlertStyle, NSEPopoverPositioning } from "../../NSE/sdkPackageEntry";
export { outlet } from "../../NSE/sdkPackageEntry";
export type { NSEViewOutlet, NSEOutletElement, NSEOutletOptions } from "../../NSE/sdkPackageEntry";
export type { NSEManagedAFXDisplayLink, NSEManagedAFXDisplayLinkOptions, NSEManagedAFXFrame, NSEManagedAFXRenderer, NSEManagedAFXRendererOptions, NSEManagedAFXRendererSnapshot } from "../../NSE/sdkPackageEntry";
export type {
  NSEAnyWindowController, NSEApplicationClass, NSEApplicationContext, NSEControllerView, NSEOpenWindowOptions,
  NSEViewComponent, NSEViewControllerClass, NSEViewControllerOptions, NSEViewControllerFX, NSEViewControllerFXClients,
  NSEWindow, NSEWindowCloseOutcome, NSEWindowContentBorderEdge, NSEWindowControllerClass, NSEWindowControllerContext, NSEWindowControllerOptions, NSEWindowDocument,
} from "../../NSE/sdkPackageEntry";
