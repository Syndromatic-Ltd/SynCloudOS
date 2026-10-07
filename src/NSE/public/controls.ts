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

/** Supported SynWare SDK NSE controls surface. Host machinery stays private. */
export type { NSEControlValidation, NSEControlInteractionPhase, NSEControlValueProps } from "../Controls/Core/controlTypes";
export type { Formatter, FormatterContext, FormatterError, FormatterResult } from "../../SynCloudOS/Models";
export type { NSEThumbMaterial } from "../Appearance/NSEMetalThumb";

export {
  NSEConfirmPrompt,
  NSEDialog,
  NSEDividerDrawer,
  NSEDrawer,
  NSEModalDialog,
  NSEPane,
  NSERowGroup,
  NSESlidingPane,
  NSESlidingPanes,
  NSESlidingView,
  NSEToaster,
} from "../Containers/NSEContainers";
export type {
  NSEConfirmPromptProps,
  NSEDialogProps,
  NSEDividerDrawerProps,
  NSEDrawerProps,
  NSEModalDialogProps,
  NSEPaneProps,
  NSERowGroupHandle,
  NSERowGroupProps,
  NSESlidingPaneProps,
  NSESlidingPanesProps,
  NSESlidingViewProps,
  NSEToasterProps,
} from "../Containers/NSEContainers";

export { NSESearchField } from "../Controls/Fields/NSESearchField";
export type { NSESearchFieldProps } from "../Controls/Fields/NSESearchField";
export { NSESlider } from "../Controls/Values/NSESlider";
export type { NSESliderProps } from "../Controls/Values/valueControlTypes";

export { NSEAppFrame } from "../Windows/NSEAppFrame";
export type { NSEAppFrameProps, NSEAppFrameVariant } from "../Windows/NSEAppFrame";

export { NSEMetalSurface, NSERoundedBox } from "../Material";
export type { NSEMetalSurfaceProps, NSERoundedBoxProps } from "../Material";
export {
  NSESidebar,
  NSESourceListScene,
} from "../Navigation/SourceList";
export type {
  NSESidebarItem,
  NSESidebarProps,
  NSESidebarSection,
  NSESidebarSurface,
  NSESidebarVariant,
  NSESourceListCompactHandoff,
  NSESourceListNavigationProjection,
  NSESourceListSceneProps,
  NSESourceListSceneStatus,
} from "../Navigation/SourceList";
export { NSESplitView } from "../DataViews/Split/NSESplitView";
export type { NSESplitViewProps } from "../DataViews/Split/NSESplitView";
export { NSEStatusBar, NSETopBar, NSETopBarButton, NSEPageHeader, NSEHeader, NSEPrevNextBanner } from "../Windows/Chrome";
export { nseTopBarStyles } from "../Windows/Chrome";
export type {
  NSEChromeScheme,
  NSEHeaderProps,
  NSEPageHeaderProps,
  NSEPrevNextBannerProps,
  NSEStatusBarProps,
  NSEStatusBarVariant,
  NSETopBarItem,
  NSETopBarItemKind,
  NSETopBarItemPosition,
  NSETopBarProps,
  NSETopBarRail,
  NSETopBarTitleAction,
  NSETopBarVariant,
} from "../Windows/Chrome";

