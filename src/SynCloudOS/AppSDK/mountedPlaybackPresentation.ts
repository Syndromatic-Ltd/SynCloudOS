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

import type { RuntimeAudioHandle } from "../SynCloudOS";
import type { AppPlaybackAction, AppPlaybackMetadata, AppPlaybackPresentationLease, AppPlaybackPresentationRequest, AppPlaybackPresentationSnapshot } from "./playbackPresentationTypes";
import type { AppCommandClient } from "./appClientTypes";
import { browserPresentationErrorName } from "./browserPresentationError";

const actions = Object.freeze(["play", "pause", "stop", "seekto", "seekbackward", "seekforward"] as const);
type SessionPort = Pick<MediaSession, "metadata" | "playbackState" | "setActionHandler" | "setPositionState">;
type Candidate = { eligible(): boolean; refresh(active: boolean): void; clear(): void };
// Media Session is page-global. Runtime-local services must not overwrite one
// another. Ambiguous foreground evidence clears the old owner and defers all.
const pages = new WeakMap<object, { candidates: Set<Candidate>; active: Candidate | null; refreshing: boolean; again: boolean }>();
function arbitrate(key: object) {
  const page = pages.get(key)!;
  if (page.refreshing) { page.again = true; return; }
  page.refreshing = true;
  try {
    do {
      page.again = false;
      const eligible = [...page.candidates].filter(candidate => candidate.eligible());
      const next = eligible.length === 1 ? eligible[0]! : null;
      if (page.active !== next) { page.active?.clear(); page.active = next; }
      for (const candidate of [...page.candidates]) candidate.refresh(candidate === next);
    } while (page.again);
  } finally { page.refreshing = false; }
}
function metadata(value: unknown): AppPlaybackMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Playback metadata must be a data record.");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length || Object.keys(fields).some(key => !["title", "artist", "album"].includes(key) || !("value" in fields[key]!))) throw new TypeError("Playback metadata accepts title, artist and album data only.");
  const result: { title: string; artist?: string; album?: string } = { title: "" };
  for (const key of ["title", "artist", "album"] as const) {
    const text = fields[key]?.value;
    if (text === undefined && key !== "title") continue;
    if (typeof text !== "string" || text.length > 512 || /[\u0000-\u001f\u007f]/.test(text)) throw new TypeError("Playback metadata must contain bounded text.");
    result[key] = text;
  }
  return Object.freeze(result);
}
export function createMountedPlaybackPresentation(input: {
  readonly signal: AbortSignal;
  readonly navigator: Navigator | null;
  readonly metadataFactory: ((data: AppPlaybackMetadata) => MediaMetadata) | null;
  readonly assertLive: () => void;
  readonly isForeground: () => boolean;
  readonly subscribeOwner: (listener: () => void) => () => void;
  readonly subscribePlayback: (listener: (handleId: string) => void) => () => void;
  readonly commands: Pick<AppCommandClient, "dispatch" | "createPayload">;
}) {
  const key = input.navigator;
  const session: SessionPort | null = key?.mediaSession ?? null;
  if (key && !pages.has(key)) pages.set(key, { candidates: new Set(), active: null, refreshing: false, again: false });
  const leases = new Set<{ release(): void; refresh(): void }>();
  let ended = false;
  const refresh = () => { if (key) arbitrate(key); };
  const removeOwner = input.subscribeOwner(refresh);
  const removePlayback = input.subscribePlayback(() => { for (const lease of [...leases]) lease.refresh(); refresh(); });
  const end = () => { if (ended) return; ended = true; for (const lease of [...leases]) lease.release(); removeOwner(); removePlayback(); input.signal.removeEventListener("abort", end); };
  input.signal.addEventListener("abort", end, { once: true });
  if (input.signal.aborted) end();
  return Object.freeze({
    present(handle: RuntimeAudioHandle, request: AppPlaybackPresentationRequest, callerSignal?: AbortSignal): AppPlaybackPresentationLease {
      input.assertLive(); input.signal.throwIfAborted(); callerSignal?.throwIfAborted();
      if (ended) throw new DOMException("Playback presentation owner ended.", "AbortError");
      if (!request || typeof request !== "object") throw new TypeError("Playback presentation requires a data record.");
      const fields = Object.getOwnPropertyDescriptors(request);
      if (Object.getOwnPropertySymbols(request).length || Object.keys(fields).some(key => !["metadata", "commands"].includes(key) || !("value" in fields[key]!))) throw new TypeError("Playback presentation accepts metadata and commands data only.");
      let data = metadata(fields.metadata?.value);
      const commandData: unknown = fields.commands?.value;
      if (!commandData || typeof commandData !== "object" || Array.isArray(commandData)) throw new TypeError("Transport commands require a data record.");
      const descriptors = Object.getOwnPropertyDescriptors(commandData);
      if (Object.getOwnPropertySymbols(commandData).length || Object.keys(descriptors).some(name => !actions.includes(name as AppPlaybackAction) || !("value" in descriptors[name]!))) throw new TypeError("Only transport command data is accepted.");
      const bindings = new Map<AppPlaybackAction, string>();
      for (const action of actions) {
        const id = descriptors[action]?.value;
        if (id === undefined) continue;
        if (typeof id !== "string" || !id.trim() || id.length > 256) throw new TypeError("Playback action requires a bounded command ID.");
        bindings.set(action, id);
      }
      // Reflection on app-owned records can synchronously revoke a mount.
      // Never create a new lease after its abort cleanup has already run.
      input.assertLive(); input.signal.throwIfAborted(); callerSignal?.throwIfAborted();
      const listeners = new Set<() => void>();
      let disposed = false, installed = false, metadataDirty = true, actionEpoch = 0, installEpoch = 0;
      const pendingActions = new Set<AbortController>();
      let snapshot: AppPlaybackPresentationSnapshot = Object.freeze({ state: session && input.metadataFactory ? "deferred" : "unsupported", actions: Object.freeze([]), lastAction: "none", errorName: null });
      const publish = (patch: Partial<AppPlaybackPresentationSnapshot>) => {
        const next = Object.freeze({ ...snapshot, ...patch });
        if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
        snapshot = next; for (const listener of [...listeners]) { try { listener(); } catch { /* observers cannot own transport */ } }
      };
      const eligible = () => !!session && !!input.metadataFactory && !disposed && !ended && !callerSignal?.aborted && handle.state !== "released" && input.isForeground();
      const clear = () => {
        if (!installed || !session) return;
        installed = false; actionEpoch++; installEpoch++; metadataDirty = true;
        for (const controller of pendingActions) controller.abort(new DOMException("Media Session foreground owner changed.", "AbortError"));
        pendingActions.clear();
        if (snapshot.lastAction === "pending") publish({ lastAction: "cancelled" });
        for (const action of actions) { try { session.setActionHandler(action, null); } catch { /* individually unsupported */ } }
        try { session.playbackState = "none"; session.metadata = null; session.setPositionState?.(); } catch { /* browser may revoke support */ }
      };
      const invoke = (action: AppPlaybackAction, details: MediaSessionActionDetails) => {
        if (!key || pages.get(key)?.active !== candidate || !eligible() || !installed) return;
        const command = bindings.get(action); if (!command) return;
        const epoch = ++actionEpoch;
        const actionController = new AbortController(); pendingActions.add(actionController);
        publish({ lastAction: "pending", errorName: null });
        try {
          let payload: unknown;
          if (action.startsWith("seek")) {
            const duration = handle.duration;
            const offset = details.seekOffset ?? 10;
            const time = action === "seekto" ? details.seekTime : handle.currentTime + (action === "seekbackward" ? -offset : offset);
            if (typeof time !== "number" || !Number.isFinite(time) || typeof offset !== "number" || !Number.isFinite(offset) || offset < 0 || duration === null || !Number.isFinite(duration) || duration <= 0 || time < 0 || time > duration) throw new RangeError("Playback seek requires valid finite timeline geometry.");
            payload = input.commands.createPayload("time", time);
          }
          // No pre-dispatch await: existing validation/activation remains the
          // authority, including refusal when native activation is unavailable.
          const result = input.commands.dispatch(command, payload, { source: "system", signal: actionController.signal });
          void result.then(value => {
            if (disposed || actionEpoch !== epoch || !eligible()) return;
            const status = value && typeof value === "object" && "status" in value ? value.status : undefined;
            publish({ lastAction: status === "executed" ? "completed" : status === "failed" || status === "unknown" ? "failed" : "refused", errorName: status === "failed" || status === "unknown" ? "CommandFailed" : null });
          }, error => { if (!disposed && actionEpoch === epoch && eligible()) publish({ lastAction: "failed", errorName: browserPresentationErrorName(error) }); }).finally(() => pendingActions.delete(actionController));
        } catch (error) { pendingActions.delete(actionController); if (!disposed && actionEpoch === epoch) publish({ lastAction: "failed", errorName: browserPresentationErrorName(error) }); }
      };
      const candidate: Candidate = {
        eligible,
        clear,
        refresh(active) {
          if (disposed) return;
          if (handle.state === "released") { release(); return; }
          if (!session || !input.metadataFactory) { publish({ state: "unsupported" }); return; }
          if (!active || !eligible()) { clear(); publish({ state: "deferred", actions: Object.freeze([]) }); return; }
          try {
            if (!installed) {
              installed = true;
              const epoch = ++installEpoch;
              const supported: AppPlaybackAction[] = [];
              for (const action of actions) { try { session.setActionHandler(action, bindings.has(action) ? details => { if (epoch === installEpoch) invoke(action, details); } : null); if (bindings.has(action)) supported.push(action); } catch { /* unsupported action stays absent */ } }
              publish({ actions: Object.freeze(supported) });
            }
            if (metadataDirty) { session.metadata = input.metadataFactory(data); metadataDirty = false; }
            session.playbackState = handle.state === "playing" ? "playing" : handle.state === "paused" ? "paused" : "none";
            const duration = handle.duration, position = handle.currentTime, rate = handle.rate;
            if (duration !== null && Number.isFinite(duration) && duration > 0 && Number.isFinite(position) && position >= 0 && position <= duration && Number.isFinite(rate) && rate > 0) session.setPositionState?.({ duration, position, playbackRate: rate });
            else session.setPositionState?.();
            publish({ state: "active" });
          } catch (error) { clear(); publish({ state: "failed", actions: Object.freeze([]), errorName: browserPresentationErrorName(error) }); }
        },
      };
      const owned = { release: () => release(), refresh: () => { if (handle.state === "released") release(); } };
      function release() {
        if (disposed) return;
        disposed = true; actionEpoch++;
        callerSignal?.removeEventListener("abort", release);
        if (key) {
          const page = pages.get(key)!;
          page.candidates.delete(candidate);
        }
        // Native teardown belongs to the arbiter's serialized transition.
        // Cancelling commands/notifying observers can create a replacement
        // synchronously; old cleanup must finish before that owner installs.
        leases.delete(owned); refresh();
        publish({ state: "released", actions: Object.freeze([]) }); listeners.clear();
      }
      // A mounted controller explicitly replaces its prior presentation.
      // Separate foreground owners remain ambiguous and defer page-wide.
      for (const previous of [...leases]) previous.release();
      leases.add(owned); if (key) pages.get(key)!.candidates.add(candidate);
      callerSignal?.addEventListener("abort", release, { once: true }); refresh();
      return Object.freeze({ getSnapshot: () => snapshot, subscribe(listener: () => void) { if (disposed) return () => undefined; listeners.add(listener); return () => { listeners.delete(listener); }; }, updateMetadata(value: AppPlaybackMetadata) { input.assertLive(); if (disposed) throw new DOMException("Playback presentation released.", "AbortError"); data = metadata(value); metadataDirty = true; refresh(); }, dispose: release });
    },
    dispose: end,
  });
}
