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

import {
  replicationProjectiveHTML,
  replicationSVG,
} from "./BrowserAnimationReplication";
import { layerContentSVG, layerSVGColour } from "./BrowserAnimationLayerContent";
import { AFXTimingFunction } from "../../FX/AnimationFX/AFXTimingFunction";
import { afxStringsInterpolate, interpolateAFXValue } from "../../FX/AnimationFX/interpolation";
import { AFXTransform3D } from "../../FX/AnimationFX/AFXTransform3D";
import { AFXPresentationHistory } from "../../FX/AnimationFX/AFXPresentationHistory";
import { GFXColour } from "../../FX/GraphicsFX/GFXColour";
import type {
  AFXFrameScheduler,
  AFXLayerCompositorRequest,
  AFXLayerCompositorPlayback,
  AFXLayerSnapshot,
  AFXLayerSurface,
} from "../../FX/AnimationFX/AFXLayer";
import type {
  AFXAnimationTiming,
  AFXAnimationScalar,
} from "../../FX/AnimationFX/animationTypes";
import type {
  RuntimeAnimationAdapter,
  RuntimeAnimationAdapterDiagnostics,
  RuntimeAnimationAdapterFactory,
  RuntimeAnimationAdapterLease,
  RuntimeAnimationPlayback,
  RuntimeAnimationRequest,
} from "../HostServices/PlatformAdapterRuntimePorts";

export interface BrowserNativeAnimation {
  currentTime: number | null;
  readonly playState: string;
  play(): void;
  pause(): void;
  cancel(): void;
  addEventListener(type: "finish" | "cancel", listener: () => void): void;
  removeEventListener(type: "finish" | "cancel", listener: () => void): void;
}

export interface BrowserAnimationPlatform {
  animate(
    target: object,
    keyframes: readonly Readonly<Record<string, unknown>>[],
    options: Readonly<Record<string, unknown>>,
  ): BrowserNativeAnimation | null;
  isHidden?(target: object): boolean;
  applyFinal?(target: object, values: Readonly<Record<string, unknown>>): void;
  applyScrollPosition?(
    target: object,
    value: Readonly<{ x: number; y: number }>,
  ): void;
  now(): number;
  /** Whether native animations accept a `linear()` easing function. */
  readonly supportsLinearEasing?: boolean;
  schedule?(callback: () => void, delayMs: number): unknown;
  cancelScheduled?(handle: unknown): void;
  subscribeVisibility?(listener: () => void): () => void;
}

function cssTiming(timing: AFXAnimationTiming): string {
  if (typeof timing === "string") return timing;
  if (timing.kind === "cubic-bezier")
    return `cubic-bezier(${timing.x1}, ${timing.y1}, ${timing.x2}, ${timing.y2})`;
  // Physical spring values are carried by the compiled keyframes.
  return "linear";
}

type CompiledAnimation = Readonly<{
  keyframes: readonly Readonly<Record<string, unknown>>[];
  /** A spring carried as the native easing rather than sampled keyframes. */
  easing?: string;
  scroll: Readonly<{
    from: Readonly<{ x: number; y: number }>;
    to: Readonly<{ x: number; y: number }>;
  }> | null;
}>;

function point(
  value: unknown,
  label: string,
): Readonly<{ x: number; y: number }> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain point.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).some(
      (key) => typeof key === "symbol" || !["x", "y"].includes(key),
    )
  ) {
    throw new TypeError(`${label} contains unsupported fields.`);
  }
  const x = descriptors.x;
  const y = descriptors.y;
  if (
    !x ||
    !("value" in x) ||
    !y ||
    !("value" in y) ||
    typeof x.value !== "number" ||
    !Number.isFinite(x.value) ||
    typeof y.value !== "number" ||
    !Number.isFinite(y.value)
  ) {
    throw new TypeError(`${label} requires finite data properties x and y.`);
  }
  return Object.freeze({ x: x.value, y: y.value });
}

function terminalProgress(request: RuntimeAnimationRequest): number {
  const cycles = request.iterations * (request.autoreverses ? 2 : 1);
  const end = cycles % 1 || 1;
  const progress =
    request.autoreverses && Math.ceil(cycles) % 2 === 0 ? 1 - end : end;
  return typeof request.timing === "object" && request.timing.kind === "spring"
    ? progress
    : new AFXTimingFunction(request.timing).sample(progress, request.duration);
}
function terminalStyles(
  compiled: CompiledAnimation,
  request: RuntimeAnimationRequest,
): Readonly<Record<string, unknown>> {
  const progress = terminalProgress(request),
    frames = compiled.keyframes;
  let index = 0;
  while (
    index < frames.length - 2 &&
    progress > Number(frames[index + 1].offset)
  )
    index++;
  const start = Number(frames[index].offset),
    end = Number(frames[index + 1].offset);
  return Object.freeze(
    Object.fromEntries(
      Object.keys(frames[index])
        .filter((key) => key !== "offset")
        .map((key) => [
          key,
          interpolateAFXValue(
            frames[index][key] as AFXAnimationScalar,
            frames[index + 1][key] as AFXAnimationScalar,
            (progress - start) / (end - start),
          ),
        ]),
    ),
  );
}

function scrollSample(
  request: RuntimeAnimationRequest,
  compiled: CompiledAnimation,
  progress: number,
): Readonly<{ x: number; y: number }> {
  const entry = request.animations.find(
    (value) => value.keyPath === "scrollPosition",
  )!;
  const frames = entry.keyframes ?? [
    { offset: 0, value: compiled.scroll!.from },
    { offset: 1, value: compiled.scroll!.to },
  ];
  let index = 0;
  while (index < frames.length - 2 && progress > frames[index + 1].offset)
    index++;
  return point(
    interpolateAFXValue(
      frames[index].value,
      frames[index + 1].value,
      (progress - frames[index].offset) /
        (frames[index + 1].offset - frames[index].offset),
    ),
    "scroll sample",
  );
}
const SPRING_SAMPLES = 120;

/** A spring whose values the adapter cannot interpolate itself (CSS strings
 * of different shapes, such as a transform list and `none`) plays as the
 * browser's own interpolation eased by the sampled spring, instead of
 * switching discretely when the spring first reaches its target. */
function nativeSpring(request: RuntimeAnimationRequest, linearEasing: boolean): CompiledAnimation | null {
  if (!linearEasing || typeof request.timing !== "object" || request.timing.kind !== "spring") return null;
  if (request.animations.some((animation) => animation.keyframes || animation.keyPath === "scrollPosition" || animation.keyPath === "frame")) return null;
  if (!request.animations.some((animation) =>
    typeof animation.from === "string" && typeof animation.to === "string" && !afxStringsInterpolate(animation.from, animation.to))) return null;
  const timing = new AFXTimingFunction(request.timing);
  const samples = Array.from({ length: SPRING_SAMPLES + 1 }, (_, index) =>
    index === SPRING_SAMPLES ? 1 : Number(timing.sample(index / SPRING_SAMPLES, request.duration).toFixed(5)));
  const frame = (end: "from" | "to", offset: number) => Object.freeze(Object.fromEntries([
    ["offset", offset],
    ...request.animations.map((animation) => [animation.keyPath, animation[end]]),
  ]));
  return Object.freeze({
    keyframes: Object.freeze([frame("from", 0), frame("to", 1)]),
    easing: `linear(${samples.join(", ")})`,
    scroll: null,
  });
}

