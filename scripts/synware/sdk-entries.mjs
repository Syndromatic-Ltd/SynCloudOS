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

/** Canonical SynWare SDK public entry points. No source-tree wildcard aliases. */
export const synWareSdkEntries = Object.freeze({
  "index": "src/SynCloudOS/AppSDK/rootPackageEntry.ts",
  "fx/animation": "src/FX/AnimationFX/public.ts",
  "sdk/animation-host": "src/FX/AnimationFX/host.ts",
  "fx/image": "src/FX/ImageFX/public.ts",
  "fx/text": "src/FX/TextFX/public.ts",
  "fx/audio": "src/FX/AudioFX/public.ts",
  "fx/haptics": "src/FX/HapticsFX/public.ts",
  "fx/motion": "src/FX/MotionFX/public.ts",
  "fx/media": "src/FX/MediaFX/public.ts",
  "fx/video": "src/FX/VideoFX/public.ts",
  "fx/video/webm": "src/FX/VideoFX/webm.ts",
  "fx/midi": "src/FX/MIDIFX/public.ts",
  "fx/location": "src/FX/LocationFX/public.ts",
  "fx/lumina": "src/FX/LuminaFX/public.ts",
  "fx/graphics": "src/FX/GraphicsFX/public.ts",
  "sdk": "src/SynCloudOS/AppSDK/sdkPackageEntry.ts",
  "sdk/testing": "src/SynCloudOS/AppSDK/testing/sdkPackageEntry.ts",
  "server/auth": "src/SynCloudOS/Server/Auth/index.ts",
  "auth": "src/SynCloudOS/Authentication/index.ts",
  "webspring": "src/Webspring/public.ts",
  "chronosphere": "src/SynCloudOS/AppSDK/Chronosphere/public.ts",
  "browser": "src/SynCloudOSReact/browser.tsx",
  "typography": "src/NSE/Typography/public.ts",
  "nse": "src/NSE/sdkPackageEntry.ts",
  "nse/controls": "src/NSE/public/controls.ts",
  "nse/text": "src/NSE/public/text.ts",
  "nse/content": "src/NSE/public/content.ts",
  "nse/theme": "src/NSE/public/theme.ts",
  "nse/appearance": "src/NSE/public/appearance.ts",
  "nse/themes/metro": "src/NSE/Themes/Metro/index.ts",
  "nse/themes/atmo": "src/NSE/Themes/Atmo/index.ts",
  "nse/scroll": "src/NSE/public/scroll.ts",
  "nse/page": "src/NSE/public/page.ts",
  "nse/layout": "src/NSE/public/layout.ts",
  "nse/cover-flow": "src/NSE/public/cover-flow.ts",
  "nse/system-ui": "src/NSE/public/system-ui.ts",
});
export const synWareSdkStyles = Object.freeze({
  "nse/themes/metro/styles.css": "src/Themes/Metro.scostheme/Contents/styles.css",
  "nse/themes/atmo/styles.css": "src/Themes/Atmo.scostheme/Contents/styles.css",
});
export const synWareSdkGeneratedStyles = Object.freeze({
  "browser/styles.css": "browser",
  "webspring/styles.css": "webspring",
  "chronosphere/styles.css": "chronosphere",
});
export const synWarePackageName = "@syndromatic/syncloudos";
