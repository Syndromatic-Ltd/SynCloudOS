/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useMemo, useRef } from "react";
import { observe } from "../../NSE/Objects/observable";
import { publishNSEActionChange } from "../../NSE/Controls/Core/actionChanges";
import { useNSEControlCommand } from "../../NSE/Controls/Core/useNSEControlCommand";
import type { NSEControlRuntimePort } from "../../NSE/Controls/Core/controlTypes";
import type { CommandDispatchResult } from "../Commands/commandTypes";
import type { KeyBindingDeclaration } from "../KeyBindings/keyBindingTypes";
import { useSCOS } from "./scos/useSCOS";
import { nseActionCommandId } from "../../NSE/Controls/Core/actionCommandId";
import type { AppCommandClient } from "./appClientTypes";
import type { SynWareCommandDeclaration, SynWareCommandPayloadSchema, SynWareCommandValidation } from "./appRuntimeTypes";

/** A method an action may decorate: at most one parameter, the payload. */
export type NSEActionMethod<This, Payload> = (this: This, payload: Payload) => unknown;

/** What `@action` accepts besides a bare standard-command ID. */
export interface NSEActionOptions<Payload = unknown> {
  /** A standard command this action answers, such as `document.save`. Without it the command is `<appId>.<method name>`. */
  readonly id?: string;
  /** The command's static or payload-dependent localised title. Defaults to the method name in words (`newNote` is "New Note"). */
  readonly title?: string | SynWareCommandDeclaration<Payload, unknown>["title"];
  /** The command menu category, for example `"file"` or `"edit"`. */
  readonly menuCategory?: string;
  /** Default keyboard bindings, with the same scope, platform and safety rules as commands. */
  readonly keyBindings?: readonly KeyBindingDeclaration[];
  /** Explicitly permits a declared binding to replace a reserved primary browser shortcut. */
  readonly allowReservedBrowserShortcut?: boolean;
  /** Checks and types the payload. Without it any payload is accepted, except that a method with no parameter accepts none. */
  readonly payload?: SynWareCommandPayloadSchema<Payload>;
}

type ActionDecoratorContext<This, Payload> = ClassMethodDecoratorContext<This, NSEActionMethod<This, Payload>>;

type ActionRecord = NSEActionOptions<unknown>;

/** The decorated method functions. Keyed by function so a class swapped in by hot reload is read the same way as the one it replaces. */
const actionRecords = new WeakMap<object, ActionRecord>();

function declareAction<This extends object, Payload>(
  record: ActionRecord,
  method: NSEActionMethod<This, Payload>,
  context: ActionDecoratorContext<This, Payload>,
): void {
  if (context.kind !== "method") throw new TypeError("@action decorates methods.");
  if (context.static) throw new TypeError(`@action cannot decorate the static method ${String(context.name)}; an action belongs to an object that is a responder.`);
  if (context.private) throw new TypeError(`@action cannot decorate the private method ${String(context.name)}; the command system could not reach it.`);
  if (typeof context.name !== "string") throw new TypeError("@action cannot decorate a method named by a symbol; its name is the command's name.");
  actionRecords.set(method, record);
}

/**
 * Declares a method as an action: a command the object answers along the
 * responder chain. The command's ID is the method name, scoped to the
 * application (`newNote` is `<appId>.newNote`); `@action("document.save")`
 * answers a standard command instead.
 *
 * ```ts
 * @action newNote() { this.app.notes.add(createNote()); }
 * validateNewNote() { return !this.app.readOnly; }
 * ```
 *
 * `validate<Name>()`, found by name, says whether the action is available: it
 * returns a boolean or a command validation (`{ enabled, state, title, hidden,
 * disabledReason }`). Menu items and controls that name the action follow it.
 * The method takes at most one parameter, the payload the sender supplies.
 */
