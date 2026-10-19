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

import { SynCloudOSLifecycleRecord, synCloudOSLifecycleSignalReason } from "../../SynCloudOS/fxRuntimeContracts";
import type { AFXReplication } from "./AFXReplication";
import type { AFXLayerContent } from "./AFXLayerContent";
import {
  normalisePoint,
  normaliseRect,
  type GFXPoint,
  type GFXRect,
} from "../GraphicsFX/GFXGeometry";
import { AFXTransform3D, type AFXPoint3D } from "./AFXTransform3D";
import {
  defaultAFXLayerStyle,
  layerFinite,
  layerColour,
  type AFXLayerStyle,
  type AFXLayerCorner,
} from "./AFXLayerStyle";
import type { GFXColour } from "../GraphicsFX/GFXColour";
import { GFXImage } from "../GraphicsFX/GFXImage";
import { AFXCompositionSnapshot } from "./AFXCompositionSnapshot";
import { VFXFrame } from "../VideoFX/VFXFrame";
import { IFXShader } from '../ImageFX/IFXShader';
import { IFXFilter } from '../ImageFX/IFXFilterRegistry';
import { GFXGradient } from "../GraphicsFX/GFXGradient";
import { GFXPath } from "../GraphicsFX/GFXPath";
import { interpolateAFXValue } from "./interpolation";
import { AFXBasicAnimation } from "./AFXBasicAnimation";
import { AFXKeyframeAnimation } from "./AFXKeyframeAnimation";
import { AFXAnimation } from "./AFXAnimation";
import { afxAnimationDataRecord } from "./animationValues";
import { captureAFXTransactionAnimationStart, captureAFXTransactionDisplay, currentAFXTransactionActionContext } from "./AFXTransaction";
import {
  normaliseAFXLayerActionResult,
  normaliseAFXLayerActions,
  type AFXLayerAction,
  type AFXLayerActionKey,
  type AFXLayerActionMap,
} from "./AFXLayerActions";
import type { AFXSampledAnimation } from "./AFXAnimationGroup";
import type {
  AFXAnimationHandle,
  AFXAnimationScalar,
  AFXAnimationSettlement,
} from "./animationTypes";

export interface AFXFrameScheduler {
  now(): number;
  requestFrame(callback: (timestamp: number) => void): () => void;
  readonly reducedMotion: boolean;
  readonly suspended: boolean;
  subscribeState?(callback: () => void): () => void;
}
export type AFXContentsGravity =
  | "resize"
  | "resize-aspect"
  | "resize-aspect-fill"
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
export type AFXAutoresizingMask =
  | "min-x-margin"
  | "width"
  | "max-x-margin"
  | "min-y-margin"
  | "height"
  | "max-y-margin";
export interface AFXLayerSnapshot {
  readonly filters?: readonly IFXShader[];
  readonly compositingFilter?: IFXFilter<'blend'> | null;
  readonly content?: AFXLayerContent | null;
  readonly replication?: AFXReplication | null;
  readonly bounds: GFXRect;
  readonly position: GFXPoint;
  readonly anchorPoint: GFXPoint;
  readonly opacity: number;
  readonly transform: AFXTransform3D;
  readonly clipsToBounds: boolean;
  readonly contentsRect: GFXRect;
  readonly contentsCenter: GFXRect;
  readonly contentsGravity: AFXContentsGravity;
  readonly autoresizingMask: readonly AFXAutoresizingMask[];
  readonly values: Readonly<Record<string, AFXAnimationScalar>>;
  readonly style: AFXLayerStyle;
  readonly zPosition: number;
  readonly anchorPointZ: number;
  readonly sublayerTransform: AFXTransform3D;
  readonly inheritedTransform: AFXTransform3D;
}
/** Host-provided projection port for one actual rendering surface, not a compositor tree. */
export interface AFXLayerSurface {
  readonly supportsFilters?: boolean;
  readonly supportedProperties: readonly string[];
  readonly supportsReplication?: boolean;
  readonly supportedContentKinds?: readonly AFXLayerContent["kind"][];
  replicationCapability?(): Readonly<{ projectiveDepth: boolean }>;
  compositionCapability?(): AFXLayerCompositionCapability;
  startCompositorAnimation?(input: AFXLayerCompositorRequest): AFXLayerCompositorPlayback | null;
  apply(snapshot: AFXLayerSnapshot, presentationTime?: number): void;
  attach(child: AFXLayerSurface, index?: number): void;
  detach(child: AFXLayerSurface): void;
  setMask(mask: AFXLayerSurface | null): void;
  dispose(): void;
}
export interface AFXLayerCompositorRequest {
  readonly property: "opacity" | "transform";
  readonly from: number | string;
  readonly to: number | string;
  readonly duration: number;
  readonly delay: number;
  readonly easing: string;
}
export interface AFXLayerCompositorPlayback {
  readonly currentTimeSeconds: number | null;
  pause(): void;
  resume(): void;
  seek(seconds: number): void;
  cancel(): void;
  onFinish(listener: () => void): () => void;
  onUnsupported?(listener: () => void): () => void;
}
export type AFXLayerCompositionCapability = Readonly<{
  state: "portable-owned" | "unsupported";
  reason?: string;
}>;
export type AFXSublayerInsertionOptions = Readonly<{
  /**
   * Rebase the child's currently displayed geometry into the new superlayer.
   *
   * Active frame/transform animation is interrupted at its current presentation
   * value so callers can retarget from the exact visible pose after the move.
   */
  readonly preservePresentation?: boolean;
}>;
export interface AFXLayerDelegate {
  willDisplay?(layer: AFXLayer): void;
  didDisplay?(layer: AFXLayer): void;
  layoutSublayers?(layer: AFXLayer): void;
  actionForKey?(
    layer: AFXLayer,
    key: AFXLayerActionKey,
  ): AFXLayerAction | null | undefined;
}
export interface AFXPresentationLayer extends AFXLayerSnapshot {}
type Running = {
  handle: AFXAnimationHandle;
  cancelFrame: () => void;
  finish(state: AFXAnimationSettlement["state"]): void;
  update(timestamp: number): void;
  needsFrame(): boolean;
  property: string;
  value: AFXAnimationScalar | null;
  currentValue(): AFXAnimationScalar | null;
  compositor: AFXLayerCompositorPlayback | null;
};
let nextLayerAnimation = 0;
let nextLayerActionTarget = 0;

const unitRect = () => normaliseRect({ x: 0, y: 0, width: 1, height: 1 });
const contentsGravities = Object.freeze([
  "resize",
  "resize-aspect",
  "resize-aspect-fill",
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const satisfies readonly AFXContentsGravity[]);
const autoresizingValues = Object.freeze([
  "min-x-margin",
  "width",
  "max-x-margin",
  "min-y-margin",
  "height",
  "max-y-margin",
] as const satisfies readonly AFXAutoresizingMask[]);

function contentsRect(value: GFXRect): GFXRect {
  const rect = normaliseRect(value);
  if (rect.width <= 0 || rect.height <= 0)
    throw new RangeError("contentsRect crop must have positive dimensions.");
  if (
    Math.abs(rect.x) > 8 ||
    Math.abs(rect.y) > 8 ||
    rect.width > 8 ||
    rect.height > 8
  )
    throw new RangeError("contentsRect exceeds the bounded crop range.");
  return rect;
}

function contentsCenter(value: GFXRect): GFXRect {
  const rect = normaliseRect(value);
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > 1 ||
    rect.y + rect.height > 1
  )
    throw new RangeError("contentsCenter must be a positive rectangle inside the unit square.");
  return rect;
}

