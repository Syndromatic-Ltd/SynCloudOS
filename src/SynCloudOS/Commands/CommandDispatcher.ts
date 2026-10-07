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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type {
  CommandContext,
  CommandDeclaration,
  CommandDispatchOptions,
  CommandDispatchAcceptance,
  CommandDispatchPreparation,
  CommandDispatchResult,
  CommandId,
  CommandResponderRegistrationToken,
  CommandResponderResolution,
  CommandResponderResolver,
} from "./commandTypes";
import { CommandUnknownOutcomeError, isCommandOperationResult } from "./commandTypes";
import { CommandRegistry } from "./CommandRegistry";
import type { ResponderResolution } from "../Responders/responderTypes";

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null
    && (typeof value === "object" || typeof value === "function")
    && typeof (value as { readonly then?: unknown }).then === "function";
}

export interface ResolvedCommand {
  readonly declaration: CommandDeclaration<unknown, unknown>;
  readonly responder: CommandResponderResolution;
  readonly chain: readonly CommandResponderResolution[];
  /** Exact registry entry that admitted this declaration. */
  readonly commandRegistrationGeneration: number;
  /** Kernel responder identities when the resolver exposes them. */
  readonly responderTokens: readonly CommandResponderRegistrationToken[] | null;
}

export class CommandDispatcher {
  private readonly acceptances = new WeakMap<object, {
    readonly id: CommandId;
    readonly payload: unknown;
    readonly resolved: ResolvedCommand;
    readonly parsedPayload: unknown;
    readonly responderGeneration: number;
    readonly startResponderId: string | undefined;
    readonly scopeToken?: object;
  }>();

  constructor(
    private readonly getRuntime: () => SynCloudOSRuntime,
    private readonly registry: CommandRegistry,
    private readonly responderResolver: CommandResponderResolver,
  ) {}

  resolve(id: CommandId, startId?: string): ResolvedCommand | null {
    const chain = this.responderResolver.resolveResponderChain(startId);
    for (const responder of chain) {
      const entry = this.registry.get(id, responder.id);
      if (entry) {
        const responderTokens = this.responderResolver.getRegistrationToken
          ? chain.map(({ id: responderId }) => this.responderResolver.getRegistrationToken!(responderId))
          : null;
        // A token-bearing resolver must prove every member of the admitted
        // chain. A partial snapshot would make a replacement indistinguishable
        // from a harmless duplicate DOM focus event.
        if (responderTokens?.some((token) => token === null)) return null;
        return {
          declaration: entry.declaration,
          responder,
          chain,
          commandRegistrationGeneration: entry.generation,
          responderTokens: responderTokens as readonly CommandResponderRegistrationToken[] | null,
        };
      }
    }
    return null;
  }

  private isResolutionLive(
    id: CommandId,
    resolved: ResolvedCommand,
    startId: string | undefined,
    fallbackResponderGeneration: number,
  ): boolean {
    const current = this.resolve(id, startId);
    if (!current
      || current.declaration !== resolved.declaration
      || current.commandRegistrationGeneration !== resolved.commandRegistrationGeneration
      || current.chain.length !== resolved.chain.length) return false;
    for (let index = 0; index < resolved.chain.length; index += 1) {
      const expected = resolved.chain[index]!;
      const actual = current.chain[index]!;
      if (actual.id !== expected.id || actual.scopeId !== expected.scopeId) return false;
    }
    if (resolved.responderTokens) {
      return current.responderTokens !== null
        && current.responderTokens.length === resolved.responderTokens.length
        && current.responderTokens.every((token, index) =>
          token.id === resolved.responderTokens![index]!.id
          && token.generation === resolved.responderTokens![index]!.generation,
        );
    }
    // Compatibility resolvers that cannot supply kernel registration tokens
    // retain their coarse generation fence. Runtime-owned resolvers use the
    // exact tuple above, so an equivalent focus publication is not mistaken
    // for a responder replacement.
    return (this.responderResolver.getGeneration?.() ?? 0) === fallbackResponderGeneration;
  }

