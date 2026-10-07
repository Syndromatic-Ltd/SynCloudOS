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

import { AUFXAudioEnvelope, type AUFXAudioEnvelopeParameters } from "../../FX/AudioFX/AUFXAudioEnvelope";
import type { HFXHapticEvent, HFXHapticDynamicParameter } from "../../FX/HapticsFX/HFXHapticEvent";
import {
  AUFXSystemFeedbackBus,
  defaultHFXFeedbackPatterns,
  HFX_FEEDBACK_PRESET_NAMES,
  isHFXFeedbackPresetName,
} from "../HostServices/PlatformAdapterRuntimeServices";
import type {
  HFXFeedbackAudioMode,
  HFXFeedbackInput,
  HFXFeedbackPreset,
  HFXFeedbackRequest,
  HFXFeedbackTriggerOptions,
  HFXFeedbackVibration,
  HFXFeedbackNavigatorLike,
  HFXFeedbackOptions,
  HFXFeedbackSupportSnapshot
} from "../HostServices/PlatformAdapterRuntimePorts";

const TOGGLE_MIN_MS = 16;
const TOGGLE_MAX_MS = 184;
const MAX_PHASE_MS = 1000;
const PWM_CYCLE_MS = 20;
const DEFAULT_INTENSITY = 0.5;

interface HFXFeedbackNormalization {
  readonly vibrations: HFXFeedbackVibration[];
}


function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getDefaultNavigator(): HFXFeedbackNavigatorLike | undefined {
  return typeof navigator === "undefined" ? undefined : navigator;
}

function getDefaultDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function getDefaultRequestAnimationFrame() {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame.bind(globalThis);
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame.bind(window);
  }
  return (callback: FrameRequestCallback) =>
    globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

function getDefaultCancelAnimationFrame() {
  if (typeof cancelAnimationFrame === "function") return cancelAnimationFrame.bind(globalThis);
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    return window.cancelAnimationFrame.bind(window);
  }
  return (handle: number) => globalThis.clearTimeout(handle);
}

function getWarningHandler(options: Pick<HFXFeedbackOptions, "warn">) {
  if (options.warn === null) return null;
  if (options.warn) return options.warn;
  return (message: string) => console.warn(message);
}

function hasPresetPattern(input: HFXFeedbackInput): input is HFXFeedbackPreset {
  return typeof input === "object" && input !== null && "pattern" in input && Array.isArray(input.pattern);
}

function copyVibration(vibration: HFXFeedbackVibration): HFXFeedbackVibration {
  return { ...vibration };
}

export function normalizeHFXFeedbackInput(
  input: HFXFeedbackInput,
  options: Pick<HFXFeedbackOptions, "warn"> = {}
): HFXFeedbackNormalization | null {
  if (typeof input === "number") {
    return { vibrations: [{ duration: input }] };
  }

  if (typeof input === "string") {
    const preset = isHFXFeedbackPresetName(input) ? defaultHFXFeedbackPatterns[input] : null;
    if (!preset) {
      getWarningHandler(options)?.(`[HFXFeedback] Unknown preset: "${input}"`);
      return null;
    }
    return { vibrations: preset.pattern.map(copyVibration) };
  }

  if (Array.isArray(input)) {
    if (input.length === 0) return { vibrations: [] };

    if (typeof input[0] === "number") {
      const nums = input as number[];
      const vibrations: HFXFeedbackVibration[] = [];
      for (let i = 0; i < nums.length; i += 2) {
        const delay = i > 0 ? nums[i - 1] : 0;
        vibrations.push({
          ...(delay && delay > 0 ? { delay } : {}),
          duration: nums[i] ?? 0
        });
      }
      return { vibrations };
    }

    return { vibrations: (input as HFXFeedbackVibration[]).map(copyVibration) };
  }

  if (hasPresetPattern(input)) {
    return { vibrations: input.pattern.map(copyVibration) };
  }

  getWarningHandler(options)?.("[HFXFeedback] Invalid haptic input.");
  return null;
}

export function modulateHFXFeedbackVibration(duration: number, intensity: number): number[] {
  if (intensity >= 1) return [duration];
  if (intensity <= 0) return [];

  const onTime = Math.max(1, Math.round(PWM_CYCLE_MS * intensity));
  const offTime = PWM_CYCLE_MS - onTime;
  const result: number[] = [];
  let remaining = duration;

  while (remaining >= PWM_CYCLE_MS) {
    result.push(onTime, offTime);
    remaining -= PWM_CYCLE_MS;
  }

  if (remaining > 0) {
    const remOn = Math.max(1, Math.round(remaining * intensity));
    result.push(remOn);
    const remOff = remaining - remOn;
    if (remOff > 0) result.push(remOff);
  }

  return result;
}

