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

import { useId, useLayoutEffect, useRef } from "react";
import type { NSEViewController } from "./NSEViewController";
import { useNSEAnimationEnvironment } from "../Animation/NSEAnimationEnvironment";
import { compileNSEPresentation, useNSEPresentation, type PresentationSpec } from "../Animation/NSEPresentation";
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
export interface ChildTransition {
  readonly backend?: "afx" | "viewTransition";
  readonly from: NSEViewController<unknown> | null;
  readonly to: NSEViewController<unknown>;
  readonly options: NSEViewControllerTransitionOptions;
  readonly duration: number;
  readonly timing: AFXAnimationTiming;
  finish(): void;
}
/** @internal */
export const nseChildTransition: unique symbol = Symbol("nse.childTransition");
/** @internal */
export const nseReleaseChildViewSlot: unique symbol = Symbol("nse.releaseChildViewSlot");

const childViewKeys = new WeakMap<NSEViewController<unknown>, string>();
let childViewSequence = 0;
function childViewKey(controller: NSEViewController<unknown>): string {
  let key = childViewKeys.get(controller);
  if (!key) { key = `nse-child-view:${++childViewSequence}`; childViewKeys.set(controller, key); }
  return key;
}

/** @internal The slot outlives each swap, as the views' AppKit superview does. */
export function TransitionSlot({ transition, Renderer, className }: {
  readonly transition: ChildTransition;
  readonly Renderer: import("./viewControllerRenderer").ViewControllerRenderer;
  readonly className?: string;
}) {
  const { animator, reducedMotion } = useNSEAnimationEnvironment();
  const viewId = `nse-child-transition:${useId()}`;
  const outgoing = useRef<HTMLDivElement>(null), incoming = useRef<HTMLDivElement>(null);
  const presence = useRef<HTMLDivElement>(null);
  // A tab container may keep the outgoing slot in an internal presence while
  // asking for the incoming slot. Only this slot mounts the two controllers;
  // the other takes over after settlement, preventing duplicate live outlets.
  useNSEPresentation(presence, { exit: { duration: reducedMotion ? Math.min(0.12, transition.duration) : transition.duration,
    timing: "linear", tracks: [{ keyPath: "opacity", values: [1, 1] }] } });
  useLayoutEffect(() => {
    if (!transition.from || transition.backend === "viewTransition") return;
    if (!animator || transition.duration === 0) { transition.finish(); return; }
    let lease: ReturnType<typeof animator.animations.acquireOwner>;
    try { lease = animator.animations.acquireOwner({ appId: animator.ownerAppId, viewId }); }
    catch { transition.finish(); return; }
    const effect = transition.options & 127;
    const rtl = incoming.current?.ownerDocument.defaultView?.getComputedStyle(incoming.current).direction === "rtl";
    const x = effect === 8 || effect === (rtl ? 64 : 32) ? 100 : effect === 16 || effect === (rtl ? 32 : 64) ? -100 : 0;
    const y = effect === 2 ? 100 : effect === 4 ? -100 : 0;
    const fade = reducedMotion || effect === 1;
    const spec = (enter: boolean): PresentationSpec => ({
      duration: effect === 0 ? transition.duration : reducedMotion ? Math.min(0.12, transition.duration) : transition.duration,
      timing: transition.timing,
      tracks: effect === 0 ? [{ keyPath: "opacity", values: [1, 1] }] : fade
        ? [{ keyPath: "opacity", values: enter ? [0, 1] : [1, 0] }]
        : [{ keyPath: "transform", unit: "%", values: enter ? [{ x, y }, {}] : [{}, { x: -x, y: -y }] }],
    });
    let active = true;
    const handles: import("../../FX/AnimationFX/animationTypes").AFXAnimationHandle[] = [];
    try {
      if (outgoing.current && incoming.current) {
        // With no system effect the children own their layer choreography;
        // retain their common superview for the animation context's duration.
        handles.push(animator.animations.animate(outgoing.current, compileNSEPresentation(spec(false), "outgoing", "exit"), lease, 1));
        if (effect !== 0) handles.push(animator.animations.animate(incoming.current, compileNSEPresentation(spec(true), "incoming"), lease, 2));
      }
      void Promise.allSettled(handles.map(handle => handle.finished)).then(() => { if (active) transition.finish(); });
    } catch { transition.finish(); }
    return () => { active = false; for (const handle of handles) handle.cancel("child transition unmounted"); lease.release(); };
  }, [transition, animator, reducedMotion, viewId]);
  const moving = transition.from !== null;
  const inert = moving && !(transition.options & NSEViewControllerTransitionOptions.allowUserInteraction);
  return <div ref={presence} data-nse-child-transition="" style={{ display: "grid", minWidth: 0, minHeight: 0, width: "100%", height: "100%", overflow: moving ? "hidden" : undefined }} inert={inert || undefined}>
    {transition.from && transition.backend !== "viewTransition" ? <div key={childViewKey(transition.from)} ref={outgoing} style={{ gridArea: "1 / 1", minWidth: 0, minHeight: 0 }} aria-hidden="true"><Renderer controller={transition.from} className={className} /></div> : null}
    <div key={childViewKey(transition.to)} ref={incoming} style={{ gridArea: "1 / 1", minWidth: 0, minHeight: 0 }}><Renderer controller={transition.to} className={className} /></div>
  </div>;
}
