import type { ReactNode } from "react";
import type { NSETreeController } from "../Controllers/NSETreeController";
import type { NSETabViewController } from "./NSETabViewController";
import type { TabBarController } from "./TabBarController";
import type { AdaptiveTabOutlineItem } from "./adaptiveTabView";

interface TabViewProjection {
  control(): TabBarController<ReactNode> | null;
  outline(): NSETreeController<AdaptiveTabOutlineItem, string>;
}

// Renderer access stays outside the public view-controller declaration and SDK entry points.
const projections = new WeakMap<NSETabViewController, TabViewProjection>();
export function registerTabViewProjection(controller: NSETabViewController, projection: TabViewProjection): void {
  projections.set(controller, projection);
}
export function tabViewProjection(controller: NSETabViewController): TabViewProjection {
  const projection = projections.get(controller);
  if (!projection) throw new TypeError("The tab view controller has no renderer projection.");
  return projection;
}
