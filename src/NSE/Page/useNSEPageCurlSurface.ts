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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { renderNSEViewSnapshot } from "../Graphics/snapshotNSEView";
import { NSEPageCurlRenderer, type NSEPageCurlFrame, type NSEPageCurlMargin } from "./NSEPageCurlRenderer";
import { getNSEPageTearMargin } from "./nsePageGeometry";
import type { NSEPageCurlCylinder, NSEPageEdge, NSEPageGeometry, NSEPageMotionPreset, NSEPageTearPose } from "./nsePageTypes";

/** How long the page's content must hold still before it is redrawn for the curl. */
const SNAPSHOT_SETTLE_MS = 60;
/** How long a curl waits for the page to be drawn before it falls back to the 2D fold. */
const SURFACE_WAIT_MS = 450;
/** Drawn pages kept for reuse; a page turned onto is usually one drawn already. */
const SURFACE_CACHE_LIMIT = 4;
/** The longest the canvas covers a newly shown page while its images decode. */
const HOLD_LIMIT_MS = 800;

const NO_MARGIN: NSEPageCurlMargin = Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 });

/** A pose with nothing lifted: the whole page lies flat. */
const FLAT: NSEPageCurlCylinder = Object.freeze({
  bendX: Number.MAX_SAFE_INTEGER, bendY: 0, normalX: 1, normalY: 0, radius: 0, sweep: Math.PI,
});

export interface NSEPageCurlSurfaceOptions {
  /** Curl or tear mode with motion allowed. */
  readonly enabled: boolean;
  readonly geometry: NSEPageGeometry;
  readonly motion: NSEPageMotionPreset;
  readonly frontRef: RefObject<HTMLElement | null>;
  readonly backRef: RefObject<HTMLElement | null>;
  /** The page revealed beneath, drawn ahead of time: a forward turn makes it the front. */
  readonly insideRef: RefObject<HTMLElement | null>;
  readonly underside: NSEPageCurlFrame["underside"];
  readonly subscribeFrame: (listener: (geometry: NSEPageGeometry) => void) => () => void;
}

/** Which renderer owns a curl: the 3D roll, or the 2D fold as a fallback. */
export type NSEPageCurlRendererKind = "webgl" | "css";

export interface NSEPageCurlSurface {
  readonly canvasRef: (canvas: HTMLCanvasElement | null) => void;
  /**
   * The renderer that owns the page. It is chosen as a curl starts moving and
   * holds until the page rests, so a curl never switches renderer part-way;
   * only a curl that has not yet lifted may still move up to the 3D roll.
   */
  readonly renderer: NSEPageCurlRendererKind;
  /** True while the WebGL canvas is drawing the page. */
  readonly active: boolean;
  /** True once the page's surfaces are drawn and a curl can start in 3D. */
  readonly ready: boolean;
  readonly margin: NSEPageCurlMargin;
  /**
   * Null when a curl can start now; otherwise settles once the page is drawn,
   * so the curl starts in 3D, or after a short wait, when this one falls back
   * to the 2D fold.
   */
  readonly whenReady: () => Promise<void> | null;
  /** True while the page is still being drawn and a curl would have to wait. */
  readonly pending: () => boolean;
  /**
   * The colour of the paper a tear's stub is made of, read from the page
   * midway along its binding; null where none of it is opaque.
   */
  readonly stubColour: (binding: NSEPageEdge) => string | null;
}

type Rgb = readonly [number, number, number];

/** A computed CSS colour as 0–1 RGB; undefined when it is transparent or unreadable. */
function parseColour(colour: string): Rgb | undefined {
  const match = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?/.exec(colour);
  if (!match) return undefined;
  const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  if (alpha < 0.5) return undefined;
  return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
}

/**
 * The colour of the paper at a point on screen: the opaque background of the
 * innermost element of `root` under it, as it paints. Read from the page's
 * own styles, so it never waits on the GPU.
 */
function paperAt(root: HTMLElement, x: number, y: number): Rgb | undefined {
  let found = parseColour(getComputedStyle(root).backgroundColor);
  let node: Element = root;
  for (let depth = 0; depth < 32; depth += 1) {
    let next: Element | null = null;
    for (const child of Array.from(node.children)) {
      const box = child.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) next = child;
    }
    if (!next) break;
    found = parseColour(getComputedStyle(next).backgroundColor) ?? found;
    node = next;
  }
  return found;
}

/** The blank paper of a page: what lies at its corner, where a curl first shows it. */
function paperOf(container: HTMLElement): Rgb | undefined {
  const box = container.getBoundingClientRect();
  return paperAt(container, box.left + box.width * 0.97, box.top + box.height * 0.97);
}

