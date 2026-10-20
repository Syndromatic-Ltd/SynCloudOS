/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
  PasteboardAdapter,
  PasteboardRepresentation,
  RuntimeLayoutViewportSnapshot,
  RuntimeMediaQuery,
  RuntimeScreenSnapshot,
  RuntimeSnapshotSource,
  RuntimeVisualViewportSnapshot,
  RuntimeWorkAreaSnapshot,
  RuntimeTestCapabilityControl,
  RuntimeTestCapabilityControls,
  SynCloudOSRuntimeEnvironment,
} from "../../SynCloudOS";
import type {
  SynWareFakeAnimationOperation,
  SynWareFakeAudioOperation,
  SynWareFakeBrowserOperation,
  SynWareFakeCall,
  SynWareFakeClipboard,
  SynWareFakeClipboardOperation,
  SynWareFakeControl,
  SynWareFakeCredentialOperation,
  SynWareFakeDocumentOperation,
  SynWareFakeDragOperation,
  SynWareFakeFileOperation,
  SynWareFakeImageOperation,
  SynWareFakeLocation,
  SynWareFakeLocationOperation,
  SynWareFakeMIDI,
  SynWareFakeMIDIOperation,
  SynWareFakeMediaOperation,
  SynWareFakeMode,
  SynWareFakeNavigationOperation,
  SynWareFakeOverlayOperation,
  SynWareFakePanelOperation,
  SynWareFakePermissionOperation,
  SynWareFakePolicyOperation,
  SynWareFakePort,
  SynWareFakeRecoveryOperation,
  SynWareFakeServiceOperation,
  SynWareFakeStorage,
  SynWareFakeStorageOperation,
  SynWareFakeTextOperation,
  SynWareFakeViewportOperation,
  SynWareFakeWebContentOperation,
  SynWareFakeWindowOperation,
  SynWareFakeWorkspaceOperation,
  SynWareTestAdapters,
  SynWareTestClock,
  SynWareTestMediaClock,
} from "./testHostTypes";
import { LFXCoordinate, LFXLocation } from "../../../FX/LocationFX/public";
import type { LFXAuthorizationStatus } from "../../../FX/LocationFX/public";
import type { LFXLocationAdapter } from "../../HostServices/AppSDKHostServiceTypes";
import { createFakeVideoCapture } from "./fakeVideoCapture";
import type {
  MIDIAdapter,
  MIDIAdapterAuthorizationRequest,
  MIDIAdapterAuthorizationState,
} from "../../HostServices/AppSDKHostServiceTypes";

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

function requiredTime(value: string | number | Date | undefined): number {
  if (value === undefined) return Date.UTC(2026, 0, 1);
  const time = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : value;
  if (!Number.isFinite(time)) throw new TypeError("A fake clock requires a valid date or finite timestamp.");
  return time;
}

interface TimerEntry {
  readonly id: number;
  readonly due: number;
  readonly callback: () => void;
  cancelled: boolean;
}

export interface DeterministicScheduler extends SynWareTestClock {
  setTimeout(callback: () => void, milliseconds: number): number;
  clearTimeout(handle: unknown): void;
  requestAnimationFrame(callback: (timestamp: number) => void): number;
  cancelAnimationFrame(handle: unknown): void;
  activeTimerIds(): readonly number[];
  dispose(): void;
}

