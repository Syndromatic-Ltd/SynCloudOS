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

import type { ResolvedKeyBinding, KeyBindingDeclaration } from "../KeyBindings/keyBindingTypes";
import type { OperationResult } from "../Operations/operationTypes";
import type { SynCloudOSRuntime, SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { UndoAction, UndoCommandTarget, UndoRegistrationLease } from "../Undo/undoTypes";

export type CommandId = string;
export type CommandScope = "focused" | "document" | "window" | "application" | "workspace" | "webspring" | "runtime";
export type CommandDispatchSource = "api" | "keyboard" | "menu" | "toolbar" | "system";

export interface LocalisedCommandTitle {
  readonly key: string;
  readonly fallback: string;
  readonly values?: Readonly<Record<string, string | number>>;
}

export interface CommandPayloadSchema<P> {
  readonly description: string;
  parse(value: unknown): { readonly ok: true; readonly value: P } | { readonly ok: false; readonly issues: readonly string[] };
}

export interface CommandContext<P> {
  readonly runtime: SynCloudOSRuntime;
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly commandId: CommandId;
  readonly responderId: string;
  readonly scopeId: string | null;
  readonly operationId: string;
  readonly correlationId: string;
  readonly signal: AbortSignal;
  readonly source: CommandDispatchSource;
  readonly payload: P;
  readonly undoManager: UndoCommandTarget | null;
}

export interface CommandQueryContext<P> {
  readonly runtime: SynCloudOSRuntime;
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly commandId: CommandId;
  readonly responderId: string;
  readonly scopeId: string | null;
  readonly payload: P;
}

export interface CommandValidation {
  readonly enabled: boolean;
  readonly denied?: boolean;
  readonly hidden?: boolean;
  readonly state?: "off" | "on" | "mixed";
  readonly title?: LocalisedCommandTitle;
  readonly disabledReason?: string;
}

declare const commandValidationRequestKeyBrand: unique symbol;
export type CommandValidationRequestKey = string & { readonly [commandValidationRequestKeyBrand]: true };

export class CommandValidationRequestError extends Error {
  constructor(
    readonly code: "empty-key" | "duplicate-key",
    readonly key: string,
    readonly requestIndex: number,
  ) {
    super(code === "empty-key" ? "Command validation request keys must not be empty." : `Duplicate command validation request key: ${key}`);
    this.name = "CommandValidationRequestError";
  }
}

export function commandValidationRequestKey(value: string): CommandValidationRequestKey {
  if (value.trim().length === 0) throw new CommandValidationRequestError("empty-key", value, 0);
  return value as CommandValidationRequestKey;
}

export interface CommandValidationRequest {
  readonly key: CommandValidationRequestKey;
  readonly commandId: CommandId;
  readonly payload?: unknown;
}

export interface CommandValidationOptions {
  readonly signal?: AbortSignal;
  readonly source?: CommandDispatchSource;
  readonly generation?: number;
  /** Internal capability routing. AppSDK facades keep this out of their
   * public type and mint the token themselves. */
  readonly responderId?: string;
  readonly scopeToken?: object;
  /** Internal mount/session liveness fence. */
  readonly isLive?: () => boolean;
  readonly undoRegistrationLease?: UndoRegistrationLease;
}

export type CommandUndoPolicy<P, R> =
  | { readonly kind: "none" }
  | {
      readonly kind: "register";
      createAction(context: CommandContext<P>, result: R): UndoAction;
      /**
       * An inverse available before an undo action can be constructed. It is
       * required to recover a command whose mutation has returned but whose
       * undo factory subsequently rejects.
       */
      compensate?(context: CommandContext<P>, result: R): void | Promise<void>;
    };

export class CommandUnknownOutcomeError extends Error {
  readonly code = "command-outcome-unknown";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CommandUnknownOutcomeError";
  }
}

const commandOperationResultBrand: unique symbol = Symbol("SynCloudOS.CommandOperationResult");

/**
 * Opt-in adapter for commands that compose a runtime operation.  The brand is
 * deliberate: ordinary command values are allowed to contain a `status`
 * field and must never be treated as an operation terminal result.
 */
export interface CommandOperationResult<T> {
  readonly [commandOperationResultBrand]: true;
  readonly result: OperationResult<T>;
}

export function commandOperationResult<T>(result: OperationResult<T>): CommandOperationResult<T> {
  return { [commandOperationResultBrand]: true, result };
}

export function isCommandOperationResult(value: unknown): value is CommandOperationResult<unknown> {
  return Boolean(value)
    && typeof value === "object"
    && (value as { [commandOperationResultBrand]?: unknown })[commandOperationResultBrand] === true;
}

export interface CommandDeclaration<P, R> {
  readonly id: CommandId;
  readonly responderId: string;
  readonly title: LocalisedCommandTitle | ((context: CommandQueryContext<P>) => LocalisedCommandTitle);
  readonly icon?: string;
  readonly menuCategory?: string;
  readonly payload: CommandPayloadSchema<P>;
  readonly defaultKeyBindings: readonly KeyBindingDeclaration[];
  /** Allows this command's declared binding to replace a browser or assistive-technology primary shortcut. */
  readonly allowReservedBrowserShortcut?: boolean;
  readonly scope: CommandScope;
  readonly undo: CommandUndoPolicy<P, R>;
  readonly telemetry?: { readonly category: string; readonly sensitivePayload: boolean };
  validate?(context: CommandQueryContext<P>): CommandValidation | Promise<CommandValidation>;
  execute(context: CommandContext<P>): R | CommandOperationResult<R> | Promise<R | CommandOperationResult<R>>;
}

