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

import type { CommandDispatchAcceptance, CommandId, CommandScope } from "../Commands/commandTypes";

export type KeyBindingModifier = "primary" | "shift" | "alt" | "control" | "meta";

export interface KeyBindingDeclaration {
  readonly key: string;
  readonly modifiers: readonly KeyBindingModifier[];
  readonly scope: CommandScope;
  readonly platform?: "all" | "mac" | "windows" | "linux";
  readonly allowInEditable?: boolean;
  readonly allowDuringComposition?: boolean;
  readonly repeat?: "allow" | "ignore";
  readonly priority?: number;
}

export interface ResolvedKeyBinding extends KeyBindingDeclaration {
  readonly commandId: CommandId;
  readonly responderId: string;
  readonly source: "default" | "user";
  readonly display: string;
}

export interface KeyBindingEvent {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
  readonly isComposing?: boolean;
  readonly target?: EventTarget | null;
  getModifierState?(key: string): boolean;
}

export interface KeyBindingContext {
  readonly editable?: boolean;
  readonly scopeId?: string;
}

export type KeyBindingCandidateReason = "winner" | "outside-active-scope" | "unsafe-input-context" | "default-replaced-by-user" | "disabled-by-user" | "lower-responder-rank" | "lower-priority" | "lexical-tie-break";
export interface KeyBindingCandidateInspection { readonly commandId: CommandId; readonly responderId: string; readonly source: "default" | "user"; readonly reason: KeyBindingCandidateReason }
export interface KeyBindingResolution { readonly binding: ResolvedKeyBinding; readonly candidates: readonly KeyBindingCandidateInspection[] }
/**
 * A synchronously accepted keyboard route.  The DOM boundary consumes an
 * event only after obtaining one of these; asynchronous validation therefore
 * leaves native/editor fallback untouched.
 */
export interface KeyBindingClaim { readonly resolution: KeyBindingResolution; readonly acceptance: CommandDispatchAcceptance }
export interface KeyBindingHandleResult { readonly handled: boolean; readonly reason: string; readonly resolution?: KeyBindingResolution; readonly dispatchResult?: unknown }
export interface KeyBindingManager {
  resolve(event: KeyBindingEvent, context: KeyBindingContext): KeyBindingResolution | null;
  claimKeyboardEvent(event: KeyBindingEvent, context: KeyBindingContext): KeyBindingClaim | null;
  handleKeyboardEvent(event: KeyBindingEvent, context: KeyBindingContext, claim?: KeyBindingClaim): Promise<KeyBindingHandleResult>;
  setOverride(commandId: CommandId, binding: KeyBindingDeclaration | null): void;
  clearOverride(commandId: CommandId): void;
  inspectCollisions(): readonly KeyBindingCandidateInspection[];
  inspect(): {
    readonly overrides: readonly { readonly commandId: CommandId; readonly binding: KeyBindingDeclaration | null }[];
    readonly invalidOverrides: readonly { readonly commandId?: string; readonly reason: string }[];
    readonly lastCandidates: readonly KeyBindingCandidateInspection[];
  };
  dispose(): void;
}