export function createDeterministicScheduler(initial?: string | number | Date): DeterministicScheduler {
  let current = requiredTime(initial);
  let sequence = 0;
  let disposed = false;
  const timers = new Map<number, TimerEntry>();
  const drainDue = () => {
    let executed = 0;
    while (true) {
      const next = [...timers.values()]
        .filter((timer) => !timer.cancelled && timer.due <= current)
        .sort((left, right) => left.due - right.due || left.id - right.id)[0];
      if (!next) return executed;
      timers.delete(next.id);
      if (!next.cancelled) {
        executed += 1;
        next.callback();
      }
      if (executed > 10_000) throw new Error("The deterministic scheduler exceeded its bounded callback drain.");
    }
  };
  const setTimeout = (callback: () => void, milliseconds: number) => {
    if (disposed) throw abortError("The deterministic scheduler is disposed.");
    if (!Number.isFinite(milliseconds)) throw new TypeError("Fake timer delays must be finite.");
    const id = ++sequence;
    timers.set(id, { id, due: current + Math.max(0, milliseconds), callback, cancelled: false });
    return id;
  };
  const clearTimeout = (handle: unknown) => {
    if (typeof handle !== "number") return;
    const timer = timers.get(handle);
    if (timer) timer.cancelled = true;
    timers.delete(handle);
  };
  return Object.freeze({
    now: () => current,
    set(value: string | number | Date) {
      current = requiredTime(value);
      drainDue();
      return current;
    },
    advance(milliseconds: number) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new TypeError("Fake-clock advances must be finite non-negative durations.");
      current += milliseconds;
      drainDue();
      return current;
    },
    runAll() {
      let runs = 0;
      while (timers.size > 0) {
        const next = [...timers.values()].filter((timer) => !timer.cancelled).sort((left, right) => left.due - right.due || left.id - right.id)[0];
        if (!next) break;
        current = next.due;
        runs += drainDue();
        if (runs > 10_000) throw new Error("The deterministic scheduler exceeded its bounded callback drain.");
      }
      return runs;
    },
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback: (timestamp: number) => void) {
      return setTimeout(() => callback(current), 16);
    },
    cancelAnimationFrame: clearTimeout,
    activeTimerIds: () => Object.freeze([...timers.keys()]),
    dispose() {
      disposed = true;
      timers.clear();
    },
  });
}

interface InternalFakeControl<TOperation extends string> extends SynWareFakeControl<TOperation> {
  run<T>(operation: TOperation, signal: AbortSignal | undefined, action: () => T | Promise<T>): Promise<T>;
  runSync<T>(operation: TOperation, action: () => T): T;
}

function runtimeGate<TOperation extends string>(base: InternalFakeControl<TOperation>): RuntimeTestCapabilityControl {
  return Object.freeze({
    run<T>(operation: string, signal: AbortSignal | undefined, action: () => T | Promise<T>) {
      return base.run(operation as TOperation, signal, action);
    },
    runSync<T>(operation: string, action: () => T) {
      return base.runSync(operation as TOperation, action);
    },
  });
}

function publicPort<TOperation extends string>(base: InternalFakeControl<TOperation>): SynWareFakePort<TOperation> {
  return Object.freeze({
    get mode() { return base.mode; },
    allow: base.allow,
    deny: base.deny,
    fail: base.fail,
    interrupt: base.interrupt,
    calls: base.calls,
    reset: base.reset,
    run(operation: TOperation, signal?: AbortSignal) {
      return base.run(operation, signal, () => undefined);
    },
  } satisfies SynWareFakePort<TOperation>);
}

interface FakeControlOptions {
  readonly initialMode?: SynWareFakeMode;
  readonly denialReason?: string;
}

