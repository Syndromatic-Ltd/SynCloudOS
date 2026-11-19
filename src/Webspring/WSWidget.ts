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
import { NSEViewController, type NSEViewControllerOptions } from "../NSE/sdkPackageEntry";
import { action } from "../SynCloudOS/AppSDK";
import type { LocalisedText, WSActionResult } from "./webspringTypes";

export const defaultWSWidgetTimeout = 10_000;

/** Where a widget's load stands. */
export type WSWidgetState<TData = unknown> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: TData }
  | { readonly status: "empty" }
  | { readonly status: "error"; readonly reason: "failed" | "timeout" };

/** The timers a widget schedules its time limits with. */
export interface WSWidgetTimers {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Host services bound to a mounted widget by `WSWidgetShelfView`. */
export interface WSWidgetHostBinding {
  readonly timers?: WSWidgetTimers;
  readonly navigate: (route: string) => Promise<WSActionResult>;
}

/** @internal Binds host timers and navigation to a live widget instance. */
export const wsBindWidgetHost: unique symbol = Symbol("ws.bindWidgetHost");
/** @internal Starts a widget's initial load once host bindings are ready. */
export const wsStartWidgetLoad: unique symbol = Symbol("ws.startWidgetLoad");

/** A widget class extending `WSWidget`. */
export type WSWidgetClass<TData = unknown> = (new (options?: NSEViewControllerOptions) => WSWidget<TData>) & {
  readonly id: string;
  readonly title: LocalisedText | string;
  readonly icon?: string;
  readonly order?: number;
  readonly whenEmpty: "hide" | { readonly message: string };
  readonly timeout?: number;
};

/** Validated static metadata captured from a `WSWidget` subclass. */
export interface WSWidgetDescriptor {
  readonly id: string;
  readonly order: number;
  readonly title: LocalisedText;
  readonly icon?: string;
  readonly whenEmpty: "hide" | { readonly message: LocalisedText };
  readonly timeout: number;
  readonly WidgetClass: WSWidgetClass;
}

const defaultTimers: WSWidgetTimers = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
};

const loadingState: WSWidgetState<never> = Object.freeze({ status: "loading" });
const emptyState: WSWidgetState<never> = Object.freeze({ status: "empty" });
const failedState: WSWidgetState<never> = Object.freeze({ status: "error", reason: "failed" });
const timedOutState: WSWidgetState<never> = Object.freeze({ status: "error", reason: "timeout" });

/**
 * Base class for Webspring widgets shown on the shelf below launcher icons.
 * Subclasses declare metadata statics, implement `load(signal)`, and render
 * through `renderView()` or `static view`.
 */
export abstract class WSWidget<TData = unknown> extends NSEViewController {
  static id: string;
  static title: LocalisedText | string;
  static icon?: string;
  static order = 0;
  static whenEmpty: "hide" | { readonly message: string };
  static timeout = defaultWSWidgetTimeout;

  #state: WSWidgetState<TData> = loadingState;
  #generation = 0;
  #abort: AbortController | null = null;
  #timer: unknown = undefined;
  #timers: WSWidgetTimers = defaultTimers;
  #navigate: ((route: string) => Promise<WSActionResult>) | null = null;

  /** Current load state for this widget. */
  get state(): WSWidgetState<TData> {
    return this.#state;
  }

  /** Loaded widget data; throws unless `state.status === "ready"`. */
  get data(): TData {
    if (this.#state.status !== "ready") {
      throw new TypeError("WSWidget data is only available when the widget state is ready.");
    }
    return this.#state.data;
  }

  /** Fetches the widget's data; `signal` aborts on refresh, timeout or disposal. */
  abstract load(signal: AbortSignal): Promise<TData> | TData;

  /** Defaults to treating an empty array, `null` and `undefined` as empty. */
  isEmpty(data: TData): boolean {
    return data === null || data === undefined || (Array.isArray(data) && data.length === 0);
  }

