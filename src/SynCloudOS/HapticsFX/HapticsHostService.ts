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

import type { HFXHapticEngine } from "../../FX/HapticsFX/HFXHapticEngine";
import type { HFXHapticSession } from "../../FX/HapticsFX/HFXHapticSession";
import type { AUFXSystemFeedbackBus } from "../AudioFX/AUFXSystemFeedbackBus";
import { createRuntimeHapticsService } from "./HapticsService";
import type { HFXFeedbackOptions } from "./feedbackTypes";
export interface HFXHostService {
  readonly system: HFXHapticEngine;
  createSession(signal?: AbortSignal): HFXHapticSession;
  setButtonSoundEnabled(enabled: boolean): void;
  setVibrationEnabled(enabled: boolean): void;
  dispose(): void;
}
/** One runtime registry owns feedback policy and arbitrates its single browser vibration actuator. */
export function createRuntimeHapticsHostService(bus: AUFXSystemFeedbackBus, options: HFXFeedbackOptions = {}): HFXHostService {
  const sessions = new Map<HFXHapticSession, HFXHapticEngine>();
  let disposed = false, soundEnabled = options.buttonSound ?? true, vibrationEnabled = true;
  let motorOwner: object | null = null;
  let ownerSequence = 0;
  const ownerStarts = new WeakMap<object, number>();
  const navigator = options.navigator ?? null;
  const makeEngine = () => {
    let activeCallOwner: object | null = null;
    const engine = createRuntimeHapticsService(bus, {
      ...options,
      navigator: navigator?.vibrate ? { vibrate: pattern => {
        if (motorOwner !== activeCallOwner) return false;
        const result = navigator.vibrate!.call(navigator, pattern);
        if (pattern === 0) motorOwner = null;
        return result;
      } } : null,
    }, {
      playerStarted: owner => ownerStarts.set(owner, ++ownerSequence),
      claim: (owner, kind) => {
        const order = kind === "direct" ? ++ownerSequence : ownerStarts.get(owner) ?? 0;
        if (kind === "direct") ownerStarts.set(owner, order);
        const currentOrder = motorOwner ? ownerStarts.get(motorOwner) ?? 0 : -1;
        if (motorOwner && motorOwner !== owner && order < currentOrder) return false;
        activeCallOwner = owner; motorOwner = owner; return true;
      },
      owns: owner => motorOwner === owner,
    });
    engine.setButtonSoundEnabled(soundEnabled); engine.setVibrationEnabled(vibrationEnabled); return engine;
  };
  const system = makeEngine();
  const assertActive = () => { if (disposed) throw new Error("Haptic host is disposed."); };
  const applyPolicy = (apply: (engine: HFXHapticEngine) => void) => {
    let failure: Readonly<{ error: unknown }> | undefined;
    for (const engine of [system, ...sessions.values()]) { try { apply(engine); } catch (error) { failure ??= { error }; } }
    if (failure) throw failure.error;
  };
  return Object.freeze({
    system,
    createSession(signal?: AbortSignal): HFXHapticSession {
      assertActive(); signal?.throwIfAborted(); if (sessions.size >= 128) throw new RangeError("Haptic session budget exceeded.");
      const engine = makeEngine();
      let released = false;
      const release = () => { if (released) return; released = true; signal?.removeEventListener("abort", release); try { engine.dispose(); } finally { sessions.delete(session); } };
      const session: HFXHapticSession = Object.freeze<HFXHapticSession>({
        get currentTime() { return engine.currentTime; },
        get isSupported() { return engine.isSupported; },
        get capabilities() { return engine.capabilities; },
        observe: listener => engine.observe(listener), configurePlayback: configuration => engine.configurePlayback(configuration),
        start: () => engine.start(), stop: () => engine.stop(), reset: () => engine.reset(),
        trigger: (request, triggerOptions) => engine.trigger(request, triggerOptions),
        registerAudioResource: (buffer, resourceSignal) => engine.registerAudioResource(buffer, resourceSignal),
        unregisterAudioResource: resource => engine.unregisterAudioResource(resource),
        makePlayer: pattern => engine.makePlayer(pattern),
        makeAdvancedPlayer: pattern => engine.makeAdvancedPlayer(pattern),
        dispose: release,
      });
      sessions.set(session, engine); signal?.addEventListener("abort", release, { once: true }); return session;
    },
    setButtonSoundEnabled(enabled: boolean) { assertActive(); soundEnabled = enabled; applyPolicy(engine => engine.setButtonSoundEnabled(enabled)); },
    setVibrationEnabled(enabled: boolean) { assertActive(); vibrationEnabled = enabled; applyPolicy(engine => engine.setVibrationEnabled(enabled)); },
    dispose() {
      if (disposed) return; disposed = true;
      let failure: Readonly<{ error: unknown }> | undefined;
      for (const session of [...sessions.keys()]) { try { session.dispose(); } catch (error) { failure ??= { error }; } }
      try { system.dispose(); } catch (error) { failure ??= { error }; }
      motorOwner = null;
      if (failure) throw failure.error;
    },
  });
}

