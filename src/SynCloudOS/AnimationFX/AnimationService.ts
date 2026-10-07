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

import type {
  AFXAnimationDefinition,
  AFXAnimationHandle,
  AFXAnimationKeyPath,
  AFXAnimationScalar,
  AFXAnimationSettlement,
  AFXAnimationTiming,
  AFXPropertyAnimation,
} from "../../FX/AnimationFX/animationTypes";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type {
  RuntimeAnimationAdapterLease,
  RuntimeAnimationOwner,
  RuntimeAnimationOwnerLease,
  RuntimeAnimationPlayback,
  RuntimeAnimationRequest,
  RuntimeAnimationService,
} from "./animationTypes";

const MAX_ANIMATIONS_PER_GROUP = 64;
const MAX_TEXT_VALUE_BYTES = 16_384;
const encoder = new TextEncoder();

type ActiveEntry = {
  readonly id: string;
  readonly owner: RuntimeAnimationOwner;
  readonly ownerEpoch: number;
  readonly collisionKeys: readonly string[];
  playback: RuntimeAnimationPlayback | null;
  pendingAdapterSettlement: "completed" | "cancelled" | null;
  readonly reduced: boolean;
  state: "running" | "paused" | AFXAnimationSettlement["state"];
  settle(state: AFXAnimationSettlement["state"], reason?: string): void;
  readonly handle: AFXAnimationHandle;
};

type OwnerLeaseRecord = {
  readonly owner: RuntimeAnimationOwner;
  readonly key: string;
  readonly epoch: number;
  lease: RuntimeAnimationOwnerLease;
  active: boolean;
  reason: string;
  latestGeneration: number;
};

function ownDataRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain data record.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor))
      throw new TypeError(`${label}.${key} may not be an accessor.`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new TypeError(`${label} may not contain symbols.`);
  return Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [
      key,
      descriptor.value,
    ]),
  );
}

function finite(
  value: unknown,
  label: string,
  min = -Number.MAX_VALUE,
  max = Number.MAX_VALUE,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new RangeError(`${label} is outside its supported bounds.`);
  return value;
}

function text(value: unknown, label: string, maximumBytes = 512) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    encoder.encode(value).byteLength > maximumBytes
  )
    throw new TypeError(`${label} is not a bounded string.`);
  return value;
}

const keyPaths = new Set<AFXAnimationKeyPath>([
  "frame",
  "transform",
  "opacity",
  "backgroundColour",
  "boxShadow",
  "filter",
  "height",
  "scrollPosition",
]);
function scalar(value: unknown, label: string): AFXAnimationScalar {
  if (typeof value === "number") return finite(value, label);
  if (typeof value === "string") {
    if (encoder.encode(value).byteLength > MAX_TEXT_VALUE_BYTES)
      throw new RangeError(`${label} is too large.`);
    return value;
  }
  const record = ownDataRecord(value, label);
  if (Object.keys(record).length > 8)
    throw new RangeError(`${label} has too many fields.`);
  const copy: Record<string, number | string> = {};
  for (const [key, item] of Object.entries(record)) {
    text(key, `${label} key`, 64);
    if (typeof item === "number") copy[key] = finite(item, `${label}.${key}`);
    else if (typeof item === "string" && encoder.encode(item).byteLength <= 512)
      copy[key] = item;
    else
      throw new TypeError(
        `${label}.${key} must be a finite number or bounded string.`,
      );
  }
  return Object.freeze(copy);
}

function scalarForKeyPath(
  keyPath: AFXAnimationKeyPath,
  value: unknown,
  label: string,
): AFXAnimationScalar {
  const result = scalar(value, label);
  if (keyPath === "opacity") {
    if (typeof result !== "number" || result < 0 || result > 1)
      throw new RangeError(`${label} must be an opacity from zero to one.`);
    return result;
  }
  if (["transform", "backgroundColour", "boxShadow", "filter", "height"].includes(keyPath)) {
    if (typeof result !== "string" || result.length === 0)
      throw new TypeError(`${label} must be a bounded CSS value string.`);
    return result;
  }
  if (typeof result !== "object")
    throw new TypeError(`${label} must be a geometry data record.`);
  const keys = Object.keys(result);
  const expected =
    keyPath === "frame" ? ["height", "width", "x", "y"] : ["x", "y"];
  if (
    keys.slice().sort().join("\u0000") !== expected.join("\u0000") ||
    Object.values(result).some((item) => typeof item !== "number")
  ) {
    throw new TypeError(`${label} has an invalid ${keyPath} geometry.`);
  }
  const geometry = result as Readonly<Record<string, number>>;
  if (keyPath === "frame" && (geometry.width! < 0 || geometry.height! < 0))
    throw new RangeError(`${label} has negative dimensions.`);
  return result;
}

