import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as N from "../../../src/FX/NFCFX/public";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
import { associateNFCPort, type NFCAdapter, type NFCEvents, type NFCNativeSession, type NFCNativeTag } from "../../../src/FX/NFCFX/internal/nfcPort";
import { createMountedNFCPort } from "../../../src/SynCloudOS/AppSDK/mountedNFCPort";
import { createPrivacyStore } from "../../../src/SynCloudOS/Privacy";
import { dispatchQueueForSession } from "../../../src/FX/DispatchFX/internal/sessionBinding";
import { scosSessionsForApp } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";

const App = bindFXFamily(N, "com.example.nfc"); const cleanups: (() => void)[] = []; const jobs: (() => void)[] = [];
const ticks = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }; const flush = () => { while (jobs.length) jobs.shift()!(); };
function fixture(adapterOverride?: NFCAdapter) {
  const owner = new AbortController(); let allowed = true; let entitlements = ["nfc.read", "nfc.write"]; const observers = new Set<() => void>();
  const privacy = createPrivacyStore({ runtimeId: "nfc" }); const scope = { userId: "u", appId: "com.example.nfc", service: "nfc" };
  const active: { events: NFCEvents; resolve(value: NFCNativeSession): void; reject(error: unknown): void; native: NFCNativeSession; stop: ReturnType<typeof vi.fn> }[] = [];
  const message = () => new N.NFXNDEFMessage([N.NFXNDEFPayload.wellKnownTypeTextPayload("hello", new Intl.Locale("en"))!]);
  const tag: NFCNativeTag = { isAvailable: true, queryNDEFStatus: vi.fn(async () => ({ status: "readWrite", capacity: 512 })), readNDEF: vi.fn(async () => message()), writeNDEF: vi.fn(async () => {}), writeLock: vi.fn(async () => {}) };
  const open = vi.fn((_signal: AbortSignal, events: NFCEvents) => new Promise<NFCNativeSession>((resolve, reject) => { const stop = vi.fn(async () => {}); const native = { connect: vi.fn(async () => {}), restartPolling: vi.fn(), invalidate: stop }; active.push({ events, resolve, reject, native, stop }); }));
  const port = createMountedNFCPort(adapterOverride ?? { readingAvailable: true, open }, owner.signal, () => entitlements, () => allowed, privacy.forApplication({ ...scope, signal: owner.signal }), listener => { observers.add(listener); return () => { observers.delete(listener); }; });
  const context = { appId: scope.appId, runtimeInfo: { id: "nfc" }, signal: owner.signal } as SynWareContextValue; associateNFCPort(context, port);
  const unregister = registerSCOSAppSession({ appId: scope.appId, displayName: "NFC", version: "1", context }); cleanups.push(() => { owner.abort(); unregister(); privacy.dispose(); });
  return { owner, open, active, tag, message, privacy, scope, port, context, unregister, access(value: boolean) { allowed = value; for (const listener of observers) listener(); }, entitlements(value: string[]) { entitlements = value; for (const listener of observers) listener(); } };
}
beforeEach(() => vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } }));
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); flush(); vi.unstubAllGlobals(); });
it("pins attribution and queues detect/connect/status/read/write/lock/invalidate completions", async () => {
  expect(() => new N.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {} })).toThrow(/application bundle/);
  const f = fixture(); const invalidated = vi.fn(); const detected = vi.fn(); const active = vi.fn();
  const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError: invalidated, readerSessionDidDetectTags: detected, readerSessionDidBecomeActive: active }, null, false);
  expect(session).toBeInstanceOf(N.NFXReaderSession); const Queue = dispatchQueueForSession(scosSessionsForApp(f.scope.appId)[0]!); expect(session.sessionQueue).toBeInstanceOf(Queue); expect(session.sessionQueue).not.toBe(Queue.main); expect(session.sessionQueue.label).toBe("com.syndromatic.nfc.reader-session"); expect(App.NFXNDEFReaderSession.readingAvailable).toBe(true); expect(f.privacy.getSnapshot()).toEqual([]);
  session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); expect(active).not.toHaveBeenCalled(); flush(); expect(active).toHaveBeenCalledExactlyOnceWith(session);
  f.active[0]!.events.tags([f.tag]); flush(); const tag = detected.mock.calls[0]![1][0] as N.NFXNDEFTag; expect(tag.isAvailable).toBe(true);
  const connected = vi.fn(); session.connect(tag, connected); await ticks(); expect(connected).not.toHaveBeenCalled(); flush(); expect(connected).toHaveBeenCalledExactlyOnceWith(null);
  const status = vi.fn(); const read = vi.fn(); const wrote = vi.fn(); const locked = vi.fn(); tag.queryNDEFStatus(status); tag.readNDEF(read); tag.writeNDEF(f.message(), wrote); tag.writeLock(locked); await ticks(); flush();
  expect(status).toHaveBeenCalledExactlyOnceWith("readWrite", 512, null); expect(read.mock.calls[0]![0]).toBeInstanceOf(N.NFXNDEFMessage); expect(read.mock.calls[0]![1]).toBeNull(); expect(wrote).toHaveBeenCalledExactlyOnceWith(null); expect(locked).toHaveBeenCalledExactlyOnceWith(null);
  session.invalidate(); await ticks(); flush(); expect(session.isReady).toBe(false); expect(tag.isAvailable).toBe(false); expect(f.active[0]!.stop).toHaveBeenCalledOnce(); expect(invalidated).toHaveBeenCalledWith(session, expect.objectContaining({ code: "readerSessionInvalidationErrorUserCanceled" })); expect(() => session.begin()).toThrow(N.NFXReaderError);
});
it("delivers actual NDEF messages then the first-read terminal invalidation", async () => {
  const f = fixture(); const order: string[] = []; const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError(_sender, error) { order.push(error.code); }, readerSessionDidDetectNDEFs(_sender, messages) { expect(messages[0]).toBeInstanceOf(N.NFXNDEFMessage); order.push("read"); } });
  session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); flush(); f.active[0]!.events.messages([f.message()]); flush(); await ticks(); flush(); expect(order).toEqual(["read", "readerSessionInvalidationErrorFirstNDEFTagRead"]);
});
it.each(["revoke", "policy", "entitlement", "unregister", "teardown", "invalidate"])("drops pending/queued results after %s and closes only late old handles", async reason => {
  const f = fixture(); const received = vi.fn(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {}, readerSessionDidDetectNDEFs: received }, null, false); session.begin();
  if (reason === "revoke") { f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); } else if (reason === "policy") { f.access(false); f.access(true); } else if (reason === "entitlement") { f.entitlements([]); f.entitlements(["nfc.read", "nfc.write"]); } else if (reason === "unregister") f.unregister(); else if (reason === "teardown") f.owner.abort(); else session.invalidate();
  let replacement = false; if (!["unregister", "teardown"].includes(reason)) { const next = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {} }); next.begin(); replacement = true; }
  f.active[0]!.resolve(f.active[0]!.native); await ticks(); f.active[0]!.events.messages([f.message()]); flush(); expect(received).not.toHaveBeenCalled(); expect(f.active[0]!.stop).toHaveBeenCalledOnce(); if (replacement) expect(f.active[1]!.stop).not.toHaveBeenCalled(); expect(() => session.begin()).toThrow(N.NFXReaderError);
});
it.each(["connect", "queryNDEFStatus", "readNDEF", "writeNDEF", "writeLock", "invalidate"])("records raw native denial at %s before conversion and suppresses queued callbacks", async boundary => {
  const f = fixture(); f.privacy.setAuthorization(f.scope, "granted"); const detected = vi.fn(); const received = vi.fn(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError: received, readerSessionDidDetectTags: detected }, null, false); session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); flush(); f.active[0]!.events.tags([f.tag]); flush(); const tag = detected.mock.calls[0]![1][0] as N.NFXNDEFTag;
  if (boundary !== "connect") { session.connect(tag, () => {}); await ticks(); flush(); }
  const deny = () => { throw new DOMException("Native denied", "SecurityError"); };
  if (boundary === "connect" || boundary === "invalidate") Object.assign(f.active[0]!.native, { [boundary]: deny }); else Object.assign(f.tag, { [boundary]: deny });
  if (boundary === "connect") session.connect(tag, received); else if (boundary === "invalidate") session.invalidate(); else if (boundary === "writeNDEF") tag.writeNDEF(f.message(), received); else tag[boundary as "readNDEF"](received);
  await ticks(); flush(); expect(f.privacy.getSnapshot()[0]).toMatchObject({ browserStatus: "denied", authorizationStatus: "denied" }); expect(App.NFXNDEFReaderSession.readingAvailable).toBe(false); expect(received).not.toHaveBeenCalled();
});
it("protects error completions before native begin and makes revoked queued callbacks irrevocable", () => {
  const f = fixture(); const callback = vi.fn(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError: callback }); session.connect({} as N.NFXNDEFTag, callback); f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); flush(); expect(callback).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled(); expect(() => session.begin()).toThrow(N.NFXReaderError);
});

