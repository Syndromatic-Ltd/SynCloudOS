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

import { ControllerLifetime } from "../Controllers/controllerLifetime";
import type { NSEControllerOwnershipOptions } from "../Controllers/ownership";
import { NSEEdgeInsetsZero, type NSEEdgeInsets } from "../Layout/NSEEdgeInsets";

export type ScrollerPolicy = "automatic" | "always" | "hidden";

export interface NSEScrollRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** NSClipView: the scrolling viewport, with bounds in document coordinates. */
export interface NSEClipViewHandle {
  readonly element: HTMLElement;
  readonly bounds: NSEScrollRect;
  postsBoundsChangedNotifications: boolean;
  observeBoundsChanges(observer: (bounds: NSEScrollRect) => void): () => void;
}

export type RTLScrollModel = "negative" | "reverse" | "default";

export interface ScrollGeometry {
  readonly position: { readonly left: number; readonly top: number };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly content: { readonly width: number; readonly height: number };
  readonly rect: NSEScrollRect;
  readonly insets?: NSEEdgeInsets;
}

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export const normalizeRTLScrollLeft = (value: number, maximum: number, model: RTLScrollModel) =>
  model === "negative" ? -value : model === "reverse" ? maximum - value : value;

export function computeScrollRectTarget(geometry: ScrollGeometry) {
  const insets = geometry.insets ?? NSEEdgeInsetsZero;
  const viewportWidth = Math.max(0, finite(geometry.viewport.width));
  const viewportHeight = Math.max(0, finite(geometry.viewport.height));
  const contentWidth = Math.max(0, finite(geometry.content.width));
  const contentHeight = Math.max(0, finite(geometry.content.height));
  const maximumLeft = Math.max(0, contentWidth - viewportWidth);
  const maximumTop = Math.max(0, contentHeight - viewportHeight);
  let left = clamp(finite(geometry.position.left), 0, maximumLeft);
  let top = clamp(finite(geometry.position.top), 0, maximumTop);
  const rect = geometry.rect;

  if (rect.x < left + insets.left) left = rect.x - insets.left;
  else if (rect.x + rect.width > left + viewportWidth - insets.right) {
    left = rect.x + rect.width - viewportWidth + insets.right;
  }

  if (rect.y < top + insets.top) top = rect.y - insets.top;
  else if (rect.y + rect.height > top + viewportHeight - insets.bottom) {
    top = rect.y + rect.height - viewportHeight + insets.bottom;
  }

  return Object.freeze({
    left: clamp(finite(left), 0, maximumLeft),
    top: clamp(finite(top), 0, maximumTop)
  });
}

type ScrollObserver = () => void;
interface HostObservation {
  readonly observers: Set<ScrollObserver>;
  frame: number;
  readonly listener: () => void;
}

const observations = new WeakMap<HTMLElement, HostObservation>();
const claims = new WeakMap<HTMLElement, unknown>();

function schedule(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  return window.setTimeout(() => callback(Date.now()), 0);
}

function cancel(frame: number) {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
  else window.clearTimeout(frame);
}

export class NSEScrollViewController {
  readonly #lifetime: ControllerLifetime;
  readonly #connections = new Set<() => void>();
  readonly contentView: NSEClipViewHandle;

  constructor(readonly host: HTMLElement, readonly insets: NSEEdgeInsets = NSEEdgeInsetsZero, options: NSEControllerOwnershipOptions = {}) {
    this.#lifetime = new ControllerLifetime(options, { kind: "NSEScrollViewController", id: host.id || "scroll-view" });
    this.#lifetime.bind(() => this.dispose());
    const controller = this;
    this.contentView = {
      element: host,
      get bounds() { return controller.documentVisibleRect; },
      postsBoundsChangedNotifications: false,
      observeBoundsChanges(observer) {
        controller.#lifetime.assertLive("observeBoundsChanges");
        let previous = controller.documentVisibleRect;
        const publish = () => {
          const next = controller.documentVisibleRect;
          if (next.x === previous.x && next.y === previous.y && next.width === previous.width && next.height === previous.height) return;
          previous = next;
          if (controller.contentView.postsBoundsChangedNotifications) observer(next);
        };
        // Bounds notifications follow the native event, so a client's next-frame
        // drawing does not acquire an extra frame of scroll latency.
        host.addEventListener("scroll", publish, { passive: true });
        const Resize = host.ownerDocument.defaultView?.ResizeObserver;
        const resize = Resize ? new Resize(publish) : null;
        resize?.observe(host);
        const disconnect = () => {
          controller.#connections.delete(disconnect);
          host.removeEventListener("scroll", publish);
          resize?.disconnect();
        };
        controller.#connections.add(disconnect);
        return disconnect;
      },
    };
  }

  /** NSScrollView.documentVisibleRect, in the document's coordinate system. */
  get documentVisibleRect(): NSEScrollRect {
    return { x: this.host.scrollLeft, y: this.host.scrollTop, width: this.host.clientWidth, height: this.host.clientHeight };
  }

  get isDisposed(): boolean { return this.#lifetime.isDisposed; }
  dispose(): void {
    if (!this.#lifetime.dispose()) return;
    for (const disconnect of [...this.#connections]) disconnect();
    this.#connections.clear();
  }

  static claim(host: HTMLElement, owner: unknown): boolean {
    const current = claims.get(host);
    if (current !== undefined && current !== owner) return false;
    claims.set(host, owner);
    return true;
  }

  static release(host: HTMLElement, owner: unknown): void {
    if (claims.get(host) === owner) claims.delete(host);
  }

  connect(observer: ScrollObserver): () => void {
    this.#lifetime.assertLive("connect");
    let observation = observations.get(this.host);
    if (!observation) {
      const observers = new Set<ScrollObserver>();
      observation = {
        observers,
        frame: 0,
        listener: () => {
          const current = observations.get(this.host);
          if (!current || current.frame !== 0) return;
          current.frame = schedule(() => {
            current.frame = 0;
            for (const subscriber of [...current.observers]) {
              try { subscriber(); } catch { /* isolate subscriber failure */ }
            }
          });
        }
      };
      observations.set(this.host, observation);
      this.host.addEventListener("scroll", observation.listener, { passive: true });
    }
    observation.observers.add(observer);

    let active = true;
    const disconnect = () => {
      if (!active) return;
      active = false;
      this.#connections.delete(disconnect);
      const current = observations.get(this.host);
      if (!current) return;
      current.observers.delete(observer);
      if (current.observers.size > 0) return;
      this.host.removeEventListener("scroll", current.listener);
      if (current.frame !== 0) cancel(current.frame);
      observations.delete(this.host);
    };
    this.#connections.add(disconnect);
    return disconnect;
  }

  scrollRectToVisible(rect: NSEScrollRect, behavior: ScrollBehavior = "auto") {
    this.#lifetime.assertLive("scrollRectToVisible");
    const target = computeScrollRectTarget({
      position: { left: this.host.scrollLeft, top: this.host.scrollTop },
      viewport: { width: this.host.clientWidth, height: this.host.clientHeight },
      content: { width: this.host.scrollWidth, height: this.host.scrollHeight },
      rect,
      insets: this.insets
    });
    this.host.scrollTo({ ...target, behavior });
  }
}
