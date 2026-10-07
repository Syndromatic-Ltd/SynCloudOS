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

import { captureSynWareManifest } from "../SynCloudOS/AppSDK";
import type {
  WebspringContent,
  WebspringDefinition,
  WebspringDefinitionInput,
  WebspringManifest,
  WebspringQuickSwitchOptions,
  WebspringViewComponent,
} from "./webspringTypes";

export const defaultWebspringReturnTracks = Object.freeze(["material", "icons"] as const);
/** The launch zoom for a view that declares none: it waits for the launcher's
 * icons to clear, then accelerates out of the screen centre. */
export const defaultWebspringLaunchZoom = Object.freeze({ delay: 0.72, duration: 0.68, easing: "accelerate" as const });

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
    const reactType = typeof component === "object" && component !== null
      ? Object.getOwnPropertyDescriptor(component, "$$typeof")
      : undefined;
    const supportedWrapper = reactType && "value" in reactType && (
      reactType.value === Symbol.for("react.memo") || reactType.value === Symbol.for("react.forward_ref")
    );
    if (typeof component !== "function" && !supportedWrapper) {
      throw new TypeError(`Webspring component ${key} must be a React component.`);
    }
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

export function defineWebspring<const TManifest extends WebspringManifest>(
  input: WebspringDefinitionInput<TManifest>,
): WebspringDefinition<TManifest> {
  assertPlainObject(input, "Webspring definition");
  const manifestInput = dataProperty(input, "manifest", true);
  const componentsInput = dataProperty(input, "components", true);
  const contentInput = dataProperty(input, "content", false);
  const iconEffectInput = dataProperty(input, "iconEffect", false);
  if (iconEffectInput !== undefined) captureComponents({ iconEffect: iconEffectInput });
  const quickSwitch = captureQuickSwitch(dataProperty(input, "quickSwitch", false));
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

  for (const presentation of ["desktop", "tablet", "mobile"] as const) {
    const defaultId = capturedManifest.value.webspringShell.defaults[presentation];
    const view = capturedManifest.value.webspringShell.views.find((candidate) => candidate.id === defaultId);
    if (!view) throw new TypeError(`Webspring ${presentation} default references unknown view ID ${defaultId}.`);
    if (!view.presentations.includes(presentation)) {
      throw new TypeError(`Webspring ${presentation} default ${defaultId} does not support ${presentation}.`);
    }
  }

  const definition = {
    manifest: capturedManifest.value as TManifest,
    components,
    returnTracks: captureReturnTracks(components),
    launchZooms: captureLaunchZooms(components),
    ...(iconEffectInput === undefined ? {} : { iconEffect: iconEffectInput as WebspringDefinition["iconEffect"] }),
    ...(quickSwitch === undefined ? {} : { quickSwitch }),
    ...(contentInput === undefined ? {} : { content: cloneData(contentInput, "Webspring content") as Readonly<WebspringContent> }),
  };
  return Object.freeze(definition);
}