it("reports unavailable native alert UI instead of silently retaining a message", async () => {
  fixture(); const invalidated = vi.fn(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError: invalidated });
  expect(() => { session.alertMessage = "Hold tag"; }).toThrow(expect.objectContaining({ code: "readerErrorUnsupportedFeature" })); session.invalidate("Custom native text"); await ticks(); flush(); expect(invalidated).toHaveBeenCalledWith(session, expect.objectContaining({ code: "readerErrorUnsupportedFeature" }));
});

it("releases its single selected-session and access observations after invalidation", async () => {
  const f = fixture(); const adds = vi.spyOn(f.owner.signal, "addEventListener"); const removes = vi.spyOn(f.owner.signal, "removeEventListener"); const releases: ReturnType<typeof vi.fn>[] = [];
  associateNFCPort(f.context, { ...f.port, observeAccessLoss(listener) { const release = vi.fn(f.port.observeAccessLoss(listener)); releases.push(release); return release; } });
  const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {} }); adds.mockClear(); session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); flush(); const observed = adds.mock.calls.filter(call => call[0] === "abort" && typeof call[1] === "function" && call[1].name === "notify"); expect(observed).toHaveLength(1);
  session.invalidate(); await ticks(); flush(); expect(releases).toHaveLength(1); expect(releases[0]).toHaveBeenCalledOnce(); expect(removes.mock.calls.filter(call => call[1] === observed[0]![1])).toHaveLength(1); f.unregister(); f.owner.abort(); expect(releases[0]).toHaveBeenCalledOnce();
});
it("performs native invalidation only once even when synchronous denial revokes the session reentrantly", async () => {
  const f = fixture(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {} }); session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); flush(); const denied = vi.fn(() => { throw new DOMException("Denied", "NotAllowedError"); }); f.active[0]!.native.invalidate = denied; session.invalidate(); await ticks(); flush(); expect(denied).toHaveBeenCalledOnce();
});
it.each(["connect", "queryNDEFStatus", "readNDEF", "writeNDEF", "writeLock", "invalidate"])("does not let a stale %s denial revoke a replacement after regrant", async boundary => {
  const f = fixture(); const detected = vi.fn(); const callback = vi.fn(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError: callback, readerSessionDidDetectTags: detected }, null, false); session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); flush(); f.active[0]!.events.tags([f.tag]); flush(); const tag = detected.mock.calls[0]![1][0] as N.NFXNDEFTag;
  if (boundary !== "connect") { session.connect(tag, () => {}); await ticks(); flush(); }
  let reject!: (error: unknown) => void; const pending = () => new Promise<never>((_resolve, fail) => { reject = fail; });
  if (boundary === "connect" || boundary === "invalidate") Object.assign(f.active[0]!.native, { [boundary]: pending }); else Object.assign(f.tag, { [boundary]: pending });
  if (boundary === "connect") session.connect(tag, callback); else if (boundary === "invalidate") session.invalidate(); else if (boundary === "writeNDEF") tag.writeNDEF(f.message(), callback); else tag[boundary as "readNDEF"](callback);
  f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); const replacement = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {} }, null, false); replacement.begin(); f.active[1]!.resolve(f.active[1]!.native); await ticks(); flush(); reject(new DOMException("Old native denial", "SecurityError")); await ticks(); flush();
  expect(callback).not.toHaveBeenCalled(); expect(replacement.isReady).toBe(true); expect(App.NFXNDEFReaderSession.readingAvailable).toBe(true); expect(f.active[1]!.stop).not.toHaveBeenCalled();
});
it("drops already queued tag completions after revoke/regrant and never revives the old tag", async () => {
  const f = fixture(); const detected = vi.fn(); const callback = vi.fn(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {}, readerSessionDidDetectTags: detected }, null, false); session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); flush(); f.active[0]!.events.tags([f.tag]); flush(); const tag = detected.mock.calls[0]![1][0] as N.NFXNDEFTag; session.connect(tag, () => {}); await ticks(); flush(); tag.readNDEF(callback); await ticks(); f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); flush(); expect(callback).not.toHaveBeenCalled(); expect(tag.isAvailable).toBe(false); expect(() => tag.readNDEF(callback)).toThrow(N.NFXReaderError);
});
it("requires launch read and write entitlements independently without obtaining data or invoking writes", async () => {
  const f = fixture(); f.entitlements([]); expect(App.NFXNDEFReaderSession.readingAvailable).toBe(false); expect(() => new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {} }).begin()).toThrow(expect.objectContaining({ code: "readerErrorSecurityViolation" })); expect(f.open).not.toHaveBeenCalled(); f.entitlements(["nfc.read"]);
  const detected = vi.fn(); const callback = vi.fn(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {}, readerSessionDidDetectTags: detected }, null, false); session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); flush(); f.active[0]!.events.tags([f.tag]); flush(); const tag = detected.mock.calls[0]![1][0] as N.NFXNDEFTag; session.connect(tag, () => {}); await ticks(); flush(); tag.writeNDEF(f.message(), callback); flush(); expect(callback).toHaveBeenCalledWith(expect.objectContaining({ code: "readerErrorSecurityViolation" })); expect(f.tag.writeNDEF).not.toHaveBeenCalled();
});

