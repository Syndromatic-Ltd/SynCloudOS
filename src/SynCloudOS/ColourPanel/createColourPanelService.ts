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
  ColourPanelPickerDescriptor,
  ColourPanelService,
  ColourPanelServiceChange,
  ColourPanelServiceSnapshot,
  ColourPanelTargetRegistration,
} from "./colourPanelServiceTypes";
import type { RuntimeOwnerToken } from "../Runtime/runtimeOwner";

const freezeSnapshot = (snapshot: ColourPanelServiceSnapshot): ColourPanelServiceSnapshot => Object.freeze(snapshot);

function validatedCSS(css: string): string {
  if (typeof css !== "string") throw new TypeError("Colour panel values must be strings.");
  const value = css.trim();
  if (value.length <= 64 && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return value;
  const rgb = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3})(?: \/ (0|1|0?\.\d+))?\)$/.exec(value);
  if (rgb && rgb.slice(1, 4).every((part) => Number(part) <= 255) && (rgb[4] === undefined || Number(rgb[4]) <= 1)) return value;
  const p3 = /^color\(display-p3 (0|1|0?\.\d+) (0|1|0?\.\d+) (0|1|0?\.\d+)(?: \/ (0|1|0?\.\d+))?\)$/.exec(value);
  if (p3 && p3.slice(1).filter(Boolean).every((part) => Number(part) <= 1)) return value;
  throw new TypeError("Colour panel values must be valid bounded CSS colours.");
}

function validatedCSSList(input: readonly string[]): readonly string[] {
  if (!Array.isArray(input)) throw new TypeError("Colour panel palettes must be dense data-only arrays.");
  const values: string[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, index);
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") {
      throw new TypeError("Colour panel palettes must be dense data-only arrays.");
    }
    values.push(validatedCSS(descriptor.value));
  }
  return values;
}

