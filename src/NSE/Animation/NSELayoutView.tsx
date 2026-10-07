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

import { Component, useId, type HTMLAttributes, type ReactNode } from "react";
import type { AFXAnimationHandle, AFXAnimationTiming } from "../../FX/AnimationFX/animationTypes";
import { useNSEAnimationEnvironment, type NSEAnimator } from "./NSEAnimationEnvironment";
import { compileNSEPresentation } from "./NSEPresentation";

/** How a view moves into a new layout position. */
export interface NSELayoutTransitionTiming {
  readonly duration: number;
  readonly timing: AFXAnimationTiming;
}

export interface NSELayoutViewProps extends HTMLAttributes<HTMLDivElement> {
  /** How the view moves to a new position; `null` moves it at once (reduced
   * motion, or an item being dragged). */
  readonly layoutTransition: NSELayoutTransitionTiming | null;
  /** When given, the view is measured only when the key changes (its owner
   * knows when its slot moves); otherwise every update is measured, so any
   * layout shift animates. */
  readonly layoutKey?: string | number;
}

interface Offset { readonly x: number; readonly y: number }
interface Position { readonly left: number; readonly top: number }

/** The translation an element's transform currently draws it at. */
function drawnTranslation(element: HTMLElement): Offset {
  const transform = element.ownerDocument.defaultView?.getComputedStyle(element).transform ?? "none";
  const values = /^matrix(3d)?\(([^)]*)\)$/.exec(transform.trim());
  if (!values) return { x: 0, y: 0 };
  const parts = values[2]!.split(",").map(Number);
  const [x, y] = values[1] ? [parts[12], parts[13]] : [parts[4], parts[5]];
  return { x: Number.isFinite(x) ? x! : 0, y: Number.isFinite(y) ? y! : 0 };
}

type Lease = ReturnType<NSEAnimator["animations"]["acquireOwner"]>;
type LayoutViewProps = NSELayoutViewProps & { readonly animator: NSEAnimator | null; readonly viewId: string };

// A class, because only getSnapshotBeforeUpdate reads the DOM before an
// update mutates it.
class LayoutView extends Component<LayoutViewProps> {
  private element: HTMLDivElement | null = null;
  private lease: Lease | null = null;
  private running: AFXAnimationHandle | null = null;
  /** The offset the running move started from. */
  private moving: Offset | null = null;
  private generation = 0;
  /** A move interrupted by a disconnect (such as StrictMode replaying a moved
   * view's effects), restarted when the view reconnects. */
  private interrupted: Offset | null = null;
  private readonly attach = (element: HTMLDivElement | null) => { this.element = element; };

  override componentDidMount() {
    this.acquire();
    const interrupted = this.interrupted;
    this.interrupted = null;
    if (interrupted) this.play(interrupted);
  }

  override componentWillUnmount() {
    if (this.inFlight()) this.interrupted = this.moving;
    this.stop("layout view disconnected");
    this.release();
  }

  override getSnapshotBeforeUpdate(previous: Readonly<LayoutViewProps>): Position | null {
    const element = this.element;
    if (!element || (this.props.layoutKey !== undefined && previous.layoutKey === this.props.layoutKey)) return null;
    // Where the view is drawn now, before this update lays it out again.
    const drawn = this.inFlight() ? drawnTranslation(element) : { x: 0, y: 0 };
    return { left: element.offsetLeft + drawn.x, top: element.offsetTop + drawn.y };
  }

  override componentDidUpdate(previous: Readonly<LayoutViewProps>, _state: unknown, drawn: Position | null) {
    if (previous.animator !== this.props.animator) {
      this.stop("layout animator changed");
      this.release();
      this.acquire();
    }
    const element = this.element;
    if (!drawn || !element) return;
    const x = drawn.left - element.offsetLeft, y = drawn.top - element.offsetTop;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return;
    this.stop("superseded by the next layout");
    this.play({ x, y });
  }

  private inFlight() {
    const state = this.running?.state;
    return state === "running" || state === "paused";
  }

  private acquire() {
    const { animator, viewId } = this.props;
    if (!animator) return;
    try {
      this.lease = animator.animations.acquireOwner({ appId: animator.ownerAppId, viewId });
    } catch {
      // Without an owner lease the view simply moves at once.
    }
  }

  private release() {
    this.lease?.release("layout view disconnected");
    this.lease = null;
  }

  private stop(reason: string) {
    const running = this.running;
    this.running = null;
    this.moving = null;
    running?.cancel(reason);
  }

  /** Plays the view from `offset` (relative to its place) home. */
  private play(offset: Offset) {
    const { animator, viewId, layoutTransition } = this.props;
    const element = this.element, lease = this.lease;
    if (!element || !animator || !lease || !layoutTransition) return;
    this.generation += 1;
    try {
      this.running = animator.animations.animate(element, compileNSEPresentation({
        duration: layoutTransition.duration,
        timing: layoutTransition.timing,
        tracks: [{ keyPath: "transform", values: [offset, {}] }],
      }, viewId), lease, this.generation);
      this.moving = offset;
    } catch {
      // A refused move leaves the view in its new place.
    }
  }

  override render(): ReactNode {
    const { layoutTransition: _transition, layoutKey: _key, animator: _animator, viewId: _viewId, ...attributes } = this.props;
    return <div ref={this.attach} {...attributes} />;
  }
}

/**
 * A view that animates into new layout positions, like a layout transition:
 * after an update moves it, it plays a transform from where it was drawn to
 * its new place. Positions come from offsetLeft/offsetTop, in the view's own
 * coordinate space however its ancestors are scaled, and are read before the
 * update mutates the DOM, so a move interrupted by another continues from
 * where the view is drawn. Only the compositor moves the view; layout is read
 * once before and once after an update, never per frame.
 *
 * The view's own `transform` must be free: static offsets such as centring
 * belong in the individual `translate` property.
 */
export function NSELayoutView(props: NSELayoutViewProps): ReactNode {
  const { animator } = useNSEAnimationEnvironment();
  const viewId = `nse-layout:${useId()}`;
  return <LayoutView {...props} animator={animator} viewId={viewId} />;
}
