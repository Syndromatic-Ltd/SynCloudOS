import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEArrayController } from "../../src/NSE/Controllers/NSEArrayController";
import { enterClassApplication, nseUnowned } from "../../src/NSE/Controllers/ownership";

const owners: NSEViewController[] = [];
const owner = () => { const value = new NSEViewController({ owner: nseUnowned }); owners.push(value); return value; };
const rows = (id = "rows", options = {}) => new NSEArrayController<{ id: string }>({ id, getId: row => row.id, ...options });
afterEach(() => { for (const value of owners.splice(0).reverse()) { try { value.dispose(); } catch { /* Tested cleanup failures. */ } } });

describe("synchronous owned factories", () => {
  it("owns data controllers after await without leaking the ambient slot", async () => {
    const parent = owner();
    const leave = enterClassApplication();
    try {
      await Promise.resolve();
      const value = parent.own(() => rows());
      expect(() => rows("outside")).toThrow(/owner/i);
      parent.dispose();
      expect(value.isDisposed).toBe(true);
      expect(value.disposalReason).toBe("explicit");
    } finally { leave(); }
  });

  it("does not evaluate a factory after disposal", () => {
    const parent = owner(); parent.dispose();
    const factory = vi.fn(() => ({ dispose() {} }));
    expect(() => parent.own(factory)).toThrow();
    expect(factory).not.toHaveBeenCalled();
  });

  it("registers a plain disposable once by identity", () => {
    const parent = owner(); const resource = { dispose: vi.fn() };
    expect(parent.own(() => resource)).toBe(resource);
    parent.own(() => resource);
    parent.dispose();
    expect(resource.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not double-register data controllers or move resources from another owner", () => {
    const first = owner(); const second = owner();
    const data = first.own(() => rows()); const dispose = vi.spyOn(data, "dispose");
    first.own(() => data);
    expect(() => second.own(() => data)).toThrow(/another|different|transfer/i);
    second.dispose(); expect(data.isDisposed).toBe(false);
    first.dispose(); expect(data.isDisposed).toBe(true);
    // Framework disposal uses its recorded reason, not a second public dispose call.
    expect(dispose.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("recognizes explicit owner and ownerSignal resources", () => {
    const parent = owner(); const other = owner();
    const data = rows("explicit", { owner: other });
    expect(() => parent.own(() => data)).toThrow(/another|different|transfer/i);
    const signalData = rows("signal", { ownerSignal: other.ownerSignal });
    expect(() => parent.own(() => signalData)).toThrow(/another|different|transfer/i);
    parent.dispose(); expect(data.isDisposed).toBe(false); expect(signalData.isDisposed).toBe(false);
    other.dispose(); expect(data.isDisposed).toBe(true); expect(signalData.isDisposed).toBe(true);
  });

  it("rolls back only new acquisitions in reverse order when a factory throws", () => {
    const parent = owner(); const calls: string[] = [];
    const old = parent.own(() => ({ dispose() { calls.push("old"); } }));
    const failure = new Error("construction failed");
    let data!: ReturnType<typeof rows>;
    expect(() => parent.own(() => {
      parent.own(() => old);
      data = rows(); data.onDispose(() => { calls.push("data"); });
      parent.own(() => ({ dispose() { calls.push("nested"); throw new Error("cleanup"); } }));
      throw failure;
    })).toThrow(failure);
    expect(calls).toEqual(["nested", "data"]);
    expect(data.isDisposed).toBe(true);
    parent.dispose(); expect(calls).toEqual(["nested", "data", "old"]);
  });

  it("restores the outer owner after a nested factory", () => {
    const first = owner(); const second = owner();
    let inner!: ReturnType<typeof rows>; let later!: ReturnType<typeof rows>;
    const outer = first.own(() => {
      inner = second.own(() => rows("inner"));
      later = rows("later");
      return rows("outer");
    });
    first.dispose(); expect(later.isDisposed).toBe(true); expect(outer.isDisposed).toBe(true); expect(inner.isDisposed).toBe(false);
    second.dispose(); expect(inner.isDisposed).toBe(true);
  });

  it("releases a returned plain resource if the owner is disposed in the factory", () => {
    const parent = owner(); const resource = { dispose: vi.fn() };
    expect(() => parent.own(signal => { expect(signal.aborted).toBe(false); parent.dispose(); expect(signal.aborted).toBe(true); return resource; })).toThrow();
    expect(resource.dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects thenables and rolls back synchronous acquisitions", () => {
    const parent = owner(); let data!: ReturnType<typeof rows>;
    expect(() => parent.own((() => { data = rows(); return Promise.resolve({ dispose() {} }); }) as never)).toThrow(/synchronous|async|thenable/i);
    expect(data.isDisposed).toBe(true);
  });

  it("rejects declared async factories before evaluating any of their body", async () => {
    const parent = owner(); let effects = 0;
    const factory = async () => { effects++; await Promise.resolve(); effects++; return { dispose() {} }; };
    expect(() => parent.own(factory as never)).toThrow(/synchronous|async/);
    await Promise.resolve(); expect(effects).toBe(0);
  });

  it.each([NSEViewController, NSEWindowController])("rejects own construction of %s and releases its acquisitions", Controller => {
    const parent = owner(); let invalid!: InstanceType<typeof Controller>; let data!: ReturnType<typeof rows>;
    expect(() => parent.own(() => { invalid = new Controller(); data = rows(); return invalid; })).toThrow(/addChild|openWindow/);
    expect(invalid.isDisposed).toBe(true); expect(data.isDisposed).toBe(true); expect(parent.isDisposed).toBe(false);
  });

  it("preserves children, owner, resources disposal order while collecting failures", () => {
    const calls: string[] = [];
    class Parent extends NSEViewController { protected override didDispose() { calls.push("owner"); } }
    class Child extends NSEViewController { protected override didDispose() { calls.push("child"); } }
    const parent = new Parent({ owner: nseUnowned }); owners.push(parent);
    parent.addChild(Child);
    parent.own(() => ({ dispose() { calls.push("first"); throw new Error("first"); } }));
    parent.own(() => ({ dispose() { calls.push("last"); throw new Error("last"); } }));
    expect(() => parent.dispose()).toThrow(AggregateError);
    expect(calls).toEqual(["child", "owner", "first", "last"]);
  });
});

describe("parameterized child construction", () => {
  it("gives parameterized children their own field-resource scope", () => {
    class Detail extends NSEViewController {
      readonly rows = rows();
      constructor(readonly root: NSEViewController, readonly item: string) { super(); }
    }
    const parent = owner(); const child = parent.addChild(Detail, parent, "selected");
    const sibling = parent.addChild(Detail, parent, "sibling");
    expect(child.root).toBe(parent); expect(child.item).toBe("selected");
    child.removeFromParent(); expect(child.rows.isDisposed).toBe(true); expect(sibling.rows.isDisposed).toBe(false); expect(parent.isDisposed).toBe(false);
  });

  it("rolls back the fresh child scope if its parent disposes during construction", () => {
    const parent = owner(); let failed!: Detail;
    class Detail extends NSEViewController {
      readonly rows = rows();
      constructor(root: NSEViewController) { super(); failed = this; root.dispose(); }
    }
    expect(() => parent.addChild(Detail, parent)).toThrow();
    expect(failed.isDisposed).toBe(true); expect(failed.rows.isDisposed).toBe(true); expect(failed.ownerSignal.aborted).toBe(true);
    expect(parent.children).toEqual([]);
  });
});