export function createHFXVibratePattern(
  vibrations: readonly HFXFeedbackVibration[],
  defaultIntensity: number
): number[] {
  const result: number[] = [];

  for (const vibration of vibrations) {
    const intensity = clamp(vibration.intensity ?? defaultIntensity, 0, 1);
    const delay = vibration.delay ?? 0;

    if (delay > 0) {
      if (result.length > 0 && result.length % 2 === 0) {
        result[result.length - 1] += delay;
      } else {
        if (result.length === 0) result.push(0);
        result.push(delay);
      }
    }

    const modulated = modulateHFXFeedbackVibration(vibration.duration, intensity);

    if (modulated.length === 0) {
      if (result.length > 0 && result.length % 2 === 0) {
        result[result.length - 1] += vibration.duration;
      } else if (vibration.duration > 0) {
        result.push(0, vibration.duration);
      }
      continue;
    }

    result.push(...modulated);
  }

  return result;
}

function validateAndClampVibrations(
  vibrations: readonly HFXFeedbackVibration[],
  options: Pick<HFXFeedbackOptions, "warn"> = {}
) {
  const warningHandler = getWarningHandler(options);
  const validated: HFXFeedbackVibration[] = [];

  for (const vibration of vibrations) {
    if (
      !Number.isFinite(vibration.duration) ||
      vibration.duration < 0 ||
      (vibration.delay !== undefined && (!Number.isFinite(vibration.delay) || vibration.delay < 0))
    ) {
      warningHandler?.("[HFXFeedback] Invalid vibration values. Durations and delays must be finite non-negative numbers.");
      return null;
    }

    validated.push({
      ...vibration,
      duration: Math.min(vibration.duration, MAX_PHASE_MS)
    });
  }

  return validated;
}

function getTargetNavigator(options: Pick<HFXFeedbackOptions, "navigator"> = {}) {
  return options.navigator === undefined ? getDefaultNavigator() : options.navigator ?? undefined;
}

function getTargetDocument(options: Pick<HFXFeedbackOptions, "document"> = {}) {
  return options.document === undefined ? getDefaultDocument() : options.document ?? undefined;
}

function isDesktopLike() {
  if (typeof window === "undefined") return !getDefaultNavigator()?.vibrate;
  const navigatorLike = getDefaultNavigator();
  const maxTouchPoints = typeof navigatorLike === "object" && "maxTouchPoints" in navigatorLike
    ? Number((navigatorLike as Navigator).maxTouchPoints)
    : 0;

  if (maxTouchPoints > 0) return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(pointer: fine)").matches || !window.matchMedia("(pointer: coarse)").matches;
  }

  return true;
}

function shouldPlayAudio(mode: HFXFeedbackAudioMode | undefined, isSupported: boolean, debug: boolean, buttonSound: boolean) {
  if (!buttonSound) return false;
  const audioMode = mode ?? "desktop";
  if (audioMode === false || audioMode === "off") return false;
  if (audioMode === true || audioMode === "always") return true;
  if (audioMode === "debug") return debug;
  if (audioMode === "desktop") return debug || !isSupported || isDesktopLike();
  return !isSupported || debug;
}

function getHFXFeedbackSupportForNavigator(navigatorLike?: HFXFeedbackNavigatorLike): HFXFeedbackSupportSnapshot {
  if (!navigatorLike) {
    return {
      supported: false,
      reason: "no-navigator"
    };
  }

  if (typeof navigatorLike.vibrate !== "function") {
    return {
      supported: false,
      reason: "no-vibration-api"
    };
  }

  return {
    supported: true,
    reason: "vibration-api"
  };
}

export function getHFXFeedbackSupport(options: Pick<HFXFeedbackOptions, "navigator"> = {}) {
  return getHFXFeedbackSupportForNavigator(getTargetNavigator(options));
}

export class BrowserHapticsAdapter {
  readonly presets = defaultHFXFeedbackPatterns;
  readonly presetNames = HFX_FEEDBACK_PRESET_NAMES;

  private disposed = false;
  private structuredEvent: { start: number; duration: number; intensity: number; baseDuration: number; envelope: AUFXAudioEnvelopeParameters | null; offset: number; rate: number } | null = null;
  private dynamicIntensity = 1;
  private envelopeTimer: ReturnType<typeof setInterval> | null = null;
  private envelopeControls: Partial<Record<"attackTime" | "decayTime" | "releaseTime", number>> = {};

