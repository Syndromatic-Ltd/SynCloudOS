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

import type { ReactNode } from "react";
import type { ColourPanelPickerDescriptor, ColourPanelServiceChange } from "../../../SynCloudOS/SynCloudOS";
import type { UndoManager } from "../../../SynCloudOS/SynCloudOS";
import type { NSEColourPanelPreferencesController } from "./colourPanelPreferences";
import type { NSEColourTransferAdapter } from "../Transfer";
import type { GFXColour } from "../../../FX/GraphicsFX/public";

export interface NSEColourChange {
  readonly previous: GFXColour;
  readonly current: GFXColour;
  readonly phase: ColourPanelServiceChange["phase"];
  readonly reason: ColourPanelServiceChange["reason"];
}

export interface NSEColourTarget {
  readonly id: string;
  readonly responderId: string;
  /** The target takes opacity: the panel shows its Opacity control while it
   * is the target, as NSColorPanel.showsAlpha does. */
  readonly showsAlpha?: boolean;
  read(): GFXColour;
  preview(change: NSEColourChange): void;
  commit(change: NSEColourChange): void;
  cancel(change: NSEColourChange): void;
}

export interface NSEColourPickerContext {
  readonly colour: GFXColour | null;
  preview(colour: GFXColour, reason: ColourPanelServiceChange["reason"]): void;
  commit(colour: GFXColour, reason: ColourPanelServiceChange["reason"]): void;
}

export interface NSEColourPicker {
  readonly id: string;
  readonly label: string;
  /** The picker's picture in the panel's mode bar. */
  readonly icon?: ReactNode;
  readonly order: number;
  readonly supportedSpaces: readonly string[];
  render(context: NSEColourPickerContext): ReactNode;
}

export interface NSEColourPanelSnapshot {
  readonly open: boolean;
  readonly status: "active" | "disposed";
  readonly activeTargetId: string | null;
  readonly activePickerId: string | null;
  readonly current: GFXColour | null;
  readonly previous: GFXColour | null;
  readonly pickers: readonly ColourPanelPickerDescriptor[];
  readonly recents: readonly GFXColour[];
  readonly swatches: readonly GFXColour[];
  readonly revision: number;
}

export interface NSEColourPanelControllerOptions {
  readonly undoManager?: Pick<UndoManager, "isExecuting" | "register" | "reserve">;
  readonly preferences?: NSEColourPanelPreferencesController;
  readonly transferAdapter?: NSEColourTransferAdapter;
}