function timing(value: unknown): AFXAnimationTiming {
  if (value === undefined) return "ease";
  if (
    ["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(
      value as string,
    )
  )
    return value as AFXAnimationTiming;
  const record = ownDataRecord(value, "animation timing");
  if (record.kind === "cubic-bezier")
    return Object.freeze({
      kind: "cubic-bezier" as const,
      x1: finite(record.x1, "timing.x1", 0, 1),
      y1: finite(record.y1, "timing.y1"),
      x2: finite(record.x2, "timing.x2", 0, 1),
      y2: finite(record.y2, "timing.y2"),
    });
  if (record.kind === "spring")
    return Object.freeze({
      kind: "spring" as const,
      stiffness: finite(record.stiffness, "timing.stiffness", 0.01, 10_000),
      damping: finite(record.damping, "timing.damping", 0.01, 10_000),
      mass: finite(record.mass, "timing.mass", 0.01, 100),
    });
  throw new TypeError("Animation timing is unsupported.");
}

function denseArray(
  value: unknown,
  maximum = MAX_ANIMATIONS_PER_GROUP,
): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum
  ) {
    throw new TypeError("Animation entries must be a bounded plain array.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor))
      throw new TypeError("Animation entries must be dense data slots.");
  }
  const allowed = new Set([
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    "length",
  ]);
  if (
    Reflect.ownKeys(descriptors).some(
      (key) => typeof key === "symbol" || !allowed.has(key),
    )
  )
    throw new TypeError("Animation arrays may not contain expandos.");
  return Array.from(
    { length: value.length },
    (_, index) => descriptors[String(index)]!.value,
  );
}

function normaliseDefinition(
  target: object,
  input: AFXAnimationDefinition,
): {
  request: RuntimeAnimationRequest;
  reducedPolicy: AFXAnimationDefinition["reducedMotion"];
} {
  const definition = ownDataRecord(input, "animation definition");
  const entries = denseArray(definition.animations);
  if (entries.length === 0)
    throw new RangeError("An animation group must contain at least one entry.");
  const animations = entries.map((entry, index): AFXPropertyAnimation => {
    const record = ownDataRecord(entry, `animations[${index}]`);
    const keyPath = text(
      record.keyPath,
      `animations[${index}].keyPath`,
      64,
    ) as AFXAnimationKeyPath;
    if (!keyPaths.has(keyPath))
      throw new TypeError(`Animation key path ${keyPath} is unsupported.`);
    const frames =
      record.keyframes === undefined
        ? undefined
        : denseArray(record.keyframes, 1000).map((frame) => {
            const data = ownDataRecord(frame, "animation keyframe");
            return Object.freeze({
              offset: finite(data.offset, "keyframe offset", 0, 1),
              value: scalarForKeyPath(keyPath, data.value, "keyframe value"),
            });
          });
    if (
      frames &&
      (frames.length < 2 ||
        frames[0].offset !== 0 ||
        frames.at(-1)!.offset !== 1 ||
        frames.some(
          (frame, index) =>
            index > 0 && frame.offset <= frames[index - 1].offset,
        ))
    )
      throw new RangeError(
        "Keyframe offsets must strictly increase from zero to one.",
      );
    return Object.freeze({
      targetId: text(record.targetId, `animations[${index}].targetId`),
      keyPath,
      from: scalarForKeyPath(keyPath, record.from, `animations[${index}].from`),
      to: scalarForKeyPath(keyPath, record.to, `animations[${index}].to`),
      ...(frames ? { keyframes: Object.freeze(frames) } : {}),
    });
  });
  const fill = definition.fill ?? "forwards";
  if (!["none", "forwards", "backwards", "both"].includes(fill as string))
    throw new TypeError("Animation fill mode is unsupported.");
  const reducedPolicy = definition.reducedMotion ?? "system";
  if (!["system", "always", "never"].includes(reducedPolicy as string))
    throw new TypeError("Reduced-motion policy is unsupported.");
  if (
    definition.autoreverses !== undefined &&
    typeof definition.autoreverses !== "boolean"
  )
    throw new TypeError("Animation autoreverses must be boolean.");
  return {
    request: Object.freeze({
      target,
      animations: Object.freeze(animations),
      duration: finite(definition.duration, "animation duration", 0, 600),
      delay: finite(definition.delay ?? 0, "animation delay", 0, 60),
      iterations: finite(
        definition.iterations ?? 1,
        "animation iterations",
        0.00001,
        1_000,
      ),
      autoreverses: definition.autoreverses === true,
      fill,
      timing: timing(definition.timing),
    }) as RuntimeAnimationRequest,
    reducedPolicy: reducedPolicy as AFXAnimationDefinition["reducedMotion"],
  };
}