it("uses an explicit Dispatch queue and retains its own default serial queue after another app runtime appears", async () => {
  const f = fixture(); const selected = scosSessionsForApp(f.scope.appId)[0]!; const Queue = dispatchQueueForSession(selected); const queue = new Queue("nfc-test-queue"); queue.suspend(); const active = vi.fn(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {}, readerSessionDidBecomeActive: active }, queue, false); const defaultSession = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {} }); const defaultQueue = defaultSession.sessionQueue; expect(defaultQueue).toBeInstanceOf(Queue); expect(defaultQueue).not.toBe(Queue.main); expect(new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {} }).sessionQueue).not.toBe(defaultQueue);
  const another = fixture(); expect(defaultSession.sessionQueue).toBe(defaultQueue); session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); flush(); expect(active).not.toHaveBeenCalled(); queue.resume(); flush(); expect(active).toHaveBeenCalledWith(session); expect(another.open).not.toHaveBeenCalled();
});
it("restarting polling retires old tags and connecting an already connected tag is a queued no-op", async () => {
  const f = fixture(); const detected = vi.fn(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {}, readerSessionDidDetectTags: detected }, null, false); session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); flush(); f.active[0]!.events.tags([f.tag]); flush(); const tag = detected.mock.calls[0]![1][0] as N.NFXNDEFTag; const callback = vi.fn(); session.connect(tag, callback); await ticks(); flush(); session.connect(tag, callback); await ticks(); flush(); expect(f.active[0]!.native.connect).toHaveBeenCalledOnce(); expect(callback).toHaveBeenCalledTimes(2); session.restartPolling(); expect(tag.isAvailable).toBe(false); session.connect(tag, callback); flush(); expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ code: "readerTransceiveErrorTagNotConnected" }));
});

it("invalidates after a first successful explicit tag read when the initializer requests it", async () => {
  const f = fixture(); const detected = vi.fn(); const invalidated = vi.fn(); const session = new App.NFXNDEFReaderSession({ readerSessionDidInvalidateWithError: invalidated, readerSessionDidDetectTags: detected }, null, true); session.begin(); f.active[0]!.resolve(f.active[0]!.native); await ticks(); flush(); f.active[0]!.events.tags([f.tag]); flush(); const tag = detected.mock.calls[0]![1][0] as N.NFXNDEFTag; session.connect(tag, () => {}); await ticks(); flush(); const read = vi.fn(); tag.readNDEF(read); await ticks(); flush(); await ticks(); flush(); expect(read).toHaveBeenCalledWith(expect.any(N.NFXNDEFMessage), null); expect(invalidated).toHaveBeenCalledWith(session, expect.objectContaining({ code: "readerSessionInvalidationErrorFirstNDEFTagRead" })); expect(session.isReady).toBe(false);
});