function keyframes(request: RuntimeAnimationRequest, linearEasing = false): CompiledAnimation {
  const native = nativeSpring(request, linearEasing);
  if (native) return native;
  const spring =
    typeof request.timing === "object" && request.timing.kind === "spring";
  const offsets = [
    ...new Set([
      0,
      1,
      ...request.animations.flatMap(
        (animation) => animation.keyframes?.map((frame) => frame.offset) ?? [],
      ),
      ...(spring ? Array.from({ length: 121 }, (_, i) => i / 120) : []),
    ]),
  ].sort((a, b) => a - b);
  const outputs = offsets.map(
    (offset) => ({ offset }) as Record<string, unknown>,
  );
  let scroll: CompiledAnimation["scroll"] = null;
  for (const animation of request.animations) {
    if (animation.keyPath === "scrollPosition") {
      if (scroll)
        throw new TypeError("Only one scroll-position entry is supported.");
      scroll = Object.freeze({
        from: point(animation.from, "scroll start"),
        to: point(animation.to, "scroll end"),
      });
      continue;
    }
    offsets.forEach((offset, index) => {
      const frames = animation.keyframes ?? [
        { offset: 0, value: animation.from },
        { offset: 1, value: animation.to },
      ];
      let segment = 0;
      while (segment < frames.length - 2 && offset > frames[segment + 1].offset)
        segment++;
      let local =
        (offset - frames[segment].offset) /
        (frames[segment + 1].offset - frames[segment].offset);
      if (spring)
        local = new AFXTimingFunction(request.timing).sample(
          local,
          request.duration,
        );
      const value = interpolateAFXValue(
        frames[segment].value,
        frames[segment + 1].value,
        local,
      );
      const output = outputs[index];
      if (animation.keyPath === "frame") {
        if (
          !value ||
          typeof value !== "object" ||
          !("width" in value) ||
          !("height" in value)
        )
          throw new TypeError("Frame requires geometry.");
        output.left = String(value.x) + "px";
        output.top = String(value.y) + "px";
        output.width = String(value.width) + "px";
        output.height = String(value.height) + "px";
      } else output[animation.keyPath] = value;
    });
  }
  return Object.freeze({
    keyframes: Object.freeze(outputs.map((output) => Object.freeze(output))),
    scroll,
  });
}

class BrowserAnimationAdapter implements RuntimeAnimationAdapter {
  readonly #platform: BrowserAnimationPlatform;
  readonly #signal: AbortSignal;
  readonly #active = new Set<RuntimeAnimationPlayback>();
  readonly #visibilityUpdates = new Map<RuntimeAnimationPlayback, () => void>();
  #releaseVisibility: (() => void) | null = null;
  #listenerCount = 0;
  #timerCount = 0;
  #disposed = false;

  constructor(platform: BrowserAnimationPlatform, signal: AbortSignal) {
    this.#platform = platform;
    this.#signal = signal;
  }

