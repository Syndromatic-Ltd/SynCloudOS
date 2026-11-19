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

import type { ComponentType, ReactNode } from "react";
import {
  NSEViewController,
  validateNSEViewControllerClass,
  type NSEViewControllerClass,
  type NSEViewControllerOptions,
} from "../../NSE/Application/NSEViewController";
import type { SynCloudOSAppearance } from "../Appearance/appearanceService";
import type { SynCloudOSLocaleServicesSnapshot } from "../LocaleServices/localeTypes";
import type { SynCloudOSSettings } from "../Settings/settingsService";

/** Snapshot of host preferences passed to built-in pane views and summaries. */
export interface PreferencePaneViewProps {
  /** The person's current settings (sound, motion, notifications…). */
  readonly settings: SynCloudOSSettings;
  /** The requested appearance: `"light"`, `"dark"` or `"auto"`. */
  readonly appearance: SynCloudOSAppearance;
  /** The active locale and the locales the runtime supports. */
  readonly locale: SynCloudOSLocaleServicesSnapshot;
}

/**
 * Text a pane shows. A plain string is shown as written; `{ key, fallback }` is
 * looked up in the system dictionary and falls back to `fallback` (or the key)
 * when no translation exists.
 */
export type PreferencePaneText = string | { readonly key: string; readonly fallback?: string };

/** A System Preferences pane class extending `NSEPreferencePane`. */
export type NSEPreferencePaneClass = (new (options?: NSEViewControllerOptions) => NSEPreferencePane) & {
  readonly id: string;
  readonly title: PreferencePaneText;
  readonly icon?: string;
  readonly order: number;
};

/** Captured static metadata for one `NSEPreferencePane` subclass. */
export interface PreferencePaneDescriptor {
  readonly id: string;
  readonly title: PreferencePaneText;
  readonly order: number;
  readonly icon?: string;
  readonly PaneClass: NSEPreferencePaneClass;
}

/** @internal Updates host-managed state on a live preference pane controller. */
export const nseUpdatePreferencePaneState: unique symbol = Symbol("nse.updatePreferencePaneState");

/** Base class for built-in and developer System Preferences panes. */
export class NSEPreferencePane extends NSEViewController {
  static id: string;
  static title: PreferencePaneText;
  static icon?: string;
  static order: number;

  #hostState: PreferencePaneViewProps | null = null;

  #requireHostState(): PreferencePaneViewProps {
    if (!this.#hostState) {
      throw new TypeError("NSEPreferencePane state is set by the host before it renders.");
    }
    return this.#hostState;
  }

  /** The person's current settings, kept up to date by the host. */
  get settings(): SynCloudOSSettings {
    return this.#requireHostState().settings;
  }

  /** The requested appearance (`"light"`, `"dark"` or `"auto"`), kept up to date by the host. */
  get appearance(): SynCloudOSAppearance {
    return this.#requireHostState().appearance;
  }

  /** The active and supported locales, kept up to date by the host. */
  get locale(): SynCloudOSLocaleServicesSnapshot {
    return this.#requireHostState().locale;
  }

  /** Optional subtitle rendered on the pane's list row. */
  renderSummary?(): ReactNode;
  /** Optional control rendered on the pane's list row before the chevron. */
  renderAccessory?(): ReactNode;

  /** @internal */
  [nseUpdatePreferencePaneState](state: PreferencePaneViewProps): void {
    const previous = this.#hostState;
    if (
      previous
      && Object.is(previous.settings, state.settings)
      && Object.is(previous.appearance, state.appearance)
      && Object.is(previous.locale, state.locale)
    ) {
      return;
    }
    this.#hostState = Object.freeze({
      settings: state.settings,
      appearance: state.appearance,
      locale: state.locale,
    });
    this.notifyObservers();
  }
}

const capturedDescriptors = new WeakSet<PreferencePaneDescriptor>();

/** True only for descriptors returned by `capturePreferencePaneClass`. */
export function isPreferencePaneDescriptor(value: unknown): value is PreferencePaneDescriptor {
  return typeof value === "object" && value !== null && capturedDescriptors.has(value as PreferencePaneDescriptor);
}

function readOwnData(input: object, key: string): unknown {
  const own = Object.getOwnPropertyDescriptor(input, key);
  if (!own) return undefined;
  if (!("value" in own)) throw new TypeError(`Preference pane ${key} must be a data property, not an accessor.`);
  return own.value;
}

