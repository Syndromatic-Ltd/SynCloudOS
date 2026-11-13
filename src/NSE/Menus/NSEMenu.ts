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

import { NSEControllerLifetime } from "../Controllers/controllerLifetime";
import { nseActionReferenceName } from "../Controls/Core/actionReference";
import type { CommandDispatchResult, CommandPresentation, CommandValidationRequest } from "../../SynCloudOS/SynCloudOS";
import { commandValidationRequestKey } from "../../SynCloudOS/nseRuntimeContracts";
import { nseMenuModel } from "./menuTypes";
import type {
  NSECheckedMenuItems,
  NSEMenuDismissReason,
  NSEMenuEntry,
  NSEMenuEntryInput,
  NSEMenuKeyEquivalent,
  NSEMenuKeyEquivalentClaim,
  NSEMenuKeyEquivalentResult,
  NSEMenuItem,
  NSEMenuModelOptions,
  NSEMenuOptions,
  NSEMenuPresentedEntry,
  NSEMenuRuntimePort,
  NSEMenuSection,
  NSEMenuSnapshot,
  NSEMenuModel,
} from "./menuTypes";

/** Validations repeated while focus or registry authority settles before a branch closes. */
const STALE_VALIDATION_ATTEMPTS = 3;

const initialSnapshot: NSEMenuSnapshot = Object.freeze({
  open: false,
  validating: false,
  generation: 0,
  branchPath: Object.freeze([]),
  entries: Object.freeze([]),
});

interface AbortLease {
  readonly signal: AbortSignal;
  dispose(): void;
}

interface BranchFrame {
  readonly id: string;
  readonly entries: readonly NSEMenuEntry[];
  readonly path: readonly string[];
}

function createAbortLease(parent: AbortSignal): AbortLease {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent.aborted) abort();
  else parent.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      parent.removeEventListener("abort", abort);
      if (!controller.signal.aborted) controller.abort();
    },
  };
}

function findSubmenu(entries: readonly NSEMenuEntry[], id: string): Extract<NSEMenuEntry, { readonly kind: "submenu" }> | null {
  for (const entry of entries) {
    if (entry.kind === "submenu" && entry.id === id) return entry;
  }
  return null;
}

function stableSections<TSection extends { readonly id: string; readonly weight?: number }>(sections: readonly TSection[]): readonly TSection[] {
  return [...sections].sort((left, right) => {
    const weight = (left.weight ?? 0) - (right.weight ?? 0);
    return weight === 0 ? left.id.localeCompare(right.id) : weight;
  });
}

/**
 * Pure, deterministic extension-point insertion. A missing anchor has a
 * defined result (append), rather than making ordering depend on registration
 * timing. `beforeId` wins when both anchors are supplied.
 */
export function orderMenuEntries<TEntry extends { readonly id: string }>(
  baseEntries: readonly TEntry[],
  sections: readonly NSEMenuSection<TEntry>[] = [],
): readonly TEntry[] {
  const ordered = [...baseEntries];
  for (const section of stableSections(sections)) {
    const before = section.beforeId ? ordered.findIndex((entry) => entry.id === section.beforeId) : -1;
    const after = section.afterId ? ordered.map((entry) => entry.id).lastIndexOf(section.afterId) : -1;
    const at = before >= 0 ? before : after >= 0 ? after + 1 : ordered.length;
    ordered.splice(at, 0, ...section.entries);
  }
  return ordered;
}

let generatedMenuIds = 0;

/** NSMenuItems as the menu's internal entries. An item's identifier, or its position, keeps it unique. */
function entriesFromItems(items: readonly NSEMenuItem[]): readonly NSEMenuEntryInput[] {
  return items.map((item, index): NSEMenuEntryInput => {
    const id = item.identifier ?? String(index);
    if ("isSeparatorItem" in item) return { kind: "separator", id };
    if ("submenu" in item) {
      return { kind: "submenu", id, label: item.title, icon: item.image, entries: entriesFromItems(item.submenu), enabled: item.isEnabled, disabledReason: item.toolTip };
    }
    if ("view" in item) return { kind: "custom", id, label: item.title, render: item.view };
    return {
      kind: "command",
      id,
      action: item.action,
      ...(Object.prototype.hasOwnProperty.call(item, "actionPayload") ? { payload: item.actionPayload } : {}),
      ...(item.title !== undefined ? { labelOverride: item.title } : {}),
      ...(item.image !== undefined ? { iconOverride: item.image } : {}),
    };
  });
}

