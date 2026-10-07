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

import type { CSSProperties } from "react";
import type { VortexImages } from "./loadVortexImages";
type ColourVector = readonly [number, number, number];
type NumberRange = readonly [number, number];
export type ReducedMotionBehavior = "system" | "animate" | "static" | "off";

/** Built-in Vortex presets. */
export type VortexPresetName = "screensaver" | "chronosphere" | "reducedMotion";

/** Where the warm core / vortex centre is staged. */
export type VortexMode = "screensaver" | "chronosphere";

/** A single point on a *Timelines – Super Nova* track (time in seconds). */
export interface VortexKeyframe {
  t: number;
  v: number;
}

/**
 * Intro-burst envelopes. `haloAlpha`/`sunAlpha` drive the warm core ignition;
 * `vortexDt`/`starsDt` are time-step multipliers integrated over real time to
 * advance each system's internal clock (accelerate-then-settle).
 */
export interface VortexTimeline {
  haloAlpha: VortexKeyframe[];
  sunAlpha: VortexKeyframe[];
  vortexDt: VortexKeyframe[];
  starsDt: VortexKeyframe[];
}

export interface VortexCoreSettings {
  /** Vortex/core centre in normalized [0..1] viewport coordinates. */
  anchorX: number;
  anchorY: number;
  /** Core-glow sprite radius as a fraction of min(viewport). */
  glowRadius: number;
  glowColour: ColourVector;
  /** Settled additive alpha of the core glow. */
  glowAlpha: number;
  /** Halo flash additive alpha at intro (scaled by the haloAlpha track). */
  haloAlpha: number;
  /** ± fraction the glow radius/alpha breathes by once settled. */
  glowPulseAmplitude: number;
  /** Glow breathing speed in radians/second. */
  glowPulseSpeed: number;
}

export interface VortexPlateSettings {
  /** Base nebula plate opacity (drawn over black, normal blend). */
  nebulaAlpha: number;
  /** Cover-fit overscan multiplier (>= 1) to allow parallax drift. */
  nebulaScale: number;
  /** Parallax drift speed of the nebula UV, in UV units/second. */
  nebulaDrift: number;
  /** Additive opacity of the warm supernova plate. */
  supernovaAlpha: number;
  /** Supernova plate diameter as a fraction of min(viewport). */
  supernovaScale: number;
}

export interface VortexCloudSettings {
  /** Number of cloud particles (fidelity tier). QTZ: 256. */
  count: number;
  /** Particle lifetime in seconds. QTZ: 2.0. */
  lifeSeconds: number;
  /** Teal particle tint. QTZ: rgba(0.314, 1, 0.845, …). */
  colour: ColourVector;
  /** Base per-particle alpha at birth. QTZ inputColor.alpha: 0.2. */
  alpha: number;
  /** Per-second opacity delta over life. QTZ: -0.125. */
  opacityDelta: number;
  /** Initial sprite size range in QC units (1 unit = half the FBO). QTZ: 0.05..0.075. */
  sizeStart: NumberRange;
  /** Per-second size growth in QC units. QTZ inputSizeDelta: 0.15. */
  sizeGrow: number;
  /** Max |velocity| per axis in QC units/s (1 unit = half the FBO). QTZ: 0.5. */
  velocityMax: number;
}

export interface VortexSwirlSettings {
  /** Vortex composite diameter as a fraction of min(viewport). */
  screenScale: number;
  /** Additive opacity of the composited vortex. */
  alpha: number;
  /** Max swirl rotation (radians) applied by the spin-distortion shader. */
  angle: number;
  /** Swirl falloff radius (normalized; QTZ 1024px ≈ 2.0 in 512² space). */
  radius: number;
  /** Swirl falloff power. */
  power: number;
}

export interface VortexStarSettings {
  /** Number of stars (fidelity tier). QTZ: 2500. */
  count: number;
  /** Per-star world-size range (QTZ 0.1..0.4); on-screen px = worldSize / depth. */
  size: NumberRange;
  /** Perspective spread: screen offset = dir * spread / depth. */
  spread: number;
  /** Continuous forward (toward-camera) cruise speed, depth units/second. */
  speed: number;
  /** Camera sway amplitude in radians (QTZ Thruster Control ping-pong roll). */
  thruster: number;
  /** Star tint. */
  colour: ColourVector;
  /** Overall additive brightness. */
  alpha: number;
}

export interface VortexPreset {
  id: string;
  description?: string;
  mode: VortexMode;
  fadeInMs: number;
  fadeOutMs: number;
  /** Sim time (s) rendered for the static / reduced-motion frame. */
  staticTimeSeconds: number;
  /** Offscreen vortex framebuffer edge (px, power-of-two recommended). */
  fboSize: number;
  core: VortexCoreSettings;
  plates: VortexPlateSettings;
  cloud: VortexCloudSettings;
  swirl: VortexSwirlSettings;
  stars: VortexStarSettings;
  timeline: VortexTimeline;
}

export interface VortexTravelImpulse {
  /** Changes when a fresh impulse should fire. */
  id: string | number;
  /** "past" rushes stars outward; "present" pulls them inward toward the vortex. */
  direction: "past" | "present";
  /** Strength multiplier for speed/density. Defaults to 1. */
  intensity?: number;
  /** Length of the boost envelope. Defaults to the Chronosphere-friendly pulse. */
  durationMs?: number;
}

/** Deep-partial override accepted by `resolveVortexPreset`. */
export interface VortexPresetOverride {
  id?: string;
  description?: string;
  mode?: VortexMode;
  fadeInMs?: number;
  fadeOutMs?: number;
  staticTimeSeconds?: number;
  fboSize?: number;
  core?: Partial<VortexCoreSettings>;
  plates?: Partial<VortexPlateSettings>;
  cloud?: Partial<VortexCloudSettings>;
  swirl?: Partial<VortexSwirlSettings>;
  stars?: Partial<VortexStarSettings>;
  timeline?: Partial<VortexTimeline>;
}

export type VortexPresetInput = VortexPresetName | VortexPreset;

export interface VortexLayerProps {
  /** A presenting flow may prepare pixels before starting its entrance. */
  preparedImages?: VortexImages;
  active?: boolean;
  ariaLabel?: string;
  className?: string;
  decorative?: boolean;
  eager?: boolean;
  maxDpr?: number;
  preset?: VortexPresetInput;
  presetOverrides?: VortexPresetOverride;
  reducedMotion?: ReducedMotionBehavior;
  style?: CSSProperties;
  travelImpulse?: VortexTravelImpulse;
}
