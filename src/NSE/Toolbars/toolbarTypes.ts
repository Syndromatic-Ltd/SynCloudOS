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
import type { NSEControllerOwnershipOptions } from "../Controllers/ownership";
import type {
  ControllerCommitResult,
  ControllerEditTransaction,
  NSEPreferencesController,
} from "../Controllers";
import type {
  CommandDispatchOptions,
  CommandDispatchResult,
  CommandId,
  CommandPresentation,
  CommandDispatchPreparation,
  CommandValidationOptions,
  CommandValidationRequest,
} from "../../SynCloudOS/SynCloudOS";
import type { NSEMenuRuntimePort } from "../Menus/menuTypes";
import type { NSEWindowSurfaceBridge } from "../Overlays";

/**
 * The preference-backed portion of a toolbar configuration. Ownership and the
 * available catalogue stay in the host's window and toolbar configuration; they are not
 * duplicated into preferences or an ambient registry.
 */
export interface NSEToolbarPreferences {
  readonly itemIds: readonly string[];
  readonly displayMode: "icon-and-label" | "icon-only" | "label-only";
  readonly sizeMode: "regular" | "small";
}

export type NSEToolbarItem =
  | {
      readonly kind: "command";
      readonly id: string;
      readonly commandId: CommandId;
      readonly payload?: unknown;
      readonly label: string;
      readonly paletteLabel: string;
      readonly icon: ReactNode;
      readonly allowsDuplicates?: boolean;
      /**
       * As NSToolbarItem.isBordered: true (the default) draws the item as a button;
       * false draws only its icon, with the label beneath it, as Pages' toolbar does.
       */
      readonly bordered?: boolean;
      /** Stable host-provided geometry; no DOM measurement is acquired. */
      readonly minimumWidth?: number;
      readonly idealWidth?: number;
    }
  | {
      readonly kind: "custom";
      readonly id: string;
      readonly label: string;
      readonly minimumWidth: number;
      readonly idealWidth: number;
      readonly render: () => ReactNode;
      readonly allowsDuplicates?: boolean;
      /** Show the label under the view, as a view-based NSToolbarItem does, when the
       * toolbar shows labels. Off by default: most views name themselves. */
      readonly showsLabel?: boolean;
    }
  | { readonly kind: "space"; readonly id: string; readonly width: number }
  | { readonly kind: "flexible-space"; readonly id: string; readonly minimumWidth: number }
  | { readonly kind: "separator"; readonly id: string };

export type NSEToolbarOwner =
  | { readonly kind: "window"; readonly windowControllerId: string }
  | { readonly kind: "application"; readonly applicationId: string };

export interface NSEToolbarConfiguration {
  readonly identifier: string;
  readonly owner: NSEToolbarOwner;
  readonly displayMode: NSEToolbarPreferences["displayMode"];
  readonly sizeMode: NSEToolbarPreferences["sizeMode"];
  readonly allowedItemIds: readonly string[];
  readonly defaultItemIds: readonly string[];
}

export interface NSEToolbarRuntimePort {
  readonly signal: AbortSignal;
  readonly commands: {
    getPresentationGeneration(): { readonly registryGeneration: number; readonly responderGeneration: number };
    validateMany(
      requests: readonly CommandValidationRequest[],
      options?: CommandValidationOptions,
    ): Promise<ReadonlyMap<string, CommandPresentation>>;
    dispatch(
      commandId: CommandId,
      payload?: unknown,
      options?: CommandDispatchOptions,
    ): Promise<CommandDispatchResult<unknown>>;
    prepareDispatch(
      commandId: CommandId,
      payload?: unknown,
      options?: CommandDispatchOptions,
    ): CommandDispatchPreparation | Promise<CommandDispatchPreparation>;
  };
  /** Overflow is still a command menu branch, so it receives the same canonical
   * key-binding and scheduling authority as an ordinary menu. */
  readonly keyBindings?: NSEMenuRuntimePort["keyBindings"];
  readonly scheduler?: NSEMenuRuntimePort["scheduler"];
}

