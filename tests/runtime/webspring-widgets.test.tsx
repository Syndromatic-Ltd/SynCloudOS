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

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { WebspringWidgetShelf } from "../../src/Webspring/WebspringWidgetShelf";
import { WebspringSurface } from "../../src/Webspring/webspringSurface";
import { WebspringWidgetController, defineWidget } from "../../src/Webspring/webspringWidget";
import type { WebspringWidget, WebspringWidgetEntry, WebspringWidgetViewProps } from "../../src/Webspring/webspringTypes";
import { createTestRuntime } from "./helpers";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function Items({ data }: WebspringWidgetViewProps<readonly string[]>) {
  return <ul>{data.map((item) => <li key={item}>{item}</li>)}</ul>;
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("defineWidget", () => {
  it("fills in the title, the empty rule and a ten second time limit", () => {
    const widget = defineWidget({ id: "latest", title: "Latest", load: () => [] as readonly string[], view: Items, whenEmpty: "hide" });
    expect(widget.timeout).toBe(10_000);
    expect(widget.title).toEqual({ key: "widgets.latest.title", fallback: "Latest" });
    expect([[], null, undefined].map(widget.isEmpty)).toEqual([true, true, true]);
    expect([["one"], "text", 0].map(widget.isEmpty)).toEqual([false, false, false]);
  });

  it("uses the developer's own emptiness rule", () => {
    const widget = defineWidget({ id: "count", title: "Count", load: () => 0, view: () => null, whenEmpty: "hide", isEmpty: (total) => total === 0 });
    expect(widget.isEmpty(0)).toBe(true);
    expect(widget.isEmpty(3)).toBe(false);
  });

  it("rejects definitions the framework cannot run", () => {
    const valid = { id: "latest", title: "Latest", load: () => [], view: () => null, whenEmpty: "hide" } as const;
    expect(() => defineWidget({ ...valid, id: "" })).toThrow(/id/iu);
    expect(() => defineWidget({ ...valid, load: undefined as never })).toThrow(/load/iu);
    expect(() => defineWidget({ ...valid, view: undefined as never })).toThrow(/view/iu);
    expect(() => defineWidget({ ...valid, whenEmpty: undefined as never })).toThrow(/whenEmpty/iu);
    expect(() => defineWidget({ ...valid, timeout: 0 })).toThrow(/timeout/iu);
  });
});

describe("WebspringWidgetController", () => {
  it("moves from loading to ready with the loaded data", async () => {
    const load = deferred<readonly string[]>();
    const controller = new WebspringWidgetController([defineWidget({ id: "latest", title: "Latest", load: () => load.promise, view: Items, whenEmpty: "hide" })]);
    controller.start();
    expect(controller.getSnapshot()).toEqual([{ status: "loading" }]);
    load.resolve(["one"]);
    await settle();
    expect(controller.getSnapshot()).toEqual([{ status: "ready", data: ["one"] }]);
    controller.dispose();
  });

  it("reports an empty result and a rejected load as different states", async () => {
    const controller = new WebspringWidgetController([
      defineWidget({ id: "none", title: "None", load: async () => [] as readonly string[], view: Items, whenEmpty: "hide" }),
      defineWidget({ id: "broken", title: "Broken", load: async (): Promise<readonly string[]> => { throw new Error("offline"); }, view: Items, whenEmpty: "hide" }),
    ]);
    controller.start();
    await settle();
    expect(controller.getSnapshot()).toEqual([{ status: "empty" }, { status: "error", reason: "failed" }]);
    controller.dispose();
  });

  it("turns a load that never settles into a timeout error and aborts it", async () => {
    let signal!: AbortSignal;
    const controller = new WebspringWidgetController([defineWidget({
      id: "hung", title: "Hung", view: Items, whenEmpty: "hide",
      load: (given) => { signal = given; return new Promise<readonly string[]>(() => undefined); },
    })]);
    controller.start();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(controller.getSnapshot()).toEqual([{ status: "loading" }]);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.getSnapshot()).toEqual([{ status: "error", reason: "timeout" }]);
    expect(signal.aborted).toBe(true);
    controller.dispose();
  });

  it("honours a widget's own time limit and ignores a result that arrives after it", async () => {
    const late = deferred<readonly string[]>();
    const controller = new WebspringWidgetController([defineWidget({ id: "slow", title: "Slow", load: () => late.promise, view: Items, whenEmpty: "hide", timeout: 500 })]);
    controller.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(controller.getSnapshot()).toEqual([{ status: "error", reason: "timeout" }]);
    late.resolve(["too late"]);
    await settle();
    expect(controller.getSnapshot()).toEqual([{ status: "error", reason: "timeout" }]);
    controller.dispose();
  });

  it("aborts a pending load when it is disposed, and nothing it reports afterwards is used", async () => {
    const load = deferred<readonly string[]>();
    let signal!: AbortSignal;
    const controller = new WebspringWidgetController([defineWidget({ id: "latest", title: "Latest", view: Items, whenEmpty: "hide", load: (given) => { signal = given; return load.promise; } })]);
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.start();
    listener.mockClear();
    controller.dispose();
    expect(signal.aborted).toBe(true);
    load.resolve(["ignored"]);
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not abort a load that has already settled", async () => {
    let signal!: AbortSignal;
    const controller = new WebspringWidgetController([defineWidget({ id: "latest", title: "Latest", view: Items, whenEmpty: "hide", load: async (given) => { signal = given; return ["one"] as readonly string[]; } })]);
    controller.start();
    await settle();
    controller.dispose();
    expect(signal.aborted).toBe(false);
  });

  it("aborts the previous load on refresh and keeps only the newest result", async () => {
    const loads = [deferred<readonly string[]>(), deferred<readonly string[]>()];
    const signals: AbortSignal[] = [];
    const controller = new WebspringWidgetController([defineWidget({
      id: "latest", title: "Latest", view: Items, whenEmpty: "hide",
      load: (given) => { signals.push(given); return loads[signals.length - 1]!.promise; },
    })]);
    controller.start();
    controller.refresh("latest");
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
    loads[1]!.resolve(["fresh"]);
    await settle();
    loads[0]!.resolve(["stale"]);
    await settle();
    expect(controller.getSnapshot()).toEqual([{ status: "ready", data: ["fresh"] }]);
    controller.dispose();
  });

  it("runs again after being disposed", async () => {
    const load = vi.fn(async () => ["one"] as readonly string[]);
    const controller = new WebspringWidgetController([defineWidget({ id: "latest", title: "Latest", load, view: Items, whenEmpty: "hide" })]);
    controller.start();
    controller.dispose();
    controller.start();
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toEqual([{ status: "ready", data: ["one"] }]);
    controller.dispose();
  });
});