function control<TOperation extends string>(clock: SynWareTestClock, options: FakeControlOptions = {}): InternalFakeControl<TOperation> {
  const initialMode = options.initialMode ?? "allow";
  const initialReason = options.denialReason ?? "The fake adapter denied this operation.";
  let mode: SynWareFakeMode = initialMode;
  let reason = initialReason;
  let failure = new Error("The fake adapter failed this operation.");
  const history: SynWareFakeCall<TOperation>[] = [];
  const assertAllowed = (signal: AbortSignal | undefined) => {
    if (signal?.aborted) throw abortError("The fake adapter received an aborted operation.");
    if (mode === "deny") throw new DOMException(reason, "SecurityError");
    if (mode === "fail") throw failure;
    if (mode === "interrupt") throw abortError(reason);
  };
  return Object.freeze({
    get mode() { return mode; },
    allow() { mode = "allow"; reason = initialReason; },
    deny(nextReason = "The fake adapter denied this operation.") { mode = "deny"; reason = nextReason; },
    fail(error = new Error("The fake adapter failed this operation.")) { mode = "fail"; failure = error; },
    interrupt(nextReason = "The fake adapter interrupted this operation.") { mode = "interrupt"; reason = nextReason; },
    calls: () => Object.freeze(history.map((entry) => Object.freeze({ ...entry }))),
    reset() {
      mode = initialMode;
      reason = initialReason;
      failure = new Error("The fake adapter failed this operation.");
      history.splice(0);
    },
    async run<T>(operation: TOperation, signal: AbortSignal | undefined, action: () => T | Promise<T>): Promise<T> {
      history.push(Object.freeze({ operation, at: clock.now() }));
      assertAllowed(signal);
      return await action();
    },
    runSync<T>(operation: TOperation, action: () => T): T {
      history.push(Object.freeze({ operation, at: clock.now() }));
      assertAllowed(undefined);
      return action();
    },
  });
}

export interface CreateFakeCapabilityPortOptions {
  readonly initialMode?: SynWareFakeMode;
  readonly denialReason?: string;
}

/** Creates a typed, host-only control port. It deliberately has no route to
 * a runtime, manager, browser global, or privileged production adapter. */
export function createFakeCapabilityPort<TOperation extends string>(
  clock: SynWareTestClock,
  options: CreateFakeCapabilityPortOptions = {},
): SynWareFakePort<TOperation> {
  return publicPort(control<TOperation>(clock, options));
}

export interface FakeClipboardAdapter {
  readonly adapter: PasteboardAdapter;
  readonly control: SynWareFakeClipboard;
  readonly gate: RuntimeTestCapabilityControl;
}

export function createFakeClipboardAdapter(clock: SynWareTestClock): FakeClipboardAdapter {
  const values: PasteboardRepresentation[] = [];
  const base = control<SynWareFakeClipboardOperation>(clock, {
    initialMode: "deny",
    denialReason: "Fake clipboard requests require an explicit test allow().",
  });
  let adapter!: PasteboardAdapter;
  const clipboard = Object.freeze({
    get mode() { return base.mode; },
    allow: base.allow,
    deny: base.deny,
    fail: base.fail,
    interrupt: base.interrupt,
    calls: base.calls,
    reset() {
      values.splice(0);
      base.reset();
    },
    read(types: readonly string[], signal?: AbortSignal) {
      return adapter.read(types, signal);
    },
    async write(next: readonly PasteboardRepresentation[], signal?: AbortSignal) {
      await adapter.write(next, signal);
    },
    values: () => Object.freeze(values.map((value) => Object.freeze({ type: value.type }))),
  } satisfies SynWareFakeClipboard);
  adapter = Object.freeze({
    read(types: readonly string[], signal?: AbortSignal) {
      return base.run("clipboard.read", signal, () => Object.freeze(values.filter((value) => types.includes(value.type))));
    },
    write(next: readonly PasteboardRepresentation[], signal?: AbortSignal) {
      return base.run("clipboard.write", signal, () => {
        values.splice(0, values.length, ...next);
      });
    },
  } satisfies PasteboardAdapter);
  return Object.freeze({ adapter, control: clipboard, gate: runtimeGate(base) });
}

export interface FakeStorageAdapter {
  readonly storage: Storage;
  readonly control: SynWareFakeStorage;
  readonly gate: RuntimeTestCapabilityControl;
}

