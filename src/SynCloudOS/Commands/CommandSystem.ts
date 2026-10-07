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
import { CommandDispatcher } from "./CommandDispatcher";
import { CommandRegistry } from "./CommandRegistry";
import type {
  CommandDeclaration,
  CommandDiagnosticRecord,
  CommandDispatchOptions,
  CommandDispatchResult,
  CommandId,
  CommandInspection,
  CommandPresentation,
  CommandRegistration,
  CommandResponderResolver,
  CommandSystem,
  CommandValidationOptions,
  CommandValidationRequest,
  CommandValidationRequestKey,
  LocalisedCommandTitle,
} from "./commandTypes";
import { CommandValidationRequestError, commandValidationStaleReason } from "./commandTypes";

export interface CreateCommandSystemOptions {
  readonly runtime?: SynCloudOSRuntime;
  readonly getRuntime?: () => SynCloudOSRuntime;
  readonly responderResolver: CommandResponderResolver;
  readonly historyLimit?: number;
}

function formatTitle(title: LocalisedCommandTitle): string {
  if (!title.values) return title.fallback;
  return Object.entries(title.values).reduce(
    (value, [key, replacement]) => value.replaceAll(`{${key}}`, String(replacement)),
    title.fallback,
  );
}

function unresolvedPresentation(commandId: CommandId): CommandPresentation {
  return {
    commandId,
    responderId: null,
    title: commandId,
    enabled: false,
    denied: false,
    hidden: false,
    state: "off",
    stale: false,
    disabledReason: "No active responder handles this command.",
  };
}

function cancelledPresentation(commandId: CommandId): CommandPresentation {
  return { ...unresolvedPresentation(commandId), disabledReason: "Command validation was cancelled." };
}

function stalePresentation(commandId: CommandId): CommandPresentation {
  return { ...unresolvedPresentation(commandId), stale: true, disabledReason: commandValidationStaleReason };
}

