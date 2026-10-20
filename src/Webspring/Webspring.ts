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
import { captureSynWareManifest, type SynWareWebspringFoldersManifest } from "../SynCloudOS/AppSDK";
import { createWebspringFolderSplitPresentation } from "./WebspringFolderSplitPresentation";
import { defaultWebspringFolderAppearance, defaultWebspringFolderSmoothSurface } from "./WebspringFolderAppearance";
import { nseSmoothSurfaceRadiusTokens } from "../NSE/SmoothSurface";
import { captureWebspringBackground } from "./webspringSurface";
import { isDefinedWebspringWidget } from "./webspringWidget";
import { isPreferencePaneDefinition, type PreferencePaneDefinition } from "../SynCloudOS/Preferences";
import type {
  WebspringWidget,
  WebspringFolderAppearance,
  WebspringFolderPresentationComponent,
  WebspringDefinition,
  WebspringDefinitionInput,
  WebspringManifest,
  WebspringPreferences,
  WebspringQuickSwitchOptions,
  WebspringViewComponent,
} from "./webspringTypes";

export const defaultWebspringReturnTracks = Object.freeze(["material", "icons"] as const);
/** The launch zoom for a view that declares none: it waits for the launcher's
 * icons to clear, then accelerates out of the screen centre. */
export const defaultWebspringLaunchZoom = Object.freeze({ delay: 0.72, duration: 0.68, easing: "accelerate" as const });

/** The presentation used when a definition supplies none. */
const defaultWebspringFolderPresentation = createWebspringFolderSplitPresentation();

/** Definitions created by `defineWebspring`, before or after discovery added folders to them. */
const definedDefinitions = new WeakSet<object>();

function dataProperty(object: object, key: string, required: boolean): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) {
    if (!required) return undefined;
    throw new TypeError(`A Webspring definition requires a ${key} data property.`);
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError(`Webspring ${key} must be an enumerable data property, not an accessor.`);
  }
  return descriptor.value;
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function cloneData(value: unknown, label: string, ancestors = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") throw new TypeError(`${label} must contain data values only.`);
  if (ancestors.has(value)) throw new TypeError(`${label} must not contain cycles.`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const output: unknown[] = [];
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)) {
          throw new TypeError(`${label} arrays may contain only indexed data values.`);
        }
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError(`${label}[${index}] must be an enumerable data property, not an accessor.`);
        }
        output.push(cloneData(descriptor.value, `${label}[${index}]`, ancestors));
      }
      return Object.freeze(output);
    }
    assertPlainObject(value, label);
    const output: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new TypeError(`${label} must not contain symbol properties.`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError(`${label}.${key} must be an enumerable data property, not an accessor.`);
      }
      Object.defineProperty(output, key, {
        value: cloneData(descriptor.value, `${label}.${key}`, ancestors),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
    return Object.freeze(output);
  } finally {
    ancestors.delete(value);
  }
}

/** Functions, and the memo and forwardRef wrappers React renders as components. */
function isReactComponent(component: unknown) {
  if (typeof component === "function") return true;
  if (typeof component !== "object" || component === null) return false;
  const reactType = Object.getOwnPropertyDescriptor(component, "$$typeof");
  return Boolean(reactType && "value" in reactType && (
    reactType.value === Symbol.for("react.memo") || reactType.value === Symbol.for("react.forward_ref")
  ));
}

