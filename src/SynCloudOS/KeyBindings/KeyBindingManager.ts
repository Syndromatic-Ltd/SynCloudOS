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

import type { CommandDeclaration, CommandDispatchAcceptance, CommandId, CommandScope } from "../Commands/commandTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { KeyBindingCandidateInspection, KeyBindingClaim, KeyBindingContext, KeyBindingDeclaration, KeyBindingEvent, KeyBindingManager, KeyBindingResolution, KeyBindingModifier, ResolvedKeyBinding } from "./keyBindingTypes";

const standardEditableCommands = new Set(["edit.undo", "edit.redo", "edit.cut", "edit.copy", "edit.paste", "edit.selectAll"]);
const reservedPrimaryKeys = new Set(["l", "t", "n", "w", "r"]);

function normaliseKey(key: string) { return key.length === 1 ? key.toLocaleLowerCase() : key; }
function isEditableTarget(target: EventTarget | null | undefined) {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.closest("[contenteditable=true]") !== null;
}

const modifierValues = new Set<KeyBindingModifier>(["primary", "shift", "alt", "control", "meta"]);
const scopeValues = new Set<CommandScope>(["focused", "document", "window", "application", "workspace", "webspring", "runtime"]);
const platformValues = new Set<NonNullable<KeyBindingDeclaration["platform"]>>(["all", "mac", "windows", "linux"]);
const repeatValues = new Set<NonNullable<KeyBindingDeclaration["repeat"]>>(["allow", "ignore"]);

function modifierPressed(modifier: KeyBindingModifier, event: KeyBindingEvent, platform: SynCloudOSRuntime["environment"]["platform"]) {
  if (modifier === "primary") return platform === "mac" ? event.metaKey : event.ctrlKey;
  if (modifier === "control") return event.ctrlKey;
  if (modifier === "meta") return event.metaKey;
  if (modifier === "shift") return event.shiftKey;
  return event.altKey;
}
function chordMatches(binding: KeyBindingDeclaration, event: KeyBindingEvent, platform: SynCloudOSRuntime["environment"]["platform"]) {
  if (normaliseKey(binding.key) !== normaliseKey(event.key)) return false;
  const wanted = new Set(binding.modifiers);
  const primaryUsesMeta = platform === "mac";
  const expectedCtrl = wanted.has("control") || (wanted.has("primary") && !primaryUsesMeta);
  const expectedMeta = wanted.has("meta") || (wanted.has("primary") && primaryUsesMeta);
  return event.ctrlKey === expectedCtrl && event.metaKey === expectedMeta && event.shiftKey === wanted.has("shift") && event.altKey === wanted.has("alt");
}
function display(binding: KeyBindingDeclaration, platform: SynCloudOSRuntime["environment"]["platform"]) {
  const labels: string[] = [];
  const modifiers: KeyBindingModifier[] = ["primary", "control", "alt", "shift", "meta"];
  for (const modifier of modifiers) {
    if (!binding.modifiers.includes(modifier)) continue;
    if (modifier === "primary") labels.push(platform === "mac" ? "Cmd" : "Ctrl");
    else labels.push(modifier === "control" ? "Ctrl" : modifier === "meta" ? "Cmd" : modifier[0].toUpperCase() + modifier.slice(1));
  }
  labels.push(binding.key.length === 1 ? binding.key.toLocaleUpperCase() : binding.key);
  return labels.join("+");
}

function parsePersistedBinding(value: unknown): KeyBindingDeclaration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.key !== "string" || candidate.key.trim().length === 0) return null;
  const modifiers = typeof candidate.modifiers === "string"
    ? [candidate.modifiers]
    : Array.isArray(candidate.modifiers) ? candidate.modifiers : null;
  if (!modifiers || !modifiers.every((modifier): modifier is KeyBindingModifier => typeof modifier === "string" && modifierValues.has(modifier as KeyBindingModifier))) return null;
  if (typeof candidate.scope !== "string" || !scopeValues.has(candidate.scope as CommandScope)) return null;
  if (candidate.platform !== undefined && (typeof candidate.platform !== "string" || !platformValues.has(candidate.platform as NonNullable<KeyBindingDeclaration["platform"]>))) return null;
  if (candidate.repeat !== undefined && (typeof candidate.repeat !== "string" || !repeatValues.has(candidate.repeat as NonNullable<KeyBindingDeclaration["repeat"]>))) return null;
  if (candidate.allowInEditable !== undefined && typeof candidate.allowInEditable !== "boolean") return null;
  if (candidate.allowDuringComposition !== undefined && typeof candidate.allowDuringComposition !== "boolean") return null;
  if (candidate.priority !== undefined && (typeof candidate.priority !== "number" || !Number.isFinite(candidate.priority))) return null;
  return {
    key: candidate.key,
    modifiers,
    scope: candidate.scope as CommandScope,
    ...(candidate.platform === undefined ? {} : { platform: candidate.platform as KeyBindingDeclaration["platform"] }),
    ...(candidate.repeat === undefined ? {} : { repeat: candidate.repeat as KeyBindingDeclaration["repeat"] }),
    ...(candidate.allowInEditable === undefined ? {} : { allowInEditable: candidate.allowInEditable }),
    ...(candidate.allowDuringComposition === undefined ? {} : { allowDuringComposition: candidate.allowDuringComposition }),
    ...(candidate.priority === undefined ? {} : { priority: candidate.priority }),
  };
}

