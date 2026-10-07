/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import "./Typography/fonts.css";

import { NSEAlert } from "./Components/NSEAlert";
import { NSEAlertBackdrop } from "./Components/NSEAlertBackdrop";
import { Badge } from "./Components/Badge";
import { IconWell } from "./Components/IconWell";
import { LinenSurface } from "./Components/LinenSurface";
import { LoadingSpinner } from "./Components/LoadingSpinner";
export {
  Badge,
  IconWell,
  LoadingSpinner,
  NSEAlert,
  NSEAlertBackdrop,
};
import * as NSEText from "./Text";
import * as NSETextEditing from "./TextEditing";
export * from "./Text";
export * from "./TextEditing";
export { NSEFocusPortProvider, NSEFocusScope, useNSEFocusPort } from "./Focus";
export type { NSEFocusPort, NSEFocusScopeKind, NSEFocusScopeOptions } from "./Focus";
export { NSEConformanceEvidenceProvider, useNSEConformanceEvidence } from "./Developer/NSEConformanceEvidence";
export type { NSEConformanceEvidencePort, NSEConformanceEvidenceProviderProps } from "./Developer/NSEConformanceEvidence";
/** Lifecycle cleanup is part of the public interaction layer for host shells. */
export { useNSEDeferredDisposal } from "./interactionLifecycle";
export type { NSEDisposable, NSEDisposalScheduler } from "./interactionLifecycle";
import { NSEFeedbackProvider, useNSEFeedback } from "./Feedback";
import * as NSEContainers from "./Containers";
import * as NSEControllers from "./Controllers";
export * from "./Controllers";
import * as NSEDataViews from "./DataViews";
export * from "./DataViews";
export * from "./Drag";
import * as NSEWindows from "./Windows";
export * from "./Windows";
import * as NSEOverlays from "./Overlays";
export * from "./Overlays";
import * as NSEMenus from "./Menus";
export * from "./Menus";
import * as NSEToolbars from "./Toolbars";
export * from "./Toolbars";
import * as NSETooltips from "./Tooltips";
export * from "./Tooltips";
import * as NSEFilePanels from "./FilePanels";
export * from "./FilePanels";
import * as NSEMediaPanels from "./MediaPanels";
export * from "./MediaPanels";
import * as NSEControlCore from "./Controls/Core";
export * from "./Controls/Core";
import * as NSEColourControls from "./Colour";
export * from "./Colour";
import * as NSEDateTime from "./DateTime";
export * from "./DateTime";
import * as NSECompletion from "./Controls/Completion";
export * from "./Controls/Completion";
import * as NSEFieldExtensions from "./Controls/Fields";
export * from "./Controls/Fields";
import * as NSEValueControls from "./Controls/Values";
export * from "./Controls/Values";
import * as NSENavigation from "./Navigation";
export * from "./Navigation";
import * as NSEProgressIndicators from "./Progress";
export * from "./Progress";
export * from "./Controls/Buttons";
export * from "./Controls/Selection";
export * from "./Material";
import * as NSEControlButtons from "./Controls/Buttons";
import * as NSEControlFields from "./Controls/Fields";
import * as NSEControlImages from "./Controls/Images";
import * as NSEControlSelection from "./Controls/Selection";
import * as NSEControlVariants from "./Controls/Fields/NSEFieldVariants";
import * as NSEChrome from "./Windows/Chrome";
import * as NSEMaterial from "./Material";
import { NSEPasswordField } from "./Controls/Fields/NSEPasswordField";
import * as NSEAppearance from "./Appearance";
export * from "./Appearance";
export * from "./Controls/Images";
export { NSEPasswordField } from "./Controls/Fields/NSEPasswordField";
export { NSETabGroup } from "./Navigation/NSETabGroup";

