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
  useSyncExternalStore,
  type HTMLAttributes,
} from "react";
import type { RuntimeImageResource } from "../../../SynCloudOS/SynCloudOS";
import {
  useIFXImageBox,
  useIFXImageStringSource,
  useIFXImageViewport,
  type IFXImageDimensions,
  type IFXImageGeometryPort,
  type IFXImageStringSourcePort,
} from "../../../FX/ImageFX/IFXImageViewport";
import { classes } from "../Core/nseControlsShared";
import { useNSEAnimationEnvironment } from "../../Animation/NSEAnimationEnvironment";
import type { AFXLayer } from "../../../FX/AnimationFX/AFXLayer";

/** @internal Zoom control for NSEImageView's +/− buttons. */
export interface NSESizeableImageHandle {
  getZoom: () => number;
  isZoomIn: () => boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

/** @internal */
export interface NSESizeableImageProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  src: string | RuntimeImageResource;
  geometry?: IFXImageGeometryPort;
  /**
   * Runtime- or standalone-owned string source loader. Unlike an ambient Image
   * constructor, the caller owns decoding, cancellation, and eventual release.
   */
  imageSource?: IFXImageStringSourcePort;
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
  onImageLoaded?: (dimensions: IFXImageDimensions) => void;
  onZoomChange?: (zoom: number) => void;
}

/**
 * @internal NSEImageView's drawing: an NSImage-like resource (template tint, cap insets, resizing mode)
 * or a leased string source, on ImageFX's zoom and pan viewport.
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
    const activeStringLease = useIFXImageStringSource(stringSource, imageSource, onImageLoaded, !resource);
    const resolvedSrc: string = resource
      ? (resourceReady ? resource.src : "")
      : (activeStringLease?.src ?? (imageSource ? "" : stringSource ?? ""));
    const resolvedAlt = alt || resource?.accessibleLabel || "";
    const renderingMode = resource?.renderingMode ?? "original";
    const tintColour = resource?.tintColour ?? null;
    const capInsets = resource?.capInsets ?? null;
    const resizingMode = resource?.resizingMode ?? "stretch";
    const resourceNatural = useMemo(() => resourceReady && resource?.intrinsicSize
      ? { width: resource.intrinsicSize.width, height: resource.intrinsicSize.height }
      : null, [resource?.intrinsicSize?.height, resource?.intrinsicSize?.width, resourceReady]);
    const natural = useMemo(() => resource ? resourceNatural : activeStringLease?.dimensions ?? null, [activeStringLease?.dimensions, resource, resourceNatural]);
    const activeGeometry = resource ? geometry : imageSource?.geometry;
    const box = useIFXImageBox(boxRef, activeGeometry, resource ? resourceNatural : null, [resource, resource?.state, resource?.revision]);

    // A resource already knows its size; report it once it is ready.
    useEffect(() => {
      if (resource && resource.state === "ready" && resource.intrinsicSize) {
        onImageLoaded?.({ width: resource.intrinsicSize.width, height: resource.intrinsicSize.height });
      }
    }, [onImageLoaded, resource, resource?.intrinsicSize?.height, resource?.intrinsicSize?.width, resource?.state]);

    const viewport = useIFXImageViewport({
      boxRef, box, natural, geometry: activeGeometry, fitsImage: autoSize,
      maxZoomRatio, zoomStep, wheelZoom, pannable, ...(onZoomChange ? { onZoomChange } : {}),
    });
    const { pan } = viewport;

    useImperativeHandle(ref, () => ({
      getZoom: () => viewport.zoom,
      isZoomIn: () => viewport.isZoomedIn,
      zoomIn: viewport.zoomIn,
      zoomOut: viewport.zoomOut,
      reset: viewport.zoomToFit,
    }), [viewport]);

    const renderedW = viewport.renderedWidth;
    const renderedH = viewport.renderedHeight;
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
        data-zoomed={viewport.isZoomedIn ? "true" : "false"}
        data-pannable={viewport.canPan ? "true" : "false"}
        {...viewport.handlers}
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

/**
 * NSImageView.imageScaling. `proportionallyUpOrDown` fits the image to the view; `none` shows it at its
 * natural size, panned by dragging.
 */
