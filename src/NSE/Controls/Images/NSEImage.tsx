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
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ForwardedRef,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import type { RuntimeImageResource } from "../../../SynCloudOS/SynCloudOS";
import { classes, clamp } from "../Core/nseControlsShared";

export interface NSEImageDimensions {
  width: number;
  height: number;
}

/** The visible region of a croppable image, mapped back to source pixels. */
export interface NSECropParams {
  suggestedXtop: number;
  suggestedYtop: number;
  suggestedScale: number;
  suggestedXsize: number;
  suggestedYsize: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceImage: string;
  focusX: number;
  focusY: number;
}

/** Imperative zoom control for a sizeable image. */
export interface NSESizeableImageHandle {
  getZoom: () => number;
  getMinZoom: () => number;
  getMaxZoom: () => number;
  isZoomIn: () => boolean;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  /** The currently-visible region of the source image, in source pixels. */
  getCropParams: () => NSECropParams | null;
}

export interface NSESizeableImageProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  src: string | RuntimeImageResource;
  geometry?: NSEImageGeometryPort;
  /**
   * Runtime- or standalone-owned string source loader.  Unlike an ambient Image
   * constructor, the caller owns decoding, cancellation, and eventual release.
   */
  imageSource?: NSEImageStringSourcePort;
  alt?: string;
  /** Fit the image to its box on load. Default true. */
  autoSize?: boolean;
  /** Maximum zoom as a multiple of the fit zoom. Default 2. */
  maxZoomRatio?: number;
  /** Step applied by zoomIn/zoomOut and wheel ticks (fraction of the fit→max range). Default 0.25. */
  zoomStep?: number;
  /** Allow mouse-wheel zoom (centred on the cursor). Default true. */
  wheelZoom?: boolean;
  /** Allow drag-to-pan once zoomed in. Default true. */
  pannable?: boolean;
  onImageLoaded?: (dimensions: NSEImageDimensions) => void;
  onZoomChange?: (zoom: number) => void;
}

export interface NSEImageGeometryPort {
  measure(element: HTMLElement): NSEImageDimensions;
  observe(element: HTMLElement, listener: () => void): () => void;
  /** Map a browser point into the measured element.  Omit when pointer-focused zoom is unavailable. */
  localPoint?(element: HTMLElement, clientX: number, clientY: number): { x: number; y: number };
}

export interface NSEImageStringSourceLease {
  readonly src: string;
  readonly dimensions: NSEImageDimensions;
  release(): void;
}

/** Explicit browser boundary for legacy string image sources. */
export interface NSEImageStringSourcePort {
  readonly geometry: NSEImageGeometryPort;
  load(source: string, signal: AbortSignal): Promise<NSEImageStringSourceLease>;
}

const EPSILON = 0.001;

function isFiniteDimensions(value: NSEImageDimensions): boolean {
  return Number.isFinite(value.width) && Number.isFinite(value.height) && value.width > 0 && value.height > 0;
}

