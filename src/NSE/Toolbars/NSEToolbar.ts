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

import { NSEObject } from "../Objects/NSEObject";
import { NSEPreferencesController, type PreferencesAdapter } from "../Controllers/NSEPreferencesController";
import type { NSEOwner } from "../Controllers/ownership";
import { NSEToolbarController } from "./NSEToolbarController";
import type { NSEToolbarItemInput, NSEToolbarPreferences, NSEToolbarRuntimePort } from "./toolbarTypes";

/** NSToolbar.DisplayMode. `default` follows the toolbar's own default, icon and label. */
export type NSEToolbarDisplayMode = "default" | "iconAndLabel" | "iconOnly" | "labelOnly";
/** NSToolbar.SizeMode. `default` is regular. */
export type NSEToolbarSizeMode = "default" | "regular" | "small";

export interface NSEToolbarOptions<Items extends readonly NSEToolbarItemInput[] = readonly NSEToolbarItemInput[]> {
  /** NSToolbar(identifier:): names the toolbar, and its saved configuration. */
  readonly identifier: string;
  /** Every item the toolbar can show, as toolbar(_:itemForItemIdentifier:willBeInsertedIntoToolbar:) returns them. */
  readonly items: Items;
  /** toolbarDefaultItemIdentifiers(_:): the items, in order, a new toolbar shows. */
  readonly defaultItemIdentifiers: readonly string[];
  /** toolbarAllowedItemIdentifiers(_:): the items the customisation palette offers; every item when omitted. */
  readonly allowedItemIdentifiers?: readonly string[];
  readonly displayMode?: NSEToolbarDisplayMode;
  readonly sizeMode?: NSEToolbarSizeMode;
  /** NSToolbar.allowsUserCustomization: whether runCustomizationPalette may run. */
  readonly allowsUserCustomization?: boolean;
  /** NSToolbar.autosavesConfiguration: saves the item order and modes in the application's preferences. */
  readonly autosavesConfiguration?: boolean;
}

/** @internal What the window a toolbar is drawn in gives it: the application's command and preference authority. */
export interface NSEToolbarServices {
  readonly owner: NSEOwner;
  readonly applicationId: string;
  readonly runtime: NSEToolbarRuntimePort;
  readonly preferences: PreferencesAdapter;
}

/** @internal */
export const nseAttachToolbar: unique symbol = Symbol("nse.attachToolbar");
/** @internal */
export const nseToolbarEngine: unique symbol = Symbol("nse.toolbarEngine");
/** @internal */
export const nseEndToolbarCustomization: unique symbol = Symbol("nse.endToolbarCustomization");

type StoredDisplayMode = NSEToolbarPreferences["displayMode"];
type StoredSizeMode = NSEToolbarPreferences["sizeMode"];

const storedDisplayModes: Readonly<Record<NSEToolbarDisplayMode, StoredDisplayMode>> = {
  default: "icon-and-label", iconAndLabel: "icon-and-label", iconOnly: "icon-only", labelOnly: "label-only",
};
const displayModes: Readonly<Record<StoredDisplayMode, NSEToolbarDisplayMode>> = {
  "icon-and-label": "iconAndLabel", "icon-only": "iconOnly", "label-only": "labelOnly",
};
const storedSizeModes: Readonly<Record<NSEToolbarSizeMode, StoredSizeMode>> = { default: "regular", regular: "regular", small: "small" };

function storedDisplayMode(mode: NSEToolbarDisplayMode): StoredDisplayMode {
  const stored = storedDisplayModes[mode];
  if (!stored) throw new TypeError("A toolbar's displayMode is default, iconAndLabel, iconOnly or labelOnly.");
  return stored;
}

function storedSizeMode(mode: NSEToolbarSizeMode): StoredSizeMode {
  const stored = storedSizeModes[mode];
  if (!stored) throw new TypeError("A toolbar's sizeMode is default, regular or small.");
  return stored;
}

/**
 * NSToolbar: the bar of items under a window's title bar. Create one, give it to a window
 * (`window.toolbar = toolbar`), and the window draws it; its command items validate and dispatch
 * along the window's responder chain, and with `autosavesConfiguration` the user's arrangement is
 * kept in the application's preferences.
 */
