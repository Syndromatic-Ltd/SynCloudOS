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

import { AUFXAudioEngine } from "../../FX/AudioFX/AUFXAudioEngine";
import type { AUFXAudioFormat } from "../../FX/AudioFX/AUFXAudioFormat";
import type { AUFXAudioPlayerNode } from "../../FX/AudioFX/AUFXAudioPlayerNode";
import type { AUFXAudioTimelineTransport } from "../../FX/AudioFX/AUFXAudioTimelineTransport";
import type { AUFXRationalSampleRate } from "../../FX/AudioFX/AUFXMediaTime";
import type { MEFXClock } from "../../FX/MediaFX/MEFXClock";
import type { AUFXSystemFeedbackBus } from "./AUFXSystemFeedbackBus";
import { AudioMediaClockBridge } from "./AudioMediaClockBridge";
import type { RuntimeAudioService } from "./audioTypes";

export interface AudioGraphHostService {
  createEngine(format: AUFXAudioFormat, signal?: AbortSignal, appId?: string, capability?: object): AUFXAudioEngine;
  createMediaClockBridge(engine: AUFXAudioEngine, mediaClock: MEFXClock, exactSampleRate?: AUFXRationalSampleRate): AudioMediaClockBridge;
  createTimelineTransport(engine: AUFXAudioEngine, options: Readonly<{ capability: object; appId?: string; players?: readonly AUFXAudioPlayerNode[]; signal?: AbortSignal }>): AUFXAudioTimelineTransport;
  dispose(): void;
}

/** Runtime-owned graph registry. Construction does not activate an AudioContext. */
export function createAudioGraphHostService(bus: AUFXSystemFeedbackBus, owner: AbortSignal, policy?: Pick<RuntimeAudioService, "getOwnerPolicy" | "subscribeMixer">): AudioGraphHostService {
  const releases = new Set<() => void>();
  const engines = new WeakSet<AUFXAudioEngine>();
  const engineOwners = new WeakMap<AUFXAudioEngine, Readonly<{ capability: object; appId?: string }>>();
  const bridges = new WeakMap<AUFXAudioEngine, Set<AudioMediaClockBridge>>();
  // A failing host callback must not prevent another owner's revocation.
  const cleanup = (action: () => void) => { try { action(); } catch { /* Continue independent teardown. */ } };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    owner.removeEventListener("abort", dispose);
    const pending = [...releases];
    releases.clear();
    for (const release of pending) cleanup(release);
  };
  if (owner.aborted) disposed = true;
  else owner.addEventListener("abort", dispose, { once: true });
  return Object.freeze({
    createEngine(format: AUFXAudioFormat, signal?: AbortSignal, appId?: string, capability: object = Object.freeze({})) {
      if (disposed) throw new Error("Audio graph host is disposed.");
      signal?.throwIfAborted();
      if (releases.size >= 32) throw new DOMException("Audio graph resource limit reached.", "QuotaExceededError");
      const lease = new AbortController();
      const output = bus.createGraphOutput(lease.signal, capability);
      const synchronize = () => {
        if (policy && appId !== undefined) output.setOwnerPolicy(policy.getOwnerPolicy(appId));
      };
      let unsubscribe = () => {};
      let engine: AUFXAudioEngine | undefined;
      try {
        synchronize();
        if (policy && appId !== undefined) unsubscribe = policy.subscribeMixer(synchronize);
        engine = new AUFXAudioEngine(format, output, capability);
        owner.throwIfAborted();
        signal?.throwIfAborted();
        if (disposed) throw new Error("Audio graph host was disposed during acquisition.");
      }
      catch (error) { cleanup(unsubscribe); cleanup(() => lease.abort()); cleanup(() => engine?.dispose()); cleanup(() => output.dispose()); throw error; }
      engines.add(engine);
      engineOwners.set(engine, Object.freeze({ capability, appId }));
      bridges.set(engine, new Set());
      const disposeEngine = engine.dispose.bind(engine);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        releases.delete(release);
        signal?.removeEventListener("abort", release);
        engines.delete(engine);
        engineOwners.delete(engine);
        const ownedBridges = bridges.get(engine); bridges.delete(engine);
        for (const bridge of ownedBridges ?? []) cleanup(() => bridge.dispose());
        cleanup(unsubscribe);
        cleanup(() => lease.abort());
        cleanup(disposeEngine);
      };
      releases.add(release);
      signal?.addEventListener("abort", release, { once: true });
      Object.defineProperty(engine, "dispose", { value: release, configurable: true });
      return engine;
    },
    createTimelineTransport(engine: AUFXAudioEngine, options: Readonly<{ capability: object; appId?: string; players?: readonly AUFXAudioPlayerNode[]; signal?: AbortSignal }>) {
      if (disposed) throw new DOMException("Audio graph host is disposed.", "AbortError");
      const identity = engineOwners.get(engine);
      if (!identity || identity.capability !== options.capability || identity.appId !== options.appId)
        throw new DOMException("Audio timeline requires this mount's engine capability.", "InvalidAccessError");
      return engine.createTimelineTransport(options.players, options.signal);
    },
    createMediaClockBridge(engine: AUFXAudioEngine, mediaClock: MEFXClock, exactSampleRate?: AUFXRationalSampleRate) {
      if (disposed) throw new Error("Audio graph host is disposed.");
      if (!engines.has(engine)) throw new DOMException("Audio/media bridge requires an engine owned by this graph host.", "InvalidAccessError");
      const owned = bridges.get(engine)!;
      if (owned.size >= 8) throw new DOMException("Audio/media clock bridge limit reached.", "QuotaExceededError");
      const bridge = new AudioMediaClockBridge({
        sampleRate: engine.format.sampleRate,
        ...(exactSampleRate ? { exactSampleRate } : {}),
        mediaClock,
        observeAudioClock: () => engine.observeOutputClock(),
      });
      const disposeBridge = bridge.dispose.bind(bridge);
      let released = false;
      const releaseBridge = () => {
        if (released) return;
        released = true;
        owned.delete(bridge);
        disposeBridge();
      };
      owned.add(bridge);
      Object.defineProperty(bridge, "dispose", { value: releaseBridge, configurable: true });
      return bridge;
    },
    dispose,
  });
}