const NSEControlCatalogue = {
  ...NSEControlButtons,
  ...NSEControlFields,
  ...NSEControlImages,
  ...NSEControlSelection,
  ...NSEControlCore,
  ...NSEControlVariants,
  ...NSEValueControls,
  ...NSEChrome,
  ...NSENavigation,
  ...NSEMaterial,
  ...NSEFilePanels,
  ...NSEOverlays,
  ...NSEMenus,
  ...NSEProgressIndicators,
  ...NSEDateTime,
};
import * as NSELayout from "./Layout";
export { NSEStackItem, NSEStackView, resolveStackLayout } from "./Layout";
export type {
  NSEStackAlignment,
  NSEStackDistribution,
  NSEStackEdgeInsets,
  NSEStackFrameScheduler,
  NSEStackGravity,
  NSEStackItemLayout,
  NSEStackItemProps,
  NSEStackLayoutInput,
  NSEStackLayoutResult,
  NSEStackObserver,
  NSEStackObserverFactory,
  NSEStackOrientation,
  NSEStackOverflowPolicy,
  NSEStackResolvedItem,
  NSEStackViewProps,
} from "./Layout";
import * as NSEList from "./List";
import * as NSEScroll from "./Scroll";
export * from "./Scroll";
import { GlassPanel, LinenSurface as MaterialLinenSurface, MaterialProvider, materialTokens } from "./Material";
import {
  NSEPage,
  NSEPageController,
  getNSEPagePreset,
  nsePageMaterialPresets,
  nsePagePresets,
  useNSEPage
} from "./Page";
import { NSESmoothSurface } from "./SmoothSurface";
import { typographyTokens } from "./Typography/typographyTokens";
import * as NSETypography from "./Typography";
export * from "./Typography";
export * from "./Pointer";
import * as NSETextLayout from "./TextLayout";
export * from "./TextLayout";
import * as NSEGraphics from "./Graphics";
export * from "./Graphics";
import * as NSEWebContent from "./WebContent";
export * from "./WebContent";
import { getNSERegistryItem, nseRegistry } from "./registry";

export const NSE = {
  ...NSEAppearance,
  ...NSELayout,
  ...NSEList,
  ...NSEScroll,
  ...NSEControlCore,
  ...NSEColourControls,
  ...NSENavigation,
  ...NSEDataViews,
  ...NSEMenus,
  ...NSEToolbars,
  ...NSETooltips,
  ...NSEFilePanels,
  ...NSEMediaPanels,
  ...NSETypography,
  ...NSETextLayout,
  ...NSEGraphics,
  ...NSEWebContent,
  ...NSEContainers,
  ...NSEWindows,
  ...NSEControlCatalogue,
  Appearance: NSEAppearance,
  ControlCore: NSEControlCore,
  Colour: NSEColourControls,
  DateTime: NSEDateTime,
  Completion: NSECompletion,
  FieldExtensions: NSEFieldExtensions,
  ValueControls: NSEValueControls,
  Navigation: NSENavigation,
  ProgressIndicators: NSEProgressIndicators,
  Layout: NSELayout,
  List: NSEList,
  Scroll: NSEScroll,
  Containers: NSEContainers,
  Controllers: NSEControllers,
  DataViews: NSEDataViews,
  Windows: NSEWindows,
  Overlays: NSEOverlays,
  Menus: NSEMenus,
  Toolbars: NSEToolbars,
  Tooltips: NSETooltips,
  FilePanels: NSEFilePanels,
  MediaPanels: NSEMediaPanels,
  TypographyControls: NSETypography,
  TextLayout: NSETextLayout,
  WebContent: NSEWebContent,
  NSEToolbarController: NSEToolbars.NSEToolbarController,
  NSEToolbarConfigurationSheet: NSEToolbars.NSEToolbarConfigurationSheet,
  NSEArrayController: NSEControllers.NSEArrayController,
  NSEDictionaryController: NSEControllers.NSEDictionaryController,
  NSEObjectController: NSEControllers.NSEObjectController,
  NSEPreferencesController: NSEControllers.NSEPreferencesController,
  NSETreeController: NSEControllers.NSETreeController,
  useNSEController: NSEControllers.useNSEController,
  NSEAlert,
  NSEAlertBackdrop,
  IconWell,
  LinenSurface,
  LoadingSpinner,
  Badge,
  Text: NSEText,
  TextEditing: NSETextEditing,
  NSEFeedbackProvider,
  NSEPage,
  Page: {
    Root: NSEPage,
    Controller: NSEPageController,
    useNSEPage,
    presets: nsePagePresets,
    materials: nsePageMaterialPresets,
    getPreset: getNSEPagePreset
  },
  NSESmoothSurface,
  Material: {
    Provider: MaterialProvider,
    tokens: materialTokens,
    GlassPanel,
    LinenSurface: MaterialLinenSurface,
    SmoothSurface: NSESmoothSurface
  },
  Typography: typographyTokens,
  Registry: {
    items: nseRegistry,
    get: getNSERegistryItem
  }
};

