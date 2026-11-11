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
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import { dataViewAnnouncement, dataViewEventIsComposing, useNSEDataView, type NSEDataViewKey } from "../Core";
import { useNSEAnimationEnvironment } from "../../Animation/NSEAnimationEnvironment";
import type { AFXLayer } from "../../../FX/AnimationFX/AFXLayer";
import type { AFXRenderer } from "../../../FX/AnimationFX/AFXRenderer";
import type { AFXReplicatorLayer } from "../../../FX/AnimationFX/AFXReplicatorLayer";
import { AFXTransaction } from "../../../FX/AnimationFX/AFXTransaction";
import { AFXTransform3D } from "../../../FX/AnimationFX/AFXTransform3D";
import { GFXColour } from "../../../FX/GraphicsFX/GFXColour";
import { GFXImage } from "../../../FX/GraphicsFX/GFXImage";
import type { IFXImageResource } from "../../../FX/ImageFX/IFXImageResource";
import {
  coverFlowItemAttributes,
  coverFlowReflectionBrightness,
  coverFlowReflectionFadeMask,
  coverFlowReflectionFrameY,
  coverFlowReflectionOpacity,
  type NSECollectionViewCoverFlowLayout,
} from "./coverFlowLayout";
import type { NSECollectionViewCoverFlowProps } from "./collectionTypes";

/** Rings beyond the fan over which an item fades from full opacity to nothing. */
const FADE_SPAN = 1;
/** Extra rings kept laid out (at opacity 0) past the fade, so a fast scroll never pops an item into the fan. */
const LAYOUT_MARGIN = 2;
/** Horizontal pointer travel (px) that scrolls by one item. */
const DRAG_STEP_PX = 78;
/** Pointer travel below this is a click, not a drag. */
const CLICK_SLOP_PX = 6;
/** Minimum gap (ms) between wheel-driven steps. */
const WHEEL_COOLDOWN_MS = 320;
/** The scroll spring's natural frequency (rad/s): critically damped, it settles in about a third of a second. */
const SCROLL_SPRING = 14;
/** How far ahead (s) a released drag's velocity carries the scroll before it settles on an item. */
const FLICK_SECONDS = .12;

interface CoverFlowSlot {
  readonly card: AFXLayer;
  readonly shade: AFXLayer;
  readonly mirror: AFXLayer;
  readonly mask: AFXLayer;
}

interface CoverFlowScene {
  readonly renderer: AFXRenderer;
  readonly cards: AFXLayer;
  readonly mirrors: AFXReplicatorLayer;
  readonly maskImage: GFXImage;
  readonly slots: Map<number, CoverFlowSlot>;
  readonly spare: CoverFlowSlot[];
  width: number;
  height: number;
  itemWidth: number;
  itemHeight: number;
  /** The presented scroll position: a ring position, fractional while the scroll moves. */
  presented: number;
  /** Scroll velocity in items per second. */
  velocity: number;
  /** The ring position the scroll settles on: the selected item. */
  target: number;
  dragging: boolean;
}

interface CoverFlowFrame {
  readonly count: number;
  readonly layout: NSECollectionViewCoverFlowLayout;
  readonly showsReflections: boolean;
  readonly imageAt: (index: number) => GFXImage | null;
}

const shadeImage = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([2, 4, 7, 255]) });

function clampIndex(index: number, count: number) {
  return Math.max(0, Math.min(count - 1, index));
}

function wrapIndex(position: number, count: number, wraps: boolean) {
  if (count <= 0) return 0;
  return wraps ? ((position % count) + count) % count : clampIndex(position, count);
}

/** The shortest signed ring distance from `from` to `to`. */
function ringDelta(from: number, to: number, count: number) {
  let delta = (((to - from) % count) + count) % count;
  if (delta > count / 2) delta -= count;
  return delta;
}

function fanExtent(layout: NSECollectionViewCoverFlowLayout, count: number) {
  // A wrapped ring caps the full-opacity fan so an item's wrap-around twin is never opaque at the same time.
  const full = layout.isWrapped ? Math.min(layout.visibleItemsEachSide, Math.max(0, Math.floor((count - 1) / 2))) : layout.visibleItemsEachSide;
  return { full, fadeEnd: full + FADE_SPAN };
}

function fanOpacity(distance: number, full: number, fadeEnd: number) {
  if (distance <= full) return 1;
  if (distance >= fadeEnd) return 0;
  return (fadeEnd - distance) / (fadeEnd - full);
}

