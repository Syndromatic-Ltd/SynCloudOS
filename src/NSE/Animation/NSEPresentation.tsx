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
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Key,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  AFXAnimationDefinition,
  AFXAnimationHandle,
  AFXAnimationScalar,
  AFXAnimationTiming,
  AFXPropertyAnimation,
} from "../../FX/AnimationFX/animationTypes";
import { AFXTimingFunction } from "../../FX/AnimationFX/AFXTimingFunction";
import { useNSEAnimationEnvironment, type NSEAnimator } from "./NSEAnimationEnvironment";

/** Transform components, composed as translate, scale, rotate, rotateX, rotateY
 * (the order Framer Motion and the shell's CSS use). Angles are in degrees. */
export interface NSETransformComponents {
  readonly x?: number;
  readonly y?: number;
  /** Depth translation in pixels. */
  readonly z?: number;
  readonly scale?: number;
  readonly rotate?: number;
  readonly rotateX?: number;
  readonly rotateY?: number;
}

/** CSS filter components, like CALayer.filters. */
export interface NSEFilterComponents {
  readonly brightness?: number;
  readonly saturate?: number;
}

interface NSEKeyframes {
  readonly keyTimes?: readonly number[];
  /** One timing function per segment, like CAKeyframeAnimation.timingFunctions;
   * without it the spec's `timing` eases every segment. */
  readonly timingFunctions?: readonly AFXAnimationTiming[];
}

export type NSETransformComponentKeyPath = `transform.${keyof NSETransformComponents}`;

/** One animated property. The spec's `timing` applies to every segment
 * between keyframes, not to the whole track.
 *
 * Like Core Animation's `transform.rotation.z` or `transform.scale`, a
 * `transform.<component>` track animates one component with its own
 * keyframes; a spec's component tracks compose into the element's one
 * transform (a spec uses either those or a whole `transform` track). */
export type NSEPresentationTrack =
  | Readonly<NSEKeyframes & { keyPath: "opacity"; values: readonly number[] }>
  | Readonly<NSEKeyframes & {
      keyPath: "transform";
      values: readonly NSETransformComponents[];
      /** The unit of `x` and `y`: `%` of the view's own size (as a push
       * navigation slides a pane), or viewport widths or heights. */
      unit?: NSETranslationUnit;
    }>
  | Readonly<NSEKeyframes & { keyPath: NSETransformComponentKeyPath; values: readonly number[] }>
  | Readonly<NSEKeyframes & { keyPath: "filter"; values: readonly NSEFilterComponents[] }>
  /** Pixels, or `auto` for the element's natural height, measured when the
   * presentation starts (a disclosure growing to fit its content). */
  | Readonly<NSEKeyframes & { keyPath: "height"; values: readonly (number | "auto")[] }>;

export type NSETranslationUnit = "px" | "%" | "vw" | "vh";

export interface NSEPresentationSpec {
  readonly duration: number;
  /** Seconds before the presentation starts; the first keyframe shows meanwhile. */
  readonly delay?: number;
  readonly timing: AFXAnimationTiming;
  readonly tracks: readonly NSEPresentationTrack[];
}

type PresentedKeyPath = "opacity" | "transform" | "filter" | "height";

/** Element geometry a presentation resolves `auto` values against. */
export interface NSEPresentationLayout {
  /** The element's natural height in CSS pixels, for the box its `height` sizes. */
  readonly height?: number;
}

/** Keyframe offsets used when a multi-segment track is sampled. */
const sampledOffsets = Object.freeze(Array.from({ length: 61 }, (_, index) => index / 60));

type TransformPart = "z" | "rotate" | "rotateX" | "rotateY";
const optionalTransformParts: readonly TransformPart[] = ["z", "rotate", "rotateX", "rotateY"];
type ResolvedTransform = Required<NSETransformComponents>;