  private epoch = 0;
  private hapticLabel: HTMLLabelElement | null = null;
  private domInitialized = false;
  private instanceId: number;
  private debug: boolean;
  private showSwitch: boolean;
  private audioMode: HFXFeedbackAudioMode;
  private buttonSoundEnabled: boolean;
  private vibrationEnabled = true;
  private rafId: number | null = null;
  private patternResolve: (() => void) | null = null;
  private options: HFXFeedbackOptions;

  constructor(private readonly feedbackBus: AUFXSystemFeedbackBus, options: HFXFeedbackOptions = {}) {
    this.instanceId = ++instanceCounter;
    this.debug = options.debug ?? false;
    this.showSwitch = options.showSwitch ?? false;
    this.audioMode = options.audio ?? "desktop";
    this.buttonSoundEnabled = options.buttonSound ?? true;
    this.options = options;
  }

  get isSupported() {
    return this.support().supported;
  }

  support(options: Pick<HFXFeedbackOptions, "navigator"> = {}) {
    return getHFXFeedbackSupport({
      navigator: options.navigator === undefined ? this.options.navigator : options.navigator
    });
  }

  async trigger(input: HFXFeedbackRequest, options: HFXFeedbackTriggerOptions = {}): Promise<void> {
    if (this.disposed) throw new Error("Feedback adapter is disposed.");
    if (input === false || input === null || input === undefined) return;
    const epoch = ++this.epoch;

    const mergedOptions = { ...this.options, ...options };
    const normalized = normalizeHFXFeedbackInput(input, mergedOptions);
    if (!normalized || normalized.vibrations.length === 0) return;

    const vibrations = validateAndClampVibrations(normalized.vibrations, mergedOptions);
    if (!vibrations || vibrations.length === 0) return;

    const defaultIntensity = clamp(options.intensity ?? DEFAULT_INTENSITY, 0, 1);
    const targetNavigator = getTargetNavigator(mergedOptions);
    const support = getHFXFeedbackSupportForNavigator(targetNavigator);
    const debug = options.debug ?? this.debug;
    const buttonSound = options.buttonSound ?? this.buttonSoundEnabled;
    const playAudio = shouldPlayAudio(options.audio ?? this.audioMode, support.supported, debug, buttonSound);

    if (support.supported && this.vibrationEnabled) {
      targetNavigator?.vibrate?.(createHFXVibratePattern(vibrations, defaultIntensity));
    }

    if (!support.supported || debug || playAudio) {
      this.ensureDOM(mergedOptions);
      if (!this.hapticLabel) return;

      if (playAudio) {
        try { await this.ensureAudio(mergedOptions); }
        catch (error) { if (this.disposed || epoch !== this.epoch) return; throw error; }
      }
      if (this.disposed || epoch !== this.epoch) return;

      this.stopPattern(mergedOptions);

      const firstDelay = vibrations[0]?.delay ?? 0;
      let firstClickFired = firstDelay === 0;

      if (firstClickFired) {
        if (this.vibrationEnabled) this.hapticLabel.click();
        if (playAudio) this.playClick(clamp(vibrations[0]?.intensity ?? defaultIntensity, 0, 1));
      }

      await this.runPattern(vibrations, defaultIntensity, firstClickFired, playAudio, mergedOptions);
    }
  }