export interface CommandPresentation {
  readonly commandId: CommandId;
  readonly responderId: string | null;
  readonly title: string;
  readonly icon?: string;
  readonly enabled: boolean;
  readonly denied: boolean;
  readonly hidden: boolean;
  readonly state: "off" | "on" | "mixed";
  readonly disabledReason?: string;
  readonly keyBinding?: ResolvedKeyBinding;
  /** True only for an explicitly detected responder/registry replacement. */
  readonly stale?: boolean;
}

export const commandValidationStaleReason = "Command validation became stale.";

export function isCommandValidationStale(presentation: CommandPresentation): boolean {
  return presentation.stale === true && presentation.disabledReason === commandValidationStaleReason;
}

export interface CommandError {
  readonly code: string;
  readonly name: string;
  readonly message: string;
  readonly cause?: unknown;
}

export type CommandDispatchResult<R> =
  | { readonly status: "executed"; readonly commandId: CommandId; readonly responderId: string; readonly operationId: string; readonly correlationId: string; readonly value: R }
  | { readonly status: "invalid-payload"; readonly commandId: CommandId; readonly issues: readonly string[] }
  | { readonly status: "disabled" | "denied"; readonly commandId: CommandId; readonly responderId: string; readonly reason: string }
  | { readonly status: "unhandled"; readonly commandId: CommandId }
  | { readonly status: "cancelled"; readonly commandId: CommandId; readonly operationId: string; readonly reason: string }
  | { readonly status: "unknown"; readonly commandId: CommandId; readonly operationId: string; readonly reason: string; readonly error?: CommandError }
  | { readonly status: "failed"; readonly commandId: CommandId; readonly operationId: string; readonly error: CommandError };

declare const commandDispatchAcceptanceBrand: unique symbol;
/** One-shot proof that the exact command tuple was validated against the current responder graph. */
export interface CommandDispatchAcceptance {
  readonly [commandDispatchAcceptanceBrand]: true;
  readonly commandId: CommandId;
  readonly responderId: string;
}

export type CommandDispatchPreparation =
  | { readonly status: "accepted"; readonly acceptance: CommandDispatchAcceptance }
  | { readonly status: "invalid-payload" | "disabled" | "denied" | "unhandled" | "cancelled"; readonly reason: string };

export interface CommandDispatchOptions {
  readonly source?: CommandDispatchSource;
  readonly correlationId?: string;
  readonly signal?: AbortSignal;
  readonly acceptance?: CommandDispatchAcceptance;
  /** Internal capability routing. */
  readonly responderId?: string;
  readonly scopeToken?: object;
  /** Internal mount/session liveness fence. */
  readonly isLive?: () => boolean;
  readonly undoRegistrationLease?: UndoRegistrationLease;
}

export interface CommandResponderResolution { readonly id: string; readonly scopeId: string | null }
/**
 * Kernel-issued identity for one responder registration. A resolver that can
 * supply these lets command admission distinguish a real responder replacement
 * from an equivalent focus/anchor publication.
 */
export interface CommandResponderRegistrationToken {
  readonly id: string;
  readonly generation: number;
}
export interface CommandResponderResolver {
  resolveResponderChain(startId?: string): readonly CommandResponderResolution[];
  getGeneration?(): number;
  getRegistrationToken?(id: string): CommandResponderRegistrationToken | null;
}

export interface CommandRegistration { readonly commandId: CommandId; readonly responderId: string; dispose(): boolean }

export interface CommandDiagnosticRecord {
  readonly at: number;
  readonly type: "registration" | "disposal" | "validation" | "dispatch";
  readonly commandId: CommandId;
  readonly responderId?: string;
  readonly chain?: readonly string[];
  readonly durationMs?: number;
  readonly outcome?: string;
  readonly operationId?: string;
  readonly correlationId?: string;
  readonly issues?: readonly string[];
}

export interface CommandInspection {
  readonly registrations: readonly { readonly commandId: CommandId; readonly responderId: string; readonly generation: number }[];
  readonly history: readonly CommandDiagnosticRecord[];
  readonly generation: number;
}

export interface CommandSystem {
  readonly runtimeId: SynCloudOSRuntimeId;
  register<P, R>(declaration: CommandDeclaration<P, R>): CommandRegistration;
  /** Observes registry changes, coalesced after registration mutations settle. */
  subscribe(listener: () => void): () => void;
  dispatch<R = unknown>(id: CommandId, payload?: unknown, options?: CommandDispatchOptions): Promise<CommandDispatchResult<R>>;
  prepareDispatch(id: CommandId, payload?: unknown, options?: CommandDispatchOptions): CommandDispatchPreparation | Promise<CommandDispatchPreparation>;
  validate(id: CommandId, payload?: unknown, options?: CommandValidationOptions): Promise<CommandPresentation>;
  validateMany(requests: readonly CommandValidationRequest[], options?: CommandValidationOptions): Promise<ReadonlyMap<CommandValidationRequestKey, CommandPresentation>>;
  inspect(): CommandInspection;
  getDeclarations(): readonly CommandDeclaration<unknown, unknown>[];
  dispose(): void;
}
