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

export interface ColourPanelServiceChange {
  readonly previousCSS: string;
  readonly currentCSS: string;
  readonly phase: "preview" | "commit" | "cancel";
  readonly reason: ColourPanelServiceChangeReason;
}

export type ColourPanelServiceChangeReason = "pointer" | "keyboard" | "text" | "swatch" | "paste" | "target-switch" | "disconnect" | "dispose" | ColourPanelDismissReason;
export type ColourPanelDismissReason = "escape" | "outside-pointer" | "focus-left" | "anchor-removed" | "parent-dismissed" | "programmatic";
export type ColourPanelCloseReason = "commit" | "cancel" | "target-disconnect" | ColourPanelDismissReason;

export interface ColourPanelTargetRegistration {
  readonly id: string;
  readonly responderId: string;
  read(): string;
  preview(change: ColourPanelServiceChange): void;
  commit(change: ColourPanelServiceChange): void;
  cancel(change: ColourPanelServiceChange): void;
}

export interface ColourPanelPickerDescriptor {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly supportedSpaces: readonly string[];
}

export interface ColourPanelServiceSnapshot {
  readonly runtimeId: string;
  readonly status: "active" | "disposed";
  readonly open: boolean;
  readonly activeTargetId: string | null;
  readonly activePickerId: string | null;
  readonly currentCSS: string | null;
  readonly previousCSS: string | null;
  readonly pickers: readonly ColourPanelPickerDescriptor[];
  readonly recents: readonly string[];
  readonly swatches: readonly string[];
  readonly revision: number;
}

export interface ColourPanelService {
  readonly runtimeId: string;
  readonly ownerToken: RuntimeOwnerToken;
  getSnapshot(): ColourPanelServiceSnapshot;
  getPickers(): readonly ColourPanelPickerDescriptor[];
  subscribe(listener: () => void): () => void;
  registerPicker(descriptor: ColourPanelPickerDescriptor): () => void;
  activateTarget(target: ColourPanelTargetRegistration): () => void;
  /** Internal capability variant. The returned lease is intentionally an
   * opaque object and is never exposed by the public AppSDK type. */
  activateTargetWithLease?(target: ColourPanelTargetRegistration): { readonly lease: object; disconnect(): void };
  open(lease?: object): void;
  close(reason: ColourPanelCloseReason, lease?: object): void;
  choosePicker(id: string, lease?: object): void;
  preview(css: string, reason: ColourPanelServiceChange["reason"], lease?: object): void;
  commit(css: string, reason: ColourPanelServiceChange["reason"], lease?: object): void;
  cancel(reason: ColourPanelServiceChange["reason"], lease?: object): void;
  addRecent(css: string, lease?: object): void;
  setSwatches(css: readonly string[], lease?: object): void;
  dispose(): void;
}
import type { RuntimeOwnerToken } from "../Runtime/runtimeOwner";