function readStaticProperty(ctor: Function, key: string): unknown {
  for (
    let current: unknown = ctor;
    typeof current === "function" && current !== NSEPreferencePane && current !== Function.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    const own = Object.getOwnPropertyDescriptor(current, key);
    if (own) {
      if (!("value" in own)) {
        throw new TypeError(`Preference pane static ${key} must be a data property, not an accessor.`);
      }
      return own.value;
    }
  }
  return undefined;
}

/** Functions, and the memo and forwardRef wrappers React renders as components. */
function isComponent(value: unknown): value is ComponentType<never> {
  if (typeof value === "function") return true;
  if (typeof value !== "object" || value === null) return false;
  const reactType = Object.getOwnPropertyDescriptor(value, "$$typeof");
  return Boolean(reactType && "value" in reactType && (
    reactType.value === Symbol.for("react.memo") || reactType.value === Symbol.for("react.forward_ref")
  ));
}

function captureTitle(title: unknown, id: string): PreferencePaneText {
  if (typeof title === "string" && title.trim()) return title;
  if (typeof title === "object" && title !== null) {
    const key = readOwnData(title, "key");
    const fallback = readOwnData(title, "fallback");
    if (typeof key === "string" && key.trim() && (fallback === undefined || typeof fallback === "string")) {
      return Object.freeze(fallback === undefined ? { key } : { key, fallback });
    }
  }
  throw new TypeError(`Preference pane ${id} requires a static title: a non-empty string or { key, fallback }.`);
}

/** Validates an `NSEPreferencePane` subclass and freezes its metadata descriptor. */
export function capturePreferencePaneClass(value: unknown): PreferencePaneDescriptor {
  if (typeof value !== "function" || !(value.prototype instanceof NSEPreferencePane)) {
    throw new TypeError("Preference panes must be a class extending NSEPreferencePane.");
  }
  const view = readStaticProperty(value, "view");
  if (view !== undefined && !isComponent(view)) {
    throw new TypeError("Preference pane static view must be a React component.");
  }
  validateNSEViewControllerClass(value as unknown as NSEViewControllerClass);
  const rawId = readStaticProperty(value, "id");
  if (typeof rawId !== "string" || !rawId.trim()) {
    throw new TypeError("A preference pane subclass requires a non-empty string static id.");
  }
  const id = rawId.trim();
  const title = captureTitle(readStaticProperty(value, "title"), id);
  const order = readStaticProperty(value, "order");
  if (typeof order !== "number" || !Number.isFinite(order)) {
    throw new TypeError(`Preference pane ${id} requires a finite static order.`);
  }
  const icon = readStaticProperty(value, "icon");
  if (icon !== undefined && (typeof icon !== "string" || !icon.trim())) {
    throw new TypeError(`Preference pane ${id} static icon must be a URL string.`);
  }
  const descriptor: PreferencePaneDescriptor = Object.freeze({
    id,
    title,
    order,
    ...(icon === undefined ? {} : { icon }),
    PaneClass: value as NSEPreferencePaneClass,
  });
  capturedDescriptors.add(descriptor);
  return descriptor;
}

function toDescriptor(pane: PreferencePaneDescriptor | NSEPreferencePaneClass): PreferencePaneDescriptor {
  return isPreferencePaneDescriptor(pane) ? pane : capturePreferencePaneClass(pane);
}

/**
 * The panes System Preferences lists: the built-ins that are not hidden and are
 * not replaced, plus every developer pane. A developer pane with a built-in's
 * id replaces it; `hide` removes built-ins only, never a developer pane.
 */
export function resolvePreferencePanes(options: {
  readonly builtIn: readonly (PreferencePaneDescriptor | NSEPreferencePaneClass)[];
  readonly developer?: readonly (PreferencePaneDescriptor | NSEPreferencePaneClass)[];
  readonly hide?: readonly string[];
}): readonly PreferencePaneDescriptor[] {
  const builtIn = options.builtIn.map(toDescriptor);
  const developer = (options.developer ?? []).map(toDescriptor);
  const hidden = new Set(options.hide ?? []);
  const replaced = new Set<string>();
  for (const pane of developer) {
    if (replaced.has(pane.id)) {
      throw new TypeError(`Duplicate developer preference pane id "${pane.id}".`);
    }
    replaced.add(pane.id);
  }
  return Object.freeze([
    ...builtIn.filter((pane) => !hidden.has(pane.id) && !replaced.has(pane.id)),
    ...developer,
  ]);
}
