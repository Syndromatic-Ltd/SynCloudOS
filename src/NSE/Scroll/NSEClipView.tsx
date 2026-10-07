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

import { forwardRef, useCallback, useLayoutEffect, useRef, type HTMLAttributes } from "react";

export interface NSEClipViewProps extends HTMLAttributes<HTMLDivElement> {
  readonly mode: "clip" | "scroll";
  readonly scrollHostId?: string;
  onScrollHostChange?(element: HTMLDivElement | null): void;
}

/**
 * Explicitly marks whether a physical surface only clips or is a scroll owner.
 * Consumers may register the scroll host without guessing from CSS overflow.
 */
export const NSEClipView = forwardRef<HTMLDivElement, NSEClipViewProps>(function NSEClipView(
  { mode, scrollHostId, onScrollHostChange, style, children, ...props },
  forwardedRef,
) {
  const scrollHost = mode === "scroll";
  const nodeRef = useRef<HTMLDivElement>(null);
  const setRef = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

  useLayoutEffect(() => {
    onScrollHostChange?.(null);
    if (!scrollHost) return;
    const node = nodeRef.current;
    if (node) onScrollHostChange?.(node);
    return () => onScrollHostChange?.(null);
  }, [onScrollHostChange, scrollHost]);

  return (
    <div
      {...props}
      ref={setRef}
      data-scroll-host={scrollHost ? "true" : "false"}
      data-scroll-host-id={scrollHost ? scrollHostId : undefined}
      style={{ overflow: scrollHost ? "auto" : "hidden", ...style }}
    >
      {children}
    </div>
  );
});