  /** Aborts any in-flight load and starts a fresh one. */
  @action refresh(): void {
    if (this.isDisposed) return;
    this.#startLoad();
  }

  /** Opens a declared route through shell navigation. */
  navigate(route: string): Promise<WSActionResult> {
    if (this.isDisposed || !this.#navigate) {
      return Promise.resolve({ status: "failed", message: "Widget navigation requires a mounted Webspring shelf." });
    }
    return this.#navigate(route);
  }

  /** @internal */
  [wsBindWidgetHost](binding: WSWidgetHostBinding): void {
    this.#timers = binding.timers ?? defaultTimers;
    this.#navigate = binding.navigate;
  }

  /** @internal */
  [wsStartWidgetLoad](): void {
    if (this.isDisposed) return;
    this.#startLoad();
  }

  protected override didDispose(): void {
    this.#settle();
  }

  #settle(): void {
    this.#generation += 1;
    if (this.#timer !== undefined) this.#timers.clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#abort?.abort();
    this.#abort = null;
  }

  #publish(next: WSWidgetState<TData>): void {
    if (this.isDisposed) return;
    this.#state = next;
    this.notifyObservers();
  }

  #startLoad(): void {
    this.#settle();
    const generation = this.#generation;
    const abort = new AbortController();
    this.#abort = abort;
    this.#publish(loadingState);

    const finish = (state: WSWidgetState<TData>) => {
      if (this.isDisposed || this.#generation !== generation) return;
      // A load that has settled is not aborted: the signal fires only for a load cut short.
      this.#abort = null;
      this.#settle();
      this.#publish(state);
    };

    const configuredTimeout = (this.constructor as { readonly timeout?: number }).timeout;
    const timeout = typeof configuredTimeout === "number" && Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : defaultWSWidgetTimeout;

    this.#timer = this.#timers.setTimeout(() => {
      if (this.isDisposed || this.#generation !== generation) return;
      this.#settle();
      this.#publish(timedOutState);
    }, timeout);

    let pending: Promise<TData>;
    try {
      pending = Promise.resolve(this.load(abort.signal));
    } catch (error) {
      pending = Promise.reject(error);
    }

    pending.then(
      (data) => {
        let empty: boolean;
        try { empty = this.isEmpty(data); } catch { finish(failedState); return; }
        finish(empty ? emptyState : Object.freeze({ status: "ready" as const, data }));
      },
      () => finish(failedState),
    );
  }
}

const capturedDescriptors = new WeakSet<WSWidgetDescriptor>();

/** True only for descriptors returned by `captureWSWidgetClass`. */
export function isWSWidgetDescriptor(value: unknown): value is WSWidgetDescriptor {
  return typeof value === "object" && value !== null && capturedDescriptors.has(value as WSWidgetDescriptor);
}

function readOwnData(input: object, key: string): unknown {
  const own = Object.getOwnPropertyDescriptor(input, key);
  if (!own) return undefined;
  if (!("value" in own)) throw new TypeError(`Widget ${key} must be a data property, not an accessor.`);
  return own.value;
}

function readStaticProperty(ctor: Function, key: string): unknown {
  for (
    let current: unknown = ctor;
    typeof current === "function" && current !== WSWidget && current !== Function.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    const own = Object.getOwnPropertyDescriptor(current, key);
    if (own) {
      if (!("value" in own)) {
        throw new TypeError(`Widget static ${key} must be a data property, not an accessor.`);
      }
      return own.value;
    }
  }
  return undefined;
}

function isComponent(value: unknown): value is ComponentType<never> {
  if (typeof value === "function") return true;
  if (typeof value !== "object" || value === null) return false;
  const reactType = Object.getOwnPropertyDescriptor(value, "$$typeof");
  return Boolean(reactType && "value" in reactType && (
    reactType.value === Symbol.for("react.memo") || reactType.value === Symbol.for("react.forward_ref")
  ));
}

