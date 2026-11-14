import { afterEach, describe, expect, it, vi } from "vitest";
import { TabBarController } from "../../src/NSE/Navigation/TabBarController";
import { NSENavigationStackController } from "../../src/NSE/Navigation/NSENavigationStackController";
import { createNSETabSelectionRestoration, type NSENavigationRestorationDescriptor } from "../../src/NSE/Navigation/navigationRestoration";
import { finalizeNSEAuthoringOwner } from "../../src/NSE/Application/authoringLifecycle";
import { attachNSEAuthoringContext, type NSEAuthoringContext } from "../../src/NSE/Application/authoringContext";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import type { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { defaultsFrom } from "../fixtures/userDefaults";

const owners: NSEViewController<unknown>[] = [];
afterEach(() => { for (const owner of owners.splice(0)) owner.dispose(); });
const destinations = ["home", "library", "search"].map(id => ({ id, label: id, icon: { kind: "template" as const, name: id } }));
function ports(stored: unknown) {
  const values = new Map<string, unknown>([["navigation", stored]]);
  const write = vi.fn((key: string, value: unknown) => { values.set(key, value); return true; });
  const context: NSEAuthoringContext = { scheduler: { setTimeout: () => ({ dispose() {} }) }, errors: { capture: vi.fn() }, persistence: {
    getPreference: <T,>(key: string, fallback: T): T => values.has(key) ? values.get(key) as T : fallback, setPreference: write,
  }, subscribePreferences: () => () => {} };
  return { context, values, write };
}
function connect<T extends NSEViewController<unknown>>(owner: T, context: NSEAuthoringContext) { owners.push(owner); attachNSEAuthoringContext(owner, context); finalizeNSEAuthoringOwner(owner); return owner; }
describe("navigation restoration descriptors", () => {
  it("preserves an existing unversioned raw app format when a version-zero adapter is declared", async () => {
    const storage = ports({ selected: "library" });
    const descriptor: NSENavigationRestorationDescriptor<TabBarController, { selected: string }> = {
      key: "navigation", version: 0, migrations: [],
      parse: value => value && typeof value === "object" && "selected" in value && typeof value.selected === "string" ? { ok: true, value: value as { selected: string } } : { ok: false, issues: ["selection"] },
      capture: snapshot => ({ selected: snapshot.selectedDestinationId }), restore: (controller, value) => controller.restore({ selectedDestinationId: value.selected }),
    };
    const tabs = connect(new TabBarController({ owner: nseUnowned, id: "legacy", destinations, restoration: descriptor }), storage.context);
    expect(tabs.getSnapshot().selectedDestinationId).toBe("library"); expect(storage.write).not.toHaveBeenCalled();
    await tabs.select("search"); expect(storage.values.get("navigation")).toEqual({ selected: "search" });
  });
  it("restores canonical selection and skips title-only and equal-value writes", async () => {
    const storage = ports(["syncloudos:nse-preferences:v1", 1, "library"]);
    const tabs = connect(new TabBarController({ owner: nseUnowned, id: "tabs", destinations, restoration: createNSETabSelectionRestoration({ key: "navigation" }) }), storage.context);
    expect(tabs.getSnapshot().selectedDestinationId).toBe("library");
    tabs.retitle({ destinations: { library: { label: "Bibliothèque" } } }); expect(storage.write).not.toHaveBeenCalled();
    await tabs.select("search"); expect(storage.values.get("navigation")).toEqual(["syncloudos:nse-preferences:v1", 1, "search"]);
    await tabs.select("search"); expect(storage.write).toHaveBeenCalledTimes(1);
  });
  it("falls back to authored initial selection for missing dynamic destinations", () => {
    const storage = ports(["syncloudos:nse-preferences:v1", 1, "removed-collection"]);
    const tabs = connect(new TabBarController({ owner: nseUnowned, id: "tabs", destinations, initialSelectedId: "search", restoration: createNSETabSelectionRestoration({ key: "navigation" }) }), storage.context);
    expect(tabs.getSnapshot().selectedDestinationId).toBe("search"); expect(storage.write).not.toHaveBeenCalled();
  });
  it("honors explicit route authority rather than overwriting it with storage", () => {
    const storage = ports(["syncloudos:nse-preferences:v1", 1, "library"]);
    const tabs = connect(new TabBarController({ owner: nseUnowned, id: "tabs", destinations, initialSelectedId: "search", restoration: createNSETabSelectionRestoration({ key: "navigation", hasExplicitRoute: () => true }) }), storage.context);
    expect(tabs.getSnapshot().selectedDestinationId).toBe("search"); expect(storage.write).not.toHaveBeenCalled();
  });
  it("projects valid canonical stack paths without retaining a competing route snapshot", async () => {
    const storage = ports(["syncloudos:nse-preferences:v1", 1, ["a", "removed", "a", "b"]]);
    const descriptor: NSENavigationRestorationDescriptor<NSENavigationStackController, readonly string[]> = {
      key: "navigation", version: 1, migrations: [],
      parse: value => Array.isArray(value) && value.every(item => typeof item === "string") ? { ok: true, value } : { ok: false, issues: ["path"] },
      capture: snapshot => snapshot.path, restore: (controller, value) => controller.restore({ version: 1, path: value }),
    };
    const stack = connect(new NSENavigationStackController({ owner: nseUnowned, id: "stack", destinationIds: ["root", "a", "b", "c"], rootDestinationId: "root", restoration: descriptor }), storage.context);
    expect(stack.getSnapshot().path).toEqual(["a", "b"]);
    await stack.push("c"); expect(storage.values.get("navigation")).toEqual(["syncloudos:nse-preferences:v1", 1, ["a", "b", "c"]]);
  });
  it("requires an explicit adapter outside an app context and preserves newer schemas", async () => {
    const disconnected = new TabBarController({ owner: nseUnowned, id: "no-context", destinations, restoration: createNSETabSelectionRestoration({ key: "navigation" }) }); owners.push(disconnected);
    expect(() => finalizeNSEAuthoringOwner(disconnected)).toThrow(/context|adapter/i);
    let stored: unknown = ["syncloudos:nse-preferences:v1", 2, "library"]; const write = vi.fn((_key, value) => { stored = value; });
    const tabs = new TabBarController({ owner: nseUnowned, id: "adapter", destinations, restoration: createNSETabSelectionRestoration({ key: "navigation", defaults: defaultsFrom({ read: () => stored, write, remove() {} }) }) }); owners.push(tabs);
    finalizeNSEAuthoringOwner(tabs); await tabs.select("search"); expect(write).not.toHaveBeenCalled(); expect(stored).toEqual(["syncloudos:nse-preferences:v1", 2, "library"]);
  });
});
