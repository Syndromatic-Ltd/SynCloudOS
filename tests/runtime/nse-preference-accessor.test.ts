import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { attachNSEAuthoringContext, type NSEAuthoringContext } from "../../src/NSE/Application/authoringContext";
import { finalizeNSEAuthoringOwner } from "../../src/NSE/Application/authoringLifecycle";
import { preference, type NSEPreferenceDescriptor } from "../../src/NSE/Objects/preference";
import { PreferencePersistenceError } from "../../src/NSE/Controllers/NSEPreferencesController";

const owners: NSEViewController[] = [];
afterEach(() => { for (const owner of owners.splice(0)) owner.dispose(); });
function context() {
  const values = new Map<string, unknown>(); const listeners = new Set<() => void>(); let accepts = true;
  const write = vi.fn((key: string, value: unknown) => { if (!accepts) return false; values.set(key, value); for (const listener of listeners) listener(); return true; });
  const result: NSEAuthoringContext = {
    scheduler: { setTimeout: (callback, delay) => { const id = setTimeout(callback, delay); return { dispose: () => clearTimeout(id) }; } },
    errors: { capture: vi.fn() },
    persistence: { getPreference: <T,>(key: string, fallback: T): T => values.has(key) ? values.get(key) as T : fallback, setPreference: write },
    subscribePreferences: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return { result, values, write, listeners, refuse: () => { accepts = false; } };
}
function create<T extends NSEViewController>(Controller: new () => T, ports: NSEAuthoringContext) {
  const value = new Controller(); owners.push(value); attachNSEAuthoringContext(value, ports); finalizeNSEAuthoringOwner(value); return value;
}
class Settings extends NSEViewController {
  @preference("sidebar.visible") accessor visible = true;
  @preference("sidebar.width") accessor width = 240;
  constructor() { super({ owner: nseUnowned }); }
}

describe("preference accessors", () => {
  it("reads defaults in constructors and hydrates only at finalization", () => {
    const ports = context(); ports.values.set("sidebar.visible", false);
    let during: boolean | undefined;
    class Observed extends Settings { constructor() { super(); during = this.visible; } }
    const settings = create(Observed, ports.result);
    expect(during).toBe(true); expect(settings.visible).toBe(false); expect(ports.write).not.toHaveBeenCalled();
  });
  it("hydrates a new parameterized child of an already attached owner before returning it", () => {
    const ports = context(); ports.values.set("sidebar.visible", false);
    const parent = create(Settings, ports.result);
    class Child extends NSEViewController { @preference("sidebar.visible") accessor visible = true; constructor(readonly label: string) { super(); } }
    const child = parent.addChild(Child, "late child");
    expect(child.visible).toBe(false); expect(child.label).toBe("late child");
  });
  it("persists a pre-hydration explicit write instead of overwriting it with storage", () => {
    const ports = context(); ports.values.set("sidebar.width", 400);
    class Early extends Settings { constructor() { super(); this.width = 300; } }
    const settings = create(Early, ports.result);
    expect(settings.width).toBe(300); expect(ports.values.get("sidebar.width")).toBe(300);
  });
  it("validates primitive kind and finite numbers before persistence/publication", () => {
    const ports = context(); ports.values.set("sidebar.width", "wrong");
    const settings = create(Settings, ports.result); const changed = vi.fn(); settings.subscribe(changed);
    expect(settings.width).toBe(240);
    expect(() => { settings.width = Infinity; }).toThrow();
    expect(() => { (settings as unknown as { width: string }).width = "wrong"; }).toThrow();
    expect(ports.write).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  });
  it("retains value and snapshot on a refused write, and does not publish equal echoes", () => {
    const ports = context(); const settings = create(Settings, ports.result); const changed = vi.fn(); settings.subscribe(changed);
    settings.visible = false; expect(changed).toHaveBeenCalledTimes(1);
    for (const listener of ports.listeners) listener(); expect(changed).toHaveBeenCalledTimes(1);
    const snapshot = settings.getSnapshot(); ports.refuse();
    expect(() => { settings.visible = true; }).toThrow(PreferencePersistenceError);
    expect(settings.visible).toBe(false); expect(settings.getSnapshot()).toBe(snapshot);
  });
  it("shares scoped changes while isolating unrelated contexts and releasing listeners", () => {
    const shared = context(); const other = context();
    const first = create(Settings, shared.result); const second = create(Settings, shared.result); const unrelated = create(Settings, other.result);
    first.width = 280; expect(second.width).toBe(280); expect(unrelated.width).toBe(240);
    first.dispose(); second.dispose(); expect(shared.listeners.size).toBe(0);
    expect(() => { first.width = 500; }).toThrow();
  });
  it("migrates structured values using the existing tagged envelope and refuses newer schemas", () => {
    const descriptor: NSEPreferenceDescriptor<{ size: number }> = {
      key: "structured", version: 2, migrations: [{ from: 1, to: 2, migrate: value => ({ size: value }) }],
      parse: value => value && typeof value === "object" && "size" in value && typeof value.size === "number"
        ? { ok: true, value: value as { size: number } } : { ok: false, issues: ["size required"] },
    };
    class Structured extends NSEViewController { @preference(descriptor) accessor settings = { size: 1 }; constructor() { super({ owner: nseUnowned }); } }
    const ports = context(); ports.values.set("structured", ["syncloudos:nse-preferences:v1", 1, 12]);
    const settings = create(Structured, ports.result); expect(settings.settings).toEqual({ size: 12 }); expect(Object.isFrozen(settings.settings)).toBe(true);
    expect(ports.values.get("structured")).toEqual(["syncloudos:nse-preferences:v1", 2, { size: 12 }]);
    const newer = context(); newer.values.set("structured", ["syncloudos:nse-preferences:v1", 3, { size: 99 }]);
    const stale = create(Structured, newer.result); expect(stale.settings).toEqual({ size: 1 });
    expect(() => { stale.settings = { size: 2 }; }).toThrow(PreferencePersistenceError); expect(newer.write).not.toHaveBeenCalled();
  });

  it("does not echo a structurally equal schema value or accept noncloneable parse output", () => {
    const descriptor: NSEPreferenceDescriptor<{ width: number }> = { key: "schema", version: 0, migrations: [],
      parse: value => value && typeof value === "object" && "width" in value && typeof value.width === "number" ? { ok: true, value: value as { width: number } } : { ok: false, issues: ["width"] },
    };
    class Structured extends Settings { @preference(descriptor) accessor schema = { width: 1 }; }
    const ports = context(); const settings = create(Structured, ports.result); const changed = vi.fn(); settings.subscribe(changed);
    settings.schema = { width: 2 }; expect(changed).toHaveBeenCalledTimes(1);
    for (const listener of ports.listeners) listener(); expect(changed).toHaveBeenCalledTimes(1);
    expect(() => { settings.schema = { width: 3, callback() {} } as { width: number }; }).toThrow();
    expect(settings.schema).toEqual({ width: 2 }); expect(changed).toHaveBeenCalledTimes(1);
  });

  it("rejects noncontiguous migration hops before performing storage operations", () => {
    expect(() => preference({ key: "invalid", version: 2, migrations: [{ from: 0, to: 2, migrate: value => value }], parse: value => ({ ok: true, value }) })).toThrow(/consecutive/);
  });
  it("rolls back channel and abort cleanup if the preference subscription fails", () => {
    const ports = context();
    let fail = true;
    const failedPorts = { ...ports.result, subscribePreferences: (listener: () => void) => { if (fail) throw new Error("subscribe failed"); return ports.result.subscribePreferences(listener); } };
    const settings = new Settings(); owners.push(settings); attachNSEAuthoringContext(settings, failedPorts);
    expect(() => finalizeNSEAuthoringOwner(settings)).toThrow("subscribe failed");
    const changed = vi.fn(); settings.subscribe(changed);
    fail = false;
    const peer = create(Settings, failedPorts); peer.width = 270;
    expect(settings.width).toBe(240); expect(changed).not.toHaveBeenCalled();
    finalizeNSEAuthoringOwner(settings); expect(settings.width).toBe(270);
    settings.dispose(); peer.dispose(); expect(ports.listeners.size).toBe(0);
  });
  it("releases a subscription acquired during reentrant owner disposal", () => {
    const ports = context();
    const settings = new Settings(); owners.push(settings);
    attachNSEAuthoringContext(settings, { ...ports.result, subscribePreferences: listener => {
      settings.dispose(); return ports.result.subscribePreferences(listener);
    } });
    finalizeNSEAuthoringOwner(settings); expect(ports.listeners.size).toBe(0);
  });
  it("preserves an existing raw structured key when explicitly described as version zero", () => {
    const ports = context(); ports.values.set("legacy-rich", { width: 12 });
    const descriptor: NSEPreferenceDescriptor<{ width: number }> = { key: "legacy-rich", version: 0, migrations: [], parse: value => value && typeof value === "object" && "width" in value && typeof value.width === "number" ? { ok: true, value: value as { width: number } } : { ok: false, issues: ["width"] } };
    class Legacy extends Settings { @preference(descriptor) accessor rich = { width: 1 }; }
    const settings = create(Legacy, ports.result); expect(settings.rich).toEqual({ width: 12 }); expect(ports.write).not.toHaveBeenCalled();
    settings.rich = { width: 14 }; expect(ports.values.get("legacy-rich")).toEqual({ width: 14 });
  });
});