export function createKeyBindingManager(options: { getRuntime(): SynCloudOSRuntime }): KeyBindingManager {
  const overrides = new Map<CommandId, KeyBindingDeclaration | null>();
  let lastCandidates: KeyBindingCandidateInspection[] = [];
  let invalidOverrides: Array<{ commandId?: string; reason: string }> = [];
  let disposed = false;
  let hydrated = false;
  const pendingAcceptances = new Map<string, Promise<void>>();
  const settledAcceptances = new Map<string, { acceptance: CommandDispatchAcceptance; registryGeneration: number; responderGeneration: number }>();

  const acceptanceKey = (resolution: KeyBindingResolution) => `${resolution.binding.commandId}\0${resolution.binding.responderId}`;

  const hydrate = () => {
    if (hydrated) return;
    hydrated = true;
    const stored = options.getRuntime().persistence.getPreference<unknown>("commands.keyBindings.overrides", []);
    if (!Array.isArray(stored)) return;
    for (const entry of stored) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || entry[0].trim().length === 0) continue;
      if (entry[1] === null) {
        overrides.set(entry[0], null);
        continue;
      }
      const binding = parsePersistedBinding(entry[1]);
      if (binding) overrides.set(entry[0], binding);
      else invalidOverrides.push({ commandId: entry[0], reason: "Persisted key binding override is malformed." });
    }
  };

  const save = () => options.getRuntime().persistence.setPreference("commands.keyBindings.overrides", Array.from(overrides.entries()));

  const respondersAllowedByScope = (runtime: SynCloudOSRuntime, scopeId: string, chain: ReturnType<SynCloudOSRuntime["responders"]["resolveChain"]>) => {
    const allowed = new Set<string>();
    const scopeIds = new Set([scopeId]);
    const openScopes = runtime.focus.inspect().scopes;
    let currentScope = openScopes.find((scope) => scope.id === scopeId);
    let modalBoundary = false;
    if (currentScope?.modal) modalBoundary = true;
    while (currentScope?.parentScopeId) {
      scopeIds.add(currentScope.parentScopeId);
      currentScope = openScopes.find((scope) => scope.id === currentScope?.parentScopeId);
      if (currentScope?.modal) modalBoundary = true;
    }
    const roots = new Set<string>();
    for (const responder of chain) if (scopeIds.has(responder.scopeId)) roots.add(responder.id);
    if (!modalBoundary) for (const focusScope of openScopes) if (scopeIds.has(focusScope.id)) roots.add(focusScope.parentResponderId);
    for (const root of roots) {
      let responder = runtime.responders.get(root);
      const visited = new Set<string>();
      while (responder && !visited.has(responder.id)) {
        if (modalBoundary && !scopeIds.has(responder.scopeId)) break;
        visited.add(responder.id);
        allowed.add(responder.id);
        responder = responder.parentId ? runtime.responders.get(responder.parentId) : null;
      }
    }
    return allowed;
  };

  const manager: KeyBindingManager = {
    resolve(event, context): KeyBindingResolution | null {
      if (disposed || event.getModifierState?.("AltGraph")) return null;
      hydrate();
      const runtime = options.getRuntime();
      const chain = runtime.responders.resolveChain();
      const rank = new Map(chain.map(({ id }, index) => [id, index]));
      const scopedResponders = context.scopeId ? respondersAllowedByScope(runtime, context.scopeId, chain) : null;
      const editable = context.editable ?? isEditableTarget(event.target);
      const declarations = runtime.commands.getDeclarations();
      const candidates: Array<{ declaration: CommandDeclaration<unknown, unknown>; binding: KeyBindingDeclaration; source: "default" | "user"; rank: number }> = [];
      const diagnostic: KeyBindingCandidateInspection[] = [];
      for (const declaration of declarations) {
        const responderRank = rank.get(declaration.responderId);
        if (responderRank === undefined || (scopedResponders && !scopedResponders.has(declaration.responderId))) {
          for (const _ of declaration.defaultKeyBindings) diagnostic.push({ commandId: declaration.id, responderId: declaration.responderId, source: "default", reason: "outside-active-scope" });
          continue;
        }
        const hasOverride = overrides.has(declaration.id);
        const override = overrides.get(declaration.id);
        if (hasOverride && override === null) {
          diagnostic.push({ commandId: declaration.id, responderId: declaration.responderId, source: "user", reason: "disabled-by-user" });
          continue;
        }
        const bindings = hasOverride ? [override!] : declaration.defaultKeyBindings;
        if (hasOverride) for (const _ of declaration.defaultKeyBindings) diagnostic.push({ commandId: declaration.id, responderId: declaration.responderId, source: "default", reason: "default-replaced-by-user" });
        for (const binding of bindings) {
          const source = hasOverride ? "user" : "default";
          const allowedPlatform = !binding.platform || binding.platform === "all" || binding.platform === runtime.environment.platform;
          const unsafe = !allowedPlatform || (event.repeat && binding.repeat !== "allow") || (editable && !binding.allowInEditable && !standardEditableCommands.has(declaration.id)) || (event.isComposing && !binding.allowDuringComposition);
          if (unsafe) { diagnostic.push({ commandId: declaration.id, responderId: declaration.responderId, source, reason: "unsafe-input-context" }); continue; }
          const isPrimary = binding.modifiers.includes("primary") && modifierPressed("primary", event, runtime.environment.platform);
          if (isPrimary && reservedPrimaryKeys.has(normaliseKey(event.key)) && !declaration.allowReservedBrowserShortcut) { diagnostic.push({ commandId: declaration.id, responderId: declaration.responderId, source, reason: "unsafe-input-context" }); continue; }
          if (!chordMatches(binding, event, runtime.environment.platform)) continue;
          candidates.push({ declaration, binding, source, rank: responderRank });
        }
      }
      candidates.sort((a, b) => a.rank - b.rank || (b.binding.priority ?? 0) - (a.binding.priority ?? 0) || `${a.declaration.id}\0${a.declaration.responderId}`.localeCompare(`${b.declaration.id}\0${b.declaration.responderId}`));
      const winner = candidates[0];
      if (!winner) { lastCandidates = diagnostic; return null; }
      for (const candidate of candidates) {
        const reason = candidate === winner ? "winner" : candidate.rank !== winner.rank ? "lower-responder-rank" : (candidate.binding.priority ?? 0) !== (winner.binding.priority ?? 0) ? "lower-priority" : "lexical-tie-break";
        diagnostic.push({ commandId: candidate.declaration.id, responderId: candidate.declaration.responderId, source: candidate.source, reason });
      }
      const resolved: ResolvedKeyBinding = { ...winner.binding, commandId: winner.declaration.id, responderId: winner.declaration.responderId, source: winner.source, display: display(winner.binding, runtime.environment.platform) };
      lastCandidates = diagnostic;
      return { binding: resolved, candidates: diagnostic };
    },
    claimKeyboardEvent(event, context): KeyBindingClaim | null {
      const resolution = manager.resolve(event, context);
      if (!resolution) return null;
      const runtime = options.getRuntime();
      const key = acceptanceKey(resolution);
      const settled = settledAcceptances.get(key);
      if (settled) {
        settledAcceptances.delete(key);
        if (settled.registryGeneration === runtime.commands.inspect().generation && settled.responderGeneration === runtime.responders.generation) {
          return { resolution, acceptance: settled.acceptance };
        }
      }
      if (pendingAcceptances.has(key)) return null;
      try {
        const registryGeneration = runtime.commands.inspect().generation;
        const responderGeneration = runtime.responders.generation;
        const preparation = runtime.commands.prepareDispatch(resolution.binding.commandId, undefined, { source: "keyboard" });
        if (preparation instanceof Promise || (preparation && typeof (preparation as unknown as { then?: unknown }).then === "function")) {
          const pending = Promise.resolve(preparation).then((result) => {
            if (!disposed && result.status === "accepted"
              && registryGeneration === runtime.commands.inspect().generation
              && responderGeneration === runtime.responders.generation) {
              settledAcceptances.set(key, { acceptance: result.acceptance, registryGeneration, responderGeneration });
            }
          }).catch(() => undefined).finally(() => pendingAcceptances.delete(key));
          pendingAcceptances.set(key, pending);
          return null;
        }
        if (preparation.status !== "accepted") return null;
        return { resolution, acceptance: preparation.acceptance };
      } catch {
        return null;
      }
    },
    async handleKeyboardEvent(event, context, claim) {
      const resolution = claim?.resolution ?? manager.resolve(event, context);
      if (!resolution) return { handled: false, reason: "no-matching-binding" };
      const dispatchResult = await options.getRuntime().commands.dispatch(resolution.binding.commandId, undefined, { source: "keyboard", acceptance: claim?.acceptance });
      const handled = ["executed", "disabled", "denied"].includes(dispatchResult.status);
      return { handled, reason: dispatchResult.status, resolution, dispatchResult };
    },
    setOverride(commandId, binding) { hydrate(); overrides.set(commandId, binding); save(); },
    clearOverride(commandId) { hydrate(); overrides.delete(commandId); save(); },
    inspectCollisions: () => [...lastCandidates],
    inspect: () => ({ overrides: Array.from(overrides, ([commandId, binding]) => ({ commandId, binding })), invalidOverrides: [...invalidOverrides], lastCandidates: [...lastCandidates] }),
    dispose() { disposed = true; overrides.clear(); invalidOverrides = []; lastCandidates = []; pendingAcceptances.clear(); settledAcceptances.clear(); },
  };
  return manager;
}
