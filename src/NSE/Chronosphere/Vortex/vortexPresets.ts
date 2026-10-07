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
  VortexPreset,
  VortexPresetInput,
  VortexPresetName,
  VortexPresetOverride,
  VortexTimeline
} from "./vortexTypes";

/*
 * The intro envelopes create a warm ignition followed by a teal spiral:
 *   - warm core ignition ~0.5s, teal spiral spins up by ~3s, then slow drift;
 *   - centred pinwheel ~40-45% of frame height over a dark teal nebula + stars.
 */

/** Shared *Timelines – Super Nova* intro envelopes. */
const SUPER_NOVA_TIMELINE: VortexTimeline = {
  haloAlpha: [
    { t: 0.0, v: 1.0 },
    { t: 0.15, v: 1.0 },
    { t: 1.92, v: 0.0 }
  ],
  sunAlpha: [
    { t: 0.0, v: 0.0 },
    { t: 0.5, v: 0.55 },
    { t: 1.9, v: 1.0 }
  ],
  vortexDt: [
    { t: 0.0, v: 0.1 },
    { t: 0.29, v: 1.147 },
    { t: 2.32, v: 0.1018 }
  ],
  starsDt: [
    { t: 0.0, v: 0.1 },
    { t: 0.05, v: 1.925 },
    { t: 5.41, v: 0.1018 }
  ]
};

function cloneTimeline(timeline: VortexTimeline): VortexTimeline {
  return {
    haloAlpha: timeline.haloAlpha.map((k) => ({ ...k })),
    sunAlpha: timeline.sunAlpha.map((k) => ({ ...k })),
    vortexDt: timeline.vortexDt.map((k) => ({ ...k })),
    starsDt: timeline.starsDt.map((k) => ({ ...k }))
  };
}

const screensaver: VortexPreset = {
  id: "screensaver",
  description: "Centred Time Machine screensaver: warm core + teal pinwheel over a star nebula.",
  mode: "screensaver",
  fadeInMs: 900,
  fadeOutMs: 700,
  staticTimeSeconds: 8,
  fboSize: 512,
  core: {
    anchorX: 0.5,
    anchorY: 0.5,
    glowRadius: 0.22,
    glowColour: [1.0, 0.84, 0.62],
    glowAlpha: 1.0,
    haloAlpha: 0.9,
    glowPulseAmplitude: 0.06,
    glowPulseSpeed: 0.7
  },
  plates: {
    nebulaAlpha: 1.0,
    nebulaScale: 1.08,
    nebulaDrift: 0.004,
    supernovaAlpha: 0.22,
    supernovaScale: 0.55
  },
  cloud: {
    count: 256,
    lifeSeconds: 2.0,
    colour: [0.314, 1.0, 0.845],
    alpha: 0.2,
    opacityDelta: -0.125,
    sizeStart: [0.05, 0.075],
    sizeGrow: 0.15,
    velocityMax: 0.5
  },
  swirl: {
    screenScale: 0.9,
    alpha: 1.0,
    angle: 18.75,
    radius: 2.0,
    power: 80.2
  },
  stars: {
    count: 1250,
    size: [0.1, 0.4],
    spread: 0.12,
    speed: 0.06,
    thruster: 0.22,
    colour: [0.9, 0.95, 1.0],
    alpha: 1.0
  },
  timeline: cloneTimeline(SUPER_NOVA_TIMELINE)
};

const chronosphere: VortexPreset = {
  ...screensaver,
  id: "chronosphere",
  description: "Upper-centre core staged behind the Chronosphere archive stack.",
  mode: "chronosphere",
  core: {
    ...screensaver.core,
    anchorY: 0.34,
    glowRadius: 0.13
  },
  plates: {
    ...screensaver.plates,
    supernovaAlpha: 0.34,
    supernovaScale: 0.7
  },
  swirl: {
    ...screensaver.swirl,
    screenScale: 0.78,
    alpha: 0.85
  },
  // Calmer, slower drift behind the archive stack than the screensaver.
  stars: {
    ...screensaver.stars,
    speed: 0.04
  },
  timeline: cloneTimeline(SUPER_NOVA_TIMELINE)
};

const reducedMotion: VortexPreset = {
  ...screensaver,
  id: "reducedMotion",
  description: "Static settled Vortex frame for reduced-motion / constrained tiers.",
  cloud: {
    ...screensaver.cloud,
    count: 160
  },
  stars: {
    ...screensaver.stars,
    count: 700
  },
  fboSize: 256,
  timeline: cloneTimeline(SUPER_NOVA_TIMELINE)
};

export const vortexPresets = {
  screensaver,
  chronosphere,
  reducedMotion
} satisfies Record<VortexPresetName, VortexPreset>;

export function resolveVortexPreset(
  preset: VortexPresetInput = "screensaver",
  override?: VortexPresetOverride
): VortexPreset {
  const base = typeof preset === "string"
    ? vortexPresets[preset] ?? vortexPresets.screensaver
    : preset;

  if (!override) {
    return { ...base, timeline: cloneTimeline(base.timeline) };
  }

  return {
    ...base,
    ...override,
    id: override.id ?? base.id,
    description: override.description ?? base.description,
    mode: override.mode ?? base.mode,
    fadeInMs: override.fadeInMs ?? base.fadeInMs,
    fadeOutMs: override.fadeOutMs ?? base.fadeOutMs,
    staticTimeSeconds: override.staticTimeSeconds ?? base.staticTimeSeconds,
    fboSize: override.fboSize ?? base.fboSize,
    core: { ...base.core, ...override.core },
    plates: { ...base.plates, ...override.plates },
    cloud: { ...base.cloud, ...override.cloud },
    swirl: { ...base.swirl, ...override.swirl },
    stars: { ...base.stars, ...override.stars },
    timeline: { ...cloneTimeline(base.timeline), ...override.timeline }
  };
}

/** Linear interpolation across a *Super Nova* track; holds the end values. */
export function sampleVortexTrack(
  track: ReadonlyArray<{ t: number; v: number }>,
  timeSeconds: number
): number {
  if (track.length === 0) return 0;
  if (timeSeconds <= track[0].t) return track[0].v;
  const last = track[track.length - 1];
  if (timeSeconds >= last.t) return last.v;

  for (let index = 1; index < track.length; index += 1) {
    const a = track[index - 1];
    const b = track[index];
    if (timeSeconds <= b.t) {
      const span = b.t - a.t;
      if (span <= 0) return b.v;
      const ratio = (timeSeconds - a.t) / span;
      return a.v + (b.v - a.v) * ratio;
    }
  }

  return last.v;
}
