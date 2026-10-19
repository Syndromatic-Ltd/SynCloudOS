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

import type { LocalisedText, WebspringWidget, WebspringWidgetInput } from "./webspringTypes";

export const defaultWebspringWidgetTimeout = 10_000;

/** Empty arrays, `null` and `undefined`. */
const isEmptyByDefault = (data: unknown) => data === null || data === undefined || (Array.isArray(data) && data.length === 0);

function localised(text: LocalisedText | string, key: string, label: string): LocalisedText {
  if (typeof text === "string") {
    if (text.trim() === "") throw new TypeError(`${label} must be nonempty.`);
    return Object.freeze({ key, fallback: text });
  }
  if (typeof text !== "object" || text === null || typeof text.key !== "string" || text.key === "") {
    throw new TypeError(`${label} must be a string or a localised text with a key.`);
  }
  return Object.freeze({ key: text.key, ...(text.fallback === undefined ? {} : { fallback: text.fallback }) });
}

const definedWidgets = new WeakSet<object>();

/**
 * Declares a widget: a titled panel on the Board that loads its own data. The framework draws
 * the loading, empty, error and timeout states; `view` draws the data once it has loaded.
 *
 * ```ts
 * export const latest = defineWidget({
 *   id: "latest",
 *   title: "Latest",
 *   load: (signal) => fetchPosts(signal),
 *   view: LatestView,
 *   whenEmpty: "hide",
 * });
 * ```
 */
export function defineWidget<TData>(input: WebspringWidgetInput<TData>): WebspringWidget {
  if (typeof input !== "object" || input === null) throw new TypeError("A widget definition must be an object.");
  const { id, title, icon, load, view, whenEmpty, isEmpty, timeout } = input;
  if (typeof id !== "string" || id.trim() === "") throw new TypeError("A widget needs a nonempty id.");
  const label = `Widget ${id}`;
  if (typeof load !== "function") throw new TypeError(`${label} needs a load function.`);
  if (typeof view !== "function" && (typeof view !== "object" || view === null)) throw new TypeError(`${label} needs a React component as its view.`);
  if (icon !== undefined && (typeof icon !== "string" || icon.trim() === "")) throw new TypeError(`${label} icon must be a nonempty resource path.`);
  if (isEmpty !== undefined && typeof isEmpty !== "function") throw new TypeError(`${label} isEmpty must be a function.`);
  if (timeout !== undefined && (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0)) {
    throw new TypeError(`${label} timeout must be a positive number of milliseconds.`);
  }
  let empty: WebspringWidget["whenEmpty"];
  if (whenEmpty === "hide") empty = "hide";
  else if (typeof whenEmpty === "object" && whenEmpty !== null && typeof whenEmpty.message === "string" && whenEmpty.message.trim() !== "") {
    empty = Object.freeze({ message: Object.freeze({ key: `widgets.${id}.empty`, fallback: whenEmpty.message }) });
  } else throw new TypeError(`${label} whenEmpty must be "hide" or { message }.`);

  const widget: WebspringWidget = Object.freeze({
    id,
    title: localised(title, `widgets.${id}.title`, `${label} title`),
    ...(icon === undefined ? {} : { icon }),
    load: async (signal: AbortSignal) => load(signal),
    view: view as WebspringWidget["view"],
    whenEmpty: empty,
    isEmpty: isEmpty ? (data: unknown) => isEmpty(data as TData) : isEmptyByDefault,
    timeout: timeout ?? defaultWebspringWidgetTimeout,
  });
  definedWidgets.add(widget);
  return widget;
}

/** Whether `value` came from `defineWidget`. */
export function isDefinedWebspringWidget(value: unknown): value is WebspringWidget {
  return typeof value === "object" && value !== null && definedWidgets.has(value);
}

/** Where a widget's load stands. */
export type WebspringWidgetState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: unknown }
  | { readonly status: "empty" }
  | { readonly status: "error"; readonly reason: "failed" | "timeout" };

/** The timers a controller schedules its time limits with. */
export interface WebspringWidgetTimers {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

const loadingState: WebspringWidgetState = Object.freeze({ status: "loading" });
const emptyState: WebspringWidgetState = Object.freeze({ status: "empty" });
const failedState: WebspringWidgetState = Object.freeze({ status: "error", reason: "failed" });
const timedOutState: WebspringWidgetState = Object.freeze({ status: "error", reason: "timeout" });

interface WidgetRun {
  generation: number;
  abort: AbortController | null;
  timer: unknown;
}

/**
 * Loads a set of widgets and holds each one's state. A load is aborted when the controller is
 * disposed, when the widget is retried or refreshed, and when it outlives its timeout, which
 * also turns it into an error: a load that never settles cannot leave a widget loading.
 */
export class WebspringWidgetController {
  private snapshot: readonly WebspringWidgetState[];
  private readonly runs: WidgetRun[];
  private readonly listeners = new Set<() => void>();
  private active = false;

  constructor(
    private readonly widgets: readonly WebspringWidget[],
    private readonly timers: WebspringWidgetTimers = { setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds), clearTimeout: (handle) => globalThis.clearTimeout(handle as number) },
  ) {
    this.snapshot = Object.freeze(widgets.map(() => loadingState));
    this.runs = widgets.map(() => ({ generation: 0, abort: null, timer: undefined }));
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Loads every widget. Calling it again while active does nothing; after `dispose` it loads afresh. */
  start() {
    if (this.active) return;
    this.active = true;
    for (let index = 0; index < this.widgets.length; index += 1) this.load(index);
  }

  /** Loads one widget again, showing its loading state until it settles. */
  refresh(widgetId: string) {
    if (!this.active) return;
    const index = this.widgets.findIndex((widget) => widget.id === widgetId);
    if (index >= 0) this.load(index);
  }

  dispose() {
    this.active = false;
    for (let index = 0; index < this.runs.length; index += 1) this.settle(index);
  }

  /** Ends the widget's current load: nothing it reports afterwards is used. */
  private settle(index: number) {
    const run = this.runs[index]!;
    run.generation += 1;
    if (run.timer !== undefined) this.timers.clearTimeout(run.timer);
    run.timer = undefined;
    run.abort?.abort();
    run.abort = null;
  }

  private publish(index: number, state: WebspringWidgetState) {
    const next = [...this.snapshot];
    next[index] = state;
    this.snapshot = Object.freeze(next);
    for (const listener of [...this.listeners]) listener();
  }

  private load(index: number) {
    const widget = this.widgets[index]!;
    this.settle(index);
    const run = this.runs[index]!;
    const generation = run.generation;
    const abort = new AbortController();
    run.abort = abort;
    this.publish(index, loadingState);

    const finish = (state: WebspringWidgetState) => {
      if (run.generation !== generation) return;
      // A load that has settled is not aborted: the signal fires only for a load cut short.
      run.abort = null;
      this.settle(index);
      this.publish(index, state);
    };
    run.timer = this.timers.setTimeout(() => {
      if (run.generation !== generation) return;
      // The load is told to stop, and whatever it reports later is ignored.
      this.settle(index);
      this.publish(index, timedOutState);
    }, widget.timeout);

    widget.load(abort.signal).then(
      (data) => {
        let empty: boolean;
        try { empty = widget.isEmpty(data); } catch { finish(failedState); return; }
        finish(empty ? emptyState : Object.freeze({ status: "ready" as const, data }));
      },
      () => finish(failedState),
    );
  }
}
