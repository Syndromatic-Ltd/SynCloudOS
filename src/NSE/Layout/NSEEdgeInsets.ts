/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

/** NSEdgeInsets: physical edges, in AppKit's top, left, bottom, right order. */
export interface NSEEdgeInsets {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

export const NSEEdgeInsetsZero: NSEEdgeInsets = Object.freeze({ top: 0, left: 0, bottom: 0, right: 0 });

/** NSEdgeInsetsMake. Signed point values remain useful for authored geometry. */
export function NSEEdgeInsetsMake(top: number, left: number, bottom: number, right: number): NSEEdgeInsets {
  if (![top, left, bottom, right].every(Number.isFinite)) throw new TypeError("NSEEdgeInsets requires finite point values.");
  return Object.freeze({ top, left, bottom, right });
}
