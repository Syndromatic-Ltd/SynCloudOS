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
import type { NSEActionReference, NSEActionPayloadCheck } from "../Controls/Core/actionReference";
import type { NSEControllerOwnershipOptions } from "../Controllers/ownership";
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
import type { LogicalPlacement } from "../Overlays/overlayTypes";

/**
 * An item of an NSEMenu (NSMenuItem). A command item sends its `action` along
 * the responder chain, and the action's validation decides whether it is
 * enabled, hidden or checked (`validateMenuItem`). A bare action name belongs
 * to the application that shows the menu; a dotted command id is taken as
 * written. Its key equivalent is the action's key binding, the one authority
 * for keys, so the menu shows the binding the action declared.
 */
export type NSEMenuItem<Payload = unknown> =
  | { readonly isSeparatorItem: true; readonly identifier?: string }
  | {
      readonly title?: ReactNode;
      readonly action: string | NSEActionReference<Payload>;
      readonly actionPayload?: NoInfer<Payload>;
      readonly image?: ReactNode;
      readonly identifier?: string;
    }
  | {
      readonly title: ReactNode;
      readonly submenu: readonly NSEMenuItem[];
      readonly image?: ReactNode;
      readonly isEnabled?: boolean;
      readonly toolTip?: string;
      readonly identifier?: string;
    }
  | {
      /** NSMenuItem.view: a row the menu draws but never validates or sends. */
      readonly view: () => ReactNode;
      readonly title: ReactNode;
      readonly identifier?: string;
    };

/** @internal A menu entry has one unambiguous presentation kind. */
export type MenuEntry =
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
      readonly entries: readonly MenuEntry[];
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
export interface MenuActionEntry<Payload = unknown> {
  readonly kind: "command";
  readonly id: string;
  readonly action: string | NSEActionReference<Payload>;
  readonly payload?: NoInfer<Payload>;
  readonly labelOverride?: ReactNode;
  readonly iconOverride?: ReactNode;
  readonly shortcutOverride?: string;
  readonly selectionKind?: "checkbox" | "radio";
}

/** An entry as authored: command entries may name an action instead of a command ID. */
export type MenuEntryInput =
  | Exclude<MenuEntry, { readonly kind: "submenu" }>
  | MenuActionEntry
  | (Omit<Extract<MenuEntry, { readonly kind: "submenu" }>, "entries"> & { readonly entries: readonly MenuEntryInput[] });

export interface MenuItemDefinition {
  readonly value: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly shortcut?: ReactNode;
  readonly disabled?: boolean;
  readonly hidden?: boolean;
  readonly disabledReason?: string;
  readonly checked?: boolean;
  readonly separator?: boolean;
  readonly children?: readonly MenuItemDefinition[];
}

export interface MenuModel {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly MenuEntryInput[];
  /**
   * Optional contributions are inserted deterministically by their stable
   * section ID and weight. They are a presentation extension point only: all
   * command validation continues through the same visible branch generation.
   */
  readonly sections?: readonly MenuSection[];
}

/** @internal Preserve payload correlation for each inferred authored entry, including submenus/sections. */
type CheckedMenuEntries<Entries extends readonly MenuEntryInput[]> = {
  readonly [K in keyof Entries]: MenuEntryInput extends Entries[K] ? Entries[K]
    : Entries[K] & NSEActionPayloadCheck<Entries[K], "payload"> &
      (Entries[K] extends { readonly entries: infer Children extends readonly MenuEntryInput[] }
        ? { readonly entries: CheckedMenuEntries<Children> } : unknown);
};
export type MenuModelActionCheck<Model extends MenuModel> = {
  readonly entries: CheckedMenuEntries<Model["entries"]>;
} & (Model extends { readonly sections: infer Sections extends readonly MenuSection[] }
  ? { readonly sections: { readonly [K in keyof Sections]: Sections[K] & { readonly entries: CheckedMenuEntries<Sections[K]["entries"]> } } }
  : unknown);

/** @internal Preserve payload correlation for each authored item, including submenus. */
export type CheckedMenuItems<Items extends readonly NSEMenuItem[]> = {
  readonly [K in keyof Items]: NSEMenuItem extends Items[K] ? Items[K]
    : Items[K] & NSEActionPayloadCheck<Items[K], "actionPayload"> &
      (Items[K] extends { readonly submenu: infer Children extends readonly NSEMenuItem[] }
        ? { readonly submenu: CheckedMenuItems<Children> } : unknown);
};

export interface MenuSection<TEntry = MenuEntryInput> {
  readonly id: string;
  readonly entries: readonly TEntry[];
  readonly weight?: number;
  readonly beforeId?: string;
  readonly afterId?: string;
}

export interface MenuScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * Explicit provenance needed to project a menu through the overlay stack.
 * A host that does not own an overlay provider may render `NSEMenu` as a pure
 * semantic surface, but it may not invent responder or scope ownership.
 */
export interface MenuOverlayOptions {
  readonly id: string;
  readonly parentResponderId: string;
  readonly parentId?: string | null;
  readonly parentScopeId?: string;
  readonly placement?: LogicalPlacement;
}

export interface NSEMenuRuntimePort {
  readonly signal: AbortSignal;
  readonly commands: {
    getPresentationGeneration(): { readonly registryGeneration: number; readonly responderGeneration: number };
    /** Notifies when command authority may have changed: the focused responder
     * chain, the command registry, or application state a validator reads. */
    subscribePresentation?(listener: () => void): () => void;
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
  readonly scheduler?: MenuScheduler;
  /** Turns an action name into the command ID of the application that declared it. Required for menus with `{ action }` entries. */
  readonly resolveAction?: (action: string) => CommandId;
}

export type MenuPresentedEntry =
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
  readonly entries: readonly MenuPresentedEntry[];
}

export type MenuDismissReason = "escape" | "selection" | "programmatic" | "parent-dismissed";

/** @internal The menu's internal model, for the framework's own menus (application menus, item menus). */
export const nseMenuModel: unique symbol = Symbol("nse.menuModel");

export interface NSEMenuOptions extends NSEControllerOwnershipOptions {
  /** NSMenu.title: the menu's name in a menu bar and for assistive technology. */
  readonly title: string;
  readonly items: readonly NSEMenuItem[];
  /** A stable identifier; one is generated otherwise. */
  readonly identifier?: string;
  /** The command authority the menu validates and sends through. A SynWare gets it from `SCOS.menus.runtime`. */
  readonly runtime: NSEMenuRuntimePort;
}

/** @internal */
export interface MenuModelOptions extends NSEControllerOwnershipOptions {
  readonly [nseMenuModel]: MenuModel;
  readonly runtime: NSEMenuRuntimePort;
}

export interface MenuKeyEquivalent {
  readonly event: KeyBindingEvent;
  readonly context?: KeyBindingContext;
}

export interface MenuKeyEquivalentClaim {
  readonly claim: KeyBindingClaim;
  readonly context: KeyBindingContext;
}

export type MenuKeyEquivalentResult = KeyBindingHandleResult | null;
