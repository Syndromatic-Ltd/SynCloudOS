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
    description: "Apple-inspired app chrome bar: the Cumulus slice variant and the reusable atmoMetal source-list chrome (rail+main seam, grain, light/dark, metal pills).",
    files: [
      "src/NSE/Windows/Chrome/NSETopBar.tsx",
      "src/NSE/Windows/Chrome/NSETopBarButton.tsx",
      "src/NSE/Windows/Chrome/nseTopBarTypes.ts",
      "src/NSE/Windows/Chrome/nseTopBarStyles.ts",
      "src/NSE/Windows/Chrome/nse-chrome.css"
    ],
    variants: ["atmoCumulus", "atmoMetal"]
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
      "src/NSE/Menus/index.ts",
      "src/NSE/Progress/NSEProgressIndicator.tsx",
      "src/NSE/Material/index.ts",
      "src/NSE/Appearance/index.ts"
    ],
    variants: [
      "NSEButton",
      "NSETextField",
      "NSESearchField",
      "NSESwitch",
      "NSEToolbar",
      "NSEPopup",
      "NSEMenu",
      "NSEPopUpButton",
      "NSEProgressIndicator",
      "NSESlider",
      "NSEPageHeader",
      "NSEDialogSurface",
      "NSERoundedBox",
      "NSEHeader",
      "NSEPrevNextBanner",
      "NSEDatePicker"
    ],
    examples: ["src/SynWare/NSEControlGallery.app/Contents/index.tsx"]
  },
  {
    name: "nse-layout",
    title: "NSE Layout",
    type: "composition",
    description: "NSStackView and NSGridView: views in a row or column, and in rows and columns.",
    files: [
      "src/NSE/Layout/NSEStackView.tsx",
      "src/NSE/Layout/flowStackView.tsx",
      "src/NSE/Layout/NSEGridView.tsx",
      "src/NSE/Layout/nse-layout.css",
      "src/NSE/Layout/index.ts"
    ],
    variants: [
      "NSEStackView",
      "NSEStackItem",
      "NSEGridView",
      "NSEGridRow"
    ],
    examples: ["src/SynWare/NSEControlGallery.app/Contents/index.tsx"]
  },
  {
    name: "nse-containers",
    title: "NSE Containers",
    type: "composition",
    description: "Drawers, sliding panes, modal dialogs, confirm prompts, and toasters for app composition in NSE vocabulary.",
    files: [
      "src/NSE/Containers/NSEContainers.tsx",
      "src/NSE/Containers/nse-containers.css",
      "src/NSE/Containers/index.ts"
    ],
    variants: [
      "NSEDrawer",
      "NSESlidingPane",
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
    files: ["src/NSE/Themes/Atmo/index.ts", "src/NSE/Themes/Atmo/Resources/atmo.css"]
  }
] satisfies NSERegistryItem[];

export function getNSERegistryItem(name: string) {
  return nseRegistry.find((item) => item.name === name) ?? null;
}