/** Replaces every `{ action }` entry with the command entry for that action's command ID. */
function resolveMenuEntries(
  entries: readonly NSEMenuEntryInput[],
  resolveAction: NSEMenuRuntimePort["resolveAction"],
): readonly NSEMenuEntry[] {
  return entries.map((entry): NSEMenuEntry => {
    if (entry.kind === "submenu") return { ...entry, entries: resolveMenuEntries(entry.entries, resolveAction) };
    if (entry.kind === "command" && "action" in entry) {
      const name = typeof entry.action === "string" ? entry.action : nseActionReferenceName(entry.action);
      if (name.includes(".")) {
        const { action: _action, ...rest } = entry;
        return { ...rest, commandId: name };
      }
      if (!resolveAction) {
        throw new TypeError(`The menu entry "${entry.id}" names the action "${entry.action}", but this menu has no application to resolve it. Show the menu inside an application's views.`);
      }
      const { action, ...rest } = entry;
      return { ...rest, commandId: resolveAction(typeof action === "string" ? action : nseActionReferenceName(action)) };
    }
    return entry;
  });
}

function assertUniqueEntries(entries: readonly NSEMenuEntry[], branchId: string): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.id.trim()) throw new TypeError(`NSE menu entry IDs must not be empty (${branchId}).`);
    if (ids.has(entry.id)) throw new TypeError(`NSE menu entry IDs must be unique within ${branchId}: ${entry.id}`);
    ids.add(entry.id);
    if (entry.kind === "submenu") assertUniqueEntries(entry.entries, `${branchId}:${entry.id}`);
  }
}

function requestsFor(branchId: string, entries: readonly NSEMenuEntry[]): readonly CommandValidationRequest[] {
  return entries.flatMap((entry) => entry.kind === "command" ? [{
    key: commandValidationRequestKey(`${branchId}:${entry.id}`),
    commandId: entry.commandId,
    payload: entry.payload,
  }] : []);
}

function presentBranch(
  branchId: string,
  entries: readonly NSEMenuEntry[],
  presentations: ReadonlyMap<string, CommandPresentation>,
): readonly NSEMenuPresentedEntry[] {
  return entries.flatMap((entry): readonly NSEMenuPresentedEntry[] => {
    if (entry.kind === "separator") return [{ kind: "separator", id: entry.id }];
    if (entry.kind === "submenu") return [{
      kind: "submenu",
      id: entry.id,
      label: entry.label,
      icon: entry.icon,
      enabled: entry.enabled !== false,
      disabledReason: entry.disabledReason,
    }];
    if (entry.kind === "custom") return [{
      kind: "custom",
      id: entry.id,
      label: entry.label,
      render: entry.render,
      enabled: true,
    }];
    const presentation = presentations.get(`${branchId}:${entry.id}`);
    if (!presentation || presentation.hidden) return [];
    return [{
      kind: "command",
      id: entry.id,
      commandId: entry.commandId,
      payload: entry.payload,
      label: entry.labelOverride ?? presentation.title,
      icon: entry.iconOverride ?? presentation.icon,
      enabled: presentation.enabled && !presentation.denied && !presentation.stale,
      hidden: presentation.hidden,
      checked: presentation.state,
      selectionKind: entry.selectionKind,
      disabledReason: presentation.disabledReason,
      shortcut: entry.shortcutOverride ?? presentation.keyBinding?.display,
      presentation,
    }];
  });
}

function cancelled(commandId: string, reason: string): CommandDispatchResult<unknown> {
  return { status: "cancelled", commandId, operationId: "", reason };
}

type PresentationGeneration = ReturnType<NSEMenuRuntimePort["commands"]["getPresentationGeneration"]>;
/** @internal A mounted menu revalidates its current branch without removing focused rows. */
export const nseRefreshMenuPresentation: unique symbol = Symbol("nse.refreshMenuPresentation");
function samePresentationGeneration(left: PresentationGeneration | null, right: PresentationGeneration): boolean {
  return left?.registryGeneration === right.registryGeneration && left.responderGeneration === right.responderGeneration;
}

const deferMenuObservation = Symbol("nse.deferMenuObservation");
const reactMenuObservers = new WeakMap<NSEMenu, () => () => void>();

/** @internal Create a menu whose subscriptions start only when React commits it. */
export function createReactOwnedNSEMenu(options: NSEMenuModelOptions): NSEMenu {
  const deferred = { ...options, [deferMenuObservation]: true };
  return new NSEMenu(deferred);
}