function resolvedTransform(value: NSETransformComponents): ResolvedTransform {
  return {
    x: value.x ?? 0, y: value.y ?? 0, z: value.z ?? 0, scale: value.scale ?? 1,
    rotate: value.rotate ?? 0, rotateX: value.rotateX ?? 0, rotateY: value.rotateY ?? 0,
  };
}

function isIdentityTransform(value: ResolvedTransform): boolean {
  return value.x === 0 && value.y === 0 && value.z === 0 && value.scale === 1 &&
    value.rotate === 0 && value.rotateX === 0 && value.rotateY === 0;
}

/** Writes transform components as CSS. `parts` names the optional functions to
 * write, so every keyframe of a track shares one function list and the browser
 * interpolates each function rather than a decomposed matrix. Identity is
 * `none`, so a held or directly applied terminal value never leaves a stacking
 * context or fixed-position containing block behind. */
function transformCSS(value: ResolvedTransform, unit: NSETranslationUnit,
  parts: ReadonlySet<TransformPart>): string {
  if (isIdentityTransform(value)) return "none";
  let text = parts.has("z")
    ? `translate3d(${value.x}${unit}, ${value.y}${unit}, ${value.z}px)`
    : `translate(${value.x}${unit}, ${value.y}${unit})`;
  text += ` scale(${value.scale})`;
  if (parts.has("rotate")) text += ` rotate(${value.rotate}deg)`;
  if (parts.has("rotateX")) text += ` rotateX(${value.rotateX}deg)`;
  if (parts.has("rotateY")) text += ` rotateY(${value.rotateY}deg)`;
  return text;
}

function transformParts(values: readonly NSETransformComponents[]): ReadonlySet<TransformPart> {
  const parts = new Set<TransformPart>();
  for (const value of values) for (const part of optionalTransformParts) if ((value[part] ?? 0) !== 0) parts.add(part);
  return parts;
}

type ResolvedFilter = Required<NSEFilterComponents>;
type FilterPart = keyof NSEFilterComponents;

function filterCSS(value: ResolvedFilter, parts: ReadonlySet<FilterPart>): string {
  const text: string[] = [];
  if (parts.has("brightness")) text.push(`brightness(${value.brightness})`);
  if (parts.has("saturate")) text.push(`saturate(${value.saturate})`);
  return text.length === 0 || (value.brightness === 1 && value.saturate === 1) ? "none" : text.join(" ");
}

function filterParts(values: readonly NSEFilterComponents[]): ReadonlySet<FilterPart> {
  const parts = new Set<FilterPart>();
  for (const value of values) {
    if (value.brightness !== undefined) parts.add("brightness");
    if (value.saturate !== undefined) parts.add("saturate");
  }
  return parts;
}

/** The CSS a transform model value is written as, identical to the text a
 * presentation ends on, so a view's style and its presentation agree. */
export function nseTransformStyle(value: NSETransformComponents, unit: NSETranslationUnit = "px"): string {
  return transformCSS(resolvedTransform(value), unit, transformParts([value]));
}

/** The CSS a filter model value is written as. */
export function nseFilterStyle(value: NSEFilterComponents): string {
  return filterCSS({ brightness: value.brightness ?? 1, saturate: value.saturate ?? 1 }, filterParts([value]));
}

function keyTimesFor(track: NSEPresentationTrack): readonly number[] {
  const count = track.values.length;
  if (count < 2) throw new RangeError("A presentation track needs at least two values.");
  const times = track.keyTimes ?? Array.from({ length: count }, (_, index) => index / (count - 1));
  if (times.length !== count || times[0] !== 0 || times[count - 1] !== 1 || times.some((time, index) => index > 0 && time <= times[index - 1]!))
    throw new RangeError("Presentation key times must strictly increase from zero to one.");
  if (track.timingFunctions && track.timingFunctions.length !== count - 1)
    throw new RangeError("A presentation track needs one timing function per segment.");
  return times;
}