  prepare(id: CommandId, payload: unknown, options: CommandDispatchOptions = {}): CommandDispatchPreparation | Promise<CommandDispatchPreparation> {
    const resolved = this.resolve(id, options.responderId);
    if (!resolved) return { status: "unhandled", reason: "No active responder handles this command." };
    const parsed = resolved.declaration.payload.parse(payload);
    if (!parsed.ok) return { status: "invalid-payload", reason: "The command payload is invalid." };
    if (options.signal?.aborted) return { status: "cancelled", reason: "Command validation was cancelled." };
    const runtime = this.getRuntime();
    const responderGeneration = this.responderResolver.getGeneration?.() ?? 0;
    const context = {
      runtime,
      runtimeId: runtime.runtimeId,
      commandId: id,
      responderId: resolved.responder.id,
      scopeId: resolved.responder.scopeId,
      payload: parsed.value,
    };
    const finish = (validation: { enabled: boolean; denied?: boolean; disabledReason?: string }) => {
      if (options.signal?.aborted
        || !this.isResolutionLive(id, resolved, options.responderId, responderGeneration)) {
        return { status: "cancelled", reason: "Command validation became stale." } as const;
      }
      if (validation.denied || !validation.enabled) {
        return {
          status: validation.denied ? "denied" : "disabled",
          reason: validation.disabledReason ?? (validation.denied ? "This command is not permitted." : "This command is not currently available."),
        } as const;
      }
      const acceptance = { commandId: id, responderId: resolved.responder.id } as CommandDispatchAcceptance;
      this.acceptances.set(acceptance, {
        id,
        payload,
        resolved,
        parsedPayload: parsed.value,
        responderGeneration,
        startResponderId: options.responderId,
        scopeToken: options.scopeToken,
      });
      return { status: "accepted", acceptance } as const;
    };
    const validation = resolved.declaration.validate?.(context) ?? { enabled: true };
    return validation instanceof Promise || (validation && typeof (validation as unknown as { then?: unknown }).then === "function")
      ? Promise.resolve(validation).then(finish)
      : finish(validation);
  }

