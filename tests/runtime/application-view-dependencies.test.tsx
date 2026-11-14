// @vitest-environment jsdom
import * as React from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { ViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { TabBarController } from "../../src/NSE/Navigation/TabBarController";

class Source {
  value = "first";
  readonly listeners = new Set<() => void>();
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  publish(value = this.value) { this.value = value; for (const listener of [...this.listeners]) listener(); }
}
const owners: NSEViewController[] = [];
afterEach(() => { cleanup(); for (const owner of owners.splice(0)) owner.dispose(); });

describe("explicit class view dependencies", () => {
  it("removes disposed navigation content independently of semantic snapshot subscriptions", () => {
    class Region extends TabBarController { static override view = () => <p>Disposable navigation region</p>; }
    const region = new Region({ owner: nseUnowned, id: "navigation-region", destinations: [{ id: "first", label: "First", icon: { kind: "template", name: "first" } }] });
    owners.push(region); render(<ViewControllerView controller={region} />);
    expect(screen.getByText("Disposable navigation region")).toBeTruthy();
    act(() => { region.dispose(); }); expect(screen.queryByText("Disposable navigation region")).toBeNull();
  });
  it("subscribes only after commit, deduplicates identities, and preserves stable snapshots", () => {
    const source = new Source(); let renders = 0;
    class Root extends NSEViewController {
      static override view = ({ controller }: { controller: Root }) => { renders++; return <p>{controller.source.value}</p>; };
      static viewDependencies = (controller: Root) => [controller.source, controller.source, controller, null, undefined];
      readonly source = source;
    }
    const root = new Root({ owner: nseUnowned }); owners.push(root);
    renderToString(<ViewControllerView controller={root} />); expect(source.listeners.size).toBe(0);
    const view = render(<React.StrictMode><ViewControllerView controller={root} /></React.StrictMode>);
    expect(source.listeners.size).toBe(1); const before = renders;
    act(() => { source.publish(); }); expect(renders).toBe(before);
    act(() => { source.publish("changed dependency"); }); expect(screen.getByText("changed dependency")).toBeTruthy();
    view.unmount(); expect(source.listeners.size).toBe(0);
  });

  it("rebinds a replaced source after controller notification and unsubscribes the old source", () => {
    const first = new Source(); const second = new Source(); second.value = "replacement";
    class Root extends NSEViewController {
      static override view = ({ controller }: { controller: Root }) => <p>{controller.source.value}</p>;
      static viewDependencies = (controller: Root) => [controller.source];
      source = first;
      replace() { this.source = second; this.notifyObservers(); }
    }
    const root = new Root({ owner: nseUnowned }); owners.push(root);
    render(<ViewControllerView controller={root} />);
    expect(first.listeners.size).toBe(1);
    act(() => { root.replace(); }); expect(screen.getByText("replacement")).toBeTruthy();
    expect(first.listeners.size).toBe(0); expect(second.listeners.size).toBe(1);
    act(() => { first.publish("stale"); }); expect(screen.queryByText("stale")).toBeNull();
  });

  it("keeps sibling regions isolated", () => {
    let firstRenders = 0; let secondRenders = 0;
    class Region extends NSEViewController {
      static override view = ({ controller }: { controller: Region }) => { controller.index === 1 ? firstRenders++ : secondRenders++; return <p>{controller.source.value}-{controller.index}</p>; };
      static viewDependencies = (controller: Region) => [controller.source];
      readonly source = new Source();
      constructor(readonly index: number) { super({ owner: nseUnowned }); }
    }
    const first = new Region(1); const second = new Region(2); owners.push(first, second);
    render(<><ViewControllerView controller={first} /><ViewControllerView controller={second} /></>);
    const before = secondRenders;
    act(() => { first.source.publish("updated region"); });
    expect(screen.getByText("updated region-1")).toBeTruthy(); expect(secondRenders).toBe(before); expect(firstRenders).toBeGreaterThan(1);
  });
});
