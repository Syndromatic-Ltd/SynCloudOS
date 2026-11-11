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

import type { ComponentType } from "react";
import type { SynCloudOSAppearance } from "../Appearance/appearanceService";
import type { SynCloudOSLocaleServicesSnapshot } from "../LocaleServices/localeTypes";
import type { SynCloudOSSettings } from "../Settings/settingsService";

/** What System Preferences hands every pane view, summary and accessory. */
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

export interface PreferencePaneInput {
  /** Unique among panes. Reusing a built-in's id replaces that built-in. */
  readonly id: string;
  readonly title: PreferencePaneText;
  /** The pane's artwork, a URL. Shown beside the title in the list. */
  readonly icon?: string;
  /** Position in the list, ascending. Built-ins sit at 50 (Account) and 100 to 500. */
  readonly order: number;
  /** The pane itself, rendered when the person opens it. */
  readonly view: ComponentType<PreferencePaneViewProps>;
  /** The line under the title in the list, usually the current value. */
  readonly summary?: ComponentType<PreferencePaneViewProps>;
  /** A control on the list row, before the chevron, such as a master switch. */
  readonly accessory?: ComponentType<PreferencePaneViewProps>;
}

export interface PreferencePaneDefinition {
  readonly id: string;
  readonly title: PreferencePaneText;
  readonly icon?: string;
  readonly order: number;
  readonly view: ComponentType<PreferencePaneViewProps>;
  readonly summary?: ComponentType<PreferencePaneViewProps>;
  readonly accessory?: ComponentType<PreferencePaneViewProps>;
}

const defined = new WeakSet<object>();

/** True only for values returned by `definePreferencePane`. */
export function isPreferencePaneDefinition(value: unknown): value is PreferencePaneDefinition {
  return typeof value === "object" && value !== null && defined.has(value);
}

function read(input: object, key: string): unknown {
  const own = Object.getOwnPropertyDescriptor(input, key);
  if (!own) return undefined;
  if (!("value" in own)) throw new TypeError(`Preference pane ${key} must be a data property, not an accessor.`);
  return own.value;
}

/** Functions, and the memo and forwardRef wrappers React renders as components. */
function isComponent(value: unknown): value is ComponentType<PreferencePaneViewProps> {
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
    const key = read(title, "key");
    const fallback = read(title, "fallback");
    if (typeof key === "string" && key.trim() && (fallback === undefined || typeof fallback === "string")) {
      return Object.freeze(fallback === undefined ? { key } : { key, fallback });
    }
  }
  throw new TypeError(`Preference pane ${id} requires a title: a non-empty string or { key, fallback }.`);
}

/**
 * Declares one System Preferences pane. Add it to
 * `defineWebspring({ preferences: { panes: [pane] } })`.
 */
export function definePreferencePane(input: PreferencePaneInput): PreferencePaneDefinition {
  if (typeof input !== "object" || input === null) throw new TypeError("A preference pane must be declared with an object.");
  const rawId = read(input, "id");
  if (typeof rawId !== "string" || !rawId.trim()) throw new TypeError("A preference pane requires a non-empty string id.");
  const id = rawId.trim();
  const title = captureTitle(read(input, "title"), id);
  const order = read(input, "order");
  if (typeof order !== "number" || !Number.isFinite(order)) throw new TypeError(`Preference pane ${id} requires a finite order.`);
  const view = read(input, "view");
  if (!isComponent(view)) throw new TypeError(`Preference pane ${id} requires a React component as its view.`);
  const icon = read(input, "icon");
  if (icon !== undefined && (typeof icon !== "string" || !icon.trim())) throw new TypeError(`Preference pane ${id} icon must be a URL string.`);
  const summary = read(input, "summary");
  if (summary !== undefined && !isComponent(summary)) throw new TypeError(`Preference pane ${id} summary must be a React component.`);
  const accessory = read(input, "accessory");
  if (accessory !== undefined && !isComponent(accessory)) throw new TypeError(`Preference pane ${id} accessory must be a React component.`);
  const definition: PreferencePaneDefinition = Object.freeze({
    id,
    title,
    order,
    view,
    ...(icon === undefined ? {} : { icon }),
    ...(summary === undefined ? {} : { summary }),
    ...(accessory === undefined ? {} : { accessory }),
  });
  defined.add(definition);
  return definition;
}

/**
 * The panes System Preferences lists: the built-ins that are not hidden and are
 * not replaced, plus every developer pane. A developer pane with a built-in's
 * id replaces it; `hide` removes built-ins only, never a developer pane.
 */
export function resolvePreferencePanes(options: {
  readonly builtIn: readonly PreferencePaneDefinition[];
  readonly developer?: readonly PreferencePaneDefinition[];
  readonly hide?: readonly string[];
}): readonly PreferencePaneDefinition[] {
  const developer = options.developer ?? [];
  const hidden = new Set(options.hide ?? []);
  const replaced = new Set(developer.map((pane) => pane.id));
  return Object.freeze([
    ...options.builtIn.filter((pane) => !hidden.has(pane.id) && !replaced.has(pane.id)),
    ...developer,
  ]);
}
