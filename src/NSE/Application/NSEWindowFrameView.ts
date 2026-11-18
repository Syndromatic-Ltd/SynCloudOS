/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

/** Metrics for a system-owned window frame. */
export class NSEWindowFrameView {
  static titlebarHeight?: number;
}

export type NSEWindowFrameViewClass = typeof NSEWindowFrameView;

export function nseWindowFrameStyle(Frame: NSEWindowFrameViewClass | null | undefined) {
  if (!Frame) return undefined;
  return {
    "--nse-frame-titlebar-height": Frame.titlebarHeight === undefined ? undefined : `${Frame.titlebarHeight}px`,
  };
}

export function validateNSEWindowFrameView(Frame: NSEWindowFrameViewClass | null): void {
  if (Frame === null) return;
  if (Frame !== NSEWindowFrameView && !(Frame.prototype instanceof NSEWindowFrameView)) throw new TypeError("A window frame view must extend NSEWindowFrameView.");
  if (Frame.titlebarHeight !== undefined && (!Number.isFinite(Frame.titlebarHeight) || Frame.titlebarHeight <= 0)) {
    throw new TypeError("A window frame view titlebar height must be positive and finite.");
  }
}
