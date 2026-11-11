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
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Folder-derived SynWare project rules. One implementation serves the Vite
 * plugin (generated project module), the static validator and the developer
 * MCP, so every tool derives the same manifest from the same folder.
 *
 * The module is plain ESM with no Node or browser dependencies: the plugin
 * imports it at build time and the generated project module imports it in the
 * page.
 */

import { normalizeBundleIdentifier } from "../../src/SynCloudOS/Identity/bundleIdentifier.mjs";

const appSuffixPattern = /\.app$/iu;
const preferencePaneSuffixPattern = /\.prefpane$/iu;
const widgetSuffixPattern = /\.widget$/iu;
const integrationSuffixPattern = /\.integration\.tsx?$/iu;
const resourceIcons = Object.freeze(["./Resources/AppIcon.svg", "./Resources/AppIcon.png"]);


export function isApplicationFolderName(name) {
  return appSuffixPattern.test(String(name));
}

export function isPreferencePaneFolderName(name) {
  return preferencePaneSuffixPattern.test(String(name));
}

export function isWidgetFolderName(name) {
  return widgetSuffixPattern.test(String(name));
}

export function isIntegrationFileName(name) {
  return integrationSuffixPattern.test(String(name));
}

/** `Billing.prefPane` -> `Billing`, `Latest.widget` -> `Latest`. */
export function trimKindSuffix(name) {
  return String(name)
    .replace(preferencePaneSuffixPattern, "")
    .replace(widgetSuffixPattern, "");
}

/**
 * Split a folder name into words without breaking runs of capitals:
 * `JournalPublisher` -> `journal-publisher`, `NSEControlGallery` ->
 * `nse-control-gallery`, `AnimationFX` -> `animation-fx`.
 */
export function kebabCase(value) {
  return String(value)
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1-$2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1-$2")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
}

/** `JournalPublisher` -> `Journal Publisher`; existing capitals are kept. */
export function titleFromFolderName(folderName) {
  const words = String(folderName)
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/[^A-Za-z0-9]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/** Stable contribution ID for `Journal.integration.ts` -> `journal`. */
export function integrationIdFromFileName(fileName) {
  return kebabCase(String(fileName).replace(integrationSuffixPattern, ""));
}

/** The default icon a bundle folder supplies, as a resource path the host resolves. */
export function applicationIconResource(resourceUrls) {
  if (!resourceUrls) return undefined;
  const keys = Object.keys(resourceUrls);
  for (const candidate of resourceIcons) {
    const match = keys.find((key) => key.toLowerCase() === candidate.toLowerCase());
    if (match !== undefined) return match;
  }
  return undefined;
}

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Resolve a bundle's explicit Info identity and discovered plumbing.
 * @param {Readonly<{folderName: string, info: Record<string, unknown>, resourceUrls?: Readonly<Record<string, string>>}>} input
 */
export function deriveSynWareManifest(input) {
  const { folderName, info, resourceUrls } = input ?? {};
  if (typeof folderName !== "string" || !folderName.trim()) throw new TypeError("A SynWare manifest needs its bundle folder name.");
  if (!isPlainObject(info)) throw new TypeError(`${folderName}/Contents/Info.ts is required and must default-export a plain manifest object.`);
  for (const key of ["bundleIdentifier", "displayName", "version"]) {
    if (typeof info[key] !== "string" || !info[key].trim()) throw new TypeError(`${folderName}/Contents/Info.ts requires ${key}.`);
  }
  if (Object.hasOwn(info, "localeResources")) {
    throw new TypeError(`${folderName} Info.ts must not declare localeResources; every Resources/Localised/<locale>.locale/*.strings file is discovered.`);
  }
  const webspringInput = isPlainObject(info.webspring) ? info.webspring : undefined;
  const icon = webspringInput?.icon ?? applicationIconResource(resourceUrls);
  const manifest = { ...info, schemaVersion: Object.hasOwn(info, "schemaVersion") ? info.schemaVersion : 1 };
  const webspring = { ...(icon === undefined ? {} : { icon }), ...(webspringInput ?? {}) };
  if (Object.keys(webspring).length > 0) manifest.webspring = webspring;
  else delete manifest.webspring;
  return Object.freeze(manifest);
}

/** `SYNCLOUDOS_APPLICATIONS=a,b` or `synCloudOS({ applications })` -> IDs, or null for "every application". */
export function parseApplicationSelection(value, label = "applications") {
  if (value === undefined || value === null) return null;
  const list = typeof value === "string" ? (value.trim() === "" ? [] : value.split(",").map((id) => id.trim())) : value;
  if (!Array.isArray(list)) throw new TypeError(`SynCloudOS ${label} must be an array of application IDs or a comma-separated string.`);
  const selected = [];
  const seen = new Set();
  for (const id of list) {
    if (typeof id !== "string" || !id.trim()) throw new TypeError(`SynCloudOS ${label} must list non-empty application IDs.`);
    const trimmed = id.trim();
    const key = normalizeBundleIdentifier(trimmed);
    if (seen.has(key)) throw new TypeError(`SynCloudOS ${label} lists ${trimmed} twice.`);
    seen.add(key);
    selected.push(trimmed);
  }
  return Object.freeze(selected);
}

/** Reject duplicate identities before selection, including case-only duplicates. */
export function assertUniqueBundleIdentifiers(bundles) {
  const seen = new Map();
  for (const bundle of bundles) {
    const identifier = bundle.manifest.bundleIdentifier;
    const key = normalizeBundleIdentifier(identifier);
    if (seen.has(key)) throw new TypeError(`Duplicate bundleIdentifier ${identifier} in ${bundle.name ?? bundle.directory ?? "application"}; already declared by ${seen.get(key)}.`);
    seen.set(key, bundle.name ?? bundle.directory ?? identifier);
  }
}

/**
 * The bundles a build serves: `applications` names the only applications, and
 * development-only applications leave a production build.
 */
export function selectProjectBundles(bundles, options = {}) {
  const { applications = null, development = true } = options;
  assertUniqueBundleIdentifiers(bundles);
  const known = bundles.map(bundle => bundle.manifest.bundleIdentifier);
  const knownKeys = new Set(known.map(normalizeBundleIdentifier));
  if (applications) {
    const unknown = applications.filter((id) => !knownKeys.has(normalizeBundleIdentifier(id)));
    if (unknown.length > 0) {
      throw new TypeError(`SynCloudOS does not know bundleIdentifier(s) ${unknown.join(", ")}. This project provides: ${known.join(", ")}.`);
    }
    const selected = new Set(applications.map(normalizeBundleIdentifier));
    bundles = bundles.filter((bundle) => selected.has(normalizeBundleIdentifier(bundle.manifest.bundleIdentifier)));
  }
  if (development) return Object.freeze([...bundles]);
  return Object.freeze(bundles.filter((bundle) => bundle.manifest.availability !== "development"));
}

/** Integrations whose owners are all excluded are dropped with the applications they extend. */
export function selectProjectIntegrations(integrations, applications = null) {
  if (!applications) return Object.freeze([...integrations]);
  const selected = new Set(applications.map(normalizeBundleIdentifier));
  return Object.freeze(integrations.filter((integration) => {
    const owners = integration?.owners;
    return Array.isArray(owners) && owners.some((owner) => selected.has(normalizeBundleIdentifier(owner)));
  }));
}