/** @internal */
export function observeReactOwnedNSEMenu(menu: NSEMenu): (() => void) | undefined {
  return reactMenuObservers.get(menu)?.();
}

/**
 * NSMenu: a menu of NSEMenuItems. It has no responder, focus or undo graph of
 * its own: each time a branch opens it validates the items' actions along the
 * responder chain and sends the chosen one through the same command authority.
 * A pop-up button that pulls down, a view's `menu`, and the menu bar show it.
 */
export class NSEMenu<const Items extends readonly NSEMenuItem[] = readonly NSEMenuItem[]> {
  /** @internal */
  readonly model: NSEMenuModel;
  readonly items: Items;
  readonly runtime: NSEMenuRuntimePort;
  readonly #ownership: NSEControllerLifetime;
  #snapshot: NSEMenuSnapshot = initialSnapshot;
  #listeners = new Set<() => void>();
  #validation: AbortLease | null = null;
  #dispatch: AbortLease | null = null;
  #pendingSubmenu: { readonly handle: unknown; resolve(): void } | null = null;
  #generation = 0;
  #presentationGeneration: PresentationGeneration | null = null;
  #rootEntries: readonly NSEMenuEntry[] = [];
  #branchEntries: readonly NSEMenuEntry[] = [];
  #branchId = "";
  #branchStack: BranchFrame[] = [];
  #disposed = false;
  #runtimeAbort = () => this.dispose();

  constructor(options: Omit<NSEMenuOptions, "items"> & { readonly items: Items & NSECheckedMenuItems<NoInfer<Items>> });
  /** @internal */
  constructor(options: NSEMenuModelOptions);
  constructor(options: NSEMenuOptions | NSEMenuModelOptions) {
    const { runtime } = options;
    const model: NSEMenuModel = nseMenuModel in options ? options[nseMenuModel] : {
      id: options.identifier ?? `nse-menu-${++generatedMenuIds}`,
      label: options.title,
      entries: entriesFromItems(options.items),
    };
    if (!model.id.trim()) throw new TypeError("NSE menu identifiers must not be empty.");
    this.items = ("items" in options ? options.items : []) as Items;
    this.#ownership = new NSEControllerLifetime(options, { kind: "NSEMenu", id: model.id }, runtime.signal);
    const sectionIds = new Set<string>();
    for (const section of model.sections ?? []) {
      if (!section.id.trim()) throw new TypeError(`NSE menu section IDs must not be empty (${model.id}).`);
      if (sectionIds.has(section.id)) throw new TypeError(`NSE menu section IDs must be unique within ${model.id}: ${section.id}`);
      if (section.weight !== undefined && !Number.isFinite(section.weight)) {
        throw new TypeError(`NSE menu section weights must be finite (${model.id}:${section.id}).`);
      }
      sectionIds.add(section.id);
    }
    const resolvedSections = (model.sections ?? []).map((section) => ({ ...section, entries: resolveMenuEntries(section.entries, runtime.resolveAction) }));
    const rootEntries = orderMenuEntries(resolveMenuEntries(model.entries, runtime.resolveAction), resolvedSections);
    assertUniqueEntries(rootEntries, model.id);
    this.#rootEntries = rootEntries;
    this.model = model;
    this.runtime = runtime;
    if (deferMenuObservation in options) {
      reactMenuObservers.set(this, () => {
        this.#observeLifetime();
        return () => {
          this.#stopObservingLifetime();
          this.#dismiss(false);
        };
      });
    } else {
      this.#observeLifetime();
    }
  }