function captureComponents(value: unknown): Readonly<Record<string, WebspringViewComponent>> {
  assertPlainObject(value, "Webspring components");
  const output: Record<string, WebspringViewComponent> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new TypeError("Webspring components must not contain symbol properties.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`Webspring component ${key} must be an enumerable data property, not an accessor.`);
    }
    const component = descriptor.value;
    if (!isReactComponent(component)) throw new TypeError(`Webspring component ${key} must be a React component.`);
    Object.defineProperty(output, key, {
      value: component as WebspringViewComponent,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  return Object.freeze(output);
}

function manifestError(errors: readonly { readonly path: string; readonly message: string }[]): TypeError {
  const detail = errors.map((error) => `${error.path}: ${error.message}`).join("; ");
  return new TypeError(`Invalid Webspring manifest: ${detail}`);
}

function captureReturnTracks(components: WebspringDefinition["components"]): WebspringDefinition["returnTracks"] {
  const output: Record<string, readonly ("material" | "icons")[]> = {};
  for (const [id, component] of Object.entries(components)) {
    const label = `Webspring component ${id} returnTracks`;
    const input = dataProperty(component, "returnTracks", false);
    const tracks = input === undefined ? defaultWebspringReturnTracks : cloneData(input, label);
    if (!Array.isArray(tracks) || tracks.length === 0 ||
      tracks.some((track) => track !== "material" && track !== "icons") || new Set(tracks).size !== tracks.length) {
      throw new TypeError(`${label} must be a nonempty list of distinct material or icons tracks.`);
    }
    Object.defineProperty(output, id, { value: tracks, enumerable: true, writable: false, configurable: false });
  }
  return Object.freeze(output);
}

const launchZoomEasings = new Set(["standard", "emphasized", "decelerate", "accelerate"]);

function captureLaunchZooms(components: WebspringDefinition["components"]): WebspringDefinition["launchZooms"] {
  const output: Record<string, Readonly<Required<NonNullable<WebspringViewComponent["launchZoom"]>>>> = {};
  for (const [id, component] of Object.entries(components)) {
    const label = `Webspring component ${id} launchZoom`;
    const input = dataProperty(component, "launchZoom", false);
    const zoom = input === undefined ? {} : cloneData(input, label) as Record<string, unknown>;
    if (!zoom || typeof zoom !== "object" || Array.isArray(zoom)) throw new TypeError(`${label} must be an object.`);
    const extra = Object.keys(zoom).filter((key) => key !== "delay" && key !== "duration" && key !== "easing");
    if (extra.length > 0) throw new TypeError(`${label} has unknown fields: ${extra.join(", ")}.`);
    const seconds = (value: unknown, fallback: number, name: string) => {
      const result = value === undefined ? fallback : value;
      if (typeof result !== "number" || !Number.isFinite(result) || result < 0 || result > 5) {
        throw new TypeError(`${label}.${name} must be a number of seconds from 0 to 5.`);
      }
      return result;
    };
    const easing = zoom.easing === undefined ? defaultWebspringLaunchZoom.easing : zoom.easing;
    if (typeof easing !== "string" || !launchZoomEasings.has(easing)) {
      throw new TypeError(`${label}.easing must be standard, emphasized, decelerate or accelerate.`);
    }
    const captured = Object.freeze({
      delay: seconds(zoom.delay, defaultWebspringLaunchZoom.delay, "delay"),
      duration: seconds(zoom.duration, defaultWebspringLaunchZoom.duration, "duration"),
      easing: easing as Required<NonNullable<WebspringViewComponent["launchZoom"]>>["easing"],
    });
    Object.defineProperty(output, id, { value: captured, enumerable: true, writable: false, configurable: false });
  }
  return Object.freeze(output);
}

function captureQuickSwitch(input: unknown): Readonly<WebspringQuickSwitchOptions> | undefined {
  if (input === undefined) return undefined;
  assertPlainObject(input, "Webspring quickSwitch");
  const extra = Object.keys(input).filter((key) => key !== "overflow");
  if (extra.length > 0) throw new TypeError(`Webspring quickSwitch has unknown fields: ${extra.join(", ")}.`);
  const overflow = dataProperty(input, "overflow", false);
  if (overflow !== undefined && overflow !== "shrink" && overflow !== "scroll") {
    throw new TypeError("Webspring quickSwitch.overflow must be shrink or scroll.");
  }
  return Object.freeze(overflow === undefined ? {} : { overflow });
}

function assertKnownFields(input: Record<string, unknown>, label: string, known: readonly string[]) {
  const extra = Object.keys(input).filter((key) => !known.includes(key));
  if (extra.length > 0) throw new TypeError(`${label} has unknown fields: ${extra.join(", ")}.`);
}

const smoothSurfaceCurves: Record<string, true> = { arc: true, squircle: true, superellipse: true, clothoid: true };

function captureFolderShape(input: unknown): WebspringFolderAppearance["shape"] {
  const label = "Webspring folderAppearance.shape";
  if (input === undefined) return defaultWebspringFolderAppearance.shape;
  assertPlainObject(input, label);
  const kind = dataProperty(input, "kind", false);
  if (kind === "circle") {
    assertKnownFields(input, label, ["kind"]);
    return Object.freeze({ kind });
  }
  if (kind !== "roundedRect") throw new TypeError(`${label}.kind must be roundedRect or circle.`);
  assertKnownFields(input, label, ["kind", "smoothSurface"]);
  const surfaceInput = dataProperty(input, "smoothSurface", false);
  const defaults = defaultWebspringFolderSmoothSurface;
  if (surfaceInput === undefined) return Object.freeze({ kind, smoothSurface: defaults });
  const surfaceLabel = `${label}.smoothSurface`;
  assertPlainObject(surfaceInput, surfaceLabel);
  assertKnownFields(surfaceInput, surfaceLabel, ["radius", "curve", "smoothing"]);
  const field = (key: keyof typeof defaults): unknown => {
    const value = dataProperty(surfaceInput, key, false);
    return value === undefined ? defaults[key] : value;
  };
  const radius = field("radius");
  const percentage = typeof radius === "string" && /^(?:\d+(?:\.\d+)?|\.\d+)%$/u.test(radius) ? Number.parseFloat(radius) : undefined;
  if (!(percentage !== undefined && percentage <= 50) &&
    !(typeof radius === "number" && Number.isFinite(radius) && radius >= 0) &&
    !(typeof radius === "string" && Object.hasOwn(nseSmoothSurfaceRadiusTokens, radius))) {
    throw new TypeError(`${surfaceLabel}.radius must be a percentage up to 50%, a non-negative number of pixels or an NSE radius token.`);
  }
  const curve = field("curve");
  if (typeof curve !== "string" || !Object.hasOwn(smoothSurfaceCurves, curve)) {
    throw new TypeError(`${surfaceLabel}.curve must be arc, squircle, superellipse or clothoid.`);
  }
  const smoothing = field("smoothing");
  if (typeof smoothing !== "number" || !Number.isFinite(smoothing) || smoothing < 0 || smoothing > 1) {
    throw new TypeError(`${surfaceLabel}.smoothing must be a number from 0 to 1.`);
  }
  return Object.freeze({
    kind,
    smoothSurface: Object.freeze({ radius, curve, smoothing } as typeof defaults),
  });
}

function captureFolderFill(input: unknown): WebspringFolderAppearance["fill"] {
  const label = "Webspring folderAppearance.fill";
  if (input === undefined || input === "inset") return "inset";
  if (typeof input !== "object" || input === null) throw new TypeError(`${label} must be inset or a texture.`);
  assertPlainObject(input, label);
  if (dataProperty(input, "kind", false) !== "texture") throw new TypeError(`${label} must be inset or a texture.`);
  assertKnownFields(input, label, ["kind", "image", "size", "colour"]);
  const text = (key: string, fallback?: string) => {
    const value = dataProperty(input, key, false);
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label}.${key} must be a nonempty string.`);
    return value;
  };
  return Object.freeze({ kind: "texture" as const, image: text("image"), size: text("size", "cover"), colour: text("colour", "transparent") });
}

function captureFolderAppearance(input: unknown): WebspringFolderAppearance {
  if (input === undefined) return defaultWebspringFolderAppearance;
  assertPlainObject(input, "Webspring folderAppearance");
  assertKnownFields(input, "Webspring folderAppearance", ["shape", "fill"]);
  return Object.freeze({
    shape: captureFolderShape(dataProperty(input, "shape", false)),
    fill: captureFolderFill(dataProperty(input, "fill", false)),
  });
}

/** Rejects a folder declaration the reconciler could not honour. */
function assertFolders(folders: SynWareWebspringFoldersManifest | undefined) {
  if (!folders) return;
  const folderIds = new Set<string>();
  const owners = new Map<string, string>();
  for (const folder of folders.initial) {
    if (folderIds.has(folder.id)) throw new TypeError(`Webspring manifest contains duplicate folder ID ${folder.id}.`);
    folderIds.add(folder.id);
    for (const appId of folder.apps) {
      const owner = owners.get(normalizeBundleIdentifier(appId));
      if (owner !== undefined) throw new TypeError(`Webspring app ${appId} is listed in folders ${owner} and ${folder.id}.`);
      owners.set(normalizeBundleIdentifier(appId), folder.id);
    }
  }
}

/** The widgets a definition declares, in order; each must come from `defineWidget` and ids must be unique. */
function captureWidgets(input: unknown): readonly WebspringWidget[] {
  if (input === undefined) return Object.freeze([]);
  if (!Array.isArray(input)) throw new TypeError("Webspring widgets must be an array.");
  const ids = new Set<string>();
  for (const widget of input) {
    if (!isDefinedWebspringWidget(widget)) throw new TypeError("Webspring widgets must be created with defineWidget.");
    if (ids.has(widget.id)) throw new TypeError(`Webspring widgets contain duplicate ID ${widget.id}.`);
    ids.add(widget.id);
  }
  return Object.freeze([...input] as WebspringWidget[]);
}

/** The System Preferences panes a definition adds and the built-ins it hides. */
function capturePreferences(input: unknown): WebspringPreferences {
  if (input === undefined) return Object.freeze({ panes: Object.freeze([]), hide: Object.freeze([]) });
  assertPlainObject(input, "Webspring preferences");
  assertKnownFields(input, "Webspring preferences", ["panes", "hide"]);
  const panesInput = dataProperty(input, "panes", false);
  const hideInput = dataProperty(input, "hide", false);
  if (panesInput !== undefined && !Array.isArray(panesInput)) throw new TypeError("Webspring preferences.panes must be an array.");
  if (hideInput !== undefined && !Array.isArray(hideInput)) throw new TypeError("Webspring preferences.hide must be an array.");
  const panes: PreferencePaneDefinition[] = [];
  const ids = new Set<string>();
  for (const pane of panesInput ?? []) {
    if (!isPreferencePaneDefinition(pane)) throw new TypeError("Webspring preferences.panes must be created with definePreferencePane.");
    if (ids.has(pane.id)) throw new TypeError(`Webspring preferences.panes contain duplicate ID ${pane.id}.`);
    ids.add(pane.id);
    panes.push(pane);
  }
  const hide: string[] = [];
  for (const id of hideInput ?? []) {
    if (typeof id !== "string" || !id.trim()) throw new TypeError("Webspring preferences.hide must list pane ids as non-empty strings.");
    hide.push(id.trim());
  }
  return Object.freeze({ panes: Object.freeze(panes), hide: Object.freeze(hide) });
}

export function defineWebspring<const TManifest extends Omit<WebspringManifest, "schemaVersion"> & { readonly schemaVersion?: 1 }>(
  input: WebspringDefinitionInput<TManifest>,
): WebspringDefinition<TManifest & { readonly schemaVersion: 1 }> {
  assertPlainObject(input, "Webspring definition");
  const manifestInput = dataProperty(input, "manifest", true);
  const componentsInput = dataProperty(input, "components", true);
  const widgets = captureWidgets(dataProperty(input, "widgets", false));
  const background = captureWebspringBackground(dataProperty(input, "background", false));
  const preferences = capturePreferences(dataProperty(input, "preferences", false));
  const iconEffectInput = dataProperty(input, "iconEffect", false);
  if (iconEffectInput !== undefined) captureComponents({ iconEffect: iconEffectInput });
  const quickSwitch = captureQuickSwitch(dataProperty(input, "quickSwitch", false));
  const folderPresentationInput = dataProperty(input, "folderPresentation", false);
  if (folderPresentationInput !== undefined && !isReactComponent(folderPresentationInput)) {
    throw new TypeError("Webspring folderPresentation must be a React component.");
  }
  const folderPresentation = (folderPresentationInput ?? defaultWebspringFolderPresentation) as WebspringFolderPresentationComponent;
  const folderAppearance = captureFolderAppearance(dataProperty(input, "folderAppearance", false));
  const capturedManifest = captureSynWareManifest(manifestInput);
  if (!capturedManifest.ok) throw manifestError(capturedManifest.errors);
  if (!capturedManifest.value.webspringShell) throw new TypeError("A Webspring manifest requires manifest.webspringShell.");

  const components = captureComponents(componentsInput);
  const ids = new Set<string>();
  for (const view of capturedManifest.value.webspringShell.views) {
    if (ids.has(view.id)) throw new TypeError(`Webspring manifest contains duplicate view ID ${view.id}.`);
    ids.add(view.id);
  }
  const componentIds = Object.keys(components);
  const missing = [...ids].filter((id) => !Object.hasOwn(components, id));
  if (missing.length > 0) throw new TypeError(`Webspring components are missing declared view IDs: ${missing.join(", ")}.`);
  const extra = componentIds.filter((id) => !ids.has(id));
  if (extra.length > 0) throw new TypeError(`Webspring components contain extra undeclared view IDs: ${extra.join(", ")}.`);
  assertFolders(capturedManifest.value.webspringShell.folders);

  for (const presentation of ["desktop", "tablet", "mobile"] as const) {
    const defaultId = capturedManifest.value.webspringShell.defaults[presentation];
    const view = capturedManifest.value.webspringShell.views.find((candidate) => candidate.id === defaultId);
    if (!view) throw new TypeError(`Webspring ${presentation} default references unknown view ID ${defaultId}.`);
    if (!view.presentations.includes(presentation)) {
      throw new TypeError(`Webspring ${presentation} default ${defaultId} does not support ${presentation}.`);
    }
  }

  const definition = {
    manifest: capturedManifest.value as TManifest & { readonly schemaVersion: 1 },
    components,
    returnTracks: captureReturnTracks(components),
    launchZooms: captureLaunchZooms(components),
    ...(iconEffectInput === undefined ? {} : { iconEffect: iconEffectInput as WebspringDefinition["iconEffect"] }),
    ...(quickSwitch === undefined ? {} : { quickSwitch }),
    folderPresentation,
    folderAppearance,
    widgets,
    background,
    preferences,
  };
  const captured = Object.freeze(definition);
  definedDefinitions.add(captured);
  return captured;
}

/** Whether `value` came from `defineWebspring`. */
export function isDefinedWebspring(value: unknown): value is WebspringDefinition {
  return typeof value === "object" && value !== null && definedDefinitions.has(value);
}

/**
 * Adds the preference panes and widgets a project declares in its own folders
 * (`src/Preferences/*.prefPane`, `src/Widgets/*.widget`) to the shell it
 * declares. Declared panes keep their places; discovered panes follow in the
 * order the project derived them.
 */
export function withDiscoveredWebspringItems<TManifest extends WebspringManifest>(
  definition: WebspringDefinition<TManifest>,
  items: Readonly<{ preferences: readonly PreferencePaneDefinition[]; widgets: readonly WebspringWidget[] }>,
): WebspringDefinition<TManifest> {
  if (!isDefinedWebspring(definition)) throw new TypeError("A Webspring definition must be created with defineWebspring.");
  if (typeof items !== "object" || items === null || !Array.isArray(items.preferences) || !Array.isArray(items.widgets)) {
    throw new TypeError("Discovered Webspring items must list preference panes and widgets.");
  }
  const panes = [...definition.preferences.panes];
  const paneIds = new Set(panes.map((pane) => pane.id));
  for (const pane of items.preferences) {
    if (!isPreferencePaneDefinition(pane)) throw new TypeError("Discovered preference panes must be created with definePreferencePane.");
    if (paneIds.has(pane.id)) throw new TypeError(`Preference pane ${pane.id} is declared both by defineWebspring and by a project folder.`);
    paneIds.add(pane.id);
    panes.push(pane);
  }
  return Object.freeze({
    ...definition,
    widgets: captureWidgets([...definition.widgets, ...items.widgets]),
    preferences: Object.freeze({ panes: Object.freeze(panes), hide: definition.preferences.hide }),
  });
}
