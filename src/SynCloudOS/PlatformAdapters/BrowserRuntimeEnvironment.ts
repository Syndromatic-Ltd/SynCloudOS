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

import { createBrowserFilePickerPort } from "./BrowserFilePickerPort";
import { BrowserAudioCaptureAdapter, createBrowserAudioCapturePlatform } from "./BrowserAudioCaptureAdapter";
import { BrowserVideoCaptureAdapter, createBrowserVideoCapturePlatform } from "./BrowserVideoCaptureAdapter";
import { BrowserVideoDecoder } from "./BrowserVideoDecoder";
import { BrowserVideoEncoder } from "./BrowserVideoEncoder";
import { createBrowserVideoWorkerTransport } from "../VideoFX/platformAdapterVideoWorker";
import { BrowserMotionAdapter } from "./BrowserMotionAdapter";
import { BrowserLocationAdapter } from "./BrowserLocationAdapter";
import { BrowserMIDIAdapter } from "./BrowserMIDIAdapter";
import { createBrowserLuminaIndexBackendFactory } from "./WorkerLuminaIndexBackend";
import type {
  RuntimeMediaQuery,
  RuntimeLayoutViewportSnapshot,
  RuntimeScreenSnapshot,
  RuntimeSnapshotSource,
  RuntimeVisualViewportSnapshot,
  RuntimeWorkAreaSnapshot,
  BrowserNavigationTarget,
  RuntimeBrowserLocation,
  RuntimeImageGeometryPort,
  SynCloudOSRuntimeEnvironment,
} from "../Runtime/runtimeInstanceTypes";
import { BrowserClipboardAdapter } from "./BrowserClipboardAdapter";
import { BrowserPointerAdapter } from "./BrowserPointerAdapter";
import { BrowserTextLayoutAdapterFactory } from "./BrowserTextLayoutAdapter";
import { createBrowserFontFaceRegistrationPort } from "./BrowserFontFaceRegistration";
import { BrowserImageAdapterFactory } from "./BrowserImageAdapter";
import { BrowserAnimationAdapterFactory, createBrowserAFXFrameScheduler } from "./BrowserAnimationAdapter";
import { createBrowserAnimationLayerHost } from "./BrowserAnimationLayerHost";
import { BrowserSoundAdapterFactory, type BrowserSoundPlatform } from "./BrowserSoundAdapter";
import { createBrowserAudioResourceLoader } from "./BrowserAudioResourceLoader";
import { BrowserAudioFileAdapter } from "./BrowserAudioFileAdapter";
import { RuntimeAudioFileService } from "../HostServices/PlatformAdapterRuntimeServices";
import { BrowserWebContentAdapterFactory } from "./BrowserWebContentAdapter";
import type { BrowserCursorImageResourcePort } from "./browserPointerAdapterTypes";
import { createBrowserHostYield } from "./browserHostYield";
import type { BrowserTextMeasurementSurface } from "./browserTextLayoutAdapterTypes";
import { createBrowserImagePlatform } from "./BrowserImagePlatform";
import { createSynCloudOSBrowserRouteSynchronizer } from "./BrowserRouteSync";
import { createBrowserMonotonicNowSeconds } from "./BrowserMediaClock";
import { TFXUnsupportedTextLayoutFeatureError, type TFXTextHitTestRequest, type TFXTextMeasureRequest } from "../SynCloudOS";

/**
 * A Node/Electron host exposes a native Proxy brand probe. Keep that ambient
 * host access inside the browser-platform seam so AppSDK payload ownership
 * never reaches for a runtime global directly.
 */
export function nativeProxyProbe(): ((value: object) => boolean) | undefined {
  try {
    const processLike = (globalThis as typeof globalThis & {
      readonly process?: { readonly getBuiltinModule?: (name: string) => unknown };
    }).process;
    const util = processLike?.getBuiltinModule?.("node:util") as {
      readonly types?: { readonly isProxy?: (candidate: object) => boolean };
    } | undefined;
    const probe = util?.types?.isProxy;
    return typeof probe === "function" ? (value) => probe(value) === true : undefined;
  } catch {
    return undefined;
  }
}

