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

import { useLayoutEffect, useRef } from "react";
import type { NSEViewController } from "./NSEViewController";
import { useNSEAnimationEnvironment } from "../Animation/NSEAnimationEnvironment";
import { compileNSEPresentation, type NSEPresentationSpec } from "../Animation/NSEPresentation";
import type { AFXAnimationTiming } from "../../FX/AnimationFX/animationTypes";

/** NSViewController.TransitionOptions. Combine an effect with allowUserInteraction. */
export enum NSEViewControllerTransitionOptions {
  none = 0,
  crossfade = 1,
  slideUp = 2,
  slideDown = 4,
  slideLeft = 8,
  slideRight = 16,
  slideForward = 32,
  slideBackward = 64,
  allowUserInteraction = 128,
}

/** @internal One retained child-view slot, including its replacement in flight. */
export interface NSEChildTransition {
  readonly from: NSEViewController<unknown> | null;
  readonly to: NSEViewController<unknown>;
  readonly options: NSEViewControllerTransitionOptions;
  readonly duration: number;
  readonly timing: AFXAnimationTiming;
  finish(): void;
}
/** @internal */
export const nseChildTransition: unique symbol = Symbol("nse.childTransition");

/** @internal The slot outlives each swap, as the views' AppKit superview does. */
export function NSETransitionSlot({ transition, Renderer, className }: {
  readonly transition: NSEChildTransition;
  readonly Renderer: import("./viewControllerRenderer").NSEViewControllerRenderer;
  readonly className?: string;
}) {
  const { animator, reducedMotion } = useNSEAnimationEnvironment();
  const outgoing = useRef<HTMLDivElement>(null), incoming = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!transition.from) return;
    if (!animator || transition.duration === 0) { transition.finish(); return; }
    const lease = animator.animations.acquireOwner({ appId: animator.ownerAppId, viewId: "nse-child-transition" });
    const effect = transition.options & 127;
    const rtl = incoming.current?.ownerDocument.defaultView?.getComputedStyle(incoming.current).direction === "rtl";
    const x = effect === 8 || effect === (rtl ? 64 : 32) ? 100 : effect === 16 || effect === (rtl ? 32 : 64) ? -100 : 0;
    const y = effect === 2 ? 100 : effect === 4 ? -100 : 0;
    const fade = reducedMotion || effect === 1;
    const spec = (enter: boolean): NSEPresentationSpec => ({
      duration: reducedMotion ? Math.min(0.12, transition.duration) : transition.duration,
      timing: transition.timing,
      tracks: effect === 0 ? [] : fade
        ? [{ keyPath: "opacity", values: enter ? [0, 1] : [1, 0] }]
        : [{ keyPath: "transform", unit: "%", values: enter ? [{ x, y }, {}] : [{}, { x: -x, y: -y }] }],
    });
    let active = true;
    const handles: import("../../FX/AnimationFX/animationTypes").AFXAnimationHandle[] = [];
    try {
      if (outgoing.current && incoming.current && effect !== 0) {
        handles.push(animator.animations.animate(outgoing.current, compileNSEPresentation(spec(false), "outgoing", "exit"), lease, 1));
        handles.push(animator.animations.animate(incoming.current, compileNSEPresentation(spec(true), "incoming"), lease, 2));
      }
      void Promise.allSettled(handles.map(handle => handle.finished)).then(() => { if (active) transition.finish(); });
    } catch { transition.finish(); }
    return () => { active = false; for (const handle of handles) handle.cancel("child transition unmounted"); lease.release(); };
  }, [transition, animator, reducedMotion]);
  const moving = transition.from !== null;
  const inert = moving && !(transition.options & NSEViewControllerTransitionOptions.allowUserInteraction);
  return <div data-nse-child-transition="" style={{ display: "grid", minWidth: 0, minHeight: 0, width: "100%", height: "100%", overflow: moving ? "hidden" : undefined }} inert={inert || undefined}>
    {transition.from ? <div ref={outgoing} style={{ gridArea: "1 / 1", minWidth: 0, minHeight: 0 }} aria-hidden="true"><Renderer controller={transition.from} className={className} /></div> : null}
    <div ref={incoming} style={{ gridArea: "1 / 1", minWidth: 0, minHeight: 0 }}><Renderer controller={transition.to} className={className} /></div>
  </div>;
}