export class NSEToolbar<const Items extends readonly NSEToolbarItemInput[] = readonly NSEToolbarItemInput[]> extends NSEObject {
  readonly identifier: string;
  readonly allowsUserCustomization: boolean;
  readonly autosavesConfiguration: boolean;
  readonly #items: Items;
  readonly #defaultItemIdentifiers: readonly string[];
  readonly #allowedItemIdentifiers: readonly string[];
  #state: NSEToolbarPreferences;
  #isVisible = true;
  #customizing = false;
  #engine: NSEToolbarController | null = null;
  #preferences: NSEPreferencesController<NSEToolbarPreferences> | null = null;

  constructor(options: NSEToolbarOptions<Items>) {
    super();
    if (typeof options.identifier !== "string" || !options.identifier.trim()) throw new TypeError("A toolbar needs an identifier.");
    const ids = options.items.map((item) => item.id);
    const known = new Set(ids);
    if (known.size !== ids.length) throw new TypeError(`Toolbar "${options.identifier}" has two items with the same identifier.`);
    const allowed = options.allowedItemIdentifiers ?? ids;
    for (const id of [...options.defaultItemIdentifiers, ...allowed]) {
      if (!known.has(id)) throw new TypeError(`Toolbar "${options.identifier}" has no item "${id}".`);
    }
    for (const id of options.defaultItemIdentifiers) {
      if (!allowed.includes(id)) throw new TypeError(`Toolbar "${options.identifier}" shows "${id}" by default but does not allow it.`);
    }
    this.identifier = options.identifier;
    this.allowsUserCustomization = options.allowsUserCustomization ?? false;
    this.autosavesConfiguration = options.autosavesConfiguration ?? false;
    this.#items = options.items;
    this.#defaultItemIdentifiers = Object.freeze([...options.defaultItemIdentifiers]);
    this.#allowedItemIdentifiers = Object.freeze([...allowed]);
    this.#state = Object.freeze({
      itemIds: this.#defaultItemIdentifiers,
      displayMode: storedDisplayMode(options.displayMode ?? "default"),
      sizeMode: storedSizeMode(options.sizeMode ?? "default"),
    });
  }

  get #configuration(): NSEToolbarPreferences {
    return this.#preferences?.getSnapshot().value ?? this.#state;
  }

  /** The identifiers of the items the toolbar shows, in order. */
  get itemIdentifiers(): readonly string[] {
    return this.#configuration.itemIds;
  }

  /** NSToolbar.items: the items the toolbar shows, in order. */
  get items(): readonly Items[number][] {
    return this.itemIdentifiers.map((id) => this.#items.find((item) => item.id === id)!);
  }

  get displayMode(): NSEToolbarDisplayMode {
    return displayModes[this.#configuration.displayMode];
  }

  set displayMode(mode: NSEToolbarDisplayMode) {
    const stored = storedDisplayMode(mode);
    if (this.#engine) this.#engine.setDisplayMode(stored);
    else this.#setState({ displayMode: stored });
  }

  get sizeMode(): NSEToolbarSizeMode {
    return this.#configuration.sizeMode;
  }

  set sizeMode(mode: NSEToolbarSizeMode) {
    const stored = storedSizeMode(mode);
    if (this.#engine) this.#engine.setSizeMode(stored);
    else this.#setState({ sizeMode: stored });
  }

  /** NSToolbar.isVisible: a hidden toolbar keeps its items and configuration. */
  get isVisible(): boolean {
    return this.#isVisible;
  }

  set isVisible(visible: boolean) {
    if (visible === this.#isVisible) return;
    this.#isVisible = visible;
    this.notifyObservers();
  }

  /** NSToolbar.customizationPaletteIsRunning. */
  get customizationPaletteIsRunning(): boolean {
    return this.#customizing;
  }

  /** NSToolbar.insertItem(withItemIdentifier:at:). */
  insertItem(itemIdentifier: string, index: number): void {
    this.#assertAllowed(itemIdentifier);
    const ids = this.itemIdentifiers;
    if (!Number.isInteger(index) || index < 0 || index > ids.length) throw new RangeError(`A toolbar item index is between 0 and ${ids.length}.`);
    if (this.#engine) { this.#engine.insert(itemIdentifier, index); return; }
    this.#setState({ itemIds: [...ids.slice(0, index), itemIdentifier, ...ids.slice(index)] });
  }

  /** NSToolbar.removeItem(at:). */
  removeItem(index: number): void {
    const ids = this.itemIdentifiers;
    if (!Number.isInteger(index) || index < 0 || index >= ids.length) throw new RangeError(`This toolbar has no item at index ${index}.`);
    if (this.#engine) { this.#engine.removeAt(index); return; }
    this.#setState({ itemIds: ids.filter((_, position) => position !== index) });
  }

  /** NSToolbar.validateVisibleItems(): asks the responder chain again whether each command item is enabled. */
  validateVisibleItems(): void {
    void this.#engine?.refresh();
  }

  /** NSToolbar.runCustomizationPalette(_:): presents the customisation sheet on the toolbar's window. */
  runCustomizationPalette(): void {
    if (!this.allowsUserCustomization) throw new TypeError(`Toolbar "${this.identifier}" does not allow user customisation.`);
    if (!this.#engine) throw new TypeError(`Toolbar "${this.identifier}" is not in a window.`);
    if (this.#customizing) return;
    this.#customizing = true;
    this.notifyObservers();
  }

  /** @internal The window drawing this toolbar binds it to the application. Returns the function that unbinds it. */
  [nseAttachToolbar](services: NSEToolbarServices): () => void {
    if (this.#engine) throw new TypeError(`Toolbar "${this.identifier}" is already in a window.`);
    const allowed = this.#allowedItemIdentifiers;
    const defaults: NSEToolbarPreferences = this.#state;
    const memory = new Map<string, unknown>();
    const adapter: PreferencesAdapter = this.autosavesConfiguration
      ? { read: (key) => services.preferences.read(`toolbar.${key}`), write: (key, value) => services.preferences.write(`toolbar.${key}`, value), remove: (key) => services.preferences.remove(`toolbar.${key}`) }
      : { read: (key) => memory.get(key) ?? null, write: (key, value) => { memory.set(key, value); }, remove: (key) => { memory.delete(key); } };
    const preferences = new NSEPreferencesController<NSEToolbarPreferences>({
      owner: services.owner,
      namespace: this.identifier,
      schema: {
        version: 1,
        defaults,
        fields: {
          itemIds: { validate: (value): value is readonly string[] => Array.isArray(value) && value.every((id) => typeof id === "string" && allowed.includes(id)) },
          displayMode: { validate: (value): value is StoredDisplayMode => value === "icon-and-label" || value === "icon-only" || value === "label-only" },
          sizeMode: { validate: (value): value is StoredSizeMode => value === "regular" || value === "small" },
        },
        migrations: [],
      },
      adapter,
    });
    let engine: NSEToolbarController;
    try {
      engine = new NSEToolbarController({
        owner: services.owner,
        configuration: {
          identifier: this.identifier,
          owner: { kind: "application", applicationId: services.applicationId },
          displayMode: defaults.displayMode,
          sizeMode: defaults.sizeMode,
          allowedItemIds: allowed,
          defaultItemIds: this.#defaultItemIdentifiers,
        },
        items: this.#items as readonly NSEToolbarItemInput[],
        preferences,
        runtime: services.runtime,
      });
    } catch (error) {
      preferences.dispose();
      throw error;
    }
    this.#preferences = preferences;
    this.#engine = engine;
    const unsubscribe = engine.subscribe(() => this.notifyObservers());
    this.notifyObservers();
    return () => {
      if (this.#engine !== engine) return;
      unsubscribe();
      this.#state = Object.freeze({ ...preferences.getSnapshot().value });
      this.#engine = null;
      this.#preferences = null;
      this.#customizing = false;
      engine.dispose();
      preferences.dispose();
      this.notifyObservers();
    };
  }

  /** @internal The validated presentation the window draws, while the toolbar is in a window. */
  get [nseToolbarEngine](): NSEToolbarController | null {
    return this.#engine;
  }

  /** @internal The customisation sheet closed. */
  [nseEndToolbarCustomization](): void {
    if (!this.#customizing) return;
    this.#customizing = false;
    this.notifyObservers();
  }

  #assertAllowed(itemIdentifier: string): void {
    if (!this.#allowedItemIdentifiers.includes(itemIdentifier)) throw new TypeError(`Toolbar "${this.identifier}" does not allow "${itemIdentifier}".`);
  }

  #setState(change: Partial<NSEToolbarPreferences>): void {
    this.#state = Object.freeze({ ...this.#state, ...change });
    this.notifyObservers();
  }
}