/**
A control that views an image with zooming: the image
loads off-screen to read its natural aspect ratio, `autoSize` fits it to the box (that fit scale is
the minimum zoom), and `maxZoomRatio` sets the ceiling. Wheel zooms about the cursor; dragging pans
once zoomed in. Imperative zoom controls are exposed via ref.
*/
export const NSESizeableImage = forwardRef<NSESizeableImageHandle, NSESizeableImageProps>(
  function NSESizeableImage(
    {
      src,
      geometry,
      imageSource,
      alt = "",
      autoSize = true,
      maxZoomRatio = 2,
      zoomStep = 0.25,
      wheelZoom = true,
      pannable = true,
      onImageLoaded,
      onZoomChange,
      className = "",
      ...props
    },
    ref
  ) {
    const boxRef = useRef<HTMLDivElement>(null);
    const resource = typeof src === "string" ? null : src;
    const stringSource = typeof src === "string" ? src : null;
    useSyncExternalStore(
      useCallback((listener) => resource?.subscribe(listener) ?? (() => undefined), [resource]),
      useCallback(() => resource?.revision ?? 0, [resource]),
      useCallback(() => resource?.revision ?? 0, [resource]),
    );
    useEffect(() => {
      if (resource) void resource.ready.catch(() => undefined);
    }, [resource]);
    const resourceReady = resource?.state === "ready";
    const [stringLease, setStringLease] = useState<Readonly<{ source: string; lease: NSEImageStringSourceLease }> | null>(null);
    const activeStringLease = stringLease?.source === stringSource ? stringLease.lease : null;
    const resolvedSrc: string = resource
      ? (resourceReady ? resource.src : "")
      : (activeStringLease?.src ?? (imageSource ? "" : stringSource ?? ""));
    const resolvedAlt = alt || resource?.accessibleLabel || "";
    const renderingMode = resource?.renderingMode ?? "original";
    const tintColour = resource?.tintColour ?? null;
    const capInsets = resource?.capInsets ?? null;
    const resizingMode = resource?.resizingMode ?? "stretch";
    const [box, setBox] = useState<NSEImageDimensions>({ width: 0, height: 0 });
    const resourceNatural = useMemo(() => resourceReady && resource?.intrinsicSize
      ? { width: resource.intrinsicSize.width, height: resource.intrinsicSize.height }
      : null, [resource?.intrinsicSize?.height, resource?.intrinsicSize?.width, resourceReady]);
    const natural = useMemo(() => resource ? resourceNatural : activeStringLease?.dimensions ?? null, [activeStringLease?.dimensions, resource, resourceNatural]);
    const [view, setView] = useState<{ zoom: number; pan: { x: number; y: number } }>({
      zoom: 1,
      pan: { x: 0, y: 0 }
    });
    const { zoom, pan } = view;
    const dragRef = useRef({ pointerId: -1, startX: 0, startY: 0, panX: 0, panY: 0 });
    // Active pointers (for two-finger pinch) and the pinch gesture's anchor.
    const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const pinchRef = useRef<{ startDist: number; startZoom: number; focusX: number; focusY: number } | null>(null);

    const fitZoom = (() => {
      if (!natural || box.width === 0 || box.height === 0) return 1;
      if (!autoSize) return 1;
      return Math.min(box.width / natural.width, box.height / natural.height);
    })();
    const minZoom = fitZoom;
    const maxZoom = minZoom * Math.max(1, maxZoomRatio);

    // Clamp a pan offset so the (possibly enlarged) image keeps covering the box; if the rendered
    // image is smaller than the box on an axis it stays centred (pan 0 there).
    const clampPan = useCallback(
      (next: { x: number; y: number }, atZoom: number) => {
        if (!natural) return { x: 0, y: 0 };
        const renderedW = natural.width * atZoom;
        const renderedH = natural.height * atZoom;
        const slackX = Math.max(0, (renderedW - box.width) / 2);
        const slackY = Math.max(0, (renderedH - box.height) / 2);
        return { x: clamp(next.x, -slackX, slackX), y: clamp(next.y, -slackY, slackY) };
      },
      [box.height, box.width, natural]
    );

    const applyZoom = useCallback(
      (nextZoomRaw: number, focusX = 0, focusY = 0) => {
        setView((current) => {
          const nextZoom = clamp(nextZoomRaw, minZoom, maxZoom);
          if (Math.abs(current.zoom - nextZoom) < EPSILON) return current;
          // Keep the point under (focusX, focusY) — box-centre by default — fixed while scaling.
          const ratio = nextZoom / current.zoom;
          const nextPan = clampPan(
            { x: focusX - (focusX - current.pan.x) * ratio, y: focusY - (focusY - current.pan.y) * ratio },
            nextZoom
          );
          return { zoom: nextZoom, pan: nextPan };
        });
      },
      [clampPan, maxZoom, minZoom]
    );

    // Surface zoom changes as an effect (never inside a state updater, which double-fires in StrictMode).
    const lastZoomRef = useRef(zoom);
    useEffect(() => {
      if (lastZoomRef.current === zoom) return;
      lastZoomRef.current = zoom;
      onZoomChange?.(zoom);
    }, [onZoomChange, zoom]);

    const activeGeometry = resource ? geometry : imageSource?.geometry;

    // Measure the box through an injected authority and keep it current on resize.
    useLayoutEffect(() => {
      const node = boxRef.current;
      if (!node) return;
      if (activeGeometry) {
        const measured = activeGeometry.measure(node);
        setBox((current) => current.width === measured.width && current.height === measured.height ? current : measured);
        return activeGeometry.observe(node, () => {
          const next = activeGeometry.measure(node);
          setBox((current) => current.width === next.width && current.height === next.height ? current : next);
        });
      }
      if (resource) {
        const fallback = resourceNatural ?? { width: 0, height: 0 };
        setBox((current) => current.width === fallback.width && current.height === fallback.height ? current : fallback);
        return;
      }
      setBox((current) => current.width === 0 && current.height === 0 ? current : { width: 0, height: 0 });
    }, [activeGeometry, resource, resource?.state, resource?.revision, resourceNatural?.height, resourceNatural?.width]);

    // Resource handles already own intrinsic size.  String sources must use an explicit,
    // cancellable lease: this component never constructs an ambient Image or observer.
    useEffect(() => {
      if (resource) {
        if (resource.state === "ready" && resource.intrinsicSize) {
          const next = { width: resource.intrinsicSize.width, height: resource.intrinsicSize.height };
          onImageLoaded?.(next);
        }
        return;
      }
      if (!stringSource || !imageSource) return;
      const controller = new AbortController();
      let active = true;
      let lease: NSEImageStringSourceLease | null = null;
      void imageSource.load(stringSource, controller.signal).then((loaded) => {
        if (!active || controller.signal.aborted) {
          loaded.release();
          return;
        }
        if (!isFiniteDimensions(loaded.dimensions) || !loaded.src) {
          loaded.release();
          return;
        }
        lease = loaded;
        setStringLease({ source: stringSource, lease: loaded });
        onImageLoaded?.(loaded.dimensions);
      }).catch(() => {
        if (active) setStringLease((current) => current?.source === stringSource ? null : current);
      });
      return () => {
        active = false;
        controller.abort();
        lease?.release();
        setStringLease((current) => current?.source === stringSource ? null : current);
      };
    }, [imageSource, onImageLoaded, resource, resource?.intrinsicSize?.height, resource?.intrinsicSize?.width, resource?.revision, resource?.state, stringSource]);

    // When the fit scale becomes known/changes and we're at (or below) it, snap to fit & recentre;
    // otherwise keep the current zoom but re-clamp the pan to the new geometry.
    useLayoutEffect(() => {
      if (!natural || box.width === 0) return;
      setView((current) => {
        if (current.zoom < minZoom + EPSILON || current.zoom > maxZoom + EPSILON) {
          return { zoom: minZoom, pan: { x: 0, y: 0 } };
        }
        return { zoom: current.zoom, pan: clampPan(current.pan, current.zoom) };
      });
    }, [minZoom, maxZoom, natural, box.width, box.height, clampPan]);

    const stepAmount = () => Math.max(EPSILON, (maxZoom - minZoom) * clamp(zoomStep, 0.05, 1));

    useImperativeHandle(
      ref,
      () => ({
        getZoom: () => zoom,
        getMinZoom: () => minZoom,
        getMaxZoom: () => maxZoom,
        isZoomIn: () => zoom > minZoom + EPSILON,
        setZoom: (next: number) => applyZoom(next),
        zoomIn: () => applyZoom(zoom + stepAmount()),
        zoomOut: () => applyZoom(zoom - stepAmount()),
        reset: () => applyZoom(minZoom),
        getCropParams: () => {
          if (!natural || zoom <= 0) return null;
          const xSize = clamp(box.width / zoom, 0, natural.width);
          const ySize = clamp(box.height / zoom, 0, natural.height);
          const xTop = clamp(natural.width / 2 - (box.width / 2 + pan.x) / zoom, 0, Math.max(0, natural.width - xSize));
          const yTop = clamp(natural.height / 2 - (box.height / 2 + pan.y) / zoom, 0, Math.max(0, natural.height - ySize));
          return {
            suggestedXtop: Math.round(xTop),
            suggestedYtop: Math.round(yTop),
            suggestedScale: zoom,
            suggestedXsize: Math.round(xSize),
            suggestedYsize: Math.round(ySize),
            sourceWidth: natural.width,
            sourceHeight: natural.height,
            sourceImage: resolvedSrc,
            focusX: Math.round(xTop + xSize / 2),
            focusY: Math.round(yTop + ySize / 2)
          };
        }
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [applyZoom, box.height, box.width, maxZoom, minZoom, natural, pan.x, pan.y, resolvedSrc, zoom]
    );

    function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
      if (!wheelZoom || !natural) return;
      event.preventDefault();
      const focus = pointToCentre(event.clientX, event.clientY);
      const direction = event.deltaY < 0 ? 1 : -1;
      applyZoom(zoom + direction * stepAmount(), focus.x, focus.y);
    }

    // Pan whenever the rendered image overflows the box on either axis (so a ScrollingImage with
    // autoSize=false pans at its base zoom too, not only past the fit scale).
    const canPan =
      pannable &&
      natural !== null &&
      (natural.width * zoom > box.width + 1 || natural.height * zoom > box.height + 1);

    const pointToCentre = (clientX: number, clientY: number) => {
      const node = boxRef.current;
      const local = node ? activeGeometry?.localPoint?.(node, clientX, clientY) : undefined;
      return {
        x: local ? local.x - box.width / 2 : 0,
        y: local ? local.y - box.height / 2 : 0
      };
    };

    function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      if (!natural) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const pts = [...pointersRef.current.values()];
      if (pts.length === 2) {
        // Begin a pinch about the midpoint of the two fingers; cancel any single-finger pan.
        const startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const focus = pointToCentre((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        pinchRef.current = { startDist, startZoom: zoom, focusX: focus.x, focusY: focus.y };
        dragRef.current.pointerId = -1;
      } else if (pts.length === 1 && canPan) {
        event.preventDefault();
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
      }
    }

    function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      const tracked = pointersRef.current.get(event.pointerId);
      if (tracked) {
        tracked.x = event.clientX;
        tracked.y = event.clientY;
      }
      const pts = [...pointersRef.current.values()];
      if (pinchRef.current && pts.length >= 2) {
        event.preventDefault();
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        applyZoom(pinchRef.current.startZoom * (dist / pinchRef.current.startDist), pinchRef.current.focusX, pinchRef.current.focusY);
        return;
      }
      if (dragRef.current.pointerId !== event.pointerId) return;
      event.preventDefault();
      const next = {
        x: dragRef.current.panX + (event.clientX - dragRef.current.startX),
        y: dragRef.current.panY + (event.clientY - dragRef.current.startY)
      };
      setView((current) => ({ zoom: current.zoom, pan: clampPan(next, current.zoom) }));
    }

    function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
      pointersRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (dragRef.current.pointerId === event.pointerId) {
        dragRef.current = { pointerId: -1, startX: 0, startY: 0, panX: 0, panY: 0 };
      }
      // After a pinch, if one finger is still down, hand it the pan so the gesture stays continuous.
      const remaining = [...pointersRef.current.entries()];
      if (remaining.length === 1 && canPan && dragRef.current.pointerId === -1) {
        const [id, point] = remaining[0];
        dragRef.current = { pointerId: id, startX: point.x, startY: point.y, panX: pan.x, panY: pan.y };
      }
    }

    function handleDoubleClick(event: ReactPointerEvent<HTMLDivElement>) {
      if (!natural) return;
      const focus = pointToCentre(event.clientX, event.clientY);
      applyZoom(zoom > minZoom + EPSILON ? minZoom : maxZoom, focus.x, focus.y);
    }

    const renderedW = natural ? natural.width * zoom : 0;
    const renderedH = natural ? natural.height * zoom : 0;
    const templateStyle = renderingMode === "template" && tintColour
      ? {
          backgroundColor: tintColour,
          WebkitMaskImage: `url("${resolvedSrc}")`,
          maskImage: `url("${resolvedSrc}")`,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        }
      : {};
    const capInsetStyle = resizingMode === "cap-insets" && capInsets
      ? {
          borderImageSource: `url("${resolvedSrc}")`,
          borderImageSlice: `${capInsets.top} ${capInsets.right} ${capInsets.bottom} ${capInsets.left} fill`,
          borderImageWidth: `${capInsets.top}px ${capInsets.right}px ${capInsets.bottom}px ${capInsets.left}px`,
          borderImageRepeat: "stretch",
        }
      : {};
    const renderedTemplate = renderingMode === "template" && Boolean(tintColour) && Boolean(resolvedSrc);
    const templateSurfaceStyle = renderedTemplate ? {
      display: "block",
      position: "absolute" as const,
      top: "50%",
      left: "50%",
      width: renderedW ? `${renderedW}px` : undefined,
      height: renderedH ? `${renderedH}px` : undefined,
      transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
      backgroundColor: tintColour ?? undefined,
      WebkitMaskImage: `url("${resolvedSrc}")`,
      maskImage: `url("${resolvedSrc}")`,
      WebkitMaskSize: "100% 100%",
      maskSize: "100% 100%",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      ...capInsetStyle,
    } : {};

    return (
      <div
        ref={boxRef}
        className={classes("nse-control-sizeable-image", className)}
        data-zoomed={zoom > minZoom + EPSILON ? "true" : "false"}
        data-pannable={canPan ? "true" : "false"}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={handleDoubleClick}
        {...props}
      >
        {resolvedSrc ? (
          <img
            className="nse-control-sizeable-image-media"
            src={resolvedSrc}
            alt={renderedTemplate ? "" : resolvedAlt}
            aria-hidden={renderedTemplate || undefined}
            draggable={false}
            data-nse-image-rendering={renderingMode}
            data-nse-image-tint={tintColour ?? undefined}
            data-nse-image-cap-insets={capInsets ? `${capInsets.top},${capInsets.right},${capInsets.bottom},${capInsets.left}` : undefined}
            data-nse-image-resizing={resizingMode}
            style={{
              width: renderedW ? `${renderedW}px` : undefined,
              height: renderedH ? `${renderedH}px` : undefined,
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
              ...templateStyle,
              ...(renderedTemplate ? { opacity: 0 } : {}),
              ...capInsetStyle,
            }}
          />
        ) : null}
        {renderedTemplate ? <span
          className="nse-control-sizeable-image-template"
          role="img"
          aria-label={resolvedAlt}
          data-nse-image-template="mask-tint"
          data-nse-image-cap-inset-rendered={capInsets ? "true" : undefined}
          style={templateSurfaceStyle}
        /> : null}
      </div>
    );
  }
);