type WholeTrack = Exclude<NSEPresentationTrack, { keyPath: NSETransformComponentKeyPath }>;
type ComponentTrack = Extract<NSEPresentationTrack, { keyPath: NSETransformComponentKeyPath }>;
const isComponentTrack = (track: NSEPresentationTrack): track is ComponentTrack => track.keyPath.startsWith("transform.");
const componentOf = (track: ComponentTrack) => track.keyPath.slice("transform.".length) as keyof NSETransformComponents;
const mix = (from: number, to: number, eased: number) => from + (to - from) * eased;

/** Writes a track's values as CSS, sharing one function list across them. */
function trackWriter(track: WholeTrack, layout: NSEPresentationLayout): (index: number, next?: number, eased?: number) => AFXAnimationScalar {
  if (track.keyPath === "height") {
    const values = track.values.map((value) => {
      if (value !== "auto") return value;
      if (layout.height === undefined) throw new TypeError("An auto height presentation needs the element's measured height.");
      return layout.height;
    });
    return (index, next = index, eased = 0) => `${Math.max(0, mix(values[index]!, values[next]!, eased))}px`;
  }
  if (track.keyPath === "opacity") {
    return (index, next = index, eased = 0) => Math.min(1, Math.max(0, mix(track.values[index]!, track.values[next]!, eased)));
  }
  if (track.keyPath === "transform") {
    const parts = transformParts(track.values), unit = track.unit ?? "px";
    const values = track.values.map(resolvedTransform);
    return (index, next = index, eased = 0) => {
      const from = values[index]!, to = values[next]!;
      return transformCSS({
        x: mix(from.x, to.x, eased), y: mix(from.y, to.y, eased), z: mix(from.z, to.z, eased),
        scale: mix(from.scale, to.scale, eased), rotate: mix(from.rotate, to.rotate, eased),
        rotateX: mix(from.rotateX, to.rotateX, eased), rotateY: mix(from.rotateY, to.rotateY, eased),
      }, unit, parts);
    };
  }
  const parts = filterParts(track.values);
  const values = track.values.map((value) => ({ brightness: value.brightness ?? 1, saturate: value.saturate ?? 1 }));
  return (index, next = index, eased = 0) => {
    const from = values[index]!, to = values[next]!;
    return filterCSS({ brightness: mix(from.brightness, to.brightness, eased), saturate: mix(from.saturate, to.saturate, eased) }, parts);
  };
}

/** Where `progress` falls: the segment and its eased local progress. */
function segmentAt(times: readonly number[], curves: readonly AFXTimingFunction[], duration: number, progress: number) {
  let segment = 0;
  while (segment < times.length - 2 && progress > times[segment + 1]!) segment++;
  const start = times[segment]!, end = times[segment + 1]!;
  return { segment, eased: curves[segment]!.sample((progress - start) / (end - start), duration * (end - start)) };
}

/** One output property of a compiled presentation. */
interface CompiledTrack {
  readonly keyPath: PresentedKeyPath;
  readonly from: AFXAnimationScalar;
  readonly to: AFXAnimationScalar;
  /** Needs keyframes: several segments, or per-segment timing. */
  readonly sampled: boolean;
  at(progress: number): AFXAnimationScalar;
}

function curvesFor(track: NSEPresentationTrack, curve: AFXTimingFunction): readonly AFXTimingFunction[] {
  return track.timingFunctions?.map((timing) => new AFXTimingFunction(timing)) ??
    Array.from({ length: track.values.length - 1 }, () => curve);
}

