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

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WebspringFolderTile } from "./WebspringFolderTile";
import type { WebspringApp, WebspringFolderItem } from "./webspringTypes";
import "./WebspringPresentation.css";

export interface WebspringDragProxyPoint {
  x: number;
  y: number;
}

export interface WebspringDragProxyRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** How far the pressed point sits from the icon's centre. Keeping it stops the
 *  icon jumping to the pointer when the drag begins off-centre. */
export function getWebspringDragGrabOffset(
  pointer: WebspringDragProxyPoint,
  artwork: WebspringDragProxyRect | null,
): WebspringDragProxyPoint {
  if (!artwork || artwork.width <= 0 || artwork.height <= 0) return { x: 0, y: 0 };
  return {
    x: artwork.left + artwork.width / 2 - pointer.x,
    y: artwork.top + artwork.height / 2 - pointer.y
  };
}

export function useWebspringDragProxyPosition() {
  const [point, setPoint] = useState<WebspringDragProxyPoint | null>(null);
  const proxyElementRef = useRef<HTMLDivElement | null>(null);
  const lastPointRef = useRef<WebspringDragProxyPoint | null>(null);
  const pendingPointRef = useRef<WebspringDragProxyPoint | null>(null);
  const grabOffsetRef = useRef<WebspringDragProxyPoint>({ x: 0, y: 0 });
  const frameRef = useRef(0);

  /** Records where the icon was taken from, so its centre follows the pointer. */
  const beginGrab = useCallback((pointer: WebspringDragProxyPoint, artwork: WebspringDragProxyRect | null) => {
    grabOffsetRef.current = getWebspringDragGrabOffset(pointer, artwork);
  }, []);

  const applyPoint = useCallback((nextPoint: WebspringDragProxyPoint) => {
    const element = proxyElementRef.current;
    if (!element) return;
    element.style.left = `${nextPoint.x}px`;
    element.style.top = `${nextPoint.y}px`;
  }, []);

  const flushPoint = useCallback(() => {
    frameRef.current = 0;
    const nextPoint = pendingPointRef.current;
    if (nextPoint) applyPoint(nextPoint);
  }, [applyPoint]);

  /** Follows the pointer from the grabbed point; returns the icon's centre. */
  const recordPoint = useCallback((pointer: WebspringDragProxyPoint, visible: boolean) => {
    const hitPoint = {
      x: pointer.x + grabOffsetRef.current.x,
      y: pointer.y + grabOffsetRef.current.y
    };
    lastPointRef.current = hitPoint;
    if (!visible || typeof window === "undefined") return hitPoint;
    pendingPointRef.current = hitPoint;
    if (!frameRef.current) frameRef.current = window.requestAnimationFrame(flushPoint);
    return hitPoint;
  }, [flushPoint]);

  const showProxy = useCallback(() => {
    const initialPoint = lastPointRef.current;
    setPoint((current) => current ?? initialPoint);
    if (initialPoint) {
      pendingPointRef.current = initialPoint;
      if (typeof window === "undefined") {
        applyPoint(initialPoint);
      } else if (!frameRef.current) {
        frameRef.current = window.requestAnimationFrame(flushPoint);
      }
    }
  }, [applyPoint, flushPoint]);

  const hideProxy = useCallback(() => {
    if (frameRef.current && typeof window !== "undefined") {
      window.cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = 0;
    pendingPointRef.current = null;
    setPoint(null);
  }, []);

  const setProxyElement = useCallback((element: HTMLDivElement | null) => {
    proxyElementRef.current = element;
    if (element && point) applyPoint(point);
  }, [applyPoint, point]);

  useEffect(() => () => {
    if (frameRef.current && typeof window !== "undefined") {
      window.cancelAnimationFrame(frameRef.current);
    }
  }, []);

  return {
    point,
    beginGrab,
    setProxyElement,
    recordPoint,
    showProxy,
    hideProxy
  };
}

/** The icon that follows the pointer while an app or a folder is dragged. */
export function WebspringDragProxy({
  app = null,
  folder = null,
  point,
  mobile = false,
  proxyRef
}: {
  app?: WebspringApp | null;
  folder?: WebspringFolderItem | null;
  point: WebspringDragProxyPoint | null;
  mobile?: boolean;
  proxyRef?: (element: HTMLDivElement | null) => void;
}) {
  if (!point || typeof document === "undefined") return null;
  const artwork = app
    ? <img src={app.iconUrl ?? ""} alt="" draggable={false} />
    : folder ? <span className="webspring-drag-proxy-folder"><WebspringFolderTile folder={folder} /></span> : null;
  if (!artwork) return null;

  return createPortal((
    <div
      ref={proxyRef}
      className="webspring-drag-proxy"
      data-mobile={mobile ? "true" : "false"}
      aria-hidden="true"
      style={{ left: point.x, top: point.y }}
    >
      {artwork}
      <span>{app?.displayName ?? folder?.title}</span>
    </div>
  ), document.body);
}
