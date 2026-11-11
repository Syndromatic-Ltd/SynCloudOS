/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Atmo's stylesheets as the framework loads them: control structure, then every file of Atmo.scostheme in theme.css order.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const bundle = "src/Themes/Atmo.scostheme/Contents/Resources/";
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n?/gu, "\n");

/** Atmo.scostheme's stylesheets, in the order theme.css imports them. */
export const atmoBundleFiles: readonly string[] = Object.freeze([...read(bundle + "theme.css").matchAll(/@import "\.\/([^"]+)";/gu)].map(match => bundle + match[1]));
/** The control structure every theme draws over. */
export const atmoStructureFile = "src/NSE/Structure/controls.css";
/** Atmo's paint: every bundle stylesheet, joined in load order. */
export const atmoPaintCSS = (): string => atmoBundleFiles.map(read).join("\n");
/** Atmo's bundle files whose names start with atmo-structure: the structure-adjacent paint (metrics, frames). */
export const atmoStructurePaintCSS = (): string => atmoBundleFiles.filter(file => file.includes("/atmo-structure.")).map(read).join("\n");
/** Everything Atmo loads: structure, then paint. */
export const atmoCSS = (): string => [read(atmoStructureFile), atmoPaintCSS()].join("\n");