const rgbString = (rgb: Rgb) => `rgb(${rgb.map((channel) => Math.round(channel * 255)).join(", ")})`;

/** A drawn page, with the colour of the blank paper it was drawn on. */
interface DrawnPage {
  readonly canvas: HTMLCanvasElement;
  readonly paper: Rgb | undefined;
}

/** The page's own content, when the container holds exactly one element laid out within it. */
function soleContent(container: HTMLElement): HTMLElement | null {
  let content: HTMLElement | null = null;
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) continue;
    if (node.nodeType === Node.COMMENT_NODE) continue;
    if (content || !(node instanceof HTMLElement)) return null;
    content = node;
  }
  return content && content.offsetParent === container ? content : null;
}

/** The longest a page's own transitions are waited out before it is drawn. */
const SETTLE_LIMIT_MS = 1000;

/**
 * Resolves once the page's own transitions and animations have run their
 * course, so a page is never drawn caught halfway through a fade.
 */
async function settled(container: HTMLElement): Promise<void> {
  const running = typeof container.getAnimations === "function" ? container.getAnimations({ subtree: true }) : [];
  const finite = running.filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)));
  if (!finite.length) return;
  await Promise.race([
    Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))),
    new Promise<void>((done) => setTimeout(done, SETTLE_LIMIT_MS)),
  ]);
}

/**
 * Draws a page container for the curl. Where it holds a single content
 * element, that element is drawn on the front face's paper, so the same page
 * drawn from the revealed layer and from the front face comes out alike and
 * one can stand in for the other. Otherwise the container is drawn whole.
 */
async function drawPage(
  container: HTMLElement,
  paper: string,
  { exclude, signal, idle = false }: { exclude?: readonly string[]; signal?: AbortSignal; idle?: boolean } = {}
): Promise<DrawnPage> {
  const options = { unclipped: true, idle, exclude: exclude ? [...exclude] : undefined, signal };
  await settled(container);
  const content = soleContent(container);
  if (!content) {
    const whole = await renderNSEViewSnapshot(container, options);
    return { canvas: whole.canvas, paper: parseColour(getComputedStyle(container).backgroundColor) ?? parseColour(paper) ?? paperOf(container) };
  }
  const drawn = await renderNSEViewSnapshot(content, options);
  const scale = drawn.canvas.width / Math.max(1, content.offsetWidth);
  const page = document.createElement("canvas");
  page.width = Math.max(1, Math.round(container.offsetWidth * scale));
  page.height = Math.max(1, Math.round(container.offsetHeight * scale));
  const context = page.getContext("2d");
  const blank = parseColour(paper) ?? paperOf(container);
  if (!context) return { canvas: drawn.canvas, paper: blank };
  context.fillStyle = paper;
  context.fillRect(0, 0, page.width, page.height);
  context.drawImage(drawn.canvas, content.offsetLeft * scale, content.offsetTop * scale, content.offsetWidth * scale, content.offsetHeight * scale);
  return { canvas: page, paper: blank };
}

function frameFor(
  geometry: NSEPageGeometry,
  motion: NSEPageMotionPreset,
  margin: NSEPageCurlFrame["margin"],
  underside: NSEPageCurlFrame["underside"]
): NSEPageCurlFrame {
  return {
    // Before the leaf lifts, and after it lands, the page simply lies flat.
    cylinder: geometry.curlCylinder ?? FLAT,
    size: geometry.size,
    margin,
    perspective: motion.perspective,
    // The 3D roll needs a fuller shadow than the CSS fold's flat gradient.
    shadowStrength: Math.min(1, 0.6 + motion.shadowStrength),
    underside,
    tear: geometry.tear,
  };
}

/**
 * Renders a curling page in 3D. The page's printed side and underside are
 * redrawn into textures whenever its content settles, and the page revealed
 * beneath is drawn ahead of time, so a curl can begin at once; while one is
 * moving, a WebGL roll replaces the page's own layers. A curl that starts
 * before the page is drawn waits briefly for it; only where WebGL is
 * unavailable or the page can't be drawn does the CSS fold stand in.
 */