function denseDataArray(value: unknown, label: string, maximum: number) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < 1 ||
    value.length > maximum
  )
    throw new TypeError(`${label} must be a bounded plain dense array.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Array.from({ length: value.length }, (_, index) => {
    const slot = descriptors[index];
    if (!slot || !("value" in slot))
      throw new TypeError(`${label} must contain data slots.`);
    return slot.value;
  });
}

function snapshotContentAnimation(
  input: AFXSampledAnimation,
  keyPath: "path" | "gradient",
  targetId: string,
): AFXSampledAnimation {
  const totalDuration = input.animation.totalDuration;
  if (!Number.isFinite(totalDuration) || totalDuration < 0)
    throw new RangeError(`Animated ${keyPath} duration must be finite and nonnegative.`);
  const definition = afxAnimationDataRecord(
    input.toRuntime(),
    `Animated ${keyPath} definition`,
  );
  const entries = denseDataArray(
    definition.animations,
    `Animated ${keyPath} properties`,
    1,
  );
  const property = afxAnimationDataRecord(
    entries[0],
    `Animated ${keyPath} property`,
  );
  if (property.keyPath !== keyPath || property.targetId !== targetId)
    throw new TypeError(`Animated ${keyPath} definition does not match its declared target.`);
  if (typeof targetId !== "string" || !targetId || targetId.length > 512)
    throw new TypeError(`Animated ${keyPath} target is invalid.`);
  const expected = keyPath === "path" ? GFXPath : GFXGradient;
  const frames = property.keyframes === undefined
    ? []
    : denseDataArray(property.keyframes, `Animated ${keyPath} keyframes`, 1000).map(
        (value) => afxAnimationDataRecord(value, `Animated ${keyPath} keyframe`),
      );
  const values = [property.from, ...frames.map((frame) => frame.value), property.to];
  if (values.some((value) => !(value instanceof expected)))
    throw new TypeError(`Animated ${keyPath} requires canonical ${expected.name} values.`);
  for (let index = 1; index < values.length; index++)
    interpolateAFXValue(
      values[index - 1] as AFXAnimationScalar,
      values[index] as AFXAnimationScalar,
      0.5,
    );
  const timing = new AFXAnimation({
    duration: definition.duration as number,
    delay: definition.delay as number | undefined,
    iterations: definition.iterations as number | undefined,
    autoreverses: definition.autoreverses as boolean | undefined,
    fill: definition.fill as ConstructorParameters<typeof AFXAnimation>[0]["fill"],
    timing: definition.timing as ConstructorParameters<typeof AFXAnimation>[0]["timing"],
    reducedMotion: definition.reducedMotion as ConstructorParameters<typeof AFXAnimation>[0]["reducedMotion"],
  });
  const canonical = !frames.length
    ? new AFXBasicAnimation({
      targetId: property.targetId as string,
      keyPath,
      from: property.from as AFXAnimationScalar,
      to: property.to as AFXAnimationScalar,
      animation: timing,
    })
    : new AFXKeyframeAnimation({
        targetId: property.targetId as string,
        keyPath,
        values: frames.map((frame) => frame.value as AFXAnimationScalar),
        keyTimes: frames.map((frame) => frame.offset as number),
        animation: timing,
      });
  const sample = input.sample;
  if (typeof sample !== "function")
    throw new TypeError(`Animated ${keyPath} requires a sample function.`);
  const stableDefinition = canonical.toRuntime();
  return Object.freeze({
    targetId,
    keyPath,
    animation: Object.freeze({ totalDuration }),
    sample(seconds: number) {
      const value = sample.call(input, seconds);
      if (value === null) return null;
      if (!(value instanceof expected))
        throw new TypeError(`Animated ${keyPath} sample requires canonical ${expected.name}.`);
      interpolateAFXValue(values[0] as AFXAnimationScalar, value, 0.5);
      return value;
    },
    toRuntime: () => stableDefinition,
  });
}

/** Projects immutable model/presentation snapshots onto an explicitly supplied surface. */
export class AFXLayer {
  readonly #lifecycle = new SynCloudOSLifecycleRecord({ kind: "AFXLayer" });
  readonly #surface: AFXLayerSurface;
  readonly #scheduler: AFXFrameScheduler;
  readonly #running = new Map<string, Running>();
  readonly #children: AFXLayer[] = [];
  /** Frozen view of #children, rebuilt only after the children change. */
  #sublayerList: readonly AFXLayer[] | null = null;
  #parent: AFXLayer | null = null;
  #mask: AFXLayer | null = null;
  #maskOwner: AFXLayer | null = null;
  #content: AFXLayerContent | null = null;
  #filters: readonly IFXShader[] = Object.freeze([]);
  #compositingFilter: IFXFilter<'blend'> | null = null;
  #replication: AFXReplication | null = null;
  #disposed = false;
  #displayDirty = false;
  #layoutDirty = false;
  #layoutActive = false;
  #cancelInvalidation: (() => void) | null = null;
  #cancelAnimationFrame: (() => void) | null = null;
  #animationFrameBatch = false;
  #animationFrameDisplayPending = false;
  #unsubscribe: () => void;
  readonly #signal: AbortSignal | undefined;
  readonly #abort = () => this.dispose();
  #bounds: GFXRect = normaliseRect({ x: 0, y: 0, width: 0, height: 0 });
  #position: GFXPoint = normalisePoint({ x: 0, y: 0 });
  #anchor: GFXPoint = normalisePoint({ x: 0.5, y: 0.5 });
  #opacity = 1;
  #transform = new AFXTransform3D();
  #clip = false;
  #contentsRect = unitRect();
  #contentsCenter = unitRect();
  #contentsGravity: AFXContentsGravity = "resize";
  #autoresizingMask: readonly AFXAutoresizingMask[] = Object.freeze([]);
  #actions: AFXLayerActionMap = Object.freeze({});
  readonly #actionTargetId = `afx-layer-action:${++nextLayerActionTarget}`;
  #values: Record<string, AFXAnimationScalar> = {};
  #presentationTransformCache: Readonly<{
    css: string;
    width: number;
    height: number;
    transform: AFXTransform3D;
  }> | null = null;
  #presentationSublayerTransformCache: Readonly<{
    css: string;
    width: number;
    height: number;
    transform: AFXTransform3D;
  }> | null = null;
  #style: AFXLayerStyle = defaultAFXLayerStyle;
  #zPosition = 0;
  #anchorPointZ = 0;
  #sublayerTransform = new AFXTransform3D();
  delegate: AFXLayerDelegate | null = null;
  constructor(
    surface: AFXLayerSurface,
    scheduler: AFXFrameScheduler,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ) {
    if (options.signal?.aborted)
      throw new DOMException("Layer owner is already aborted.", "AbortError");
    if (
      !surface ||
      !Array.isArray(surface.supportedProperties) ||
      ["apply", "attach", "detach", "setMask", "dispose"].some(
        (key) =>
          typeof (surface as unknown as Record<string, unknown>)[key] !==
          "function",
      )
    )
      throw new TypeError(
        "Layer requires a real rendering-surface projection port.",
      );
    if (
      !scheduler ||
      typeof scheduler.now !== "function" ||
      typeof scheduler.requestFrame !== "function"
    )
      throw new TypeError("Layer requires a frame scheduler.");
    this.#surface = surface;
    this.#scheduler = scheduler;
    this.#signal = options.signal;
    this.#unsubscribe = () => {};
    try {
      this.#display();
      if (this.#signal?.aborted)
        throw new DOMException(
          "Layer owner aborted during construction.",
          "AbortError",
        );
      this.#unsubscribe =
        scheduler.subscribeState?.(() => {
          if (scheduler.suspended || scheduler.reducedMotion)
            for (const running of [...this.#running.values()])
              running.finish("completed");
        }) ?? (() => {});
      if (this.#signal?.aborted)
        throw new DOMException(
          "Layer owner aborted during construction.",
          "AbortError",
        );
      this.#signal?.addEventListener("abort", this.#abort, { once: true });
    } catch (error) {
      // Do not dispatch subclass disposal before its private fields initialize.
      this.#disposed = true;
      this.#signal?.removeEventListener("abort", this.#abort);
      try {
        this.#unsubscribe();
      } catch {
        /* Preserve the construction error. */
      }
      try {
        surface.dispose();
      } catch {
        /* Preserve the construction error. */
      }
      throw error;
    }
  }
  #assertLive(operation: string, access?: "call" | "set") {
    if (this.#disposed) throw this.#lifecycle.error({ code: "AFX_LAYER_DISPOSED", operation, ...(access ? { access } : {}) });
  }
  get actions(): AFXLayerActionMap {
    return this.#actions;
  }
  set actions(value: AFXLayerActionMap) {
    this.#assertLive("actions", "set");
    this.#actions = normaliseAFXLayerActions(value);
  }
  protected defaultActionForKey(_key: AFXLayerActionKey): AFXLayerAction | undefined {
    return undefined;
  }
  actionForKey(key: AFXLayerActionKey): AFXLayerAction | null {
    this.#assertLive("actionForKey", "call");
    if (
      ![
        "frame",
        "transform",
        "sublayerTransform",
        "opacity",
        "backgroundColour",
        "boxShadow",
        "scrollPosition",
      ].includes(key)
    )
      throw new TypeError("Unsupported implicit layer action key.");
    if (currentAFXTransactionActionContext()?.disableActions) return null;
    if (Object.hasOwn(this.#actions, key)) return this.#actions[key] ?? null;
    const delegated = normaliseAFXLayerActionResult(
      this.delegate?.actionForKey?.(this, key),
      `delegate ${key} action`,
    );
    if (delegated !== undefined) return delegated;
    return (
      normaliseAFXLayerActionResult(
        this.defaultActionForKey(key),
        `default ${key} action`,
      ) ?? null
    );
  }
  #applyImplicitAction(
    key: AFXLayerActionKey,
    from: AFXAnimationScalar,
    to: AFXAnimationScalar,
    mutate: () => void,
  ) {
    const transaction = currentAFXTransactionActionContext();
    const action = this.actionForKey(key);
    const animation = action
      ? new AFXBasicAnimation({
          targetId: this.#actionTargetId,
          keyPath: key,
          from,
          to,
          animation: new AFXAnimation({
            duration: transaction?.duration ?? action.duration,
            delay: transaction?.delay ?? action.delay ?? 0,
            timing: transaction?.timing ?? action.timing ?? "ease",
            reducedMotion: action.reducedMotion,
          }),
        })
      : null;
    if (transaction?.disableActions) this.#running.get(key)?.finish("interrupted");
    mutate();
    if (animation && !captureAFXTransactionAnimationStart(() => this.addAnimation(animation, key).finished))
      this.addAnimation(animation, key);
  }
  #resizeSublayers(previous: GFXRect, next: GFXRect) {
    if (previous.width === next.width && previous.height === next.height) return;
    for (const child of this.#children) child.#resizeFromSuperlayer(previous, next);
  }
  #resizeFromSuperlayer(previous: GFXRect, next: GFXRect) {
    const frame = this.frame;
    const horizontal = [
      this.#autoresizingMask.includes("min-x-margin"),
      this.#autoresizingMask.includes("width"),
      this.#autoresizingMask.includes("max-x-margin"),
    ];
    const vertical = [
      this.#autoresizingMask.includes("min-y-margin"),
      this.#autoresizingMask.includes("height"),
      this.#autoresizingMask.includes("max-y-margin"),
    ];
    const hCount = horizontal.filter(Boolean).length;
    const vCount = vertical.filter(Boolean).length;
    const dx = hCount ? (next.width - previous.width) / hCount : 0;
    const dy = vCount ? (next.height - previous.height) / vCount : 0;
    const resized = normaliseRect({
      x: frame.x + (horizontal[0] ? dx : 0),
      y: frame.y + (vertical[0] ? dy : 0),
      width: Math.max(0, frame.width + (horizontal[1] ? dx : 0)),
      height: Math.max(0, frame.height + (vertical[1] ? dy : 0)),
    });
    const oldBounds = this.#bounds;
    this.#bounds = normaliseRect({
      ...this.#bounds,
      width: resized.width,
      height: resized.height,
    });
    this.#position = normalisePoint({
      x: resized.x + this.#anchor.x * resized.width,
      y: resized.y + this.#anchor.y * resized.height,
    });
    delete this.#values.frame;
    this.#resizeSublayers(oldBounds, this.#bounds);
    this.#display();
    for (const child of this.#children) child.#display();
  }
  get bounds() {
    return this.#bounds;
  }
  get frame(): GFXRect {
    return normaliseRect({
      x: this.#position.x - this.#anchor.x * this.#bounds.width,
      y: this.#position.y - this.#anchor.y * this.#bounds.height,
      width: this.#bounds.width,
      height: this.#bounds.height,
    });
  }
  set frame(value: GFXRect) {
    this.#assertLive("frame", "set");
    const frame = normaliseRect(value);
    const previousFrame = this.frame;
    const previousBounds = this.#bounds;
    this.#applyImplicitAction("frame", previousFrame, frame, () => {
      this.#bounds = normaliseRect({
        ...this.#bounds,
        width: frame.width,
        height: frame.height,
      });
      this.#position = normalisePoint({
        x: frame.x + this.#anchor.x * frame.width,
        y: frame.y + this.#anchor.y * frame.height,
      });
      delete this.#values.frame;
      this.#resizeSublayers(previousBounds, this.#bounds);
      this.#display();
      for (const child of this.#children) child.#display();
    });
  }
  get zPosition() {
    return this.#zPosition;
  }
  set zPosition(value: number) {
    this.#assertLive("zPosition", "set");
    this.#zPosition = layerFinite(value, "zPosition");
    this.#display();
  }
  get anchorPointZ() {
    return this.#anchorPointZ;
  }
  set anchorPointZ(value: number) {
    this.#assertLive("anchorPointZ", "set");
    this.#anchorPointZ = layerFinite(value, "anchorPointZ");
    this.#display();
  }
  get sublayerTransform() {
    return this.#sublayerTransform;
  }
  set sublayerTransform(value: AFXTransform3D) {
    this.#assertLive("sublayerTransform", "set");
    if (!(value instanceof AFXTransform3D))
      throw new TypeError("Sublayer transform requires AFXTransform3D.");
    this.#applyImplicitAction(
      "sublayerTransform",
      this.#sublayerTransform.toCSS(),
      value.toCSS(),
      () => {
        this.#sublayerTransform = value;
        delete this.#values.sublayerTransform;
        for (const child of this.#children) child.#display();
      },
    );
  }
  #setStyle<K extends keyof AFXLayerStyle>(key: K, value: AFXLayerStyle[K]) {
    this.#assertLive(key, "set");
    this.#style = Object.freeze({ ...this.#style, [key]: value });
    this.#display();
  }
  get hidden() {
    return this.#style.hidden;
  }
  set hidden(value: boolean) {
    if (typeof value !== "boolean")
      throw new TypeError("Hidden must be boolean.");
    this.#setStyle("hidden", value);
  }
  get doubleSided() {
    return this.#style.doubleSided;
  }
  set doubleSided(value: boolean) {
    if (typeof value !== "boolean")
      throw new TypeError("Double-sided must be boolean.");
    this.#setStyle("doubleSided", value);
  }
  get allowsEdgeAntialiasing(): boolean { return this.#style.allowsEdgeAntialiasing; }
  set allowsEdgeAntialiasing(value: boolean) {
    if (typeof value !== 'boolean') throw new TypeError('Edge antialiasing must be boolean.');
    this.#setStyle('allowsEdgeAntialiasing', value);
  }
  get edgeAntialiasingMask(): number { return this.#style.edgeAntialiasingMask; }
  set edgeAntialiasingMask(value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 15)
      throw new RangeError('Edge antialiasing mask contains unsupported edges.');
    this.#setStyle('edgeAntialiasingMask', value);
  }
  get backgroundColour() {
    return this.#style.backgroundColour;
  }
  set backgroundColour(value: GFXColour | null) {
    const colour = layerColour(value);
    this.#applyImplicitAction(
      "backgroundColour",
      this.#style.backgroundColour?.toCSS() ?? "transparent",
      colour?.toCSS() ?? "transparent",
      () => {
        this.#style = Object.freeze({ ...this.#style, backgroundColour: colour });
        delete this.#values.backgroundColour;
        this.#display();
      },
    );
  }
  get borderColour() {
    return this.#style.borderColour;
  }
  set borderColour(value: GFXColour | null) {
    this.#setStyle("borderColour", layerColour(value));
  }
  get borderWidth() {
    return this.#style.borderWidth;
  }
  set borderWidth(value: number) {
    this.#setStyle("borderWidth", layerFinite(value, "border width", 0));
  }
  get cornerRadius() {
    return this.#style.cornerRadius;
  }
  set cornerRadius(value: number) {
    this.#setStyle("cornerRadius", layerFinite(value, "corner radius", 0));
  }
  get maskedCorners() {
    return this.#style.maskedCorners;
  }
  set maskedCorners(value: readonly AFXLayerCorner[]) {
    if (
      !Array.isArray(value) ||
      value.some(
        (corner) =>
          !["top-left", "top-right", "bottom-left", "bottom-right"].includes(
            corner,
          ),
      ) ||
      new Set(value).size !== value.length
    )
      throw new TypeError("Invalid masked corners.");
    this.#setStyle("maskedCorners", Object.freeze([...value]));
  }
  get shadowColour() {
    return this.#style.shadowColour;
  }
  set shadowColour(value: GFXColour | null) {
    this.#setStyle("shadowColour", layerColour(value));
  }
  get shadowOpacity() {
    return this.#style.shadowOpacity;
  }
  set shadowOpacity(value: number) {
    this.#setStyle("shadowOpacity", layerFinite(value, "shadow opacity", 0, 1));
  }
  get shadowRadius() {
    return this.#style.shadowRadius;
  }
  set shadowRadius(value: number) {
    this.#setStyle("shadowRadius", layerFinite(value, "shadow radius", 0));
  }
  get shadowOffset() {
    return this.#style.shadowOffset;
  }
  set shadowOffset(value: GFXPoint) {
    this.#setStyle("shadowOffset", normalisePoint(value));
  }
  set bounds(value: GFXRect) {
    this.#assertLive("bounds", "set");
    const previous = this.#bounds;
    this.#bounds = normaliseRect(value);
    delete this.#values.frame;
    this.#resizeSublayers(previous, this.#bounds);
    this.#display();
    for (const child of this.#children) child.#display();
  }
  get position() {
    return this.#position;
  }
  set position(value: GFXPoint) {
    this.#assertLive("position", "set");
    this.#position = normalisePoint(value);
    this.#display();
  }
  get anchorPoint() {
    return this.#anchor;
  }
  set anchorPoint(value: GFXPoint) {
    this.#assertLive("anchorPoint", "set");
    const next = normalisePoint(value);
    if (next.x < 0 || next.x > 1 || next.y < 0 || next.y > 1)
      throw new RangeError("Anchor point must be normalized.");
    this.#anchor = next;
    this.#display();
  }
  get opacity() {
    return this.#opacity;
  }
  set opacity(value: number) {
    this.#assertLive("opacity", "set");
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw new RangeError("Layer opacity must be between zero and one.");
    this.#applyImplicitAction("opacity", this.#opacity, value, () => {
      this.#opacity = value;
      delete this.#values.opacity;
      this.#display();
    });
  }
  get transform() {
    return this.#transform;
  }
  set transform(value: AFXTransform3D) {
    this.#assertLive("transform", "set");
    if (!(value instanceof AFXTransform3D))
      throw new TypeError("Layer transform requires AFXTransform3D.");
    this.#applyImplicitAction("transform", this.#transform.toCSS(), value.toCSS(), () => {
      this.#transform = value;
      delete this.#values.transform;
      this.#display();
    });
  }
  get clipsToBounds() {
    return this.#clip;
  }
  set clipsToBounds(value: boolean) {
    this.#assertLive("clipsToBounds", "set");
    if (typeof value !== "boolean")
      throw new TypeError("Clipping must be boolean.");
    this.#clip = value;
    this.#display();
  }
  get contents(): GFXImage | VFXFrame | IFXShader | null {
    return this.#content?.kind === "image" ? this.#content.image
      : this.#content?.kind === "video" ? this.#content.video
      : this.#content?.kind === 'shader' ? this.#content.shader : null;
  }
  set contents(value: GFXImage | VFXFrame | IFXShader | null) {
    this.#assertLive("contents", "set");
    if (value !== null && !(value instanceof GFXImage) && !(value instanceof VFXFrame) && !(value instanceof IFXShader))
      throw new TypeError('Layer contents require a GFXImage, VFXFrame or IFXShader.');
    if (value instanceof VFXFrame && value.closed)
      throw new DOMException("Layer contents require a live VFXFrame.", "InvalidStateError");
    this.setLayerContent("contents", value instanceof IFXShader ? Object.freeze({ kind: 'shader', shader: value }) : value instanceof VFXFrame
      ? Object.freeze({ kind: "video", video: value })
      : value ? Object.freeze({ kind: "image", image: value }) : null);
  }
  get filters(): readonly IFXShader[] { return this.#filters; }
  set filters(value: readonly IFXShader[]) {
    this.#assertLive("filters", "set");
    if (!Array.isArray(value) || value.length > 8 || !Array.from(value).every(shader => shader instanceof IFXShader))
      throw new TypeError('Layer filters require at most eight ImageFX shaders.');
    if (value.length && !this.#surface.supportsFilters)
      throw new DOMException('This layer surface does not support image filters.', 'NotSupportedError');
    const previous = this.#filters;
    this.#filters = Object.freeze([...value]);
    try { this.#display(); } catch (error) { this.#filters = previous; throw error; }
  }
  get compositingFilter(): IFXFilter<'blend'> | null { return this.#compositingFilter; }
  set compositingFilter(value: IFXFilter<'blend'> | null) {
    this.#assertLive("compositingFilter", "set");
    if (value !== null && (!(value instanceof IFXFilter) || value.name !== 'blend' ||
      (value.parameters.mode !== 'normal' && value.parameters.mode !== 'addition')))
      throw new DOMException('Unsupported layer compositing filter; use normal or addition blend.', 'NotSupportedError');
    if (value && !this.#surface.supportsFilters)
      throw new DOMException('This layer surface does not support compositing filters.', 'NotSupportedError');
    const previous = this.#compositingFilter;
    this.#compositingFilter = value;
    try { this.#display(); } catch (error) { this.#compositingFilter = previous; throw error; }
  }
  get contentsRect(): GFXRect {
    return this.#contentsRect;
  }
  set contentsRect(value: GFXRect) {
    this.#assertLive("contentsRect", "set");
    const next = contentsRect(value), previous = this.#contentsRect;
    this.#contentsRect = next;
    try {
      this.#display();
    } catch (error) {
      this.#contentsRect = previous;
      try { this.#display(); } catch {}
      throw error;
    }
  }
  get contentsCenter(): GFXRect {
    return this.#contentsCenter;
  }
  set contentsCenter(value: GFXRect) {
    this.#assertLive("contentsCenter", "set");
    const next = contentsCenter(value), previous = this.#contentsCenter;
    this.#contentsCenter = next;
    try {
      this.#display();
    } catch (error) {
      this.#contentsCenter = previous;
      try { this.#display(); } catch {}
      throw error;
    }
  }
  get contentsGravity(): AFXContentsGravity {
    return this.#contentsGravity;
  }
  set contentsGravity(value: AFXContentsGravity) {
    this.#assertLive("contentsGravity", "set");
    if (!contentsGravities.includes(value))
      throw new TypeError("Unsupported layer contents gravity.");
    const previous = this.#contentsGravity;
    this.#contentsGravity = value;
    try {
      this.#display();
    } catch (error) {
      this.#contentsGravity = previous;
      try { this.#display(); } catch {}
      throw error;
    }
  }
  get autoresizingMask(): readonly AFXAutoresizingMask[] {
    return this.#autoresizingMask;
  }
  set autoresizingMask(value: readonly AFXAutoresizingMask[]) {
    this.#assertLive("autoresizingMask", "set");
    if (!Array.isArray(value) || value.length > autoresizingValues.length)
      throw new TypeError("Layer autoresizingMask must be a bounded array.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const items = Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !autoresizingValues.includes(descriptor.value))
        throw new TypeError("Layer autoresizingMask contains an unsupported value.");
      return descriptor.value as AFXAutoresizingMask;
    });
    if (new Set(items).size !== items.length)
      throw new TypeError("Layer autoresizingMask cannot contain duplicates.");
    this.#autoresizingMask = Object.freeze(items);
  }
  get sublayers(): readonly AFXLayer[] {
    // Renderers walk every layer each frame; share one immutable list.
    return (this.#sublayerList ??= Object.freeze([...this.#children]));
  }
  get mask(): AFXLayer | null {
    return this.#mask;
  }
  get compositionCapability(): AFXLayerCompositionCapability {
    return this.#surface.compositionCapability?.() ?? Object.freeze({ state: "portable-owned" });
  }
  /** Render an owned layer subtree into an image at the current presentation time. */
  render(bounds: GFXRect, scale = 1, signal: AbortSignal = new AbortController().signal): Promise<GFXImage> {
    this.#assertLive("render", "call");
    const rect = normaliseRect(bounds);
    const snapshot = AFXCompositionSnapshot.capture(this, { bounds: rect, scale, time: this.#scheduler.now() });
    return snapshot.render({
      rect, pixelWidth: Math.round(rect.width * scale),
      pixelHeight: Math.round(rect.height * scale), scale,
    }, signal);
  }
  get superlayer(): AFXLayer | null {
    return this.#parent;
  }
  animationKeys(): readonly string[] {
    return Object.freeze([...this.#running.keys()]);
  }
  animationForKey(key: string): AFXAnimationHandle | null {
    return this.#running.get(key)?.handle ?? null;
  }
  protected setReplication(operation: string, replication: AFXReplication | null) {
    this.#assertLive(operation);
    if (replication && !this.#surface.supportsReplication)
      throw new Error("This surface does not support replication.");
    const previous = this.#replication;
    this.#replication = replication;
    try {
      this.#display();
    } catch (error) {
      this.#replication = previous;
      try {
        this.#display();
      } catch {}
      throw error;
    }
  }
  protected setLayerContent(operation: string, content: AFXLayerContent | null, modelAnimationKey?: string) {
    this.#assertLive(operation);
    if (content && !this.#surface.supportedContentKinds?.includes(content.kind))
      throw new Error(
        "This surface does not support the requested layer content.",
      );
    const previous = this.#content;
    const hadModelAnimationValue = modelAnimationKey !== undefined && Object.hasOwn(this.#values, modelAnimationKey);
    const previousModelAnimationValue = modelAnimationKey === undefined ? undefined : this.#values[modelAnimationKey];
    this.#content = content;
    if (modelAnimationKey !== undefined) delete this.#values[modelAnimationKey];
    try {
      this.#display();
    } catch (error) {
      this.#content = previous;
      if (modelAnimationKey !== undefined) {
        if (hadModelAnimationValue) this.#values[modelAnimationKey] = previousModelAnimationValue!;
        else delete this.#values[modelAnimationKey];
      }
      try {
        this.#display();
      } catch {}
      throw error;
    }
  }
  protected presentationContent(
    content: AFXLayerContent | null,
    _values: Readonly<Record<string, AFXAnimationScalar>>,
  ): AFXLayerContent | null {
    return content;
  }
  protected supportsContentAnimation(_keyPath: string): boolean {
    return false;
  }
  get model(): AFXLayerSnapshot {
    return this.#snapshot(false);
  }
  get presentation(): AFXPresentationLayer {
    return this.#snapshot(true);
  }
  /** Only this parent's sublayer geometry is inherited by a child surface. */
  #inheritedByChild(): AFXTransform3D {
    let frame: AFXAnimationScalar | undefined = this.#values.frame;
    let transform: AFXAnimationScalar | undefined = this.#values.sublayerTransform;
    for (const running of this.#running.values()) {
      if (running.property === "frame") frame = running.currentValue() ?? undefined;
      else if (running.property === "sublayerTransform") transform = running.currentValue() ?? undefined;
    }
    const bounds = frame && typeof frame === "object" && "width" in frame
      ? { width: Number(frame.width), height: Number(frame.height) }
      : this.#bounds;
    const sublayer = typeof transform === "string"
      ? this.#presentationTransform(transform, { ...this.#bounds, ...bounds }, "sublayerTransform")
      : this.#sublayerTransform;
    const cached = this.#inheritedGeometryCache;
    if (cached?.bounds === this.#bounds && cached.sublayer === sublayer) return cached.value;
    const value = AFXTransform3D.translation(-this.#bounds.x, -this.#bounds.y).multiply(sublayer);
    this.#inheritedGeometryCache = { bounds: this.#bounds, sublayer, value };
    return value;
  }
  #inheritedGeometryCache: {
    bounds: GFXRect; sublayer: AFXTransform3D; value: AFXTransform3D;
  } | null = null;
  readonly #identityInheritedTransform = new AFXTransform3D();
  #presentationTransform(
    css: string,
    bounds: GFXRect,
    kind: "transform" | "sublayerTransform",
  ): AFXTransform3D {
    const cache = kind === "transform"
      ? this.#presentationTransformCache
      : this.#presentationSublayerTransformCache;
    if (
      cache?.css === css &&
      cache.width === bounds.width &&
      cache.height === bounds.height
    )
      return cache.transform;
    const transform = AFXTransform3D.fromCSS(css, bounds);
    const next = Object.freeze({
      css,
      width: bounds.width,
      height: bounds.height,
      transform,
    });
    if (kind === "transform") this.#presentationTransformCache = next;
    else this.#presentationSublayerTransformCache = next;
    return transform;
  }
  /** Frozen copy of #values, rebuilt only when an entry differs. */
  #modelValues: Readonly<Record<string, AFXAnimationScalar>> = Object.freeze({});
  #modelValueCount = 0;
  #frozenModelValues(): Readonly<Record<string, AFXAnimationScalar>> {
    const values = this.#values, cached = this.#modelValues;
    let count = 0;
    for (const key in values) {
      count++;
      if (cached[key] !== values[key] || !Object.hasOwn(cached, key)) { count = -1; break; }
    }
    if (count === this.#modelValueCount) return cached;
    const next = Object.freeze({ ...values });
    this.#modelValues = next;
    this.#modelValueCount = Object.keys(next).length;
    return next;
  }
  #snapshot(presenting: boolean): AFXLayerSnapshot {
    // Snapshots are taken on every display (e.g. each video frame), so an
    // unanimated layer shares one frozen values object between them.
    let values: Record<string, AFXAnimationScalar>;
    if (presenting && this.#running.size) {
      values = { ...this.#values };
      for (const running of this.#running.values()) {
        const current = running.currentValue();
        if (current !== null) values[running.property] = current;
        else delete values[running.property];
      }
      Object.freeze(values);
    } else values = this.#frozenModelValues() as Record<string, AFXAnimationScalar>;
    const frame = values.frame;
    const bounds =
      frame && typeof frame === "object" && "width" in frame
        ? normaliseRect({
            ...this.#bounds,
            width: Number(frame.width),
            height: Number(frame.height),
          })
        : this.#bounds;
    const position =
      frame && typeof frame === "object" && "width" in frame
        ? normalisePoint({
            x: Number(frame.x) + this.#anchor.x * bounds.width,
            y: Number(frame.y) + this.#anchor.y * bounds.height,
          })
        : this.#position;
    const transform =
      typeof values.transform === "string"
        ? this.#presentationTransform(values.transform, bounds, "transform")
        : this.#transform;
    const sublayerTransform =
      typeof values.sublayerTransform === "string"
        ? this.#presentationTransform(
            values.sublayerTransform,
            bounds,
            "sublayerTransform",
          )
        : this.#sublayerTransform;
    return Object.freeze({
      content: this.presentationContent(this.#content, values),
      filters: this.#filters,
      compositingFilter: this.#compositingFilter,
      replication: this.#replication,
      bounds,
      position,
      anchorPoint: this.#anchor,
      opacity:
        typeof values.opacity === "number" ? values.opacity : this.#opacity,
      transform,
      clipsToBounds: this.#clip,
      contentsRect: this.#contentsRect,
      contentsCenter: this.#contentsCenter,
      contentsGravity: this.#contentsGravity,
      autoresizingMask: this.#autoresizingMask,
      values,
      style: this.#style,
      zPosition: this.#zPosition,
      anchorPointZ: this.#anchorPointZ,
      sublayerTransform,
      inheritedTransform: this.#parent
        ? this.#parent.#inheritedByChild()
        : this.#identityInheritedTransform,
    });
  }
  #display() {
    if (this.#disposed) return;
    if (captureAFXTransactionDisplay(this, () => this.#display())) return;
    this.#displayDirty = false;
    try {
      this.delegate?.willDisplay?.(this);
    } catch {
      /* Delegate failures cannot suppress host projection. */
    }
    const presentationTime = this.#scheduler.now();
    if (!Number.isFinite(presentationTime))
      throw new RangeError("Layer presentation clock must be finite.");
    this.#surface.apply(this.presentation, presentationTime);
    try {
      this.delegate?.didDisplay?.(this);
    } catch {
      /* Delegate failures cannot retain lifecycle resources. */
    }
  }
  #scheduleInvalidation() {
    if (this.#cancelInvalidation) return;
    this.#cancelInvalidation = this.#scheduler.requestFrame(() => {
      this.#cancelInvalidation = null;
      if (this.#disposed) return;
      this.layoutIfNeeded();
      this.displayIfNeeded();
    });
  }
  setNeedsDisplay(rect?: GFXRect) {
    this.#assertLive("setNeedsDisplay", "call");
    if (rect) normaliseRect(rect);
    this.#displayDirty = true;
    this.#scheduleInvalidation();
  }
  needsDisplay() {
    return this.#displayDirty;
  }
  displayIfNeeded() {
    this.#assertLive("displayIfNeeded", "call");
    if (this.#displayDirty) this.#display();
  }
  display() {
    this.#assertLive("display", "call");
    this.#display();
  }
  setNeedsLayout() {
    this.#assertLive("setNeedsLayout", "call");
    this.#layoutDirty = true;
    this.#scheduleInvalidation();
  }
  needsLayout() {
    return this.#layoutDirty;
  }
  layoutIfNeeded() {
    this.#assertLive("layoutIfNeeded", "call");
    if (this.#layoutDirty) this.layoutSublayers();
    for (const child of this.#children) child.layoutIfNeeded();
  }
  layoutSublayers() {
    this.#assertLive("layoutSublayers", "call");
    if (this.#layoutActive)
      throw new Error("Layer layout cannot recursively enter itself.");
    this.#layoutDirty = false;
    this.#layoutActive = true;
    try {
      this.delegate?.layoutSublayers?.(this);
    } finally {
      this.#layoutActive = false;
    }
  }
  addSublayer(
    child: AFXLayer,
    options: AFXSublayerInsertionOptions = {},
  ) {
    this.#assertLive("addSublayer", "call");
    this.insertSublayer(child, this.#children.length, options);
  }
  #displayAnimationUpdate() {
    if (this.#animationFrameBatch) {
      this.#animationFrameDisplayPending = true;
      return;
    }
    this.#display();
  }
  #cancelAnimationFrameIfIdle() {
    if ([...this.#running.values()].some((running) => running.needsFrame())) return;
    this.#cancelAnimationFrame?.();
    this.#cancelAnimationFrame = null;
  }
  #scheduleAnimationFrame() {
    if (this.#cancelAnimationFrame || ![...this.#running.values()].some((running) => running.needsFrame())) return;
    this.#cancelAnimationFrame = this.#scheduler.requestFrame((timestamp) => {
      this.#cancelAnimationFrame = null;
      const active = [...this.#running.values()].filter((running) => running.needsFrame());
      this.#animationFrameBatch = true;
      this.#animationFrameDisplayPending = false;
      try {
        for (const running of active) running.update(timestamp);
      } finally {
        this.#animationFrameBatch = false;
      }
      if (this.#animationFrameDisplayPending && !this.#disposed) {
        this.#animationFrameDisplayPending = false;
        try {
          this.#display();
        } catch {
          for (const running of active)
            if (running.needsFrame()) running.finish("failed");
        }
      }
      this.#scheduleAnimationFrame();
    });
  }
  insertSublayer(
    child: AFXLayer,
    index: number,
    options: AFXSublayerInsertionOptions = {},
  ) {
    this.#assertLive("insertSublayer", "call");
    child.#assertLive("insertSublayer", "call");
    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      (options.preservePresentation !== undefined &&
        typeof options.preservePresentation !== "boolean")
    )
      throw new TypeError("Invalid sublayer insertion options.");
    if (child.#maskOwner)
      throw new Error("A mask cannot also become a sublayer.");
    if (child.#reaches(this)) throw new Error("Layer composition cycle.");
    if (!Number.isInteger(index) || index < 0 || index > this.#children.length)
      throw new RangeError("Invalid sublayer index.");
    for (
      let ancestor: AFXLayer | null = this;
      ancestor;
      ancestor = ancestor.#parent
    )
      if (ancestor === child) throw new Error("Layer projection cycle.");
    if (child === this.#mask)
      throw new Error("A mask cannot also be a sublayer.");
    let preserved:
      | Readonly<{
          bounds: GFXRect;
          position: GFXPoint;
          zPosition: number;
          transform: AFXTransform3D;
        }>
      | null = null;
    if (options.preservePresentation && child.#parent !== this) {
      const snapshot = child.presentation;
      const targetSnapshot = this.presentation;
      const world = child.#presentationWorldTransform(snapshot);
      const targetParent = this
        .#presentationWorldTransform(targetSnapshot)
        .multiply(targetSnapshot.sublayerTransform);
      const local = targetParent.inverse().multiply(world);
      const anchor = {
        x: snapshot.bounds.x + snapshot.anchorPoint.x * snapshot.bounds.width,
        y: snapshot.bounds.y + snapshot.anchorPoint.y * snapshot.bounds.height,
        z: snapshot.anchorPointZ,
      };
      const projectedAnchor = local.transformPoint(anchor);
      const position = normalisePoint({
        x: projectedAnchor.x,
        y: projectedAnchor.y,
      });
      const zPosition = layerFinite(projectedAnchor.z, "zPosition");
      const transform = AFXTransform3D.translation(
        -position.x,
        -position.y,
        -zPosition,
      )
        .multiply(local)
        .multiply(AFXTransform3D.translation(anchor.x, anchor.y, anchor.z));
      preserved = Object.freeze({
        bounds: snapshot.bounds,
        position,
        zPosition,
        transform,
      });
    }
    const finalIndex = Math.min(
      index,
      this.#children.length - (child.#parent === this ? 1 : 0),
    );
    this.#surface.attach(child.#surface, finalIndex);
    if (child.#parent) {
      const siblings = child.#parent.#children;
      siblings.splice(siblings.indexOf(child), 1);
      child.#parent.#sublayerList = null;
    }
    child.#parent = this;
    this.#children.splice(finalIndex, 0, child);
    this.#sublayerList = null;
    if (preserved) {
      const previousBounds = child.#bounds;
      for (const running of [...child.#running.values()])
        if (running.property === "frame" || running.property === "transform")
          running.finish("interrupted");
      child.#bounds = normaliseRect(preserved.bounds);
      child.#position = preserved.position;
      child.#zPosition = preserved.zPosition;
      child.#transform = preserved.transform;
      delete child.#values.frame;
      delete child.#values.transform;
      child.#resizeSublayers(previousBounds, child.#bounds);
    }
    child.#display();
    if (preserved)
      for (const grandchild of child.#children) grandchild.#display();
  }
  replaceSublayer(previous: AFXLayer, next: AFXLayer) {
    this.#assertLive("replaceSublayer", "call");
    const index = this.#children.indexOf(previous);
    if (index < 0) throw new Error("The replaced layer is not a child.");
    if (previous === next) return;
    this.insertSublayer(next, index);
    previous.removeFromSuperlayer();
  }
  removeFromSuperlayer() {
    this.#assertLive("removeFromSuperlayer", "call");
    if (!this.#parent) return;
    this.#parent.#surface.detach(this.#surface);
    const siblings = this.#parent.#children;
    siblings.splice(siblings.indexOf(this), 1);
    this.#parent.#sublayerList = null;
    this.#parent = null;
    this.#display();
  }
  #reaches(target: AFXLayer, visited = new Set<AFXLayer>()): boolean {
    if (this === target) return true;
    if (visited.has(this)) return false;
    if (visited.size >= 256)
      throw new RangeError("Layer composition exceeds256 nodes.");
    visited.add(this);
    return (
      !!(this.#mask && this.#mask.#reaches(target, visited)) ||
      this.#children.some((child) => child.#reaches(target, visited))
    );
  }
  setMask(mask: AFXLayer | null) {
    this.#assertLive("setMask", "call");
    if (mask) {
      mask.#assertLive("setMask", "call");
      if (
        mask.#parent ||
        (mask.#maskOwner && mask.#maskOwner !== this) ||
        mask.#reaches(this)
      )
        throw new Error("Mask must be an independent acyclic projection.");
    }
    this.#surface.setMask(mask ? mask.#surface : null);
    if (this.#mask) this.#mask.#maskOwner = null;
    this.#mask = mask;
    if (mask) mask.#maskOwner = this;
  }
  #worldTransform(): AFXTransform3D {
    const local = AFXTransform3D.translation(
      this.#position.x,
      this.#position.y,
      this.#zPosition,
    )
      .multiply(this.#transform)
      .multiply(
        AFXTransform3D.translation(
          -this.#anchor.x * this.#bounds.width - this.#bounds.x,
          -this.#anchor.y * this.#bounds.height - this.#bounds.y,
          -this.#anchorPointZ,
        ),
      );
    return this.#parent
      ? this.#parent
          .#worldTransform()
          .multiply(this.#parent.#sublayerTransform)
          .multiply(local)
      : local;
  }
  #presentationWorldTransform(
    snapshot: AFXLayerSnapshot = this.presentation,
  ): AFXTransform3D {
    const local = AFXTransform3D.translation(
      snapshot.position.x,
      snapshot.position.y,
      snapshot.zPosition,
    )
      .multiply(snapshot.transform)
      .multiply(AFXTransform3D.translation(
        -snapshot.anchorPoint.x * snapshot.bounds.width - snapshot.bounds.x,
        -snapshot.anchorPoint.y * snapshot.bounds.height - snapshot.bounds.y,
        -snapshot.anchorPointZ,
      ));
    return this.#parent
      ? this.#parent.#presentationWorldTransform()
          .multiply(this.#parent.presentation.sublayerTransform)
          .multiply(local)
      : local;
  }
  convertPoint(point: AFXPoint3D, to: AFXLayer | null): AFXPoint3D {
    this.#assertLive("convertPoint", "call");
    if (to) to.#assertLive("convertPoint", "call");
    const world = this.#worldTransform().transformPoint(point);
    return to ? to.#worldTransform().inverse().transformPoint(world) : world;
  }
  convertRect(rect: GFXRect, to: AFXLayer | null): GFXRect {
    this.#assertLive("convertRect", "call");
    const r = normaliseRect(rect);
    const points = [
      { x: r.x, y: r.y, z: 0 },
      { x: r.x + r.width, y: r.y, z: 0 },
      { x: r.x, y: r.y + r.height, z: 0 },
      { x: r.x + r.width, y: r.y + r.height, z: 0 },
    ].map((point) => this.convertPoint(point, to));
    const x = Math.min(...points.map((point) => point.x)),
      y = Math.min(...points.map((point) => point.y));
    return normaliseRect({
      x,
      y,
      width: Math.max(...points.map((point) => point.x)) - x,
      height: Math.max(...points.map((point) => point.y)) - y,
    });
  }
  contains(point: GFXPoint): boolean {
    const p = normalisePoint(point),
      b = this.#bounds;
    return (
      p.x >= b.x && p.y >= b.y && p.x <= b.x + b.width && p.y <= b.y + b.height
    );
  }
  /** Model-space hit test; the point is expressed in this layer's superlayer coordinates. */
  hitTest(point: GFXPoint): AFXLayer | null {
    this.#assertLive("hitTest", "call");
    if (this.hidden) return null;
    const p = normalisePoint(point);
    const world = this.#parent
      ? this.#parent.#worldTransform().transformPoint({ ...p, z: 0 })
      : { ...p, z: 0 };
    const local = this.#worldTransform().inverse().transformPoint(world);
    if (this.clipsToBounds && !this.contains(local)) return null;
    const children = this.#children
      .map((layer, index) => ({ layer, index }))
      .sort(
        (a, b) => b.layer.zPosition - a.layer.zPosition || b.index - a.index,
      );
    for (const { layer } of children) {
      const hit = layer.hitTest(local);
      if (hit) return hit;
    }
    return this.contains(local) ? this : null;
  }
  /** Picks the displayed presentation tree while animations are in flight. */
  presentationHitTest(point: GFXPoint): AFXLayer | null {
    this.#assertLive("presentationHitTest", "call");
    const p = normalisePoint(point);
    const world = this.#parent
      ? this.#parent.#presentationWorldTransform().transformPoint({ ...p, z: 0 })
      : { ...p, z: 0 };
    return this.#presentationHitAtWorld(world.x, world.y)?.layer ?? null;
  }

  #presentationHitAtWorld(x: number, y: number): { layer: AFXLayer; depth: number } | null {
    if (this.hidden) return null;
    const snapshot = this.presentation;
    if (snapshot.opacity <= 0) return null;
    // Invert the projected local z=0 plane, not a world z=0 point. Rotated
    // layers otherwise claim positions outside their displayed silhouette.
    const m = this.#presentationWorldTransform().values;
    const a = m[0] - x * m[3], b = m[4] - x * m[7];
    const c = m[1] - y * m[3], d = m[5] - y * m[7];
    const determinant = a * d - b * c;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
    const ex = x * m[15] - m[12], ey = y * m[15] - m[13];
    const lx = (ex * d - b * ey) / determinant;
    const ly = (a * ey - ex * c) / determinant;
    const w = m[3] * lx + m[7] * ly + m[15];
    if (!Number.isFinite(w) || w <= 0) return null;
    const depth = (m[2] * lx + m[6] * ly + m[14]) / w;
    const contains = lx >= snapshot.bounds.x && ly >= snapshot.bounds.y &&
      lx <= snapshot.bounds.x + snapshot.bounds.width &&
      ly <= snapshot.bounds.y + snapshot.bounds.height;
    if (snapshot.clipsToBounds && !contains) return null;
    let result: { layer: AFXLayer; depth: number } | null = null;
    for (let index = this.#children.length - 1; index >= 0; index--) {
      const hit = this.#children[index].#presentationHitAtWorld(x, y);
      if (hit && (!result || hit.depth > result.depth + 1e-9)) result = hit;
    }
    return result && (!contains || result.depth >= depth - 1e-9)
      ? result : contains ? { layer: this, depth } : null;
  }
  addAnimation(
    input: AFXSampledAnimation,
    key?: string,
  ): AFXAnimationHandle {
    this.#assertLive("addAnimation", "call");
    const declaredKeyPath = input.keyPath;
    key ??= declaredKeyPath;
    const contentAnimation = declaredKeyPath === "path" || declaredKeyPath === "gradient";
    const declaredTargetId = contentAnimation ? input.targetId : "";
    if (contentAnimation && !this.supportsContentAnimation(declaredKeyPath))
      throw new Error(`Unsupported layer property: ${declaredKeyPath}.`);
    if (!contentAnimation && !this.#surface.supportedProperties.includes(declaredKeyPath))
      throw new Error(`Unsupported layer property: ${declaredKeyPath}.`);
    const start = this.#scheduler.now();
    if (!Number.isFinite(start))
      throw new RangeError("Frame clock must be finite seconds.");
    const previous = [...this.#running.values()].find(
        (x) => x.property === declaredKeyPath,
      ),
      visible = previous?.currentValue();
    const declaredRetarget = visible !== null && visible !== undefined
      ? input.retarget
      : undefined;
    if (visible !== null && visible !== undefined && !declaredRetarget)
      throw new TypeError(
        "This animation cannot retarget an active presentation.",
      );
    const candidate = visible !== null && visible !== undefined
      ? declaredRetarget!.call(input, visible)
      : input;
    const animation = contentAnimation
      ? snapshotContentAnimation(candidate, declaredKeyPath, declaredTargetId)
      : candidate;
    this.#assertLive("addAnimation", "call");
    const duration = animation.animation.totalDuration;
    const terminal =
      animation.sample(duration) ?? animation.toRuntime().animations[0].to;
    this.#assertLive("addAnimation", "call");
    const initial = animation.sample(0);
    this.#assertLive("addAnimation", "call");
    if (declaredKeyPath === "transform" || declaredKeyPath === "sublayerTransform") {
      const definition = animation.toRuntime();
      for (const property of definition.animations)
        for (const value of [
          property.from,
          property.to,
          ...(property.keyframes?.map((frame) => frame.value) ?? []),
        ]) {
          if (typeof value !== "string")
            throw new TypeError(
              "A transform animation requires CSS matrix/transform strings.",
            );
          AFXTransform3D.fromCSS(value, this.#bounds);
        }
    }
    if (
      declaredKeyPath === "opacity" &&
      (typeof terminal !== "number" || terminal < 0 || terminal > 1)
    )
      throw new RangeError("Animated opacity must end between zero and one.");
    previous?.finish("interrupted");
    this.#running.get(key)?.finish("interrupted");
    this.#values[declaredKeyPath] = terminal;
    let elapsed = 0,
      last = start,
      state: AFXAnimationHandle["state"] = "running",
      resolve!: (value: AFXAnimationSettlement) => void;
    const finished = new Promise<AFXAnimationSettlement>((done) => {
      resolve = done;
    });
    const running: Running = {
      property: declaredKeyPath,
      value: initial,
      compositor: null,
      needsFrame: () => state === "running" && !running.compositor,
      currentValue: () => {
        const time = running.compositor?.currentTimeSeconds;
        if (time !== null && time !== undefined && (state === "running" || state === "paused")) {
          elapsed = Math.min(duration, Math.max(0, time));
          running.value = animation.sample(elapsed);
        }
        return running.value;
      },
      cancelFrame: () => {},
      handle: null!,
      finish: (result) => {
        if (state !== "running" && state !== "paused") return;
        if (result !== "completed") running.currentValue();
        state = result;
        try {
          running.cancelFrame();
        } catch {
          /* Release remains terminal if a host scheduler fails. */
        }
        running.compositor?.cancel();
        running.compositor = null;
        this.#running.delete(key);
        if (result !== "completed" && running.value !== null)
          this.#values[declaredKeyPath] = running.value;
        if (
          declaredKeyPath === "opacity" &&
          typeof this.#values.opacity === "number"
        )
          this.#opacity = this.#values.opacity;
        try {
          this.#displayAnimationUpdate();
        } catch {
          state = "failed";
        }
        resolve(
          Object.freeze({
            state: state as AFXAnimationSettlement["state"],
            reduced: this.#scheduler.reducedMotion || this.#scheduler.suspended,
          }),
        );
      },
      update: (timestamp) => {
        if (state !== "running") return;
        if (!Number.isFinite(timestamp) || timestamp < last) {
          running.finish("failed");
          return;
        }
        elapsed = Math.min(duration, elapsed + timestamp - last);
        if (duration - elapsed < 1e-9) elapsed = duration;
        last = timestamp;
        let sampled: AFXAnimationScalar | null;
        try {
          sampled = animation.sample(elapsed);
        } catch {
          running.finish("failed");
          return;
        }
        if (state !== "running") return;
        const previousValue = running.value;
        running.value = sampled;
        if (declaredKeyPath === "opacity" && typeof running.value === "number")
          running.value = Math.max(0, Math.min(1, running.value));
        try {
          // Time and settlement still advance through a hold or delay. An
          // unchanged scalar/immutable sample does not dirty the layer surface.
          if (!Object.is(previousValue, running.value)) this.#displayAnimationUpdate();
        } catch {
          running.finish("failed");
          return;
        }
        if (elapsed >= duration) running.finish("completed");
      },
    };
    const handle: AFXAnimationHandle = Object.freeze({
      id: `afx-layer:${++nextLayerAnimation}`,
      finished,
      get state() {
        return state;
      },
      get progress() {
        running.currentValue();
        return duration === 0 ? 1 : elapsed / duration;
      },
      cancel: () => running.finish("cancelled"),
      pause: () => {
        if (state !== "running") return;
        if (running.compositor) {
          running.compositor.pause();
          running.currentValue();
          state = "paused";
          return;
        }
        running.cancelFrame();
        running.update(this.#scheduler.now());
        if (state === "running") {
          state = "paused";
          running.cancelFrame();
        }
      },
      resume: () => {
        if (state !== "paused") return;
        state = "running";
        if (running.compositor) {
          running.compositor.resume();
          return;
        }
        last = this.#scheduler.now();
        this.#scheduleAnimationFrame();
      },
      seek: (seconds: number) => {
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > duration)
          throw new RangeError("Seek is outside the animation interval.");
        if (state !== "running" && state !== "paused") return;
        if (running.compositor) {
          running.compositor.seek(seconds);
          running.currentValue();
          this.#display();
          return;
        }
        elapsed = seconds;
        last = this.#scheduler.now();
        let sampled: AFXAnimationScalar | null;
        try {
          sampled = animation.sample(elapsed);
        } catch (error) {
          running.finish("failed");
          throw error;
        }
        if (state !== "running" && state !== "paused") return;
        running.value = sampled;
        if (declaredKeyPath === "opacity" && typeof running.value === "number")
          running.value = Math.max(0, Math.min(1, running.value));
        this.#display();
      },
    });
    running.handle = handle;
    this.#running.set(key, running);
    try {
      this.#display();
    } catch {
      running.finish("failed");
      return handle;
    }
    if (
      duration === 0 ||
      this.#scheduler.reducedMotion ||
      this.#scheduler.suspended
    )
      running.finish("completed");
    else {
      const basic = animation instanceof AFXBasicAnimation ? animation : null;
      const definition = basic?.animation;
      const eligible =
        !!definition &&
        (declaredKeyPath === "opacity" || declaredKeyPath === "transform") &&
        definition.iterations === 1 &&
        definition.speed === 1 &&
        !definition.autoreverses &&
        definition.fill === "forwards" &&
        (typeof definition.timing === "string" || definition.timing.kind === "cubic-bezier") &&
        !this.#running.has("frame");
      if (eligible) {
        const timing = definition!.timing;
        const easing = typeof timing === "string"
          ? timing
          : timing.kind === "cubic-bezier"
            ? `cubic-bezier(${timing.x1},${timing.y1},${timing.x2},${timing.y2})`
            : "linear";
        running.compositor = this.#surface.startCompositorAnimation?.({
          property: declaredKeyPath,
          from: basic!.from as number | string,
          to: basic!.to as number | string,
          duration: definition!.cycleDuration,
          delay: definition!.delay,
          easing,
        }) ?? null;
      }
      if (running.compositor) {
        const playback = running.compositor;
        const releaseFinish = playback.onFinish(() => running.finish("completed"));
        const releaseUnsupported = playback.onUnsupported?.(() => {
          if (running.compositor !== playback || (state !== "running" && state !== "paused")) return;
          running.currentValue();
          running.cancelFrame();
          running.compositor = null;
          last = this.#scheduler.now();
          running.cancelFrame = () => this.#cancelAnimationFrameIfIdle();
          if (state === "running") this.#scheduleAnimationFrame();
        }) ?? (() => {});
        running.cancelFrame = () => { releaseFinish(); releaseUnsupported(); };
      } else {
        running.cancelFrame = () => this.#cancelAnimationFrameIfIdle();
        this.#scheduleAnimationFrame();
      }
    }
    return handle;
  }
  removeAnimation(key: string) {
    this.#running.get(key)?.finish("cancelled");
  }
  removeAllAnimations() {
    for (const running of [...this.#running.values()])
      running.finish("cancelled");
  }
  dispose() {
    if (this.#disposed) return;
    this.#lifecycle.markDisposed(this.#signal?.aborted ? synCloudOSLifecycleSignalReason(this.#signal) : "explicit");
    this.#cancelInvalidation?.();
    this.#cancelInvalidation = null;
    this.removeAllAnimations();
    try {
      this.removeFromSuperlayer();
    } catch {
      /* Continue independent teardown. */
    }
    for (const child of [...this.#children]) {
      try {
        child.dispose();
      } catch {
        /* Continue independent teardown. */
      }
    }
    try {
      this.#surface.setMask(null);
    } catch {
      /* Continue independent teardown. */
    }
    if (this.#mask) this.#mask.#maskOwner = null;
    this.#mask = null;
    this.#maskOwner?.setMask(null);
    this.#maskOwner = null;
    this.#disposed = true;
    this.#signal?.removeEventListener("abort", this.#abort);
    try {
      this.#unsubscribe();
    } finally {
      this.#surface.dispose();
    }
  }
}