/** Retained for host-seam tests that need a simple boolean brand check. */
export function hasNativeProxyBrand(value: object): boolean {
  return nativeProxyProbe()?.(value) === true;
}

function createBrowserSoundPlatform(browserDocument: Document, browserWindow: Window, sharedLoadBytes = createBrowserAudioResourceLoader(browserWindow)): BrowserSoundPlatform {
  return {
    loadBytes: sharedLoadBytes,
    createObjectURL(bytes, mimeType) {
      const owned = new Uint8Array(bytes.byteLength);
      owned.set(bytes);
      return URL.createObjectURL(new Blob([owned.buffer], { type: mimeType }));
    },
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAudioElement() {
      const element = browserDocument.createElement("audio");
      return {
        get src() { return element.src; }, set src(value) { element.src = value; },
        get preload() { return element.preload; }, set preload(value) { element.preload = value; },
        get loop() { return element.loop; }, set loop(value) { element.loop = value; },
        get volume() { return element.volume; }, set volume(value) { element.volume = value; },
        get playbackRate() { return element.playbackRate; }, set playbackRate(value) { element.playbackRate = value; },
        get currentTime() { return element.currentTime; }, set currentTime(value) { element.currentTime = value; },
        get duration() { return element.duration; },
        play: () => element.play(),
        pause: () => element.pause(),
        addEventListener: (type, listener) => element.addEventListener(type, listener),
        removeEventListener: (type, listener) => element.removeEventListener(type, listener),
        clearSource() { element.removeAttribute("src"); element.load(); },
      };
    },
    randomUUID: () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `sound-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    isUserActive: () => browserWindow.navigator.userActivation?.isActive === true,
    expireActivation: (callback) => browserWindow.queueMicrotask(callback),
  };
}

/** Browser memory measurement for diagnostics. measureUserAgentSpecificMemory
 * needs cross-origin isolation; performance.memory is Chromium-only and
 * coarse. Unavailable figures are null, never estimated. */
function createBrowserMemorySampler() {
  return Object.freeze({
    async sample() {
      const performanceWithMemory = typeof performance === "undefined" ? undefined : performance as Performance & {
        readonly memory?: { readonly usedJSHeapSize: number; readonly totalJSHeapSize: number; readonly jsHeapSizeLimit: number };
        measureUserAgentSpecificMemory?: () => Promise<{ readonly bytes: number }>;
      };
      let userAgentSpecificBytes: number | null = null;
      let source = "unavailable";
      if (typeof performanceWithMemory?.measureUserAgentSpecificMemory === "function" && globalThis.crossOriginIsolated === true) {
        try {
          userAgentSpecificBytes = (await performanceWithMemory.measureUserAgentSpecificMemory()).bytes;
          source = "measureUserAgentSpecificMemory";
        } catch { /* not permitted in this context */ }
      }
      const heap = performanceWithMemory?.memory;
      if (heap && source === "unavailable") source = "performance.memory";
      return Object.freeze({
        source,
        jsHeapUsedBytes: heap?.usedJSHeapSize ?? null,
        jsHeapTotalBytes: heap?.totalJSHeapSize ?? null,
        jsHeapLimitBytes: heap?.jsHeapSizeLimit ?? null,
        userAgentSpecificBytes,
        domNodes: typeof document === "undefined" ? null : document.getElementsByTagName("*").length,
      });
    },
  });
}

interface BrowserNetworkInformation extends EventTarget {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

/** Data-saving preference and link quality from the Network Information API
 * (Chromium); absent elsewhere. */
function createBrowserNetworkHints(browserNavigator: Navigator | null | undefined) {
  const connection = (browserNavigator as (Navigator & { readonly connection?: BrowserNetworkInformation }) | null | undefined)?.connection;
  if (!connection || typeof connection.addEventListener !== "function") return undefined;
  const read = () => Object.freeze({
    ...(typeof connection.saveData === "boolean" ? { saveData: connection.saveData } : {}),
    ...(typeof connection.effectiveType === "string" ? { effectiveType: connection.effectiveType } : {}),
  });
  return Object.freeze({
    getSnapshot: read,
    subscribe(listener: (hints: ReturnType<typeof read>) => void) {
      const onChange = () => listener(read());
      connection.addEventListener("change", onChange);
      return () => connection.removeEventListener("change", onChange);
    },
  });
}

/** Main-thread long tasks from the Long Tasks API, when supported. */
function observeBrowserLongTasks(listener: (durationMs: number) => void): () => void {
  if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
    return () => undefined;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) listener(entry.duration);
  });
  try {
    observer.observe({ type: "longtask" });
  } catch {
    return () => undefined;
  }
  return () => observer.disconnect();
}

function createBrowserTextMeasurementSurface(browserDocument: Document): BrowserTextMeasurementSurface {
  const host = browserDocument.createElement("span");
  host.dataset.syncloudosTextMeasurement = "";
  const textNode = browserDocument.createTextNode("");
  const baselineMarker = browserDocument.createElement("span");
  Object.assign(baselineMarker.style, { display: "inline-block", width: "0", height: "0", padding: "0", margin: "0" });
  host.append(textNode, baselineMarker);
  Object.assign(host.style, {
    position: "fixed", left: "-100000px", top: "0", visibility: "hidden",
    whiteSpace: "pre", pointerEvents: "none", contain: "layout style paint",
  });
  browserDocument.body.append(host);
  let disposed = false;
  // A surface may serve a batch of measurements; its complete style state is
  // rewritten whenever any styling input differs from the previous request.
  let appliedStyle: string | null = null;
  let graphemeSegmenter: { readonly locale: string; readonly segmenter: Intl.Segmenter } | null = null;
  const prepare = (request: Omit<TFXTextHitTestRequest, "point">) => {
    if (disposed) throw new DOMException("Measurement surface disposed.", "AbortError");
    request.signal.throwIfAborted();
    const writingMode = request.writingMode ?? "horizontal-tb";
    const style = [request.font.families.join("\u0001"), request.font.size, request.font.weight, request.font.style, request.font.stretch, request.direction, writingMode, request.locale].join("\u0000");
    if (style !== appliedStyle) {
      host.style.fontFamily = request.font.families.map((family) => JSON.stringify(family)).join(", ");
      host.style.fontSize = `${request.font.size}px`;
      host.style.fontWeight = String(request.font.weight);
      host.style.fontStyle = request.font.style;
      host.style.fontStretch = request.font.stretch;
      host.style.direction = request.direction;
      host.style.writingMode = writingMode;
      host.lang = request.locale;
      host.dir = request.direction;
      appliedStyle = style;
    }
    if (textNode.data !== request.text) textNode.data = request.text;
  };
  const rangeRect = (start: number, end: number) => {
    const range = browserDocument.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const rect = range.getBoundingClientRect();
    range.detach?.();
    return rect;
  };
  return {
    measure(request: TFXTextMeasureRequest) {
      prepare(request);
      const rect = rangeRect(0, request.text.length);
      const computed = browserDocument.defaultView?.getComputedStyle(host);
      const lineHeight = Number.parseFloat(computed?.lineHeight ?? "") || request.font.size * 1.2;
      const height = rect.height || lineHeight;
      const markerRect = baselineMarker.getBoundingClientRect();
      const ascent = Math.max(0, Math.min(height, markerRect.top - rect.top));
      return Object.freeze({
        advance: rect.width,
        ascent,
        descent: height - ascent,
        baseline: ascent,
        inkBounds: Object.freeze({ x: 0, y: 0, width: rect.width, height }),
      });
    },
    rangeRects(request) {
      prepare(request);
      const textBounds = rangeRect(0, request.text.length);
      const range = browserDocument.createRange();
      range.setStart(textNode, request.range.location);
      range.setEnd(textNode, request.range.location + request.range.length);
      const rects = Array.from(range.getClientRects(), (rect) => Object.freeze({
        x: Math.max(0, rect.x - textBounds.x),
        y: Math.max(0, rect.y - textBounds.y),
        width: rect.width,
        height: rect.height,
      }));
      range.detach?.();
      return Object.freeze(rects);
    },
    hitTest(request: TFXTextHitTestRequest) {
      prepare(request);
      const textBounds = rangeRect(0, request.text.length);
      const absolutePoint = { x: textBounds.x + request.point.x, y: textBounds.y + request.point.y };
      const boundaries = [0];
      if (typeof Intl.Segmenter !== "function") throw new TFXUnsupportedTextLayoutFeatureError("text-segmentation");
      if (graphemeSegmenter?.locale !== request.locale)
        graphemeSegmenter = { locale: request.locale, segmenter: new Intl.Segmenter(request.locale, { granularity: "grapheme" }) };
      const segmenter = graphemeSegmenter.segmenter;
      for (const segment of segmenter.segment(request.text)) boundaries.push(segment.index + segment.segment.length);
      if (boundaries.length > 100_001) throw new RangeError("Hit testing exceeds the grapheme limit.");
      const edgeAt = (index: number) => {
        const rect = rangeRect(0, boundaries[index]!);
        return request.direction === "rtl" ? rect.left : rect.right;
      };
      let low = 0;
      let high = boundaries.length - 1;
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        const beforePoint = request.direction === "rtl" ? edgeAt(middle) > absolutePoint.x : edgeAt(middle) < absolutePoint.x;
        if (beforePoint) low = middle;
        else high = middle;
      }
      const lowDistance = Math.abs(edgeAt(low) - absolutePoint.x);
      const highDistance = Math.abs(edgeAt(high) - absolutePoint.x);
      const bestIndex = lowDistance <= highDistance ? low : high;
      return Object.freeze({ offset: boundaries[bestIndex]!, affinity: bestIndex === low ? "upstream" as const : "downstream" as const });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      host.remove();
    },
  };
}


const serverLocation: RuntimeBrowserLocation = {
  href: "http://syncloudos.invalid/",
  origin: "http://syncloudos.invalid",
  pathname: "/",
  search: "",
  hash: "",
};

function createSnapshotSource<T>(
  readSnapshot: () => T,
  install?: (notify: () => void) => () => void,
): RuntimeSnapshotSource<T> {
  const listeners = new Set<(snapshot: T) => void>();
  let disposeEvents: (() => void) | null = null;
  // React's useSyncExternalStore requires getSnapshot() to retain identity
  // until the subscribed platform source reports a change. Browser readers
  // naturally allocate structural snapshots, so returning them directly
  // turns an otherwise idle overlay into an endless external-store rerender.
  let snapshot = readSnapshot();
  const refresh = () => {
    const next = readSnapshot();
    if (sameSnapshotValue(snapshot, next)) return false;
    snapshot = next;
    return true;
  };
  const notify = () => {
    if (!refresh()) return;
    for (const listener of listeners) listener(snapshot);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      // A source may have changed while no consumer was subscribed. Refresh
      // once at subscription time; React compares this stable value after it
      // installs the listener and schedules the necessary reconciliation.
      refresh();
      listeners.add(listener);
      if (listeners.size === 1) disposeEvents = install?.(notify) ?? null;
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          disposeEvents?.();
          disposeEvents = null;
        }
      };
    },
  };
}

/**
 * Browser snapshot readers return fresh structural objects. Keep the previous
 * reference when their observable fields did not change so an external-store
 * subscriber can safely re-install its listener during a React render.
 */
function sameSnapshotValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((value, index) => sameSnapshotValue(value, right[index]));
  }
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => (
    Object.prototype.hasOwnProperty.call(rightRecord, key) && sameSnapshotValue(leftRecord[key], rightRecord[key])
  ));
}

function installWindowEvents(
  types: readonly (keyof WindowEventMap)[],
  notify: () => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  for (const type of types) window.addEventListener(type, notify);
  const orientation = window.screen.orientation;
  orientation?.addEventListener?.("change", notify);
  return () => {
    for (const type of types) window.removeEventListener(type, notify);
    orientation?.removeEventListener?.("change", notify);
  };
}

function readLayoutViewport(): RuntimeLayoutViewportSnapshot {
  return {
    width: typeof window === "undefined" ? 1440 : window.innerWidth,
    height: typeof window === "undefined" ? 900 : window.innerHeight,
  };
}

function createMediaQuery(query: string): RuntimeMediaQuery {
  const media = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query)
    : null;
  const listeners = new Set<(matches: boolean) => void>();
  const handleChange = (event: MediaQueryListEvent) => listeners.forEach((listener) => listener(event.matches));
  media?.addEventListener?.("change", handleChange);
  return {
    media: query,
    get matches() {
      return media?.matches ?? false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      media?.removeEventListener?.("change", handleChange);
      listeners.clear();
    },
  };
}

function readVisualViewport(): RuntimeVisualViewportSnapshot | null {
  if (typeof window === "undefined" || !window.visualViewport) return null;
  return {
    width: window.visualViewport.width,
    height: window.visualViewport.height,
    offsetLeft: window.visualViewport.offsetLeft,
    offsetTop: window.visualViewport.offsetTop,
    scale: window.visualViewport.scale,
  };
}

function readScreen(): RuntimeScreenSnapshot {
  const screen = typeof window === "undefined" ? null : window.screen;
  const extendedScreen = screen as (Screen & { availLeft?: number; availTop?: number }) | null;
  const orientation = screen?.orientation?.type ?? "unknown";
  return {
    width: screen?.width ?? 1440,
    height: screen?.height ?? 900,
    availableLeft: extendedScreen?.availLeft ?? 0,
    availableTop: extendedScreen?.availTop ?? 0,
    availableWidth: screen?.availWidth ?? 1440,
    availableHeight: screen?.availHeight ?? 900,
    colourDepth: screen?.colorDepth ?? 24,
    pixelDepth: screen?.pixelDepth ?? 24,
    orientation: ["portrait-primary", "portrait-secondary", "landscape-primary", "landscape-secondary"].includes(orientation)
      ? orientation as RuntimeScreenSnapshot["orientation"]
      : "unknown",
  };
}

/**
 * Browsers do not expose a trustworthy imperative safe-area measurement on
 * the runtime environment. Keep the explicit unavailable projection here so
 * callers cannot mistake a fabricated JS value for layout authority; tab
 * surfaces continue to use CSS `env(safe-area-inset-*)` directly.
 */
const unavailableBrowserSafeArea = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

function readWorkArea(): RuntimeWorkAreaSnapshot {
  const screen = readScreen();
  return {
    x: screen.availableLeft,
    y: screen.availableTop,
    width: screen.availableWidth,
    height: screen.availableHeight,
    devicePixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    safeArea: unavailableBrowserSafeArea,
  };
}

function createBrowserImageGeometryPort(browserWindow: Window | null): RuntimeImageGeometryPort | null {
  const ResizeObserverConstructor = (browserWindow as (Window & { readonly ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
  if (typeof ResizeObserverConstructor !== "function") return null;
  return Object.freeze({
    measure(element: HTMLElement) {
      const rect = element.getBoundingClientRect();
      return Object.freeze({ width: rect.width, height: rect.height });
    },
    observe(element: HTMLElement, listener: () => void) {
      const observer = new ResizeObserverConstructor(() => listener());
      observer.observe(element);
      return () => observer.disconnect();
    },
  });
}

export function createBrowserRuntimeEnvironment(options: { readonly cursorImages?: BrowserCursorImageResourcePort | null } = {}): SynCloudOSRuntimeEnvironment {
  const browser = {
    getLocation(): RuntimeBrowserLocation {
      if (typeof window === "undefined") return serverLocation;
      return {
        href: window.location.href,
        origin: window.location.origin,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      };
    },
    getWindow: () => typeof window === "undefined" ? null : window,
    getDocument: () => typeof document === "undefined" ? null : document,
    getNavigator: () => typeof navigator === "undefined" ? null : navigator,
  };
  const routeSynchronization = createSynCloudOSBrowserRouteSynchronizer(browser);
  const navigation = typeof window !== "undefined"
    ? (window as Window & { navigation?: BrowserNavigationTarget }).navigation ?? null
    : null;
  const localStorage = typeof window !== "undefined" ? window.localStorage ?? null : null;
  const sessionStorage = typeof window !== "undefined" ? window.sessionStorage ?? null : null;
  const layoutViewport = createSnapshotSource(readLayoutViewport, (notify) => installWindowEvents(["resize"], notify));
  const visualViewport = createSnapshotSource(readVisualViewport, (notify) => {
    if (typeof window === "undefined" || !window.visualViewport) return () => undefined;
    window.visualViewport.addEventListener("resize", notify);
    window.visualViewport.addEventListener("scroll", notify);
    return () => {
      window.visualViewport?.removeEventListener("resize", notify);
      window.visualViewport?.removeEventListener("scroll", notify);
    };
  });
  const screen = createSnapshotSource(readScreen, (notify) => installWindowEvents(["resize"], notify));
  const workArea = createSnapshotSource(readWorkArea, (notify) => installWindowEvents(["resize"], notify));
  const browserWindow = typeof window === "undefined" ? null : window;
  const monotonicNowSeconds = createBrowserMonotonicNowSeconds(
    typeof performance === "undefined" ? null : performance,
  );
  const browserAudioLoadBytes = browserWindow ? createBrowserAudioResourceLoader(browserWindow) : null;
  const imageGeometry = createBrowserImageGeometryPort(browserWindow);
  const filePicker = createBrowserFilePickerPort(browserWindow);
  const browserNavigator = typeof navigator === "undefined" ? null : navigator;
  const clipboard = new BrowserClipboardAdapter({
    clipboard: browserNavigator?.clipboard ?? null,
    isSecureContext: () => browserWindow?.isSecureContext ?? false,
    isUserActive: () => browserNavigator?.userActivation?.isActive ?? false,
    createItem: typeof ClipboardItem !== "undefined"
      ? (values) => new ClipboardItem(values)
      : null,
  });
  const pointer = new BrowserPointerAdapter({
    cursorImages: options.cursorImages,
    createResizeObserver: (callback) => typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => callback(entries)),
    createIntersectionObserver: (callback) => typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => callback(entries)),
  });
  const textLayout = new BrowserTextLayoutAdapterFactory({
    ...(typeof document !== "undefined" && typeof FontFace === "function"
      ? createBrowserFontFaceRegistrationPort(document.fonts, FontFace)
      : {}),
    createSegmenter(locale, granularity) {
      if (typeof Intl.Segmenter !== "function") return null;
      const segmenter = new Intl.Segmenter(locale, { granularity });
      return {
        segment(text) {
          return Object.freeze(Array.from(segmenter.segment(text), (entry) => Object.freeze({
            segment: entry.segment,
            index: entry.index,
            end: entry.index + entry.segment.length,
            breakOpportunity: granularity === "word" ? !entry.isWordLike || /^\s+$/u.test(entry.segment) : false,
          })));
        },
      };
    },
    createMeasurementSurface: () => typeof document === "undefined" || !document.body
      ? null
      : createBrowserTextMeasurementSurface(document),
    yieldToHost: createBrowserHostYield(browserWindow ?? { setTimeout: (callback, delay) => setTimeout(callback, delay) }),
  });
  const images = browserWindow && typeof document !== "undefined"
    ? new BrowserImageAdapterFactory(createBrowserImagePlatform(document, browserWindow))
    : null;
  const animation = new BrowserAnimationAdapterFactory({
    subscribeVisibility(listener) {
      const ownerDocument = browserWindow?.document;
      ownerDocument?.addEventListener("visibilitychange", listener);
      return () => ownerDocument?.removeEventListener("visibilitychange", listener);
    },
    isHidden(target) {
      if (typeof Element === "undefined" || !(target instanceof Element)) return false;
      const style = target.ownerDocument.defaultView?.getComputedStyle(target);
      return target.ownerDocument.visibilityState === "hidden" || target.hasAttribute("hidden") || style?.display === "none" || style?.visibility === "hidden";
    },
    applyFinal(target, values) {
      if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return;
      for (const [property, value] of Object.entries(values)) {
        if (typeof value !== "string" && typeof value !== "number") continue;
        (target.style as unknown as Record<string, string>)[property] = String(value);
      }
    },
    applyScrollPosition(target, value) {
      if (typeof Element === "undefined" || !(target instanceof Element)) return;
      target.scrollTo({ left: value.x, top: value.y, behavior: "auto" });
    },
    animate(target, keyframes, animationOptions) {
      if (typeof Element === "undefined" || !(target instanceof Element) || typeof target.animate !== "function") return null;
      const native = target.animate(keyframes as Keyframe[], animationOptions as KeyframeAnimationOptions);
      return {
        get currentTime() { return typeof native.currentTime === "number" ? native.currentTime : null; },
        get playState() { return native.playState; },
        play: () => native.play(),
        pause: () => native.pause(),
        cancel: () => native.cancel(),
        addEventListener: (type, listener) => native.addEventListener(type, listener),
        removeEventListener: (type, listener) => native.removeEventListener(type, listener),
      };
    },
    now: () => Date.now(),
    supportsLinearEasing: typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timing-function", "linear(0, 1)"),
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancelScheduled: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  const sound = browserWindow && typeof document !== "undefined"
    ? new BrowserSoundAdapterFactory(createBrowserSoundPlatform(document, browserWindow, browserAudioLoadBytes!))
    : null;
  const webContent = browserWindow ? new BrowserWebContentAdapterFactory({
    createObjectURL: (content) => browserWindow.URL.createObjectURL(new Blob([content], { type: "text/html;charset=utf-8" })),
    revokeObjectURL: (url) => browserWindow.URL.revokeObjectURL(url),
    frameWindow(frame) {
      try { return frame instanceof browserWindow.HTMLIFrameElement ? frame.contentWindow : null; }
      catch { return null; }
    },
    postMessage(frame, message, targetOrigin) {
      if (!(frame instanceof browserWindow.HTMLIFrameElement) || !frame.contentWindow) throw new TypeError("Web content frame is unavailable.");
      frame.contentWindow.postMessage(message, targetOrigin);
    },
    openExternal(url) {
      const opened = browserWindow.open(url, "_blank", "noopener,noreferrer");
      if (opened) opened.opener = null;
      return opened !== null;
    },
    subscribeMessages(listener) {
      const receive = (event: MessageEvent) => listener({ source: event.source, origin: event.origin, data: event.data });
      browserWindow.addEventListener("message", receive);
      return () => browserWindow.removeEventListener("message", receive);
    },
    randomUUID: () => {
      if (typeof browserWindow.crypto?.randomUUID === "function") return browserWindow.crypto.randomUUID();
      if (typeof browserWindow.crypto?.getRandomValues !== "function") throw new DOMException("Secure randomness is unavailable.", "NotSupportedError");
      const bytes = new Uint8Array(16); browserWindow.crypto.getRandomValues(bytes);
      return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    },
  }) : null;

  const isNativeProxy = nativeProxyProbe();
  return {
    navigation,
    browser,
    routeSynchronization,
    localStorage,
    sessionStorage,
    platform: typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
      ? "mac"
      : typeof navigator !== "undefined" && /Win/i.test(navigator.platform)
        ? "windows"
        : typeof navigator !== "undefined" && /Linux/i.test(navigator.platform)
          ? "linux"
          : "unknown",
    layoutViewport,
    visualViewport,
    screen,
    workArea,
    clipboard,
    pointer,
    textLayout,
    images,
    imageGeometry,
    filePicker,
    animation,
    animationFrames: browserWindow ? createBrowserAFXFrameScheduler(browserWindow, browserWindow.document) : undefined,
    animationLayers: browserWindow ? createBrowserAnimationLayerHost(browserWindow.document, createBrowserAFXFrameScheduler(browserWindow, browserWindow.document)) : undefined,
    audio: sound,
    audioCapture: new BrowserAudioCaptureAdapter(browserWindow && typeof navigator !== "undefined" ? createBrowserAudioCapturePlatform(navigator, browserWindow) : null),
    audioFiles: browserWindow && browserAudioLoadBytes ? new RuntimeAudioFileService(new BrowserAudioFileAdapter({
      loadBytes: browserAudioLoadBytes,
      ...(typeof OfflineAudioContext === "function" ? { async decode(bytes: Uint8Array) {
        const context = new OfflineAudioContext(1, 1, 48000);
        const owned = bytes.slice().buffer;
        const decoded = await context.decodeAudioData(owned);
        return { sampleRate: decoded.sampleRate, channels: Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel)) };
      } } : {}),
      ...(typeof (globalThis as any).AudioDecoder?.isConfigSupported === "function" ? { async probeDecoder(configuration: { codec: string; sampleRate: number; channelCount: number }) {
        const result = await (globalThis as any).AudioDecoder.isConfigSupported({ codec: configuration.codec, sampleRate: configuration.sampleRate, numberOfChannels: configuration.channelCount });
        return result?.supported === true;
      } } : {}),
      ...(typeof (globalThis as any).AudioEncoder?.isConfigSupported === "function" ? { async probeEncoder(configuration: { codec: string; sampleRate: number; channelCount: number; bitrate?: number }) {
        const result = await (globalThis as any).AudioEncoder.isConfigSupported({ codec: configuration.codec, sampleRate: configuration.sampleRate, numberOfChannels: configuration.channelCount, ...(configuration.bitrate === undefined ? {} : { bitrate: configuration.bitrate }) });
        return result?.supported === true;
      } } : {}),
    })) : undefined,
    motion: browserWindow && typeof document !== "undefined" ? new BrowserMotionAdapter(browserWindow, document) : undefined,
    videoCapture: new BrowserVideoCaptureAdapter(browserNavigator ? createBrowserVideoCapturePlatform(browserNavigator) : null),
    videoDecoder: { createBackend: (options) => new BrowserVideoDecoder(options) },
    videoEncoder: { createBackend: () => new BrowserVideoEncoder() },
    videoProcessing: { createBackend: ownerId => createBrowserVideoWorkerTransport(ownerId) },
    location: browserWindow && browserNavigator ? new BrowserLocationAdapter(browserWindow, browserNavigator) : undefined,
    midi: browserNavigator ? new BrowserMIDIAdapter(browserNavigator) : undefined,
    luminaIndex: createBrowserLuminaIndexBackendFactory(undefined, {
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    }),
    logicalProcessorCount: typeof navigator === "undefined" ? undefined : navigator.hardwareConcurrency,
    deviceMemoryGiB: typeof navigator === "undefined" ? undefined : (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory,
    network: createBrowserNetworkHints(browserNavigator),
    observeLongTasks: typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")
      ? observeBrowserLongTasks : undefined,
    memory: createBrowserMemorySampler(),
    hapticFeedback: {
      navigator: browserNavigator,
      document: typeof document === "undefined" ? null : document,
      requestAnimationFrame: browserWindow?.requestAnimationFrame.bind(browserWindow) ?? null,
      cancelAnimationFrame: browserWindow?.cancelAnimationFrame.bind(browserWindow) ?? null,
    },
    systemFeedbackAudioContext: (options) => {
      if (!browserWindow) return null;
      const host = browserWindow as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Constructor = host.AudioContext ?? host.webkitAudioContext;
      return Constructor ? new Constructor(options) : null;
    },
    webContent,
    ...(isNativeProxy ? { isNativeProxy } : {}),
    ...(monotonicNowSeconds ? { monotonicNowSeconds } : {}),
    now: () => Date.now(),
    randomUUID: () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    requestAnimationFrame: (callback) => typeof window !== "undefined" && window.requestAnimationFrame
      ? window.requestAnimationFrame(callback)
      : setTimeout(() => callback(Date.now()), 16),
    cancelAnimationFrame: (handle) => {
      if (typeof window !== "undefined" && window.cancelAnimationFrame) window.cancelAnimationFrame(handle as number);
      else clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
    matchMedia: createMediaQuery,
    addWindowListener(type, listener, options) {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener(type, listener as EventListener, options);
      return () => window.removeEventListener(type, listener as EventListener, options);
    },
  };
}
