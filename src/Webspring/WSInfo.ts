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

import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import type {
  SynWareLocalisedText,
  SynWareResourceReference,
  SynWareWebAppManifest,
  SynWareWebspringFolderManifest,
  SynWareWebspringFoldersManifest,
} from "../SynCloudOS/AppSDK";

/** Site branding declared in `WSInfo`. `name` defaults from `displayName` when omitted. */
export interface WSBranding {
  readonly name?: SynWareLocalisedText;
  readonly logo?: SynWareResourceReference;
  readonly lightLogo?: SynWareResourceReference;
  readonly darkLogo?: SynWareResourceReference;
  readonly compactLogo?: SynWareResourceReference;
  /** Single-shape SVG for the top bar's return-to-Webspring button. */
  readonly homeIcon?: SynWareResourceReference;
}

/** Validated `WSBranding` with `name` populated. */
export interface WSCapturedBranding extends WSBranding {
  readonly name: SynWareLocalisedText;
}

/** Static shell metadata authored in `src/Webspring/Contents/Info.ts`. */
export interface WSInfo {
  readonly schemaVersion?: 1;
  readonly bundleIdentifier: string;
  readonly displayName: string;
  readonly version: string;
  readonly homeRoute?: string;
  readonly branding?: WSBranding;
  readonly folders?: SynWareWebspringFoldersManifest;
  readonly webApp?: SynWareWebAppManifest;
}

/** Immutable `WSInfo` snapshot with every default filled in. */
export interface WSCapturedInfo {
  readonly schemaVersion: 1;
  readonly bundleIdentifier: string;
  readonly displayName: string;
  readonly version: string;
  readonly homeRoute: string;
  readonly branding: WSCapturedBranding;
  readonly folders: SynWareWebspringFoldersManifest;
  readonly webApp?: SynWareWebAppManifest;
}

const bundleIdentifierPattern = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}$/u;
const semverPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u;
const homeRoutePattern = /^\/(?!\/)(?!.*\/\/)(?!.*\\)[^\\]*$/u;
const rootPathPattern = /^\/(?!\/)/u;
const resourcePathPattern = /^\.\/Resources\/(?!\.\.(?:\/|$))(?!.*\/\.\.(?:\/|$))[^\\]+$/u;
const folderIdPattern = /^folder\.[a-z][a-z0-9-]*$/u;
const emptyFolders: SynWareWebspringFoldersManifest = Object.freeze({
  editable: false,
  initial: Object.freeze([]),
});
const iconPurposes = new Set(["any", "maskable", "monochrome"]);

/** @internal */
export function assertPlainRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

/** @internal */
export function assertKnownFields(input: Record<string, unknown>, label: string, known: readonly string[]): void {
  const keys = Reflect.ownKeys(input);
  for (const key of keys) {
    if (typeof key !== "string") throw new TypeError(`${label} must not contain symbol properties.`);
  }
  const extra = (keys as string[]).filter((key) => !known.includes(key));
  if (extra.length > 0) throw new TypeError(`${label} has unknown fields: ${extra.join(", ")}.`);
}

/** @internal */
export function readOwnDataProperty(target: object, key: string, required: boolean, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) {
    if (!required) return undefined;
    throw new TypeError(`${label}.${key} is required.`);
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError(`${label}.${key} must be an enumerable data property, not an accessor.`);
  }
  return descriptor.value;
}

function readIndexedDataArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)) {
      throw new TypeError(`${label} arrays may contain only indexed values.`);
    }
  }
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    items.push(readOwnDataProperty(value, String(index), true, `${label}[${index}]`));
  }
  return items;
}

function captureText(target: Record<string, unknown>, key: string, required: boolean, label: string, maxLength?: number): string | undefined {
  const value = readOwnDataProperty(target, key, required, label);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "" || (maxLength !== undefined && value.length > maxLength)) {
    throw new TypeError(`${label}.${key} must be a nonempty string.`);
  }
  return value;
}

function captureLocalisedText(raw: unknown, label: string): SynWareLocalisedText {
  assertPlainRecord(raw, label);
  assertKnownFields(raw, label, ["key", "fallback"]);
  const key = captureText(raw, "key", true, label, 256)!;
  const fallback = captureText(raw, "fallback", false, label, 1024);
  return Object.freeze({ key, ...(fallback === undefined ? {} : { fallback }) });
}

function captureResourceReference(raw: unknown, label: string): SynWareResourceReference {
  assertPlainRecord(raw, label);
  assertKnownFields(raw, label, ["resource", "alternativeText"]);
  const resource = captureText(raw, "resource", true, label)!;
  if (!resourcePathPattern.test(resource)) {
    throw new TypeError(`${label}.resource must start with ./Resources/ and contain no parent traversal.`);
  }
  const alternativeText = captureLocalisedText(
    readOwnDataProperty(raw, "alternativeText", true, label),
    `${label}.alternativeText`,
  );
  return Object.freeze({ resource, alternativeText });
}

