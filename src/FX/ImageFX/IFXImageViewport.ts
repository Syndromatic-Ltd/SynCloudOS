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
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react";

export interface IFXImageDimensions {
  width: number;
  height: number;
}

/** Measures an image view's box. The host supplies it; the view never reads layout itself. */
export interface IFXImageGeometryPort {
  measure(element: HTMLElement): IFXImageDimensions;
  observe(element: HTMLElement, listener: () => void): () => void;
  /** Map a browser point into the measured element. Omit when pointer-focused zoom is unavailable. */
  localPoint?(element: HTMLElement, clientX: number, clientY: number): { x: number; y: number };
}

export interface IFXImageStringSourceLease {
  readonly src: string;
  readonly dimensions: IFXImageDimensions;
  release(): void;
}

/** Loads a string image source and reports its size; the caller owns decoding, cancellation and release. */
export interface IFXImageStringSourcePort {
  readonly geometry: IFXImageGeometryPort;
  load(source: string, signal: AbortSignal): Promise<IFXImageStringSourceLease>;
}

/** The part of the source image an image view shows, in source pixels. */
export interface IFXImageVisibleRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The image's natural size. */
  readonly imageWidth: number;
  readonly imageHeight: number;
  /** Rendered pixels per source pixel. */
  readonly zoomFactor: number;
}

const EPSILON = 0.001;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function isFiniteIFXImageDimensions(value: IFXImageDimensions): boolean {
  return Number.isFinite(value.width) && Number.isFinite(value.height) && value.width > 0 && value.height > 0;
}

/** @internal Measure the box through the geometry port and keep it current on resize. */
export function useIFXImageBox(boxRef: RefObject<HTMLDivElement | null>, geometry: IFXImageGeometryPort | undefined, fallback: IFXImageDimensions | null, dependencies: readonly unknown[]) {
  const [box, setBox] = useState<IFXImageDimensions>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const assign = (next: IFXImageDimensions) => setBox((current) => current.width === next.width && current.height === next.height ? current : next);
    if (geometry) {
      assign(geometry.measure(node));
      return geometry.observe(node, () => assign(geometry.measure(node)));
    }
    assign(fallback ?? { width: 0, height: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, fallback?.width, fallback?.height, ...dependencies]);
  return box;
}

/** @internal Lease a string source's pixels and size through the source port. */
export function useIFXImageStringSource(source: string | null, imageSource: IFXImageStringSourcePort | undefined, onImageLoaded: ((dimensions: IFXImageDimensions) => void) | undefined, enabled: boolean) {
  const [held, setHeld] = useState<Readonly<{ source: string; lease: IFXImageStringSourceLease }> | null>(null);
  useEffect(() => {
    if (!enabled || !source || !imageSource) return;
    const controller = new AbortController();
    let active = true;
    let lease: IFXImageStringSourceLease | null = null;
    void imageSource.load(source, controller.signal).then((loaded) => {
      if (!active || controller.signal.aborted || !isFiniteIFXImageDimensions(loaded.dimensions) || !loaded.src) {
        loaded.release();
        return;
      }
      lease = loaded;
      setHeld({ source, lease: loaded });
      onImageLoaded?.(loaded.dimensions);
    }).catch(() => {
      if (active) setHeld((current) => current?.source === source ? null : current);
    });
    return () => {
      active = false;
      controller.abort();
      lease?.release();
      setHeld((current) => current?.source === source ? null : current);
    };
  }, [enabled, imageSource, onImageLoaded, source]);
  return held?.source === source ? held.lease : null;
}

export interface IFXImageViewportOptions {
  readonly boxRef: RefObject<HTMLDivElement | null>;
  readonly box: IFXImageDimensions;
  readonly natural: IFXImageDimensions | null;
  readonly geometry: IFXImageGeometryPort | undefined;
  /** Fit the image to the box (the fit is the minimum zoom); otherwise show it at natural size. */
  readonly fitsImage: boolean;
  readonly maxZoomRatio: number;
  readonly zoomStep: number;
  readonly wheelZoom: boolean;
  readonly pannable: boolean;
  readonly onZoomChange?: (zoom: number) => void;
}

