// @vitest-environment jsdom
import * as React from "react";
import { act, render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { finalizeNSEAuthoringOwner } from "../../src/NSE/Application/authoringLifecycle";
import { NSEObject, observable } from "../../src/NSE/Objects";
import { observes } from "../../src/NSE/Objects/observes";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { nseUpdateViewActivity } from "../../src/NSE/Application/NSEViewController";
import { attachNSEAuthoringContext } from "../../src/NSE/Application/authoringContext";

const owners: NSEViewController[] = [];
afterEach(() => { cleanup(); for (const owner of owners.splice(0)) owner.dispose(); });
const settle = () => act(async () => { await Promise.resolve(); });
describe("scoped observations", () => {
  it("initializes after construction and coalesces direct-property changes", async () => {
    class Root extends NSEViewController {
      @observable accessor query = "initial";
      readonly received: unknown[] = [];
      @observes("query", { lifetime: "owner", initial: true })
      queryChanged(value: string, previous: string | undefined) { this.received.push([value, previous]); }
    }
    const root = new Root({ owner: nseUnowned }); owners.push(root); expect(root.received).toEqual([]);
    finalizeNSEAuthoringOwner(root); expect(root.received).toEqual([["initial", undefined]]);
    root.query = "one"; root.query = "two"; await settle();
    expect(root.received).toEqual([["initial", undefined], ["two", "initial"]]);
    root.query = "ended"; root.dispose(); await settle(); expect(root.received).toHaveLength(2);
  });
  it("delivers mounted initial after refs/load and visible initial once per effective epoch", async () => {
    const events: string[] = [];
    class Root extends NSEViewController {
      @observable accessor query = "value";
      static override view = () => <p>Scoped observation</p>;
      override viewDidLoad() { events.push("load"); }
      @observes("query", { lifetime: "mounted", initial: true }) mounted() { expect(this.view.element.isConnected).toBe(true); events.push("mounted"); }
      @observes("query", { lifetime: "visible", initial: true }) visible() { events.push("visible"); }
    }
    const root = new Root({ owner: nseUnowned }); owners.push(root);
    const view = render(<React.StrictMode><NSEViewControllerView controller={root} /></React.StrictMode>);
    expect(events).toEqual(["load", "mounted", "visible"]);
    act(() => { root[nseUpdateViewActivity](false); root.query = "hidden"; }); await settle();
    expect(events).toEqual(["load", "mounted", "visible", "mounted"]);
    act(() => { root[nseUpdateViewActivity](true); }); expect(events.at(-1)).toBe("visible");
    view.unmount(); await settle();
  });
  it("rebinds typed source factories and projected locale/provider changes", async () => {
    class Source extends NSEObject<string> { value = "en"; override getSnapshot() { return this.value; } change(value: string) { this.value = value; this.notifyObservers(); } }
    class Root extends NSEViewController {
      @observable accessor source = new Source();
      readonly received: string[] = [];
      @observes((owner: Root) => owner.source, { lifetime: "owner", initial: true, select: snapshot => snapshot.toUpperCase() })
      language(value: string) { this.received.push(value); }
    }
    const root = new Root({ owner: nseUnowned }); owners.push(root); finalizeNSEAuthoringOwner(root);
    const old = root.source; old.change("fr"); await settle(); expect(root.received).toEqual(["EN", "FR"]);
    const replacement = new Source(); replacement.value = "de"; root.source = replacement; await settle();
    old.change("it"); await settle(); expect(root.received).toEqual(["EN", "FR", "DE"]);
    replacement.change("nl"); await settle(); expect(root.received.at(-1)).toBe("NL");
  });

  it("diagnoses thenable results and a nonconverging synchronous observer", async () => {
    const capture = vi.fn();
    class Root extends NSEViewController {
      @observable accessor query = 0;
      @observes("query", { lifetime: "owner" }) looping(value: number) { this.query = value + 1; }
    }
    const root = new Root({ owner: nseUnowned }); owners.push(root);
    attachNSEAuthoringContext(root, { scheduler: { setTimeout: () => ({ dispose() {} }) }, errors: { capture }, persistence: { getPreference: (_key, fallback) => fallback, setPreference: () => true }, subscribePreferences: () => () => {} });
    finalizeNSEAuthoringOwner(root); root.query = 1;
    await act(async () => { for (let index = 0; index < 110; index++) await Promise.resolve(); });
    expect(capture).toHaveBeenCalledTimes(1); expect(capture.mock.calls[0][0].message).toMatch(/converge/);
    class Thenable extends NSEViewController {
      @observable accessor query = "initial";
      @observes("query", { lifetime: "owner", initial: true }) invalid(): unknown { return Promise.resolve(); }
    }
    const invalid = new Thenable({ owner: nseUnowned }); owners.push(invalid);
    expect(() => finalizeNSEAuthoringOwner(invalid)).toThrow(/thenable/);
  });
});