function captureBranding(raw: unknown, displayName: string): WSCapturedBranding {
  const defaultName: SynWareLocalisedText = Object.freeze({ key: "site.name", fallback: displayName });
  if (raw === undefined) return Object.freeze({ name: defaultName });
  const label = "WSInfo branding";
  assertPlainRecord(raw, label);
  assertKnownFields(raw, label, ["name", "logo", "lightLogo", "darkLogo", "compactLogo", "homeIcon"]);
  const rawName = readOwnDataProperty(raw, "name", false, label);
  const name = rawName === undefined ? defaultName : captureLocalisedText(rawName, `${label}.name`);
  const result: {
    name: SynWareLocalisedText;
    logo?: SynWareResourceReference;
    lightLogo?: SynWareResourceReference;
    darkLogo?: SynWareResourceReference;
    compactLogo?: SynWareResourceReference;
    homeIcon?: SynWareResourceReference;
  } = { name };
  for (const key of ["logo", "lightLogo", "darkLogo", "compactLogo", "homeIcon"] as const) {
    const ref = readOwnDataProperty(raw, key, false, label);
    if (ref !== undefined) result[key] = captureResourceReference(ref, `${label}.${key}`);
  }
  return Object.freeze(result);
}

function captureFolder(raw: unknown, index: number): SynWareWebspringFolderManifest {
  const label = `WSInfo folders.initial[${index}]`;
  assertPlainRecord(raw, label);
  assertKnownFields(raw, label, ["id", "title", "order", "apps"]);
  const id = captureText(raw, "id", true, label)!;
  if (!folderIdPattern.test(id)) {
    throw new TypeError(`Webspring folder ID ${id} must begin with "folder." followed by a lowercase slug.`);
  }
  const title = captureLocalisedText(readOwnDataProperty(raw, "title", true, label), `${label}.title`);
  const order = readOwnDataProperty(raw, "order", true, label);
  if (typeof order !== "number" || !Number.isInteger(order) || order < 0) {
    throw new TypeError(`${label}.order must be a non-negative integer.`);
  }
  const rawApps = readIndexedDataArray(readOwnDataProperty(raw, "apps", true, label), `${label}.apps`);
  if (rawApps.length === 0) throw new TypeError(`${label}.apps must list at least one application identifier.`);
  const seen = new Set<string>();
  const apps: string[] = [];
  for (const entry of rawApps) {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new TypeError(`${label}.apps entries must be nonempty strings.`);
    }
    if (seen.has(entry)) throw new TypeError(`${label}.apps contains duplicate identifier ${entry}.`);
    seen.add(entry);
    apps.push(entry);
  }
  return Object.freeze({ id, title, order, apps: Object.freeze(apps) });
}

function captureFolders(raw: unknown, bundleIdentifier: string): SynWareWebspringFoldersManifest {
  if (raw === undefined) return emptyFolders;
  const label = "WSInfo folders";
  assertPlainRecord(raw, label);
  assertKnownFields(raw, label, ["editable", "initial"]);
  const editable = readOwnDataProperty(raw, "editable", true, label);
  if (typeof editable !== "boolean") throw new TypeError(`${label}.editable must be a boolean.`);
  const rawInitial = readIndexedDataArray(readOwnDataProperty(raw, "initial", true, label), `${label}.initial`);
  const initial = Object.freeze(rawInitial.map(captureFolder));
  const captured = Object.freeze({ editable, initial });
  assertWSFolders(captured, [bundleIdentifier]);
  return captured;
}

function captureWebApp(raw: unknown): SynWareWebAppManifest | undefined {
  if (raw === undefined) return undefined;
  const label = "WSInfo webApp";
  assertPlainRecord(raw, label);
  assertKnownFields(raw, label, ["scope", "startURL", "shortName", "description", "themeColour", "backgroundColour", "icons"]);
  const scope = captureText(raw, "scope", true, label)!;
  if (!rootPathPattern.test(scope)) throw new TypeError(`${label}.scope must be a root-relative path.`);
  const startURL = captureText(raw, "startURL", true, label)!;
  if (!rootPathPattern.test(startURL)) throw new TypeError(`${label}.startURL must be a root-relative path.`);
  const shortName = captureText(raw, "shortName", false, label);
  const description = captureText(raw, "description", false, label);
  const themeColour = captureText(raw, "themeColour", false, label);
  const backgroundColour = captureText(raw, "backgroundColour", false, label);
  const rawIcons = readIndexedDataArray(readOwnDataProperty(raw, "icons", true, label), `${label}.icons`);
  const icons = Object.freeze(rawIcons.map((entry, index) => {
    const iconLabel = `${label}.icons[${index}]`;
    assertPlainRecord(entry, iconLabel);
    assertKnownFields(entry, iconLabel, ["src", "sizes", "type", "purpose"]);
    const src = captureText(entry, "src", true, iconLabel)!;
    if (!rootPathPattern.test(src)) throw new TypeError(`${iconLabel}.src must be a root-relative path.`);
    const sizes = captureText(entry, "sizes", true, iconLabel)!;
    const type = captureText(entry, "type", true, iconLabel)!;
    const purpose = readOwnDataProperty(entry, "purpose", false, iconLabel);
    if (purpose !== undefined && (typeof purpose !== "string" || !iconPurposes.has(purpose))) {
      throw new TypeError(`${iconLabel}.purpose must be any, maskable or monochrome.`);
    }
    return Object.freeze({
      src,
      sizes,
      type,
      ...(purpose === undefined ? {} : { purpose: purpose as "any" | "maskable" | "monochrome" }),
    });
  }));
  return Object.freeze({
    scope,
    startURL,
    ...(shortName === undefined ? {} : { shortName }),
    ...(description === undefined ? {} : { description }),
    ...(themeColour === undefined ? {} : { themeColour }),
    ...(backgroundColour === undefined ? {} : { backgroundColour }),
    icons,
  });
}