export type NSEImageScaling = "proportionallyUpOrDown" | "none";

export interface NSEImageViewProps extends Omit<NSESizeableImageProps, "ref" | "autoSize"> {
  /** NSView.wantsLayer. The backing layer belongs to this mounted view. */
  wantsLayer?: boolean;
  /** NSImageView.imageScaling. Default `proportionallyUpOrDown`. */
  imageScaling?: NSEImageScaling;
  /** Show the +/− zoom controls. Default true. */
  controls?: boolean;
  zoomInLabel?: string;
  zoomOutLabel?: string;
}

/** NSImageView's host element bridge and optional NSView.layer backing. */
export interface NSEImageViewHandle {
  readonly element: HTMLDivElement;
  readonly layer: AFXLayer | null;
}

/**
NSImageView: an image in a framed box, fitted (or at natural size with `imageScaling="none"`), with
optional +/− zoom controls. Wheel and double-click zoom; drag pans once the image overflows the box.
*/
export const NSEImageView = forwardRef<NSEImageViewHandle, NSEImageViewProps>(function NSEImageView({
  wantsLayer = false,
  imageScaling = "proportionallyUpOrDown",
  controls = true,
  zoomInLabel = "Zoom in",
  zoomOutLabel = "Zoom out",
  className = "",
  ...props
}: NSEImageViewProps, ref) {
  const imageRef = useRef<NSESizeableImageHandle>(null);
  const host = useRef<HTMLDivElement>(null);
  const { layers } = useNSEAnimationEnvironment();
  const backing = useRef<{
    abort: AbortController;
    layer: AFXLayer | null;
    element: HTMLDivElement;
    layers: typeof layers;
    pending?: object;
  } | null>(null);
  useLayoutEffect(() => {
    const previous = backing.current;
    const release = (connection: NonNullable<typeof backing.current>) => {
      connection.abort.abort();
      connection.layer?.dispose();
      if (backing.current === connection) backing.current = null;
    };
    if (!wantsLayer) {
      if (previous) release(previous);
      return;
    }
    const reusable = previous && !previous.abort.signal.aborted && previous.element === host.current && previous.layers === layers;
    if (previous && !reusable) release(previous);
    const connection = reusable ? previous : {
      abort: new AbortController(), layer: null, element: host.current!, layers, pending: undefined as object | undefined,
    };
    connection.pending = undefined;
    backing.current = connection;
    return () => {
      // As with managed outlets, a same-turn StrictMode reconnect keeps the
      // physical view and its running presentation. Real detach retires it.
      const pending = {};
      connection.pending = pending;
      queueMicrotask(() => { if (connection.pending === pending) release(connection); });
    };
  }, [wantsLayer, layers]);
  useImperativeHandle(ref, () => ({
    element: host.current!,
    get layer() {
      const connection = backing.current;
      if (!wantsLayer || !connection || connection.pending) return null;
      if (!connection.layer) {
        if (!connection.layers?.bindLayer) throw new TypeError("Layer-backed image views require a mounted animation layer client.");
        connection.layer = connection.layers.bindLayer(connection.element, connection.abort.signal, { layout: "css" });
      }
      return connection.layer;
    },
  }), [wantsLayer, layers]);

  return (
    <div data-nse-control="image-view" data-nse-part="background" data-nse-image-scaling={imageScaling} ref={host} className={classes("nse-control-image-view", className)} data-image-scaling={imageScaling}>
      <NSESizeableImage data-nse-part="image" ref={imageRef} autoSize={imageScaling !== "none"} {...props} />
      {controls ? (
        <div data-nse-part="accessory" className="nse-control-image-view-controls" role="group" aria-label="Zoom">
          <button
            type="button"
            data-nse-part="button" className="nse-control-image-view-zoom"
            aria-label={zoomOutLabel}
            onClick={() => imageRef.current?.zoomOut()}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            data-nse-part="button" className="nse-control-image-view-zoom"
            aria-label={zoomInLabel}
            onClick={() => imageRef.current?.zoomIn()}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      ) : null}
    </div>
  );
});
