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

import { useCallback, useImperativeHandle, useMemo, useRef, useSyncExternalStore, type HTMLAttributes, type Ref } from "react";
import type { IFXImageResource } from "./IFXImageResource";
import {
  useIFXImageBox,
  useIFXImageViewport,
  type IFXImageGeometryPort,
  type IFXImageVisibleRect,
} from "./IFXImageViewport";

/** IKImageView's tool modes that ImageFX supports: moving (zoom and pan) and cropping. */
export type IFXImageToolMode = "move" | "crop";

/** IKImageView's actions, reached through the view's ref. */
export interface IFXImageViewHandle {
  /** IKImageView.zoomFactor. */
  readonly zoomFactor: number;
  zoomIn(): void;
  zoomOut(): void;
  zoomImageToFit(): void;
  /**
   * IKImageView.crop(_:): the region inside the crop frame, in source pixels. Null before the image
   * has loaded or outside the crop tool.
   */
  crop(): IFXImageVisibleRect | null;
}

export interface IFXImageViewProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** The image (IKImageView.setImage): a resource from `SCOS.images.load`. */
  readonly image: IFXImageResource;
  /** Measures the view: `SCOS.images.geometry` in an application. Without it the view takes the image's size. */
  readonly geometry?: IFXImageGeometryPort;
  /** Defaults to the image's accessible label. */
  readonly alt?: string;
  /** IKImageView.currentToolMode. Default `move`. */
  readonly currentToolMode?: IFXImageToolMode;
  /** The largest zoom, as a multiple of the fitted zoom. Default 2. */
  readonly maxZoomRatio?: number;
  /** How far zoomIn, zoomOut and a wheel tick move between the fitted and largest zoom. Default 0.25. */
  readonly zoomStep?: number;
  readonly onZoomChange?: (zoomFactor: number) => void;
  readonly ref?: Ref<IFXImageViewHandle>;
}

/**
 * IFXImageView (ImageKit's IKImageView): an image fitted to the view that zooms with the wheel, a pinch
 * or a double-click and pans once it overflows. With `currentToolMode="crop"` the view frames the region
 * it shows, and `crop()` returns that region in source pixels. It draws no controls of its own.
 */
export function IFXImageView({
  image,
  geometry,
  alt,
  currentToolMode = "move",
  maxZoomRatio = 2,
  zoomStep = 0.25,
  onZoomChange,
  className,
  ref,
  ...props
}: IFXImageViewProps) {
  if (currentToolMode !== "move" && currentToolMode !== "crop") throw new TypeError(`Unknown IFXImageView tool mode "${String(currentToolMode)}".`);
  const boxRef = useRef<HTMLDivElement>(null);
  useSyncExternalStore(
    useCallback((listener: () => void) => image.subscribe(listener), [image]),
    useCallback(() => image.revision, [image]),
    useCallback(() => image.revision, [image]),
  );
  const ready = image.state === "ready";
  const natural = useMemo(() => ready && image.intrinsicSize ? { width: image.intrinsicSize.width, height: image.intrinsicSize.height } : null,
    [image.intrinsicSize?.height, image.intrinsicSize?.width, ready]);
  const box = useIFXImageBox(boxRef, geometry, natural, [image, image.state, image.revision]);
  const viewport = useIFXImageViewport({
    boxRef, box, natural, geometry, fitsImage: true,
    maxZoomRatio, zoomStep, wheelZoom: true, pannable: true, ...(onZoomChange ? { onZoomChange } : {}),
  });
  useImperativeHandle(ref, () => ({
    get zoomFactor() { return viewport.zoom; },
    zoomIn: viewport.zoomIn,
    zoomOut: viewport.zoomOut,
    zoomImageToFit: viewport.zoomToFit,
    crop: () => currentToolMode === "crop" ? viewport.visibleRect() : null,
  }), [currentToolMode, viewport]);
  return (
    <div
      ref={boxRef}
      className={["ifx-image-view", className].filter(Boolean).join(" ")}
      data-tool-mode={currentToolMode}
      data-zoomed={viewport.isZoomedIn ? "true" : "false"}
      data-pannable={viewport.canPan ? "true" : "false"}
      {...viewport.handlers}
      {...props}
    >
      {ready && image.src ? (
        <img
          className="ifx-image-view-image"
          src={image.src}
          alt={alt ?? image.accessibleLabel}
          draggable={false}
          style={{
            width: `${viewport.renderedWidth}px`,
            height: `${viewport.renderedHeight}px`,
            transform: `translate(-50%, -50%) translate(${viewport.pan.x}px, ${viewport.pan.y}px)`,
          }}
        />
      ) : null}
      {currentToolMode === "crop" ? <div className="ifx-image-view-crop-frame" aria-hidden="true" /> : null}
    </div>
  );
}
