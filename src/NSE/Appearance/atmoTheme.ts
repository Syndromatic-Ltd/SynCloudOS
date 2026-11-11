/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Atmo, the built-in theme, as an NSETheme: identity from Atmo.scostheme's Info.ts, colours, navigation, presentation
// and images from its Theme.json. Image paths in Theme.json resolve to URLs here, one static URL per file.
import { freezeNSETheme, type NSETheme, type NSEThemeImage } from "../Theme/NSETheme";
import info from "../../Themes/Atmo.scostheme/Contents/Info";
import definition from "../../Themes/Atmo.scostheme/Contents/Theme.json";

const files: Readonly<Record<string, string>> = {
  "Resources/navigation-back.svg": new URL("../../Themes/Atmo.scostheme/Contents/Resources/navigation-back.svg", import.meta.url).href,
  "Resources/navigation-forward.svg": new URL("../../Themes/Atmo.scostheme/Contents/Resources/navigation-forward.svg", import.meta.url).href,
  "Resources/workspace/document-generic-24.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/document-generic-24.png", import.meta.url).href,
  "Resources/workspace/document-generic-24@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/document-generic-24@2x.png", import.meta.url).href,
  "Resources/workspace/document-generic-48.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/document-generic-48.png", import.meta.url).href,
  "Resources/workspace/document-generic-48@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/document-generic-48@2x.png", import.meta.url).href,
  "Resources/workspace/document-generic-96.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/document-generic-96.png", import.meta.url).href,
  "Resources/workspace/document-generic-96@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/document-generic-96@2x.png", import.meta.url).href,
  "Resources/workspace/folder-documents-24.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-documents-24.png", import.meta.url).href,
  "Resources/workspace/folder-documents-24@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-documents-24@2x.png", import.meta.url).href,
  "Resources/workspace/folder-documents-48.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-documents-48.png", import.meta.url).href,
  "Resources/workspace/folder-documents-48@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-documents-48@2x.png", import.meta.url).href,
  "Resources/workspace/folder-documents-96.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-documents-96.png", import.meta.url).href,
  "Resources/workspace/folder-documents-96@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-documents-96@2x.png", import.meta.url).href,
  "Resources/workspace/folder-downloads-24.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-downloads-24.png", import.meta.url).href,
  "Resources/workspace/folder-downloads-24@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-downloads-24@2x.png", import.meta.url).href,
  "Resources/workspace/folder-downloads-48.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-downloads-48.png", import.meta.url).href,
  "Resources/workspace/folder-downloads-48@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-downloads-48@2x.png", import.meta.url).href,
  "Resources/workspace/folder-downloads-96.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-downloads-96.png", import.meta.url).href,
  "Resources/workspace/folder-downloads-96@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-downloads-96@2x.png", import.meta.url).href,
  "Resources/workspace/folder-music-24.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-music-24.png", import.meta.url).href,
  "Resources/workspace/folder-music-24@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-music-24@2x.png", import.meta.url).href,
  "Resources/workspace/folder-music-48.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-music-48.png", import.meta.url).href,
  "Resources/workspace/folder-music-48@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-music-48@2x.png", import.meta.url).href,
  "Resources/workspace/folder-music-96.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-music-96.png", import.meta.url).href,
  "Resources/workspace/folder-music-96@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-music-96@2x.png", import.meta.url).href,
  "Resources/workspace/folder-ordinary-24.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-ordinary-24.png", import.meta.url).href,
  "Resources/workspace/folder-ordinary-24@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-ordinary-24@2x.png", import.meta.url).href,
  "Resources/workspace/folder-ordinary-48.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-ordinary-48.png", import.meta.url).href,
  "Resources/workspace/folder-ordinary-48@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-ordinary-48@2x.png", import.meta.url).href,
  "Resources/workspace/folder-ordinary-96.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-ordinary-96.png", import.meta.url).href,
  "Resources/workspace/folder-ordinary-96@2x.png": new URL("../../Themes/Atmo.scostheme/Contents/Resources/workspace/folder-ordinary-96@2x.png", import.meta.url).href,
};

const images = Object.fromEntries(Object.entries(definition.images as Record<string, NSEThemeImage>).map(([name, image]) =>
  [name, { ...image, files: Object.fromEntries(Object.entries(image.files).map(([scale, path]) => [scale, files[path]!])) as NSEThemeImage["files"] }]));

export const atmoTheme: NSETheme = freezeNSETheme({
  bundleIdentifier: info.bundleIdentifier, displayName: info.displayName, version: info.version,
  colours: definition.colours as NSETheme["colours"],
  navigation: definition.navigation as NSETheme["navigation"],
  presentation: definition.presentation as NSETheme["presentation"],
  images,
});
