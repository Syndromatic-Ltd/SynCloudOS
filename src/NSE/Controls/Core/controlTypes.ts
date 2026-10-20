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

import type {
  CommandDispatchOptions,
  CommandDispatchResult,
  CommandId,
  CommandPresentation,
  CommandDispatchPreparation,
  CommandValidationOptions,
} from "../../../SynCloudOS/SynCloudOS";
import type { Formatter, FormatterContext } from "../../../SynCloudOS/Models";

/** The user-visible stage of a control value change. */
export type NSEControlInteractionPhase = "preview" | "commit" | "cancel";

/**
 * A validation result owned by the control consumer. Command availability remains
 * owned by the command system and is intentionally separate.
 */
export type NSEControlValidation =
  | { readonly kind: "valid" }
  | { readonly kind: "invalid"; readonly code: string; readonly message: string };

/** Common controlled/uncontrolled and native-form behaviour for NSE value controls. */
export interface NSEControlValueProps<T> {
  readonly value?: T;
  readonly defaultValue?: T;
  readonly name?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly validation?: NSEControlValidation;
  onValueChange?(value: T, phase: NSEControlInteractionPhase): void;
}

/** Declarative command tuple. Resolution is always delegated to the active responder graph. */
export interface NSEControlCommandBinding<P> {
  readonly id: CommandId;
  readonly payload: P;
  readonly responderId?: string;
}

export type NSECheckboxState = false | true | "mixed";

/**
 * Runtime-neutral command capability used by NSE. The React runtime layer adapts
 * the canonical command service into this port; NSE never creates a
 * responder, focus, command, or lifecycle registry of its own.
 */
export interface NSEControlRuntimePort {
  readonly signal: AbortSignal;
  readonly scheduler?: {
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
  };
  readonly commands: {
    getPresentationGeneration(): { readonly registryGeneration: number; readonly responderGeneration: number };
    /** Invalidates cached presentation after canonical focus or responder changes. */
    subscribePresentation?(listener: () => void): () => void;
    validate(
      id: CommandId,
      payload?: unknown,
      options?: CommandValidationOptions,
    ): Promise<CommandPresentation>;
    dispatch(
      id: CommandId,
      payload?: unknown,
      options?: CommandDispatchOptions,
    ): Promise<CommandDispatchResult<unknown>>;
    prepareDispatch(
      id: CommandId,
      payload?: unknown,
      options?: CommandDispatchOptions,
    ): CommandDispatchPreparation | Promise<CommandDispatchPreparation>;
  };
}

export interface NSEFormattedControlProps<T> extends NSEControlValueProps<T> {
  readonly formatter: Formatter<T>;
  readonly formatterContext: FormatterContext;
}
