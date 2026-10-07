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

/**
 * What the placard still loads as raster.
 *
 * The plate itself no longer appears here: its source art is a pure angle
 * gradient and is now the measured conic in loginPlate.css, and its concentric
 * texture has been cropped to the 106KB region the mockup laid over the plate.
 *
 * What is left is genuine photography-grade hardware: rope, tack, grommets, the
 * ribbon and the embossed mark. None of those is a shape a gradient can state.
 */
export const loginWindowAssets = {
  betaRibbon: new URL("../../../../public/assets/nse/atmo/shell/login-window/BETAbanner-topRight@2x.png?no-inline", import.meta.url).href,
  checkboxChecked: new URL("../../../../public/assets/nse/atmo/shell/login-window/checkboxChecked@2x.png?no-inline", import.meta.url).href,
  checkboxUnchecked: new URL("../../../../public/assets/nse/atmo/shell/login-window/checkboxUnchecked@2x.png?no-inline", import.meta.url).href,
  /** The cropped plate texture, referenced from loginPlate.css. */
  plateTexture: new URL("../../../../public/assets/nse/atmo/shell/login-window/generated/plate-texture.webp?no-inline", import.meta.url).href,
  logo: new URL("../../../../public/assets/nse/atmo/shell/login-window/EmbossedSynMarksmanLogoMetalFX.png?no-inline", import.meta.url).href,
  tackTransparent: new URL("../../../../public/assets/nse/atmo/shell/login-window/HangElements/PinElements/TackTransparent.png?no-inline", import.meta.url).href,
  tackWhite: new URL("../../../../public/assets/nse/atmo/shell/login-window/HangElements/PinElements/TackWhite.png?no-inline", import.meta.url).href,
  ringLeft: new URL("../../../../public/assets/nse/atmo/shell/login-window/HangElements/RingEdge/left.png?no-inline", import.meta.url).href,
  ringRight: new URL("../../../../public/assets/nse/atmo/shell/login-window/HangElements/RingEdge/right.png?no-inline", import.meta.url).href,
  ropeLeft: new URL("../../../../public/assets/nse/atmo/shell/login-window/HangElements/Rope/RopeLeft.png?no-inline", import.meta.url).href,
  ropeRight: new URL("../../../../public/assets/nse/atmo/shell/login-window/HangElements/Rope/RopeRight.png?no-inline", import.meta.url).href,
  ropeShadow: new URL("../../../../public/assets/nse/atmo/shell/login-window/HangElements/Rope/rope shadow MERGED.png?no-inline", import.meta.url).href
} as const;