  animate(request: RuntimeAnimationRequest): RuntimeAnimationPlayback {
    if (this.#disposed || this.#signal.aborted)
      throw new DOMException(
        "Browser animation adapter disposed.",
        "AbortError",
      );
    const compiled = keyframes(request, this.#platform.supportsLinearEasing === true);
    const hidden = this.#platform.isHidden?.(request.target) === true;
    const hasStyleFrames = Object.keys(compiled.keyframes[0]!).some(
      (key) => key !== "offset",
    );
    if (hidden) {
      this.#platform.applyFinal?.(
        request.target,
        terminalStyles(compiled, request),
      );
      if (compiled.scroll)
        this.#platform.applyScrollPosition?.(
          request.target,
          compiled.scroll.to,
        );
    }
    const native =
      hidden || !hasStyleFrames
        ? null
        : this.#platform.animate(
            request.target,
            compiled.keyframes,
            Object.freeze({
              duration: request.duration * 1000,
              delay: request.delay * 1000,
              iterations: request.iterations * (request.autoreverses ? 2 : 1),
              direction: request.autoreverses ? "alternate" : "normal",
              fill: request.fill,
              easing:
                compiled.easing ??
                (typeof request.timing === "object" &&
                request.timing.kind === "spring"
                  ? "linear"
                  : cssTiming(request.timing)),
            }),
          );
    let settled = false;
    let paused = false;
    let finishListenerInstalled = false;
    let cancelListenerInstalled = false;
    let completionTimer: unknown;
    let scrollTimer: unknown;
    const totalDuration =
      request.delay * 1000 +
      request.duration *
        1000 *
        request.iterations *
        (request.autoreverses ? 2 : 1);
    let remainingMs = totalDuration;
    let scheduledAt = 0;
    let resolveFinished!: (state: "completed" | "cancelled") => void;
    const finished = new Promise<"completed" | "cancelled">((resolve) => {
      resolveFinished = resolve;
    });
    const settle = (requestedState: "completed" | "cancelled") => {
      if (settled) return;
      settled = true;
      let state = requestedState;
      if (native && finishListenerInstalled) {
        finishListenerInstalled = false;
        this.#listenerCount = Math.max(0, this.#listenerCount - 1);
        try {
          native.removeEventListener("finish", onFinish);
        } catch {
          /* cleanup remains failure-atomic */
        }
      }
      if (native && cancelListenerInstalled) {
        cancelListenerInstalled = false;
        this.#listenerCount = Math.max(0, this.#listenerCount - 1);
        try {
          native.removeEventListener("cancel", onCancel);
        } catch {
          /* cleanup remains failure-atomic */
        }
      }
      if (completionTimer !== undefined) {
        try {
          this.#platform.cancelScheduled?.(completionTimer);
        } catch {
          /* timer ownership is still released */
        }
        completionTimer = undefined;
        this.#timerCount = Math.max(0, this.#timerCount - 1);
      }
      if (scrollTimer !== undefined) {
        try {
          this.#platform.cancelScheduled?.(scrollTimer);
        } catch {
          /* timer ownership is still released */
        }
        scrollTimer = undefined;
        this.#timerCount = Math.max(0, this.#timerCount - 1);
      }
      if (state === "completed" && compiled.scroll) {
        try {
          this.#platform.applyScrollPosition?.(
            request.target,
            finalScrollPosition(),
          );
        } catch {
          state = "cancelled";
        }
      }
      this.#active.delete(playback);
      this.#visibilityUpdates.delete(playback);
      if (!this.#active.size) {
        const release = this.#releaseVisibility;
        this.#releaseVisibility = null;
        try {
          release?.();
        } catch {
          /* Settlement must resolve despite a host teardown failure. */
        }
      }
      resolveFinished(state);
    };
    const onFinish = () => settle("completed");
    const onCancel = () => settle("cancelled");
    const finalScrollPosition = () =>
      scrollSample(request, compiled, terminalProgress(request));
    const elapsed = () =>
      totalDuration -
      remainingMs +
      (paused ? 0 : Math.max(0, this.#platform.now() - scheduledAt));
    const applyScrollProgress = () => {
      if (!compiled.scroll || !this.#platform.applyScrollPosition) return;
      const animationElapsed = Math.max(0, elapsed() - request.delay * 1000);
      const unit =
        request.duration * 1000 === 0
          ? 1
          : animationElapsed / (request.duration * 1000);
      const phases = request.iterations * (request.autoreverses ? 2 : 1);
      const bounded = Math.max(0, Math.min(phases, unit));
      const phase = Math.min(
        Math.max(0, Math.floor(bounded)),
        Math.max(0, Math.ceil(phases) - 1),
      );
      let progress =
        bounded >= phases
          ? request.autoreverses
            ? 0
            : 1
          : bounded - Math.floor(bounded);
      if (request.autoreverses && phase % 2 === 1) progress = 1 - progress;
      progress = new AFXTimingFunction(request.timing).sample(
        progress,
        request.duration,
      );
      this.#platform.applyScrollPosition(
        request.target,
        scrollSample(request, compiled, progress),
      );
    };
    const scheduleScrollTick = () => {
      if (!compiled.scroll || !this.#platform.schedule || settled || paused)
        return;
      scrollTimer = this.#platform.schedule(
        () => {
          scrollTimer = undefined;
          this.#timerCount = Math.max(0, this.#timerCount - 1);
          if (settled || paused) return;
          try {
            applyScrollProgress();
            scheduleScrollTick();
          } catch {
            settle("cancelled");
          }
        },
        Math.min(16, Math.max(1, remainingMs)),
      );
      this.#timerCount += 1;
    };
    const scheduleCompletion = () => {
      if (!this.#platform.schedule || settled || paused) return;
      scheduledAt = this.#platform.now();
      completionTimer = this.#platform.schedule(() => {
        completionTimer = undefined;
        this.#timerCount = Math.max(0, this.#timerCount - 1);
        settle("completed");
      }, remainingMs);
      this.#timerCount += 1;
      scheduleScrollTick();
    };
    const playback: RuntimeAnimationPlayback = {
      finished,
      progress: () => {
        if (settled) return 1;
        if (native && typeof native.currentTime === "number") {
          return Math.max(
            0,
            Math.min(1, native.currentTime / Math.max(1, totalDuration)),
          );
        }
        return Math.max(0, Math.min(1, elapsed() / Math.max(1, totalDuration)));
      },
      pause: () => {
        if (settled || paused) return true;
        paused = true;
        try {
          if (native) native.pause();
          if (completionTimer !== undefined) {
            remainingMs = Math.max(
              0,
              remainingMs - Math.max(0, this.#platform.now() - scheduledAt),
            );
            this.#platform.cancelScheduled?.(completionTimer);
            completionTimer = undefined;
            this.#timerCount = Math.max(0, this.#timerCount - 1);
          }
          if (scrollTimer !== undefined) {
            this.#platform.cancelScheduled?.(scrollTimer);
            scrollTimer = undefined;
            this.#timerCount = Math.max(0, this.#timerCount - 1);
          }
          return true;
        } catch {
          try {
            native?.cancel();
          } catch {
            /* settlement still owns cleanup */
          }
          settle("cancelled");
          return false;
        }
      },
      play: () => {
        if (settled || !paused) return true;
        paused = false;
        try {
          if (native) native.play();
          scheduleCompletion();
          return true;
        } catch {
          try {
            native?.cancel();
          } catch {
            /* settlement still owns cleanup */
          }
          settle("cancelled");
          return false;
        }
      },
      seek: (seconds: number) => {
        if (
          !Number.isFinite(seconds) ||
          seconds < 0 ||
          seconds * 1000 > totalDuration
        )
          throw new RangeError("Seek time is outside the animation interval.");
        if (settled) return;
        if (native) native.currentTime = seconds * 1000;
        if (completionTimer !== undefined) {
          this.#platform.cancelScheduled?.(completionTimer);
          completionTimer = undefined;
          this.#timerCount = Math.max(0, this.#timerCount - 1);
        }
        if (scrollTimer !== undefined) {
          this.#platform.cancelScheduled?.(scrollTimer);
          scrollTimer = undefined;
          this.#timerCount = Math.max(0, this.#timerCount - 1);
        }
        remainingMs = totalDuration - seconds * 1000;
        scheduledAt = this.#platform.now();
        applyScrollProgress();
        if (!paused) scheduleCompletion();
      },
      cancel() {
        if (!settled) {
          try {
            native?.cancel();
          } finally {
            settle("cancelled");
          }
        }
      },
      dispose() {
        if (!settled) {
          try {
            native?.cancel();
          } finally {
            settle("cancelled");
          }
        }
      },
    };
    this.#active.add(playback);
    this.#visibilityUpdates.set(playback, () => {
      if (settled || !this.#platform.isHidden?.(request.target)) return;
      try {
        if (
          (hasStyleFrames && !this.#platform.applyFinal) ||
          (compiled.scroll && !this.#platform.applyScrollPosition)
        ) {
          settle("cancelled");
          native?.cancel();
          return;
        }
        native?.pause();
        if (hasStyleFrames)
          this.#platform.applyFinal?.(
            request.target,
            terminalStyles(compiled, request),
          );
        if (compiled.scroll)
          this.#platform.applyScrollPosition?.(
            request.target,
            scrollSample(request, compiled, terminalProgress(request)),
          );
        settle("completed");
        native?.cancel();
      } catch {
        settle("cancelled");
        try {
          native?.cancel();
        } catch {
          /* Teardown remains terminal. */
        }
      }
    });
    try {
      if (!this.#releaseVisibility && this.#platform.subscribeVisibility) {
        const release = this.#platform.subscribeVisibility(() => {
          for (const update of [...this.#visibilityUpdates.values()]) update();
        });
        if (this.#active.size === 0) release();
        else this.#releaseVisibility = release;
      }
      if (settled) return playback;
      if (hidden) {
        settle("completed");
      } else if (native) {
        native.addEventListener("finish", onFinish);
        finishListenerInstalled = true;
        this.#listenerCount += 1;
        native.addEventListener("cancel", onCancel);
        cancelListenerInstalled = true;
        this.#listenerCount += 1;
      }
      if (!hidden) {
        if (this.#platform.schedule) scheduleCompletion();
        else if (!native) settle("cancelled");
      }
    } catch (error) {
      try {
        native?.cancel();
      } catch {
        /* preserve the startup failure */
      }
      settle("cancelled");
      throw error;
    }
    return playback;
  }

  applyFinal(request: RuntimeAnimationRequest) {
    const compiled = keyframes(request);
    this.#platform.applyFinal?.(
      request.target,
      terminalStyles(compiled, request),
    );
    if (compiled.scroll)
      this.#platform.applyScrollPosition?.(
        request.target,
        scrollSample(request, compiled, terminalProgress(request)),
      );
  }

  diagnostics(): RuntimeAnimationAdapterDiagnostics {
    return Object.freeze({
      activeCount: this.#active.size,
      listenerCount: this.#listenerCount + (this.#releaseVisibility ? 1 : 0),
      timerCount: this.#timerCount,
    });
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const playback of [...this.#active]) playback.dispose();
    this.#releaseVisibility?.();
    this.#releaseVisibility = null;
    this.#visibilityUpdates.clear();
  }
}