export function action<This extends object, Payload>(
  method: NSEActionMethod<This, Payload>,
  context: ActionDecoratorContext<This, Payload>,
): void;
export function action(id: string): <This extends object, Payload>(
  method: NSEActionMethod<This, Payload>,
  context: ActionDecoratorContext<This, Payload>,
) => void;
export function action<Payload>(options: NSEActionOptions<Payload>): <This extends object>(
  method: NSEActionMethod<This, Payload>,
  context: ActionDecoratorContext<This, Payload>,
) => void;
export function action(first: unknown, second?: unknown): unknown {
  if (typeof first === "function") {
    declareAction({}, first as NSEActionMethod<object, unknown>, second as ActionDecoratorContext<object, unknown>);
    return undefined;
  }
  if (typeof first === "string" || (typeof first === "object" && first !== null)) {
    const options: NSEActionOptions = typeof first === "string" ? { id: first } : first;
    if (options.id !== undefined && options.id.trim().length === 0) throw new TypeError("An action's command ID must not be empty.");
    const record: ActionRecord = {
      id: options.id, title: options.title, menuCategory: options.menuCategory,
      keyBindings: options.keyBindings, allowReservedBrowserShortcut: options.allowReservedBrowserShortcut,
      payload: options.payload as SynWareCommandPayloadSchema<unknown> | undefined,
    };
    return (method: NSEActionMethod<object, unknown>, context: ActionDecoratorContext<object, unknown>) => { declareAction(record, method, context); };
  }
  throw new TypeError("@action takes a method, a standard command ID or options.");
}

/** The action methods an object answers, by method name: its own and inherited ones. */
function collectActions(target: object): ReadonlyMap<string, ActionRecord> {
  const found = new Map<string, ActionRecord>();
  for (let prototype = Object.getPrototypeOf(target) as object | null; prototype && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype) as object | null) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (found.has(name)) continue;
      const method = Object.getOwnPropertyDescriptor(prototype, name)?.value as unknown;
      const record = typeof method === "function" ? actionRecords.get(method) : undefined;
      if (record) found.set(name, record);
    }
  }
  return found;
}

/** Whether `target` declares any `@action` method. Objects without one need no responder. */
export function hasActions(target: object): boolean {
  return collectActions(target).size > 0;
}

/** The names of the actions `target` declares. */
export function actionNames(target: object): readonly string[] {
  return [...collectActions(target).keys()];
}

/** What an object needs from its host to register its actions. */
export interface NSEActionHost {
  /** The application the actions belong to: bare names become `<appId>.<name>`. */
  readonly appId: string;
  readonly commands: Pick<AppCommandClient, "register">;
}

/** An object's registered actions. */
export interface NSEActionBinding {
  /** Registers actions added, and drops actions removed, since the last sync; used after hot reload swaps the object's class. */
  refresh(): void;
  /** Removes every command this binding registered. Safe to call twice. */
  dispose(): void;
}

const noPayload: SynWareCommandPayloadSchema<unknown> = Object.freeze({
  description: "No payload",
  parse(value: unknown) {
    return value === undefined
      ? { ok: true as const, value }
      : { ok: false as const, issues: ["This action does not accept a payload."] };
  },
});

const anyPayload: SynWareCommandPayloadSchema<unknown> = Object.freeze({
  description: "The action's payload",
  parse: (value: unknown) => ({ ok: true as const, value }),
});

const liveBindings = new WeakMap<object, Set<NSEActionBinding>>();

