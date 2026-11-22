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
import { WSWidgetShelfView } from "../../src/Webspring/WSWidgetShelfView";
import { WSSurface } from "../../src/Webspring/WSSurface";
import {
  WSWidget,
  captureWSWidgetClass,
  wsBindWidgetHost,
  wsStartWidgetLoad,
} from "../../src/Webspring/WSWidget";
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
});

describe("captureWSWidgetClass", () => {
  it("captures a finite discovery order and defaults it to zero", () => {
    class DefaultOrder extends WSWidget<readonly string[]> {
      static override id = "ordered";
      static override title = "Ordered";
      static override whenEmpty = "hide" as const;
      override load() { return []; }
      override renderView() { return null; }
    }
    class NegativeOrder extends WSWidget<readonly string[]> {
      static override id = "ordered";
      static override title = "Ordered";
      static override order = -10;
      static override whenEmpty = "hide" as const;
      override load() { return []; }
      override renderView() { return null; }
    }
    expect(captureWSWidgetClass(DefaultOrder).order).toBe(0);
    expect(captureWSWidgetClass(NegativeOrder).order).toBe(-10);
    for (const order of [NaN, Infinity, -Infinity, "one"]) {
      class InvalidOrder extends WSWidget<readonly string[]> {
        static override id = "ordered";
        static override title = "Ordered";
        static override order = order as number;
        static override whenEmpty = "hide" as const;
        override load() { return []; }
        override renderView() { return null; }
      }
      expect(() => captureWSWidgetClass(InvalidOrder)).toThrow(/order/i);
    }
  });

  it("fills in the title, the empty rule and a ten second time limit", () => {
    class Latest extends WSWidget<unknown> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return []; }
      override renderView() { return <Items data={this.data as readonly string[]} />; }
    }
    const widget = captureWSWidgetClass(Latest);
    expect(widget.timeout).toBe(10_000);
    expect(widget.title).toEqual({ key: "widgets.latest.title", fallback: "Latest" });
    const lifetime = new AbortController();
    const instance = new widget.WidgetClass({ ownerSignal: lifetime.signal });
    expect([[], null, undefined].map((value) => instance.isEmpty(value))).toEqual([true, true, true]);
    expect([["one"], "text", 0].map((value) => instance.isEmpty(value))).toEqual([false, false, false]);
    lifetime.abort();
  });

  it("uses the developer's own emptiness rule", () => {
    class Count extends WSWidget<number> {
      static override id = "count";
      static override title = "Count";
      static override whenEmpty = "hide" as const;
      override load() { return 0; }
      override isEmpty(total: number) { return total === 0; }
      override renderView() { return null; }
    }
    const lifetime = new AbortController();
    const instance = new Count({ ownerSignal: lifetime.signal });
    expect(instance.isEmpty(0)).toBe(true);
    expect(instance.isEmpty(3)).toBe(false);
    lifetime.abort();
  });

  it("rejects definitions the framework cannot run", () => {
    class BadId extends WSWidget {
      static override id = "";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return []; }
      override renderView() { return null; }
    }
    class BadLoad extends (WSWidget as unknown as { new(): WSWidget }) {
      static id = "latest";
      static title = "Latest";
      static whenEmpty = "hide" as const;
      renderView() { return null; }
    }
    class BadView extends WSWidget {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return []; }
    }
    class BadEmpty extends WSWidget {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = undefined as never;
      override load() { return []; }
      override renderView() { return null; }
    }
    class BadTimeout extends WSWidget {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      static override timeout = 0;
      override load() { return []; }
      override renderView() { return null; }
    }
    expect(() => captureWSWidgetClass(BadId)).toThrow(/id/iu);
    expect(() => captureWSWidgetClass(BadLoad)).toThrow(/load/iu);
    expect(() => captureWSWidgetClass(BadView)).toThrow(/view/iu);
    expect(() => captureWSWidgetClass(BadEmpty)).toThrow(/whenEmpty/iu);
    expect(() => captureWSWidgetClass(BadTimeout)).toThrow(/timeout/iu);
  });
});

