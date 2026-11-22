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

import { describe, expect, it, vi } from "vitest";
import {
  NSEPreferencePane,
  capturePreferencePaneClass,
  registerPreferencePane,
  resolvePreferencePanes,
  type PreferencePaneDescriptor,
} from "../../src/SynCloudOS/Preferences";
import { createTestRuntime } from "./helpers";

function pane(id: string, order: number): PreferencePaneDescriptor {
  return capturePreferencePaneClass(class extends NSEPreferencePane {
    static override id = id;
    static override title = id;
    static override order = order;
    override renderView() { return null; }
  });
}

describe("capturePreferencePaneClass", () => {
  it("returns an immutable descriptor with the declared fields", () => {
    class BillingPane extends NSEPreferencePane {
      static override id = " billing ";
      static override title = "Billing";
      static override icon = "./billing.svg";
      static override order = 600;
      override renderView() { return null; }
    }
    const descriptor = capturePreferencePaneClass(BillingPane);
    expect(descriptor).toMatchObject({ id: "billing", title: "Billing", icon: "./billing.svg", order: 600, PaneClass: BillingPane });
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  it("accepts a localisable title", () => {
    class BillingPane extends NSEPreferencePane {
      static override id = "billing";
      static override title = { key: "billing.title", fallback: "Billing" };
      static override order = 1;
      override renderView() { return null; }
    }
    expect(capturePreferencePaneClass(BillingPane).title)
      .toEqual({ key: "billing.title", fallback: "Billing" });
  });

  it.each([
    ["an empty id", class extends NSEPreferencePane { static override id = " "; static override title = "x"; static override order = 1; override renderView() { return null; } }],
    ["a missing title", class extends NSEPreferencePane { static override id = "a"; static override title = ""; static override order = 1; override renderView() { return null; } }],
    ["a non-finite order", class extends NSEPreferencePane { static override id = "a"; static override title = "x"; static override order = Number.NaN; override renderView() { return null; } }],
    ["a view that is not a component", class extends NSEPreferencePane { static override id = "a"; static override title = "x"; static override order = 1; static override view = "nope" as never; }],
    ["an icon that is not a URL string", class extends NSEPreferencePane { static override id = "a"; static override title = "x"; static override order = 1; static override icon = 3 as never; override renderView() { return null; } }],
  ])("rejects %s", (_label, candidate) => {
    expect(() => capturePreferencePaneClass(candidate)).toThrow(TypeError);
  });

  it("rejects accessors without evaluating them", () => {
    const getter = vi.fn(() => "billing");
    class AccessorPane extends NSEPreferencePane {
      static override title = "Billing";
      static override order = 1;
      override renderView() { return null; }
    }
    Object.defineProperty(AccessorPane, "id", { enumerable: true, get: getter });
    expect(() => capturePreferencePaneClass(AccessorPane)).toThrow(/accessor/);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("resolvePreferencePanes", () => {
  const builtIn = [pane("appearance", 100), pane("sounds", 200), pane("language", 500)];

  it("lists the built-ins and the developer panes", () => {
    const billing = pane("billing", 600);
    expect(resolvePreferencePanes({ builtIn, developer: [billing] }).map(({ id }) => id)).toEqual(["appearance", "sounds", "language", "billing"]);
  });

  it("hides built-ins by id", () => {
    expect(resolvePreferencePanes({ builtIn, hide: ["sounds"] }).map(({ id }) => id)).toEqual(["appearance", "language"]);
  });

  it("lets a developer pane replace the built-in with the same id", () => {
    const replacement = pane("sounds", 250);
    const resolved = resolvePreferencePanes({ builtIn, developer: [replacement] });
    expect(resolved.filter(({ id }) => id === "sounds")).toEqual([replacement]);
    expect(resolved).toHaveLength(3);
  });

  it("never hides a developer pane", () => {
    const billing = pane("billing", 600);
    expect(resolvePreferencePanes({ builtIn, developer: [billing], hide: ["billing"] })).toContain(billing);
  });
});

describe("runtime Preference Pane registry", () => {
  it("publishes an immutable stable order and rejects duplicate IDs", () => {
    const runtime = createTestRuntime();
    registerPreferencePane(runtime.preferencePanes, pane("language", 500));
    registerPreferencePane(runtime.preferencePanes, pane("appearance", 100));
    const snapshot = runtime.preferencePanes.getSnapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.map(({ id }) => id)).toEqual(["appearance", "language"]);
    expect(() => registerPreferencePane(runtime.preferencePanes, pane("appearance", 900))).toThrow(/already registered/);
  });

  it("breaks ties in order by id", () => {
    const runtime = createTestRuntime();
    registerPreferencePane(runtime.preferencePanes, pane("b", 10));
    registerPreferencePane(runtime.preferencePanes, pane("a", 10));
    expect(runtime.preferencePanes.getSnapshot().map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("refuses anything not extending NSEPreferencePane", () => {
    const runtime = createTestRuntime();
    const forged = { id: "forged", title: "Forged", order: 1, view: () => null } as unknown as PreferencePaneDescriptor;
    expect(() => registerPreferencePane(runtime.preferencePanes, forged)).toThrow(/extending NSEPreferencePane/);
    expect(runtime.preferencePanes.getSnapshot()).toEqual([]);
  });

  it("lets a stale registration dispose without corrupting a later one", () => {
    const runtime = createTestRuntime();
    const changed = vi.fn();
    runtime.preferencePanes.subscribe(changed);
    const first = registerPreferencePane(runtime.preferencePanes, pane("motion", 300));
    first.dispose();
    const second = registerPreferencePane(runtime.preferencePanes, pane("motion", 300));
    first.dispose();
    expect(runtime.preferencePanes.getSnapshot().map(({ id }) => id)).toEqual(["motion"]);
    second.dispose();
    expect(runtime.preferencePanes.getSnapshot()).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(4);
  });

  it("isolates two runtimes and deterministically refuses work after disposal", async () => {
    const first = createTestRuntime({ id: "runtime:preferences:first" });
    const second = createTestRuntime({ id: "runtime:preferences:second" });
    registerPreferencePane(first.preferencePanes, pane("appearance", 100));
    expect(second.preferencePanes.getSnapshot()).toEqual([]);
    await first.dispose("test");
    expect(first.preferencePanes.getSnapshot()).toEqual([]);
    expect(() => registerPreferencePane(first.preferencePanes, pane("motion", 300))).toThrow(/disposed|foreign/);
    expect(second.preferencePanes.getSnapshot()).toEqual([]);
  });
});