function capitalised(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function inWords(name: string): string {
  return capitalised(name.replace(/([a-z0-9])([A-Z])/gu, "$1 $2"));
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}

function toValidation(name: string, result: unknown): SynWareCommandValidation {
  if (typeof result === "boolean") return { enabled: result };
  if (typeof result === "object" && result !== null && "enabled" in result && typeof result.enabled === "boolean") return result as SynWareCommandValidation;
  throw new TypeError(`validate${capitalised(name)}() must return a boolean or a command validation with an "enabled" flag.`);
}

function titleFor(commandId: string, name: string, record: ActionRecord): SynWareCommandDeclaration<unknown, unknown>["title"] {
  if (typeof record.title === "object" || typeof record.title === "function") return record.title;
  return Object.freeze({ key: `commands.${commandId}.title`, fallback: record.title ?? inWords(name) });
}

function declarationFor(target: object, name: string, commandId: string, responderId: string, record: ActionRecord): object {
  const method = (): ((payload?: unknown) => unknown) => {
    const candidate: unknown = Reflect.get(target, name);
    if (typeof candidate !== "function") throw new TypeError(`The action ${name} is no longer a method.`);
    return candidate as (payload?: unknown) => unknown;
  };
  return Object.freeze({
    id: commandId,
    responderId,
    title: titleFor(commandId, name, record),
    ...(record.menuCategory === undefined ? {} : { menuCategory: record.menuCategory }),
    ...(record.allowReservedBrowserShortcut === undefined ? {} : { allowReservedBrowserShortcut: record.allowReservedBrowserShortcut }),
    payload: record.payload ?? Object.freeze({
      description: "The action's payload",
      // Read at dispatch, so a method hot reload swaps in with a parameter is not refused.
      parse: (value: unknown) => (method().length === 0 ? noPayload : anyPayload).parse(value),
    }),
    defaultKeyBindings: record.keyBindings ?? [],
    scope: "focused",
    undo: Object.freeze({ kind: "none" }),
    validate(context: { readonly payload: unknown }): SynWareCommandValidation | Promise<SynWareCommandValidation> {
      const validator: unknown = Reflect.get(target, `validate${capitalised(name)}`);
      if (typeof validator !== "function") return { enabled: true };
      const result: unknown = validator.call(target, context.payload);
      return isThenable(result) ? Promise.resolve(result).then((settled) => toValidation(name, settled)) : toValidation(name, result);
    },
    execute(context: { readonly payload: unknown }): undefined | Promise<undefined> {
      const result = method().call(target, context.payload);
      return isThenable(result) ? Promise.resolve(result).then(() => undefined) : undefined;
    },
  });
}

/**
 * Registers every `@action` method of `target` as a command on `responderId`,
 * so the command system finds it when the responder is in the chain from the
 * focused view. `responderId` must be a responder the application owns.
 *
 * Registration is all-or-nothing: if one action cannot be registered the others
 * are removed again and the error is thrown.
 */
export function bindActionResponder(target: object, host: NSEActionHost, responderId: string): NSEActionBinding {
  if (responderId.trim().length === 0) throw new TypeError("Actions need a responder to answer on.");
  const registered = new Map<string, { readonly commandId: string; readonly record: ActionRecord; readonly handle: { dispose(): unknown } }>();
  let disposed = false;

  const announceChanges = (): void => {
    for (const { commandId } of registered.values()) publishNSEActionChange(commandId);
  };
  const remove = (name: string): void => {
    const existing = registered.get(name);
    existing?.handle.dispose();
    registered.delete(name);
    if (existing) publishNSEActionChange(existing.commandId);
  };

  const sync = (): void => {
    if (disposed) return;
    const wanted = new Map<string, { readonly commandId: string; readonly record: ActionRecord }>();
    const owners = new Map<string, string>();
    for (const [name, record] of collectActions(target)) {
      const commandId = record.id ?? nseActionCommandId(host.appId, name);
      const owner = owners.get(commandId);
      if (owner !== undefined) throw new TypeError(`The actions ${owner} and ${name} both answer ${commandId}.`);
      owners.set(commandId, name);
      wanted.set(name, { commandId, record });
    }
    for (const [name, existing] of [...registered]) {
      const next = wanted.get(name);
      if (next?.commandId !== existing.commandId || next.record !== existing.record) remove(name);
    }
    for (const [name, { commandId, record }] of wanted) {
      if (registered.has(name)) continue;
      registered.set(name, { commandId, record, handle: host.commands.register(declarationFor(target, name, commandId, responderId, record)) });
      publishNSEActionChange(commandId);
    }
  };

  try {
    sync();
  } catch (error) {
    for (const name of [...registered.keys()]) remove(name);
    throw error;
  }
  const stopObserving = observe(target, announceChanges);

  const binding: NSEActionBinding = {
    refresh: sync,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopObserving();
      for (const name of [...registered.keys()]) remove(name);
      liveBindings.get(target)?.delete(binding);
    },
  };
  const bindings = liveBindings.get(target) ?? new Set<NSEActionBinding>();
  bindings.add(binding);
  liveBindings.set(target, bindings);
  return binding;
}