export function createCommandSystem(options: CreateCommandSystemOptions): CommandSystem {
  const getRuntime = options.getRuntime ?? (() => options.runtime!);
  const registry = new CommandRegistry();
  const dispatcher = new CommandDispatcher(getRuntime, registry, options.responderResolver);
  const history: CommandDiagnosticRecord[] = [];
  const historyLimit = Math.max(1, options.historyLimit ?? 80);
  let disposed = false;

  const record = (entry: CommandDiagnosticRecord) => {
    history.push(entry);
    history.splice(0, Math.max(0, history.length - historyLimit));
  };

  const validate = async (id: CommandId, payload?: unknown, validationOptions: CommandValidationOptions = {}): Promise<CommandPresentation> => {
    const startedAt = getRuntime().environment.now();
    const resolved = dispatcher.resolve(id, validationOptions.responderId);
    if (!resolved) return unresolvedPresentation(id);
    const parsed = resolved.declaration.payload.parse(payload);
    if (!parsed.ok) {
      record({ at: startedAt, type: "validation", commandId: id, responderId: resolved.responder.id, chain: resolved.chain.map(({ id: responderId }) => responderId), issues: parsed.issues, outcome: "invalid-payload" });
      return { ...unresolvedPresentation(id), responderId: resolved.responder.id, title: formatTitle(typeof resolved.declaration.title === "function" ? { key: id, fallback: id } : resolved.declaration.title), disabledReason: "The command payload is invalid." };
    }
    if (validationOptions.signal?.aborted) return cancelledPresentation(id);
    const responderGeneration = options.responderResolver.getGeneration?.() ?? 0;
    const registryGeneration = registry.generation;
    const runtime = getRuntime();
    const context = { runtime, runtimeId: runtime.runtimeId, commandId: id, responderId: resolved.responder.id, scopeId: resolved.responder.scopeId, payload: parsed.value };
    const declaredTitle = typeof resolved.declaration.title === "function" ? resolved.declaration.title(context) : resolved.declaration.title;
    const validation = await resolved.declaration.validate?.(context) ?? { enabled: true };
    if (validationOptions.signal?.aborted) return cancelledPresentation(id);
    if (disposed || registry.generation !== registryGeneration || (options.responderResolver.getGeneration?.() ?? 0) !== responderGeneration) {
      return stalePresentation(id);
    }
    const title = validation.title ?? declaredTitle;
    const presentation: CommandPresentation = {
      commandId: id,
      responderId: resolved.responder.id,
      title: formatTitle(title),
      icon: resolved.declaration.icon,
      enabled: validation.enabled && !validation.denied,
      denied: validation.denied ?? false,
      hidden: validation.hidden ?? false,
      state: validation.state ?? "off",
      stale: false,
      disabledReason: validation.disabledReason,
    };
    record({ at: startedAt, type: "validation", commandId: id, responderId: resolved.responder.id, chain: resolved.chain.map(({ id: responderId }) => responderId), durationMs: Math.max(0, runtime.environment.now() - startedAt), outcome: validation.denied ? "denied" : validation.enabled ? "enabled" : "disabled" });
    return presentation;
  };

  const system: CommandSystem = {
    get runtimeId() { return getRuntime().runtimeId; },
    register<P, R>(declaration: CommandDeclaration<P, R>): CommandRegistration {
      const registration = registry.register(declaration);
      record({ at: getRuntime().environment.now(), type: "registration", commandId: declaration.id, responderId: declaration.responderId });
      return {
        ...registration,
        dispose() {
          const removed = registration.dispose();
          if (removed) record({ at: getRuntime().environment.now(), type: "disposal", commandId: declaration.id, responderId: declaration.responderId });
          return removed;
        },
      };
    },
    async dispatch<R = unknown>(id: CommandId, payload?: unknown, dispatchOptions?: CommandDispatchOptions): Promise<CommandDispatchResult<R>> {
      if (disposed) return { status: "cancelled", commandId: id, operationId: "", reason: "Runtime commands are disposed." };
      const result = await dispatcher.dispatch<R>(id, payload, dispatchOptions);
      record({
        at: getRuntime().environment.now(),
        type: "dispatch",
        commandId: id,
        responderId: "responderId" in result ? result.responderId : undefined,
        outcome: result.status,
        operationId: "operationId" in result ? result.operationId : undefined,
        correlationId: "correlationId" in result ? result.correlationId : undefined,
        issues: result.status === "invalid-payload" ? result.issues : undefined,
      });
      return result;
    },
    prepareDispatch(id, payload, dispatchOptions) {
      if (disposed) return { status: "cancelled", reason: "Runtime commands are disposed." };
      return dispatcher.prepare(id, payload, dispatchOptions);
    },
    validate,
    async validateMany(requests: readonly CommandValidationRequest[], validationOptions: CommandValidationOptions = {}): Promise<ReadonlyMap<CommandValidationRequestKey, CommandPresentation>> {
      const keys = new Set<string>();
      requests.forEach((request, requestIndex) => {
        if (request.key.trim().length === 0) throw new CommandValidationRequestError("empty-key", request.key, requestIndex);
        if (keys.has(request.key)) throw new CommandValidationRequestError("duplicate-key", request.key, requestIndex);
        keys.add(request.key);
      });
      if (validationOptions.signal?.aborted) {
        return new Map(requests.map((request) => [request.key, cancelledPresentation(request.commandId)]));
      }
      const capturedResponderGeneration = options.responderResolver.getGeneration?.() ?? 0;
      const capturedRegistryGeneration = registry.generation;
      const shared: Array<{ commandId: CommandId; payload: unknown; promise: Promise<CommandPresentation> }> = [];
      const promises = requests.map((request) => {
        const existing = shared.find((entry) => entry.commandId === request.commandId && Object.is(entry.payload, request.payload));
        if (existing) return existing.promise;
        const promise = validate(request.commandId, request.payload, validationOptions).then((presentation) => {
          if (validationOptions.signal?.aborted) return cancelledPresentation(request.commandId);
          const currentResponderGeneration = options.responderResolver.getGeneration?.() ?? 0;
          return !disposed
            && currentResponderGeneration === capturedResponderGeneration
            && registry.generation === capturedRegistryGeneration
            ? presentation
            : stalePresentation(request.commandId);
        });
        shared.push({ commandId: request.commandId, payload: request.payload, promise });
        return promise;
      });
      const presentations = await Promise.all(promises);
      return new Map(requests.map((request, index) => [request.key, presentations[index]]));
    },
    inspect(): CommandInspection {
      return { registrations: registry.inspect(), history: [...history], generation: registry.generation };
    },
    getDeclarations: () => registry.declarations(),
    dispose() {
      if (disposed) return;
      disposed = true;
      registry.dispose();
    },
  };
  return system;
}