export function createFakeStorageAdapter(clock: SynWareTestClock, label: "local" | "session"): FakeStorageAdapter {
  const values = new Map<string, string>();
  const base = control<SynWareFakeStorageOperation>(clock, {
    initialMode: "deny",
    denialReason: `Fake ${label} storage requests require an explicit test allow().`,
  });
  const read = (key: string, signal?: AbortSignal) => base.run("storage.read", signal, () => values.get(key) ?? null);
  const write = (key: string, value: string, signal?: AbortSignal) => base.run("storage.write", signal, () => {
    values.set(key, String(value));
  });
  const remove = (key: string, signal?: AbortSignal) => base.run("storage.remove", signal, () => {
    values.delete(key);
  });
  const clear = (signal?: AbortSignal) => base.run("storage.clear", signal, () => {
    values.clear();
  });
  const fake = Object.freeze({
    get mode() { return base.mode; },
    allow: base.allow,
    deny: base.deny,
    fail: base.fail,
    interrupt: base.interrupt,
    calls: base.calls,
    reset() {
      values.clear();
      base.reset();
    },
    read,
    write,
    remove,
    clear,
    entries: () => Object.freeze([...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => Object.freeze({ key, value }))),
  } satisfies SynWareFakeStorage);
  const storage = Object.freeze({
    get length() { return values.size; },
    clear() { return base.runSync("storage.clear", () => values.clear()); },
    getItem(key: string) { return base.runSync("storage.read", () => values.get(key) ?? null); },
    key(index: number) { return base.runSync("storage.read", () => [...values.keys()][index] ?? null); },
    removeItem(key: string) { return base.runSync("storage.remove", () => values.delete(key)); },
    setItem(key: string, value: string) { return base.runSync("storage.write", () => values.set(key, String(value))); },
  } satisfies Storage);
  return Object.freeze({ storage, control: fake, gate: runtimeGate(base) });
}

function snapshotSource<T>(initial: T): RuntimeSnapshotSource<T> & { set(value: T): void } {
  let snapshot = initial;
  const listeners = new Set<(value: T) => void>();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(value: T) {
      if (Object.is(snapshot, value)) return;
      snapshot = value;
      for (const listener of listeners) listener(snapshot);
    },
  });
}

function gatedSnapshotSource<T>(
  source: RuntimeSnapshotSource<T>,
  gate: RuntimeTestCapabilityControl,
  operation: string,
): RuntimeSnapshotSource<T> {
  return Object.freeze({
    getSnapshot: () => gate.runSync(operation, () => source.getSnapshot()),
    subscribe(listener: (value: T) => void) {
      return gate.runSync(operation, () => source.subscribe(listener));
    },
  });
}

export interface DeterministicRuntimeEnvironment {
  readonly environment: SynCloudOSRuntimeEnvironment;
  readonly clock: DeterministicScheduler;
  readonly mediaClock: SynWareTestMediaClock;
  readonly mediaQueries: Readonly<{
    setMatches(query: string, matches: boolean): void;
  }>;
  readonly clipboard: FakeClipboardAdapter;
  readonly adapters: SynWareTestAdapters;
  /** The production runtime reads window persistence during construction.
   * This closure-only bootstrap window is reset before the test receives a host. */
  prepareRuntimeBootstrap(): () => void;
  active(): readonly string[];
  dispose(): void;
}

/** Builds a browser-shaped but entirely host-owned environment. Sensitive I/O
 * begins denied; every category has an explicit, isolated control port. */