  async dispatch<R>(id: CommandId, payload: unknown, options: CommandDispatchOptions = {}): Promise<CommandDispatchResult<R>> {
    let prepared = options.acceptance ? this.acceptances.get(options.acceptance as object) : undefined;
    if (options.acceptance) this.acceptances.delete(options.acceptance as object);
    if (prepared && (prepared.id !== id || !Object.is(prepared.payload, payload)
      || !this.isResolutionLive(id, prepared.resolved, prepared.startResponderId, prepared.responderGeneration)
      || prepared.scopeToken !== options.scopeToken
      || (options.responderId !== undefined && prepared.resolved.responder.id !== options.responderId))) prepared = undefined;
    if (options.acceptance && !prepared) {
      return { status: "cancelled", commandId: id, operationId: "", reason: "Command acceptance became stale." };
    }
    if (!prepared) {
      const preparation = await this.prepare(id, payload, options);
      if (preparation.status !== "accepted") {
        if (preparation.status === "unhandled") return { status: "unhandled", commandId: id };
        if (preparation.status === "invalid-payload") {
          const resolved = this.resolve(id, options.responderId);
          const parsed = resolved?.declaration.payload.parse(payload);
          return { status: "invalid-payload", commandId: id, issues: parsed && !parsed.ok ? parsed.issues : [preparation.reason] };
        }
        if (preparation.status === "cancelled") return { status: "cancelled", commandId: id, operationId: "", reason: preparation.reason };
        const resolved = this.resolve(id, options.responderId);
        return { status: preparation.status, commandId: id, responderId: resolved?.responder.id ?? "", reason: preparation.reason };
      }
      prepared = this.acceptances.get(preparation.acceptance as object);
      this.acceptances.delete(preparation.acceptance as object);
    }
    if (!prepared) return { status: "cancelled", commandId: id, operationId: "", reason: "Command acceptance became stale." };
    const { resolved, parsedPayload } = prepared;
    const runtime = this.getRuntime();
    const undoManager = runtime.undo.resolveForResponder(resolved.chain as readonly ResponderResolution[]);
    const queryContext = {
      runtime,
      runtimeId: runtime.runtimeId,
      commandId: id,
      responderId: resolved.responder.id,
      scopeId: resolved.responder.scopeId,
      payload: parsedPayload,
    };

    let effectMayHavePublished = false;
    let compensationEstablished = false;
    let lateAdmissionReason: string | null = null;
    let executionWasAsync = false;
    const admissionIsLive = () =>
      this.isResolutionLive(id, prepared!.resolved, prepared!.startResponderId, prepared!.responderGeneration) &&
      (!options.isLive || options.isLive()) &&
      (!options.undoRegistrationLease || options.undoRegistrationLease.isLive) &&
      !options.signal?.aborted;
    const unknownOutcome = (message: string, cause?: unknown) =>
      new CommandUnknownOutcomeError(message, cause === undefined ? undefined : { cause });

    const handle = runtime.operations.run({
      kind: `command:${id}`,
      input: { commandId: id, responderId: resolved.responder.id },
      correlationId: options.correlationId,
      commit: async (operation) => {
        const context: CommandContext<unknown> = {
          ...queryContext,
          operationId: operation.operationId,
          correlationId: operation.correlationId,
          signal: operation.signal,
          source: options.source ?? "api",
          undoManager,
        };
        const needsUndo = resolved.declaration.undo.kind === "register";
        if (needsUndo && !undoManager) throw new Error(`Command ${id} requires an undo owner in its resolved responder chain.`);
        // Admission happens before execute, so a disposed/poisoned/revoked
        // history cannot observe a mutating command after the fact. The
        // reservation also fences concurrent undo while the command awaits.
        const reservation = needsUndo
          ? (options.undoRegistrationLease?.reserve() ?? undoManager!.reserve())
          : null;
        let committed = false;
        const compensateAction = async (action: import("../Undo").UndoAction, primary: unknown) => {
          const failures: unknown[] = [];
          try { await action.undo(); }
          catch (error) { failures.push(error); }
          try { action.cleanup?.(); }
          catch (error) { failures.push(error); }
          if (failures.length > 0) {
            throw unknownOutcome(
              "Command mutation could not be proven compensated after undo admission failed.",
              new AggregateError([primary, ...failures], "Command admission and compensation failed."),
            );
          }
          compensationEstablished = true;
        };
        const compensateDeclared = async (commandValue: unknown, primary: unknown): Promise<boolean> => {
          if (resolved.declaration.undo.kind !== "register" || !resolved.declaration.undo.compensate) return false;
          const failures: unknown[] = [];
          try { await resolved.declaration.undo.compensate(context, commandValue); }
          catch (error) { failures.push(error); }
          if (failures.length > 0) {
            throw unknownOutcome(
              "Command mutation could not be proven compensated after its undo factory failed.",
              new AggregateError([primary, ...failures], "Command factory and compensation failed."),
            );
          }
          compensationEstablished = true;
          return true;
        };
        try {
          // A command can mutate before its first await.  From this point on,
          // a stale authority must never be presented as an executed result.
          effectMayHavePublished = true;
          const execution = resolved.declaration.execute(context);
          // Do not insert an artificial microtask between a synchronous
          // command's mutation and its admission fence. A controlled editor
          // may publish its new value to React immediately; that rerender must
          // not retroactively make a fully settled synchronous command look
          // like an indeterminate asynchronous side effect.
          let value: unknown;
          if (isPromiseLike(execution)) {
            executionWasAsync = true;
            value = await execution;
          } else {
            value = execution;
          }
          const commandValue = isCommandOperationResult(value) && value.result.status === "completed"
            ? value.result.value
            : value;
          if (isCommandOperationResult(value) && value.result.status !== "completed") {
            // A branded nested terminal result is the command's explicit
            // statement that its own transaction did not commit.  This is
            // stronger than the pessimistic pre-execution fence above: an
            // owner-cancelled editor command, for example, can prove that it
            // observed revocation before changing its document.  Preserve its
            // truthful cancelled/failed terminal instead of relabelling it as
            // an indeterminate mutation merely because the mount is now stale.
            effectMayHavePublished = value.result.committed;
            reservation?.cancel();
            return value;
          }
          if (!needsUndo) {
            // A synchronous declaration reaches this point in the same
            // turn as its mutation.  Its authority cannot be revoked across
            // an await, so a controlled React rerender caused by the command
            // itself is not an indeterminate late settlement. Every async
            // path still receives the full post-await admission fence.
            if (executionWasAsync && (!admissionIsLive() || operation.signal.aborted)) {
              lateAdmissionReason = "Command authority became stale after a non-reversible command may have mutated state.";
              throw unknownOutcome(lateAdmissionReason);
            }
            return value;
          }
          let action: import("../Undo").UndoAction;
          try {
            action = resolved.declaration.undo.createAction(context, commandValue);
          } catch (error) {
            if (await compensateDeclared(commandValue, error)) throw error;
            throw unknownOutcome(
              "Command mutated but its undo factory failed without a declared compensation contract.",
              error,
            );
          }
          if (executionWasAsync && (!admissionIsLive() || operation.signal.aborted)) {
            lateAdmissionReason = "Command authority became stale after command execution; the declared inverse was applied.";
            await compensateAction(action, new Error(lateAdmissionReason));
            throw new Error(lateAdmissionReason);
          }
          try {
            reservation?.commit(action);
            committed = true;
          } catch (error) {
            // A non-cooperative command may have changed its model before a
            // late mount/disposal fence. Its declared inverse is the only
            // safe compensation before surfacing admission failure.
            await compensateAction(action, error);
            throw error;
          }
          return value;
        } finally {
          if (!committed) reservation?.cancel();
        }
      },
    });
    const cancel = () => handle.cancel(options.signal?.reason instanceof Error ? options.signal.reason.message : "Command cancelled.");
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    try {
      const result = await handle.result;
      if (effectMayHavePublished && (lateAdmissionReason !== null || (executionWasAsync && !admissionIsLive()))) {
        if (compensationEstablished) {
          return {
            status: "cancelled",
            commandId: id,
            operationId: handle.operationId,
            reason: lateAdmissionReason ?? "The command authority became stale after compensation completed.",
          };
        }
        return {
          status: "unknown",
          commandId: id,
          operationId: handle.operationId,
          reason: lateAdmissionReason ?? "The command authority became stale after a command may have mutated state.",
          ...(result.status === "failed" ? { error: result.error } : {}),
        };
      }
      if (result.status === "completed") {
        if (isCommandOperationResult(result.value)) {
          const nested = result.value.result;
          if (nested.status === "completed") {
            return {
              status: "executed",
              commandId: id,
              responderId: resolved.responder.id,
              operationId: handle.operationId,
              correlationId: handle.correlationId,
              value: nested.value as R,
            };
          }
          if (nested.status === "cancelled") {
            return { status: "cancelled", commandId: id, operationId: handle.operationId, reason: nested.reason };
          }
          return {
            status: "failed",
            commandId: id,
            operationId: handle.operationId,
            error: nested.error,
          };
        }
        return {
          status: "executed",
          commandId: id,
          responderId: resolved.responder.id,
          operationId: handle.operationId,
          correlationId: handle.correlationId,
          value: result.value as R,
        };
      }
      if (result.status === "cancelled") {
        return { status: "cancelled", commandId: id, operationId: handle.operationId, reason: result.reason };
      }
      return {
        status: "failed",
        commandId: id,
        operationId: handle.operationId,
        error: result.error,
      };
    } finally {
      options.signal?.removeEventListener("abort", cancel);
    }
  }
}