describe("WebspringWidgetShelf", () => {
  const runtimes: SynCloudOSRuntime[] = [];

  afterEach(async () => {
    for (const runtime of runtimes.splice(0)) await runtime.dispose({ reason: "test-complete", inFlight: "cancel" });
  });

  const entryFor = (widget: WebspringWidget, title = "Latest"): WebspringWidgetEntry => ({
    widget,
    title,
    iconUrl: null,
    emptyMessage: widget.whenEmpty === "hide" ? null : widget.whenEmpty.message.fallback ?? null,
  });

  function renderShelf(entries: readonly WebspringWidgetEntry[]) {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    return render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringWidgetShelf entries={entries} surface={WebspringSurface.plain("#101418")} />
      </SynCloudOSProvider>,
    );
  }

  it("draws no shelf without widgets", async () => {
    const view = renderShelf([]);
    await act(settle);
    expect(view.container.querySelector(".webspring-widget-shelf")).toBeNull();
  });

  it("shows a loading state, then the developer's view with the loaded data", async () => {
    const load = deferred<readonly string[]>();
    const widget = defineWidget({ id: "latest", title: "Latest", load: () => load.promise, view: Items, whenEmpty: "hide" });
    const view = renderShelf([entryFor(widget)]);
    await act(settle);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(view.container.querySelector("[data-widget-id='latest']")?.getAttribute("data-widget-state")).toBe("loading");
    load.resolve(["First post", "Second post"]);
    await act(settle);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["First post", "Second post"]);
    expect(screen.getByRole("heading", { name: "Latest" })).toBeTruthy();
    expect(view.container.querySelector("[data-widget-id='latest']")?.getAttribute("data-widget-state")).toBe("ready");
  });

  it("hides the whole shelf when its only widget is empty and set to hide", async () => {
    const widget = defineWidget({ id: "latest", title: "Latest", load: async () => [] as readonly string[], view: Items, whenEmpty: "hide" });
    const view = renderShelf([entryFor(widget)]);
    await act(settle);
    expect(view.container.querySelector(".webspring-widget-shelf")).toBeNull();
  });

  it("shows the empty message, and keeps showing the widgets that have data", async () => {
    const empty = defineWidget({ id: "inbox", title: "Inbox", load: async () => [] as readonly string[], view: Items, whenEmpty: { message: "Nothing new." } });
    const hidden = defineWidget({ id: "quiet", title: "Quiet", load: async () => [] as readonly string[], view: Items, whenEmpty: "hide" });
    const full = defineWidget({ id: "latest", title: "Latest", load: async () => ["A post"] as readonly string[], view: Items, whenEmpty: "hide" });
    const view = renderShelf([entryFor(empty, "Inbox"), entryFor(hidden, "Quiet"), entryFor(full)]);
    await act(settle);
    expect(screen.getByText("Nothing new.")).toBeTruthy();
    expect(screen.getByText("A post")).toBeTruthy();
    expect([...view.container.querySelectorAll("[data-widget-id]")].map((element) => element.getAttribute("data-widget-id"))).toEqual(["inbox", "latest"]);
  });

  it("shows an error with Retry, and Retry loads again", async () => {
    const load = vi.fn<(signal: AbortSignal) => Promise<readonly string[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(["Back online"]);
    const widget = defineWidget({ id: "latest", title: "Latest", load, view: Items, whenEmpty: "hide" });
    renderShelf([entryFor(widget)]);
    await act(settle);
    expect(screen.getByRole("alert").textContent).toBe("This could not be loaded.");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry" })); await settle(); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Back online")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("turns a load that never settles into a timeout error with Retry", async () => {
    let signal!: AbortSignal;
    const widget = defineWidget({
      id: "latest", title: "Latest", view: Items, whenEmpty: "hide",
      load: (given) => { signal = given; return new Promise<readonly string[]>(() => undefined); },
    });
    renderShelf([entryFor(widget)]);
    await act(settle);
    expect(screen.getByRole("status")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByRole("alert").textContent).toBe("This is taking too long to load.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(signal.aborted).toBe(true);
  });

  it("aborts a pending load when the shelf unmounts", async () => {
    let signal!: AbortSignal;
    const widget = defineWidget({
      id: "latest", title: "Latest", view: Items, whenEmpty: "hide",
      load: (given) => { signal = given; return new Promise<readonly string[]>(() => undefined); },
    });
    const view = renderShelf([entryFor(widget)]);
    await act(settle);
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it("shows the error state when a widget's own view throws, and leaves its neighbours alone", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = defineWidget({ id: "broken", title: "Broken", load: async () => ["x"] as readonly string[], view: () => { throw new Error("render failed"); }, whenEmpty: "hide" });
    const fine = defineWidget({ id: "latest", title: "Latest", load: async () => ["A post"] as readonly string[], view: Items, whenEmpty: "hide" });
    renderShelf([entryFor(broken, "Broken"), entryFor(fine)]);
    await act(settle);
    expect(screen.getByRole("alert").textContent).toBe("This could not be loaded.");
    expect(screen.getByText("A post")).toBeTruthy();
    consoleError.mockRestore();
  });
});