  private effectiveEnvelope(event: NonNullable<BrowserHapticsAdapter["structuredEvent"]>) {
    const result = { ...event.envelope };
    for (const key of ["attackTime", "decayTime", "releaseTime"] as const) result[key] = Math.max(0, Math.min(1, (event.envelope?.[key] ?? 0) + (this.envelopeControls[key] ?? 0)));
    return result;
  }
  playStructuredEvent(event: HFXHapticEvent, offset = 0, rate = 1, originalDuration = event.duration ?? 0.008) {
    if (this.envelopeTimer !== null) clearInterval(this.envelopeTimer); this.envelopeTimer = null;
    const envelope = event.attackTime !== undefined || event.decayTime !== undefined || event.releaseTime !== undefined || event.sustained !== undefined || Object.values(this.envelopeControls).some(value => value !== 0) ? { attackTime: event.attackTime, decayTime: event.decayTime, releaseTime: event.releaseTime, sustained: event.sustained } : null;
    const duration = ((event.duration ?? 0.008) + (envelope && event.sustained !== false ? event.releaseTime ?? 0 : 0) / rate) * 1000, intensity = event.intensity ?? 0.5;
    const structured = { start: performance.now(), duration, intensity, baseDuration: originalDuration, envelope, offset, rate }; this.structuredEvent = structured;
    const gain = envelope ? AUFXAudioEnvelope.valueAt(offset, originalDuration, this.effectiveEnvelope(structured)) : 1;
    void this.trigger([{ duration: envelope ? Math.min(16, duration) : duration, intensity: intensity * this.dynamicIntensity * gain }], { audio: false });
    if (envelope) this.envelopeTimer = setInterval(() => this.applyDynamicParameters([]), 16);
  }
  applyDynamicParameters(parameters: readonly HFXHapticDynamicParameter[]) {
    for (const parameter of parameters) {
      if (parameter.parameterID === "intensity") this.dynamicIntensity = parameter.value;
      const key = parameter.parameterID === "hapticAttackTime" ? "attackTime" : parameter.parameterID === "hapticDecayTime" ? "decayTime" : parameter.parameterID === "hapticReleaseTime" ? "releaseTime" : null;
      if (key) this.envelopeControls[key] = parameter.value;
    }
    const event = this.structuredEvent;
    if (!event || !this.vibrationEnabled || this.disposed) return;
    if (!event.envelope && Object.values(this.envelopeControls).some(value => value !== 0)) { event.envelope = {}; this.envelopeTimer = setInterval(() => this.applyDynamicParameters([]), 16); }
    const elapsed = performance.now() - event.start, effective = this.effectiveEnvelope(event);
    const total = event.envelope ? Math.max(0, event.baseDuration + (effective.sustained !== false ? effective.releaseTime ?? 0 : 0) - event.offset) / event.rate * 1000 : event.duration;
    const remaining = Math.max(0, total - elapsed);
    if (!remaining) { this.structuredEvent = null; if (this.envelopeTimer !== null) clearInterval(this.envelopeTimer); this.envelopeTimer = null; return; }
    const gain = event.envelope ? AUFXAudioEnvelope.valueAt(event.offset + elapsed / 1000 * event.rate, event.baseDuration, effective) : 1;
    // Timing-only PWM approximation: never report independent actuator amplitude or sharpness.
    getTargetNavigator(this.options)?.vibrate?.(createHFXVibratePattern([{ duration: event.envelope ? Math.min(16, remaining) : remaining, intensity: event.intensity * this.dynamicIntensity * gain }], 0.5));
  }
  cancel(options: Pick<HFXFeedbackOptions, "navigator" | "cancelAnimationFrame"> = {}) {
    this.epoch++;
    this.structuredEvent = null;
    if (this.envelopeTimer !== null) clearInterval(this.envelopeTimer); this.envelopeTimer = null; this.envelopeControls = {};
    this.dynamicIntensity = 1;
    const mergedOptions = { ...this.options, ...options };
    this.stopPattern(mergedOptions);
    getTargetNavigator(mergedOptions)?.vibrate?.(0);
  }

  destroy(options: Pick<HFXFeedbackOptions, "cancelAnimationFrame"> = {}) {
    this.disposed = true;
    if (this.envelopeTimer !== null) clearInterval(this.envelopeTimer); this.envelopeTimer = null; this.structuredEvent = null;
    this.epoch++;
    this.stopPattern({ ...this.options, ...options });

    if (this.hapticLabel) {
      this.hapticLabel.remove();
      this.hapticLabel = null;
      this.domInitialized = false;
    }

  }

  setDebug(debug: boolean) {
    this.debug = debug;
  }

  setShowSwitch(show: boolean) {
    this.showSwitch = show;
    if (this.hapticLabel) {
      const checkbox = this.hapticLabel.querySelector("input");
      this.hapticLabel.style.display = show ? "" : "none";
      if (checkbox) checkbox.style.display = show ? "" : "none";
    }
  }

  setAudioMode(audio: HFXFeedbackAudioMode) {
    this.audioMode = audio;
  }

  setButtonSoundEnabled(enabled: boolean) {
    this.buttonSoundEnabled = enabled;
  }

  setMasterVolume(volume: number) {
    this.feedbackBus.setMasterVolume(volume);
  }

  setVibrationEnabled(enabled: boolean) {
    this.vibrationEnabled = enabled;
    if (!enabled) this.cancel();
  }

  getVibrationEnabled() { return this.vibrationEnabled; }

