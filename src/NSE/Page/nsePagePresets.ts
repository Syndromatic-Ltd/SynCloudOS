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
  NSEPageMaterialPreset,
  NSEPageMotionPreset,
  NSEPagePreset,
  NSEPagePresetName,
  NSEPagePresetOverrides
} from "./nsePageTypes";

export const nsePageMaterialPresets = {
  paper: {
    background: "linear-gradient(135deg, #fffdf5 0%, #f6f1e3 58%, #ede4cf 100%)",
    backBackground: "linear-gradient(135deg, #f8f4e8 0%, #e8dfc8 100%)",
    insideBackground: "linear-gradient(180deg, rgba(245,248,252,0.96), rgba(222,230,240,0.98))",
    colour: "#1e2733",
    radius: "14px",
    thicknessPx: 1.4,
    shadowColour: "rgba(15, 22, 32, 0.48)",
    highlightColour: "rgba(255, 255, 255, 0.72)",
    edgeColour: "rgba(115, 99, 72, 0.34)",
    grainOpacity: 0.24
  },
  screenPaper: {
    background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(233,239,246,0.96))",
    backBackground: "linear-gradient(135deg, rgba(240,246,252,0.97), rgba(215,224,235,0.97))",
    insideBackground: "linear-gradient(180deg, rgba(18,24,33,0.95), rgba(37,48,64,0.96))",
    colour: "#121923",
    radius: "18px",
    thicknessPx: 1,
    shadowColour: "rgba(0, 0, 0, 0.42)",
    highlightColour: "rgba(255, 255, 255, 0.76)",
    edgeColour: "rgba(120, 140, 160, 0.34)",
    grainOpacity: 0.11
  },
  card: {
    background: "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(226,232,240,0.94))",
    backBackground: "linear-gradient(145deg, rgba(229,236,245,0.98), rgba(202,213,226,0.98))",
    insideBackground: "linear-gradient(145deg, rgba(244,247,251,0.96), rgba(218,226,237,0.96))",
    colour: "#17202c",
    radius: "22px",
    thicknessPx: 2,
    shadowColour: "rgba(3, 9, 18, 0.46)",
    highlightColour: "rgba(255, 255, 255, 0.68)",
    edgeColour: "rgba(93, 110, 129, 0.28)",
    grainOpacity: 0.08
  },
  bookPaper: {
    background: "#fffdf7",
    backBackground: "linear-gradient(90deg, #e8dfcc 0%, #f7f1e4 7%, #fffaf0 100%)",
    insideBackground: "#fffdf7",
    colour: "#1e2733",
    radius: "0px",
    thicknessPx: 0.8,
    shadowColour: "rgba(35, 24, 13, 0.46)",
    highlightColour: "rgba(255, 255, 255, 0.62)",
    edgeColour: "rgba(112, 91, 61, 0.3)",
    grainOpacity: 0.08
  }
} satisfies Record<string, NSEPageMaterialPreset>;

const standardMotion: NSEPageMotionPreset = {
  durationMs: 720,
  reducedDurationMs: 120,
  easing: "cubic-bezier(.2,.86,.22,1)",
  maxAngle: 178,
  perspective: 1200,
  liftPx: 18,
  curlStrength: 0.72,
  shadowStrength: 0.52,
  revealThreshold: 0.62
};

