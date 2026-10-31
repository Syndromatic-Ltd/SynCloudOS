// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createMountedScreenWakeLock } from "../../src/SynCloudOS/AppSDK/mountedScreenWakeLock";

function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
class Sentinel extends EventTarget {
  released = false;
  readonly release = vi.fn(async () => { this.revoke(); });
  revoke() { if (this.released) return; this.released = true; this.dispatchEvent(new Event("release")); }
}
function fixture(available = true) {
  const owner = new AbortController(), listeners = new Set<() => void>();
  let visible = true, foreground = true;
  const sentinel = new Sentinel(), request = vi.fn(() => Promise.resolve(sentinel as unknown as WakeLockSentinel));
  const service = createMountedScreenWakeLock({ signal: owner.signal, navigator: available ? { wakeLock: { request } } as unknown as Navigator : null,
    assertLive: () => owner.signal.throwIfAborted(), isForeground: () => foreground, isVisible: () => visible,
    subscribeOwner: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  });
  return { owner, sentinel, request, service, listeners,
    visibility(value: boolean) { visible = value; for (const fn of [...listeners]) fn(); },
    foreground(value: boolean) { foreground = value; for (const fn of [...listeners]) fn(); },
  };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

describe("explicit scoped screen wake lock", () => {
  it("never acquires on construction, subscription or visibility return; explicit request owns one sentinel", async () => {
    const f = fixture(); f.visibility(false); f.visibility(true); expect(f.request).not.toHaveBeenCalled();
    const lease = f.service.request("Reading generated document"); expect(f.request).toHaveBeenCalledExactlyOnceWith("screen"); expect(lease.getSnapshot().state).toBe("requesting");
    await flush(); expect(lease.getSnapshot().state).toBe("held"); await lease.release(); expect(lease.getSnapshot()).toMatchObject({ state: "released", reason: "explicit" });
    await lease.release(); expect(f.sentinel.release).toHaveBeenCalledTimes(1); f.owner.abort(); expect(f.listeners.size).toBe(0);
  });
  it.each(["hidden", "foreground"])("defers %s acquisition and requires fresh intent after return", async mode => {
    const f = fixture(); if (mode === "hidden") f.visibility(false); else f.foreground(false);
    const lease = f.service.request("Explicit presentation"); expect(lease.getSnapshot().state).toBe("deferred"); expect(f.request).not.toHaveBeenCalled();
    f.visibility(true); f.foreground(true); await flush(); expect(f.request).not.toHaveBeenCalled(); expect(lease.getSnapshot().state).toBe("deferred"); f.owner.abort();
  });
  it.each(["hidden", "foreground", "owner", "caller"])("releases on %s lifecycle and never reacquires automatically", async mode => {
    const f = fixture(), caller = new AbortController(); const lease = f.service.request("Keep generated reader awake", caller.signal); await flush();
    if (mode === "hidden") f.visibility(false); else if (mode === "foreground") f.foreground(false); else if (mode === "owner") f.owner.abort(); else caller.abort();
    await flush(); expect(f.sentinel.release).toHaveBeenCalledOnce(); expect(lease.getSnapshot().state).toBe("released");
    f.visibility(true); f.foreground(true); await flush(); expect(f.request).toHaveBeenCalledOnce(); f.owner.abort();
  });
  it.each(["explicit", "owner", "caller", "hidden"])("fences a pending acquisition interrupted by %s and releases the late result", async mode => {
    const f = fixture(), caller = new AbortController(), pending = deferred<WakeLockSentinel>(); f.request.mockReturnValueOnce(pending.promise);
    const lease = f.service.request("Pending reader", caller.signal);
    if (mode === "explicit") void lease.release(); else if (mode === "owner") f.owner.abort(); else if (mode === "caller") caller.abort(); else f.visibility(false);
    expect(lease.getSnapshot().state).toBe("releasing"); pending.resolve(f.sentinel as never); await flush();
    expect(lease.getSnapshot().state).toBe("released"); expect(f.sentinel.release).toHaveBeenCalledOnce(); expect(f.request).toHaveBeenCalledOnce(); f.owner.abort();
  });
  it("handles owner changes reentrantly during native request without leaking a late lock", async () => {
    const f = fixture(); f.request.mockImplementationOnce(() => { f.visibility(false); return Promise.resolve(f.sentinel as never); });
    const lease = f.service.request("Explicit reader"); await flush(); expect(lease.getSnapshot().state).toBe("released"); expect(f.sentinel.release).toHaveBeenCalledOnce(); f.owner.abort();
  });
  it("reports browser revocation and an already released sentinel without silently replacing them", async () => {
    const f = fixture(); const lease = f.service.request("Reader"); await flush(); f.sentinel.revoke();
    expect(lease.getSnapshot()).toMatchObject({ state: "revoked", reason: "browser-released" }); f.visibility(false); f.visibility(true); await flush(); expect(f.request).toHaveBeenCalledOnce(); f.owner.abort();
    const g = fixture(); g.sentinel.revoke(); const stale = g.service.request("Reader"); await flush(); expect(stale.getSnapshot().state).toBe("revoked"); g.owner.abort();
  });
  it.each(["NotAllowedError", "AbortError", "NotSupportedError"])("reports a native %s without inventing a permission outcome", async name => {
    const f = fixture(); f.request.mockRejectedValueOnce(new DOMException("Browser/OS rejected", name)); const lease = f.service.request("Reader"); await flush();
    expect(lease.getSnapshot()).toEqual({ state: "failed", reason: "request-failed", errorName: name }); expect(f.sentinel.release).not.toHaveBeenCalled(); f.owner.abort();
  });
  it("reports unavailable and rejects absent intent or expired callers without making a request", () => {
    const f = fixture(false); expect(f.service.request("Reader").getSnapshot().state).toBe("unsupported");
    expect(() => f.service.request("")).toThrow(TypeError); const caller = new AbortController(); caller.abort(); expect(() => f.service.request("Reader", caller.signal)).toThrow(); f.owner.abort(); expect(() => f.service.request("Reader")).toThrow();
  });
  it("keeps competing leases independent and bounds outstanding ownership", async () => {
    const f = fixture(), other = new Sentinel(); f.request.mockResolvedValueOnce(f.sentinel as never).mockResolvedValueOnce(other as never);
    const one = f.service.request("Reader one"), two = f.service.request("Reader two"); await flush(); await one.release(); expect(other.release).not.toHaveBeenCalled(); expect(two.getSnapshot().state).toBe("held");
    f.owner.abort(); await flush(); expect(other.release).toHaveBeenCalledOnce();
    const g = fixture(), pending = deferred<WakeLockSentinel>(); g.request.mockReturnValue(pending.promise); for (let i = 0; i < 8; i++) g.service.request("Reader " + i); expect(() => g.service.request("Ninth")).toThrow(/limit/); g.owner.abort(); pending.reject(new DOMException("Interrupted", "AbortError")); await flush();
  });
  it("reports failed release, permits an explicit retry and observes eventual browser revocation", async () => {
    const f = fixture(); f.sentinel.release.mockRejectedValueOnce(new DOMException("Release failed", "AbortError")); const lease = f.service.request("Reader"); await flush(); await lease.release();
    expect(lease.getSnapshot()).toMatchObject({ state: "failed", reason: "release-failed", errorName: "AbortError" }); expect(f.sentinel.released).toBe(false);
    await lease.release(); expect(lease.getSnapshot().state).toBe("released"); expect(f.sentinel.release).toHaveBeenCalledTimes(2); f.owner.abort();
  });
  it("observers can release reentrantly without recursive acquisition or release", async () => {
    const f = fixture(); const lease = f.service.request("Reader"); lease.subscribe(() => { if (lease.getSnapshot().state === "releasing") void lease.release(); }); await flush(); await lease.release();
    expect(lease.getSnapshot().state).toBe("released"); expect(f.sentinel.release).toHaveBeenCalledOnce(); f.owner.abort();
  });
});