function compileTracks(spec: NSEPresentationSpec, layout: NSEPresentationLayout): readonly CompiledTrack[] {
  const curve = new AFXTimingFunction(spec.timing);
  const components = spec.tracks.filter(isComponentTrack);
  const compiled = spec.tracks.filter((track): track is WholeTrack => !isComponentTrack(track)).map((track): CompiledTrack => {
    const times = keyTimesFor(track), curves = curvesFor(track, curve), write = trackWriter(track, layout);
    return {
      keyPath: track.keyPath, from: write(0), to: write(track.values.length - 1),
      sampled: times.length > 2 || track.timingFunctions !== undefined,
      at(progress) {
        const { segment, eased } = segmentAt(times, curves, spec.duration, progress);
        return write(segment, segment + 1, eased);
      },
    };
  });
  if (components.length === 0) return compiled;
  if (compiled.some(({ keyPath }) => keyPath === "transform"))
    throw new TypeError("A presentation animates either the whole transform or its components.");
  const channels = components.map((track) => ({
    component: componentOf(track), values: track.values, times: keyTimesFor(track), curves: curvesFor(track, curve),
  }));
  if (new Set(channels.map(({ component }) => component)).size !== channels.length)
    throw new TypeError("A presentation animates each transform component once.");
  const compose = (valueOf: (channel: (typeof channels)[number]) => number): NSETransformComponents =>
    Object.fromEntries(channels.map((channel) => [channel.component, valueOf(channel)]));
  const parts = transformParts(channels.flatMap((channel) => channel.values.map((value) => ({ [channel.component]: value }))));
  const write = (value: NSETransformComponents) => transformCSS(resolvedTransform(value), "px", parts);
  return [...compiled, {
    keyPath: "transform",
    from: write(compose(({ values }) => values[0]!)),
    to: write(compose(({ values }) => values.at(-1)!)),
    sampled: components.some((track) => track.values.length > 2 || track.timingFunctions !== undefined),
    at: (progress) => write(compose(({ values, times, curves }) => {
      const { segment, eased } = segmentAt(times, curves, spec.duration, progress);
      return mix(values[segment]!, values[segment + 1]!, eased);
    })),
  }];
}

/** Presented values a presentation starts from instead of its first keyframe
 * (Core Animation's begin-from-current-state). */
export type NSEPresentationOrigin = Readonly<Partial<Record<PresentedKeyPath, AFXAnimationScalar>>>;

/** Compiles a presentation into one AFX group for one element. Two-keyframe
 * tracks keep the exact curve as the group timing; any multi-segment track
 * samples every track at shared offsets with linear group timing.
 *
 * An enter ends at the element's own style, so it holds nothing afterwards
 * (its backwards fill covers the start delay). An exit holds its terminal
 * presentation until the element is removed. With an `origin`, a track starts
 * from that presented value, so an interrupted presentation continues from
 * where it was rather than jumping to the new presentation's first keyframe. */
export function compileNSEPresentation(spec: NSEPresentationSpec, targetId: string,
  phase: "enter" | "exit" = "enter", origin: NSEPresentationOrigin = {},
  layout: NSEPresentationLayout = {}): AFXAnimationDefinition {
  const tracks = compileTracks(spec, layout);
  const sampled = tracks.some((track) => track.sampled);
  const animations = tracks.map((track): AFXPropertyAnimation => {
    const from = origin[track.keyPath] ?? track.from, to = track.to;
    if (!sampled) return Object.freeze({ targetId, keyPath: track.keyPath, from, to });
    return Object.freeze({
      targetId, keyPath: track.keyPath, from, to,
      keyframes: Object.freeze(sampledOffsets.map((offset) => Object.freeze({
        offset, value: offset === 0 ? from : track.at(offset),
      }))),
    });
  });
  return Object.freeze({
    animations: Object.freeze(animations),
    duration: spec.duration,
    ...(spec.delay ? { delay: spec.delay } : {}),
    timing: sampled ? "linear" : spec.timing,
    fill: phase === "exit" ? "forwards" : "backwards",
    // The caller already chose its reduced-motion variant.
    reducedMotion: "never",
  });
}

