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

import { useCallback, useEffect, useRef } from "react";
import type { NSEWindowSurfaceBridge } from "./NSEWindowSurfaceBridge";

export function reportNSEWindowSurfaceError(
  bridge: NSEWindowSurfaceBridge,
  error: unknown,
  requestId: string,
  operation: "present" | "dismiss",
): void {
  bridge.reportError?.(error, { requestId, operation });
}

export interface NSEWindowSurfaceLifecycleOptions {
  readonly bridge: NSEWindowSurfaceBridge | null;
  readonly requestId: string;
  readonly open: boolean;
  onDismissRefused(): void;
  onDismissConfirmed?(): void;
  onDidClose(): void;
}

/** Reconciles source state with the typed result of the physical window owner. */
export function useNSEWindowSurfaceLifecycle({
  bridge,
  requestId,
  open,
  onDismissRefused,
  onDismissConfirmed,
  onDidClose,
}: NSEWindowSurfaceLifecycleOptions): () => void {
  const mounted = useRef(true);
  const refused = useRef(onDismissRefused);
  const confirmed = useRef(onDismissConfirmed);
  const didClose = useRef(onDidClose);
  const closeSettled = useRef(false);
  refused.current = onDismissRefused;
  confirmed.current = onDismissConfirmed;
  didClose.current = onDidClose;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (open) closeSettled.current = false;
  }, [open]);
  useEffect(() => {
    if (!bridge || !open) return;
    return () => {
      void bridge.dismiss(requestId).then((result) => {
        if (!mounted.current) return;
        if (result.outcome === "refused" || result.outcome === "cancelled") refused.current();
        else confirmed.current?.();
      }, (error: unknown) => {
        reportNSEWindowSurfaceError(bridge, error, requestId, "dismiss");
        if (mounted.current) refused.current();
      });
    };
  }, [bridge, open, requestId]);

  return useCallback(() => {
    if (!mounted.current || closeSettled.current) return;
    closeSettled.current = true;
    didClose.current();
  }, []);
}
