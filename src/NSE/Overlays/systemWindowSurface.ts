/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import type { WindowSurfaceRequest } from "./NSEWindowSurfaceBridge";

const systemWindowSurface = Symbol("NSE system window surface");

export function markSystemWindowSurface<T extends WindowSurfaceRequest>(request: T): T {
  return { ...request, [systemWindowSurface]: true };
}

export function isSystemWindowSurface(request: WindowSurfaceRequest | undefined): boolean {
  return request !== undefined && systemWindowSurface in request;
}