/**
 * @internal The zoom, pan, wheel, pinch and double-click behaviour IFXImageView and NSEImageView share:
 * the image starts fitted (or at natural size), zooms about the pointer, and pans once it overflows the box.
 */
export function useIFXImageViewport({ boxRef, box, natural, geometry, fitsImage, maxZoomRatio, zoomStep, wheelZoom, pannable, onZoomChange }: IFXImageViewportOptions) {
  const [view, setView] = useState<{ zoom: number; pan: { x: number; y: number } }>({ zoom: 1, pan: { x: 0, y: 0 } });
  const { zoom, pan } = view;
  const dragRef = useRef({ pointerId: -1, startX: 0, startY: 0, panX: 0, panY: 0 });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ startDist: number; startZoom: number; focusX: number; focusY: number } | null>(null);

  const fitZoom = !natural || box.width === 0 || box.height === 0 || !fitsImage
    ? 1
    : Math.min(box.width / natural.width, box.height / natural.height);
  const minZoom = fitZoom;
  const maxZoom = minZoom * Math.max(1, maxZoomRatio);

  // Keep an enlarged image covering the box; an axis smaller than the box stays centred.
  const clampPan = useCallback((next: { x: number; y: number }, atZoom: number) => {
    if (!natural) return { x: 0, y: 0 };
    const slackX = Math.max(0, (natural.width * atZoom - box.width) / 2);
    const slackY = Math.max(0, (natural.height * atZoom - box.height) / 2);
    return { x: clamp(next.x, -slackX, slackX), y: clamp(next.y, -slackY, slackY) };
  }, [box.height, box.width, natural]);

  const applyZoom = useCallback((nextZoomRaw: number, focusX = 0, focusY = 0) => {
    setView((current) => {
      const nextZoom = clamp(nextZoomRaw, minZoom, maxZoom);
      if (Math.abs(current.zoom - nextZoom) < EPSILON) return current;
      // Keep the point under the focus (the box centre by default) fixed while scaling.
      const ratio = nextZoom / current.zoom;
      return { zoom: nextZoom, pan: clampPan({ x: focusX - (focusX - current.pan.x) * ratio, y: focusY - (focusY - current.pan.y) * ratio }, nextZoom) };
    });
  }, [clampPan, maxZoom, minZoom]);

  // Report zoom changes from an effect, never inside a state updater (which runs twice in StrictMode).
  const lastZoomRef = useRef(zoom);
  useEffect(() => {
    if (lastZoomRef.current === zoom) return;
    lastZoomRef.current = zoom;
    onZoomChange?.(zoom);
  }, [onZoomChange, zoom]);

  // A newly loaded image starts fitted. After that, when the fit changes, snap to it if the zoom has
  // left the fit-to-maximum range; otherwise keep the zoom and re-clamp the pan.
  const fittedImageRef = useRef<IFXImageDimensions | null>(null);
  useLayoutEffect(() => {
    if (!natural || box.width === 0) return;
    if (fittedImageRef.current !== natural) {
      fittedImageRef.current = natural;
      setView({ zoom: minZoom, pan: { x: 0, y: 0 } });
      return;
    }
    setView((current) => current.zoom < minZoom + EPSILON || current.zoom > maxZoom + EPSILON
      ? { zoom: minZoom, pan: { x: 0, y: 0 } }
      : { zoom: current.zoom, pan: clampPan(current.pan, current.zoom) });
  }, [minZoom, maxZoom, natural, box.width, box.height, clampPan]);

  const stepAmount = () => Math.max(EPSILON, (maxZoom - minZoom) * clamp(zoomStep, 0.05, 1));
  const canPan = pannable && natural !== null && (natural.width * zoom > box.width + 1 || natural.height * zoom > box.height + 1);

  const pointToCentre = (clientX: number, clientY: number) => {
    const node = boxRef.current;
    const local = node ? geometry?.localPoint?.(node, clientX, clientY) : undefined;
    return { x: local ? local.x - box.width / 2 : 0, y: local ? local.y - box.height / 2 : 0 };
  };

  const visibleRect = (): IFXImageVisibleRect | null => {
    if (!natural || zoom <= 0) return null;
    const width = clamp(box.width / zoom, 0, natural.width);
    const height = clamp(box.height / zoom, 0, natural.height);
    const x = clamp(natural.width / 2 - (box.width / 2 + pan.x) / zoom, 0, Math.max(0, natural.width - width));
    const y = clamp(natural.height / 2 - (box.height / 2 + pan.y) / zoom, 0, Math.max(0, natural.height - height));
    return Object.freeze({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), imageWidth: natural.width, imageHeight: natural.height, zoomFactor: zoom });
  };

  const handlers = {
    onWheel(event: ReactWheelEvent<HTMLDivElement>) {
      if (!wheelZoom || !natural) return;
      event.preventDefault();
      const focus = pointToCentre(event.clientX, event.clientY);
      applyZoom(zoom + (event.deltaY < 0 ? 1 : -1) * stepAmount(), focus.x, focus.y);
    },
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      if (!natural) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const points = [...pointersRef.current.values()];
      if (points.length === 2) {
        // A pinch zooms about the fingers' midpoint and cancels a single-finger pan.
        const startDist = Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y) || 1;
        const focus = pointToCentre((points[0]!.x + points[1]!.x) / 2, (points[0]!.y + points[1]!.y) / 2);
        pinchRef.current = { startDist, startZoom: zoom, focusX: focus.x, focusY: focus.y };
        dragRef.current.pointerId = -1;
      } else if (points.length === 1 && canPan) {
        event.preventDefault();
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
      }
    },
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      const tracked = pointersRef.current.get(event.pointerId);
      if (tracked) { tracked.x = event.clientX; tracked.y = event.clientY; }
      const points = [...pointersRef.current.values()];
      if (pinchRef.current && points.length >= 2) {
        event.preventDefault();
        const dist = Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
        applyZoom(pinchRef.current.startZoom * (dist / pinchRef.current.startDist), pinchRef.current.focusX, pinchRef.current.focusY);
        return;
      }
      if (dragRef.current.pointerId !== event.pointerId) return;
      event.preventDefault();
      const next = { x: dragRef.current.panX + (event.clientX - dragRef.current.startX), y: dragRef.current.panY + (event.clientY - dragRef.current.startY) };
      setView((current) => ({ zoom: current.zoom, pan: clampPan(next, current.zoom) }));
    },
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>) { endPointer(event); },
    onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) { endPointer(event); },
    onDoubleClick(event: ReactPointerEvent<HTMLDivElement>) {
      if (!natural) return;
      const focus = pointToCentre(event.clientX, event.clientY);
      applyZoom(zoom > minZoom + EPSILON ? minZoom : maxZoom, focus.x, focus.y);
    },
  };

  function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current.pointerId === event.pointerId) dragRef.current = { pointerId: -1, startX: 0, startY: 0, panX: 0, panY: 0 };
    // After a pinch, a finger still down takes over the pan so the gesture stays continuous.
    const remaining = [...pointersRef.current.entries()];
    if (remaining.length === 1 && canPan && dragRef.current.pointerId === -1) {
      const [id, point] = remaining[0]!;
      dragRef.current = { pointerId: id, startX: point.x, startY: point.y, panX: pan.x, panY: pan.y };
    }
  }

  return {
    zoom, pan, minZoom, maxZoom, canPan,
    isZoomedIn: zoom > minZoom + EPSILON,
    renderedWidth: natural ? natural.width * zoom : 0,
    renderedHeight: natural ? natural.height * zoom : 0,
    setZoom: (next: number) => applyZoom(next),
    zoomIn: () => applyZoom(zoom + stepAmount()),
    zoomOut: () => applyZoom(zoom - stepAmount()),
    zoomToFit: () => applyZoom(minZoom),
    visibleRect,
    handlers,
  };
}