function makeSlot(scene: CoverFlowScene): CoverFlowSlot {
  const { renderer } = scene;
  const card = renderer.makeLayer(scene.cards);
  const shade = renderer.makeLayer(card);
  const mirror = renderer.makeLayer(scene.mirrors);
  const mask = renderer.makeLayer(null);
  AFXTransaction.perform({ disableActions: true }, () => {
    card.allowsEdgeAntialiasing = true;
    mirror.allowsEdgeAntialiasing = true;
    // Side items draw their pictures at a fraction of their size; trilinear sampling keeps the detail steady as they move.
    card.minificationFilter = "trilinear";
    mirror.minificationFilter = "trilinear";
    // The renderer draws contents, so the darkening veil is a one-pixel picture stretched over the item.
    shade.contents = shadeImage;
    shade.opacity = 0;
    mask.contents = scene.maskImage;
    mirror.setMask(mask);
  });
  renderer.setPickable(card, true);
  return { card, shade, mirror, mask };
}

/** The shade and the mirror's fade mask cover their layer's bounds. */
function sizeSlot(scene: CoverFlowScene, slot: CoverFlowSlot) {
  const bounds = { x: 0, y: 0, width: scene.itemWidth, height: scene.itemHeight };
  slot.shade.frame = bounds;
  slot.mask.frame = bounds;
}

/**
 * Lays every item out from the presented scroll position, once per frame while the scroll moves. Each item's place,
 * turn, depth and drawing order come from the same continuous position, so a nearer item always draws over a farther
 * one, and a drag or a fast scroll never leaves an item mid-flight. Slots are keyed by ring position, so near the
 * seam of a wrapped ring an item can appear twice while its departing and arriving twins cross-fade.
 */
function layOut(scene: CoverFlowScene, frame: CoverFlowFrame) {
  const { layout, count } = frame;
  if (count <= 0) return;
  const { full, fadeEnd } = fanExtent(layout, count);
  const reach = fadeEnd + LAYOUT_MARGIN;
  const scroll = scene.presented;
  const wanted = new Set<number>();
  for (let position = Math.floor(scroll - reach); position <= Math.ceil(scroll + reach); position += 1) {
    if (!layout.isWrapped && (position < 0 || position > count - 1)) continue;
    wanted.add(position);
  }
  AFXTransaction.perform({ disableActions: true }, () => {
    for (const [position, slot] of scene.slots) {
      if (wanted.has(position)) continue;
      scene.slots.delete(position);
      slot.card.hidden = true;
      slot.mirror.hidden = true;
      scene.spare.push(slot);
    }
    const width = scene.itemWidth;
    const height = scene.itemHeight;
    for (const position of wanted) {
      let slot = scene.slots.get(position);
      if (!slot) {
        slot = scene.spare.pop() ?? makeSlot(scene);
        scene.slots.set(position, slot);
        sizeSlot(scene, slot);
      }
      const target = coverFlowItemAttributes(`p${position}`, position - scroll, width);
      const distance = Math.abs(target.offset);
      const image = frame.imageAt(wrapIndex(position, count, layout.isWrapped));
      if (slot.card.contents !== image) {
        slot.card.contents = image;
        slot.mirror.contents = image;
        // Aspect fill: a centred crop of the picture with the item's shape.
        const crop = image ? aspectFillRect(image.width / image.height, layout.itemAspectRatio) : { x: 0, y: 0, width: 1, height: 1 };
        slot.card.contentsRect = crop;
        slot.mirror.contentsRect = crop;
      }
      const transform = AFXTransform3D.translation(0, 0, -target.z)
        .multiply(AFXTransform3D.rotation(target.yawRadians, 0, 1, 0))
        .multiply(AFXTransform3D.scale(target.scale, target.scale, 1));
      const opacity = fanOpacity(distance, full, fadeEnd);
      slot.card.hidden = false;
      slot.mirror.hidden = !frame.showsReflections;
      // Painter's order from the presented distance: nearer items draw over farther ones, and so do their mirrors.
      slot.card.zPosition = -distance / 1000;
      slot.mirror.zPosition = -distance / 1000;
      slot.card.frame = { x: target.x - width / 2, y: -height / 2, width, height };
      slot.card.transform = transform;
      slot.card.opacity = opacity;
      slot.shade.opacity = Math.min(.6, distance * .22);
      slot.mirror.frame = { x: target.x - width / 2, y: coverFlowReflectionFrameY(0, height, target.scale), width, height };
      slot.mirror.transform = transform.multiply(AFXTransform3D.scale(1, -1, 1));
      slot.mirror.opacity = coverFlowReflectionOpacity * opacity;
    }
  });
}

