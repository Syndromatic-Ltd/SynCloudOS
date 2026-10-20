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

import type { ColourPanelCloseReason, ColourPanelService, ColourPanelServiceChange, CommandPayloadSchema, CommandSystem, SynCloudOSRuntime } from "../../../SynCloudOS/SynCloudOS";
import { defineSyncUndoAction } from "../../../SynCloudOS/nseRuntimeContracts";
import { GFXColour } from "../../../FX/GraphicsFX/public";
import { parseNSEColourTransfer, serialiseNSEColourTransfer } from "../Transfer";
import type { NSEColourChange, NSEColourPanelControllerOptions, NSEColourPanelSnapshot, NSEColourPicker, NSEColourTarget } from "./colourPanelTypes";
import { NSEControllerLifetime } from "../../Controllers/controllerLifetime";

type NSEColourPanelServicePort = Pick<
  ColourPanelService,
  "getSnapshot" | "subscribe" | "registerPicker" | "activateTarget" | "open" | "close" |
  "choosePicker" | "preview" | "commit" | "cancel" | "addRecent" | "setSwatches"
>;

export class NSEColourCommitUnknownStateError extends Error {
  readonly code = "nse-colour-commit-outcome-unknown";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NSEColourCommitUnknownStateError";
  }
}

export class NSEColourCommitCompensationError extends AggregateError {
  readonly code = "nse-colour-commit-compensation-failed";

  constructor(primary: unknown, compensation: readonly unknown[]) {
    super([primary, ...compensation], "A colour commit and its rollback both failed.");
    this.name = "NSEColourCommitCompensationError";
  }
}

export class NSEColourPanelController {
  readonly #service: NSEColourPanelServicePort;
  readonly #pickers = new Map<string, NSEColourPicker>();
  readonly #alphaTargets = new Set<string>();
  readonly #undoManager: NSEColourPanelControllerOptions["undoManager"];
  readonly #preferences: NSEColourPanelControllerOptions["preferences"];
  readonly #transferAdapter: NSEColourPanelControllerOptions["transferAdapter"];
  #applyingUndo = false;
  #serviceSnapshot: ReturnType<ColourPanelService["getSnapshot"]> | null = null;
  #facadeSnapshot: NSEColourPanelSnapshot | null = null;
  readonly #lifetime: NSEControllerLifetime;
  readonly #registrations = new Set<() => void>();

  constructor(runtime: Pick<SynCloudOSRuntime, "colourPanel"> | NSEColourPanelServicePort, options: NSEColourPanelControllerOptions = {}) {
    this.#lifetime = new NSEControllerLifetime(options, { kind: "NSEColourPanelController", id: "colour-panel" });
    this.#service = "colourPanel" in runtime ? runtime.colourPanel : runtime;
    this.#undoManager = options.undoManager;
    this.#preferences = options.preferences;
    this.#transferAdapter = options.transferAdapter;
    if (this.#preferences) {
      const palette = this.#preferences.getSnapshot().value;
      this.#service.setSwatches(palette.swatches);
      for (const recent of [...palette.recents].reverse()) this.#service.addRecent(recent);
    }
    this.#lifetime.bind(() => this.dispose());
  }