/** Measures what a spec's `auto` values resolve against. */
function presentationLayout(element: HTMLElement, spec: NSEPresentationSpec): NSEPresentationLayout {
  if (!spec.tracks.some((track) => track.keyPath === "height" && track.values.includes("auto"))) return {};
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const length = (value: string | undefined) => Number.parseFloat(value ?? "") || 0;
  // scrollHeight is the content and padding however the height is constrained;
  // the CSS height sizes the border box or the content box.
  const height = style?.boxSizing === "border-box"
    ? element.scrollHeight + length(style.borderTopWidth) + length(style.borderBottomWidth)
    : element.scrollHeight - length(style?.paddingTop) - length(style?.paddingBottom);
  return { height: Math.max(0, height) };
}

/** Reads what an element currently presents for the spec's key paths. */
function presentedOrigin(element: HTMLElement, spec: NSEPresentationSpec): NSEPresentationOrigin {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return {};
  const origin: Partial<Record<PresentedKeyPath, AFXAnimationScalar>> = {};
  for (const track of spec.tracks) {
    const keyPath: PresentedKeyPath = isComponentTrack(track) ? "transform" : track.keyPath;
    if (keyPath === "opacity") {
      const opacity = Number.parseFloat(style.opacity);
      if (Number.isFinite(opacity) && opacity >= 0 && opacity <= 1) origin.opacity = opacity;
    } else {
      const value = style.getPropertyValue(keyPath).trim();
      if (value) origin[keyPath] = value;
    }
  }
  return origin;
}

/** A presentation into the current state, given the state it leaves (`null`
 * when the element mounts or re-enters after an exit). */
export type NSEPresentationEnter =
  | NSEPresentationSpec
  | null
  | ((previousState: string | null) => NSEPresentationSpec | null);

export interface NSEPresentationMotion {
  /** Presents the element into its current state. */
  readonly enter?: NSEPresentationEnter;
  /** Plays before an NSEPresence removes the element. */
  readonly exit?: NSEPresentationSpec | null;
  /** The model state the element's own style shows. When it changes, the
   * element presents the new state with `enter`, as a view animates a change
   * to its layer's model value. */
  readonly state?: string;
  /** The element finished presenting `state`: its enter completed (or failed),
   * or none played. Not called when a presentation is superseded or the
   * element unmounts first. */
  readonly onPresented?: (state: string) => void;
}

const defaultState = "presented";

interface PresenceControl {
  readonly exiting: boolean;
  /** Initial children of an `initial={false}` presence skip their enter. */
  readonly skipEnter: boolean;
  /** Every presentation in the child joins its exit; returns the leave. */
  join(participant: object): () => void;
  /** A participant's exit settled; the child leaves once all have. */
  exited(participant: object): void;
}
const PresenceContext = createContext<PresenceControl | null>(null);

/**
 * Whether the enclosing NSEPresence is holding this child for its exit. A
 * child whose model is already gone (a closed window) keeps drawing its last
 * frame while this is true, so its exit has something to play on.
 */
export function useNSEPresenceExiting(): boolean {
  return useContext(PresenceContext)?.exiting ?? false;
}

/**
 * Presents an element through the environment's AnimationFX animator
 * (runtime- or application-owned): `enter` when it mounts and whenever its
 * `state` changes, and, inside an NSEPresence, `exit` before it unmounts.
 * Without an animator the element simply shows each state at once.
 */
