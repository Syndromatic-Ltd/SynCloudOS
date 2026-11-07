// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createStorageDiagnosticsClient as createMountedStorageDiagnostics } from "../../src/SynCloudOS/Persistence/storageDiagnostics";

const deferred = <T>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture(storage: unknown) {
  const owner = new AbortController(), getNavigator = vi.fn(() => ({ storage }) as Navigator);
  const client = createMountedStorageDiagnostics({ signal: owner.signal, assertLive: () => owner.signal.throwIfAborted(), getNavigator });
  return { owner, getNavigator, client };
}
describe("request-only storage diagnostics", () => {
  it("retains receivers and reports only immutable coarse origin facts, including zero and false", async () => {
    const forbidden = vi.fn(() => { throw Error("must not be called"); });
    const storage = { estimate: vi.fn(function (this: unknown) { expect(this).toBe(storage); return Promise.resolve({ usage: 0, quota: 20, get usageDetails() { throw Error("private detail must not be read"); }, account: "private-generated" }); }), persisted: vi.fn(function (this: unknown) { expect(this).toBe(storage); return Promise.resolve(false); }), persist: forbidden, getDirectory: forbidden };
    const f = fixture(storage); expect(f.getNavigator).not.toHaveBeenCalled();
    const snapshot = await f.client.inspect();
    expect(snapshot).toEqual({ estimate: { state: "observed", usageBytes: 0, quotaBytes: 20, approximate: true }, persistence: { state: "observed", persisted: false } });
    expect(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.estimate) && Object.isFrozen(snapshot.persistence)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("private"); expect(forbidden).not.toHaveBeenCalled();
    await f.client.inspect(); expect(storage.estimate).toHaveBeenCalledTimes(2); expect(storage.persisted).toHaveBeenCalledTimes(2);
    await new Promise(resolve => setTimeout(resolve, 20)); expect(storage.estimate).toHaveBeenCalledTimes(2);
  });
  it.each([undefined, null, {}])("reports missing APIs without inventing zero use or non-persistence (%s)", async storage => {
    expect(await fixture(storage).client.inspect()).toEqual({ estimate: { state: "unsupported" }, persistence: { state: "unsupported" } });
  });
  it("reports support independently and retains omitted fields as unknown", async () => {
    expect(await fixture({ estimate: () => Promise.resolve({ quota: 7 }) }).client.inspect()).toEqual({ estimate: { state: "observed", usageBytes: null, quotaBytes: 7, approximate: true }, persistence: { state: "unsupported" } });
    expect((await fixture({ persisted: () => Promise.resolve(true) }).client.inspect()).persistence).toEqual({ state: "observed", persisted: true });
    expect((await fixture({ estimate: () => Promise.resolve({}) }).client.inspect()).estimate).toEqual({ state: "observed", usageBytes: null, quotaBytes: null, approximate: true });
  });
  it.each(["NotAllowedError", "SecurityError", "TypeError", "AbortError", "Error"])("normalizes synchronous/asynchronous %s without exposing messages or treating false as refusal", async name => {
    const error = new DOMException("private-generated-account/path", name);
    const result = await fixture({ estimate() { throw error; }, persisted: () => Promise.reject(error) }).client.inspect();
    const state = name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed";
    expect(result).toEqual({ estimate: { state }, persistence: { state } }); expect(JSON.stringify(result)).not.toContain("private");
  });
  it("contains throwing navigator/storage/method getters and still queries the independently available method", async () => {
    const f = fixture(null); f.getNavigator.mockImplementation(() => { throw new DOMException("generated", "SecurityError"); });
    expect(await f.client.inspect()).toEqual({ estimate: { state: "denied" }, persistence: { state: "denied" } });
    expect(await fixture({ get estimate() { throw Error("generated"); }, persisted: () => Promise.resolve(true) }).client.inspect()).toEqual({ estimate: { state: "failed" }, persistence: { state: "observed", persisted: true } });
    f.getNavigator.mockImplementation(() => ({ get storage() { throw new TypeError("disabled storage"); } }) as Navigator);
    expect(await f.client.inspect()).toEqual({ estimate: { state: "failed" }, persistence: { state: "failed" } });
  });
  it.each([null, [], "123", { usage: -1 }, { quota: NaN }, { usage: Infinity }, { usage: null }, { quota: "123" }])("rejects malformed estimate fields (%j)", async value => {
    const result = await fixture({ estimate: () => Promise.resolve(value), persisted: () => Promise.resolve(false) }).client.inspect();
    expect(result.estimate).toEqual({ state: "failed" }); expect(result.persistence).toEqual({ state: "observed", persisted: false });
  });
  it.each([undefined, null, "false", 0, {}])("does not coerce malformed persistence (%j)", async value => {
    expect((await fixture({ persisted: () => Promise.resolve(value) }).client.inspect()).persistence).toEqual({ state: "failed" });
  });
  it("does not manufacture available space by clamping browser estimates", async () => {
    expect((await fixture({ estimate: () => Promise.resolve({ usage: 9, quota: 5 }) }).client.inspect()).estimate).toEqual({ state: "observed", usageBytes: 9, quotaBytes: 5, approximate: true });
  });
  it.each(["owner", "caller"])("aborts %s promptly, observes late success/rejection and rejects retained revoked readers", async mode => {
    const estimate = deferred<object>(), persisted = deferred<boolean>(), caller = new AbortController();
    const f = fixture({ estimate: () => estimate.promise, persisted: () => persisted.promise });
    const pending = f.client.inspect(caller.signal); const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    (mode === "owner" ? f.owner : caller).abort(); await rejected;
    estimate.resolve({ usage: 5, quota: 6 }); persisted.reject(Error("late generated failure")); await Promise.resolve(); await Promise.resolve();
    if (mode === "owner") await expect(f.client.inspect()).rejects.toMatchObject({ name: "AbortError" });
  });
  it("does not cross either query boundary for an already-aborted owner/caller", async () => {
    const native = vi.fn(), f = fixture({ estimate: native, persisted: native }), caller = new AbortController(); caller.abort();
    await expect(f.client.inspect(caller.signal)).rejects.toMatchObject({ name: "AbortError" }); expect(f.getNavigator).not.toHaveBeenCalled();
    f.owner.abort(); await expect(f.client.inspect()).rejects.toMatchObject({ name: "AbortError" }); expect(native).not.toHaveBeenCalled();
  });
  it("rechecks cancellation between native queries and contains reentrant error-name getters", async () => {
    const persisted = vi.fn(), f = fixture({ estimate() { f.owner.abort(); return Promise.resolve({}); }, persisted });
    await expect(f.client.inspect()).rejects.toMatchObject({ name: "AbortError" }); expect(persisted).not.toHaveBeenCalled();
    const g = fixture(null); g.getNavigator.mockImplementation(() => { throw { get name() { g.owner.abort(); return "SecurityError"; } }; });
    await expect(g.client.inspect()).rejects.toMatchObject({ name: "AbortError" });
  });
});