export {
  NSEIconButton,
  NSEPushButton,
} from "../Controls/Buttons/NSEButtons";
export type {
  NSEButtonTone,
  NSEIconButtonProps,
  NSEPushButtonProps,
} from "../Controls/Buttons/NSEButtons";
export {
  NSEActivityButton,
  NSEButtonHeader,
  NSENotificationButton,
  NSERadioToolButtonGroup,
  NSEToolButton,
  NSEToolButtonGroup,
} from "../Controls/Buttons/NSEButtonFamilies";
export type {
  NSEActivityButtonProps,
  NSEButtonHeaderProps,
  NSENotificationButtonProps,
  NSERadioToolButtonGroupProps,
  NSEToolButtonGroupProps,
  NSEToolButtonProps,
} from "../Controls/Buttons/NSEButtonFamilies";
export type { NSEExtendedControlLevel, NSESelectableOption, NSESelectorItem, NSESelectorItemInput } from "../Controls/Selection/NSESelectors";
export {
  NSEToolbar,
  NSEToolbarController,
  NSEToolbarOverflowMenu,
  NSEToolbarConfigurationSheet,
  allocateNSEToolbarItems,
} from "../Toolbars";
export type {
  NSEToolbarConfiguration,
  NSEToolbarConfigurationSession,
  NSEToolbarConfigurationSheetProps,
  NSEToolbarConfigurationSheetWindowBridge,
  NSEToolbarConfigurationSheetWindowRequest,
  NSEToolbarControllerOptions,
  NSEToolbarInteraction,
  NSEToolbarItem,
  NSEToolbarLayout,
  NSEToolbarLayoutEntry,
  NSEToolbarLayoutOptions,
  NSEToolbarOverflowMenuProps,
  NSEToolbarOwner,
  NSEToolbarPreferences,
  NSEToolbarPresentedItem,
  NSEToolbarProps,
  NSEToolbarRefreshResult,
  NSEToolbarRuntimePort,
  NSEToolbarSnapshot,
} from "../Toolbars";
export { NSEGrabHandle } from "../Controls/Buttons/NSEGrabHandle";
export type { NSEGrabHandleProps } from "../Controls/Buttons/NSEGrabHandle";

export { NSEDatePicker } from "../DateTime/Pickers/NSEDatePicker";
export { NSEDateTimePicker } from "../DateTime/Pickers/NSEDateTimePicker";
export { NSETimePicker } from "../DateTime/Pickers/NSETimePicker";
export { NSEPasswordField } from "../Controls/Fields/NSEPasswordField";
export { NSETabGroup } from "../Navigation/NSETabGroup";
export type { NSEDatePickerProps, NSEDatePickerMode, NSEDatePickerField, NSEDatePickerEditorMode, NSEDatePickerEditorContext, NSETimePickerProps, NSETimePickerEditorMode, NSETimePickerEditorContext, NSEDateTimePickerProps } from "../DateTime/Pickers/datePickerTypes";
export type { NSEPasswordFieldProps } from "../Controls/Fields/NSEPasswordField";
export type { NSETabGroupProps, NSETabOption } from "../Navigation/NSETabGroup";

export { NSEDivider, NSEGroupedList, NSEListItem } from "../Controls/Selection";
export type { NSEDividerProps, NSEGroupedListEdge, NSEGroupedListProps, NSEListItemProps } from "../Controls/Selection";
export {
  NSEBox,
  NSECheckbox,
  NSEGroupBox,
  NSEInputBox,
  NSERadioGroup,
  NSETextField,
  NSEToggleButton,
} from "../Controls/Fields/NSEFields";
export type {
  NSEBoxBorder,
  NSEBoxContentInsets,
  NSEBoxKind,
  NSEBoxProps,
  NSEBoxTitlePosition,
  NSECheckboxProps,
  NSEContentLayout,
  NSEControlSize,
  NSELayoutMargins,
  NSEFormattedTextFieldProps,
  NSEGroupBoxProps,
  NSEInputBoxProps,
  NSEPlainTextFieldProps,
  NSERadioGroupProps,
  NSERadioOption,
  NSETextFieldChromeProps,
  NSETextFieldProps,
  NSEToggleButtonProps,
} from "../Controls/Fields/NSEFields";
export { NSERoundedInput, NSEToolInput } from "../Controls/Fields/NSEFieldVariants";
export type { NSERoundedInputProps, NSEToolInputProps } from "../Controls/Fields/NSEFieldVariants";
export { NSEImageView, NSECroppableImage, NSERotatingImage, NSEScrollingImage, NSESizeableImage, NSEViewImage } from "../Controls/Images";
export type {
  NSECropParams,
  NSECroppableImageProps,
  NSEImageDimensions,
  NSEImageGeometryPort,
  NSEImageStringSourceLease,
  NSEImageStringSourcePort,
  NSEImageViewProps,
  NSERotatingImageHandle,
  NSERotatingImageProps,
  NSEScrollingImageProps,
  NSESizeableImageHandle,
  NSESizeableImageProps,
  NSEViewImageProps,
} from "../Controls/Images";