describe("WSWidget controller state", () => {
  it("moves from loading to ready with the loaded data", async () => {
    const load = deferred<readonly string[]>();
    class Latest extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return load.promise; }
      override renderView() { return <Items data={this.data} />; }
    }
    const lifetime = new AbortController();
    const controller = new Latest({ ownerSignal: lifetime.signal });
    controller[wsStartWidgetLoad]();
    expect(controller.state).toEqual({ status: "loading" });
    load.resolve(["one"]);
    await settle();
    expect(controller.state).toEqual({ status: "ready", data: ["one"] });
    lifetime.abort();
  });

  it("reports an empty result and a rejected load as different states", async () => {
    class None extends WSWidget<readonly string[]> {
      static override id = "none";
      static override title = "None";
      static override whenEmpty = "hide" as const;
      override async load() { return []; }
      override renderView() { return <Items data={this.data} />; }
    }
    class Broken extends WSWidget<readonly string[]> {
      static override id = "broken";
      static override title = "Broken";
      static override whenEmpty = "hide" as const;
      override async load(): Promise<readonly string[]> { throw new Error("offline"); }
      override renderView() { return <Items data={this.data} />; }
    }
    const lifetime = new AbortController();
    const none = new None({ ownerSignal: lifetime.signal });
    const broken = new Broken({ ownerSignal: lifetime.signal });
    none[wsStartWidgetLoad]();
    broken[wsStartWidgetLoad]();
    await settle();
    expect([none.state, broken.state]).toEqual([{ status: "empty" }, { status: "error", reason: "failed" }]);
    lifetime.abort();
  });

  it("turns a load that never settles into a timeout error and aborts it", async () => {
    let signal!: AbortSignal;
    class Hung extends WSWidget<readonly string[]> {
      static override id = "hung";
      static override title = "Hung";
      static override whenEmpty = "hide" as const;
      override load(given: AbortSignal) { signal = given; return new Promise<readonly string[]>(() => undefined); }
      override renderView() { return <Items data={this.data} />; }
    }
    const lifetime = new AbortController();
    const controller = new Hung({ ownerSignal: lifetime.signal });
    controller[wsStartWidgetLoad]();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(controller.state).toEqual({ status: "loading" });
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.state).toEqual({ status: "error", reason: "timeout" });
    expect(signal.aborted).toBe(true);
    lifetime.abort();
  });

  it("honours a widget's own time limit and ignores a result that arrives after it", async () => {
    const late = deferred<readonly string[]>();
    class Slow extends WSWidget<readonly string[]> {
      static override id = "slow";
      static override title = "Slow";
      static override whenEmpty = "hide" as const;
      static override timeout = 500;
      override load() { return late.promise; }
      override renderView() { return <Items data={this.data} />; }
    }
    const lifetime = new AbortController();
    const controller = new Slow({ ownerSignal: lifetime.signal });
    controller[wsStartWidgetLoad]();
    await vi.advanceTimersByTimeAsync(500);
    expect(controller.state).toEqual({ status: "error", reason: "timeout" });
    late.resolve(["too late"]);
    await settle();
    expect(controller.state).toEqual({ status: "error", reason: "timeout" });
    lifetime.abort();
  });

  it("aborts a pending load when it is disposed, and nothing it reports afterwards is used", async () => {
    const load = deferred<readonly string[]>();
    let signal!: AbortSignal;
    class Latest extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load(given: AbortSignal) { signal = given; return load.promise; }
      override renderView() { return <Items data={this.data} />; }
    }
    const lifetime = new AbortController();
    const controller = new Latest({ ownerSignal: lifetime.signal });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller[wsStartWidgetLoad]();
    listener.mockClear();
    controller.dispose();
    expect(signal.aborted).toBe(true);
    const disposedNotifications = listener.mock.calls.length;
    load.resolve(["ignored"]);
    await settle();
    expect(listener).toHaveBeenCalledTimes(disposedNotifications);
    lifetime.abort();
  });

  it("does not abort a load that has already settled", async () => {
    let signal!: AbortSignal;
    class Latest extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override async load(given: AbortSignal) { signal = given; return ["one"]; }
      override renderView() { return <Items data={this.data} />; }
    }
    const lifetime = new AbortController();
    const controller = new Latest({ ownerSignal: lifetime.signal });
    controller[wsStartWidgetLoad]();
    await settle();
    controller.dispose();
    expect(signal.aborted).toBe(false);
    lifetime.abort();
  });

  it("aborts the previous load on refresh and keeps only the newest result", async () => {
    const loads = [deferred<readonly string[]>(), deferred<readonly string[]>()];
    const signals: AbortSignal[] = [];
    class Latest extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load(given: AbortSignal) { signals.push(given); return loads[signals.length - 1]!.promise; }
      override renderView() { return <Items data={this.data} />; }
    }
    const lifetime = new AbortController();
    const controller = new Latest({ ownerSignal: lifetime.signal });
    controller[wsStartWidgetLoad]();
    controller.refresh();
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
    loads[1]!.resolve(["fresh"]);
    await settle();
    loads[0]!.resolve(["stale"]);
    await settle();
    expect(controller.state).toEqual({ status: "ready", data: ["fresh"] });
    lifetime.abort();
  });

  it("loads afresh on a new instance after disposal", async () => {
    const load = vi.fn(async () => ["one"] as readonly string[]);
    class Latest extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return load(); }
      override renderView() { return <Items data={this.data} />; }
    }
    const first = new Latest({ ownerSignal: new AbortController().signal });
    first[wsBindWidgetHost]({ timers: globalThis, navigate: async () => ({ status: "completed" }) });
    first[wsStartWidgetLoad]();
    first.dispose();

    const lifetime = new AbortController();
    const second = new Latest({ ownerSignal: lifetime.signal });
    second[wsStartWidgetLoad]();
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(second.state).toEqual({ status: "ready", data: ["one"] });
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
    expect(runtime.configurationProfiles.getAccessMode()).toBe("mixed");
    expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(false);
    const results: unknown[] = [];
    let navigation!: Promise<void>;
    class Links extends WSWidget<string> {
      static override id = "links";
      static override title = "Links";
      static override whenEmpty = "hide" as const;
      override load() { return "Read the note"; }
      override renderView() {
        return <>
          <a href="/widget-target" onClick={(event) => { event.preventDefault(); navigation = this.navigate("/widget-target").then((result) => { results.push(result); }); }}>{this.data}</a>
          <button onClick={() => { navigation = this.navigate("/missing-widget-target").then((result) => { results.push(result); }); }}>Missing note</button>
        </>;
      }
    }
    render(<SynCloudOSProvider runtime={runtime}>
      <WSWidgetShelfView entries={[entryFor(Links)]} surface={WSSurface.plain("#101418")} />
    </SynCloudOSProvider>);
    await act(settle);
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Read the note" }));
      await navigation;
    });
    expect(runtime.store.getSnapshot().application).toMatchObject({
      activeAppId: "com.example.widget-target", routePath: "/widget-target",
    });
    expect(results).toEqual([{ status: "completed" }]);
    expect(runtime.lifecycle.getState("com.example.widget-target")).toBe("active");
    expect(runtime.statechart.getCurrentState()).toBe("active.application.active");
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

  it("shows a loading state, then the developer's view with the loaded data", async () => {
    const load = deferred<readonly string[]>();
    class Latest extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load() { return load.promise; }
      override renderView() { return <Items data={this.data} />; }
    }
    const view = renderShelf([entryFor(Latest)]);
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
    class Latest extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override async load() { return []; }
      override renderView() { return <Items data={this.data} />; }
    }
    const view = renderShelf([entryFor(Latest)]);
    await act(settle);
    expect(view.container.querySelector(".webspring-widget-shelf")).toBeNull();
  });

  it("shows the empty message, and keeps showing the widgets that have data", async () => {
    class Empty extends WSWidget<readonly string[]> {
      static override id = "inbox";
      static override title = "Inbox";
      static override whenEmpty = { message: "Nothing new." } as const;
      override async load() { return []; }
      override renderView() { return <Items data={this.data} />; }
    }
    class Hidden extends WSWidget<readonly string[]> {
      static override id = "quiet";
      static override title = "Quiet";
      static override whenEmpty = "hide" as const;
      override async load() { return []; }
      override renderView() { return <Items data={this.data} />; }
    }
    class Full extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override async load() { return ["A post"]; }
      override renderView() { return <Items data={this.data} />; }
    }
    const view = renderShelf([entryFor(Empty, "Inbox"), entryFor(Hidden, "Quiet"), entryFor(Full)]);
    await act(settle);
    expect(screen.getByText("Nothing new.")).toBeTruthy();
    expect(screen.getByText("A post")).toBeTruthy();
    expect([...view.container.querySelectorAll("[data-widget-id]")].map((element) => element.getAttribute("data-widget-id"))).toEqual(["inbox", "latest"]);
  });

  it("shows an error with Retry, and Retry loads again", async () => {
    const load = vi.fn<(signal: AbortSignal) => Promise<readonly string[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(["Back online"]);
    class Latest extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load(signal: AbortSignal) { return load(signal); }
      override renderView() { return <Items data={this.data} />; }
    }
    renderShelf([entryFor(Latest)]);
    await act(settle);
    expect(screen.getByRole("alert").textContent).toBe("This could not be loaded.");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry" })); await settle(); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Back online")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("turns a load that never settles into a timeout error with Retry", async () => {
    let signal!: AbortSignal;
    class Latest extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load(given: AbortSignal) { signal = given; return new Promise<readonly string[]>(() => undefined); }
      override renderView() { return <Items data={this.data} />; }
    }
    renderShelf([entryFor(Latest)]);
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
    class Latest extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override load(given: AbortSignal) { signal = given; return new Promise<readonly string[]>(() => undefined); }
      override renderView() { return <Items data={this.data} />; }
    }
    const view = renderShelf([entryFor(Latest)]);
    await act(settle);
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it("shows the error state when a widget's own view throws, and leaves its neighbours alone", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    class Broken extends WSWidget<readonly string[]> {
      static override id = "broken";
      static override title = "Broken";
      static override whenEmpty = "hide" as const;
      override async load() { return ["x"]; }
      override renderView(): React.ReactNode { throw new Error("render failed"); }
    }
    class Fine extends WSWidget<readonly string[]> {
      static override id = "latest";
      static override title = "Latest";
      static override whenEmpty = "hide" as const;
      override async load() { return ["A post"]; }
      override renderView() { return <Items data={this.data} />; }
    }
    renderShelf([entryFor(Broken, "Broken"), entryFor(Fine)]);
    await act(settle);
    expect(screen.getByRole("alert").textContent).toBe("This could not be loaded.");
    expect(screen.getByText("A post")).toBeTruthy();
    consoleError.mockRestore();
  });
});
