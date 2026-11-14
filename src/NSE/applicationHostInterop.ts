/** Internal NSE/host interoperability. Never a package consumer entry or app-authoring API.
 * These forwards preserve the defining modules' symbols, ownership state and metadata registries.
 */
export { NSEApplication } from "./Application/NSEApplication";
export type { NSEApplicationClass, NSEApplicationContext, NSEOpenWindowOptions } from "./Application/NSEApplication";
export { NSEWindowController, validateNSEWindowControllerClass, nseWindowInternals, nseSetKeyWindowModalPresenter } from "./Application/NSEWindowController";
export type { NSEAnyWindowController, NSEWindowControllerClass, NSEWindowControllerContext, NSEWindowMount } from "./Application/NSEWindowController";
export { validateNSEViewControllerClass, nseAttachView, nseUpdateTraits, nseUpdateViewActivity, nsePopoverPositioning, nsePresentationStyle, nseUpdateSafeArea } from "./Application/NSEViewController";
// Safe areas and window chrome obstructions, measured by the framework host.
export { NSEViewSafeAreaContext, useNSEViewSafeArea } from "./Layout/useNSESafeArea";
export { NSEWindowLayoutContext, useNSEWindowChromeElement } from "./Layout/windowChromeObstructions";
export { useNSEScreenSafeAreaProperties } from "./Layout/screenSafeAreaProperties";
export type { NSEViewController, NSEViewControllerClass } from "./Application/NSEViewController";
export { nseAnimatePresentation, nseIsDismissing } from "./Application/NSEViewController";
export { enterClassApplication, instantiateInOwnerScope, nseDisposeFor, NSEOwnershipScope } from "./Controllers/ownership";
export { attachNSEAuthoringContext } from "./Application/authoringContext";
export { finalizeNSEAuthoringOwner } from "./Application/authoringLifecycle";
export { getNSEObjectOwners } from "./Application/objectLifetime";
export { useObserve } from "./Objects/useObserve";
export { observe, observableVersion, publishObservableChange } from "./Objects/observable";
export type { NSEObservable } from "./Objects/observable";
export { publishNSEActionChange } from "./Controls/Core/actionChanges";
export { nseActionCommandId } from "./Controls/Core/actionCommandId";
export { nseActionRecords, nseActionReferenceName } from "./Controls/Core/actionReference";
export { useNSEControlCommand } from "./Controls/Core/useNSEControlCommand";
export type { NSEControlRuntimePort } from "./Controls/Core/controlTypes";
export { NSEActionResponderContext, NSEActionScopeProvider } from "./Controls/Core/useNSEControlAction";
export { useNSEAnimationEnvironment } from "./Animation/NSEAnimationEnvironment";
export { useNSEOverlayFocusScope } from "./Overlays/useNSEOverlay";
export { NSEViewActivityProvider, useNSEViewActivitySource } from "./Application/viewActivityContext";
export { NSEViewControllerRendererProvider } from "./Application/viewControllerRenderer";

export { LocalisationProvider } from "./Navigation/compactMoreTitle";

// Private window drawing and lifecycle protocols supplied to the application host.
export { WindowTitleSlotContext, WindowTitlebarContent, WindowTitlebarHostContext } from "./Windows/windowTitlebarContext";
export type { WindowTitlebarDocument, WindowTitlebarHost } from "./Windows/windowTitlebarContext";
export { nseWindowPresentedTitle } from "./Application/NSEWindowController";
export type { NSEWindowAlertRequest } from "./Application/NSEWindowController";
export { registerNSEStandaloneViewControllerRenderer } from "./Application/viewControllerRenderer";
export { nseAttachToolbar, nseEndToolbarCustomization, nseToolbarEngine, nseToolbarTabViews } from "./Toolbars/NSEToolbar";
export { ToolbarView } from "./Toolbars/ToolbarView";
export { ToolbarConfigurationSheet } from "./Toolbars/ToolbarConfigurationSheet";
export { NSEPopover } from "./Overlays/NSEPopover";
export { registerNSEOpenPanelHost } from "./FilePanels/openPanelHost";
export type { NSEOpenPanelHost } from "./FilePanels/openPanelHost";
export { PresentedContentProvider } from "./Overlays/useNSEPresentedContent";
export { MenuRuntimeProvider } from "./Menus/menuRuntimeContext";
export { ControllerSheetSurface, WindowAlertContent, OpenPanelSheetSurface } from "./Windows/windowSheetSurfaces";

export { nativePresentations } from "./Application/nativePresentation";
