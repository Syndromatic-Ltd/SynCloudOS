import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { getNSEObjectLifetime } from "../../src/NSE/Application/objectLifetime";
import { getNSEOwnerScope, instantiateInOwnerScope, isNSEOwnedResource, NSEOwnershipScope, nseUnowned } from "../../src/NSE/Controllers/ownership";
import { synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";
import * as execution from "../../src/SynCloudOS/ExecutionContext/ownedExecutionContext";
import * as bridge from "../../src/NSE/Application/ownedExecution";
const owners: NSEViewController[] = [];
afterEach(() => { for (const owner of owners.splice(0).reverse()) { try { owner.dispose(); } catch { /* Tested cleanup failures. */ } } });

function fixture(name = "a", process: object = {}) {
  const abort = new AbortController();
  let live = true;
  const key = Symbol(name);
  const ports = new Map<symbol, unknown>([[key, name]]);
  const dispose = new Map<object, () => void>();
  const errors: unknown[] = [];
  const errorContexts: unknown[] = [];
  const context = execution.issueOwnedExecutionContext({
    process, signal: abort.signal, ports,
    assertLive() { if (!live) throw new Error("revoked"); },
    registerResource(resource, release) { dispose.set(resource, release); return () => { dispose.delete(resource); }; },
    reportResourceError(error: unknown) { errors.push(error); errorContexts.push(execution.currentOwnedExecutionContext()); },
  });
  return { context, abort, key, ports, process, dispose, errors, errorContexts, revoke() { live = false; } };
}

function owner(context = fixture().context) {
  const scope = new NSEOwnershipScope("NSEViewController", "test");
  bridge.attachNSEExecutionContext(scope, context);
  const value = instantiateInOwnerScope(scope, () => new NSEViewController());
  owners.push(value);
  return value;
}

function cancelOnly(): { cancel: ReturnType<typeof vi.fn> } {
  const context = execution.requireOwnedExecutionContext("cancel-only constructor");
  const resource = { cancel: vi.fn(), get dispose(): never { throw new Error("public cleanup getter was read"); } };
  execution.registerOwnedExecutionResource(context, resource, () => resource.cancel());
  return resource;
}

describe("authentic synchronous owned execution contexts", () => {
  it("restores A/B/A, explicit null and thrown nested calls", () => {
    const a = fixture("a"); const b = fixture("b"); const seen: unknown[] = [];
    execution.runInOwnedExecutionContext(a.context, () => {
      seen.push(execution.getOwnedExecutionPort(execution.requireOwnedExecutionContext("a"), a.key));
      execution.runInOwnedExecutionContext(b.context, () => seen.push(execution.getOwnedExecutionPort(execution.requireOwnedExecutionContext("b"), b.key)));
      execution.runInOwnedExecutionContext(null, () => expect(execution.currentOwnedExecutionContext()).toBeNull());
      expect(() => execution.runInOwnedExecutionContext(b.context, () => { throw new Error("nested"); })).toThrow("nested");
      seen.push(execution.getOwnedExecutionPort(execution.requireOwnedExecutionContext("a again"), a.key));
    });
    expect(seen).toEqual(["a", "b", "a"]);
    expect(execution.currentOwnedExecutionContext()).toBeNull();
  });

  it("restores synchronously when a callback returns a promise, native await or timer", async () => {
    const a = fixture();
    const work = execution.runInOwnedExecutionContext(a.context, async () => {
      expect(execution.currentOwnedExecutionContext()).toBe(a.context);
      await Promise.resolve();
      expect(() => execution.requireOwnedExecutionContext("after await")).toThrow(/scope|context/i);
      await new Promise<void>(resolve => setTimeout(() => {
        expect(execution.currentOwnedExecutionContext()).toBeNull(); resolve();
      }, 0));
    });
    expect(work).toBeInstanceOf(Promise);
    expect(execution.currentOwnedExecutionContext()).toBeNull();
    await work;
  });

  it("rejects forged contexts in every authority operation", () => {
    const forged = {} as execution.OwnedExecutionContext;
    const child = new AbortController();
    expect(() => execution.runInOwnedExecutionContext(forged, () => {})).toThrow(/authentic|issued|context/i);
    expect(() => execution.getOwnedExecutionPort(forged, Symbol())).toThrow();
    expect(() => execution.ownedExecutionContextSignal(forged)).toThrow();
    expect(() => execution.assertOwnedExecutionContextLive(forged)).toThrow();
    expect(() => execution.registerOwnedExecutionResource(forged, {}, () => {})).toThrow();
    expect(() => execution.sameOwnedExecutionProcess(forged, fixture().context)).toThrow();
    expect(() => execution.narrowOwnedExecutionContext(forged, { signal: child.signal, assertLive() {}, reportResourceError() {}, registerResource() { return () => {}; } })).toThrow();
  });

  it("copies private ports and preserves the exact process identity while narrowing", () => {
    const a = fixture(); const same = fixture("same", a.process); const other = fixture();
    const childAbort = new AbortController(); const release = vi.fn();
    const child = execution.narrowOwnedExecutionContext(a.context, { signal: childAbort.signal, assertLive() {}, reportResourceError() {}, registerResource: release.mockReturnValue(() => {}) });
    a.ports.set(a.key, "mutated");
    expect(execution.getOwnedExecutionPort(child, a.key)).toBe("a");
    expect(execution.sameOwnedExecutionProcess(child, same.context)).toBe(true);
    expect(execution.sameOwnedExecutionProcess(child, other.context)).toBe(false);
    execution.registerOwnedExecutionResource(child, {}, () => {});
    expect(release).toHaveBeenCalledTimes(1); expect(a.dispose.size).toBe(0);
    childAbort.abort();
    expect(execution.ownedExecutionContextSignal(a.context).aborted).toBe(false);
    expect(() => execution.runInOwnedExecutionContext(child, () => {})).toThrow();
  });

  it.each(["signal", "validator"])("a child cannot outlive its parent %s", mode => {
    const a = fixture(); const childAbort = new AbortController();
    const child = execution.narrowOwnedExecutionContext(a.context, { signal: childAbort.signal, assertLive() {}, reportResourceError() {}, registerResource() { return () => {}; } });
    const signal = execution.ownedExecutionContextSignal(child);
    if (mode === "signal") { a.abort.abort(); expect(signal.aborted).toBe(true); } else a.revoke();
    expect(() => execution.runInOwnedExecutionContext(child, () => {})).toThrow();
    expect(() => execution.getOwnedExecutionPort(child, a.key)).toThrow();
  });

  it("validates issuer input and liveness before publishing authority", () => {
    const a = fixture();
    const record = { process: {}, signal: a.abort.signal, ports: new Map(), assertLive() {}, reportResourceError() {}, registerResource() { return () => {}; } };
    expect(() => execution.issueOwnedExecutionContext({ ...record, process: null } as never)).toThrow(TypeError);
    expect(() => execution.issueOwnedExecutionContext({ ...record, ports: new Map([["forged", {}]]) } as never)).toThrow(TypeError);
    expect(() => execution.issueOwnedExecutionContext({ ...record, assertLive() { throw new Error("revoked"); } })).toThrow("revoked");
    a.abort.abort(); expect(() => execution.issueOwnedExecutionContext(record)).toThrow();
  });

  it("rejects missing callbacks and captures issued callback identities", () => {
    const abort = new AbortController(); const register = vi.fn(() => () => {});
    const record = { process: {}, signal: abort.signal, ports: new Map<symbol, unknown>(), assertLive() {}, reportResourceError() {}, registerResource: register };
    expect(() => execution.issueOwnedExecutionContext({ ...record, registerResource: null } as never)).toThrow(TypeError);
    const context = execution.issueOwnedExecutionContext(record);
    record.assertLive = () => { throw new Error("replaced validator"); };
    record.registerResource = vi.fn(() => { throw new Error("replaced cleanup"); });
    execution.registerOwnedExecutionResource(context, {}, () => {});
    expect(register).toHaveBeenCalledOnce();
  });

  it.each(["parent", "child"])("immediately cleans registered resources once on %s abort", mode => {
    const parent = fixture(); const abort = new AbortController(); const registered = new Map<object, () => void>();
    const context = execution.narrowOwnedExecutionContext(parent.context, {
      signal: abort.signal, assertLive() {}, reportResourceError() {},
      registerResource(resource, dispose) { registered.set(resource, dispose); return () => { registered.delete(resource); }; },
    });
    const resource = {}; const dispose = vi.fn();
    const unregister = execution.registerOwnedExecutionResource(context, resource, dispose);
    const recordedCleanup = registered.get(resource)!;
    if (mode === "parent") parent.abort.abort(); else abort.abort();
    expect(dispose).toHaveBeenCalledOnce(); expect(registered.size).toBe(0);
    recordedCleanup(); unregister(); abort.abort(); parent.abort.abort();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("manual unregister removes cleanup and the abort listener without disposing", () => {
    const parent = fixture(); const dispose = vi.fn(); const resource = {};
    const unregister = execution.registerOwnedExecutionResource(parent.context, resource, dispose);
    expect(parent.dispose.has(resource)).toBe(true);
    unregister(); unregister(); parent.abort.abort();
    expect(parent.dispose.size).toBe(0); expect(dispose).not.toHaveBeenCalled();
  });

  it("does not leak registration when authority is revoked before registration returns", () => {
    const abort = new AbortController(); const registered = new Set<object>(); const dispose = vi.fn(); const unregister = vi.fn();
    const context = execution.issueOwnedExecutionContext({
      process: {}, signal: abort.signal, ports: new Map(), assertLive() {}, reportResourceError() {},
      registerResource(resource) { registered.add(resource); abort.abort(); return () => { registered.delete(resource); unregister(); }; },
    });
    expect(() => execution.registerOwnedExecutionResource(context, {}, dispose)).toThrow();
    expect(dispose).toHaveBeenCalledOnce(); expect(unregister).toHaveBeenCalledOnce(); expect(registered.size).toBe(0);
  });

  it("validates and captures issuer and narrowed reporting sinks without borrowing reentrant authority", () => {
    const abort = new AbortController(); const seen: unknown[] = []; const errors: unknown[] = [];
    const record = {
      process: {}, signal: abort.signal, ports: new Map(), assertLive() {}, registerResource() { return () => {}; },
      reportResourceError(error: unknown) { seen.push(execution.currentOwnedExecutionContext()); errors.push(error); },
    };
    expect(() => execution.issueOwnedExecutionContext({ ...record, reportResourceError: undefined } as never)).toThrow(TypeError);
    const context = execution.issueOwnedExecutionContext(record);
    record.reportResourceError = () => { throw new Error("replacement reporter"); };
    const failure = new Error("resource cleanup"); execution.registerOwnedExecutionResource(context, {}, () => { throw failure; });
    const childAbort = new AbortController(); const childFailures: unknown[] = [];
    const lifetime = { signal: childAbort.signal, assertLive() {}, registerResource() { return () => {}; }, reportResourceError(error: unknown) { seen.push(execution.currentOwnedExecutionContext()); childFailures.push(error); } };
    expect(() => execution.narrowOwnedExecutionContext(context, { ...lifetime, reportResourceError: null } as never)).toThrow(TypeError);
    const child = execution.narrowOwnedExecutionContext(context, lifetime);
    lifetime.reportResourceError = () => { throw new Error("replacement child reporter"); };
    execution.registerOwnedExecutionResource(child, {}, () => { throw failure; });
    const other = fixture();
    execution.runInOwnedExecutionContext(other.context, () => {
      abort.abort(); childAbort.abort();
      expect(execution.currentOwnedExecutionContext()).toBe(other.context);
    });
    expect(errors).toEqual([failure]); expect(childFailures).toEqual([failure]); expect(seen).toEqual([null, null]);
  });

  it("allows authentic reporting after revocation without returning execution authority", () => {
    const root = fixture(); const other = fixture(); const failure = new Error("late report"); root.abort.abort();
    expect(() => execution.reportOwnedExecutionResourceError({} as never, failure)).toThrow(/authentic|issued|context/i);
    execution.runInOwnedExecutionContext(other.context, () => {
      execution.reportOwnedExecutionResourceError(root.context, failure);
      expect(execution.currentOwnedExecutionContext()).toBe(other.context);
    });
    expect(root.errors).toEqual([failure]); expect(root.errorContexts).toEqual([null]);
    expect(() => execution.runInOwnedExecutionContext(root.context, () => {})).toThrow();
    expect(() => execution.getOwnedExecutionPort(root.context, root.key)).toThrow();
    expect(() => execution.registerOwnedExecutionResource(root.context, {}, () => {})).toThrow();
  });
});

describe("recorded NSE scope execution and resource admission", () => {
  it("attaches once to real scopes and rejects forged contexts", () => {
    const scope = new NSEOwnershipScope("test", "once"); const a = fixture();
    expect(() => bridge.attachNSEExecutionContext(scope, {} as never)).toThrow();
    bridge.attachNSEExecutionContext(scope, a.context);
    expect(() => bridge.attachNSEExecutionContext(scope, a.context)).toThrow(/already|once|rebind/i);
    expect(() => bridge.attachNSEExecutionContext({} as never, a.context)).toThrow();
    scope.release("explicit");
  });

  it("enters an owner's exact recorded scope without reading public authority getters", () => {
    const a = fixture(); const value = owner(a.context);
    Object.defineProperties(value, { ownerSignal: { configurable: true, get() { throw new Error("ownerSignal"); } }, isDisposed: { configurable: true, get() { throw new Error("isDisposed"); } }, app: { configurable: true, get() { throw new Error("app"); } } });
    let signal!: AbortSignal;
    bridge.runWithNSEOwnerExecution(value, () => {
      expect(execution.getOwnedExecutionPort(execution.requireOwnedExecutionContext("callback"), a.key)).toBe("a");
      signal = execution.ownedExecutionContextSignal(execution.requireOwnedExecutionContext("callback"));
      expect(signal.aborted).toBe(false);
    });
    expect(execution.currentOwnedExecutionContext()).toBeNull();
    for (const key of ["ownerSignal", "isDisposed", "app"]) Reflect.deleteProperty(value, key);
    value.dispose(); expect(signal.aborted).toBe(true);
  });

  it("clears ambient authority for unknown and deliberately unowned owners", () => {
    const a = fixture(); const owned = owner(a.context);
    bridge.runWithNSEOwnerExecution(owned, () => {
      const unowned = new NSEViewController({ owner: nseUnowned }); owners.push(unowned);
      for (const value of [{}, unowned]) bridge.runWithNSEOwnerExecution(value, () => expect(execution.currentOwnedExecutionContext()).toBeNull());
      const explicit = new NSEViewController({ owner: owned }); owners.push(explicit);
      explicit.own(() => { expect(execution.requireOwnedExecutionContext("explicit owner")).toBeDefined(); return { dispose() {} }; });
    });
  });

  it("does not turn an unrecorded owner's public getter into execution authority", () => {
    const parent = owner();
    const unrecordedOwner = { get ownerSignal() { return parent.ownerSignal; } };
    const value = new NSEViewController({ owner: unrecordedOwner }); owners.push(value);
    bridge.runWithNSEOwnerExecution(value, () => expect(execution.currentOwnedExecutionContext()).toBeNull());
    const explicitSignal = new NSEViewController({ ownerSignal: parent.ownerSignal }); owners.push(explicitSignal);
    bridge.runWithNSEOwnerExecution(explicitSignal, () => expect(execution.requireOwnedExecutionContext("recorded signal identity")).toBeDefined());
  });

  it("gives class children their own scope before field initialization after await", async () => {
    const parent = owner(); let childContext: unknown;
    class Child extends NSEViewController { readonly resource = cancelOnly(); readonly capture = childContext = execution.requireOwnedExecutionContext("child field"); }
    await Promise.resolve();
    const child = parent.addChild(Child);
    expect(childContext).toBeDefined();
    expect(isNSEOwnedResource(child.resource, getNSEOwnerScope(child)!.signal)).toBe(true);
    expect(() => isNSEOwnedResource(child.resource, getNSEOwnerScope(parent)!.signal)).toThrow(/another|transfer/i);
    child.removeFromParent(); expect(child.resource.cancel).toHaveBeenCalledOnce();
    expect(parent.isDisposed).toBe(false);
  });

  it("records raw children's own factories without borrowing authority for an explicit unowned child", () => {
    const parent = owner(); let raw!: Raw; let unowned!: Raw;
    class Raw extends NSEViewController { readonly resource = this.own(() => cancelOnly()); }
    parent.own(() => { raw = new Raw(); return { dispose() {} }; }); owners.push(raw);
    expect(isNSEOwnedResource(raw.resource, getNSEOwnerScope(raw)!.signal)).toBe(true);
    expect(() => parent.own(() => { unowned = new Raw({ owner: nseUnowned }); return { dispose() {} }; })).toThrow(/context/i);
    expect(unowned).toBeUndefined();
    raw.dispose(); expect(raw.resource.cancel).toHaveBeenCalledOnce(); expect(parent.isDisposed).toBe(false);
  });

  it("narrows presented class fields to their actual controller lifetime", () => {
    const parent = owner();
    class Sheet extends NSEViewController { readonly resource = cancelOnly(); }
    const sheet = parent.presentAsSheet(Sheet);
    expect(isNSEOwnedResource(sheet.resource, getNSEOwnerScope(sheet)!.signal)).toBe(true);
    parent.dismiss(sheet); expect(sheet.resource.cancel).toHaveBeenCalledOnce();
  });

  it("accepts cancel-only private registrations without reading dispose and cancels once", async () => {
    const parent = owner(); await Promise.resolve();
    const resource = parent.own(() => cancelOnly());
    expect(parent.own(() => resource)).toBe(resource);
    expect(isNSEOwnedResource(resource, getNSEOwnerScope(parent)!.signal)).toBe(true);
    parent.dispose(); expect(resource.cancel).toHaveBeenCalledOnce();
    expect(() => bridge.runWithNSEOwnerExecution(parent, () => {})).toThrow();
  });

  it("stops resources at authority revocation before structural teardown without repeating cleanup", () => {
    const calls: string[] = [];
    class Parent extends NSEViewController { protected override didDispose() { calls.push("owner"); } }
    class Child extends NSEViewController { protected override didDispose() { calls.push("child"); } }
    const scope = new NSEOwnershipScope("NSEViewController", "order"); bridge.attachNSEExecutionContext(scope, fixture().context);
    const parent = instantiateInOwnerScope(scope, () => new Parent()); owners.push(parent);
    parent.addChild(Child);
    parent.own(() => { const resource = cancelOnly(); resource.cancel.mockImplementation(() => calls.push("stop resource")); return resource; });
    parent.dispose(); parent.dispose();
    expect(calls).toEqual(["stop resource", "child", "owner"]);
  });

  it("collects multiple immediate cleanup failures while completing child and owner teardown", () => {
    const calls: string[] = []; const failures = [new Error("first resource"), new Error("second resource")];
    class Parent extends NSEViewController { protected override didDispose() { calls.push("owner"); } }
    class Child extends NSEViewController { protected override didDispose() { calls.push("child"); } }
    const scope = new NSEOwnershipScope("NSEViewController", "cleanup failures"); bridge.attachNSEExecutionContext(scope, fixture().context);
    const parent = instantiateInOwnerScope(scope, () => new Parent()); owners.push(parent); const child = parent.addChild(Child);
    for (const [index, failure] of failures.entries()) parent.own(() => {
      const resource = {};
      execution.registerOwnedExecutionResource(execution.requireOwnedExecutionContext("resource"), resource, () => { calls.push(`stop ${index}`); throw failure; });
      return resource;
    });
    let reported: unknown;
    try { parent.dispose(); } catch (error) { reported = error; }
    expect(calls).toEqual(["stop 0", "stop 1", "child", "owner"]);
    expect(child.isDisposed).toBe(true); expect(parent.isDisposed).toBe(true);
    expect(reported).toBeInstanceOf(AggregateError); expect((reported as AggregateError).errors).toEqual(failures);
    expect(() => parent.dispose()).not.toThrow(); expect(calls).toHaveLength(4);
  });

  it("retains abort cleanup failures for the owner's later structural release", () => {
    const root = fixture(); const parent = owner(root.context); const failure = new Error("revoked resource"); const cleanup = vi.fn(() => { throw failure; });
    parent.own(() => { const resource = {}; execution.registerOwnedExecutionResource(execution.requireOwnedExecutionContext("resource"), resource, cleanup); return resource; });
    root.abort.abort(); expect(cleanup).toHaveBeenCalledOnce(); expect(parent.isDisposed).toBe(false);
    expect(() => parent.dispose()).toThrow(failure); expect(parent.isDisposed).toBe(true); expect(cleanup).toHaveBeenCalledOnce();
    expect(root.errors).toEqual([]);
  });

  it("collects a recorded signal child's cleanup failure during parent signal release", () => {
    const parent = owner(); const child = new NSEViewController({ ownerSignal: parent.ownerSignal }); owners.push(child);
    const failure = new Error("signal child resource"); const cleanup = vi.fn(() => { throw failure; });
    child.own(() => { const resource = {}; execution.registerOwnedExecutionResource(execution.requireOwnedExecutionContext("signal child"), resource, cleanup); return resource; });
    expect(() => parent.dispose()).toThrow(failure);
    expect(parent.isDisposed).toBe(true); expect(child.isDisposed).toBe(true); expect(cleanup).toHaveBeenCalledOnce();
  });

  it("forwards each cleanup error once after cleanup reenters and completes owner disposal", () => {
    const root = fixture(); const other = fixture(); const failures = [new Error("first late cleanup"), new Error("second late cleanup")];
    const values = failures.map(failure => {
      const parent = owner(root.context); const cleanup = vi.fn(() => { parent.dispose(); throw failure; });
      parent.own(() => { const resource = {}; execution.registerOwnedExecutionResource(execution.requireOwnedExecutionContext("reentrant resource"), resource, cleanup); return resource; });
      return { parent, cleanup };
    });
    execution.runInOwnedExecutionContext(other.context, () => { root.abort.abort(); expect(execution.currentOwnedExecutionContext()).toBe(other.context); });
    expect(root.errors).toEqual(failures); expect(root.errorContexts).toEqual([null, null]);
    root.abort.abort();
    for (const { parent, cleanup } of values) {
      expect(parent.isDisposed).toBe(true); expect(() => parent.dispose()).not.toThrow(); expect(cleanup).toHaveBeenCalledOnce();
      expect(() => bridge.runWithNSEOwnerExecution(parent, () => {})).toThrow();
    }
    expect(root.errors).toEqual(failures);
  });

  it("forwards a completed child's late cleanup through its completed ancestor to the host", () => {
    const root = fixture(); const parent = owner(root.context); const child = parent.addChild(NSEViewController); const failure = new Error("late child cleanup");
    const cleanup = vi.fn(() => { parent.dispose(); throw failure; });
    child.own(() => { const resource = {}; execution.registerOwnedExecutionResource(execution.requireOwnedExecutionContext("child resource"), resource, cleanup); return resource; });
    root.abort.abort();
    expect(child.isDisposed).toBe(true); expect(parent.isDisposed).toBe(true); expect(cleanup).toHaveBeenCalledOnce();
    expect(root.errors).toEqual([failure]); expect(root.errorContexts).toEqual([null]);
  });

  it("keeps reentrant direct scope release failures in the active outer aggregate", () => {
    const root = fixture(); const parent = owner(root.context); const scope = getNSEOwnerScope(parent)!; const failure = new Error("active release cleanup");
    const cleanup = vi.fn(() => { parent.dispose(); throw failure; });
    parent.own(() => { const resource = {}; execution.registerOwnedExecutionResource(execution.requireOwnedExecutionContext("scope resource"), resource, cleanup); return resource; });
    expect(() => scope.release("explicit")).toThrow(failure);
    expect(root.errors).toEqual([]); expect(parent.isDisposed).toBe(true); expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each(["owner", "ownerSignal"])("does not retain a partial child when revoked context inheritance rejects explicit %s", mode => {
    const root = fixture(); const parent = owner(root.context); const scope = getNSEOwnerScope(parent)!;
    const adopt = vi.spyOn(scope, "adopt"); const addListener = vi.spyOn(scope.signal, "addEventListener");
    root.abort.abort(); expect(() => scope.assertLive()).not.toThrow();
    const options = mode === "owner" ? { owner: parent } : { ownerSignal: scope.signal };
    expect(() => new NSEViewController(options)).toThrow();
    expect(scope.adoptedObjects).toEqual([]); expect(adopt).not.toHaveBeenCalled(); expect(addListener).not.toHaveBeenCalled();
    expect(() => parent.dispose()).not.toThrow(); expect(parent.isDisposed).toBe(true);
  });

  it("rejects foreign and inactive registrations before reading dispose", () => {
    const first = owner(); const second = owner(); const resource = first.own(() => cancelOnly());
    expect(() => second.own(() => resource)).toThrow(/another|transfer/i);
    first.dispose();
    expect(() => second.own(() => resource)).toThrow(/disposed/i);
    expect(resource.cancel).toHaveBeenCalledOnce();
  });

  it("retains plain disposables but rejects unregistered plain objects and primitives", () => {
    const parent = owner(); const resource = { dispose: vi.fn() };
    expect(parent.own(() => resource)).toBe(resource);
    expect(() => parent.own(() => ({}))).toThrow(/registered|disposable/i);
    expect(() => parent.own((() => 1) as never)).toThrow();
    parent.dispose(); expect(resource.dispose).toHaveBeenCalledOnce();
  });

  it("preserves callable disposables and privately registered callable resources", () => {
    const parent = owner(); const callable = Object.assign(() => 42, { dispose: vi.fn() });
    expect(parent.own(() => callable)).toBe(callable); expect(callable()).toBe(42); parent.own(() => callable);
    const registered = Object.assign(() => 7, { cancel: vi.fn() });
    expect(parent.own(() => { execution.registerOwnedExecutionResource(execution.requireOwnedExecutionContext("callable resource"), registered, () => registered.cancel()); return registered; })).toBe(registered);
    expect(registered()).toBe(7); expect(() => parent.own(() => () => {})).toThrow(/registered|disposable/i);
    parent.dispose(); expect(callable.dispose).toHaveBeenCalledOnce(); expect(registered.cancel).toHaveBeenCalledOnce();
  });

  it("rejects async factories and thenables while rolling back only fresh registrations", () => {
    const parent = owner(); const existing = parent.own(() => cancelOnly()); let fresh!: ReturnType<typeof cancelOnly>; let effects = 0;
    expect(() => parent.own((async () => { effects++; return cancelOnly(); }) as never)).toThrow(/synchronous/i);
    expect(effects).toBe(0);
    expect(() => parent.own((() => { fresh = cancelOnly(); return { then() {}, cancel() {} }; }) as never)).toThrow(/thenable/i);
    expect(fresh.cancel).toHaveBeenCalledOnce(); expect(existing.cancel).not.toHaveBeenCalled();
  });

  it("rolls back constructor and factory failures, restoring the preceding context", () => {
    const a = fixture(); const scope = new NSEOwnershipScope("NSEViewController", "failure"); bridge.attachNSEExecutionContext(scope, a.context);
    let resource!: ReturnType<typeof cancelOnly>;
    class Broken extends NSEViewController { readonly value = resource = cancelOnly(); constructor() { super(); throw new Error("constructor failure"); } }
    expect(() => instantiateInOwnerScope(scope, () => new Broken())).toThrow("constructor failure");
    expect(resource.cancel).toHaveBeenCalledOnce(); expect(scope.authoritySignal.aborted).toBe(true);
    const parent = owner();
    expect(() => parent.own(() => { resource = cancelOnly(); throw new Error("factory failure"); })).toThrow("factory failure");
    expect(resource.cancel).toHaveBeenCalledOnce(); expect(execution.currentOwnedExecutionContext()).toBeNull();
  });

  it.each([["view", NSEViewController], ["window", NSEWindowController]] as const)("continues rejecting owned %s controller results", (_name, Controller) => {
    const parent = owner(); let value!: NSEViewController | NSEWindowController;
    expect(() => parent.own(() => value = new Controller())).toThrow(/addChild|openWindow/i);
    expect(getNSEObjectLifetime(value)!.isDisposed).toBe(true);
  });
});

describe("private execution architecture", () => {
  it("shares one dependency-free neutral implementation through both internal contracts", async () => {
    const fx = await import("../../src/SynCloudOS/fxRuntimeContracts"); const nse = await import("../../src/SynCloudOS/nseRuntimeContracts");
    expect(fx.runInOwnedExecutionContext).toBe(execution.runInOwnedExecutionContext);
    expect(nse.runInOwnedExecutionContext).toBe(execution.runInOwnedExecutionContext);
    expect(fx.issueOwnedExecutionContext).toBe(execution.issueOwnedExecutionContext);
    const source = ts.createSourceFile("ownedExecutionContext.ts", readFileSync(resolve("src/SynCloudOS/ExecutionContext/ownedExecutionContext.ts"), "utf8"), ts.ScriptTarget.Latest, true);
    expect(source.statements.filter(ts.isImportDeclaration)).toEqual([]);
  });

  it("keeps context issuers, runners and bridge declarations out of every public SDK export", () => {
    const privateNames = new Set(["OwnedExecutionContext", "OwnedExecutionRecord", "OwnedExecutionLifetime", "issueOwnedExecutionContext", "currentOwnedExecutionContext", "requireOwnedExecutionContext", "runInOwnedExecutionContext", "narrowOwnedExecutionContext", "getOwnedExecutionPort", "ownedExecutionContextSignal", "assertOwnedExecutionContextLive", "registerOwnedExecutionResource", "reportOwnedExecutionResourceError", "sameOwnedExecutionProcess", "attachNSEExecutionContext", "runWithNSEOwnerExecution"]);
    const entries = Object.values(synWareSdkEntries).map(path => resolve(path));
    const program = ts.createProgram(entries, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, skipLibCheck: true });
    const checker = program.getTypeChecker();
    for (const entry of entries) {
      const source = program.getSourceFile(entry)!; const module = checker.getSymbolAtLocation(source)!;
      const exported = checker.getExportsOfModule(module).map(symbol => symbol.name);
      expect(exported.filter(name => privateNames.has(name)), entry).toEqual([]);
      // These exported symbols are the declaration surface emitted for each package entry.
    }
    expect(Object.values(synWareSdkEntries).some(path => /ownedExecution|owned-context/i.test(path))).toBe(false);
  });
});
