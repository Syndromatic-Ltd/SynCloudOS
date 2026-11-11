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

// Window specimens for the theme contract: every window role, chrome mode, popover arrow edge and alignment, and the edited close button.
import type { ReactNode } from "react";
import type { WindowAnchor, WindowRecord, WindowRole } from "../../../../src/SynCloudOS/Windows";
import {
  NSEBorderlessWindowView,
  NSEHUDWindowView,
  NSEModalWindowView,
  NSEPanelView,
  NSEPopoverWindowView,
  NSESheetView,
  NSEStandardWindowView,
} from "../../../../src/NSE/Windows";

const views = { standard: NSEStandardWindowView, panel: NSEPanelView, sheet: NSESheetView, modal: NSEModalWindowView, popover: NSEPopoverWindowView, hud: NSEHUDWindowView, borderless: NSEBorderlessWindowView } as const;

interface WindowSpecimenOptions {
  readonly role: WindowRole;
  readonly chromeMode?: WindowRecord["chromeMode"];
  readonly customChromeActive?: boolean;
  readonly isKey?: boolean;
  readonly dirty?: boolean;
  readonly edge?: WindowAnchor["edge"];
  readonly alignment?: WindowAnchor["alignment"];
}

function WindowSpecimen({ role, chromeMode = "system", customChromeActive = false, isKey = true, dirty = false, edge = "block-end", alignment = "center" }: WindowSpecimenOptions) {
  const record: WindowRecord = {
    id: `contract-${role}`, runtimeId: "contract" as WindowRecord["runtimeId"], workspaceId: "contract", applicationId: null, applicationSessionId: null,
    documentId: null, documentAssociationRole: null, representedDocument: null, toolbar: null,
    role, style: role === "borderless" ? [] : role === "popover" ? ["closable"] : ["titled", "closable", "minimisable", "zoomable", "resizable"], title: "Specimen",
    content: { rendererId: "contract", parameters: {} }, bounds: { x: 0, y: 0, width: 480, height: 240 }, minimumSize: { width: 200, height: 150 }, maximumSize: null,
    level: role === "panel" || role === "hud" || role === "popover" ? "floating" : role === "modal" || role === "sheet" ? "modal" : "normal",
    parentWindowControllerId: role === "sheet" || role === "popover" ? "contract-parent" : null,
    anchor: role === "popover" ? { id: "contract-anchor", rect: { x: 200, y: 30, width: 44, height: 44 }, edge, alignment, offset: 8 } : null,
    pinned: false, state: "open", isKey, isMain: isKey, zIndex: 1,
    mobilePolicy: role === "popover" ? "popover-to-sheet" : role === "panel" || role === "hud" || role === "sheet" ? "sheet" : "fullscreen",
    restorationKey: null, chromeMode, smoothSurface: "off",
  } as WindowRecord;
  const View = views[role];
  return <div style={{ position: "relative", width: 480, height: 240 }}>
    <View record={record} presentation={{ kind: "desktop-window", visible: true, bounds: record.bounds, safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 }, movable: true, resizable: record.style.includes("resizable"), titleBarVisible: record.style.includes("titled") }} blocked={false} dirty={dirty} customChromeActive={customChromeActive} dispatchCommand={async () => undefined}><p>Window content</p></View>
  </div>;
}

const edges: readonly WindowAnchor["edge"][] = ["block-start", "block-end", "inline-start", "inline-end"];
const alignments: readonly WindowAnchor["alignment"][] = ["start", "center", "end"];

export const windowSpecimens: readonly { id: string; render: () => ReactNode }[] = [
  ...(["standard", "panel", "sheet", "modal", "hud", "borderless"] as const).map(role => ({ id: `window-role-${role}`, render: () => <WindowSpecimen role={role} /> })),
  ...edges.flatMap(edge => alignments.map(alignment => ({ id: `window-popover-${edge}-${alignment}`, render: () => <WindowSpecimen role="popover" edge={edge} alignment={alignment} /> }))),
  { id: "window-frameless", render: () => <WindowSpecimen role="standard" chromeMode="frameless" /> },
  { id: "window-custom-chrome", render: () => <WindowSpecimen role="standard" chromeMode="custom" customChromeActive /> },
  { id: "window-edited-key", render: () => <WindowSpecimen role="standard" dirty /> },
  { id: "window-edited-inactive", render: () => <WindowSpecimen role="standard" dirty isKey={false} /> },
];
