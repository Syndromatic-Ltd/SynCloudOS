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

import { HFXHapticEngine } from "../../FX/HapticsFX/HFXHapticEngine";
import { AUFXSystemFeedbackBus } from "../AudioFX/AUFXSystemFeedbackBus";
import { BrowserHapticsAdapter } from "../PlatformAdapters/BrowserHapticsAdapter";
import type { HFXFeedbackOptions } from "./feedbackTypes";
export function createRuntimeHapticsService(feedbackBus: AUFXSystemFeedbackBus, options: HFXFeedbackOptions = {}, outputAuthority?: { playerStarted(owner: object): void; claim(owner: object, kind: "direct" | "player"): boolean; owns(owner: object): boolean }) {
  const adapter = new BrowserHapticsAdapter(feedbackBus, options);
  const resources = new Set<string>();
  type OwnedAudio = Readonly<{ kind: "playback" | "synthesized"; id: string }>;
  const audioByOwner = new Map<object, Set<OwnedAudio>>();
  let audioEnabled = options.buttonSound ?? true;
  const directActuatorOwner = {};
  type CapturedFailure = Readonly<{ error: unknown }> | undefined;
  const attempt = (failure: CapturedFailure, action: () => void): CapturedFailure => { try { action(); } catch (error) { return failure ?? { error }; } return failure; };
  const rethrow = (failure: CapturedFailure) => { if (failure) throw failure.error; };
  const rememberAudio = (owner: object, output: OwnedAudio) => { const outputs = audioByOwner.get(owner) ?? new Set<OwnedAudio>(); outputs.add(output); audioByOwner.set(owner, outputs); };
  const forgetAudio = (owner: object, kind: OwnedAudio["kind"], id: string) => { const outputs = audioByOwner.get(owner); if (!outputs) return; for (const output of outputs) if (output.kind === kind && output.id === id) outputs.delete(output); if (!outputs.size) audioByOwner.delete(owner); };
  const cancelOwnerAudio = (owner: object) => {
    const outputs = audioByOwner.get(owner); if (!outputs) return;
    audioByOwner.delete(owner);
    let failure: CapturedFailure;
    for (const output of [...outputs]) failure = attempt(failure, () => { if (output.kind === "synthesized") feedbackBus.unregisterAudioResource(output.id); else feedbackBus.cancelAudioPlayback(output.id); });
    rethrow(failure);
  };
  const cancelAllAudio = () => { let failure: CapturedFailure; for (const owner of [...audioByOwner.keys()]) failure = attempt(failure, () => cancelOwnerAudio(owner)); rethrow(failure); };
  const playEvent = (event: Parameters<NonNullable<HFXHapticEngine["emit"]>>[0], delay = 0, offset = 0, rate = 1, originalDuration = event.duration, actuatorOwner = directActuatorOwner, ownerKind: "direct" | "player" = "direct") => {
    const envelopeAllowed = event.type === "audioContinuous" || event.audioUseVolumeEnvelope === true;
    const envelope = envelopeAllowed && (event.audioUseVolumeEnvelope || event.attackTime !== undefined || event.decayTime !== undefined || event.releaseTime !== undefined || event.sustained !== undefined) ? { attackTime: event.attackTime, decayTime: event.decayTime, releaseTime: event.releaseTime, sustained: event.sustained } : undefined;
    if (event.type === "audioContinuous") {
      if (audioEnabled) { let id = ""; id = feedbackBus.playSynthesizedAudio({ delay, offset, duration: event.duration, volume: event.intensity, pan: event.audioPan, pitch: event.audioPitch, brightness: event.audioBrightness, envelope, envelopeAllowed, envelopeDuration: originalDuration, rate }, () => forgetAudio(actuatorOwner, "synthesized", id)); rememberAudio(actuatorOwner, { kind: "synthesized", id }); }
    } else if (event.type === "audio") {
      if (!resources.has(event.audioResource!)) throw new Error("Audio resource is not owned by this haptic service.");
      if (audioEnabled) { let id = ""; id = feedbackBus.playAudioResource(event.audioResource!, { delay, offset, duration: event.duration, volume: event.intensity, pan: event.audioPan, pitch: event.audioPitch, loop: event.audioLoop, brightness: event.audioBrightness, envelope, envelopeAllowed, envelopeDuration: originalDuration, rate }, () => forgetAudio(actuatorOwner, "playback", id)); rememberAudio(actuatorOwner, { kind: "playback", id }); }
    } else if (!outputAuthority || outputAuthority.claim(actuatorOwner, ownerKind)) adapter.playStructuredEvent(event, offset, rate, originalDuration);
  };
  const applyParameters = (parameters: Parameters<NonNullable<HFXHapticEngine["sendParameters"]>>[0], actuatorOwner = directActuatorOwner) => {
    const hapticParameters = parameters.filter(parameter => parameter.parameterID === "intensity" || parameter.parameterID === "sharpness" || parameter.parameterID === "hapticAttackTime" || parameter.parameterID === "hapticDecayTime" || parameter.parameterID === "hapticReleaseTime");
    if ((!outputAuthority || outputAuthority.owns(actuatorOwner)) && hapticParameters.length) adapter.applyDynamicParameters(hapticParameters);
    for (const parameter of parameters) if (parameter.parameterID === "audioVolume" || parameter.parameterID === "audioPan" || parameter.parameterID === "audioPitch" || parameter.parameterID === "audioBrightness" || parameter.parameterID === "audioAttackTime" || parameter.parameterID === "audioDecayTime" || parameter.parameterID === "audioReleaseTime") for (const output of audioByOwner.get(actuatorOwner) ?? []) {
      if (output.kind === "synthesized") feedbackBus.setAudioResourceParameter(output.id, parameter.parameterID, parameter.value);
      else feedbackBus.setAudioPlaybackParameter(output.id, parameter.parameterID, parameter.value);
    }
  };
  const cancelOutput = (actuatorOwner?: object) => {
    let failure: CapturedFailure;
    if (actuatorOwner === undefined) { if (!outputAuthority || outputAuthority.owns(directActuatorOwner)) failure = attempt(failure, () => adapter.cancel()); }
    else if (!outputAuthority || outputAuthority.owns(actuatorOwner)) failure = attempt(failure, () => adapter.cancel());
    failure = attempt(failure, () => cancelOwnerAudio(actuatorOwner ?? directActuatorOwner));
    rethrow(failure);
  };
  return new HFXHapticEngine({
    get audioState() { return feedbackBus.audioState; },
    get currentTime() { return feedbackBus.currentTime; },
    get supported() { return adapter.isSupported; },
    start: () => feedbackBus.prepare(),
    capabilities: Object.freeze({ amplitude: false, sharpness: false, timing: "approximate" as const, amplitudeApproximation: "timing" as const, dynamicParameters: "timing-approximation" as const }),
    trigger: (request, requestOptions) => { if (request && outputAuthority && !outputAuthority.claim(directActuatorOwner, "direct")) return; return adapter.trigger(request, requestOptions); },
    event: playEvent,
    playerStart: owner => outputAuthority?.playerStarted(owner),
    playerEvent: (owner, event, delay, offset, rate, originalDuration) => playEvent(event, delay, offset, rate, originalDuration, owner, "player"),
    parameters: applyParameters,
    playerParameters: (owner, parameters) => applyParameters(parameters, owner),
    registerAudioResource: async (buffer, signal) => { const id = await feedbackBus.registerAudioResource(buffer, signal); resources.add(id); return id; },
    unregisterAudioResource: (id) => { feedbackBus.unregisterAudioResource(id); resources.delete(id); },
    cancel: () => cancelOutput(),
    playerCancel: owner => cancelOutput(owner),
    dispose: () => { let failure: CapturedFailure; failure = attempt(failure, () => adapter.destroy()); failure = attempt(failure, cancelAllAudio); for (const id of [...resources]) failure = attempt(failure, () => feedbackBus.unregisterAudioResource(id)); resources.clear(); rethrow(failure); },
    setPatternPlayback: configuration => { let failure: CapturedFailure; if (configuration.audioOnly) failure = attempt(failure, () => adapter.cancel()); if (configuration.hapticsOnly) failure = attempt(failure, cancelAllAudio); rethrow(failure); },
    setVibrationEnabled: (enabled) => adapter.setVibrationEnabled(enabled),
    setButtonSoundEnabled: (enabled) => { audioEnabled = enabled; let failure: CapturedFailure; failure = attempt(failure, () => adapter.setButtonSoundEnabled(enabled)); if (!enabled) failure = attempt(failure, cancelAllAudio); rethrow(failure); },
  });
}