export class BrowserAnimationAdapterFactory implements RuntimeAnimationAdapterFactory {
  readonly #platform: BrowserAnimationPlatform;
  readonly #leases = new Set<{
    readonly adapter: BrowserAnimationAdapter;
    released: boolean;
    readonly abort: () => void;
  }>();

  constructor(platform: BrowserAnimationPlatform) {
    this.#platform = platform;
  }

  acquire(
    _runtimeId: string,
    signal: AbortSignal,
  ): RuntimeAnimationAdapterLease {
    if (signal.aborted)
      throw new DOMException("Animation adapter lease aborted.", "AbortError");
    const adapter = new BrowserAnimationAdapter(this.#platform, signal);
    const record = { adapter, released: false, abort: () => release() };
    const release = () => {
      if (record.released) return;
      record.released = true;
      signal.removeEventListener("abort", record.abort);
      adapter.dispose();
      this.#leases.delete(record);
    };
    this.#leases.add(record);
    signal.addEventListener("abort", record.abort, { once: true });
    return Object.freeze({ adapter, release });
  }

  diagnostics() {
    const adapters = [...this.#leases].map(({ adapter }) =>
      adapter.diagnostics(),
    );
    return Object.freeze({
      runtimeLeaseCount: this.#leases.size,
      activeCount: adapters.reduce(
        (total, item) => total + item.activeCount,
        0,
      ),
      listenerCount: adapters.reduce(
        (total, item) => total + item.listenerCount,
        0,
      ),
      timerCount: adapters.reduce((total, item) => total + item.timerCount, 0),
    });
  }
}

let nextLayerContent = 0;

