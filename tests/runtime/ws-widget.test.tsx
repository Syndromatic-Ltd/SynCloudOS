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
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { WSSurface } from "../../src/Webspring/WSSurface";
import {
  WSWidget,
  captureWSWidgetClass,
  wsBindWidgetHost,
  wsStartWidgetLoad,
} from "../../src/Webspring/WSWidget";
import { WSWidgetShelfView } from "../../src/Webspring/WSWidgetShelfView";
import type { WSWidgetEntry } from "../../src/Webspring/webspringTypes";
import { createTestBundle, createTestRuntime } from "./helpers";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function Items({ data }: { readonly data: readonly string[] }) {
  return <ul>{data.map((item) => <li key={item}>{item}</li>)}</ul>;
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("captureWSWidgetClass", () => {
  it("captures a finite discovery order and defaults it to zero", () => {
    class DefaultOrderWidget extends WSWidget<readonly string[]> {
      static override id = "ordered";
      static override title = "Ordered";
      static override whenEmpty = "hide" as const;
      override load() { return []; }
      override renderView() { return null; }
    }
    class NegativeOrderWidget extends WSWidget<readonly string[]> {
      static override id = "ordered";
      static override title = "Ordered";
      static override order = -10;
      static override whenEmpty = "hide" as const;
      override load() { return []; }
      override renderView() { return null; }
    }
    expect(captureWSWidgetClass(DefaultOrderWidget).order).toBe(0);
    expect(captureWSWidgetClass(NegativeOrderWidget).order).toBe(-10);

    for (const order of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "one"]) {
      class BadOrderWidget extends WSWidget<readonly string[]> {
        static override id = "ordered";
        static override title = "Ordered";
        static override order = order as number;
        static override whenEmpty = "hide" as const;
        override load() { return []; }
        override renderView() { return null; }
      }
      expect(() => captureWSWidgetClass(BadOrderWidget)).toThrow(/order/i);
    }
  });

  it("fills in the title, empty rule, timeout and default isEmpty", () => {
    class LatestWidget extends WSWidget<unknown> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return []; }
      override renderView() { return <Items data={this.data as readonly string[]} />; }
    }
    const descriptor = captureWSWidgetClass(LatestWidget);
    expect(descriptor.timeout).toBe(10_000);
    expect(descriptor.title).toEqual({ key: "widgets.latest.title", fallback: "Latest" });

    const lifetime = new AbortController();
    const instance = new descriptor.WidgetClass({ ownerSignal: lifetime.signal });
    expect([[], null, undefined].map((value) => instance.isEmpty(value))).toEqual([true, true, true]);
    expect([["one"], "text", 0].map((value) => instance.isEmpty(value))).toEqual([false, false, false]);
    lifetime.abort();
  });

  it("uses the subclass isEmpty override", () => {
    class CountWidget extends WSWidget<number> {
      static override id = "count";
      static override title = "Count";
      static override whenEmpty = "hide" as const;
      override load() { return 0; }
      override isEmpty(total: number) { return total === 0; }
      override renderView() { return null; }
    }
    const lifetime = new AbortController();
    const instance = new CountWidget({ ownerSignal: lifetime.signal });
    expect(instance.isEmpty(0)).toBe(true);
    expect(instance.isEmpty(3)).toBe(false);
    lifetime.abort();
  });

  it("rejects non-subclasses and malformed classes without invoking accessors", () => {
    expect(() => captureWSWidgetClass({})).toThrow(/extending WSWidget/);
    expect(() => captureWSWidgetClass(() => null)).toThrow(/extending WSWidget/);
    expect(() => captureWSWidgetClass(WSWidget)).toThrow(/extending WSWidget/);

    class EmptyIdWidget extends WSWidget<unknown> {
      static override id = "";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return []; }
      override renderView() { return null; }
    }
    expect(() => captureWSWidgetClass(EmptyIdWidget)).toThrow(/id/iu);

    class NoLoadWidget extends (WSWidget as unknown as { new(): WSWidget<unknown> }) {
      static id = "latest";
      static title = "Latest";
      static whenEmpty = "hide" as const;
      renderView() { return null; }
    }
    expect(() => captureWSWidgetClass(NoLoadWidget)).toThrow(/load/iu);

    class NoViewWidget extends WSWidget<unknown> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return []; }
    }
    expect(() => captureWSWidgetClass(NoViewWidget)).toThrow(/view/iu);

    class BadStaticViewWidget extends WSWidget<unknown> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      static override view = "nope" as never;
      override load() { return []; }
    }
    expect(() => captureWSWidgetClass(BadStaticViewWidget)).toThrow(/view/iu);

    class BothViewsWidget extends WSWidget<unknown> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      static override view = (() => null) as never;
      override load() { return []; }
      override renderView() { return null; }
    }
    expect(() => captureWSWidgetClass(BothViewsWidget)).toThrow(/both/iu);

    class BadEmptyWidget extends WSWidget<unknown> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = undefined as never;
      override load() { return []; }
      override renderView() { return null; }
    }
    expect(() => captureWSWidgetClass(BadEmptyWidget)).toThrow(/whenEmpty/iu);

    class BadTimeoutWidget extends WSWidget<unknown> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      static override timeout = 0;
      override load() { return []; }
      override renderView() { return null; }
    }
    expect(() => captureWSWidgetClass(BadTimeoutWidget)).toThrow(/timeout/iu);

    class BadIconWidget extends WSWidget<unknown> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      static override icon = "";
      override load() { return []; }
      override renderView() { return null; }
    }
    expect(() => captureWSWidgetClass(BadIconWidget)).toThrow(/icon/iu);

    const getter = vi.fn(() => "latest");
    class AccessorWidget extends WSWidget<unknown> {
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return []; }
      override renderView() { return null; }
    }
    Object.defineProperty(AccessorWidget, "id", { enumerable: true, get: getter });
    expect(() => captureWSWidgetClass(AccessorWidget)).toThrow(/accessor/i);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("WSWidget lifecycle", () => {
  it("moves from loading to ready and guards data until ready", async () => {
    const load = deferred<readonly string[]>();
    class LatestWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return load.promise; }
      override renderView() { return <Items data={this.data} />; }
    }
    const lifetime = new AbortController();
    const widget = new LatestWidget({ ownerSignal: lifetime.signal });
    widget[wsStartWidgetLoad]();
    expect(widget.state).toEqual({ status: "loading" });
    expect(() => widget.data).toThrow(TypeError);

    load.resolve(["one"]);
    await settle();
    expect(widget.state).toEqual({ status: "ready", data: ["one"] });
    expect(widget.data).toEqual(["one"]);
    lifetime.abort();
  });

  it("reports empty and rejected loads as distinct states", async () => {
    class EmptyWidget extends WSWidget<readonly string[]> {
      static override id = "none";
      static override title = "None";
      static override whenEmpty = "hide" as const;
      override async load() { return []; }
      override renderView() { return null; }
    }
    class BrokenWidget extends WSWidget<readonly string[]> {
      static override id = "broken";
      static override title = "Broken";
      static override whenEmpty = "hide" as const;
      override async load(): Promise<readonly string[]> { throw new Error("offline"); }
      override renderView() { return null; }
    }
    const lifetime = new AbortController();
    const empty = new EmptyWidget({ ownerSignal: lifetime.signal });
    const broken = new BrokenWidget({ ownerSignal: lifetime.signal });
    empty[wsStartWidgetLoad]();
    broken[wsStartWidgetLoad]();
    await settle();
    expect(empty.state).toEqual({ status: "empty" });
    expect(broken.state).toEqual({ status: "error", reason: "failed" });
    lifetime.abort();
  });

  it("times out at static timeout and ignores late results", async () => {
    const late = deferred<readonly string[]>();
    let signal!: AbortSignal;
    class SlowWidget extends WSWidget<readonly string[]> {
      static override id = "slow";
      static override title = "Slow";
      static override whenEmpty = "hide" as const;
      static override timeout = 50;
      override load(given: AbortSignal) { signal = given; return late.promise; }
      override renderView() { return <Items data={this.data} />; }
    }
    const lifetime = new AbortController();
    const widget = new SlowWidget({ ownerSignal: lifetime.signal });
    widget[wsBindWidgetHost]({ timers: globalThis, navigate: async () => ({ status: "completed" }) });
    widget[wsStartWidgetLoad]();

    await vi.advanceTimersByTimeAsync(49);
    expect(widget.state).toEqual({ status: "loading" });
    expect(signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(widget.state).toEqual({ status: "error", reason: "timeout" });
    expect(signal.aborted).toBe(true);

    late.resolve(["too late"]);
    await settle();
    expect(widget.state).toEqual({ status: "error", reason: "timeout" });
    lifetime.abort();
  });

  it("refresh aborts the previous run", async () => {
    const loads = [deferred<readonly string[]>(), deferred<readonly string[]>()];
    const signals: AbortSignal[] = [];
    class RefreshWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load(given: AbortSignal) {
        signals.push(given);
        return loads[signals.length - 1]!.promise;
      }
      override renderView() { return <Items data={this.data} />; }
    }
    const lifetime = new AbortController();
    const widget = new RefreshWidget({ ownerSignal: lifetime.signal });
    widget.refresh();
    widget.refresh();
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);

    loads[1]!.resolve(["fresh"]);
    await settle();
    loads[0]!.resolve(["stale"]);
    await settle();
    expect(widget.state).toEqual({ status: "ready", data: ["fresh"] });
    lifetime.abort();
  });

  it("aborts pending load on direct disposal without setting state afterwards", async () => {
    const load = deferred<readonly string[]>();
    let signal!: AbortSignal;
    class PendingWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load(given: AbortSignal) { signal = given; return load.promise; }
      override renderView() { return null; }
    }
    const lifetime = new AbortController();
    const widget = new PendingWidget({ ownerSignal: lifetime.signal });
    const listener = vi.fn();
    widget.subscribe(listener);
    widget[wsStartWidgetLoad]();
    listener.mockClear();

    widget.dispose();
    expect(signal.aborted).toBe(true);
    const disposedNotifications = listener.mock.calls.length;
    load.resolve(["ignored"]);
    await settle();
    expect(listener).toHaveBeenCalledTimes(disposedNotifications);
    expect(widget.state).toEqual({ status: "loading" });
    lifetime.abort();
  });

  it("does not abort a load that has already settled", async () => {
    let signal!: AbortSignal;
    class SettledWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override async load(given: AbortSignal) { signal = given; return ["one"]; }
      override renderView() { return null; }
    }
    const lifetime = new AbortController();
    const widget = new SettledWidget({ ownerSignal: lifetime.signal });
    widget[wsStartWidgetLoad]();
    await settle();
    widget.dispose();
    expect(signal.aborted).toBe(false);
    lifetime.abort();
  });
});