  #observeLifetime(): void {
    if (this.#disposed) return;
    const { signal } = this.runtime;
    if (signal.aborted) this.#runtimeAbort();
    else signal.addEventListener("abort", this.#runtimeAbort, { once: true });
    this.#ownership.bind(() => this.dispose());
  }

  #stopObservingLifetime(): void {
    this.runtime.signal.removeEventListener("abort", this.#runtimeAbort);
    this.#ownership.unbind();
  }

  /** NSMenu.title. */
  get title(): string { return this.model.label; }
  /** The menu's identifier. */
  get identifier(): string { return this.model.id; }
  get snapshot(): NSEMenuSnapshot { return this.#snapshot; }
  get isDisposed(): boolean { return this.#disposed; }

  subscribe(listener: () => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  async open(): Promise<void> {
    if (this.#disposed || this.runtime.signal.aborted) return;
    this.#cancelPendingSubmenu();
    this.#branchStack = [];
    await this.#openBranch(this.model.id, this.#rootEntries, []);
  }

  /** @internal Keeps branch identity and DOM focus while preparing a visible activation. */
  [nseRefreshMenuPresentation](): Promise<void> {
    if(!this.#snapshot.open||this.#disposed)return Promise.resolve();
    return this.#openBranch(this.#branchId,this.#branchEntries,this.#snapshot.branchPath,true);
  }

  async openSubmenu(id: string, delayMs = 0): Promise<void> {
    if (!this.#snapshot.open) return;
    const submenu = findSubmenu(this.#branchEntries, id);
    if (!submenu) return;
    this.#cancelPendingSubmenu();
    const parent: BranchFrame = {
      id: this.#branchId,
      entries: this.#branchEntries,
      path: this.#snapshot.branchPath,
    };
    if (delayMs > 0 && this.runtime.scheduler) {
      const openingGeneration = this.#generation;
      await new Promise<void>((resolve) => {
        const handle = this.runtime.scheduler!.setTimeout(() => {
          this.#pendingSubmenu = null;
          if (openingGeneration === this.#generation && this.#snapshot.open) {
            this.#branchStack.push(parent);
            void this.#openBranch(`${parent.id}:${submenu.id}`, submenu.entries, [...parent.path, submenu.id]).then(resolve, resolve);
          } else {
            resolve();
          }
        }, delayMs);
        this.#pendingSubmenu = { handle, resolve };
      });
      return;
    }
    this.#branchStack.push(parent);
    await this.#openBranch(`${parent.id}:${submenu.id}`, submenu.entries, [...parent.path, submenu.id]);
  }

  async closeSubmenu(): Promise<void> {
    this.#cancelPendingSubmenu();
    const parent = this.#branchStack.pop();
    if (!parent || !this.#snapshot.open) return;
    await this.#openBranch(parent.id, parent.entries, parent.path);
  }

  cancelPendingSubmenu(): void {
    this.#cancelPendingSubmenu();
  }

  claimKeyEquivalent(input: NSEMenuKeyEquivalent): NSEMenuKeyEquivalentClaim | null {
    if (!this.#snapshot.open) return null;
    const keyBindings = this.runtime.keyBindings;
    if (!keyBindings) return null;
    const context = input.context ?? {};
    const claim = keyBindings.claimKeyboardEvent(input.event, context);
    return claim ? { claim, context } : null;
  }

  async dispatchKeyEquivalent(
    input: NSEMenuKeyEquivalent,
    accepted: NSEMenuKeyEquivalentClaim,
  ): Promise<NSEMenuKeyEquivalentResult> {
    const keyBindings = this.runtime.keyBindings;
    if (!keyBindings || !this.#snapshot.open) return null;
    const generation = this.#generation;
    try {
      const result = await keyBindings.handleKeyboardEvent(input.event, accepted.context, accepted.claim);
      if (generation === this.#generation && result.handled) this.dismiss("selection");
      return result;
    } catch {
      // KeyBindingManager normally resolves command failure into a typed result.
      // A broken injected port must not escape a DOM event as an unhandled promise.
      return { handled: false, reason: "key-binding-dispatch-failed" };
    }
  }

  dismiss(_reason: NSEMenuDismissReason): void {
    this.#dismiss(true);
  }

  #dismiss(notify: boolean): void {
    this.#generation += 1;
    this.#cancelPendingSubmenu();
    this.#validation?.dispose();
    this.#validation = null;
    this.#dispatch?.dispose();
    this.#dispatch = null;
    this.#branchEntries = [];
    this.#branchId = "";
    this.#branchStack = [];
    this.#publish({
      open: false,
      validating: false,
      generation: this.#generation,
      branchPath: [],
      entries: [],
    }, notify);
  }

  async dispatch(entryId: string): Promise<CommandDispatchResult<unknown>> {
    const entry = this.#snapshot.entries.find((candidate) => candidate.id === entryId);
    if (!this.#snapshot.open || !entry || entry.kind !== "command") {
      return cancelled(entryId, "This menu branch is no longer open.");
    }
    if (!entry.enabled || entry.hidden) {
      return cancelled(entry.commandId, "This menu command is not currently available.");
    }
    if (!samePresentationGeneration(this.#presentationGeneration, this.runtime.commands.getPresentationGeneration())) {
      return cancelled(entry.commandId, "The displayed command authority became stale.");
    }
    const generation = this.#generation;
    this.#dispatch?.dispose();
    const lease = createAbortLease(this.runtime.signal);
    this.#dispatch = lease;
    try {
      const preparation = await this.runtime.commands.prepareDispatch(entry.commandId, entry.payload, {
        signal: lease.signal,
        source: "menu",
      });
      if (preparation.status !== "accepted") return cancelled(entry.commandId, preparation.reason);
      if (this.#disposed || lease.signal.aborted || this.#dispatch !== lease || generation !== this.#generation
        || !samePresentationGeneration(this.#presentationGeneration, this.runtime.commands.getPresentationGeneration())) {
        return cancelled(entry.commandId, "The menu command was cancelled.");
      }
      const result = await this.runtime.commands.dispatch(entry.commandId, entry.payload, {
        signal: lease.signal,
        source: "menu",
        acceptance: preparation.acceptance,
      });
      if (generation === this.#generation) this.dismiss("selection");
      return result;
    } catch {
      if (lease.signal.aborted || this.runtime.signal.aborted) return cancelled(entry.commandId, "The menu command was cancelled.");
      if (generation === this.#generation) this.dismiss("selection");
      return {
        status: "failed",
        commandId: entry.commandId,
        operationId: "",
        error: {
          code: "NSE_MENU_DISPATCH_FAILED",
          name: "NSEMenuDispatchError",
          message: "The menu command could not be completed.",
        },
      };
    } finally {
      if (this.#dispatch === lease) this.#dispatch = null;
      lease.dispose();
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopObservingLifetime();
    this.#ownership.dispose();
    this.dismiss("programmatic");
    this.#listeners.clear();
  }

  async #openBranch(branchId: string, entries: readonly NSEMenuEntry[], branchPath: readonly string[], preserveRows=false): Promise<void> {
    this.#cancelPendingSubmenu();
    this.#validation?.dispose();
    const generation = ++this.#generation;
    this.#branchEntries = entries;
    this.#branchId = branchId;
    const lease = createAbortLease(this.runtime.signal);
    this.#validation = lease;
    this.#publish({
      open: true,
      validating: true,
      generation,
      branchPath,
      entries: preserveRows ? this.#snapshot.entries : [],
    });
    const requests = requestsFor(branchId, entries);
    try {
      // Focus settling after a click (a sheet's focus scope, a row taking focus)
      // can move responder authority while the branch validates. Validate again
      // against the authority that is current, within this same branch
      // generation, so a pending activation still owns the branch; only
      // authority that never settles closes the menu.
      let presentationGeneration = this.runtime.commands.getPresentationGeneration();
      let projected: readonly NSEMenuPresentedEntry[] = [];
      for (let attempt = 1; ; attempt += 1) {
        const result = await this.runtime.commands.validateMany(requests, {
          signal: lease.signal,
          source: "menu",
          generation,
        });
        if (lease.signal.aborted || generation !== this.#generation || !this.#snapshot.open) return;
        const settled = samePresentationGeneration(presentationGeneration, this.runtime.commands.getPresentationGeneration());
        projected = settled ? presentBranch(branchId, entries, new Map<string, CommandPresentation>(result)) : [];
        if (settled && !projected.some((entry) => entry.kind === "command" && entry.presentation.stale)) break;
        if (attempt >= STALE_VALIDATION_ATTEMPTS) {
          this.dismiss("programmatic");
          return;
        }
        presentationGeneration = this.runtime.commands.getPresentationGeneration();
      }
      this.#presentationGeneration = presentationGeneration;
      this.#publish({
        open: true,
        validating: false,
        generation,
        branchPath,
        entries: projected,
      });
    } catch {
      if (lease.signal.aborted || generation !== this.#generation || !this.#snapshot.open) return;
      this.dismiss("programmatic");
    } finally {
      if (this.#validation === lease) this.#validation = null;
      lease.dispose();
    }
  }

  #publish(next: NSEMenuSnapshot, notify = true): void {
    this.#snapshot = Object.freeze({
      open: next.open,
      validating: next.validating,
      generation: next.generation,
      branchPath: Object.freeze([...next.branchPath]),
      entries: Object.freeze(next.entries.map((entry) => Object.freeze({ ...entry }))),
    });
    if (notify) for (const listener of [...this.#listeners]) listener();
  }

  #cancelPendingSubmenu(): void {
    const pending = this.#pendingSubmenu;
    if (!pending) return;
    this.runtime.scheduler?.clearTimeout(pending.handle);
    this.#pendingSubmenu = null;
    pending.resolve();
  }
}