export { NSEListSelector, NSEPopupList, NSEPickerGroup, NSEIntegerPicker } from "../Controls/Selection/NSESelectors";
export type { NSEIntegerPickerProps, NSEListSelectorProps, NSEPickerGroupProps, NSEPopupListProps } from "../Controls/Selection/NSESelectors";

export { NSEChoiceControl, NSEMenu, NSEPicker } from "../Menus";
export type { NSEChoiceControlProps, NSEChoiceOption } from "../Menus";
export type { NSEMenuItemDefinition, NSEMenuProps, NSEPickerAction, NSEPickerOption, NSEPickerProps } from "../Menus";
export { NSEPopup, NSEStandaloneControlHost } from "../Overlays";
export type { NSEPopupProps, NSEStandaloneControlHostProps } from "../Overlays";
export { NSEAppMenu, NSEEditMenu, NSEHelpMenu, NSEAppMenuSurface } from "../Menus";
export type { NSEAppMenuItemDefinition, NSEAppMenuProps, NSEAppMenuSurfaceProps, NSEEditMenuProps, NSEHelpMenuProps } from "../Menus";

export { NSEProgressBar, NSEProgressButton, NSEProgressItem, NSEProgressSlider, NSESpinner } from "../Progress";
export type { NSEProgressBarProps, NSEProgressButtonProps, NSEProgressItemProps, NSEProgressSliderProps, NSESpinnerProps } from "../Progress";
export { NSEDialogSurface } from "../Overlays/NSEDialogSurface";
export type { NSEDialogSurfaceProps } from "../Overlays/NSEDialogSurface";
export { NSEFilePickerButton } from "../FilePanels/NSEFilePickerButton";
export type { NSEFilePickerButtonProps, NSEFilePickerPanelBinding } from "../FilePanels/NSEFilePickerButton";
export { NSEHashBadge } from "../Controls/Core/NSEHashBadge";
export type { NSEHashBadgeProps } from "../Controls/Core/NSEHashBadge";
export { useNSEControlFeedback } from "../Controls/Core/nseControlsShared";
export type { DefaultPreventedEvent, NSEControlHapticRequest, NSEControlHapticResult } from "../Controls/Core/nseControlsShared";

export {
  NSEFit,
  NSEFlex,
  NSEInline,
  NSEOrdered,
  NSESpacer,
  NSEStack,
  resolveNSESpacing,
} from "../Layout/NSELayout";
export type {
  NSEFitProps,
  NSEFlexProps,
  NSEInlineProps,
  NSELayoutGap,
  NSEOrderedChildrenOptions,
  NSEOrderedProps,
  NSESpacerProps,
  NSESpacing,
  NSEStackContentAlignment,
  NSEStackProps,
} from "../Layout/NSELayout";
export { NSEForm, NSEFormRow, NSEFormSeparator } from "../Layout/NSEForm";
export type { NSEFormProps, NSEFormRowProps } from "../Layout/NSEForm";
export { NSEText } from "../Layout/NSEText";
export type { NSETextProps, NSETextStyle } from "../Layout/NSEText";
export { NSEList, NSEListRow, NSESwipeableItem } from "../List/NSEList";
export type { NSEListProps, NSEListRowProps, NSEListSelectionOptions, NSEPageWindowOptions, NSESwipeableItemProps } from "../List/NSEList";
export { NSEVirtualList } from "../List/NSEVirtualList";
export type { NSEVirtualListHandle, NSEVirtualListProps, NSEVirtualWindowOptions } from "../List/NSEVirtualList";
export { NSEFeedbackProvider, useNSEFeedback } from "../Feedback";