export function createDeterministicRuntimeEnvironment(options: {
  readonly now?: string | number | Date;
  readonly locale?: string;
  readonly timeZone?: string;
  readonly document?: Document | null;
} = {}): DeterministicRuntimeEnvironment {
  const clock = createDeterministicScheduler(options.now);
  let mediaSeconds = 0;
  let mediaDisposed = false;
  const mediaClock: SynWareTestMediaClock = Object.freeze({
    nowSeconds() {
      if (mediaDisposed) throw abortError("The deterministic media clock is disposed.");
      return mediaSeconds;
    },
    advanceSeconds(seconds: number) {
      if (mediaDisposed) throw abortError("The deterministic media clock is disposed.");
      if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError("Media-clock advances must be finite non-negative durations.");
      mediaSeconds += seconds;
      return mediaSeconds;
    },
  });
  const clipboard = createFakeClipboardAdapter(clock);
  const localStorage = createFakeStorageAdapter(clock, "local");
  const sessionStorage = createFakeStorageAdapter(clock, "session");
  const denied = { initialMode: "deny" as const, denialReason: "This sensitive fake capability requires an explicit test allow()." };
  const videoCapture = createFakeVideoCapture(clock.now);
  const locationControl = control<SynWareFakeLocationOperation>(clock, denied);
  let locationStatus: LFXAuthorizationStatus = "unknown";
  const defaultLocation = () => new LFXLocation({
    coordinate: new LFXCoordinate(0, 0),
    observedAtUnixMilliseconds: clock.now(),
    receivedAtMonotonicSeconds: mediaClock.nowSeconds(),
    horizontalAccuracyMetres: 1,
    altitudeMetres: null,
    altitudeAccuracyMetres: null,
    speedMetresPerSecond: null,
    courseRadians: null,
  });
  let locationFix = defaultLocation();
  let locationWatchSequence = 0;
  const locationWatchers = new Map<number, (location: LFXLocation) => void>();
  const location: SynWareFakeLocation = Object.freeze({
    get mode() { return locationControl.mode; },
    allow: locationControl.allow,
    deny: locationControl.deny,
    fail: locationControl.fail,
    interrupt: locationControl.interrupt,
    calls: locationControl.calls,
    reset() {
      locationControl.reset();
      locationStatus = "unknown";
      locationFix = defaultLocation();
      locationWatchers.clear();
    },
    setAuthorizationStatus(status: LFXAuthorizationStatus) { locationStatus = status; },
    setLocation(next: LFXLocation) { locationFix = next; },
    emitLocation(next: LFXLocation) {
      locationFix = next;
      for (const listener of [...locationWatchers.values()]) listener(next);
    },
  });
  const locationAdapter: LFXLocationAdapter = Object.freeze({
    nowMonotonicSeconds: mediaClock.nowSeconds,
    getAuthorizationStatus(signal?: AbortSignal) {
      return locationControl.run("location.status", signal, () => locationStatus);
    },
    current({ signal }: Parameters<LFXLocationAdapter["current"]>[0]) {
      return locationControl.run("location.current", signal, () => locationFix);
    },
    watch(
      options: Parameters<LFXLocationAdapter["watch"]>[0],
      listener: Parameters<LFXLocationAdapter["watch"]>[1],
    ) {
      options.signal.throwIfAborted();
      return locationControl.runSync("location.watch", () => {
        const id = ++locationWatchSequence;
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          options.signal.removeEventListener("abort", dispose);
          locationWatchers.delete(id);
        };
        locationWatchers.set(id, listener);
        options.signal.addEventListener("abort", dispose, { once: true });
        return Object.freeze({ dispose });
      });
    },
  });
  const midiControl = control<SynWareFakeMIDIOperation>(clock, denied);
  let midiAvailable = true;
  let midiAuthorization: MIDIAdapterAuthorizationState = "granted";
  let midiSysExAuthorization: MIDIAdapterAuthorizationState = "granted";
  const midi: SynWareFakeMIDI = Object.freeze({
    get mode() { return midiControl.mode; },
    allow: midiControl.allow,
    deny: midiControl.deny,
    fail: midiControl.fail,
    interrupt: midiControl.interrupt,
    calls: midiControl.calls,
    reset() {
      midiControl.reset();
      midiAvailable = true;
      midiAuthorization = "granted";
      midiSysExAuthorization = "granted";
    },
    setAvailable(available: boolean) { midiAvailable = available; },
    setAuthorizationResult(state: MIDIAdapterAuthorizationState) { midiAuthorization = state; },
    setSysExAuthorizationResult(state: MIDIAdapterAuthorizationState) { midiSysExAuthorization = state; },
  });
  const midiAdapter: MIDIAdapter = Object.freeze({
    isAvailable: () => midiAvailable,
    requestAuthorization({ sysex, signal }: MIDIAdapterAuthorizationRequest): Promise<MIDIAdapterAuthorizationState> {
      if (!midiAvailable) return Promise.resolve("unavailable");
      return midiControl.run(
        sysex ? "midi.authorize-sysex" : "midi.authorize",
        signal,
        () => sysex ? midiSysExAuthorization : midiAuthorization,
      );
    },
    getEndpoints: () => Object.freeze([]),
    subscribeEndpoints: () => () => undefined,
    async subscribeInput(...[_endpoint, _sysex, _listener, signal]: Parameters<MIDIAdapter["subscribeInput"]>) {
      signal.throwIfAborted();
      throw new DOMException("The deterministic MIDI fixture has no input endpoint.", "NotFoundError");
    },
    async acquireOutput(...[_endpoint, _sysex, signal]: Parameters<MIDIAdapter["acquireOutput"]>) {
      signal.throwIfAborted();
      throw new DOMException("The deterministic MIDI fixture has no output endpoint.", "NotFoundError");
    },
    dispose() {},
  });
  const controls = Object.freeze({
    browser: control<SynWareFakeBrowserOperation>(clock),
    media: control<SynWareFakeMediaOperation>(clock),
    viewport: control<SynWareFakeViewportOperation>(clock),
    navigation: control<SynWareFakeNavigationOperation>(clock, denied),
    drag: control<SynWareFakeDragOperation>(clock, denied),
    credentials: control<SynWareFakeCredentialOperation>(clock, denied),
    files: control<SynWareFakeFileOperation>(clock, denied),
    documents: control<SynWareFakeDocumentOperation>(clock, denied),
    recovery: control<SynWareFakeRecoveryOperation>(clock, denied),
    windows: control<SynWareFakeWindowOperation>(clock),
    panels: control<SynWareFakePanelOperation>(clock),
    overlays: control<SynWareFakeOverlayOperation>(clock),
    workspace: control<SynWareFakeWorkspaceOperation>(clock),
    services: control<SynWareFakeServiceOperation>(clock, denied),
    permissions: control<SynWareFakePermissionOperation>(clock, denied),
    policy: control<SynWareFakePolicyOperation>(clock, denied),
    image: control<SynWareFakeImageOperation>(clock, denied),
    text: control<SynWareFakeTextOperation>(clock),
    animation: control<SynWareFakeAnimationOperation>(clock),
    audio: control<SynWareFakeAudioOperation>(clock, denied),
    webContent: control<SynWareFakeWebContentOperation>(clock, denied),
  });
  const adapters: SynWareTestAdapters = Object.freeze({
    browser: publicPort(controls.browser),
    media: publicPort(controls.media),
    viewport: publicPort(controls.viewport),
    navigation: publicPort(controls.navigation),
    storage: Object.freeze({ local: localStorage.control, session: sessionStorage.control }),
    clipboard: clipboard.control,
    drag: publicPort(controls.drag),
    credentials: publicPort(controls.credentials),
    files: publicPort(controls.files),
    documents: publicPort(controls.documents),
    recovery: publicPort(controls.recovery),
    windows: publicPort(controls.windows),
    panels: publicPort(controls.panels),
    overlays: publicPort(controls.overlays),
    workspace: publicPort(controls.workspace),
    services: publicPort(controls.services),
    permissions: publicPort(controls.permissions),
    policy: publicPort(controls.policy),
    image: publicPort(controls.image),
    text: publicPort(controls.text),
    animation: publicPort(controls.animation),
    audio: publicPort(controls.audio),
    location,
    midi,
    video: videoCapture.control,
    webContent: publicPort(controls.webContent),
  });
  const testControls: RuntimeTestCapabilityControls = Object.freeze({
    browser: runtimeGate(controls.browser),
    media: runtimeGate(controls.media),
    viewport: runtimeGate(controls.viewport),
    navigation: runtimeGate(controls.navigation),
    storage: localStorage.gate,
    clipboard: clipboard.gate,
    drag: runtimeGate(controls.drag),
    credentials: runtimeGate(controls.credentials),
    files: runtimeGate(controls.files),
    documents: runtimeGate(controls.documents),
    recovery: runtimeGate(controls.recovery),
    windows: runtimeGate(controls.windows),
    panels: runtimeGate(controls.panels),
    overlays: runtimeGate(controls.overlays),
    workspace: runtimeGate(controls.workspace),
    services: runtimeGate(controls.services),
    permissions: runtimeGate(controls.permissions),
    policy: runtimeGate(controls.policy),
    image: runtimeGate(controls.image),
    text: runtimeGate(controls.text),
    animation: runtimeGate(controls.animation),
    audio: runtimeGate(controls.audio),
    webContent: runtimeGate(controls.webContent),
  });
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const layoutViewport = snapshotSource<RuntimeLayoutViewportSnapshot>(Object.freeze({ width: 1440, height: 900 }));
  const visualViewport = snapshotSource<RuntimeVisualViewportSnapshot | null>(Object.freeze({ width: 1440, height: 900, offsetLeft: 0, offsetTop: 0, scale: 1 }));
  const screen = snapshotSource<RuntimeScreenSnapshot>(Object.freeze({
    width: 1440, height: 900, availableLeft: 0, availableTop: 0, availableWidth: 1440, availableHeight: 900,
    colourDepth: 24, pixelDepth: 24, orientation: "landscape-primary" as const,
  }));
  const workArea = snapshotSource<RuntimeWorkAreaSnapshot>(Object.freeze({
    x: 0, y: 0, width: 1440, height: 900, devicePixelRatio: 1,
    safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
  }));
  const mediaQueries = new Map<RuntimeMediaQuery, Set<(matches: boolean) => void>>();
  const mediaQueryMatches = new Map<string, boolean>();
  const mediaQueryControl = Object.freeze({
    setMatches(query: string, matches: boolean) {
      if (mediaDisposed) throw abortError("The deterministic media queries are disposed.");
      if ((mediaQueryMatches.get(query) ?? false) === matches) return;
      mediaQueryMatches.set(query, matches);
      for (const [media, subscribers] of [...mediaQueries]) {
        if (media.media !== query) continue;
        for (const listener of [...subscribers]) listener(matches);
      }
    },
  });
  const browser = Object.freeze({
    getLocation() {
      return controls.browser.runSync("browser.location", () => {
        const location = options.document?.location ?? null;
        return location
          ? Object.freeze({ href: location.href, origin: location.origin, pathname: location.pathname, search: location.search, hash: location.hash })
          : Object.freeze({ href: "http://syncloudos.test/", origin: "http://syncloudos.test", pathname: "/", search: "", hash: "" });
      });
    },
    getWindow: () => controls.browser.runSync("browser.window", () => options.document?.defaultView ?? null),
    getDocument: () => controls.browser.runSync("browser.document", () => options.document ?? null),
    getNavigator: () => controls.browser.runSync("browser.navigator", () => options.document?.defaultView?.navigator ?? null),
  });
  let routeSyncDepth = 0;
  const routeSynchronization = Object.freeze({
    isSyncInProgress: () => routeSyncDepth > 0,
    syncRoute(href: string, syncOptions: { replace?: boolean; dispatchPopState?: boolean; state?: unknown } = {}) {
      const host = browser.getWindow();
      const location = browser.getLocation();
      if (!host) {
        return Object.freeze({ requestedHref: href, browserHref: href, pathname: href, changed: false, replaced: false, dispatchedPopState: false });
      }
      const target = new URL(href, location.origin);
      const browserHref = `${target.pathname}${target.search}${target.hash}`;
      const currentHref = `${location.pathname}${location.search}${location.hash}`;
      const replace = syncOptions.replace ?? false;
      const dispatchPopState = syncOptions.dispatchPopState ?? true;
      if (target.origin !== location.origin || currentHref === browserHref) {
        return Object.freeze({ requestedHref: href, browserHref, pathname: target.pathname, changed: false, replaced: false, dispatchedPopState: false });
      }
      routeSyncDepth += 1;
      try {
        if (replace) host.history.replaceState(syncOptions.state ?? {}, "", browserHref);
        else host.history.pushState(syncOptions.state ?? {}, "", browserHref);
        if (dispatchPopState) {
          const event = new host.PopStateEvent("popstate", { state: syncOptions.state ?? null });
          for (const listener of listeners.get("popstate") ?? []) listener(event);
        }
      } finally {
        routeSyncDepth -= 1;
      }
      return Object.freeze({ requestedHref: href, browserHref, pathname: target.pathname, changed: true, replaced: replace, dispatchedPopState: dispatchPopState });
    },
  });
  const environment = Object.freeze({
    navigation: null,
    testControls,
    browser,
    routeSynchronization,
    localStorage: localStorage.storage,
    sessionStorage: sessionStorage.storage,
    platform: "unknown" as const,
    layoutViewport: gatedSnapshotSource(layoutViewport, testControls.viewport, "viewport.layout"),
    visualViewport: gatedSnapshotSource(visualViewport, testControls.viewport, "viewport.visual"),
    screen: gatedSnapshotSource(screen, testControls.viewport, "viewport.screen"),
    workArea: gatedSnapshotSource(workArea, testControls.viewport, "viewport.work-area"),
    clipboard: clipboard.adapter,
    location: locationAdapter,
    midi: midiAdapter,
    videoCapture: videoCapture.host,
    monotonicNowSeconds: mediaClock.nowSeconds,
    now: clock.now,
    randomUUID: (() => {
      let sequence = 0;
      return () => `synapp-test-${++sequence}`;
    })(),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    requestAnimationFrame: clock.requestAnimationFrame,
    cancelAnimationFrame: clock.cancelAnimationFrame,
    matchMedia(query: string) {
      return controls.media.runSync("media.match", () => {
        const queryListeners = new Set<(matches: boolean) => void>();
        const match = Object.freeze({
          media: query,
          get matches() { return mediaQueryMatches.get(query) ?? false; },
          subscribe(listener: (matches: boolean) => void) {
            return controls.media.runSync("media.subscribe", () => {
              queryListeners.add(listener);
              return () => queryListeners.delete(listener);
            });
          },
          dispose() { queryListeners.clear(); mediaQueries.delete(match); },
        } satisfies RuntimeMediaQuery);
        mediaQueries.set(match, queryListeners);
        return match;
      });
    },
    addWindowListener<K extends keyof WindowEventMap>(
      type: K,
      listener: (event: WindowEventMap[K]) => void,
      _options?: AddEventListenerOptions | boolean,
    ) {
      return controls.browser.runSync("browser.window", () => {
        const bucket = listeners.get(type) ?? new Set<(event: Event) => void>();
        const forwarded = (event: Event) => listener(event as WindowEventMap[K]);
        bucket.add(forwarded);
        listeners.set(type, bucket);
        return () => { bucket.delete(forwarded); };
      });
    },
  } satisfies SynCloudOSRuntimeEnvironment);
  return Object.freeze({
    environment,
    clock,
    mediaClock,
    mediaQueries: mediaQueryControl,
    clipboard,
    adapters,
    prepareRuntimeBootstrap() {
      localStorage.control.allow();
      sessionStorage.control.allow();
      return () => {
        localStorage.control.reset();
        sessionStorage.control.reset();
        for (const control of Object.values(controls)) control.reset();
        location.reset();
        midi.reset();
        videoCapture.control.reset();
        clipboard.control.reset();
      };
    },
    active() {
      const windowListeners = [...listeners.entries()].flatMap(([type, bucket]) => bucket.size > 0 ? [`listener:${type}:${bucket.size}`] : []);
      return Object.freeze([...clock.activeTimerIds().map((id) => `timer:${id}`), ...windowListeners]);
    },
    dispose() {
      mediaDisposed = true;
      clock.dispose();
      for (const media of mediaQueries.keys()) media.dispose();
      mediaQueryMatches.clear();
      listeners.clear();
    },
  });
}
