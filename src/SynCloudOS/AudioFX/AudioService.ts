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

import { normaliseAudioLevel } from "../Settings/settingsService";
import type { RuntimeAudioMixerSnapshot } from "./audioTypes";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeCache, RuntimeCacheRegistry } from "../Cache/cacheTypes";
import { AudioActivationRequiredError, AudioUnavailableError } from "./AudioErrors";
import type {
  RuntimeAudioActivationToken,
  RuntimeAudioAdapterActivationClaim,
  RuntimeAudioAdapterLease,
  RuntimeAudioHandle,
  RuntimeAudioLoadRequest,
  RuntimeAudioPlayback,
  RuntimeAudioResource,
  RuntimeAudioService,
  RuntimeAudioState,
} from "./audioTypes";

const MAX_SOURCE_BYTES = 4_096;
const MAX_ID_BYTES = 512;
const DEFAULT_CACHE_LIMIT = 8;
const encoder = new TextEncoder();

type CacheEntry = {
  readonly key: string;
  readonly source: string;
  readonly controller: AbortController;
  readonly promise: Promise<RuntimeAudioResource>;
  resource: RuntimeAudioResource | null;
  reservations: number;
  references: number;
  lastUsed: number;
  cacheResident: boolean;
  readonly removeRuntimeAbort: () => void;
};

type OwnerRecord = {
  readonly key: string;
  readonly appId: string;
  readonly ownerId: string;
  readonly windowControllerId?: string;
  generation: number;
  epoch: number;
  suspended: boolean;
  closed: boolean;
};

type HandleRecord = {
  readonly id: string;
  readonly owner: OwnerRecord;
  readonly ownerEpoch: number;
  readonly generation: number;
  readonly source: string;
  readonly cache: CacheEntry;
  readonly playback: RuntimeAudioPlayback;
  facade: RuntimeAudioHandle;
  state: RuntimeAudioState;
  loop: boolean;
  volume: number;
  rate: number;
  playEpoch: number;
  playingIntent: boolean;
  readonly blockers: Set<"lifecycle" | "settings" | "sensory">;
  released: boolean;
};

type ActivationRecord = {
  readonly handleId: string;
  readonly ownerKey: string;
  readonly sequence: number;
  readonly claim: RuntimeAudioAdapterActivationClaim;
  used: boolean;
};

function abortError(message: string) {
  return new DOMException(message, "AbortError");
}

function ownDataRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain data record.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${label} may not contain symbols.`);
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor)) throw new TypeError(`${label}.${key} may not be an accessor.`);
    result[key] = descriptor.value;
  }
  return result;
}

function boundedText(value: unknown, label: string, maximum = MAX_ID_BYTES) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || encoder.encode(value).byteLength > maximum) {
    throw new TypeError(`${label} must be a bounded non-empty string.`);
  }
  return value;
}

function normaliseRequest(value: RuntimeAudioLoadRequest) {
  const request = ownDataRecord(value, "sound request");
  const source = boundedText(request.source, "sound source", MAX_SOURCE_BYTES);
  const protocol = /^[a-z][a-z0-9+.-]*:/i.exec(source)?.[0].toLowerCase();
  if (protocol === "data:" || protocol === "blob:" || protocol === "javascript:") {
    throw new AudioUnavailableError("Sound sources must use an owned application or authorised network resource.");
  }
  if (/[\u0000-\u001f\u007f]/.test(source)) throw new TypeError("Sound source contains control characters.");
  const generation = request.generation === undefined ? 0 : request.generation;
  if (!Number.isSafeInteger(generation) || (generation as number) < 0) throw new RangeError("Sound owner generation is invalid.");
  if (request.loop !== undefined && typeof request.loop !== "boolean") throw new TypeError("Sound loop must be boolean.");
  const volume = request.volume === undefined ? 1 : request.volume;
  if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError("Sound volume must be between zero and one.");
  }
  return Object.freeze({
    appId: boundedText(request.appId, "sound appId"),
    ownerId: boundedText(request.ownerId, "sound ownerId"),
    windowControllerId: request.windowControllerId === undefined
      ? undefined
      : boundedText(request.windowControllerId, "sound windowControllerId"),
    generation: generation as number,
    source,
    loop: request.loop === true,
    volume,
  });
}

function raceSignal<T>(promise: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) return Promise.reject(signal.reason ?? abortError("Sound operation aborted."));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => finish(() => reject(signal.reason ?? abortError("Sound operation aborted.")));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    if (signal.aborted) abort();
  });
}

function ownerKey(appId: string, ownerId: string, windowControllerId?: string) {
  return `${appId}\0${windowControllerId ?? ""}\0${ownerId}`;
}

export function createRuntimeAudioService(input: {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly signal: AbortSignal;
  readonly adapterLease?: RuntimeAudioAdapterLease | null;
  readonly randomUUID: () => string;
  readonly soundEnabled: boolean;
  readonly masterVolume?: number;
  readonly appVolumes?: Readonly<Record<string, number>>;
  readonly persistMixer?: (masterVolume: number, appVolumes: Readonly<Record<string, number>>) => void;
  readonly reducedSensory?: boolean;
  readonly caches: RuntimeCacheRegistry;
  readonly maxCachedResources?: number;
}): RuntimeAudioService {
  const adapterLease = input.adapterLease ?? null;
  const adapter = adapterLease?.adapter ?? null;
  const maxCachedResources = input.maxCachedResources ?? DEFAULT_CACHE_LIMIT;
  if (!Number.isSafeInteger(maxCachedResources) || maxCachedResources < 1 || maxCachedResources > 128) {
    throw new RangeError("Sound cache limit is invalid.");
  }
  const owners = new Map<string, OwnerRecord>();
  const suspendedApps = new Set<string>();
  const closedApps = new Set<string>();
  const closedWindows = new Set<string>();
  const handles = new Map<string, HandleRecord>();
  const cache = new Map<string, CacheEntry>();
  const activations = new WeakMap<object, ActivationRecord>();
  const liveActivations = new Set<ActivationRecord>();
  const ownerActivations = new Map<string, ActivationRecord>();
  let activationSequence = 0;
  let handleSequence = 0;
  let activationCount = 0;
  let cacheClock = 0;
  let enabled = input.soundEnabled;
  let reducedSensory = input.reducedSensory === true;
  let disposed = false;
  let masterVolume = normaliseAudioLevel(input.masterVolume);
  let appVolumes = Object.freeze(Object.fromEntries(Object.entries(input.appVolumes ?? {}).map(([id, level]) => [id, normaliseAudioLevel(level)])));
  const mixerListeners = new Set<() => void>();
  let mixerSnapshot: RuntimeAudioMixerSnapshot;
  const appVolume = (appId: string) => Object.hasOwn(appVolumes, appId) ? appVolumes[appId] : 1;
  const publishMixer = () => {
    const counts = new Map<string, number>();
    for (const record of handles.values()) counts.set(record.owner.appId, (counts.get(record.owner.appId) ?? 0) + 1);
    mixerSnapshot = Object.freeze({ masterVolume, enabled, applications: Object.freeze([...counts].map(([appId, sessionCount]) => Object.freeze({ appId, sessionCount, volume: appVolume(appId) }))) });
    for (const listener of mixerListeners) listener();
  };
  const effectiveVolume = (record: HandleRecord, requested = record.volume) => requested * appVolume(record.owner.appId) * masterVolume;
  publishMixer();

  const current = (record: HandleRecord) => !disposed && !record.released && handles.get(record.id) === record &&
    record.owner.epoch === record.ownerEpoch && !record.owner.closed;

  const invalidateActivation = (activation: ActivationRecord) => {
    if (activation.used) return;
    activation.used = true;
    liveActivations.delete(activation);
    if (ownerActivations.get(activation.ownerKey) === activation) ownerActivations.delete(activation.ownerKey);
    activationCount = Math.max(0, activationCount - 1);
  };

  let decodedCache!: RuntimeCache<string, CacheEntry>;
  const releaseCacheEntry = (entry: CacheEntry, fromCache = false) => {
    if (cache.get(entry.key) === entry) cache.delete(entry.key);
    if (entry.cacheResident && !fromCache) {
      entry.cacheResident = false;
      decodedCache.delete(entry.key);
    }
    entry.controller.abort(abortError("Sound cache entry released."));
    entry.removeRuntimeAbort();
    if (entry.resource) {
      try { adapter?.releaseResource(entry.resource); } catch { /* teardown remains deterministic */ }
      entry.resource = null;
    }
  };

  decodedCache = input.caches.create("runtime.sounds.decoded", {
    resourceKind: "decoded-audio",
    maxEntries: maxCachedResources,
    maxWeight: maxCachedResources * 16 * 1024 * 1024,
    weightOf: (entry) => entry.resource?.byteLength ?? 0,
    onEvict(entry) {
      if (!entry.cacheResident) return;
      entry.cacheResident = false;
      if (entry.references === 0 && entry.reservations === 0) releaseCacheEntry(entry, true);
    },
  });

  const trimCache = () => {
    const idle = [...cache.values()].filter((entry) => entry.references === 0 && entry.reservations === 0 && entry.resource);
    idle.sort((a, b) => a.lastUsed - b.lastUsed);
    while (cache.size > maxCachedResources && idle.length > 0) releaseCacheEntry(idle.shift()!);
  };

  const releaseUnreservedEntry = (entry: CacheEntry) => {
    // A non-cooperative adapter can still resolve after every caller has left.
    // Revoke ownership now; getCacheEntry's guarded completion releases that
    // late resource instead of publishing it into this runtime's cache.
    if (entry.references === 0 && entry.reservations === 0 && (!entry.resource || !entry.cacheResident)) {
      releaseCacheEntry(entry);
    }
  };

  const releaseRecord = (record: HandleRecord) => {
    if (record.released) return false;
    record.released = true;
    record.playEpoch += 1;
    record.state = "released";
    record.playingIntent = false;
    for (const activation of [...liveActivations]) if (activation.handleId === record.id) {
      invalidateActivation(activation);
    }
    handles.delete(record.id);
    publishMixer();
    try { record.playback.dispose(); } catch { /* owner release is terminal */ }
    record.cache.references = Math.max(0, record.cache.references - 1);
    record.cache.lastUsed = ++cacheClock;
    if (!record.cache.cacheResident && record.cache.references === 0 && record.cache.reservations === 0) releaseCacheEntry(record.cache);
    else trimCache();
    return true;
  };

  const invalidateOwnerGeneration = (owner: OwnerRecord, nextGeneration: number) => {
    if (nextGeneration <= owner.generation) return;
    owner.generation = nextGeneration;
    owner.epoch += 1;
    for (const record of [...handles.values()]) if (record.owner === owner) releaseRecord(record);
  };

  const closeOwnerRecord = (owner: OwnerRecord) => {
    owner.closed = true;
    owner.epoch += 1;
    for (const record of [...handles.values()]) if (record.owner === owner) releaseRecord(record);
    owners.delete(owner.key);
  };

  const getCacheEntry = (source: string) => {
    const existing = cache.get(source);
    if (existing) {
      if (existing.cacheResident) decodedCache.get(source);
      return existing;
    }
    if (!adapter) throw new AudioUnavailableError("This runtime has no sound environment adapter.");
    const controller = new AbortController();
    const abortFromRuntime = () => controller.abort(input.signal.reason ?? abortError("Sound runtime disposed."));
    const removeRuntimeAbort = () => input.signal.removeEventListener("abort", abortFromRuntime);
    input.signal.addEventListener("abort", abortFromRuntime, { once: true });
    let entry!: CacheEntry;
    let load: Promise<RuntimeAudioResource>;
    try { load = adapter.loadResource(source, controller.signal); }
    catch (error) { removeRuntimeAbort(); throw error; }
    const promise = load.then((resource) => {
      removeRuntimeAbort();
      if (disposed || controller.signal.aborted || cache.get(source) !== entry) {
        try { adapter.releaseResource(resource); } catch { /* stale result owns no state */ }
        throw controller.signal.reason ?? abortError("Sound resource load became stale.");
      }
      entry.resource = resource;
      entry.lastUsed = ++cacheClock;
      entry.cacheResident = true;
      entry.cacheResident = decodedCache.set(source, entry);
      return resource;
    }, (error) => {
      removeRuntimeAbort();
      if (cache.get(source) === entry) cache.delete(source);
      throw error;
    });
    entry = { key: source, source, controller, promise, resource: null, reservations: 0, references: 0,
      lastUsed: ++cacheClock, cacheResident: false, removeRuntimeAbort };
    cache.set(source, entry);
    return entry;
  };

  const createFacade = (record: HandleRecord): RuntimeAudioHandle => Object.freeze({
    get id() { return record.id; },
    get appId() { return record.owner.appId; },
    get ownerId() { return record.owner.ownerId; },
    get windowControllerId() { return record.owner.windowControllerId; },
    get generation() { return record.generation; },
    get source() { return record.source; },
    get state() { return record.state; },
    get loop() { return record.loop; },
    get volume() { return record.volume; },
    get rate() { return record.rate; },
    get duration() { return current(record) ? record.playback.duration() : null; },
    get currentTime() { return current(record) ? record.playback.currentTime() : 0; },
  });

  const start = (record: HandleRecord, internal: boolean, claim: RuntimeAudioAdapterActivationClaim | null = null): Promise<void> => {
    if (!current(record)) return Promise.reject(abortError("Sound handle is no longer active."));
    if (reducedSensory) return Promise.reject(new AudioUnavailableError("Sound playback is denied by the reduced-sensory preference."));
    if (record.blockers.size > 0) return Promise.reject(new AudioUnavailableError("Sound playback is currently blocked."));
    const epoch = ++record.playEpoch;
    record.playingIntent = true;
    let result: Promise<void>;
    try {
      // Deliberately no await precedes this call. Browsers consume transient
      // user activation synchronously when HTMLMediaElement.play is invoked.
      result = record.playback.play(claim, epoch);
    } catch (error) {
      record.state = "error";
      record.playingIntent = false;
      if (!internal && (error as { name?: unknown })?.name === "NotAllowedError") {
        return Promise.reject(new AudioActivationRequiredError());
      }
      return Promise.reject(error);
    }
    record.state = "playing";
    return Promise.resolve(result).then(() => {
      if (!current(record) || record.playEpoch !== epoch) return;
      record.state = "playing";
    }, (error) => {
      if (current(record) && record.playEpoch === epoch) { record.state = "error"; record.playingIntent = false; }
      if (!internal && (error as { name?: unknown })?.name === "NotAllowedError") {
        throw new AudioActivationRequiredError();
      }
      throw error;
    });
  };

  const resumeInternally = (record: HandleRecord) => {
    void start(record, true).catch(() => { /* lifecycle/settings callbacks never leak rejection */ });
  };

  const addBlocker = (record: HandleRecord, blocker: "lifecycle" | "settings" | "sensory") => {
    if (record.blockers.has(blocker)) return;
    record.blockers.add(blocker);
    if (record.state !== "playing") return;
    record.playEpoch += 1;
    try { record.playback.pause(); record.state = "paused"; }
    catch { record.state = "error"; record.playingIntent = false; }
  };

  const removeBlocker = (record: HandleRecord, blocker: "lifecycle" | "settings" | "sensory") => {
    if (!record.blockers.delete(blocker) || record.blockers.size > 0 || !record.playingIntent || record.state === "playing") return;
    resumeInternally(record);
  };

  let service!: RuntimeAudioService;
  const abortService = () => service.dispose();
  service = {
    runtimeId: input.runtimeId,
    getMixerSnapshot: () => mixerSnapshot,
    getOwnerPolicy: (appId) => Object.freeze({ volume: appVolume(appId), muted: !enabled || disposed, paused: disposed || !enabled || reducedSensory || suspendedApps.has(appId) || closedApps.has(appId) }),
    subscribeMixer(listener) {
      if (disposed) return () => undefined;
      mixerListeners.add(listener);
      return () => { mixerListeners.delete(listener); };
    },
    setMasterVolume(volume) {
      if (disposed) return;
      service.setMixerLevels(volume, appVolumes);
      input.persistMixer?.(masterVolume, appVolumes);
    },
    setAppVolume(appId, volume) {
      if (disposed) return;
      boundedText(appId, "mixer appId");
      service.setMixerLevels(masterVolume, { ...appVolumes, [appId]: volume });
      input.persistMixer?.(masterVolume, appVolumes);
    },
    setMixerLevels(master, levels) {
      if (disposed) return;
      const nextMaster = normaliseAudioLevel(master);
      const nextLevels = Object.freeze(Object.fromEntries(Object.entries(levels).map(([id, level]) => [id, normaliseAudioLevel(level)])));
      if (nextMaster === masterVolume && JSON.stringify(nextLevels) === JSON.stringify(appVolumes)) return;
      masterVolume = nextMaster;
      appVolumes = nextLevels;
      for (const record of handles.values()) record.playback.setVolume(effectiveVolume(record));
      publishMixer();
    },
    async load(value, signal) {
      if (disposed || input.signal.aborted) throw input.signal.reason ?? abortError("Sound runtime disposed.");
      signal?.throwIfAborted();
      const request = normaliseRequest(value);
      if (closedApps.has(request.appId) || (request.windowControllerId && closedWindows.has(request.windowControllerId))) {
        throw abortError("Sound owner authority is closed.");
      }
       const key = ownerKey(request.appId, request.ownerId, request.windowControllerId);
      let owner = owners.get(key);
      if (!owner) {
        owner = { key, appId: request.appId, ownerId: request.ownerId, windowControllerId: request.windowControllerId,
          generation: request.generation, epoch: 1, suspended: suspendedApps.has(request.appId), closed: false };
        owners.set(key, owner);
      } else {
        if (owner.windowControllerId !== request.windowControllerId) throw new TypeError("A sound owner cannot change window authority.");
        if (owner.closed) throw abortError("Sound owner is closed.");
        if (request.generation < owner.generation) throw abortError("Sound owner generation is stale.");
        invalidateOwnerGeneration(owner, request.generation);
      }
      const ownerEpoch = owner.epoch;
      const entry = getCacheEntry(request.source);
      entry.reservations += 1;
      let resource: RuntimeAudioResource;
      let resourceAcquired = false;
      try {
        // The entry controller is aborted for runtime disposal and when the
        // final pending reservation leaves, even if the adapter ignores it.
        resource = await raceSignal(raceSignal(entry.promise, entry.controller.signal), signal);
        resourceAcquired = true;
      } finally {
        entry.reservations = Math.max(0, entry.reservations - 1);
        if (!resourceAcquired) releaseUnreservedEntry(entry);
      }
      if (disposed || input.signal.aborted || signal?.aborted || owners.get(key) !== owner || owner.closed || owner.epoch !== ownerEpoch) {
        releaseUnreservedEntry(entry);
        trimCache();
        throw signal?.reason ?? input.signal.reason ?? abortError("Sound load became stale.");
      }
      let playback: RuntimeAudioPlayback | null = null;
      const id = `sound:${input.randomUUID()}:${++handleSequence}`;
      let record!: HandleRecord;
      try {
        playback = adapter!.createPlayback(resource, Object.freeze({
          onEnded(playEpoch: number) {
            if (!record || !current(record) || record.playEpoch !== playEpoch || record.state !== "playing") return;
            if (!record.loop) { record.playEpoch += 1; record.state = "stopped"; record.playingIntent = false; }
          },
          onError(playEpoch: number) {
            if (!record || !current(record) || record.playEpoch !== playEpoch) return;
            record.playEpoch += 1; record.state = "error"; record.playingIntent = false;
          },
        }));
        record = {
          id, owner, ownerEpoch, generation: request.generation, source: request.source, cache: entry, playback,
          facade: null as unknown as RuntimeAudioHandle, state: "ready", loop: request.loop, volume: request.volume, rate: 1,
          playEpoch: 0, playingIntent: false,
          blockers: new Set([...(enabled ? [] : ["settings" as const]), ...(owner.suspended ? ["lifecycle" as const] : [])]),
          released: false,
        };
        record.facade = createFacade(record);
        playback.setLoop(record.loop);
        playback.setVolume(effectiveVolume(record));
        playback.setRate(record.rate);
        entry.references += 1;
        entry.lastUsed = ++cacheClock;
        handles.set(id, record);
        publishMixer();
        return record.facade;
      } catch (error) {
        try { playback?.dispose(); } catch { /* failed construction owns no state */ }
        releaseUnreservedEntry(entry);
        trimCache();
        throw error;
      }
    },
    activation(handleId) {
      boundedText(handleId, "sound handleId");
      const record = handles.get(handleId);
      if (!record || !current(record) || !enabled || record.owner.suspended) throw new AudioActivationRequiredError();
      const previous = ownerActivations.get(record.owner.key);
      if (previous) invalidateActivation(previous);
      const claim = adapter?.claimActivation(record.owner.key);
      if (!claim) throw new AudioActivationRequiredError();
      const token = Object.freeze({ handleId, sequence: ++activationSequence }) as RuntimeAudioActivationToken;
      const activation = { handleId, ownerKey: record.owner.key, sequence: activationSequence, claim, used: false };
      activations.set(token, activation); liveActivations.add(activation);
      ownerActivations.set(record.owner.key, activation);
      activationCount += 1;
      return token;
    },
    play(handleId, token) {
      boundedText(handleId, "sound handleId");
      if (!token || typeof token !== "object") return Promise.reject(new AudioActivationRequiredError());
      const activation = activations.get(token as object);
      if (!activation || activation.used || activation.handleId !== handleId) return Promise.reject(new AudioActivationRequiredError());
      invalidateActivation(activation);
      const record = handles.get(handleId);
      if (!record || !current(record)) return Promise.reject(abortError("Sound handle is no longer active."));
      return start(record, false, activation.claim);
    },
    resume(handleId, token) { return service.play(handleId, token); },
    pause(handleId) {
      const record = handles.get(handleId);
      if (!record || !current(record)) return false;
      record.playingIntent = false;
      record.playEpoch += 1;
      try { record.playback.pause(); } catch { record.state = "error"; return false; }
      record.state = "paused";
      return true;
    },
    stop(handleId) {
      const record = handles.get(handleId);
      if (!record || !current(record)) return false;
      record.playingIntent = false;
      record.playEpoch += 1;
      try { record.playback.stop(); } catch { record.state = "error"; return false; }
      record.state = "stopped";
      return true;
    },
    setLoop(handleId, loop) {
      if (typeof loop !== "boolean") throw new TypeError("Sound loop must be boolean.");
      const record = handles.get(handleId);
      if (!record || !current(record)) throw abortError("Sound handle is no longer active.");
      record.playback.setLoop(loop); record.loop = loop;
    },
    setVolume(handleId, volume) {
      if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || volume > 1) throw new RangeError("Sound volume is invalid.");
      const record = handles.get(handleId);
      if (!record || !current(record)) throw abortError("Sound handle is no longer active.");
      record.playback.setVolume(effectiveVolume(record, volume)); record.volume = volume;
    },
    setRate(handleId, rate) {
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0.25 || rate > 4) throw new RangeError("Sound playback rate is invalid.");
      const record = handles.get(handleId);
      if (!record || !current(record)) throw abortError("Sound handle is no longer active.");
      record.playback.setRate(rate); record.rate = rate;
    },
    setCurrentTime(handleId, time) {
      if (typeof time !== "number" || !Number.isFinite(time) || time < 0 || time > 86_400) throw new RangeError("Sound playback time is invalid.");
      const record = handles.get(handleId);
      if (!record || !current(record)) throw abortError("Sound handle is no longer active.");
      const duration = record.playback.duration();
      if (duration !== null && time > duration) throw new RangeError("Sound playback time exceeds its duration.");
      record.playback.setCurrentTime(time);
    },
    release(handleId) {
      const record = handles.get(handleId);
      return record ? releaseRecord(record) : false;
    },
    suspendOwner(appId) {
      suspendedApps.add(appId);
      publishMixer();
      for (const owner of owners.values()) if (owner.appId === appId && !owner.closed) {
        owner.suspended = true;
        for (const record of handles.values()) if (record.owner === owner) addBlocker(record, "lifecycle");
      }
    },
    resumeOwner(appId) {
      suspendedApps.delete(appId);
      closedApps.delete(appId);
      publishMixer();
      for (const owner of owners.values()) if (owner.appId === appId && !owner.closed) {
        owner.suspended = false;
        for (const record of handles.values()) if (record.owner === owner) removeBlocker(record, "lifecycle");
      }
    },
    closeOwner(appId) {
      suspendedApps.delete(appId);
      closedApps.add(appId);
      publishMixer();
      for (const owner of [...owners.values()]) if (owner.appId === appId) closeOwnerRecord(owner);
    },
    closeWindowController(windowControllerId) {
      closedWindows.add(windowControllerId);
      for (const owner of [...owners.values()]) if (owner.windowControllerId === windowControllerId) closeOwnerRecord(owner);
    },
    setEnabled(next) {
      if (typeof next !== "boolean") throw new TypeError("Sound enabled state must be boolean.");
      if (disposed || enabled === next) return;
      enabled = next;
      publishMixer();
      for (const record of handles.values()) {
        if (!next) addBlocker(record, "settings");
        else removeBlocker(record, "settings");
      }
    },
    setReducedSensory(next) {
      if (typeof next !== "boolean") throw new TypeError("Sound reduced-sensory state must be boolean.");
      if (disposed || reducedSensory === next) return;
      reducedSensory = next;
      publishMixer();
      for (const record of handles.values()) {
        if (next) addBlocker(record, "sensory");
        else removeBlocker(record, "sensory");
      }
    },
    diagnostics() {
      const adapterDiagnostics = adapter?.diagnostics() ?? { resourceCount: 0, objectURLCount: 0, playbackCount: 0, listenerCount: 0, activationCount: 0 };
      return Object.freeze({
        ...adapterDiagnostics,
        handleCount: handles.size,
        playingCount: [...handles.values()].filter((record) => record.state === "playing").length,
        pendingLoadCount: [...cache.values()].filter((entry) => !entry.resource).length,
        cacheEntryCount: cache.size,
        activationCount: Math.min(activationCount, adapterDiagnostics.activationCount),
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      input.signal.removeEventListener("abort", abortService);
      for (const owner of owners.values()) { owner.closed = true; owner.epoch += 1; }
      for (const record of [...handles.values()]) releaseRecord(record);
      for (const entry of [...cache.values()]) releaseCacheEntry(entry);
      input.caches.remove("runtime.sounds.decoded");
      mixerListeners.clear();
      owners.clear();
      suspendedApps.clear(); closedApps.clear(); closedWindows.clear();
      activationCount = 0;
      liveActivations.clear(); ownerActivations.clear();
      try { adapter?.dispose(); } finally { adapterLease?.release(); }
    },
  };

  if (input.signal.aborted) service.dispose();
  else input.signal.addEventListener("abort", abortService, { once: true });
  return service;
}

