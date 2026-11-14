/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { NSEEdgeInsetsMake, type NSEEdgeInsets } from "./NSEEdgeInsets";
import type { NSEScrollRect } from "../Scroll/scrollTypes";

export interface ChromeObstruction {
  readonly edge: "top" | "left" | "bottom" | "right";
  readonly thickness: number;
  readonly translucent: boolean;
}

/** ScreenService keeps logical edges; AppKit's view geometry is physical. */
export function physicalSafeAreaInsets(insets: Readonly<{ blockStart: number; inlineStart: number; blockEnd: number; inlineEnd: number }>, direction: "ltr" | "rtl"): NSEEdgeInsets {
  return NSEEdgeInsetsMake(insets.blockStart, direction === "rtl" ? insets.inlineEnd : insets.inlineStart, insets.blockEnd, direction === "rtl" ? insets.inlineStart : insets.inlineEnd);
}

export function resolveSafeAreaInsets(input: {
  readonly screen: NSEEdgeInsets;
  readonly chrome: readonly ChromeObstruction[];
  readonly additional: NSEEdgeInsets;
  readonly bounds: NSEScrollRect;
}): NSEEdgeInsets {
  const { screen, chrome, additional, bounds } = input;
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 0 || bounds.height < 0) throw new TypeError("Safe-area bounds must be finite, with non-negative dimensions.");
  const result = { top: screen.top + additional.top, left: screen.left + additional.left, bottom: screen.bottom + additional.bottom, right: screen.right + additional.right };
  if (!Object.values(result).every(Number.isFinite)) throw new TypeError("Safe-area insets must be finite.");
  for (const obstruction of chrome) {
    if (!Object.hasOwn(result, obstruction.edge) || !Number.isFinite(obstruction.thickness) || obstruction.thickness < 0) throw new TypeError("Chrome obstruction thickness must be finite and non-negative on a physical edge.");
    result[obstruction.edge] += obstruction.thickness;
  }
  return NSEEdgeInsetsMake(
    Math.min(bounds.height, Math.max(0, result.top)),
    Math.min(bounds.width, Math.max(0, result.left)),
    Math.min(bounds.height, Math.max(0, result.bottom)),
    Math.min(bounds.width, Math.max(0, result.right)),
  );
}