export interface NSEImageViewProps extends Omit<NSESizeableImageProps, "ref"> {
  /** Show the +/− zoom controls. Default true. */
  controls?: boolean;
  zoomInLabel?: string;
  zoomOutLabel?: string;
}

/**
A full image viewer: an NSESizeableImage in a framed, pannable box with optional +/− zoom controls. Wheel and double-click zoom, drag pans once zoomed in.
*/
export function NSEImageView({
  controls = true,
  zoomInLabel = "Zoom in",
  zoomOutLabel = "Zoom out",
  className = "",
  ...props
}: NSEImageViewProps) {
  const imageRef = useRef<NSESizeableImageHandle>(null);

  return (
    <div className={classes("nse-control-image-view", className)}>
      <NSESizeableImage ref={imageRef} {...props} />
      {controls ? (
        <div className="nse-control-image-view-controls" role="group" aria-label="Zoom">
          <button
            type="button"
            className="nse-control-image-view-zoom"
            aria-label={zoomOutLabel}
            onClick={() => imageRef.current?.zoomOut()}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            className="nse-control-image-view-zoom"
            aria-label={zoomInLabel}
            onClick={() => imageRef.current?.zoomIn()}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export interface NSECroppableImageProps extends Omit<NSESizeableImageProps, "ref"> {
  /** Show the +/− zoom + Crop controls. Default true. */
  controls?: boolean;
  cropLabel?: string;
  zoomInLabel?: string;
  zoomOutLabel?: string;
  /** Fired with the crop parameters (source-pixel region) when Crop is pressed. */
  onCrop?: (params: NSECropParams) => void;
}

/**
A croppable, zoomable, pannable image. The visible viewport is the crop
region; pressing Crop reports the region mapped to source pixels via the SizeableImage engine.
*/
export function NSECroppableImage({
  controls = true,
  cropLabel = "Crop",
  zoomInLabel = "Zoom in",
  zoomOutLabel = "Zoom out",
  onCrop,
  className = "",
  ...props
}: NSECroppableImageProps) {
  const imageRef = useRef<NSESizeableImageHandle>(null);

  return (
    <div className={classes("nse-control-image-view", "nse-control-croppable-image", className)}>
      <NSESizeableImage ref={imageRef} {...props} />
      <div className="nse-control-croppable-image-frame" aria-hidden="true" />
      {controls ? (
        <div className="nse-control-image-view-controls" role="group" aria-label="Crop">
          <button
            type="button"
            className="nse-control-image-view-zoom"
            aria-label={zoomOutLabel}
            onClick={() => imageRef.current?.zoomOut()}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            className="nse-control-image-view-zoom"
            aria-label={zoomInLabel}
            onClick={() => imageRef.current?.zoomIn()}
          >
            <span aria-hidden="true">+</span>
          </button>
          <button
            type="button"
            className="nse-control-image-view-crop"
            onClick={() => {
              const params = imageRef.current?.getCropParams();
              if (params) onCrop?.(params);
            }}
          >
            {cropLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export type NSEScrollingImageProps = NSESizeableImageProps;

/**
A scrolling image: a sizeable image that does NOT auto-fit (`autoSize` defaults false), so the image
shows at its natural size and the user drags to pan it within the box. Wheel and pinch still zoom; the
pan now engages at the base zoom too (the image already overflows the box).
*/
export const NSEScrollingImage = forwardRef<NSESizeableImageHandle, NSEScrollingImageProps>(
  function NSEScrollingImage({ autoSize = false, className = "", ...props }, ref) {
    return (
      <NSESizeableImage
        ref={ref}
        autoSize={autoSize}
        className={classes("nse-control-scrolling-image", className)}
        {...props}
      />
    );
  }
);

export interface NSEViewImageProps extends NSESizeableImageProps {
  /** Carousel handoff: a horizontal swipe while NOT zoomed in advances to the next image. */
  onSwipeNext?: () => void;
  /** Carousel handoff: a horizontal swipe while NOT zoomed in returns to the previous image. */
  onSwipePrev?: () => void;
  /** Minimum horizontal travel (px) that counts as a swipe. Default 60. */
  swipeThreshold?: number;
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/**
A carousel image: a scrolling image built for a carousel. It auto-fits like ImageView, but while the image
is NOT zoomed in a horizontal swipe is handed off to the carousel (`onSwipePrev`/`onSwipeNext`) instead
of panning, so a flick only reaches the carousel when the image is not zoomed in. Once zoomed in, drags pan
the image and the swipe handoff is suppressed; multi-finger (pinch) gestures never trigger a swipe.
*/
export const NSEViewImage = forwardRef<NSESizeableImageHandle, NSEViewImageProps>(
  function NSEViewImage({ onSwipeNext, onSwipePrev, swipeThreshold = 60, className = "", ...props }, ref) {
    const innerRef = useRef<NSESizeableImageHandle>(null);
    const swipeRef = useRef<{ x: number; y: number; armed: boolean } | null>(null);
    const activePointers = useRef<Set<number>>(new Set());

    return (
      <div
        className={classes("nse-control-view-image", className)}
        onPointerDown={(event) => {
          activePointers.current.add(event.pointerId);
          if (activePointers.current.size > 1) {
            if (swipeRef.current) swipeRef.current.armed = false;
            return;
          }
          // Arm a swipe only when the image is at fit zoom — zoomed-in drags pan instead.
          swipeRef.current = { x: event.clientX, y: event.clientY, armed: !(innerRef.current?.isZoomIn() ?? false) };
        }}
        onPointerUp={(event) => {
          activePointers.current.delete(event.pointerId);
          const start = swipeRef.current;
          swipeRef.current = null;
          if (!start || !start.armed) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) < swipeThreshold || Math.abs(dx) <= Math.abs(dy)) return;
          (dx < 0 ? onSwipeNext : onSwipePrev)?.();
        }}
        onPointerCancel={(event) => {
          activePointers.current.delete(event.pointerId);
          swipeRef.current = null;
        }}
      >
        <NSESizeableImage
          ref={(node) => {
            innerRef.current = node;
            assignRef(ref, node);
          }}
          autoSize
          className="nse-control-view-image-media"
          {...props}
        />
      </div>
    );
  }
);

/** Imperative start and stop control for a rotating image. */
export interface NSERotatingImageHandle {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export interface NSERotatingImageProps extends HTMLAttributes<HTMLDivElement> {
  /** Background image to rotate. A falsy value defers to a stylesheet background-image. */
  imageSrc?: string;
  /** Whether the spin runs. Controllable (and toggleable via the ref's start()/stop()). Default true. */
  running?: boolean;
  /** Square edge length in px (sets width/height). Default 32. */
  size?: number;
  /** Seconds per full revolution. Default 1. */
  durationSeconds?: number;
}

/**
A continuously-rotating image: `imageSrc` is painted as the
element's background and it spins a full turn (0→360°) every `durationSeconds`, linear and infinite,
while running. `start()`/`stop()` on the ref toggle the spin;
the `running` prop drives the same state declaratively.
*/
export const NSERotatingImage = forwardRef<NSERotatingImageHandle, NSERotatingImageProps>(
  function NSERotatingImage(
    { imageSrc = "", running = true, size = 32, durationSeconds = 1, className = "", style, ...props },
    ref
  ) {
    const [isRunning, setIsRunning] = useState(running);

    // Keep internal run-state in sync when the declarative `running` prop changes.
    useEffect(() => {
      setIsRunning(running);
    }, [running]);

    useImperativeHandle(
      ref,
      () => ({
        start: () => setIsRunning(true),
        stop: () => setIsRunning(false),
        isRunning: () => isRunning
      }),
      [isRunning]
    );

    return (
      <div
        className={classes("nse-control-rotating-image", className)}
        data-running={isRunning ? "true" : "false"}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundImage: imageSrc ? `url("${imageSrc}")` : undefined,
          animationDuration: `${durationSeconds}s`,
          ...style
        }}
        {...props}
      />
    );
  }
);
