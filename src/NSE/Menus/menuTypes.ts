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
import type {
  CommandDispatchOptions,
  CommandDispatchResult,
  CommandId,
  CommandPresentation,
  CommandDispatchPreparation,
  CommandValidationOptions,
  CommandValidationRequest,
  KeyBindingClaim,
  KeyBindingContext,
  KeyBindingEvent,
  KeyBindingHandleResult,
  KeyBindingManager,
} from "../../SynCloudOS/SynCloudOS";
import type { NSELogicalPlacement } from "../Overlays/overlayTypes";

/** A menu entry has one unambiguous presentation kind. */
export type NSEMenuEntry =
  | {
      readonly kind: "command";
      readonly id: string;
      readonly commandId: CommandId;
      readonly payload?: unknown;
      readonly labelOverride?: ReactNode;
      readonly iconOverride?: ReactNode;
      readonly shortcutOverride?: string;
      /** One explicit checked-state semantic; omission is an ordinary menuitem. */
      readonly selectionKind?: "checkbox" | "radio";
    }
  | {
      readonly kind: "submenu";
      readonly id: string;
      readonly label: ReactNode;
      readonly entries: readonly NSEMenuEntry[];
      readonly icon?: ReactNode;
      readonly enabled?: boolean;
      readonly disabledReason?: string;
    }
  | { readonly kind: "separator"; readonly id: string }
  | { readonly kind: "custom"; readonly id: string; readonly label: ReactNode; readonly render: () => ReactNode };

/**
 * A command entry named by an action (`{ action: "newNote" }`) instead of a
 * command ID. The menu's runtime port turns the name into the command ID of the
 * application that declared the action.
 */
export interface NSEMenuActionEntry {
  readonly kind: "command";
  readonly id: string;
  readonly action: string;
  readonly payload?: unknown;
  readonly labelOverride?: ReactNode;
  readonly iconOverride?: ReactNode;
  readonly shortcutOverride?: string;
  readonly selectionKind?: "checkbox" | "radio";
}

/** An entry as authored: command entries may name an action instead of a command ID. */
export type NSEMenuEntryInput =
  | Exclude<NSEMenuEntry, { readonly kind: "submenu" }>
  | NSEMenuActionEntry
  | (Omit<Extract<NSEMenuEntry, { readonly kind: "submenu" }>, "entries"> & { readonly entries: readonly NSEMenuEntryInput[] });

export interface NSEMenuItemDefinition {
  readonly value: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly shortcut?: ReactNode;
  readonly disabled?: boolean;
  readonly hidden?: boolean;
  readonly disabledReason?: string;
  readonly checked?: boolean;
  readonly separator?: boolean;
  readonly children?: readonly NSEMenuItemDefinition[];
}

export interface NSEMenuModel {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly NSEMenuEntryInput[];
  /**
   * Optional contributions are inserted deterministically by their stable
   * section ID and weight. They are a presentation extension point only: all
   * command validation continues through the same visible branch generation.
   */
  readonly sections?: readonly NSEMenuSection[];
}

export interface NSEMenuSection<TEntry = NSEMenuEntryInput> {
  readonly id: string;
  readonly entries: readonly TEntry[];
  readonly weight?: number;
  readonly beforeId?: string;
  readonly afterId?: string;
}

export interface NSEMenuScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * Explicit provenance needed to project a menu through the overlay stack.
 * A host that does not own an overlay provider may render `NSEMenu` as a pure
 * semantic surface, but it may not invent responder or scope ownership.
 */
export interface NSEMenuOverlayOptions {
  readonly id: string;
  readonly parentResponderId: string;
  readonly parentId?: string | null;
  readonly parentScopeId?: string;
  readonly placement?: NSELogicalPlacement;
}

export interface NSEMenuRuntimePort {
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
  /** Canonical key binding authority; menus never hand-match commands. */
  readonly keyBindings?: Pick<KeyBindingManager, "claimKeyboardEvent" | "handleKeyboardEvent">;
  /** Optional injected scheduler for submenu aim delay. No ambient timer use. */
  readonly scheduler?: NSEMenuScheduler;
  /** Turns an action name into the command ID of the application that declared it. Required for menus with `{ action }` entries. */
  readonly resolveAction?: (action: string) => CommandId;
}

export type NSEMenuPresentedEntry =
  | {
      readonly kind: "command";
      readonly id: string;
      readonly commandId: CommandId;
      readonly payload: unknown;
      readonly label: ReactNode;
      readonly icon?: ReactNode;
      readonly enabled: boolean;
      readonly hidden: boolean;
      readonly checked: "off" | "on" | "mixed";
      readonly selectionKind?: "checkbox" | "radio";
      readonly disabledReason?: string;
      readonly shortcut?: string;
      readonly presentation: CommandPresentation;
    }
  | {
      readonly kind: "submenu";
      readonly id: string;
      readonly label: ReactNode;
      readonly icon?: ReactNode;
      readonly enabled: boolean;
      readonly disabledReason?: string;
    }
  | { readonly kind: "separator"; readonly id: string }
  | {
      readonly kind: "custom";
      readonly id: string;
      readonly label: ReactNode;
      readonly render: () => ReactNode;
      readonly enabled: true;
    };
export interface NSEMenuSnapshot {
  readonly open: boolean;
  readonly validating: boolean;
  readonly generation: number;
  readonly branchPath: readonly string[];
  readonly entries: readonly NSEMenuPresentedEntry[];
}

export type NSEMenuDismissReason = "escape" | "selection" | "programmatic" | "parent-dismissed";

export interface NSEMenuControllerOptions {
  readonly model: NSEMenuModel;
  readonly runtime: NSEMenuRuntimePort;
}

export interface NSEMenuKeyEquivalent {
  readonly event: KeyBindingEvent;
  readonly context?: KeyBindingContext;
}

export interface NSEMenuKeyEquivalentClaim {
  readonly claim: KeyBindingClaim;
  readonly context: KeyBindingContext;
}

export type NSEMenuKeyEquivalentResult = KeyBindingHandleResult | null;