export function useNSEPageCurlSurface({ enabled, geometry, motion, frontRef, backRef, insideRef, underside, subscribeFrame }: NSEPageCurlSurfaceOptions): NSEPageCurlSurface {
  const rendererRef = useRef<NSEPageCurlRenderer | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [hasSurface, setHasSurface] = useState(false);
  const [holding, setHolding] = useState(false);
  const holdRef = useRef<object | null>(null);
  const unavailableRef = useRef(false);
  const [unavailable, setUnavailable] = useState(false);
  const timedOutRef = useRef(false);
  const rendererLockRef = useRef<NSEPageCurlRendererKind | null>(null);
  const liftedRef = useRef(false);
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef(new Map<string, DrawnPage>());
  const prefetchRef = useRef<ReturnType<typeof setTimeout> | number | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const waitRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  const phaseRef = useRef(geometry.phase);
  phaseRef.current = geometry.phase;
  const staleRef = useRef(false);
  const undersideRef = useRef(underside);
  undersideRef.current = underside;
  // A book leaf reaches over the spine onto its neighbour; a torn sheet flies
  // well clear of its page.
  const margin = useRef(NO_MARGIN);
  const { width: pageWidth, height: pageHeight } = geometry.size;
  const tearing = geometry.mode === "tear";
  const tearMargin = useMemo(
    () => tearing ? getNSEPageTearMargin(geometry.edge, geometry.corner, { width: pageWidth, height: pageHeight }, motion.perspective) : NO_MARGIN,
    [geometry.corner, geometry.edge, motion.perspective, pageHeight, pageWidth, tearing]
  );
  const nextMargin = geometry.projection === "spread"
    ? { left: pageWidth, right: pageWidth, top: Math.round(pageHeight * 0.12), bottom: Math.round(pageHeight * 0.12) }
    : tearMargin;
  if ((["left", "top", "right", "bottom"] as const).some((side) => nextMargin[side] !== margin.current[side])) margin.current = nextMargin;
  const moving = geometry.phase !== "idle";
  // A torn sheet has flown; its stub is left to the page's remnant.
  const torn = geometry.torn && geometry.mode === "tear";
  const curled = !torn && (geometry.curlCylinder !== null || geometry.tear !== null);
  // Drawing ahead stops the moment a curl moves: the main thread is the curl's.
  if (moving && prefetchAbortRef.current) {
    prefetchAbortRef.current.abort();
    prefetchAbortRef.current = null;
  }
  if (moving && curled) liftedRef.current = true;
  let renderer: NSEPageCurlRendererKind;
  if (!enabled || unavailable) {
    renderer = "css";
  } else if (moving) {
    // Chosen once per motion. A 2D-locked curl moves up to 3D only if the page
    // is ready before anything has lifted, which no one can see.
    if (rendererLockRef.current === null || (rendererLockRef.current === "css" && ready && !liftedRef.current)) {
      rendererLockRef.current = ready ? "webgl" : "css";
    }
    renderer = rendererLockRef.current;
  } else {
    rendererLockRef.current = null;
    liftedRef.current = false;
    // At rest, a page left curled is drawn by whichever renderer has a surface.
    renderer = hasSurface ? "webgl" : "css";
  }
  const active = renderer === "webgl" && hasSurface && !torn && (moving || curled || holding);

  const markReady = useCallback((value: boolean) => {
    readyRef.current = value;
    setReady(value);
    if (value && waitRef.current) {
      waitRef.current.resolve();
      waitRef.current = null;
    }
  }, []);

  const giveUp = useCallback(() => {
    unavailableRef.current = true;
    setUnavailable(true);
    waitRef.current?.resolve();
    waitRef.current = null;
  }, []);

  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasElementRef.current = canvas;
    if (!canvas) {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    }
  }, []);

  const remember = useCallback((key: string, drawn: DrawnPage) => {
    const cache = cacheRef.current;
    cache.delete(key);
    cache.set(key, drawn);
    while (cache.size > SURFACE_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  }, []);

  const recall = useCallback((key: string) => {
    const drawn = cacheRef.current.get(key);
    if (drawn) remember(key, drawn);
    return drawn;
  }, [remember]);

  /** Hands the renderer the page's current surfaces if they are drawn already. */
  const adoptDrawn = useCallback(() => {
    const front = frontRef.current, back = backRef.current, renderer = rendererRef.current;
    if (!front || !back || !renderer) return false;
    const frontPage = recall(front.innerHTML);
    const backPage = undersideRef.current === "back" ? recall(back.innerHTML) : frontPage;
    if (!frontPage || !backPage) return false;
    renderer.setSurfaces(frontPage.canvas, backPage.canvas, frontPage.paper);
    setHasSurface(true);
    markReady(true);
    return true;
  }, [backRef, frontRef, markReady, recall]);

  // Draws the page beneath ahead of time, so turning onto it is instant. It
  // runs only in the browser's idle time, and never once a curl is moving.
  const schedulePrefetch = useCallback((paper: string) => {
    if (prefetchRef.current !== null) {
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(prefetchRef.current as number);
      else clearTimeout(prefetchRef.current as ReturnType<typeof setTimeout>);
    }
    const generation = generationRef.current;
    const task = () => {
      prefetchRef.current = null;
      const inside = insideRef.current;
      if (!inside?.isConnected || phaseRef.current !== "idle" || generation !== generationRef.current) return;
      const key = inside.innerHTML;
      if (cacheRef.current.has(key)) return;
      const abort = new AbortController();
      prefetchAbortRef.current = abort;
      // Drawn in idle slices, so drawing ahead never holds up a frame of a curl.
      void drawPage(inside, paper, { signal: abort.signal, idle: true }).then((drawn) => remember(key, drawn), () => undefined).finally(() => {
        if (prefetchAbortRef.current === abort) prefetchAbortRef.current = null;
      });
    };
    prefetchRef.current = typeof requestIdleCallback === "function"
      ? requestIdleCallback(task, { timeout: 1500 })
      : setTimeout(task, 300);
  }, [insideRef, remember]);

  const draw = useCallback(() => {
    timerRef.current = null;
    const front = frontRef.current, back = backRef.current, canvas = canvasElementRef.current;
    if (!front || !back || !canvas || !front.isConnected) return;
    // Pages are drawn only while they rest, so the drawing shows settled content.
    if (phaseRef.current !== "idle") return;
    if (!rendererRef.current) {
      rendererRef.current = NSEPageCurlRenderer.create(canvas);
      if (!rendererRef.current) {
        giveUp();
        return;
      }
    }
    const generation = generationRef.current;
    const paper = getComputedStyle(front).backgroundColor;
    const frontKey = front.innerHTML, backKey = back.innerHTML;
    const withBack = undersideRef.current === "back";
    void (async () => {
      remember(frontKey, recall(frontKey) ?? await drawPage(front, paper));
      if (withBack) {
        // The CSS fold's own see-through ghost is not paper; the renderer paints the print through.
        remember(backKey, recall(backKey) ?? await drawPage(back, paper, { exclude: [".nse-page__curl-ghost"] }));
      }
      if (generation !== generationRef.current || !rendererRef.current) return;
      // A turn that began meanwhile keeps the surface it started with; the
      // page is drawn again once it rests.
      if (phaseRef.current !== "idle") {
        staleRef.current = true;
        return;
      }
      adoptDrawn();
      schedulePrefetch(paper);
    })().catch(() => {
      // An unreadable page (a cross-origin image, say) keeps the CSS curl.
      if (generation === generationRef.current) giveUp();
    });
  }, [adoptDrawn, backRef, frontRef, giveUp, recall, remember, schedulePrefetch]);

  // A page turned onto shows fresh elements whose images have yet to decode;
  // painted at once they would blink empty. The canvas, already holding the
  // page drawn ahead of time, covers it lying flat until they have, so the
  // hand-over from 3D back to the page itself is never seen.
  const holdUntilPainted = useCallback(() => {
    const front = frontRef.current;
    if (!front) return;
    const token = {};
    holdRef.current = token;
    flushSync(() => setHolding(true));
    const release = () => {
      if (holdRef.current !== token) return;
      holdRef.current = null;
      setHolding(false);
    };
    const decoded = Promise.all(Array.from(front.querySelectorAll("img"), (image) => image.decode().catch(() => undefined)));
    void decoded.then(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))).then(release);
    setTimeout(release, HOLD_LIMIT_MS);
  }, [frontRef]);

  const invalidate = useCallback((fromMutation = false) => {
    generationRef.current += 1;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    // A turn under way keeps the surfaces it started with, so it never falls
    // back to the CSS curl part-way; the page is redrawn once it rests.
    if (phaseRef.current !== "idle") {
      staleRef.current = true;
      return;
    }
    if (unavailableRef.current) {
      unavailableRef.current = false;
      setUnavailable(false);
    }
    // Turned onto a page drawn ahead of time, the curl is ready at once; the
    // next page beneath is drawn shortly after either way.
    if (!adoptDrawn()) markReady(false);
    else if (fromMutation) holdUntilPainted();
    timerRef.current = setTimeout(draw, SNAPSHOT_SETTLE_MS);
  }, [adoptDrawn, draw, holdUntilPainted, markReady]);

  // Any change to what the page shows makes the textures stale.
  useEffect(() => {
    if (!enabled || typeof WebGL2RenderingContext === "undefined" || typeof MutationObserver === "undefined") return;
    const front = frontRef.current, back = backRef.current;
    if (!front || !back) return;
    // Only the pages' contents matter: the face and flap roots' own clipping
    // styles change with every pose, and the pages are drawn unclipped.
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.type !== "attributes" || (record.target !== front && record.target !== back))) invalidate(true);
    });
    const onLoad = () => invalidate();
    for (const element of [front, back]) {
      observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
      element.addEventListener("load", onLoad, true);
    }
    invalidate();
    return () => {
      observer.disconnect();
      for (const element of [front, back]) element.removeEventListener("load", onLoad, true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      generationRef.current += 1;
    };
  }, [backRef, enabled, frontRef, invalidate]);

  // A resize or a different underside makes every drawing stale.
  const { width, height } = geometry.size;
  useEffect(() => {
    if (!enabled || typeof WebGL2RenderingContext === "undefined") return;
    cacheRef.current.clear();
    invalidate();
  }, [enabled, height, invalidate, underside, width]);
  useEffect(() => {
    if (!enabled || moving || typeof WebGL2RenderingContext === "undefined") return;
    // A wait that ran out applied to that motion only.
    timedOutRef.current = false;
    if (staleRef.current) {
      // The page changed during the turn that has just ended.
      staleRef.current = false;
      invalidate();
      return;
    }
    if (!ready && timerRef.current === null) timerRef.current = setTimeout(draw, SNAPSHOT_SETTLE_MS);
  }, [draw, enabled, invalidate, moving, ready]);

  const whenReady = useCallback((): Promise<void> | null => {
    if (!enabled || readyRef.current || unavailableRef.current || timedOutRef.current || typeof WebGL2RenderingContext === "undefined") return null;
    if (!waitRef.current) {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => { resolve = done; });
      const wait = { promise, resolve };
      waitRef.current = wait;
      setTimeout(() => {
        if (waitRef.current !== wait) return;
        // Not drawn in time: this curl goes ahead in 2D.
        waitRef.current = null;
        timedOutRef.current = true;
        resolve();
      }, SURFACE_WAIT_MS);
    }
    return waitRef.current.promise;
  }, [enabled]);

  const stubColour = useCallback((binding: NSEPageEdge): string | null => {
    const front = frontRef.current;
    if (!front) return null;
    const box = front.getBoundingClientRect();
    // A few px in from the binding, midway along it: the paper the stub is made of.
    const inset = 4 * (box.width / Math.max(1, front.offsetWidth));
    const point = binding === "top" ? { x: box.left + box.width / 2, y: box.top + inset }
      : binding === "bottom" ? { x: box.left + box.width / 2, y: box.bottom - inset }
        : binding === "left" ? { x: box.left + inset, y: box.top + box.height / 2 }
          : { x: box.right - inset, y: box.top + box.height / 2 };
    const colour = paperAt(front, point.x, point.y);
    return colour ? rgbString(colour) : null;
  }, [frontRef]);

  const pending = useCallback(
    () => enabled && !readyRef.current && !unavailableRef.current && !timedOutRef.current && typeof WebGL2RenderingContext !== "undefined",
    [enabled]
  );

  // React-rendered poses (turn starts, settles) draw before the browser paints them.
  useLayoutEffect(() => {
    if (!active) return;
    rendererRef.current?.draw(frameFor(geometry, motion, margin.current, underside));
  }, [active, geometry, motion, underside]);

  // Drag and turn frames bypass React; note when the page lifts, whichever
  // renderer draws it, so the renderer is never swapped under a lifted page.
  useEffect(() => {
    if (!enabled) return;
    return subscribeFrame((frameGeometry) => {
      if (frameGeometry.phase !== "idle" && (frameGeometry.curlCylinder || frameGeometry.tear)) liftedRef.current = true;
    });
  }, [enabled, subscribeFrame]);

  // Draw each fast frame as it is applied.
  useEffect(() => {
    if (!active) return;
    return subscribeFrame((frameGeometry) => {
      rendererRef.current?.draw(frameFor(frameGeometry, motion, margin.current, underside));
    });
  }, [active, motion, subscribeFrame, underside]);

  useEffect(() => () => {
    if (prefetchRef.current !== null) {
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(prefetchRef.current as number);
      else clearTimeout(prefetchRef.current as ReturnType<typeof setTimeout>);
      prefetchRef.current = null;
    }
    prefetchAbortRef.current?.abort();
    rendererRef.current?.dispose();
    rendererRef.current = null;
    waitRef.current?.resolve();
    waitRef.current = null;
  }, []);

  return { canvasRef, renderer, active, ready, margin: margin.current, whenReady, pending, stubColour };
}