export type NSEToolbarPresentedItem =
  | {
      readonly kind: "command";
      readonly id: string;
      readonly instanceId: string;
      readonly commandId: CommandId;
      readonly payload: unknown;
      readonly label: string;
      readonly paletteLabel: string;
      readonly icon: ReactNode;
      readonly enabled: boolean;
      readonly hidden: boolean;
      readonly checked: "off" | "on" | "mixed";
      readonly disabledReason?: string;
      readonly presentation: CommandPresentation | null;
      readonly bordered: boolean;
      readonly minimumWidth?: number;
      readonly idealWidth?: number;
    }
  | {
      readonly kind: "custom";
      readonly id: string;
      readonly instanceId: string;
      readonly label: string;
      readonly minimumWidth: number;
      readonly idealWidth: number;
      readonly render: () => ReactNode;
      readonly showsLabel: boolean;
    }
  | { readonly kind: "space"; readonly id: string; readonly instanceId: string; readonly width: number }
  | { readonly kind: "flexible-space"; readonly id: string; readonly instanceId: string; readonly minimumWidth: number }
  | { readonly kind: "separator"; readonly id: string; readonly instanceId: string };

export interface NSEToolbarSnapshot {
  readonly generation: number;
  readonly validating: boolean;
  readonly itemIds: readonly string[];
  readonly displayMode: NSEToolbarPreferences["displayMode"];
  readonly sizeMode: NSEToolbarPreferences["sizeMode"];
  readonly items: readonly NSEToolbarPresentedItem[];
  readonly diagnostic: "validation-failed" | null;
}

export interface NSEToolbarControllerOptions extends NSEControllerOwnershipOptions {
  readonly configuration: NSEToolbarConfiguration;
  readonly items: readonly NSEToolbarItem[];
  /** The host constructs and owns this preference controller. */
  readonly preferences: NSEPreferencesController<NSEToolbarPreferences>;
  readonly runtime: NSEToolbarRuntimePort;
}

export type NSEToolbarRefreshResult =
  | { readonly status: "published"; readonly generation: number }
  | { readonly status: "cancelled"; readonly generation: number }
  | { readonly status: "failed"; readonly generation: number; readonly code: "validation-failed" };

export interface NSEToolbarLayoutEntry {
  readonly id: string;
  readonly instanceId: string;
  readonly kind: NSEToolbarPresentedItem["kind"];
  readonly allocatedWidth: number;
  readonly item: NSEToolbarPresentedItem;
}

export interface NSEToolbarLayout {
  readonly direction: "ltr" | "rtl";
  readonly availableWidth: number;
  readonly visibleItemIds: readonly string[];
  readonly overflowItemIds: readonly string[];
  readonly entries: readonly NSEToolbarLayoutEntry[];
  readonly overflowEntries: readonly NSEToolbarLayoutEntry[];
  readonly overflowRequired: boolean;
  readonly clipped: boolean;
}

export interface NSEToolbarLayoutOptions {
  readonly displayMode: NSEToolbarPreferences["displayMode"];
  readonly sizeMode: NSEToolbarPreferences["sizeMode"];
  readonly direction: "ltr" | "rtl";
}

export interface NSEToolbarConfigurationSheetWindowRequest {
  readonly id: string;
  readonly role: "sheet";
  /** Null denotes a top-level application-stage sheet. */
  readonly parentWindowControllerId: string | null;
  readonly owner: NSEToolbarOwner;
}

/**
 * Window-host seam. The surrounding application registers a serialisable window
 * renderer and owns WindowManager.create/open/close; NSE never makes a second
 * WindowRecord to show toolbar preferences.
 */
export interface NSEToolbarConfigurationSheetWindowBridge {
  open?(request: NSEToolbarConfigurationSheetWindowRequest): void;
  close?(request: NSEToolbarConfigurationSheetWindowRequest): void;
  present?: NSEWindowSurfaceBridge["present"];
  dismiss?: NSEWindowSurfaceBridge["dismiss"];
}

export interface NSEToolbarConfigurationSession {
  begin(transaction: ControllerEditTransaction): void;
  commit(): ControllerCommitResult;
  discard(): void;
}
