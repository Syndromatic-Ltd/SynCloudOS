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

/**
 * Where focus should go back to when a surface opened from inside an overlay
 * closes. A menu command runs while its menu is still open (the controller
 * dismisses only after the command settles), so a dialog it opens sees a menu
 * row as the focused element. That row is gone by the time the dialog closes;
 * the control that opened the menu is the place focus belongs.
 */
const overlayOrigins = new WeakMap<Element, HTMLElement>();
// Persistent inspectors participate in their editor's interaction boundary,
// but are not transient menus to skip when resolving a focus-return target.
const inspectorOrigins = new WeakMap<Element, HTMLElement>();

export function registerNSEInspectorOrigin(surface: Element, anchor: HTMLElement | null): () => void {
  if (!anchor) return () => undefined;
  inspectorOrigins.set(surface, anchor);
  return () => {
    if (inspectorOrigins.get(surface) === anchor) inspectorOrigins.delete(surface);
  };
}

/** Records the control an overlay surface was opened from. */
export function registerNSEFocusOrigin(surface: Element, anchor: HTMLElement | null): () => void {
  if (!anchor) return () => undefined;
  overlayOrigins.set(surface, anchor);
  return () => {
    if (overlayOrigins.get(surface) === anchor) overlayOrigins.delete(surface);
  };
}

/** An inspector or portalled child belongs to the surface containing its live
 * origin. Follow nested origins, without granting unrelated windows access or
 * keeping a detached editor alive. Shared panels can change origins in place. */
export function isWithinNSEFocusOrigin(root: Element, target: Node): boolean {
  const visited = new Set<Node>();
  let current: Node | null = target;
  while (current && !visited.has(current)) {
    if (root.contains(current)) return true;
    visited.add(current);
    let origin: HTMLElement | undefined;
    for (let node: Node | null = current; node && !origin; node = node.parentNode) {
      if (node instanceof Element) origin = inspectorOrigins.get(node) ?? overlayOrigins.get(node);
    }
    current = origin?.isConnected ? origin : null;
  }
  return false;
}

/**
 * Resolves `element` to the element a newly presented surface should return
 * focus to: `element` itself, or, when it sits inside an anchored overlay, the
 * control that overlay (and any overlay above it, for submenus) was opened from.
 */
export function resolveNSEFocusReturnTarget(element: Element | null): HTMLElement | null {
  let current = element instanceof HTMLElement ? element : null;
  for (let depth = 0; current && depth < 8; depth += 1) {
    let origin: HTMLElement | undefined;
    for (let node: Element | null = current; node && !origin; node = node.parentElement) origin = overlayOrigins.get(node);
    if (!origin) return current;
    current = origin;
  }
  return current;
}