export function useNSEPresentation(ref: RefObject<HTMLElement | null>, motion: NSEPresentationMotion): void {
  const { animator } = useNSEAnimationEnvironment();
  const presence = useContext(PresenceContext);
  const [participant] = useState(() => ({}));
  const join = presence?.join;
  useLayoutEffect(() => join?.(participant), [join, participant]);
  const viewId = `nse-presentation:${useId()}`;
  const latest = useRef(motion);
  latest.current = motion;
  const view = useRef<{ animator: NSEAnimator; lease: ReturnType<NSEAnimator["animations"]["acquireOwner"]>; generation: number } | null>(null);
  const running = useRef<AFXAnimationHandle | null>(null);
  /** The state the element last presented, or null while unmounted. */
  const presentedState = useRef<string | null>(null);
  const run = (spec: NSEPresentationSpec | null | undefined, phase: "enter" | "exit"): AFXAnimationHandle | null => {
    const element = ref.current, active = view.current;
    if (!spec || !element || !active) return null;
    const previous = running.current;
    running.current = null;
    // A presentation still in flight hands over from what it shows now.
    const origin = previous && (previous.state === "running" || previous.state === "paused")
      ? presentedOrigin(element, spec) : {};
    previous?.cancel("superseded by the next presentation");
    active.generation += 1;
    // Presentation is cosmetic: an animation the service refuses leaves the
    // element in its final state rather than failing the view.
    let handle: AFXAnimationHandle;
    try {
      handle = active.animator.animations.animate(element,
        compileNSEPresentation(spec, viewId, phase, origin, presentationLayout(element, spec)), active.lease, active.generation);
    } catch {
      return null;
    }
    running.current = handle;
    return handle;
  };
  const present = (previousState: string | null) => {
    const { enter, state = defaultState } = latest.current;
    presentedState.current = state;
    const spec = typeof enter === "function" ? enter(previousState) : enter;
    const handle = run(spec, "enter");
    if (!handle) { latest.current.onPresented?.(state); return; }
    void handle.finished.then((settlement) => {
      if ((settlement.state === "completed" || settlement.state === "failed") && presentedState.current === state)
        latest.current.onPresented?.(state);
    });
  };
  useLayoutEffect(() => {
    let lease: ReturnType<NSEAnimator["animations"]["acquireOwner"]> | null = null;
    if (animator) {
      try {
        lease = animator.animations.acquireOwner({ appId: animator.ownerAppId, viewId });
      } catch {
        // Without an owner lease the view simply presents its final state.
      }
    }
    view.current = animator && lease ? { animator, lease, generation: 0 } : null;
    if (presence?.skipEnter) {
      presentedState.current = latest.current.state ?? defaultState;
      latest.current.onPresented?.(presentedState.current);
    } else present(null);
    return () => {
      running.current?.cancel("presentation view unmounted");
      running.current = null;
      view.current = null;
      presentedState.current = null;
      lease?.release("presentation view unmounted");
    };
    // The view's lease lives for the mounted element; later motion changes
    // apply to the next presentation, as with a declarative transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animator, viewId]);
  const exiting = presence?.exiting ?? false;
  const state = motion.state ?? defaultState;
  useLayoutEffect(() => {
    const previous = presentedState.current;
    if (exiting || previous === null || previous === state) return;
    present(previous);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  // Set once an exit starts; only a real exit-then-show re-enters (a
  // StrictMode effect replay is not a re-entry).
  const exited = useRef(false);
  useLayoutEffect(() => {
    if (!presence) return;
    if (!exiting) return;
    exited.current = true;
    const handle = run(latest.current.exit, "exit");
    if (!handle) { presence.exited(participant); return; }
    let current = true;
    void handle.finished.then((settlement) => {
      // A re-entry supersedes the exit; only a finished or failed exit removes.
      if (current && settlement.state !== "interrupted") presence.exited(participant);
    });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);
  useLayoutEffect(() => {
    if (!presence || exiting || !exited.current) return;
    exited.current = false;
    present(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);
}

/**
 * Presentations below the boundary never join an enclosing NSEPresence's exit.
 * An owner boundary, such as a mounted application inside a shell window,
 * uses it so the shell's exit and its settlement never wait on another
 * owner's animations.
 */
export function NSEPresenceBoundary({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return <PresenceContext.Provider value={null}>{children}</PresenceContext.Provider>;
}

/** Holds one presence child while its presentations play their exits. */
function PresenceChild({ exiting, skipEnter, onExited, children }: Readonly<{
  exiting: boolean;
  skipEnter: boolean;
  onExited: () => void;
  children: ReactNode;
}>): ReactNode {
  const latest = useRef({ exiting, onExited });
  latest.current = { exiting, onExited };
  const [exit] = useState(() => {
    const participants = new Set<object>(), settled = new Set<object>();
    let reported = false;
    const settle = () => {
      if (!latest.current.exiting || reported) return;
      for (const participant of participants) if (!settled.has(participant)) return;
      reported = true;
      latest.current.onExited();
    };
    return {
      settle,
      reset() { settled.clear(); reported = false; },
      join(participant: object) {
        participants.add(participant);
        // A participant unmounted mid-exit no longer holds the child.
        return () => { participants.delete(participant); settled.delete(participant); settle(); };
      },
      exited(participant: object) { settled.add(participant); settle(); },
    };
  });
  // Participants start their exits first (child effects run before this);
  // a child with none, or whose exits settled at once, leaves now.
  useLayoutEffect(() => {
    if (exiting) exit.settle();
    else exit.reset();
  }, [exit, exiting]);
  const control = useMemo<PresenceControl>(
    () => ({ exiting, skipEnter, join: exit.join, exited: exit.exited }),
    [exit, exiting, skipEnter],
  );
  return <PresenceContext.Provider value={control}>{children}</PresenceContext.Provider>;
}

interface PresenceRecord {
  readonly key: Key;
  readonly element: ReactElement;
  readonly exiting: boolean;
  readonly skipEnter: boolean;
}

/**
 * Keeps removed children mounted while their exit presentations play, like
 * AnimatePresence. Children are told apart by key; each removed child plays
 * the exit of every useNSEPresentation inside it (not inside a nested
 * NSEPresence) and leaves, in place, once all of them have settled. Showing a
 * key again during its exit re-enters the same elements. `onExitComplete`
 * runs when the last exiting child has left. With `initial={false}` the
 * children present on first render appear without their enter.
 */
export function NSEPresence({ children, initial = true, onExitComplete }: Readonly<{
  children: ReactNode;
  initial?: boolean;
  onExitComplete?: () => void;
}>): ReactNode {
  const incoming = Children.toArray(children).filter(isValidElement) as ReactElement[];
  const records = useRef<readonly PresenceRecord[]>([]);
  const committed = useRef(false);
  const [, rerender] = useState(0);
  const latestExitComplete = useRef(onExitComplete);
  latestExitComplete.current = onExitComplete;
  // Merge: incoming children in their order, with exiting ones kept where they were.
  const previous = records.current;
  const byKey = new Map(previous.map((record) => [record.key, record]));
  const incomingKeys = new Set<Key>(incoming.map((element) => element.key!));
  const next: PresenceRecord[] = [];
  const placed = new Set<Key>();
  let cursor = 0;
  const place = (element: ReactElement) => {
    const key = element.key!;
    if (placed.has(key)) return;
    placed.add(key);
    const prior = byKey.get(key);
    next.push({ key, element, exiting: false, skipEnter: prior ? prior.skipEnter : !initial && !committed.current });
  };
  for (const record of previous) {
    if (incomingKeys.has(record.key)) {
      while (cursor < incoming.length && !placed.has(record.key)) place(incoming[cursor++]!);
    } else {
      next.push(record.exiting ? record : { ...record, exiting: true });
    }
  }
  while (cursor < incoming.length) place(incoming[cursor++]!);
  records.current = next;
  useLayoutEffect(() => { committed.current = true; }, []);
  const remove = useCallback((key: Key) => {
    const current = records.current;
    if (!current.some((record) => record.key === key && record.exiting)) return;
    records.current = current.filter((record) => record.key !== key);
    rerender((count) => count + 1);
    if (!records.current.some((record) => record.exiting)) latestExitComplete.current?.();
  }, []);
  return next.map((record) => (
    <PresenceChild
      key={record.key}
      exiting={record.exiting}
      skipEnter={record.skipEnter}
      onExited={() => remove(record.key)}
    >
      {record.element}
    </PresenceChild>
  ));
}
