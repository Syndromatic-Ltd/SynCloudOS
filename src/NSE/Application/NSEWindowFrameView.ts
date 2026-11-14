/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

/** Metrics and token-based paint for a system-owned frame. */
export class NSEWindowFrameView {
  static titlebarHeight?: number;
  static backgroundToken?: `--nse-${string}`;
  static separatorToken?: `--nse-${string}`;
}

export type NSEWindowFrameViewClass = typeof NSEWindowFrameView;

export function nseWindowFrameStyle(Frame: NSEWindowFrameViewClass | null | undefined) {
  if (!Frame) return undefined;
  return {
    "--nse-frame-titlebar-height": Frame.titlebarHeight === undefined ? undefined : `${Frame.titlebarHeight}px`,
    "--nse-frame-background": Frame.backgroundToken ? `var(${Frame.backgroundToken})` : undefined,
    "--nse-frame-separator": Frame.separatorToken ? `var(${Frame.separatorToken})` : undefined,
  };
}

export function validateNSEWindowFrameView(Frame: NSEWindowFrameViewClass | null): void {
  if (Frame === null) return;
  if (Frame !== NSEWindowFrameView && !(Frame.prototype instanceof NSEWindowFrameView)) throw new TypeError("A window frame view must extend NSEWindowFrameView.");
  if (Frame.titlebarHeight !== undefined && (!Number.isFinite(Frame.titlebarHeight) || Frame.titlebarHeight <= 0)) {
    throw new TypeError("A window frame view titlebar height must be positive and finite.");
  }
  for (const token of [Frame.backgroundToken, Frame.separatorToken]) {
    if (token !== undefined && !/^--nse-[a-z0-9-]+$/.test(token)) throw new TypeError("A window frame view must name an NSE theme token.");
  }
}