export function createColourPanelService(options: Readonly<{ runtimeId: string; ownerToken: RuntimeOwnerToken }>): ColourPanelService {
  let snapshot = freezeSnapshot({
    runtimeId: options.runtimeId,
    status: "active",
    open: false,
    activeTargetId: null,
    activePickerId: null,
    currentCSS: null,
    previousCSS: null,
    pickers: Object.freeze([]),
    recents: Object.freeze([]),
    swatches: Object.freeze([]),
    revision: 0,
  });
  let target: ColourPanelTargetRegistration | null = null;
  let targetGeneration = 0;
  let activeLease: { readonly token: object; readonly generation: number } | null = null;
  let finishingGeneration: number | null = null;
  const listeners = new Set<() => void>();
  const pickers = new Map<string, ColourPanelPickerDescriptor>();
  const pickerGenerations = new Map<string, number>();
  const orderedPickers = () => Object.freeze([...pickers.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)));

  const assertActive = () => {
    if (snapshot.status === "disposed") throw new Error(`Colour panel ${options.runtimeId} is disposed.`);
  };
  const assertLease = (lease?: object) => {
    if (lease === undefined) return;
    if (!activeLease || activeLease.token !== lease || activeLease.generation !== targetGeneration || !target) {
      throw new DOMException("The colour-panel target lease is stale.", "SecurityError");
    }
  };
  const publish = (changes: Partial<ColourPanelServiceSnapshot>) => {
    snapshot = freezeSnapshot({ ...snapshot, ...changes, revision: snapshot.revision + 1 });
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Subscriber ownership remains external. */ }
    }
  };
  const change = (currentCSS: string, phase: ColourPanelServiceChange["phase"], reason: ColourPanelServiceChange["reason"]): ColourPanelServiceChange => Object.freeze({
    previousCSS: snapshot.previousCSS ?? snapshot.currentCSS ?? currentCSS,
    currentCSS,
    phase,
    reason,
  });
  const finishCurrent = (phase: "commit" | "cancel", reason: ColourPanelServiceChange["reason"]) => {
    if (!target || snapshot.currentCSS === null) return;
    const authority = target;
    const generation = targetGeneration;
    const next = phase === "cancel" ? (snapshot.previousCSS ?? snapshot.currentCSS) : snapshot.currentCSS;
    if (phase === "commit" && snapshot.previousCSS === snapshot.currentCSS) return;
    const event = change(next, phase, reason);
    const previousFinishingGeneration = finishingGeneration;
    finishingGeneration = generation;
    try { authority[phase](event); }
    finally { if (finishingGeneration === generation) finishingGeneration = previousFinishingGeneration; }
    if (target !== authority || generation !== targetGeneration || snapshot.status === "disposed") return;
    const recents = phase === "commit"
      ? Object.freeze([next, ...snapshot.recents.filter((value) => value !== next)].slice(0, 16))
      : snapshot.recents;
    publish({ currentCSS: next, previousCSS: next, recents });
  };

  const activateTarget = (next: ColourPanelTargetRegistration) => {
    assertActive();
    activeLease = null;
    if (!next.id || !next.responderId) throw new TypeError("Colour targets require stable IDs and responder IDs.");
    const css = validatedCSS(next.read());
    if (target && target !== next && finishingGeneration !== targetGeneration) {
      const previousTarget = target;
      const previousGeneration = targetGeneration;
      finishCurrent("commit", "target-switch");
      if (target !== previousTarget || targetGeneration !== previousGeneration) return () => undefined;
    }
    target = next;
    const generation = ++targetGeneration;
    publish({ activeTargetId: next.id, currentCSS: css, previousCSS: css });
    let connected = true;
    return () => {
      if (!connected) return;
      connected = false;
      if (generation !== targetGeneration || target !== next) return;
      finishCurrent("cancel", "disconnect");
      if (snapshot.status === "disposed" || generation !== targetGeneration || target !== next) return;
      target = null;
      if (activeLease?.generation === generation) activeLease = null;
      // The panel is shared and stays where the user put it: with its target
      // gone it keeps the colour it shows and remains usable (a colour can
      // still be chosen, dragged or saved) until the next target takes over,
      // as NSColorPanel does. The cancelled preview is what it shows.
      publish({ activeTargetId: null, previousCSS: snapshot.currentCSS });
    };
  };

  return {
    runtimeId: options.runtimeId,
    ownerToken: options.ownerToken,
    getSnapshot: () => snapshot,
    getPickers: orderedPickers,
    subscribe(listener) {
      assertActive();
      listeners.add(listener);
      let subscribed = true;
      return () => { if (subscribed) listeners.delete(listener); subscribed = false; };
    },
    registerPicker(descriptor) {
      assertActive();
      if (!descriptor.id) throw new TypeError("Colour pickers require a stable ID.");
      const frozen = Object.freeze({ ...descriptor, supportedSpaces: Object.freeze([...descriptor.supportedSpaces]) });
      const generation = (pickerGenerations.get(frozen.id) ?? 0) + 1;
      pickerGenerations.set(frozen.id, generation);
      pickers.set(frozen.id, frozen);
      publish({ activePickerId: snapshot.activePickerId ?? frozen.id, pickers: orderedPickers() });
      let registered = true;
      return () => {
        if (!registered || snapshot.status === "disposed" || pickerGenerations.get(frozen.id) !== generation) return;
        registered = false;
        pickers.delete(frozen.id);
        pickerGenerations.delete(frozen.id);
        const activePickerId = snapshot.activePickerId === frozen.id ? ([...pickers.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0]?.id ?? null) : snapshot.activePickerId;
        publish({ activePickerId, pickers: orderedPickers() });
      };
    },
    activateTarget,
    activateTargetWithLease(next) {
      const disconnect = activateTarget(next);
      const lease = Object.freeze({});
      activeLease = { token: lease, generation: targetGeneration };
      return {
        lease,
        disconnect: () => {
          if (activeLease?.token === lease) activeLease = null;
          disconnect();
        },
      };
    },
    open(lease) { assertActive(); assertLease(lease); if (!snapshot.open) publish({ open: true }); },
    close(reason, lease) {
      assertActive();
      assertLease(lease);
      if (reason === "commit") finishCurrent("commit", "programmatic");
      else if (reason === "target-disconnect") finishCurrent("cancel", "disconnect");
      else finishCurrent("cancel", reason === "cancel" ? "programmatic" : reason);
      if (snapshot.open) publish({ open: false });
    },
    choosePicker(id, lease) {
      assertActive();
      assertLease(lease);
      if (!pickers.has(id)) throw new Error(`Unknown colour picker ${id}.`);
      if (snapshot.activePickerId !== id) publish({ activePickerId: id });
    },
    preview(css, reason, lease) {
      assertActive();
      assertLease(lease);
      const canonical = validatedCSS(css);
      if (snapshot.currentCSS === canonical) return;
      // With no target the panel is just a colour chooser: it shows the colour.
      if (!target) { publish({ currentCSS: canonical }); return; }
      const authority = target;
      const generation = targetGeneration;
      const event = change(canonical, "preview", reason);
      try {
        authority.preview(event);
      } catch (error) {
        // A target preview callback can mutate its host and then reject. The
        // service must not leave the old current/previous pair looking clean;
        // retain the attempted preview as an uncommitted state without issuing
        // any inverse callback into that unknown target generation.
        if (target === authority && generation === targetGeneration && snapshot.status !== "disposed") {
          publish({ currentCSS: canonical });
        }
        throw error;
      }
      if (target !== authority || generation !== targetGeneration || snapshot.status === "disposed") return;
      publish({ currentCSS: canonical });
    },
    commit(css, reason, lease) {
      assertActive();
      assertLease(lease);
      const canonical = validatedCSS(css);
      if (!target) {
        if (snapshot.currentCSS === canonical && snapshot.previousCSS === canonical) return;
        publish({ currentCSS: canonical, previousCSS: canonical, recents: Object.freeze([canonical, ...snapshot.recents.filter((value) => value !== canonical)].slice(0, 16)) });
        return;
      }
      const authority = target;
      const generation = targetGeneration;
      if (snapshot.currentCSS !== canonical) {
        try {
          authority.preview(change(canonical, "preview", reason));
        } catch (error) {
          // Match preview(): an unacknowledged preview may already have
          // changed its target, so preserve the attempted colour as a dirty
          // preview rather than presenting the old snapshot as authoritative.
          if (target === authority && generation === targetGeneration && snapshot.status !== "disposed") {
            publish({ currentCSS: canonical });
          }
          throw error;
        }
        if (target !== authority || generation !== targetGeneration || snapshot.status === "disposed") return;
        publish({ currentCSS: canonical });
      }
      if (snapshot.previousCSS === canonical) return;
      authority.commit(change(canonical, "commit", reason));
      if (target !== authority || generation !== targetGeneration || snapshot.status === "disposed") return;
      const recents = Object.freeze([canonical, ...snapshot.recents.filter((value) => value !== canonical)].slice(0, 16));
      publish({ currentCSS: canonical, previousCSS: canonical, recents });
    },
    cancel(reason, lease) { assertActive(); assertLease(lease); finishCurrent("cancel", reason); },
    addRecent(css, lease) {
      assertActive();
      assertLease(lease);
      const canonical = validatedCSS(css);
      const next = Object.freeze([canonical, ...snapshot.recents.filter((value) => value !== canonical)].slice(0, 16));
      if (next.length === snapshot.recents.length && next.every((value, index) => value === snapshot.recents[index])) return;
      publish({ recents: next });
    },
    setSwatches(css, lease) {
      assertActive();
      assertLease(lease);
      const unique = [...new Set(validatedCSSList(css))];
      if (unique.length === snapshot.swatches.length && unique.every((value, index) => value === snapshot.swatches[index])) return;
      publish({ swatches: Object.freeze(unique) });
    },
    dispose() {
      if (snapshot.status === "disposed") return;
      let cancellationFailure: unknown;
      try { finishCurrent("cancel", "dispose"); }
      catch (error) { cancellationFailure = error; }
      target = null;
      activeLease = null;
      targetGeneration += 1;
      pickers.clear();
      pickerGenerations.clear();
      publish({
        status: "disposed",
        open: false,
        activeTargetId: null,
        activePickerId: null,
        currentCSS: null,
        previousCSS: null,
        pickers: Object.freeze([]),
        recents: Object.freeze([]),
        swatches: Object.freeze([]),
      });
      listeners.clear();
      if (cancellationFailure !== undefined) throw cancellationFailure;
    },
  };
}
