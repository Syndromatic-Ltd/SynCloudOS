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

export function useWebspringDragProxyPosition() {
  const [point, setPoint] = useState<WebspringDragProxyPoint | null>(null);
  const proxyElementRef = useRef<HTMLDivElement | null>(null);
  const lastPointRef = useRef<WebspringDragProxyPoint | null>(null);
  const pendingPointRef = useRef<WebspringDragProxyPoint | null>(null);
  const frameRef = useRef(0);

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

  const recordPoint = useCallback((nextPoint: WebspringDragProxyPoint, visible: boolean) => {
    lastPointRef.current = nextPoint;
    if (!visible || typeof window === "undefined") return;
    pendingPointRef.current = nextPoint;
    if (!frameRef.current) frameRef.current = window.requestAnimationFrame(flushPoint);
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
      <span>{app?.title ?? folder?.title}</span>
    </div>
  ), document.body);
}
