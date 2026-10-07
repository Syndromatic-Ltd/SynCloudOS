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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  generateNSESmoothSurfaceClipPath,
  generateNSESmoothSurfacePath
} from "./smoothSurfacePath";
import {
  getMobileNSESmoothSurfaceOptions,
  normaliseNSESmoothSurfaceRequest,
  nseSmoothSurfaceMobileQuery
} from "./smoothSurface";
import type { NSESmoothSurfaceRequest, NSESmoothSurfaceResolvedOptions } from "./smoothSurfaceTypes";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface NSESmoothSurfaceGeometry {
  width: number;
  height: number;
  path: string;
  clipPath: string;
  ready: boolean;
}

export function useNSESmoothSurface<T extends HTMLElement>(
  element: T | null,
  request: NSESmoothSurfaceRequest
): NSESmoothSurfaceGeometry {
  const options = normaliseNSESmoothSurfaceRequest(request);
  const [isMobile, setIsMobile] = useState(false);
  const geometryOptions: NSESmoothSurfaceResolvedOptions | false = options === false
    ? false
    : isMobile
      ? getMobileNSESmoothSurfaceOptions(options)
      : options;
  const optionsKey = JSON.stringify({ options: geometryOptions, isMobile });
  const [geometry, setGeometry] = useState<NSESmoothSurfaceGeometry>({
    width: 0,
    height: 0,
    path: "",
    clipPath: "",
    ready: false
  });
  const optionsRef = useRef<NSESmoothSurfaceResolvedOptions | false>(geometryOptions);
  optionsRef.current = geometryOptions;
  const ownershipRef = useRef<{
    element: T;
    clipPath: string;
    webkitClipPath: string;
  } | null>(null);

  useIsoLayoutEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(nseSmoothSurfaceMobileQuery);
    const updateMobileState = () => setIsMobile(media.matches);

    updateMobileState();
    media.addEventListener?.("change", updateMobileState);
    return () => media.removeEventListener?.("change", updateMobileState);
  }, []);

  useIsoLayoutEffect(() => {
    if (!element) return undefined;
    const ownership = {
      element,
      clipPath: element.style.clipPath,
      webkitClipPath: element.style.getPropertyValue("-webkit-clip-path")
    };
    ownershipRef.current = ownership;

    return () => {
      element.style.clipPath = ownership.clipPath;
      element.style.setProperty("-webkit-clip-path", ownership.webkitClipPath);
      element.removeAttribute("data-nse-smooth-surface-state");
      if (ownershipRef.current?.element === element) ownershipRef.current = null;
    };
  }, [element]);

  useIsoLayoutEffect(() => {
    if (!element) {
      setGeometry((current) => current.ready ? { width: 0, height: 0, path: "", clipPath: "", ready: false } : current);
      return undefined;
    }

    if (optionsRef.current === false) {
      const ownership = ownershipRef.current;
      if (ownership?.element === element) {
        element.style.clipPath = ownership.clipPath;
        element.style.setProperty("-webkit-clip-path", ownership.webkitClipPath);
      }
      element.removeAttribute("data-nse-smooth-surface-state");
      setGeometry((current) => current.ready ? { width: 0, height: 0, path: "", clipPath: "", ready: false } : current);
      return undefined;
    }

    let frameId = 0;

    const measure = () => {
      frameId = 0;
      const rect = element.getBoundingClientRect();
      const layoutWidth = element.offsetWidth || element.clientWidth || rect.width;
      const layoutHeight = element.offsetHeight || element.clientHeight || rect.height;
      const width = Math.round(layoutWidth * 100) / 100;
      const height = Math.round(layoutHeight * 100) / 100;
      const currentOptions = optionsRef.current;
      if (width <= 0 || height <= 0 || currentOptions === false) return;

      const path = generateNSESmoothSurfacePath(width, height, currentOptions);
      const clipPath = generateNSESmoothSurfaceClipPath(width, height, currentOptions);
      element.style.clipPath = clipPath;
      element.style.setProperty("-webkit-clip-path", clipPath);
      element.setAttribute("data-nse-smooth-surface-state", "ready");
      setGeometry({ width, height, path, clipPath, ready: true });
    };

    const scheduleMeasure = () => {
      if (frameId !== 0) return;
      frameId = window.requestAnimationFrame(measure);
    };

    element.setAttribute("data-nse-smooth-surface-state", "pending");
    scheduleMeasure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleMeasure);
      return () => {
        if (frameId !== 0) window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", scheduleMeasure);
      };
    }

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(element);

    return () => {
      if (frameId !== 0) window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [element, optionsKey]);

  return useMemo(() => geometry, [geometry]);
}
