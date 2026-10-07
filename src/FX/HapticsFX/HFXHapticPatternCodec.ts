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

import { HFXHapticPattern } from "./HFXHapticPattern";
import { HFXHapticParameterCurve } from "./HFXHapticParameterCurve";
export class HFXHapticPatternCodec {
  static encode(pattern: HFXHapticPattern) { return JSON.stringify({ version: 1, events: pattern.events, curves: pattern.curves }); }
  static decode(text: string) {
    if (text.length > 1048576) throw new RangeError("Pattern file exceeds limit.");
    const data = JSON.parse(text);
    if (data?.version !== 1 || !Array.isArray(data.events) || !Array.isArray(data.curves)) throw new TypeError("Invalid pattern file.");
    return new HFXHapticPattern(data.events, data.curves.map((curve: { parameterID: ConstructorParameters<typeof HFXHapticParameterCurve>[0]; controlPoints: ConstructorParameters<typeof HFXHapticParameterCurve>[1]; relativeTime: number }) => new HFXHapticParameterCurve(curve.parameterID, curve.controlPoints, curve.relativeTime)));
  }
  /** AHAP 1.0 semantic interchange. Unsupported synthesis controls are rejected, never discarded. */
  static encodeAHAP(pattern: HFXHapticPattern) {
    const parameterIDs = { intensity: "HapticIntensityControl", sharpness: "HapticSharpnessControl", audioVolume: "AudioVolumeControl", audioPan: "AudioPanControl", audioPitch: "AudioPitchControl", audioBrightness: "AudioBrightnessControl", hapticAttackTime: "HapticAttackTimeControl", hapticDecayTime: "HapticDecayTimeControl", hapticReleaseTime: "HapticReleaseTimeControl", audioAttackTime: "AudioAttackTimeControl", audioDecayTime: "AudioDecayTimeControl", audioReleaseTime: "AudioReleaseTimeControl" };
    if (pattern.events.some(event => event.name !== undefined)) throw new TypeError("AHAP has no portable event-name field; use the HFX codec to preserve names.");
    return JSON.stringify({ Version: 1, Pattern: [
      ...pattern.events.map(event => ({ Event: {
        EventType: event.type === "transient" ? "HapticTransient" : event.type === "continuous" ? "HapticContinuous" : event.type === "audioContinuous" ? "AudioContinuous" : "AudioCustom",
        Time: event.relativeTime,
        ...(event.duration === undefined ? {} : { EventDuration: event.duration }),
        ...(event.audioResource === undefined ? {} : { EventWaveformPath: event.audioResource }),
        ...(event.audioLoop === undefined ? {} : { EventWaveformLoopEnabled: event.audioLoop }),
        ...(event.audioUseVolumeEnvelope === undefined ? {} : { EventWaveformUseVolumeEnvelope: event.audioUseVolumeEnvelope }),
        EventParameters: [
          ...(event.attackTime === undefined ? [] : [{ ParameterID: "AttackTime", ParameterValue: event.attackTime }]),
          ...(event.decayTime === undefined ? [] : [{ ParameterID: "DecayTime", ParameterValue: event.decayTime }]),
          ...(event.releaseTime === undefined ? [] : [{ ParameterID: "ReleaseTime", ParameterValue: event.releaseTime }]),
          ...(event.sustained === undefined ? [] : [{ ParameterID: "Sustained", ParameterValue: event.sustained ? 1 : 0 }]),
          ...(event.audioBrightness === undefined ? [] : [{ ParameterID: "AudioBrightness", ParameterValue: event.audioBrightness }]),
          ...(event.audioPan === undefined ? [] : [{ ParameterID: "AudioPan", ParameterValue: event.audioPan }]),
          ...(event.audioPitch === undefined ? [] : [{ ParameterID: "AudioPitch", ParameterValue: event.audioPitch }]),
          ...(event.intensity === undefined ? [] : [{ ParameterID: (event.type === "audio" || event.type === "audioContinuous") ? "AudioVolume" : "HapticIntensity", ParameterValue: event.intensity }]),
          ...(event.sharpness === undefined ? [] : [{ ParameterID: "HapticSharpness", ParameterValue: event.sharpness }]),
        ],
      } })),
      ...pattern.curves.map(curve => ({ ParameterCurve: { ParameterID: parameterIDs[curve.parameterID], Time: curve.relativeTime, ParameterCurveControlPoints: curve.controlPoints.map(point => ({ Time: point.time, ParameterValue: point.value })) } })),
    ] });
  }
  static decodeAHAP(text: string) {
    if (text.length > 1048576) throw new RangeError("AHAP file exceeds limit.");
    const data = JSON.parse(text);
    if (data?.Version !== 1 || !Array.isArray(data.Pattern) || data.Pattern.length > 4224) throw new TypeError("Invalid or unsupported AHAP version/pattern.");
    const events: ConstructorParameters<typeof HFXHapticPattern>[0][number][] = [];
    const curves: HFXHapticParameterCurve[] = [];
    const parameterID = (value: unknown) => {
      if (value === "HapticIntensityControl") return "intensity" as const;
      if (value === "HapticSharpnessControl") return "sharpness" as const;
      if (value === "AudioVolumeControl") return "audioVolume" as const;
      if (value === "AudioPanControl") return "audioPan" as const;
      if (value === "AudioBrightnessControl") return "audioBrightness" as const;
      if (value === "AudioPitchControl") return "audioPitch" as const;
      if (value === "HapticAttackTimeControl") return "hapticAttackTime" as const;
      if (value === "HapticDecayTimeControl") return "hapticDecayTime" as const;
      if (value === "HapticReleaseTimeControl") return "hapticReleaseTime" as const;
      if (value === "AudioAttackTimeControl") return "audioAttackTime" as const;
      if (value === "AudioDecayTimeControl") return "audioDecayTime" as const;
      if (value === "AudioReleaseTimeControl") return "audioReleaseTime" as const;
      throw new TypeError("Unsupported AHAP dynamic parameter.");
    };
    for (const item of data.Pattern) {
      if (item?.Event) {
        const event = item.Event;
        if (Object.keys(event).some(key => !["EventType", "Time", "EventDuration", "EventWaveformPath", "EventParameters", "EventWaveformLoopEnabled", "EventWaveformUseVolumeEnvelope"].includes(key))) throw new TypeError("Unsupported AHAP event field.");
        const type = event.EventType === "HapticTransient" ? "transient" : event.EventType === "HapticContinuous" ? "continuous" : event.EventType === "AudioCustom" ? "audio" : event.EventType === "AudioContinuous" ? "audioContinuous" : null;
        if (!type || (event.EventParameters !== undefined && !Array.isArray(event.EventParameters))) throw new TypeError("Unsupported AHAP event.");
        const parameters: { intensity?: number; sharpness?: number; audioPan?: number; audioPitch?: number; audioBrightness?: number; attackTime?: number; decayTime?: number; releaseTime?: number; sustained?: boolean } = {};
        for (const parameter of event.EventParameters ?? []) {
          if (parameter.ParameterID === "HapticIntensity" || parameter.ParameterID === "AudioVolume") parameters.intensity = parameter.ParameterValue;
          else if (parameter.ParameterID === "HapticSharpness") parameters.sharpness = parameter.ParameterValue;
          else if (parameter.ParameterID === "AudioPan") parameters.audioPan = parameter.ParameterValue;
          else if (parameter.ParameterID === "AudioBrightness") parameters.audioBrightness = parameter.ParameterValue;
          else if (parameter.ParameterID === "AudioPitch") parameters.audioPitch = parameter.ParameterValue;
          else if (parameter.ParameterID === "AttackTime") parameters.attackTime = parameter.ParameterValue;
          else if (parameter.ParameterID === "DecayTime") parameters.decayTime = parameter.ParameterValue;
          else if (parameter.ParameterID === "ReleaseTime") parameters.releaseTime = parameter.ParameterValue;
          else if (parameter.ParameterID === "Sustained") { if (parameter.ParameterValue !== 0 && parameter.ParameterValue !== 1) throw new TypeError("Invalid AHAP sustain."); parameters.sustained = parameter.ParameterValue === 1; }
          else throw new TypeError("Unsupported AHAP event parameter.");
        }
        events.push({ ...(event.EventWaveformUseVolumeEnvelope === undefined ? {} : { audioUseVolumeEnvelope: event.EventWaveformUseVolumeEnvelope }), ...(event.EventWaveformLoopEnabled === undefined ? {} : { audioLoop: event.EventWaveformLoopEnabled }), type, relativeTime: event.Time, ...(event.EventDuration === undefined ? {} : { duration: event.EventDuration }), ...(event.EventWaveformPath === undefined ? {} : { audioResource: event.EventWaveformPath }), ...parameters });
      } else if (item?.ParameterCurve) {
        const curve = item.ParameterCurve;
        if (!Array.isArray(curve.ParameterCurveControlPoints)) throw new TypeError("Invalid AHAP curve.");
        curves.push(new HFXHapticParameterCurve(parameterID(curve.ParameterID), curve.ParameterCurveControlPoints.map((point: { Time: number; ParameterValue: number }) => ({ time: point.Time, value: point.ParameterValue })), curve.Time));
      } else if (item?.Parameter) {
        const parameter = item.Parameter;
        curves.push(new HFXHapticParameterCurve(parameterID(parameter.ParameterID), [{ time: 0, value: parameter.ParameterValue }], parameter.Time));
      } else throw new TypeError("Unsupported AHAP pattern entry.");
    }
    return new HFXHapticPattern(events, curves);
  }
}