/** Re-reads `target`'s actions after its class was replaced (hot reload). */
export function refreshActionBindings(target: object): void {
  for (const binding of liveBindings.get(target) ?? []) binding.refresh();
}

/** The current canonical availability and check state of an action. */
export interface NSEActionState {
  readonly enabled: boolean;
  readonly state: "off" | "on" | "mixed";
  /** Uses the bound payload when omitted; a supplied payload, including undefined, is validated afresh. */
  perform(payload?: unknown): Promise<CommandDispatchResult<unknown> | null>;
}

// Payloads passed by a component are commonly inline data objects. Keep equal
// data stable across the validation hook's own renders, without coalescing
// opaque objects or invoking accessors.
function sameActionPayload(left: unknown, right: unknown, seen?: WeakMap<object, object>): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  const prototype = Object.getPrototypeOf(left) as unknown;
  if (prototype !== Object.getPrototypeOf(right) || (!Array.isArray(left) && prototype !== Object.prototype && prototype !== null)) return false;
  const visited = seen ?? new WeakMap<object, object>();
  if (visited.has(left)) return visited.get(left) === right;
  visited.set(left, right);
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const a = Object.getOwnPropertyDescriptor(left, key);
    const b = Object.getOwnPropertyDescriptor(right, key);
    return Boolean(a && b && "value" in a && "value" in b && sameActionPayload(a.value, b.value, visited));
  });
}

/**
 * Observes and performs an action in the current mounted application.
 * Bare names are app-scoped; dotted command IDs are used as written. Validation
 * and execution use the focused responder chain, including `validate<Name>()`.
 * Availability and state describe the bound payload. `perform(eventPayload)`
 * prepares that payload independently, even if the bound payload is disabled;
 * `perform()` uses the bound payload and `perform(undefined)` overrides it.
 *
 * ```tsx
 * const save = useAction("document.save");
 * return <button disabled={!save.enabled} onClick={() => void save.perform()}>Save</button>;
 * ```
 */
export function useAction(name: string, payload?: unknown): NSEActionState {
  const app = useSCOS();
  const stablePayload = useRef(payload);
  if (!sameActionPayload(stablePayload.current, payload)) stablePayload.current = payload;
  const boundPayload = stablePayload.current;
  const binding = useMemo(() => ({ id: nseActionCommandId(app.app.bundleIdentifier, name), payload: boundPayload }), [app.app.bundleIdentifier, name, boundPayload]);
  const port = useMemo<NSEControlRuntimePort>(() => ({
    signal: app.signal,
    commands: {
      getPresentationGeneration: () => app.commands.getPresentationGeneration(),
      subscribePresentation: (listener) => app.commands.subscribePresentation(listener),
      validate: (id, value, options) => app.commands.validate(id, value, options),
      prepareDispatch: (id, value, options) => app.commands.prepareDispatch(id, value, options),
      dispatch: (id, value, options) => app.commands.dispatch<CommandDispatchResult<unknown>>(id, value, options),
    },
  }), [app]);
  const command = useNSEControlCommand(binding, port);
  const presentation = command.presentation;
  return useMemo(() => ({
    perform: command.dispatch,
    enabled: Boolean(presentation?.enabled && !presentation.denied && !presentation.hidden && !presentation.stale),
    state: presentation?.state ?? "off",
  }), [command.dispatch, presentation]);
}