/** A projection onto one existing owned DOM element. The layer never creates a window or compositor server. */
export class BrowserAnimationLayerSurface implements AFXLayerSurface {
  readonly supportsReplication = true;
  #replicationElement: SVGSVGElement | null = null;
  #projectiveReplicationElement: HTMLDivElement | null = null;
  #replicaMarkup = "";
  #presentationTime = 0;
  // Children must retain recent presentation even before a replicator is attached.
  readonly #replicatorHistory = new AFXPresentationHistory<
    Readonly<{ snapshot: AFXLayerSnapshot; contentMarkup: string }>
  >({ window: 4, maximumSamples: 2048 });
  readonly supportedContentKinds = Object.freeze([
    "image",
    "shape",
    "gradient",
    "text",
    "emitter",
    "tiled",
  ] as const);
  readonly #contentId = `afx-content-${++nextLayerContent}`;
  #contentElement: SVGSVGElement | null = null;
  #paintedContent: AFXLayerSnapshot["content"] = undefined;
  #paintedBounds = "";
  #paintedContentGeometry = "";
  #contentMarkup = "";
  readonly supportedProperties = Object.freeze([
    "frame",
    "opacity",
    "transform",
    "backgroundColour",
    "boxShadow",
    "scrollPosition",
  ]);
  readonly #element: HTMLElement;
  readonly #children: BrowserAnimationLayerSurface[] = [];
  #parent: BrowserAnimationLayerSurface | null = null;
  readonly #originalStyle: string | null;
  readonly #observers = new Set<() => void>();
  #snapshot: AFXLayerSnapshot | null = null;
  readonly #compositorAnimations = new Set<Animation>();
  readonly #compositorTransforms = new Map<Animation, { from: string; to: string; projectedFrom: string; projectedTo: string; onUnsupported: (() => void) | null }>();
  #mask: BrowserAnimationLayerSurface | null = null;
  #maskRelease: (() => void) | null = null;
  #disposed = false;
  #ownsElement = false;
  readonly #layout: "layer" | "css";
  constructor(element: HTMLElement, layout: "layer" | "css" = "layer") {
    if (!element || !element.style || !element.ownerDocument)
      throw new TypeError("Layer surface requires a real DOM element.");
    this.#element = element;
    this.#layout = layout;
    this.#originalStyle = element.getAttribute("style");
  }
  replicationCapability() {
    return Object.freeze({ projectiveDepth: true });
  }
  compositionCapability() {
    for (const node of this.#element.childNodes) {
      if (
        node === this.#contentElement ||
        node === this.#replicationElement ||
        node === this.#projectiveReplicationElement ||
        this.#children.some((child) => child.#element === node)
      )
        continue;
      if (node.nodeType === 3 && !node.textContent?.trim()) continue;
      return Object.freeze({ state: "unsupported" as const, reason: "unmanaged-dom" });
    }
    if (
      this.#element.style.backgroundImage &&
      this.#element.style.backgroundImage !== "none"
    )
      return Object.freeze({ state: "unsupported" as const, reason: "unmanaged-dom-background-image" });
    return Object.freeze({ state: "portable-owned" as const });
  }
  /** Allocates the projection for a detached layer added under this one: a new element owned by the surface and removed with it. */
  createSublayerSurface(): AFXLayerSurface {
    if (this.#disposed) throw new DOMException("The layer surface is disposed.", "InvalidStateError");
    const surface = new BrowserAnimationLayerSurface(this.#element.ownerDocument.createElement("div"));
    surface.#ownsElement = true;
    return surface;
  }
  startCompositorAnimation(input: AFXLayerCompositorRequest): AFXLayerCompositorPlayback | null {
    const snapshot = this.#snapshot;
    if (this.#disposed || !snapshot || !this.#element.isConnected || typeof this.#element.animate !== "function") return null;
    const from = input.property === "transform" ? this.#projectCompositorTransform(snapshot, String(input.from)) : String(input.from);
    const to = input.property === "transform" ? this.#projectCompositorTransform(snapshot, String(input.to)) : String(input.to);
    let native: Animation;
    try {
      native = this.#element.animate(
        [{ [input.property]: from }, { [input.property]: to }],
        { duration: input.duration * 1000, delay: input.delay * 1000, easing: input.easing, fill: "forwards" },
      );
    } catch {
      // A browser may expose Web Animations but reject this particular effect.
      // Preserve the layer's frame-sampled path rather than stranding its handle.
      return null;
    }
    let transformEntry: { from: string; to: string; projectedFrom: string; projectedTo: string; onUnsupported: (() => void) | null } | null = null;
    if (input.property === "transform") {
      if (!native.effect || !("setKeyframes" in native.effect)) {
        native.cancel();
        return null;
      }
      transformEntry = { from: String(input.from), to: String(input.to), projectedFrom: from, projectedTo: to, onUnsupported: null };
      this.#compositorTransforms.set(native, transformEntry);
    }
    this.#compositorAnimations.add(native);
    return Object.freeze({
      get currentTimeSeconds() { return typeof native.currentTime === "number" ? native.currentTime / 1000 : null; },
      pause: () => native.pause(),
      resume: () => native.play(),
      seek: (seconds: number) => { native.currentTime = seconds * 1000; },
      cancel: () => { this.#compositorAnimations.delete(native); this.#compositorTransforms.delete(native); native.cancel(); },
      onFinish: (listener: () => void) => {
        native.addEventListener("finish", listener);
        return () => native.removeEventListener("finish", listener);
      },
      onUnsupported: (listener: () => void) => {
        if (!transformEntry) return () => {};
        transformEntry.onUnsupported = listener;
        return () => { if (transformEntry?.onUnsupported === listener) transformEntry.onUnsupported = null; };
      },
    });
  }
  #projectCompositorTransform(snapshot: AFXLayerSnapshot, value: string): string {
    return snapshot.inheritedTransform
      .multiply(AFXTransform3D.translation(snapshot.position.x, snapshot.position.y, snapshot.zPosition))
      .multiply(AFXTransform3D.fromCSS(value, snapshot.bounds))
      .multiply(AFXTransform3D.translation(
        -snapshot.anchorPoint.x * snapshot.bounds.width,
        -snapshot.anchorPoint.y * snapshot.bounds.height,
        -snapshot.anchorPointZ,
      ))
      .toCSS();
  }
  apply(snapshot: AFXLayerSnapshot, presentationTime = this.#presentationTime): void {
    if (this.#disposed) throw new Error("Layer surface is disposed.");
    if (!Number.isFinite(presentationTime))
      throw new RangeError("Layer presentation time must be finite.");
    if (presentationTime < this.#presentationTime)
      this.#replicatorHistory.clear();
    this.#snapshot = snapshot;
    const { bounds, position, anchorPoint, transform, values } = snapshot;
    const style = this.#element.style;
    if (this.#layout === "layer") {
      style.position = "absolute";
      style.left = "0px";
      style.top = "0px";
      style.width = `${bounds.width}px`;
      style.height = `${bounds.height}px`;
    }
    style.transformOrigin = "0 0";
    style.opacity = String(snapshot.opacity);
    style.transform = snapshot.inheritedTransform
      .multiply(
        AFXTransform3D.translation(position.x, position.y, snapshot.zPosition),
      )
      .multiply(transform)
      .multiply(
        AFXTransform3D.translation(
          -anchorPoint.x * bounds.width,
          -anchorPoint.y * bounds.height,
          -snapshot.anchorPointZ,
        ),
      )
      .toCSS();
    for (const [native, transform] of this.#compositorTransforms) {
      const from = this.#projectCompositorTransform(snapshot, transform.from);
      const to = this.#projectCompositorTransform(snapshot, transform.to);
      if (from === transform.projectedFrom && to === transform.projectedTo) continue;
      try {
        (native.effect as KeyframeEffect).setKeyframes([{ transform: from }, { transform: to }]);
      } catch {
        this.#compositorTransforms.delete(native);
        this.#compositorAnimations.delete(native);
        transform.onUnsupported?.();
        native.cancel();
        continue;
      }
      transform.projectedFrom = from;
      transform.projectedTo = to;
    }
    style.transformStyle = "preserve-3d";
    style.visibility = snapshot.style.hidden ? "hidden" : "visible";
    style.backfaceVisibility = snapshot.style.doubleSided
      ? "visible"
      : "hidden";
    style.backgroundColor = snapshot.style.backgroundColour?.toCSS() ?? "";
    style.borderStyle = "solid";
    style.borderWidth = `${snapshot.style.borderWidth}px`;
    style.borderColor = snapshot.style.borderColour?.toCSS() ?? "transparent";
    if (this.#layout === "layer") style.boxSizing = "border-box";
    const corners = snapshot.style.maskedCorners;
    style.borderTopLeftRadius = `${corners.includes("top-left") ? snapshot.style.cornerRadius : 0}px`;
    style.borderTopRightRadius = `${corners.includes("top-right") ? snapshot.style.cornerRadius : 0}px`;
    style.borderBottomLeftRadius = `${corners.includes("bottom-left") ? snapshot.style.cornerRadius : 0}px`;
    style.borderBottomRightRadius = `${corners.includes("bottom-right") ? snapshot.style.cornerRadius : 0}px`;
    const shadow = snapshot.style.shadowColour;
    style.boxShadow =
      shadow && snapshot.style.shadowOpacity > 0
        ? `${snapshot.style.shadowOffset.x}px ${snapshot.style.shadowOffset.y}px ${snapshot.style.shadowRadius}px ${shadow.withAlpha(shadow.components.a * snapshot.style.shadowOpacity).toCSS()}`
        : "none";
    style.overflow = snapshot.clipsToBounds ? "hidden" : "visible";
    for (const [key, value] of Object.entries(values)) {
      if (key === "scrollPosition" && typeof value === "object" && "x" in value && "y" in value) {
        this.#element.scrollLeft = Number(value.x);
        this.#element.scrollTop = Number(value.y);
      } else if (["opacity", "backgroundColour", "boxShadow"].includes(key)) {
        const cssKey = key === "backgroundColour" ? "backgroundColor" : key;
        (style as unknown as Record<string, string>)[cssKey] = String(value);
      }
    }
    this.#applyContent();
    this.#applyMask();
    this.#presentationTime = presentationTime;
    this.#replicatorHistory.record(
      presentationTime,
      Object.freeze({ snapshot, contentMarkup: this.#contentMarkup }),
    );
    this.#notifyMaskChange(presentationTime);
  }
  #applyContent() {
    const snapshot = this.#snapshot;
    if (!snapshot) return;
    const boundsKey = Object.values(snapshot.bounds).join(",");
    const geometryKey = [
      ...Object.values(snapshot.contentsRect),
      ...Object.values(snapshot.contentsCenter),
      snapshot.contentsGravity,
    ].join(",");
    if (
      this.#paintedContent === snapshot.content &&
      this.#paintedBounds === boundsKey &&
      this.#paintedContentGeometry === geometryKey
    )
      return;
    const markup = layerContentSVG(
      snapshot.content,
      snapshot.bounds,
      this.#contentId,
      {
        contentsRect: snapshot.contentsRect,
        contentsCenter: snapshot.contentsCenter,
        contentsGravity: snapshot.contentsGravity,
      },
    );
    this.#contentMarkup = markup;
    this.#paintedContent = snapshot.content;
    this.#paintedBounds = boundsKey;
    this.#paintedContentGeometry = geometryKey;
    if (!markup) {
      this.#contentElement?.remove();
      this.#contentElement = null;
      return;
    }
    if (!this.#contentElement) {
      const element = this.#element.ownerDocument.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("focusable", "false");
      element.setAttribute("data-afx-content", snapshot.content!.kind);
      element.style.cssText =
        "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible";
      this.#element.insertBefore(element, this.#element.firstChild);
      this.#contentElement = element;
    }
    this.#contentElement.setAttribute("data-afx-content", snapshot.content!.kind);
    const { x, y, width, height } = snapshot.bounds;
    this.#contentElement.setAttribute(
      "viewBox",
      `${x} ${y} ${Math.max(1, width)} ${Math.max(1, height)}`,
    );
    this.#contentElement.innerHTML = markup;
  }
  attach(child: AFXLayerSurface, index = this.#children.length): void {
    if (
      !(child instanceof BrowserAnimationLayerSurface) ||
      child.#element.ownerDocument !== this.#element.ownerDocument
    )
      throw new TypeError("Incompatible layer surface.");
    if (this.#snapshot?.replication) child.#assertReplicable();
    const siblings = this.#children.filter((item) => item !== child);
    if (!Number.isInteger(index) || index < 0 || index > siblings.length)
      throw new RangeError("Invalid surface insertion index.");
    const previousParent = child.#parent;
    const previousIndex = previousParent
      ? previousParent.#children.indexOf(child)
      : -1;
    const previousDOMParent = child.#element.parentNode;
    const previousNext = child.#element.nextSibling;
    this.#element.insertBefore(
      child.#element,
      siblings[index] ? siblings[index].#element : null,
    );
    if (previousParent) previousParent.#children.splice(previousIndex, 1);
    child.#parent = this;
    this.#children.splice(index, 0, child);
    try {
      this.#notifyMaskChange();
      if (previousParent && previousParent !== this)
        previousParent.#notifyMaskChange();
    } catch (error) {
      this.#children.splice(this.#children.indexOf(child), 1);
      child.#parent = previousParent;
      if (previousParent)
        previousParent.#children.splice(previousIndex, 0, child);
      if (previousDOMParent)
        previousDOMParent.insertBefore(child.#element, previousNext);
      else child.#element.remove();
      try {
        this.#notifyMaskChange();
      } catch {
        /* Preserve projection failure. */
      }
      try {
        if (previousParent) previousParent.#notifyMaskChange();
      } catch {
        /* Preserve projection failure. */
      }
      throw error;
    }
  }
  detach(child: AFXLayerSurface): void {
    if (!(child instanceof BrowserAnimationLayerSurface))
      throw new TypeError("Incompatible layer surface.");
    if (child.#element.parentElement === this.#element)
      this.#element.removeChild(child.#element);
    const index = this.#children.indexOf(child);
    if (index >= 0) this.#children.splice(index, 1);
    if (child.#parent === this) child.#parent = null;
    this.#notifyMaskChange();
  }
  #notifyMaskChange(presentationTime = this.#presentationTime) {
    this.#applyReplication(presentationTime);
    for (const observer of this.#observers) observer();
    if (this.#parent) this.#parent.#notifyMaskChange(presentationTime);
  }
  setMask(mask: AFXLayerSurface | null): void {
    if (mask !== null && !(mask instanceof BrowserAnimationLayerSurface))
      throw new TypeError("Incompatible mask surface.");
    if (mask) {
      if (mask.#contains(this)) throw new Error("Mask composition cycle.");
      mask.#serializeAlphaMask({ count: 0 });
    }
    this.#maskRelease?.();
    this.#mask = mask;
    if (mask) {
      const update = () => {
        this.#applyMask();
        this.#notifyMaskChange();
      };
      mask.#observers.add(update);
      this.#maskRelease = () => mask.#observers.delete(update);
    } else this.#maskRelease = null;
    this.#applyMask();
    this.#notifyMaskChange();
  }
  #assertReplicable() {
    for (const node of this.#element.childNodes) {
      if (
        node === this.#contentElement ||
        node === this.#replicationElement ||
        node === this.#projectiveReplicationElement ||
        this.#children.some((child) => child.#element === node)
      )
        continue;
      if (node.nodeType === 3 && !node.textContent?.trim()) continue;
      throw new TypeError(
        "Replication requires owned FX content; unmanaged DOM is not cloned.",
      );
    }
    if (
      this.#element.style.backgroundImage &&
      this.#element.style.backgroundImage !== "none"
    )
      throw new TypeError(
        "Image-backed replication requires a specialized image surface.",
      );
    for (const child of this.#children) child.#assertReplicable();
  }
  #replicationWork(): number {
    const copies = this.#snapshot?.replication?.instanceCount ?? 1;
    const work =
      1 +
      copies *
        this.#children.reduce(
          (sum, child) => sum + child.#replicationWork(),
          0,
        ) +
      (this.#mask ? this.#mask.#replicationWork() : 0);
    if (work > 1024)
      throw new RangeError("Expanded layer replication exceeds1024 surfaces.");
    return work;
  }
  #applyReplication(presentationTime = this.#presentationTime) {
    const snapshot = this.#snapshot;
    if (!snapshot?.replication) {
      if (this.#replicationElement) {
        this.#replicationElement.remove();
        this.#replicationElement = null;
      }
      if (this.#projectiveReplicationElement) {
        this.#projectiveReplicationElement.remove();
        this.#projectiveReplicationElement = null;
      }
      this.#replicaMarkup = "";
      for (const child of this.#children)
        child.#element.style.opacity = String(child.#snapshot?.opacity ?? 1);
      return;
    }
    this.#replicationWork();
    for (const child of this.#children) child.#assertReplicable();
    const sources = Array.from(
      { length: snapshot.replication.instanceCount },
      (_, index) => {
        const sampleTime =
          presentationTime - index * snapshot.replication!.instanceDelay;
        const budget = { count: 0, bytes: 0 };
        return this.#children
          .map((child) =>
            snapshot.replication!.projectionMode === "projective"
              ? child.#serializeProjectiveSource(budget, sampleTime)
              : child.#serializeAlphaMask(budget, sampleTime),
          )
          .join("");
      },
    );
    const markup = snapshot.replication.projectionMode === "projective"
      ? replicationProjectiveHTML(
          sources,
          snapshot.replication,
          snapshot.bounds,
          this.#contentId + "-replicas",
        )
      : replicationSVG(
          sources,
          snapshot.replication,
          snapshot.bounds,
          this.#contentId + "-replicas",
    );
    if (markup.length > 1000000)
      throw new RangeError("Replica content exceeds its byte budget.");
    if (snapshot.replication.projectionMode === "projective") {
      if (this.#replicationElement) {
        this.#replicationElement.remove();
        this.#replicationElement = null;
        this.#replicaMarkup = "";
      }
      if (!this.#projectiveReplicationElement) {
        const element = this.#element.ownerDocument.createElement("div");
        element.setAttribute("aria-hidden", "true");
        element.setAttribute("data-afx-replicas-projective", "");
        element.style.cssText =
          "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible;transform-style:preserve-3d";
        this.#element.append(element);
        this.#projectiveReplicationElement = element;
      }
      if (this.#replicaMarkup !== markup) {
        this.#projectiveReplicationElement.innerHTML = markup;
        this.#replicaMarkup = markup;
      }
      for (const child of this.#children) child.#element.style.opacity = "0";
      return;
    }
    if (this.#projectiveReplicationElement) {
      this.#projectiveReplicationElement.remove();
      this.#projectiveReplicationElement = null;
      this.#replicaMarkup = "";
    }
    if (!this.#replicationElement) {
      const element = this.#element.ownerDocument.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("focusable", "false");
      element.setAttribute("data-afx-replicas", "");
      element.style.cssText =
        "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible";
      this.#element.append(element);
      this.#replicationElement = element;
    }
    this.#replicationElement.setAttribute(
      "viewBox",
      "0 0 " +
        Math.max(1, snapshot.bounds.width) +
        " " +
        Math.max(1, snapshot.bounds.height),
    );
    if (this.#replicaMarkup !== markup) {
      this.#replicationElement.innerHTML = markup;
      this.#replicaMarkup = markup;
    }
    for (const child of this.#children) child.#element.style.opacity = "0";
  }
  #contains(
    target: BrowserAnimationLayerSurface,
    seen = new Set<BrowserAnimationLayerSurface>(),
  ): boolean {
    if (this === target) return true;
    if (seen.has(this)) return false;
    if (seen.size >= 256)
      throw new RangeError("Mask composition exceeds256 surfaces.");
    seen.add(this);
    return (
      !!(this.#mask && this.#mask.#contains(target, seen)) ||
      this.#children.some((child) => child.#contains(target, seen))
    );
  }
  #applyMask() {
    const mask = this.#mask ? this.#mask.#snapshot : null,
      own = this.#snapshot;
    if (!mask || !own || !this.#mask) {
      this.#element.style.maskImage = "";
      return;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, own.bounds.width)}" height="${Math.max(1, own.bounds.height)}">${this.#mask.#serializeAlphaMask({ count: 0 })}</svg>`;
    if (svg.length > 1000000)
      throw new RangeError("Mask SVG exceeds one million characters.");
    this.#element.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    this.#element.style.maskMode = "alpha";
    this.#element.style.maskRepeat = "no-repeat";
    this.#element.style.maskSize = "100% 100%";
  }
  #serializeProjectiveSource(
    budget: { count: number; bytes?: number },
    presentationTime: number,
  ): string {
    if (++budget.count > 256)
      throw new RangeError("Projective replication exceeds 256 owned layers.");
    const historical = this.#replicatorHistory.at(presentationTime);
    const snapshot = historical?.snapshot ?? this.#snapshot;
    if (!snapshot || snapshot.style.hidden) return "";
    if (snapshot.replication)
      throw new TypeError(
        "Nested replication inside projective replication is not depth-preserving.",
      );
    if (this.#mask)
      throw new TypeError(
        "Masked projective replication requires a depth-preserving mask backend.",
      );

    const { bounds, position, anchorPoint, style } = snapshot;
    const transform = snapshot.inheritedTransform
      .multiply(
        AFXTransform3D.translation(position.x, position.y, snapshot.zPosition),
      )
      .multiply(snapshot.transform)
      .multiply(
        AFXTransform3D.translation(
          -anchorPoint.x * bounds.width,
          -anchorPoint.y * bounds.height,
          -snapshot.anchorPointZ,
        ),
      );
    const content = historical?.contentMarkup ?? this.#contentMarkup;
    const children = this.#children
      .map((child) => child.#serializeProjectiveSource(budget, presentationTime))
      .join("");
    const background =
      typeof snapshot.values.backgroundColour === "string"
        ? GFXColour.parse(snapshot.values.backgroundColour).toCSS()
        : style.backgroundColour?.toCSS() ?? "transparent";
    const border = style.borderColour?.toCSS() ?? "transparent";
    const corners = style.maskedCorners;
    const radii = ["top-left", "top-right", "bottom-right", "bottom-left"]
      .map((corner) => corners.includes(corner as (typeof corners)[number]) ? style.cornerRadius : 0)
      .map((radius) => `${radius}px`)
      .join(" ");
    const contentSVG = content
      ? `<svg aria-hidden="true" focusable="false" viewBox="${bounds.x} ${bounds.y} ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none">${content}</svg>`
      : "";
    const markup =
      `<div data-afx-projective-layer="" opacity="${snapshot.opacity}" style="position:absolute;left:0;top:0;width:${bounds.width}px;height:${bounds.height}px;box-sizing:border-box;transform-origin:0 0;transform-style:preserve-3d;transform:${transform.toCSS()};opacity:${snapshot.opacity};visibility:${style.hidden ? "hidden" : "visible"};backface-visibility:${style.doubleSided ? "visible" : "hidden"};background:${background};border:${style.borderWidth}px solid ${border};border-radius:${radii};overflow:${snapshot.clipsToBounds ? "hidden" : "visible"};pointer-events:none">` +
      contentSVG +
      children +
      `</div>`;
    budget.bytes = (budget.bytes ?? 0) + markup.length;
    if (budget.bytes > 1_000_000)
      throw new RangeError("Projective replica content exceeds its byte budget.");
    return markup;
  }
  #serializeAlphaMask(
    budget: { count: number; bytes?: number },
    presentationTime?: number,
  ): string {
    if (++budget.count > 256)
      throw new RangeError("Alpha-mask projection exceeds 256 layers.");
    const historical = presentationTime === undefined
      ? null
      : this.#replicatorHistory.at(presentationTime);
    const snapshot = historical?.snapshot ?? this.#snapshot;
    if (!snapshot || snapshot.style.hidden) return "";

    const { bounds, position, anchorPoint, style } = snapshot;
    const matrix = snapshot.inheritedTransform
      .multiply(
        AFXTransform3D.translation(position.x, position.y, snapshot.zPosition),
      )
      .multiply(snapshot.transform)
      .multiply(
        AFXTransform3D.translation(
          -anchorPoint.x * bounds.width,
          -anchorPoint.y * bounds.height,
          -snapshot.anchorPointZ,
        ),
      )
      .toAffine();
    const background =
      typeof snapshot.values.backgroundColour === "string"
        ? GFXColour.parse(snapshot.values.backgroundColour)
        : style.backgroundColour;
    const inset = Math.min(
        style.borderWidth / 2,
        bounds.width / 2,
        bounds.height / 2,
      ),
      w = Math.max(0, bounds.width - inset * 2),
      h = Math.max(0, bounds.height - inset * 2),
      r = Math.min(Math.max(0, style.cornerRadius - inset), w / 2, h / 2);
    const [tl, tr, br, bl] = [
      "top-left",
      "top-right",
      "bottom-right",
      "bottom-left",
    ].map((corner) =>
      style.maskedCorners.includes(
        corner as (typeof style.maskedCorners)[number],
      )
        ? r
        : 0,
    );
    const path = `M ${inset + tl} ${inset} H ${inset + w - tr} Q ${inset + w} ${inset} ${inset + w} ${inset + tr} V ${inset + h - br} Q ${inset + w} ${inset + h} ${inset + w - br} ${inset + h} H ${inset + bl} Q ${inset} ${inset + h} ${inset} ${inset + h - bl} V ${inset + tl} Q ${inset} ${inset} ${inset + tl} ${inset} Z`;
    const id = "afx-mask-node-" + budget.count;
    const content = historical?.contentMarkup ?? this.#contentMarkup;
    budget.bytes = (budget.bytes ?? 0) + content.length + path.length + 500;
    if (budget.bytes > 1000000)
      throw new RangeError("Alpha-mask content exceeds its byte budget.");
    const sourceChildren = this.#children
      .map((child) => child.#serializeAlphaMask(budget, presentationTime))
      .join("");
    if (snapshot.replication) this.#replicationWork();
    const children = snapshot.replication
      ? replicationSVG(
          sourceChildren,
          snapshot.replication,
          bounds,
          this.#contentId + "-replicas",
        )
      : sourceChildren;
    const clip = snapshot.clipsToBounds
      ? '<clipPath id="' + id + '-clip"><path d="' + path + '"/></clipPath>'
      : "";
    const nested = this.#mask
      ? '<mask id="' +
        id +
        '-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="' +
        bounds.width +
        '" height="' +
        bounds.height +
        '" style="mask-type:alpha">' +
        this.#mask.#serializeAlphaMask(budget, presentationTime) +
        "</mask>"
      : "";
    const backgroundShape =
      '<path d="' +
      path +
      '" fill="' +
      layerSVGColour(background) +
      '" stroke="' +
      layerSVGColour(style.borderColour) +
      '" stroke-width="' +
      style.borderWidth +
      '"/>';
    const contents =
      '<g transform="translate(' +
      -bounds.x +
      " " +
      -bounds.y +
      ')">' +
      content +
      "</g>" +
      children;
    return (
      '<g transform="matrix(' +
      [matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty].join(" ") +
      ')" opacity="' +
      snapshot.opacity +
      '"><defs>' +
      clip +
      nested +
      "</defs><g" +
      (nested ? ' mask="url(#' + id + '-mask)"' : "") +
      ">" +
      backgroundShape +
      "<g" +
      (clip ? ' clip-path="url(#' + id + '-clip)"' : "") +
      ">" +
      contents +
      "</g></g></g>"
    );
  }
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const animation of this.#compositorAnimations) animation.cancel();
    this.#compositorAnimations.clear();
    this.#compositorTransforms.clear();
    this.#maskRelease?.();
    this.#snapshot = null;
    this.#notifyMaskChange();
    this.#observers.clear();
    this.#contentElement?.remove();
    this.#contentElement = null;
    this.#replicationElement?.remove();
    this.#replicationElement = null;
    if (this.#ownsElement) this.#element.remove();
    else if (this.#originalStyle === null) this.#element.removeAttribute("style");
    else this.#element.setAttribute("style", this.#originalStyle);
  }
}

interface BrowserFrameDispatcher {
  request(callback: (timestamp: number) => void): () => void;
  subscribeState(callback: () => void): () => void;
  readonly query: MediaQueryList | null;
  readonly now: () => number;
}

/** One per window: every AnimationFX scheduler of a window shares one native
 * animation frame and one visibility/reduced-motion listener pair. */
const frameDispatchers = new WeakMap<Window, BrowserFrameDispatcher>();

function browserFrameDispatcher(browserWindow: Window, browserDocument: Document): BrowserFrameDispatcher {
  const existing = frameDispatchers.get(browserWindow);
  if (existing) return existing;
  const query =
    typeof browserWindow.matchMedia === "function"
      ? browserWindow.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  const now = () => browserWindow.performance.now() / 1000;
  // Requests made while a frame dispatches belong to the next frame, as
  // with requestAnimationFrame; the two queues alternate without copying.
  let pending = new Map<number, (timestamp: number) => void>();
  let dispatching = new Map<number, (timestamp: number) => void>();
  let nextId = 0;
  let nativeFrame: number | null = null;
  const run = (callback: (timestamp: number) => void, id: number, queue: Map<number, (timestamp: number) => void>) => {
    queue.delete(id);
    // RAF's shared frame timestamp can predate start/resume/seek calls.
    // Read the current clock for each callback, including within one frame.
    try { callback(now()); }
    catch (error) { queueMicrotask(() => { throw error; }); }
  };
  const dispatch = () => {
    nativeFrame = null;
    const queue = pending;
    pending = dispatching;
    dispatching = queue;
    // Map.forEach skips entries deleted (cancelled) before they are reached.
    queue.forEach(run);
    queue.clear();
    // A request made during dispatch has already asked for the next frame.
    if (pending.size) nativeFrame ??= browserWindow.requestAnimationFrame(dispatch);
  };
  const stateListeners = new Set<() => void>();
  const notifyState = () => {
    // Like native listeners, subscribers added during a change wait for the next one.
    for (const listener of [...stateListeners]) {
      if (!stateListeners.has(listener)) continue;
      try { listener(); }
      catch (error) { queueMicrotask(() => { throw error; }); }
    }
  };
  const dispatcher: BrowserFrameDispatcher = {
    query,
    now,
    request(callback) {
      const id = ++nextId;
      pending.set(id, callback);
      nativeFrame ??= browserWindow.requestAnimationFrame(dispatch);
      return () => {
        if (pending.delete(id) && !pending.size && nativeFrame !== null) {
          browserWindow.cancelAnimationFrame(nativeFrame);
          nativeFrame = null;
        }
        dispatching.delete(id);
      };
    },
    subscribeState(callback) {
      const listener = () => callback();
      if (!stateListeners.size) {
        browserDocument.addEventListener("visibilitychange", notifyState);
        query?.addEventListener?.("change", notifyState);
      }
      stateListeners.add(listener);
      return () => {
        if (!stateListeners.delete(listener) || stateListeners.size) return;
        browserDocument.removeEventListener("visibilitychange", notifyState);
        query?.removeEventListener?.("change", notifyState);
      };
    },
  };
  frameDispatchers.set(browserWindow, dispatcher);
  return dispatcher;
}

export function createBrowserAFXFrameScheduler(
  browserWindow: Window,
  browserDocument: Document,
): AFXFrameScheduler {
  const dispatcher = browserFrameDispatcher(browserWindow, browserDocument);
  const query = dispatcher.query;
  return Object.freeze({
    now: dispatcher.now,
    get reducedMotion() {
      return query?.matches ?? true;
    },
    get suspended() {
      return browserDocument.hidden;
    },
    requestFrame(callback: (timestamp: number) => void) {
      return dispatcher.request(callback);
    },
    subscribeState(callback: () => void) {
      return dispatcher.subscribeState(callback);
    },
  });
}