  getButtonSoundEnabled() {
    return this.buttonSoundEnabled;
  }

  private stopPattern(options: Pick<HFXFeedbackOptions, "cancelAnimationFrame"> = {}) {
    if (this.rafId !== null) {
      const cancelRaf = options.cancelAnimationFrame ?? this.options.cancelAnimationFrame ?? getDefaultCancelAnimationFrame();
      cancelRaf(this.rafId);
      this.rafId = null;
    }
    this.patternResolve?.();
    this.patternResolve = null;
  }

  private runPattern(
    vibrations: readonly HFXFeedbackVibration[],
    defaultIntensity: number,
    firstClickFired: boolean,
    playAudio: boolean,
    options: HFXFeedbackOptions
  ): Promise<void> {
    return new Promise((resolve) => {
      this.patternResolve = resolve;

      const phases: Array<{ end: number; isOn: boolean; intensity: number }> = [];
      let cumulative = 0;

      for (const vibration of vibrations) {
        const intensity = clamp(vibration.intensity ?? defaultIntensity, 0, 1);
        const delay = vibration.delay ?? 0;
        if (delay > 0) {
          cumulative += delay;
          phases.push({ end: cumulative, isOn: false, intensity: 0 });
        }
        cumulative += vibration.duration;
        phases.push({ end: cumulative, isOn: true, intensity });
      }

      const totalDuration = cumulative;
      let startTime = 0;
      let lastToggleTime = -1;
      const requestRaf = options.requestAnimationFrame ?? this.options.requestAnimationFrame ?? getDefaultRequestAnimationFrame();

      const loop = (time: number) => {
        if (startTime === 0) startTime = time;
        const elapsed = time - startTime;

        if (elapsed >= totalDuration) {
          this.rafId = null;
          this.patternResolve = null;
          resolve();
          return;
        }

        let phase = phases[0];
        for (const candidate of phases) {
          if (elapsed < candidate.end) {
            phase = candidate;
            break;
          }
        }

        if (phase?.isOn) {
          const toggleInterval = TOGGLE_MIN_MS + (1 - phase.intensity) * TOGGLE_MAX_MS;

          if (lastToggleTime === -1) {
            lastToggleTime = time;
            if (!firstClickFired) {
              if (this.vibrationEnabled) this.hapticLabel?.click();
              if (playAudio) this.playClick(phase.intensity);
              firstClickFired = true;
            }
          } else if (time - lastToggleTime >= toggleInterval) {
            if (this.vibrationEnabled) this.hapticLabel?.click();
            if (playAudio) this.playClick(phase.intensity);
            lastToggleTime = time;
          }
        }

        this.rafId = requestRaf(loop);
      };

      this.rafId = requestRaf(loop);
    });
  }

  private playClick(intensity: number) { this.feedbackBus.playClick(intensity); }
  private ensureAudio(_options: unknown) { return this.feedbackBus.prepare(); }

  private ensureDOM(options: Pick<HFXFeedbackOptions, "document">) {
    if (this.domInitialized) return;
    const targetDocument = getTargetDocument(options);
    if (!targetDocument) return;

    const id = `nse-haptics-${this.instanceId}`;

    const hapticLabel = targetDocument.createElement("label");
    hapticLabel.setAttribute("for", id);
    hapticLabel.textContent = "Haptic feedback";
    hapticLabel.style.position = "fixed";
    hapticLabel.style.bottom = "10px";
    hapticLabel.style.left = "10px";
    hapticLabel.style.padding = "5px 10px";
    hapticLabel.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    hapticLabel.style.color = "white";
    hapticLabel.style.fontFamily = "sans-serif";
    hapticLabel.style.fontSize = "14px";
    hapticLabel.style.borderRadius = "4px";
    hapticLabel.style.zIndex = "9999";
    hapticLabel.style.userSelect = "none";
    this.hapticLabel = hapticLabel;

    const hapticCheckbox = targetDocument.createElement("input");
    hapticCheckbox.type = "checkbox";
    hapticCheckbox.setAttribute("switch", "");
    hapticCheckbox.id = id;
    hapticCheckbox.style.all = "initial";
    hapticCheckbox.style.appearance = "auto";

    if (!this.showSwitch) {
      hapticLabel.style.display = "none";
      hapticCheckbox.style.display = "none";
    }

    hapticLabel.appendChild(hapticCheckbox);
    targetDocument.body.appendChild(hapticLabel);
    this.domInitialized = true;
  }
}

let instanceCounter = 0;