describe("WSWidgetShelfView", () => {
  const runtimes: SynCloudOSRuntime[] = [];

  afterEach(async () => {
    for (const runtime of runtimes.splice(0)) await runtime.dispose({ reason: "test-complete", inFlight: "cancel" });
  });

  const entryFor = (WidgetClass: Parameters<typeof captureWSWidgetClass>[0], title = "Latest"): WSWidgetEntry => {
    const widget = captureWSWidgetClass(WidgetClass);
    return {
      widget,
      title,
      iconUrl: null,
      emptyMessage: widget.whenEmpty === "hide" ? null : widget.whenEmpty.message.fallback ?? null,
    };
  };

  function renderShelf(entries: readonly WSWidgetEntry[]) {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    return render(
      <SynCloudOSProvider runtime={runtime}>
        <WSWidgetShelfView entries={entries} surface={WSSurface.plain("#101418")} />
      </SynCloudOSProvider>,
    );
  }

  it("opens a widget link through shell routing and reports an unknown route as failed", async () => {
    const runtime = createTestRuntime({
      authenticationPolicy: "disabled",
      initialBundles: [createTestBundle({
        bundleIdentifier: "com.example.widget-target", route: "/widget-target", policy: { public: true },
      })],
    });
    runtimes.push(runtime);
    await runtime.boot({ initialPathname: "/" });
    const results: unknown[] = [];
    let navigation!: Promise<void>;

    class LinksWidget extends WSWidget<string> {
      static override id = "links";
      static override title = "Links";
      static override whenEmpty = "hide" as const;
      override load() { return "Read the note"; }
      override renderView() {
        return <>
          <a href="/widget-target" onClick={(event) => {
            event.preventDefault();
            navigation = this.navigate("/widget-target").then((result) => { results.push(result); });
          }}>{this.data}</a>
          <button onClick={() => {
            navigation = this.navigate("/missing-widget-target").then((result) => { results.push(result); });
          }}>Missing note</button>
        </>;
      }
    }

    render(
      <SynCloudOSProvider runtime={runtime}>
        <WSWidgetShelfView entries={[entryFor(LinksWidget)]} surface={WSSurface.plain("#101418")} />
      </SynCloudOSProvider>,
    );
    await act(settle);
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Read the note" }));
      await navigation;
    });
    expect(runtime.store.getSnapshot().application).toMatchObject({
      activeAppId: "com.example.widget-target", routePath: "/widget-target",
    });
    expect(results).toEqual([{ status: "completed" }]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Missing note" }));
      await navigation;
    });
    expect(results[1]).toMatchObject({ status: "failed", message: expect.any(String) });
    expect(runtime.store.getSnapshot().application.routePath).toBe("/widget-target");
  });

  it("draws no shelf without widgets", async () => {
    const view = renderShelf([]);
    await act(settle);
    expect(view.container.querySelector(".webspring-widget-shelf")).toBeNull();
  });

  it("shows a loading state, then renders both renderView and static view widgets", async () => {
    const load = deferred<readonly string[]>();
    class InlineWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return load.promise; }
      override renderView() { return <Items data={this.data} />; }
    }
    class StaticViewWidget extends WSWidget<string> {
      static override id = "static";
      static override title = "Static";
      static override whenEmpty = "hide" as const;
      static override view = ({ controller }: { readonly controller: StaticViewWidget }) => <p>{controller.data}</p>;
      override load() { return "Static note"; }
    }

    const view = renderShelf([entryFor(InlineWidget), entryFor(StaticViewWidget, "Static")]);
    await act(settle);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(view.container.querySelector("[data-widget-id='latest']")?.getAttribute("data-widget-state")).toBe("loading");

    load.resolve(["First post", "Second post"]);
    await act(settle);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["First post", "Second post"]);
    expect(screen.getByText("Static note")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Latest" })).toBeTruthy();
    expect(view.container.querySelector("[data-widget-id='latest']")?.getAttribute("data-widget-state")).toBe("ready");
  });

  it("hides the whole shelf when its only widget is empty and set to hide", async () => {
    class EmptyHideWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override async load() { return []; }
      override renderView() { return <Items data={this.data} />; }
    }
    const view = renderShelf([entryFor(EmptyHideWidget)]);
    await act(settle);
    expect(view.container.querySelector(".webspring-widget-shelf")).toBeNull();
  });

  it("shows the empty message while hiding empty-hide widgets and keeping ready ones", async () => {
    class EmptyMessageWidget extends WSWidget<readonly string[]> {
      static override id = "inbox";
      static override title = "Inbox";
      static override whenEmpty = { message: "Nothing new." } as const;
      override async load() { return []; }
      override renderView() { return <Items data={this.data} />; }
    }
    class HiddenWidget extends WSWidget<readonly string[]> {
      static override id = "quiet";
      static override title = "Quiet";
      static override whenEmpty = "hide" as const;
      override async load() { return []; }
      override renderView() { return <Items data={this.data} />; }
    }
    class FullWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override async load() { return ["A post"]; }
      override renderView() { return <Items data={this.data} />; }
    }

    const view = renderShelf([
      entryFor(EmptyMessageWidget, "Inbox"),
      entryFor(HiddenWidget, "Quiet"),
      entryFor(FullWidget),
    ]);
    await act(settle);
    expect(screen.getByText("Nothing new.")).toBeTruthy();
    expect(screen.getByText("A post")).toBeTruthy();
    expect([...view.container.querySelectorAll("[data-widget-id]")].map((element) => element.getAttribute("data-widget-id"))).toEqual(["inbox", "latest"]);
  });

  it("shows an error with Retry and Retry loads again", async () => {
    const load = vi.fn<(signal: AbortSignal) => Promise<readonly string[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(["Back online"]);

    class RetryWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load(signal: AbortSignal) { return load(signal); }
      override renderView() { return <Items data={this.data} />; }
    }

    renderShelf([entryFor(RetryWidget)]);
    await act(settle);
    expect(screen.getByRole("alert").textContent).toBe("This could not be loaded.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await settle();
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Back online")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("times out at static timeout in the shelf and Retry calls load again", async () => {
    const calls: AbortSignal[] = [];
    const secondLoad = deferred<readonly string[]>();
    class FastTimeoutWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      static override timeout = 50;
      override load(signal: AbortSignal) {
        calls.push(signal);
        return calls.length === 1 ? new Promise<readonly string[]>(() => undefined) : secondLoad.promise;
      }
      override renderView() { return <Items data={this.data} />; }
    }

    renderShelf([entryFor(FastTimeoutWidget)]);
    await act(settle);
    expect(screen.getByRole("status")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(screen.getByRole("alert").textContent).toBe("This is taking too long to load.");
    expect(calls[0]!.aborted).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      secondLoad.resolve(["Recovered"]);
      await settle();
    });
    expect(calls).toHaveLength(2);
    expect(screen.getByText("Recovered")).toBeTruthy();
  });

  it("aborts a pending load when disposed via shelf unmount and emits no warnings afterwards", async () => {
    const consoleError = vi.spyOn(console, "error");
    const pending = deferred<readonly string[]>();
    let signal!: AbortSignal;
    let instance!: WSWidget<readonly string[]>;

    class UnmountWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load(given: AbortSignal) {
        instance = this;
        signal = given;
        return pending.promise;
      }
      override renderView() { return <Items data={this.data} />; }
    }

    const view = renderShelf([entryFor(UnmountWidget)]);
    await act(settle);
    expect(signal.aborted).toBe(false);

    view.unmount();
    expect(signal.aborted).toBe(true);
    pending.resolve(["too late"]);
    await act(settle);
    expect(instance.state).toEqual({ status: "loading" });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("shows the error state when a widget view throws and leaves neighbours untouched", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    class BrokenViewWidget extends WSWidget<readonly string[]> {
      static override id = "broken";
      static override title = "Broken";
      static override whenEmpty = "hide" as const;
      override async load() { return ["x"]; }
      override renderView(): React.ReactNode { throw new Error("render failed"); }
    }
    class FineWidget extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override async load() { return ["A post"]; }
      override renderView() { return <Items data={this.data} />; }
    }

    renderShelf([entryFor(BrokenViewWidget, "Broken"), entryFor(FineWidget)]);
    await act(settle);
    expect(screen.getByRole("alert").textContent).toBe("This could not be loaded.");
    expect(screen.getByText("A post")).toBeTruthy();
    consoleError.mockRestore();
  });
});