/** Rejects duplicate folder IDs, folder-vs-app collisions and apps in more than one folder. */
export function assertWSFolders(
  folders: SynWareWebspringFoldersManifest | undefined,
  appIds: readonly string[] = [],
): void {
  if (!folders) return;
  const folderIds = new Set<string>();
  const normalizedFolderIds = new Set<string>();
  const normalizedAppIds = new Set(appIds.map((id) => normalizeBundleIdentifier(id)));
  const owners = new Map<string, string>();
  for (const folder of folders.initial) {
    if (!folderIdPattern.test(folder.id)) {
      throw new TypeError(`Webspring folder ID ${folder.id} must begin with "folder." followed by a lowercase slug.`);
    }
    if (folderIds.has(folder.id)) {
      throw new TypeError(`Webspring manifest contains duplicate folder ID ${folder.id}.`);
    }
    folderIds.add(folder.id);
    normalizedFolderIds.add(normalizeBundleIdentifier(folder.id));
  }
  for (const folder of folders.initial) {
    const normalizedFolder = normalizeBundleIdentifier(folder.id);
    if (normalizedAppIds.has(normalizedFolder)) {
      throw new TypeError(`Webspring folder ID ${folder.id} collides with an application ID.`);
    }
    for (const appId of folder.apps) {
      const normalizedApp = normalizeBundleIdentifier(appId);
      if (normalizedFolderIds.has(normalizedApp)) {
        throw new TypeError(`Webspring folder ID ${appId} collides with an application ID.`);
      }
      const owner = owners.get(normalizedApp);
      if (owner !== undefined) {
        throw new TypeError(`Webspring app ${appId} is listed in folders ${owner} and ${folder.id}.`);
      }
      owners.set(normalizedApp, folder.id);
    }
  }
}

/** Validates raw `Info.ts` metadata and returns a deeply frozen `WSCapturedInfo` with defaults. */
export function captureWSInfo(raw: unknown): WSCapturedInfo {
  const label = "WSInfo";
  assertPlainRecord(raw, label);
  assertKnownFields(raw, label, [
    "schemaVersion",
    "bundleIdentifier",
    "displayName",
    "version",
    "homeRoute",
    "branding",
    "folders",
    "webApp",
  ]);
  const schemaVersion = readOwnDataProperty(raw, "schemaVersion", false, label);
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    throw new TypeError("WSInfo.schemaVersion must be 1.");
  }
  const bundleIdentifier = captureText(raw, "bundleIdentifier", true, label)!;
  if (!bundleIdentifierPattern.test(bundleIdentifier)) {
    throw new TypeError(`WSInfo.bundleIdentifier "${bundleIdentifier}" must use reverse-DNS format with at least three segments.`);
  }
  const displayName = captureText(raw, "displayName", true, label, 256)!;
  const version = captureText(raw, "version", true, label)!;
  if (!semverPattern.test(version)) {
    throw new TypeError(`WSInfo.version "${version}" must follow semantic versioning.`);
  }
  const homeRoute = captureText(raw, "homeRoute", false, label) ?? "/";
  if (!homeRoutePattern.test(homeRoute)) {
    throw new TypeError(`WSInfo.homeRoute "${homeRoute}" must be a clean internal path starting with "/".`);
  }
  const branding = captureBranding(readOwnDataProperty(raw, "branding", false, label), displayName);
  const folders = captureFolders(readOwnDataProperty(raw, "folders", false, label), bundleIdentifier);
  const webApp = captureWebApp(readOwnDataProperty(raw, "webApp", false, label));
  return Object.freeze({
    schemaVersion: 1 as const,
    bundleIdentifier,
    displayName,
    version,
    homeRoute,
    branding,
    folders,
    ...(webApp === undefined ? {} : { webApp }),
  });
}