  get isDisposed(): boolean { return this.#lifetime.isDisposed; }

  dispose(): void {
    if (!this.#lifetime.dispose()) return;
    const failures: unknown[] = [];
    for (const release of [...this.#registrations].reverse()) {
      try { release(); } catch (error) { failures.push(error); }
    }
    this.#registrations.clear();
    this.#pickers.clear();
    this.#alphaTargets.clear();
    this.#facadeSnapshot = null;
    if (failures.length) throw new AggregateError(failures, "Colour panel registrations failed to dispose.");
  }

  #ownRelease(release: () => void): () => void {
    let live = true;
    const stop = () => {
      if (!live) return;
      live = false;
      this.#registrations.delete(stop);
      release();
    };
    this.#registrations.add(stop);
    return stop;
  }
  getSnapshot = (): NSEColourPanelSnapshot => {
    const snapshot = this.#service.getSnapshot();
    if (snapshot === this.#serviceSnapshot && this.#facadeSnapshot) return this.#facadeSnapshot;
    this.#serviceSnapshot = snapshot;
    this.#facadeSnapshot = Object.freeze({
      open: snapshot.open,
      status: this.#lifetime.isDisposed ? "disposed" : snapshot.status,
      activeTargetId: snapshot.activeTargetId,
      activePickerId: snapshot.activePickerId,
      current: snapshot.currentCSS === null ? null : GFXColour.parse(snapshot.currentCSS),
      previous: snapshot.previousCSS === null ? null : GFXColour.parse(snapshot.previousCSS),
      pickers: Object.freeze([...snapshot.pickers]),
      recents: Object.freeze(snapshot.recents.map((css) => GFXColour.parse(css))),
      swatches: Object.freeze(snapshot.swatches.map((css) => GFXColour.parse(css))),
      revision: snapshot.revision,
    });
    return this.#facadeSnapshot;
  };

  subscribe = (listener: () => void) => {
    this.#lifetime.assertLive("subscribe");
    return this.#ownRelease(this.#service.subscribe(listener));
  };

  /** The one panel this controller drives: every controller in a runtime
   * shares it (the system's, and any an app mounts), as every NSColorPanel
   * client shares the one instance. */
  get sharedPanelKey(): string { return this.#service.getSnapshot().runtimeId; }

  activateTarget(target: NSEColourTarget): () => void {
    this.#lifetime.assertLive("activateTarget");
    const adapt = (change: ColourPanelServiceChange): NSEColourChange => Object.freeze({
      previous: GFXColour.parse(change.previousCSS),
      current: GFXColour.parse(change.currentCSS),
      phase: change.phase,
      reason: change.reason,
    });
    const commit = (change: ColourPanelServiceChange) => {
      const adapted = adapt(change);
      const undo = this.#undoManager;
      const previousRecents = this.#preferences?.getSnapshot().value.recents;
      const nextRecents = Object.freeze([adapted.current.toCSS(), ...(previousRecents ?? this.#service.getSnapshot().recents).filter((value) => value !== adapted.current.toCSS())].slice(0, 16));
      const shouldRegisterUndo = Boolean(undo && !this.#applyingUndo && !adapted.previous.equals(adapted.current));
      let reservation: ReturnType<NonNullable<typeof undo>["reserve"]> | null = null;
      let preferenceAttempted = false;
      let preferencePublished = false;
      let targetAttempted = false;
      let targetPublished = false;
      try {
        // Reserve before any observable preference, target, or service state
        // changes. A failed reservation is a proven no-publication outcome.
        if (shouldRegisterUndo) reservation = undo!.reserve();
        if (this.#preferences) {
          preferenceAttempted = true;
          this.#preferences.set("recents", nextRecents);
          preferencePublished = true;
        }
        targetAttempted = true;
        target.commit(adapted);
        targetPublished = true;
        reservation?.commit(defineSyncUndoAction({
          name: "Change Colour",
          asyncPolicy: "forbid",
          undo: () => this.#applyUndoColour(adapted.previous),
          redo: () => this.#applyUndoColour(adapted.current),
        }));
      } catch (error) {
        const compensation: unknown[] = [];
        const unknownPublisher = (targetAttempted && !targetPublished) || (preferenceAttempted && !preferencePublished);
        try { reservation?.cancel(); } catch (cancelError) { compensation.push(cancelError); }
        // Effects are reversed only after their producer acknowledged success.
        // A setter that throws may have changed its backing model; that is an
        // explicit unknown outcome, not permission to fire an unproven inverse.
        if (targetPublished) {
          try {
            target.commit(Object.freeze({
              previous: adapted.current,
              current: adapted.previous,
              phase: "commit",
              reason: adapted.reason,
            }));
          } catch (rollbackError) { compensation.push(rollbackError); }
        }
        if (preferencePublished && previousRecents) {
          try { this.#preferences?.set("recents", previousRecents); }
          catch (rollbackError) { compensation.push(rollbackError); }
        }
        // A publisher that threw before acknowledgement may already have
        // mutated its backing target or preferences. Do not send a service
        // preview inverse in that case: service.preview calls the target's
        // preview callback and could silently overwrite the unknown effect.
        // Leaving current != previous truthfully keeps the panel in its
        // uncommitted preview state for explicit reconciliation.
        if (!unknownPublisher) {
          try {
            if (this.#service.getSnapshot().currentCSS === adapted.current.toCSS()) {
              this.#service.preview(adapted.previous.toCSS(), "programmatic");
            }
          } catch (rollbackError) { compensation.push(rollbackError); }
        }
        if (compensation.length > 0) throw new NSEColourCommitCompensationError(error, compensation);
        if (unknownPublisher) {
          throw new NSEColourCommitUnknownStateError(
            "A colour commit publisher failed before acknowledging its outcome; the affected state is unknown.",
            { cause: error },
          );
        }
        throw error;
      }
    };
    if (target.showsAlpha) this.#alphaTargets.add(target.id);
    else this.#alphaTargets.delete(target.id);
    const release = this.#service.activateTarget({
      id: target.id,
      responderId: target.responderId,
      read: () => target.read().toCSS(),
      preview: (change) => {
        try { target.preview(adapt(change)); }
        catch (error) {
          throw new NSEColourCommitUnknownStateError(
            "A colour preview publisher failed before acknowledging its outcome; the affected state is unknown.",
            { cause: error },
          );
        }
      },
      commit,
      cancel: (change) => target.cancel(adapt(change)),
    });
    return this.#ownRelease(() => {
      this.#alphaTargets.delete(target.id);
      release();
    });
  }

  /** Whether the target edits opacity, so the panel shows it (NSColorPanel.showsAlpha). */
  targetShowsAlpha(targetId: string | null): boolean {
    return targetId !== null && this.#alphaTargets.has(targetId);
  }

  #applyUndoColour(colour: GFXColour): void {
    this.#applyingUndo = true;
    try { this.#service.commit(colour.toCSS(), "keyboard"); }
    finally { this.#applyingUndo = false; }
  }

  registerPicker(picker: NSEColourPicker): () => void {
    this.#lifetime.assertLive("registerPicker");
    if (this.#pickers.has(picker.id)) throw new Error(`Colour picker ${picker.id} is already registered.`);
    this.#pickers.set(picker.id, picker);
    const unregister = this.#service.registerPicker({
      id: picker.id,
      label: picker.label,
      order: picker.order,
      supportedSpaces: picker.supportedSpaces,
    });
    let registered = true;
    return this.#ownRelease(() => { if (!registered) return; registered = false; this.#pickers.delete(picker.id); unregister(); });
  }

  getPicker(id: string): NSEColourPicker | null { return this.#pickers.get(id) ?? null; }
  getPickers(): readonly NSEColourPicker[] { return Object.freeze([...this.#pickers.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))); }
  open(): void { this.#lifetime.assertLive("open"); this.#service.open(); }
  close(reason: ColourPanelCloseReason): void { this.#lifetime.assertLive("close"); this.#service.close(reason); }
  choosePicker(id: string): void { this.#lifetime.assertLive("choosePicker"); this.#service.choosePicker(id); }
  preview(colour: GFXColour, reason: ColourPanelServiceChange["reason"]): void { this.#lifetime.assertLive("preview"); this.#service.preview(colour.toCSS(), reason); }
  commit(colour: GFXColour, reason: ColourPanelServiceChange["reason"]): void {
    this.#lifetime.assertLive("commit");
    this.#service.commit(colour.toCSS(), reason);
  }
  cancel(reason: ColourPanelServiceChange["reason"]): void { this.#lifetime.assertLive("cancel"); this.#service.cancel(reason); }
  setSwatches(colours: readonly GFXColour[]): void {
    this.#lifetime.assertLive("setSwatches");
    if (!Array.isArray(colours)) throw new TypeError("Colour swatches must be dense data-only arrays.");
    const values: string[] = [];
    for (let index = 0; index < colours.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(colours, index);
      if (!descriptor || !("value" in descriptor) || !(descriptor.value instanceof GFXColour)) {
        throw new TypeError("Colour swatches must be dense data-only arrays of GFXColour values.");
      }
      values.push(descriptor.value.toCSS());
    }
    const canonical = Object.freeze(values);
    const previous = this.#preferences?.getSnapshot().value.swatches;
    if (this.#preferences) this.#preferences.set("swatches", canonical);
    try { this.#service.setSwatches(canonical); }
    catch (error) {
      if (previous) this.#preferences?.set("swatches", previous);
      throw error;
    }
  }

  registerCommands(commands: Pick<CommandSystem, "register">, responderId: string): () => void {
    this.#lifetime.assertLive("registerCommands");
    const none: CommandPayloadSchema<undefined> = {
      description: "No payload.",
      parse: (value) => value === undefined ? { ok: true, value: undefined } : { ok: false, issues: ["Payload is not accepted."] },
    };
    const picker: CommandPayloadSchema<{ readonly id: string }> = {
      description: "A stable colour picker identifier.",
      parse: (value) => typeof value === "object" && value !== null && typeof Reflect.get(value, "id") === "string"
        ? { ok: true, value: { id: Reflect.get(value, "id") as string } }
        : { ok: false, issues: ["Picker ID is required."] },
    };
    const registrations = [
      commands.register({ id: "colour-panel.show", responderId, title: { key: "colour.panel.show", fallback: "Show Colours" }, payload: none, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" }, validate: () => ({ enabled: this.getSnapshot().status === "active" }), execute: () => this.open() }),
      commands.register({ id: "colour-panel.hide", responderId, title: { key: "colour.panel.hide", fallback: "Hide Colours" }, payload: none, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" }, validate: () => ({ enabled: this.getSnapshot().open }), execute: () => this.close("programmatic") }),
      commands.register({ id: "colour-panel.choose-picker", responderId, title: { key: "colour.panel.choosePicker", fallback: "Choose Colour Picker" }, payload: picker, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" }, validate: ({ payload }) => ({ enabled: this.#service.getSnapshot().pickers.some(({ id }) => id === payload.id) }), execute: ({ payload }) => this.choosePicker(payload.id) }),
      commands.register({ id: "colour-panel.copy", responderId, title: { key: "colour.panel.copy", fallback: "Copy Colour" }, payload: none, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" }, validate: () => ({ enabled: Boolean(this.#transferAdapter && this.#service.getSnapshot().currentCSS) }), execute: async ({ signal }) => {
        const current = this.#service.getSnapshot().currentCSS;
        if (!current || !this.#transferAdapter) return { kind: "unavailable" as const };
        const representation = serialiseNSEColourTransfer(GFXColour.parse(current))[0]!;
        return this.#transferAdapter.write({ type: "application/x-syncloudos-colour", value: representation.value as string }, signal);
      } }),
      commands.register({ id: "colour-panel.paste", responderId, title: { key: "colour.panel.paste", fallback: "Paste Colour" }, payload: none, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" }, validate: () => ({ enabled: Boolean(this.#transferAdapter && this.#service.getSnapshot().activeTargetId) }), execute: async ({ signal }) => {
        if (!this.#transferAdapter) return { kind: "unavailable" as const };
        const authority = this.#service.getSnapshot();
        const result = await this.#transferAdapter.read(signal);
        const current = this.#service.getSnapshot();
        const colour = result.kind === "accepted" ? parseNSEColourTransfer([result.payload]) : null;
        if (colour && authority.activeTargetId !== null && current.activeTargetId === authority.activeTargetId && current.previousCSS === authority.previousCSS) this.commit(colour, "paste");
        return result;
      } }),
      commands.register({ id: "colour-panel.commit", responderId, title: { key: "colour.panel.commit", fallback: "Apply Colour" }, payload: none, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" }, validate: () => ({ enabled: Boolean(this.#service.getSnapshot().activeTargetId) }), execute: () => this.close("commit") }),
      commands.register({ id: "colour-panel.cancel", responderId, title: { key: "colour.panel.cancel", fallback: "Cancel Colour" }, payload: none, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" }, validate: () => ({ enabled: Boolean(this.#service.getSnapshot().activeTargetId) }), execute: () => this.close("cancel") }),
    ];
    let live = true;
    return this.#ownRelease(() => {
      if (!live) return;
      live = false;
      for (const registration of [...registrations].reverse()) registration.dispose();
    });
  }
}