export const nsePagePresets = {
  nseSheet: {
    name: "nseSheet",
    mode: "peel",
    edge: "bottom",
    direction: "forward",
    className: "nse-page-preset-sheet",
    motion: {
      ...standardMotion,
      durationMs: 640,
      maxAngle: 108,
      perspective: 980,
      liftPx: 12,
      shadowStrength: 0.42,
      revealThreshold: 0.48
    },
    material: nsePageMaterialPresets.screenPaper,
    interaction: {
      snapThreshold: 0.42,
      velocityThreshold: 0.24,
      edgeActivationSize: 72,
      preventScroll: true,
      haptics: true
    }
  },
  paperTurn: {
    name: "paperTurn",
    mode: "turn",
    edge: "right",
    direction: "forward",
    className: "nse-page-preset-paper-turn",
    motion: standardMotion,
    material: nsePageMaterialPresets.paper,
    interaction: {
      snapThreshold: 0.5,
      velocityThreshold: 0.28,
      edgeActivationSize: 64,
      preventScroll: true,
      haptics: true
    }
  },
  bookTurn: {
    name: "bookTurn",
    mode: "turn",
    edge: "right",
    direction: "forward",
    className: "nse-page-preset-book-turn",
    motion: {
      ...standardMotion,
      durationMs: 760,
      maxAngle: 180,
      perspective: 1400,
      liftPx: 0,
      shadowStrength: 0.58,
      revealThreshold: 1,
      hinge: "opposite-edge",
      projection: "spread",
      rollWidth: 0.28
    },
    material: nsePageMaterialPresets.bookPaper,
    interaction: {
      snapThreshold: 0.5,
      velocityThreshold: 0.26,
      edgeActivationSize: 72,
      preventScroll: true,
      haptics: true
    }
  },
  bookCurl: {
    name: "bookCurl", mode: "curl", edge: "right", direction: "forward",
    className: "nse-page-preset-book-curl",
    motion: { ...standardMotion, durationMs: 560, curlPath: "book", projection: "spread", restProgress: 0, peekDelta: 0.025, revealThreshold: 1, shadowStrength: 0.22, curlRadiusMinPx: 2, curlRadiusMaxPx: 24 },
    material: nsePageMaterialPresets.bookPaper,
    interaction: { snapThreshold: 0.42, openProgress: 1, velocityThreshold: 0.26, edgeActivationSize: 72, preventScroll: true, haptics: false, dogEar: true, dogEarSizePx: 72 }
  },
  settingsPeel: {
    name: "settingsPeel",
    mode: "curl",
    edge: "bottom",
    corner: "bottom-right",
    direction: "forward",
    className: "nse-page-preset-settings-peel",
    motion: {
      ...standardMotion,
      durationMs: 620,
      maxAngle: 74,
      perspective: 1120,
      liftPx: 18,
      curlStrength: 0.94,
      shadowStrength: 0.58,
      revealThreshold: 0.16,
      curlRadiusMinPx: 26,
      curlRadiusMaxPx: 78,
      restProgress: 0.035,
      peekDelta: 0.03
    },
    material: nsePageMaterialPresets.screenPaper,
    interaction: {
      snapThreshold: 0.16,
      openProgress: 0.5,
      velocityThreshold: 0.2,
      edgeActivationSize: 104,
      preventScroll: true,
      haptics: true,
      dogEar: true,
      dogEarSizePx: 56
    }
  },
  insideReveal: {
    name: "insideReveal",
    mode: "turn",
    edge: "left",
    direction: "backward",
    className: "nse-page-preset-inside-reveal",
    motion: {
      ...standardMotion,
      durationMs: 680,
      maxAngle: 156,
      perspective: 1080,
      liftPx: 14,
      revealThreshold: 0.5
    },
    material: nsePageMaterialPresets.screenPaper,
    interaction: {
      snapThreshold: 0.45,
      velocityThreshold: 0.24,
      edgeActivationSize: 72,
      preventScroll: true,
      haptics: true
    }
  },
  tearAway: {
    name: "tearAway",
    mode: "tear",
    // The edge the sheet is bound along; it is torn from its far right corner.
    edge: "top",
    corner: "bottom-right",
    direction: "forward",
    className: "nse-page-preset-tear-away",
    motion: {
      ...standardMotion,
      durationMs: 900,
      perspective: 1600,
      liftPx: 0,
      curlStrength: 0.9,
      shadowStrength: 0.4,
      revealThreshold: 0.6
    },
    material: nsePageMaterialPresets.paper,
    interaction: {
      // Let go once the corner has come well over, and the sheet tears away;
      // a rip once opened never settles back.
      snapThreshold: 0.3,
      velocityThreshold: 0.34,
      edgeActivationSize: 76,
      preventScroll: true,
      haptics: true
    }
  },
  cardFlip: {
    name: "cardFlip",
    mode: "flip",
    edge: "right",
    direction: "forward",
    className: "nse-page-preset-card-flip",
    motion: {
      ...standardMotion,
      durationMs: 520,
      maxAngle: 180,
      perspective: 1000,
      liftPx: 8,
      shadowStrength: 0.34,
      revealThreshold: 0.5
    },
    material: nsePageMaterialPresets.card,
    interaction: {
      snapThreshold: 0.5,
      velocityThreshold: 0.22,
      edgeActivationSize: 56,
      preventScroll: false,
      haptics: true
    }
  }
} satisfies Record<NSEPagePresetName, NSEPagePreset>;

export function getNSEPagePreset(
  nameOrPreset: NSEPagePresetName | NSEPagePreset = "paperTurn",
  overrides: NSEPagePresetOverrides = {}
): NSEPagePreset {
  const preset = typeof nameOrPreset === "string" ? nsePagePresets[nameOrPreset] : nameOrPreset;
  return {
    ...preset,
    ...overrides,
    corner: overrides.corner ?? ("corner" in preset ? preset.corner : undefined),
    motion: {
      ...preset.motion,
      ...overrides.motion
    },
    material: {
      ...preset.material,
      ...overrides.material
    },
    interaction: {
      ...preset.interaction,
      ...overrides.interaction
    },
    className: [preset.className, overrides.className].filter(Boolean).join(" ")
  };
}
