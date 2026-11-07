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
export type { NSEThumbMaterial } from "../Appearance/NSEMetalThumb";

export {
  NSEDrawer,
} from "../Containers/NSEContainers";
export type {
  NSEDrawerProps,
} from "../Containers/NSEContainers";

export { NSESearchField } from "../Controls/Fields/NSESearchField";
export type { NSESearchFieldProps } from "../Controls/Fields/NSESearchField";
export { NSESlider } from "../Controls/Values/NSESlider";
export type { NSESliderProps } from "../Controls/Values/valueControlTypes";
export { NSESegmentedControl } from "../Controls/Values/NSESegmentedControl";
export type { NSESegmentedControlProps, NSESegmentedItem, NSESegmentedSelection, NSESegmentStyle } from "../Controls/Values/valueControlTypes";
export type { NSEMetalSurfaceProps } from "../Material";


export { NSESplitView } from "../DataViews/Split/NSESplitView";
export type { NSESplitViewProps } from "../DataViews/Split/NSESplitView";
// NSETopBar is the host's drawing of a window's title bar (NSWindow.title, its toolbar and
// titlebar accessories); it is internal, not an app control.
export { NSEPageHeader } from "../Windows/Chrome";
export type { NSEChromeScheme, NSEPageHeaderProps } from "../Windows/Chrome";

export {
  NSEButton,
} from "../Controls/Buttons/NSEButton";
export type {
  NSEAppearanceName,
  NSEBezelStyle,
  NSEButtonControlSize,
  NSEButtonProps,
  NSEButtonType,
  NSEControlStateValue,
  NSEImagePosition,
} from "../Controls/Buttons/NSEButton";
export type { NSEKeyEquivalentModifierMask } from "../Controls/Buttons/useNSEKeyEquivalent";
export { NSEToolbar } from "../Toolbars";
export type {
  NSEToolbarActionItem,
  NSEToolbarDisplayMode,
  NSEToolbarItem,
  NSEToolbarItemInput,
  NSEToolbarOptions,
  NSEToolbarSizeMode,
} from "../Toolbars";

export { NSEDatePicker } from "../DateTime/Pickers/NSEDatePicker";
export type { NSEDatePickerProps, NSEDatePickerStyle, NSEDateTimeValue } from "../DateTime/Pickers/datePickerTypes";

export {
  NSEBox,
  NSETextField,
  NSESwitch,
} from "../Controls/Fields/NSEFields";
export type {
  NSEBoxProps,
  NSEBoxTitlePosition,
  NSEBoxType,
  NSEBorderType,
  NSEBoxContentViewMargins,
  NSEContentLayout,
  NSEControlSize,
  NSEFormattedTextFieldProps,
  NSEPlainTextFieldProps,
  NSETextFieldChromeProps,
  NSETextFieldProps,
  NSELabelBackgroundStyle,
  NSELabelTextFieldProps,
  NSEFontTextStyle,
  NSESwitchProps,
} from "../Controls/Fields/NSEFields";
export { NSEImageView } from "../Controls/Images";
export type {
  NSEImageScaling,
  NSEImageViewProps,
} from "../Controls/Images";


export { NSEMenu, NSEPopUpButton } from "../Menus";
export type { NSEMenuItem, NSEMenuOptions, NSEPopUpButtonItem, NSEPopUpButtonProps } from "../Menus";
export { NSEPopup } from "../Overlays";
export type { NSEPopupProps } from "../Overlays";

export { useNSEControlFeedback } from "../Controls/Core/nseControlsShared";
export type { DefaultPreventedEvent, NSEControlHapticRequest, NSEControlHapticResult } from "../Controls/Core/nseControlsShared";

export { NSEStackView } from "../Layout/NSEStackView";
export { NSEStackItem } from "../Layout/NSEStackItem";
export { NSEStackVisibilityPriority } from "../Layout/stackViewTypes";
export type { NSEStackViewProps, NSEStackItemProps } from "../Layout/stackViewTypes";
export type { NSELayoutGap, NSESpacing } from "../Layout/layoutSpacing";
export { NSEGridRow, NSEGridView } from "../Layout/NSEGridView";
export type { NSEGridColumn, NSEGridRowProps, NSEGridViewProps, NSEGridXPlacement, NSEGridYPlacement } from "../Layout/NSEGridView";
export { NSEHapticFeedbackManager } from "../Feedback/NSEHapticFeedbackManager";
export type { NSEHapticFeedbackPattern, NSEHapticFeedbackPerformanceTime, NSEHapticFeedbackPerformer } from "../Feedback/NSEHapticFeedbackManager";