function localised(text: unknown, key: string, label: string): LocalisedText {
  if (typeof text === "string") {
    if (text.trim() === "") throw new TypeError(`${label} must be nonempty.`);
    return Object.freeze({ key, fallback: text });
  }
  if (typeof text === "object" && text !== null) {
    const recordKey = readOwnData(text, "key");
    const fallback = readOwnData(text, "fallback");
    if (typeof recordKey === "string" && recordKey !== "" && (fallback === undefined || typeof fallback === "string")) {
      return Object.freeze({ key: recordKey, ...(fallback === undefined ? {} : { fallback }) });
    }
  }
  throw new TypeError(`${label} must be a string or a localised text with a key.`);
}

/** Validates a `WSWidget` subclass and freezes its metadata descriptor. */
export function captureWSWidgetClass(value: unknown): WSWidgetDescriptor {
  if (typeof value !== "function" || !(value.prototype instanceof WSWidget)) {
    throw new TypeError("Widgets must be a class extending WSWidget.");
  }
  const rawId = readStaticProperty(value, "id");
  if (typeof rawId !== "string" || rawId.trim() === "") {
    throw new TypeError("A widget needs a nonempty static id.");
  }
  const id = rawId.trim();
  const label = `Widget ${id}`;

  const rawOrder = readStaticProperty(value, "order");
  if (rawOrder !== undefined && (typeof rawOrder !== "number" || !Number.isFinite(rawOrder))) {
    throw new TypeError(`${label} order must be a finite number.`);
  }
  const order = rawOrder === undefined ? 0 : rawOrder;

  const rawView = readStaticProperty(value, "view");
  if (rawView !== undefined && !isComponent(rawView)) {
    throw new TypeError(`${label} needs a React component as its static view.`);
  }
  const hasRenderView = typeof (value.prototype as { renderView?: unknown }).renderView === "function";
  if (rawView !== undefined && hasRenderView) {
    throw new TypeError(`${value.name} declares both static view and renderView; choose one rendering form.`);
  }
  if (rawView === undefined && !hasRenderView) {
    throw new TypeError(`${label} requires a static view or renderView method.`);
  }
  if (typeof (value.prototype as { load?: unknown }).load !== "function") {
    throw new TypeError(`${label} needs a load method.`);
  }

  const icon = readStaticProperty(value, "icon");
  if (icon !== undefined && (typeof icon !== "string" || icon.trim() === "")) {
    throw new TypeError(`${label} icon must be a nonempty resource path.`);
  }

  const rawTimeout = readStaticProperty(value, "timeout");
  if (rawTimeout !== undefined && (typeof rawTimeout !== "number" || !Number.isFinite(rawTimeout) || rawTimeout <= 0)) {
    throw new TypeError(`${label} timeout must be a positive number of milliseconds.`);
  }
  const timeout = rawTimeout === undefined ? defaultWSWidgetTimeout : rawTimeout;

  const rawWhenEmpty = readStaticProperty(value, "whenEmpty");
  let whenEmpty: WSWidgetDescriptor["whenEmpty"];
  if (rawWhenEmpty === "hide") {
    whenEmpty = "hide";
  } else if (typeof rawWhenEmpty === "object" && rawWhenEmpty !== null) {
    const message = readOwnData(rawWhenEmpty, "message");
    if (typeof message === "string" && message.trim() !== "") {
      whenEmpty = Object.freeze({ message: Object.freeze({ key: `widgets.${id}.empty`, fallback: message }) });
    } else {
      throw new TypeError(`${label} whenEmpty must be "hide" or { message }.`);
    }
  } else {
    throw new TypeError(`${label} whenEmpty must be "hide" or { message }.`);
  }

  const descriptor: WSWidgetDescriptor = Object.freeze({
    id,
    order,
    title: localised(readStaticProperty(value, "title"), `widgets.${id}.title`, `${label} title`),
    ...(icon === undefined ? {} : { icon }),
    whenEmpty,
    timeout,
    WidgetClass: value as WSWidgetClass,
  });
  capturedDescriptors.add(descriptor);
  return descriptor;
}
