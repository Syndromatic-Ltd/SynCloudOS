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

export type NSERegistryItemType = "primitive" | "composition" | "appearance" | "example";

export interface NSERegistryItem {
  name: string;
  title: string;
  type: NSERegistryItemType;
  description: string;
  files: string[];
  dependencies?: string[];
  variants?: string[];
  examples?: string[];
}

export const nseRegistry = [
  {
    name: "nse-app-frame",
    title: "NSEAppFrame",
    type: "composition",
    description: "Standard SynCloudOS app-view frame with optional top bar, split content, and status bar slots.",
    files: ["src/NSE/Windows/NSEAppFrame.tsx", "src/NSE/Windows/Chrome/nse-chrome.css"],
    dependencies: ["nse-top-bar", "nse-split-view", "nse-status-bar"],
    variants: ["standard", "sourceList", "document", "canvas"],
    examples: ["src/SynWare/NSEControlGallery.app/Contents/index.tsx"]
  },
  {
    name: "nse-top-bar",
    title: "NSETopBar",
    type: "primitive",
    description: "Theme-neutral application chrome with continuous and rail-aligned layouts.",
    files: [
      "src/NSE/Windows/Chrome/NSETopBar.tsx",
      "src/NSE/Windows/Chrome/NSETopBarButton.tsx",
      "src/NSE/Windows/Chrome/nseTopBarTypes.ts",
      "src/NSE/Windows/Chrome/nseTopBarStyles.ts",
      "src/NSE/Windows/Chrome/nse-chrome.css"
    ],
    variants: ["continuous", "rail-aligned"]
  },
  {
    name: "nse-sidebar",
    title: "NSESidebar",
    type: "primitive",
    description: "Source-list and inspector sidebar model with sections, badges, nested items, metadata, and custom row rendering.",
    files: ["src/NSE/Navigation/SourceList/NSESidebar.tsx", "src/NSE/Navigation/SourceList/nse-sourcelist.css", "src/NSE/Windows/Chrome/nse-chrome.css"],
    variants: ["sourceList", "inspector", "plain"]
  },
  {
    name: "nse-split-view",
    title: "NSESplitView",
    type: "primitive",
    description: "Resizable app split view with keyboard and pointer resizing contracts.",
    files: ["src/NSE/DataViews/Split/NSESplitView.tsx", "src/NSE/Windows/Chrome/nse-chrome.css"]
  },
  {
    name: "nse-status-bar",
    title: "NSEStatusBar",
    type: "primitive",
    description: "Compact bottom app status strip with leading, centre, and trailing regions.",
    files: ["src/NSE/Windows/Chrome/NSEStatusBar.tsx", "src/NSE/Windows/Chrome/nse-chrome.css"]
  },
  {
    name: "nse-controls",
    title: "NSE Controls",
    type: "primitive",
    description: "Theme-neutral NSE control vocabulary: buttons, fields, groups, menus, pickers, progress, sliders, surfaces, and list rows.",
    files: [
      "src/NSE/Controls/Buttons/NSEButtons.tsx",
      "src/NSE/Controls/Buttons/NSEButtonFamilies.tsx",
      "src/NSE/Controls/Fields/NSEFields.tsx",
      "src/NSE/Controls/Selection/NSESelectors.tsx",
      "src/NSE/Menus/index.ts",
      "src/NSE/Progress/NSEProgress.tsx",
      "src/NSE/Material/index.ts",
      "src/NSE/Appearance/index.ts"
    ],
    variants: [
      "NSEPushButton",
      "NSEIconButton",
      "NSETextField",
      "NSESearchField",
      "NSECheckbox",
      "NSEToggleButton",
      "NSERadioGroup",
      "NSEToolbar",
      "NSEGroupBox",
      "NSEListItem",
      "NSEPopup",
      "NSEMenu",
      "NSEPicker",
      "NSEProgressBar",
      "NSEProgressButton",
      "NSEProgressItem",
      "NSESlider",
      "NSESpinner",
      "NSEDivider",
      "NSEPageHeader",
      "NSEAppMenuSurface",
      "NSEDialogSurface",
      "NSEFilePickerButton",
      "NSEGrabHandle",
      "NSERoundedBox",
      "NSEHashBadge",
      "NSEActivityButton",
      "NSENotificationButton",
      "NSEButtonHeader",
      "NSEToolButton",
      "NSEToolButtonGroup",
      "NSERadioToolButtonGroup",
      "NSETabGroup",
      "NSEPasswordField",
      "NSERoundedInput",
      "NSEToolInput",
      "NSEHeader",
      "NSEPrevNextBanner",
      "NSEListSelector",
      "NSEPopupList",
      "NSEPickerGroup",
      "NSEIntegerPicker",
      "NSEDatePicker",
      "NSETimePicker",
      "NSEProgressSlider",
      "NSEAppMenu",
      "NSEEditMenu",
      "NSEHelpMenu"
    ],
    examples: ["src/SynWare/NSEControlGallery.app/Contents/index.tsx"]
  },
  {
    name: "nse-layout",
    title: "NSE Layout",
    type: "composition",
    description: "Modern NSE layout layer for flex, stack, inline, fit, spacer, and ordered visible-child composition.",
    files: [
      "src/NSE/Layout/NSELayout.tsx",
      "src/NSE/Layout/nse-layout.css",
      "src/NSE/Layout/index.ts"
    ],
    variants: [
      "NSEFlex",
      "NSEStack",
      "NSEInline",
      "NSEFit",
      "NSEOrdered",
      "NSESpacer",
      "useNSEOrderedChildren"
    ],
    examples: ["src/SynWare/NSEControlGallery.app/Contents/index.tsx"]
  },
  {
    name: "nse-list",
    title: "NSE List",
    type: "composition",
    description: "Selectable, page-windowed, and swipeable list primitives that keep list behaviour separate from app-specific sidebars.",
    files: [
      "src/NSE/List/NSEList.tsx",
      "src/NSE/List/nse-list.css",
      "src/NSE/List/index.ts"
    ],
    variants: [
      "NSEList",
      "NSEListRow",
      "NSESwipeableItem",
      "useNSEListSelection",
      "useNSEPageWindow"
    ],
    examples: ["src/SynWare/NSEControlGallery.app/Contents/index.tsx"]
  },
  {
    name: "nse-containers",
    title: "NSE Containers",
    type: "composition",
    description: "Row groups, drawers, panes, sliding views, modal dialogs, confirm prompts, and toasters for app composition in NSE vocabulary.",
    files: [
      "src/NSE/Containers/NSEContainers.tsx",
      "src/NSE/Containers/nse-containers.css",
      "src/NSE/Containers/index.ts"
    ],
    variants: [
      "NSERowGroup",
      "NSEDrawer",
      "NSEDividerDrawer",
      "NSEPane",
      "NSESlidingPane",
      "NSESlidingView",
      "NSEDialog",
      "NSEModalDialog",
      "NSEConfirmPrompt",
      "NSEToaster"
    ],
    examples: ["src/SynWare/NSEControlGallery.app/Contents/index.tsx"]
  },
  {
    name: "atmo",
    title: "Atmo",
    type: "appearance",
    description: "Canonical first-party Atmo appearance for NSE controls.",
    files: ["src/NSE/Themes/Atmo/index.ts", "src/Themes/Atmo.scostheme/Contents/styles.css"]
  }
] satisfies NSERegistryItem[];

export function getNSERegistryItem(name: string) {
  return nseRegistry.find((item) => item.name === name) ?? null;
}
