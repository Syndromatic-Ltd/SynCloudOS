/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { cloneElement as reactCloneElement, createElement as reactCreateElement, isValidElement, type ReactElement } from "react";
import { mirrorProps } from "./hookMirror.mjs";

/**
 * @internal React's createElement and cloneElement for framework code that builds host elements without
 * JSX: they do not pass through the JSX runtime, so contract hooks are mirrored here.
 */
export const createElement = ((type: unknown, props?: unknown, ...children: unknown[]) =>
  (reactCreateElement as (...args: unknown[]) => ReactElement)(type, typeof type === "string" ? mirrorProps(props) : props, ...children)) as typeof reactCreateElement;

export const cloneElement = ((element: ReactElement, props?: Record<string, unknown>, ...children: unknown[]) => {
  if (!isValidElement(element) || typeof element.type !== "string" || !props) return (reactCloneElement as (...args: unknown[]) => ReactElement)(element, props, ...children);
  // Mirror the merged props: the clone's hooks are the element's own overlaid with the new ones.
  const merged = mirrorProps({ ...(element.props as Record<string, unknown>), ...props });
  return (reactCloneElement as (...args: unknown[]) => ReactElement)(element, { ...props, className: (merged as { className?: string }).className }, ...children);
}) as typeof reactCloneElement;
