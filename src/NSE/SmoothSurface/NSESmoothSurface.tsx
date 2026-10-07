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
  createElement,
  forwardRef,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type HTMLAttributes
} from "react";
import {
  getNSESmoothSurfaceClassName,
  getNSESmoothSurfaceStyle,
  normaliseNSESmoothSurfaceRequest,
  NSESmoothSurfaceAPI
} from "./smoothSurface";
import { useNSESmoothSurface } from "./useNSESmoothSurface";
import type {
  NSESmoothSurfaceBorderConfig,
  NSESmoothSurfaceComponentProps,
  NSESmoothSurfaceRequest,
  NSESmoothSurfaceShadowConfig
} from "./smoothSurfaceTypes";

function composeRefs<T>(...refs: Array<ForwardedRef<T> | undefined>) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") {
        ref(node);
      } else {
        ref.current = node;
      }
    });
  };
}

function shadowToFilter(shadow: NSESmoothSurfaceShadowConfig | NSESmoothSurfaceShadowConfig[] | undefined) {
  const first = Array.isArray(shadow) ? shadow[0] : shadow;
  if (!first) return undefined;
  return `drop-shadow(${first.offsetX}px ${first.offsetY}px ${first.blur}px ${first.color})`;
}

function borderToPathProps(border: NSESmoothSurfaceBorderConfig | undefined) {
  if (!border || border.width <= 0 || border.opacity <= 0) return null;
  const dash = border.style === "dashed"
    ? `${border.dash ?? border.width * 3} ${border.gap ?? border.width * 2}`
    : border.style === "dotted"
      ? `${border.dash ?? 1} ${border.gap ?? border.width * 2}`
      : undefined;

  return {
    stroke: border.color,
    strokeOpacity: border.opacity,
    strokeWidth: border.width,
    strokeDasharray: dash,
    strokeLinecap: border.lineCap ?? (border.style === "dotted" ? "round" : "butt")
  };
}

function SmoothSurfaceImpl(
  props: NSESmoothSurfaceComponentProps & Omit<HTMLAttributes<HTMLElement>, keyof NSESmoothSurfaceComponentProps>,
  forwardedRef: ForwardedRef<HTMLElement>
) {
  const {
    as = "div",
    children,
    smoothSurface = {},
    className,
    style,
    autoEffects,
    ...rest
  } = props;
  const [surfaceNode, setSurfaceNode] = useState<HTMLElement | null>(null);
  const request: NSESmoothSurfaceRequest = typeof smoothSurface === "object" && smoothSurface !== null
    ? { ...smoothSurface, autoEffects: autoEffects ?? smoothSurface.autoEffects }
    : smoothSurface;
  const resolved = normaliseNSESmoothSurfaceRequest(request);
  const geometry = useNSESmoothSurface(surfaceNode, request);
  const mergedClassName = resolved === false
    ? className
    : getNSESmoothSurfaceClassName(resolved, className);
  const mergedStyle = resolved === false
    ? style
    : {
        ...getNSESmoothSurfaceStyle(resolved, style as unknown as Record<string, string | number>)
      } as CSSProperties;
  const ref = useMemo(() => composeRefs(setSurfaceNode, forwardedRef), [forwardedRef]);
  const Component = as;
  const innerBorder = resolved === false ? null : borderToPathProps(resolved.innerBorder);
  const middleBorder = resolved === false ? null : borderToPathProps(resolved.middleBorder);
  const outerBorder = resolved === false ? null : borderToPathProps(resolved.outerBorder);
  const filter = resolved === false ? undefined : shadowToFilter(resolved.dropShadow);

  return createElement(
    Component,
    {
      ...rest,
      ref,
      className: mergedClassName,
      style: mergedStyle,
      "data-slot": "nse-smooth-surface",
      "data-state": geometry.ready ? "ready" : "pending"
    },
    children,
    resolved !== false && geometry.ready && geometry.path ? createElement(
      "svg",
      {
        "aria-hidden": true,
        className: "nse-smooth-surface-effects",
        viewBox: `0 0 ${geometry.width} ${geometry.height}`,
        preserveAspectRatio: "none",
        style: {
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
          filter
        } satisfies CSSProperties
      },
      outerBorder ? createElement("path", { d: geometry.path, fill: "none", vectorEffect: "non-scaling-stroke", ...outerBorder }) : null,
      middleBorder ? createElement("path", { d: geometry.path, fill: "none", vectorEffect: "non-scaling-stroke", ...middleBorder }) : null,
      innerBorder ? createElement("path", { d: geometry.path, fill: "none", vectorEffect: "non-scaling-stroke", ...innerBorder }) : null
    ) : null
  );
}

export const NSESmoothSurface = Object.assign(
  forwardRef(SmoothSurfaceImpl),
  NSESmoothSurfaceAPI
);