export function createRuntimeAnimationService(input: {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly signal: AbortSignal;
  readonly adapterLease?: RuntimeAnimationAdapterLease | null;
  readonly randomUUID: () => string;
  readonly prefersReducedMotion: () => boolean;
}): RuntimeAnimationService {
  const active = new Map<string, ActiveEntry>();
  const collisionIndex = new Map<string, string>();
  const ownerLeaseRecords = new WeakMap<object, OwnerLeaseRecord>();
  const currentOwnerLeases = new Map<string, OwnerLeaseRecord>();
  const lease = input.adapterLease ?? null;
  let disposed = false;
  let groupCount = 0;
  let settlementCount = 0;
  let ownerEpoch = 0;

  const settleById = (
    id: string,
    state: AFXAnimationSettlement["state"],
    reason?: string,
  ) => active.get(id)?.settle(state, reason);
  const disposeEntry = (entry: ActiveEntry) => {
    for (const key of entry.collisionKeys)
      if (collisionIndex.get(key) === entry.id) collisionIndex.delete(key);
    active.delete(entry.id);
    try {
      entry.playback?.dispose();
    } catch {
      /* ownership is released even if an adapter disposer fails */
    }
  };
  const revokeOwnerLease = (record: OwnerLeaseRecord, reason: string) => {
    if (!record.active) return;
    record.active = false;
    record.reason = reason;
    if (currentOwnerLeases.get(record.key) === record)
      currentOwnerLeases.delete(record.key);
    for (const entry of [...active.values()])
      if (entry.ownerEpoch === record.epoch) entry.settle("cancelled", reason);
  };
  const settledHandle = (
    state: AFXAnimationSettlement["state"],
    reason: string,
  ): AFXAnimationHandle => {
    const id = `${input.runtimeId}:animation:${input.randomUUID()}`;
    settlementCount += 1;
    return Object.freeze({
      id,
      progress: 0,
      state,
      finished: Promise.resolve(
        Object.freeze({ state, reduced: false, reason }),
      ),
      cancel() {},
      pause() {},
      resume() {},
      seek(seconds: number) {
        finite(seconds, "seek time", 0, 600_000);
      },
    });
  };

  const service: RuntimeAnimationService = {
    runtimeId: input.runtimeId,
    acquireOwner(ownerInput) {
      if (disposed || input.signal.aborted)
        throw new DOMException("Animation runtime is disposed.", "AbortError");
      const ownerRecord = ownDataRecord(ownerInput, "animation owner");
      const owner = Object.freeze({
        appId: text(ownerRecord.appId, "owner.appId"),
        viewId: text(ownerRecord.viewId, "owner.viewId"),
        windowControllerId:
          ownerRecord.windowControllerId === undefined
            ? undefined
            : text(ownerRecord.windowControllerId, "owner.windowControllerId"),
      });
      const key = `${owner.appId}\u0000${owner.windowControllerId ?? ""}\u0000${owner.viewId}`;
      const previous = currentOwnerLeases.get(key);
      if (previous)
        revokeOwnerLease(previous, "animation owner lease superseded");
      ownerEpoch += 1;
      let record!: OwnerLeaseRecord;
      const ownerLease = Object.freeze({
        ...owner,
        epoch: ownerEpoch,
        release(reason = "animation owner released") {
          revokeOwnerLease(
            record,
            text(reason, "animation owner release reason"),
          );
        },
      }) as RuntimeAnimationOwnerLease;
      record = {
        owner,
        key,
        epoch: ownerEpoch,
        lease: ownerLease,
        active: true,
        reason: "animation owner released",
        latestGeneration: -1,
      };
      ownerLeaseRecords.set(ownerLease, record);
      currentOwnerLeases.set(key, record);
      return ownerLease;
    },
    animate(target, definition, owner, generation) {
      return this.runGroup(target, definition, owner, generation);
    },
    runGroup(target, definition, ownerLease, generationInput = 0) {
      if (disposed || input.signal.aborted)
        throw new DOMException("Animation runtime is disposed.", "AbortError");
      const ownerLeaseRecord =
        ownerLease && typeof ownerLease === "object"
          ? ownerLeaseRecords.get(ownerLease)
          : undefined;
      if (!ownerLeaseRecord)
        throw new TypeError("Animation requires a runtime-issued owner lease.");
      if (
        !ownerLeaseRecord.active ||
        currentOwnerLeases.get(ownerLeaseRecord.key) !== ownerLeaseRecord
      ) {
        return settledHandle("cancelled", ownerLeaseRecord.reason);
      }
      const generation = finite(
        generationInput,
        "owner generation",
        0,
        Number.MAX_SAFE_INTEGER,
      );
      if (!target || typeof target !== "object")
        throw new TypeError(
          "Animation target must be an object owned by the host adapter.",
        );
      const owner = ownerLeaseRecord.owner;
      const { request, reducedPolicy } = normaliseDefinition(
        target,
        definition,
      );
      const previousGeneration = ownerLeaseRecord.latestGeneration;
      if (generation < previousGeneration)
        return settledHandle("interrupted", "stale animation generation");
      ownerLeaseRecord.latestGeneration = Math.max(
        previousGeneration,
        generation,
      );
      const collisionKeys = request.animations.map(
        ({ targetId, keyPath }) =>
          `${owner.appId}\u0000${owner.windowControllerId ?? ""}\u0000${owner.viewId}\u0000${targetId}\u0000${keyPath}`,
      );
      for (const key of collisionKeys) {
        const previous = collisionIndex.get(key);
        if (previous)
          settleById(
            previous,
            "interrupted",
            "superseded by a newer animation generation",
          );
      }
      const id = `${input.runtimeId}:animation:${input.randomUUID()}`;
      const reduced =
        reducedPolicy === "always" ||
        (reducedPolicy === "system" && input.prefersReducedMotion());
      let resolveFinished!: (settlement: AFXAnimationSettlement) => void;
      const finished = new Promise<AFXAnimationSettlement>((resolve) => {
        resolveFinished = resolve;
      });
      let playback: RuntimeAnimationPlayback | null = null;
      const entry = {} as ActiveEntry;
      const handle: AFXAnimationHandle = {
        id,
        finished,
        get progress() {
          return entry.state === "completed" ? 1 : (playback?.progress() ?? 0);
        },
        get state() {
          return entry.state;
        },
        cancel: (reason = "animation cancelled") =>
          entry.settle("cancelled", reason),
        seek(seconds: number) {
          finite(
            seconds,
            "seek time",
            0,
            request.delay +
              request.duration *
                request.iterations *
                (request.autoreverses ? 2 : 1),
          );
          if (entry.state !== "running" && entry.state !== "paused") return;
          try {
            playback?.seek(seconds);
          } catch {
            entry.settle("failed", "animation adapter seek failed");
          }
        },
        pause() {
          if (entry.state !== "running") return;
          entry.state = "paused";
          try {
            if (playback?.pause() === false)
              entry.settle("failed", "animation adapter pause failed");
          } catch {
            entry.settle("failed", "animation adapter pause failed");
          }
        },
        resume() {
          if (entry.state !== "paused") return;
          entry.state = "running";
          if (entry.pendingAdapterSettlement) {
            const pending = entry.pendingAdapterSettlement;
            entry.pendingAdapterSettlement = null;
            entry.settle(
              pending === "completed" ? "completed" : "cancelled",
              pending === "cancelled" ? "adapter cancelled" : undefined,
            );
            return;
          }
          try {
            if (playback?.play() === false)
              entry.settle("failed", "animation adapter resume failed");
          } catch {
            entry.settle("failed", "animation adapter resume failed");
          }
        },
      };
      Object.assign(entry, {
        id,
        owner,
        ownerEpoch: ownerLeaseRecord.epoch,
        collisionKeys: Object.freeze(collisionKeys),
        reduced,
        handle,
        playback: null,
        pendingAdapterSettlement: null,
        state: "running" as const,
        settle(state: AFXAnimationSettlement["state"], reason?: string) {
          if (entry.state !== "running" && entry.state !== "paused") return;
          entry.state = state;
          settlementCount += 1;
          if (state !== "completed") {
            try {
              playback?.cancel();
            } catch {
              /* settlement authority remains with the runtime */
            }
          }
          disposeEntry(entry);
          resolveFinished(
            Object.freeze({ state, reduced, ...(reason ? { reason } : {}) }),
          );
        },
      });
      active.set(id, entry);
      for (const key of collisionKeys) collisionIndex.set(key, id);
      groupCount += 1;
      if (reduced || request.duration === 0) {
        try {
          lease?.adapter.applyFinal?.(request);
          entry.settle("completed");
        } catch {
          entry.settle("failed", "animation final state could not be applied");
        }
        return handle;
      }
      if (!lease) {
        entry.settle("failed", "animation adapter unavailable");
        return handle;
      }
      try {
        playback = lease.adapter.animate(request);
        entry.playback = playback;
        playback.finished.then(
          (state) => {
            if (entry.state === "paused")
              entry.pendingAdapterSettlement = state;
            else
              entry.settle(
                state === "completed" ? "completed" : "cancelled",
                state === "cancelled" ? "adapter cancelled" : undefined,
              );
          },
          () => entry.settle("failed", "animation adapter failed"),
        );
      } catch {
        entry.settle("failed", "animation adapter failed to start");
      }
      return handle;
    },
    suspendOwner(appId) {
      for (const entry of active.values())
        if (entry.owner.appId === appId) entry.handle.pause();
    },
    resumeOwner(appId) {
      for (const entry of active.values())
        if (entry.owner.appId === appId) entry.handle.resume();
    },
    closeOwner(appId, reason = "animation owner closed") {
      for (const record of currentOwnerLeases.values())
        if (record.owner.appId === appId) revokeOwnerLease(record, reason);
    },
    closeWindowController(
      windowControllerId,
      reason = "animation window closed",
    ) {
      for (const record of currentOwnerLeases.values())
        if (record.owner.windowControllerId === windowControllerId)
          revokeOwnerLease(record, reason);
    },
    cancelView(appId, viewId, reason = "animation view released") {
      for (const record of currentOwnerLeases.values())
        if (record.owner.appId === appId && record.owner.viewId === viewId)
          revokeOwnerLease(record, reason);
    },
    diagnostics() {
      const adapter = lease?.adapter.diagnostics() ?? {
        activeCount: 0,
        listenerCount: 0,
        timerCount: 0,
      };
      return Object.freeze({
        activeCount: active.size,
        pausedCount: [...active.values()].filter(
          ({ state }) => state === "paused",
        ).length,
        groupCount,
        settlementCount,
        listenerCount: adapter.listenerCount,
        timerCount: adapter.timerCount,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      input.signal.removeEventListener("abort", onRuntimeAbort);
      for (const entry of [...active.values()])
        entry.settle("cancelled", "runtime disposed");
      for (const record of currentOwnerLeases.values())
        revokeOwnerLease(record, "runtime disposed");
      currentOwnerLeases.clear();
      lease?.adapter.dispose();
      lease?.release();
    },
  };
  const onRuntimeAbort = () => service.dispose();
  input.signal.addEventListener("abort", onRuntimeAbort, { once: true });
  if (input.signal.aborted) service.dispose();
  return service;
}