/**
 * Advances the scroll one frame: a critically damped spring toward the target, so a new target mid-scroll bends the
 * motion instead of restarting it. Returns whether the scroll is still moving.
 */
function stepScroll(scene: CoverFlowScene, seconds: number) {
  if (scene.dragging) return false;
  const dt = Math.min(1 / 30, Math.max(0, seconds));
  const acceleration = SCROLL_SPRING * SCROLL_SPRING * (scene.target - scene.presented) - 2 * SCROLL_SPRING * scene.velocity;
  scene.velocity += acceleration * dt;
  scene.presented += scene.velocity * dt;
  if (Math.abs(scene.target - scene.presented) < .0005 && Math.abs(scene.velocity) < .005) {
    scene.presented = scene.target;
    scene.velocity = 0;
    return false;
  }
  return true;
}

function aspectFillRect(imageAspect: number, itemAspect: number) {
  if (!Number.isFinite(imageAspect) || imageAspect <= 0) return { x: 0, y: 0, width: 1, height: 1 };
  if (imageAspect > itemAspect) {
    const width = itemAspect / imageAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = imageAspect / itemAspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

/** Points the camera: the selected item's centre is the orbit target, `cameraDistance` item widths away. */
function aimCamera(scene: CoverFlowScene, layout: NSECollectionViewCoverFlowLayout) {
  const itemHeight = Math.max(1, scene.height * layout.itemHeightFraction);
  const itemWidth = itemHeight * layout.itemAspectRatio;
  const resized = itemWidth !== scene.itemWidth || itemHeight !== scene.itemHeight;
  scene.itemWidth = itemWidth;
  scene.itemHeight = itemHeight;
  AFXTransaction.perform({ disableActions: true }, () => {
    scene.renderer.layer.sublayerTransform = AFXTransform3D.translation(scene.width / 2, scene.height * layout.itemCentreFraction)
      .multiply(AFXTransform3D.perspective(layout.cameraDistance * itemWidth))
      .multiply(AFXTransform3D.rotation(layout.cameraPitch, 1, 0, 0));
    if (resized) for (const slot of [...scene.slots.values(), ...scene.spare]) sizeSlot(scene, slot);
  });
}

/** Leases each resource's pixels once, keeping the decoded images by resource. */
function useCoverFlowImages(resources: readonly (IFXImageResource | undefined)[]) {
  const cache = useRef(new Map<IFXImageResource, GFXImage | "loading" | "failed">());
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const started: IFXImageResource[] = [];
    for (const resource of resources) {
      if (!resource || cache.current.has(resource)) continue;
      cache.current.set(resource, "loading");
      started.push(resource);
      void (async () => {
        try {
          const lease = await resource.pixelLease(controller.signal);
          try {
            controller.signal.throwIfAborted();
            cache.current.set(resource, lease.transferImage());
          } finally { lease.release(); }
          setGeneration(value => value + 1);
        } catch {
          if (!controller.signal.aborted) cache.current.set(resource, "failed");
        }
      })();
    }
    return () => {
      controller.abort();
      // A load this run started and did not finish starts again on the next run.
      for (const resource of started) if (cache.current.get(resource) === "loading") cache.current.delete(resource);
    };
  }, [resources]);
  const imageFor = useCallback((resource: IFXImageResource | undefined) => {
    const value = resource ? cache.current.get(resource) : undefined;
    return value && value !== "loading" && value !== "failed" ? value : null;
    // `generation` invalidates the callback when an image arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);
  return imageFor;
}

export function CoverFlowCollectionView<T, TId extends NSEDataViewKey>({
  adapter,
  layout,
  imageForItem,
  subtitleForItem,
  showsTitles = true,
  showsReflections = true,
  state: requestedState = { kind: "ready" },
  selectionMode = "single",
  onSelectionChange,
  onActivate,
  className = "",
  onKeyDown,
  onPointerDown,
  onClick,
  ...props
}: NSECollectionViewCoverFlowProps<T, TId>) {
  const view = useNSEDataView(adapter, { selectionMode, state: requestedState, onSelectionChange, delegate: { didActivate: onActivate } });
  const { layers, frames, reducedMotion } = useNSEAnimationEnvironment();
  const items = view.snapshot.items;
  const count = items.length;
  const wraps = layout.isWrapped;
  const selectedIndex = items.findIndex(({ id }) => view.snapshot.selection.selectedIds.has(id));
  const anchorIndex = selectedIndex >= 0 ? selectedIndex : Math.floor(count / 2);

  // A monotonic ring position, so a wrapped step from the last item to the first is +1, not a rewind.
  const [centre, setCentre] = useState(anchorIndex);
  useEffect(() => {
    if (count <= 0) return;
    setCentre(previous => {
      if (!wraps) return clampIndex(anchorIndex, count);
      const current = wrapIndex(previous, count, true);
      return current === anchorIndex ? previous : previous + ringDelta(current, anchorIndex, count);
    });
  }, [anchorIndex, count, wraps]);
  const current = wrapIndex(centre, count, wraps);
  const currentEntry = items[current];

  const goTo = useCallback((next: number, reason: "pointer" | "keyboard") => {
    if (count <= 0) return;
    const position = wraps ? next : clampIndex(next, count);
    const entry = items[wrapIndex(position, count, wraps)];
    if (!entry || entry.disabled) return;
    setCentre(position);
    if (selectionMode === "none") view.coordinator.setActive(entry.id);
    else view.coordinator.select(entry.id, reason);
  }, [count, items, selectionMode, view.coordinator, wraps]);

  const goToIndex = useCallback((index: number, reason: "pointer" | "keyboard") => {
    goTo(wraps && count > 0 ? centre + ringDelta(wrapIndex(centre, count, true), index, count) : index, reason);
  }, [centre, count, goTo, wraps]);

  const activate = useCallback(() => {
    if (currentEntry) view.coordinator.activate(currentEntry.id);
  }, [currentEntry, view.coordinator]);

  // Pictures are ImageFX resources; their pixels are leased once and kept by resource.
  const resources = useRef<readonly (IFXImageResource | undefined)[]>([]);
  const nextResources = items.map(({ item }) => imageForItem(item));
  if (nextResources.length !== resources.current.length || nextResources.some((resource, index) => resource !== resources.current[index])) {
    resources.current = nextResources;
  }
  const imageFor = useCoverFlowImages(resources.current);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CoverFlowScene | null>(null);
  const [rendering, setRendering] = useState<"pending" | "fx" | "unavailable">("pending");
  const [failure, setFailure] = useState<string | undefined>();
  const frameRef = useRef<CoverFlowFrame | null>(null);
  frameRef.current = {
    count,
    layout,
    showsReflections,
    imageAt: (index) => imageFor(resources.current[index]),
  };
  const centreRef = useRef(centre);
  centreRef.current = centre;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  /** Lays the scene out on the next frame, and keeps doing so while the scroll moves. */
  const wakeRef = useRef<() => void>(() => undefined);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const host = viewRef.current;
    if (!canvas || !host || !layers) {
      setFailure(layers ? "The view is not mounted." : "No AnimationFX layers are available here.");
      setRendering("unavailable");
      return;
    }
    const controller = new AbortController();
    let scene: CoverFlowScene | null = null;
    let observer: ResizeObserver | undefined;
    const dispose = () => {
      observer?.disconnect();
      controller.abort();
      sceneRef.current = null;
      scene?.renderer.dispose();
    };
    try {
      const renderer = layers.createRenderer(canvas, {
        maximumQuads: 1024,
        onRenderError: (error) => {
          if (controller.signal.aborted) return;
          setFailure(error instanceof Error ? error.message : String(error));
          dispose(); setRendering("unavailable");
        },
      }, controller.signal);
      // The mirrors draw first, under the items, as one replicator layer: darkened by its instance colour and
      // faded by each mirror's mask, so nearer mirrors hide farther ones as the items themselves do.
      const mirrors = renderer.makeReplicatorLayer();
      const cards = renderer.makeLayer();
      AFXTransaction.perform({ disableActions: true }, () => {
        mirrors.projectionMode = "projective";
        mirrors.instanceCount = 1;
        mirrors.instanceColour = GFXColour.rgba(coverFlowReflectionBrightness, coverFlowReflectionBrightness, coverFlowReflectionBrightness, 1);
      });
      scene = {
        renderer, cards, mirrors, maskImage: coverFlowReflectionFadeMask(), slots: new Map(), spare: [],
        width: 1, height: 1, itemWidth: 0, itemHeight: 0,
        presented: centreRef.current, velocity: 0, target: centreRef.current, dragging: false,
      };
      sceneRef.current = scene;
      // One frame loop on AnimationFX's frame scheduler (the host's display link when there is none) drives the scroll.
      const view = host.ownerDocument.defaultView;
      const requestFrame = frames
        ? (callback: (seconds: number) => void) => frames.requestFrame(callback)
        : (callback: (seconds: number) => void) => {
          const handle = view?.requestAnimationFrame((time) => callback(time / 1000));
          return () => { if (handle !== undefined) view?.cancelAnimationFrame(handle); };
        };
      let cancelFrame: (() => void) | null = null;
      let previous: number | null = null;
      const tick = (seconds: number) => {
        cancelFrame = null;
        if (!scene || controller.signal.aborted) return;
        const elapsed = previous === null ? 1 / 60 : seconds - previous;
        previous = seconds;
        if (reducedMotionRef.current && !scene.dragging) { scene.presented = scene.target; scene.velocity = 0; }
        const moving = stepScroll(scene, elapsed);
        const frame = frameRef.current;
        if (frame) layOut(scene, frame);
        renderer.render();
        if (moving) cancelFrame = requestFrame(tick);
        else previous = null;
      };
      wakeRef.current = () => {
        if (controller.signal.aborted || cancelFrame) return;
        cancelFrame = requestFrame(tick);
      };
      controller.signal.addEventListener("abort", () => { cancelFrame?.(); cancelFrame = null; wakeRef.current = () => undefined; }, { once: true });
      const resize = () => {
        if (!scene || controller.signal.aborted) return;
        const rect = host.getBoundingClientRect();
        scene.width = Math.max(1, Math.round(host.clientWidth || rect.width));
        scene.height = Math.max(1, Math.round(host.clientHeight || rect.height));
        renderer.setViewport({ width: scene.width, height: scene.height, pixelRatio: Math.max(1, Math.min(2, host.ownerDocument.defaultView?.devicePixelRatio || 1)) });
        const frame = frameRef.current;
        if (!frame || frame.count <= 0) return;
        aimCamera(scene, frame.layout);
        layOut(scene, frame);
        renderer.render();
      };
      resize();
      const Observer = host.ownerDocument.defaultView?.ResizeObserver;
      if (Observer) { observer = new Observer(resize); observer.observe(host); }
      setRendering("fx");
      return dispose;
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      dispose();
      setRendering("unavailable");
      return undefined;
    }
  }, [layers, frames]);

  // The selection is the scroll's target; the frame loop eases the presented scroll onto it.
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.target = centre;
    wakeRef.current();
  }, [centre, rendering]);

  // A change of pictures, layout, camera or reflections relays the scene on the next frame.
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene || count <= 0) return;
    aimCamera(scene, layout);
    wakeRef.current();
  }, [count, layout, showsReflections, imageFor, rendering]);

  // --- Pointer drag / swipe ---------------------------------------------------
  // The drag moves the presented scroll itself, so the items follow the pointer between whole positions; the
  // selection follows the item nearest the centre, and a release lets the scroll settle with the drag's momentum.
  const drag = useRef({ active: false, startX: 0, baseScroll: 0, pointerId: -1, captured: false, lastX: 0, lastTime: 0, velocity: 0 });
  const suppressClick = useRef(false);
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    if (event.button !== 0) return;
    const scene = sceneRef.current;
    drag.current = {
      active: true, startX: event.clientX, baseScroll: scene ? scene.presented : centre, pointerId: event.pointerId, captured: false,
      lastX: event.clientX, lastTime: event.timeStamp, velocity: 0,
    };
    suppressClick.current = false;
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drag.current;
    if (!gesture.active) return;
    const delta = event.clientX - gesture.startX;
    if (Math.abs(delta) <= CLICK_SLOP_PX && !gesture.captured) return;
    suppressClick.current = true;
    if (!gesture.captured) { event.currentTarget.setPointerCapture?.(gesture.pointerId); gesture.captured = true; }
    const elapsed = (event.timeStamp - gesture.lastTime) / 1000;
    if (elapsed > 0) {
      const instantaneous = -(event.clientX - gesture.lastX) / DRAG_STEP_PX / elapsed;
      gesture.velocity = gesture.velocity * .6 + instantaneous * .4;
    }
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;
    let scroll = gesture.baseScroll - delta / DRAG_STEP_PX;
    if (!wraps) scroll = Math.max(-.35, Math.min(count - .65, scroll));
    const scene = sceneRef.current;
    if (scene) {
      scene.dragging = true;
      scene.presented = scroll;
      scene.velocity = 0;
      wakeRef.current();
    }
    const nearest = Math.round(scroll);
    if (nearest !== centre) goTo(nearest, "pointer");
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drag.current;
    if (!gesture.active) return;
    gesture.active = false;
    if (gesture.captured && event.currentTarget.hasPointerCapture?.(gesture.pointerId)) event.currentTarget.releasePointerCapture?.(gesture.pointerId);
    const scene = sceneRef.current;
    if (gesture.captured && scene) {
      scene.dragging = false;
      scene.velocity = gesture.velocity;
      const settle = Math.round(scene.presented + gesture.velocity * FLICK_SECONDS);
      const target = wraps ? settle : clampIndex(settle, count);
      if (target !== centre) goTo(target, "pointer");
      scene.target = target;
      wakeRef.current();
    }
    gesture.captured = false;
  };

  // A click on the selected item activates it; a click on another item selects it.
  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    onClick?.(event);
    if (suppressClick.current) { suppressClick.current = false; return; }
    const scene = sceneRef.current;
    const host = viewRef.current;
    if (!scene || !host) return;
    const rect = host.getBoundingClientRect();
    const hit = scene.renderer.hitTest({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (!hit) return;
    for (const [position, slot] of scene.slots) {
      if (slot.card !== hit && slot.shade !== hit) continue;
      if (position === centre) activate(); else goTo(position, "pointer");
      return;
    }
  };

  // --- Wheel: horizontally dominant gestures only, so page scrolling is never taken -------------------
  const lastWheel = useRef(0);
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const now = Date.now();
    if (now - lastWheel.current < WHEEL_COOLDOWN_MS) return;
    lastWheel.current = now;
    goTo(centre + (event.deltaX > 0 ? 1 : -1), "pointer");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || dataViewEventIsComposing(event)) return;
    const rtl = viewRef.current?.closest<HTMLElement>("[dir]")?.dir === "rtl";
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      goTo(centre + ((event.key === "ArrowRight") !== rtl ? 1 : -1), "keyboard");
    } else if (event.key === "Home") {
      event.preventDefault(); goToIndex(0, "keyboard");
    } else if (event.key === "End") {
      event.preventDefault(); goToIndex(count - 1, "keyboard");
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); activate();
    } else view.rootProps.onKeyDown?.(event);
  };

  // The well renders while it is empty too: the renderer owns the canvas from the first render.
  const title = currentEntry ? adapter.labelForItem(currentEntry.item) : "";
  const subtitle = currentEntry ? subtitleForItem?.(currentEntry.item) : undefined;
  const fallback = rendering === "unavailable" ? resources.current[current]?.src : undefined;
  const announcement = dataViewAnnouncement(view.state);
  return (
    <div className="nse-collection-container" data-state={view.state.kind}>
      <div
        {...props}
        {...view.rootProps}
        aria-activedescendant={currentEntry ? view.itemDomId(currentEntry.id) : undefined}
        ref={viewRef}
        role="listbox"
        aria-orientation="horizontal"
        className={`nse-collection-view ${className}`.trim()}
        data-nse-control="collection-view" data-nse-part="background" data-nse-enabled={view.rootProps["aria-disabled"] ? "false" : undefined}
        data-layout="cover-flow"
        data-rendering={rendering}
        data-failure={failure}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={handleClick}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} className="nse-collection-cover-flow-canvas" aria-hidden="true" />
        {fallback ? <img className="nse-collection-cover-flow-fallback" src={fallback} alt="" draggable={false} /> : null}
        <div className="nse-collection-cover-flow-items">
          {items.map(({ id, item, disabled }) => (
            <div key={view.itemDomId(id)} id={view.itemDomId(id)} role="option" data-nse-part="item" data-nse-selected={Object.is(id, currentEntry?.id) ? "" : undefined} data-nse-enabled={disabled ? "false" : undefined} aria-selected={Object.is(id, currentEntry?.id)} aria-disabled={disabled || undefined}>
              {adapter.labelForItem(item)}
            </div>
          ))}
        </div>
        {showsTitles && title ? (
          <div className="nse-collection-cover-flow-title" aria-hidden="true">
            <span className="nse-collection-cover-flow-title-text">{title}</span>
            {subtitle ? <span className="nse-collection-cover-flow-subtitle">{subtitle}</span> : null}
          </div>
        ) : null}
      </div>
      {announcement ? <div className="nse-collection-status" role="status" aria-live="polite">{announcement}</div> : null}
    </div>
  );
}
