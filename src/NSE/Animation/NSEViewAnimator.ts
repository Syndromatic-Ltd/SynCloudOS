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

import { NSEAnimationContext } from "./NSEAnimationContext";
import { AFXAnimation } from "../../FX/AnimationFX/AFXAnimation";
import { AFXBasicAnimation } from "../../FX/AnimationFX/AFXBasicAnimation";
import { AFXTransform3D } from "../../FX/AnimationFX/AFXTransform3D";
import { captureAFXTransactionAnimationStart } from "../../FX/AnimationFX/AFXTransaction";
import type { AFXLayer } from "../../FX/AnimationFX/AFXLayer";
import type { GFXPoint, GFXRect, GFXSize } from "../../FX/GraphicsFX/GFXGeometry";

/** NSView's animator proxy. Geometry is in the superview's CSS coordinates. */
export interface NSEViewAnimator {
  alphaValue: number;
  frame: GFXRect;
  setFrameOrigin(origin: GFXPoint): void;
  setFrameSize(size: GFXSize): void;
}

/** @internal Both controller views and NSEView elements use the same proxy. */
export function createNSEViewAnimator(element: () => HTMLElement, layer: () => AFXLayer, reducedMotion: () => boolean): NSEViewAnimator {
  const play = (keyPath: "opacity" | "transform", from: number | string, to: number | string) => {
    const context = NSEAnimationContext.current;
    const duration = reducedMotion() ? keyPath === "opacity" ? Math.min(context.duration, 0.12) : 0 : context.duration;
    if (!duration || from === to) return;
    const handle = layer().addAnimation(new AFXBasicAnimation({ targetId: "nse-view", keyPath, from, to,
      animation: new AFXAnimation({ duration, timing: context.timingFunction, reducedMotion: "never" }) }));
    captureAFXTransactionAnimationStart(() => handle.finished);
  };
  const frame = (): GFXRect => {
    const view = element();
    return { x: view.offsetLeft, y: view.offsetTop, width: view.offsetWidth, height: view.offsetHeight };
  };
  const move = (next: GFXRect) => {
    if (![next.x, next.y, next.width, next.height].every(Number.isFinite) || next.width < 0 || next.height < 0) throw new RangeError("A view frame needs finite coordinates and non-negative dimensions.");
    const view = element(), previous = frame();
    // Bind before changing CSS so the layer preserves the original presentation.
    const backing = layer();
    view.style.left = `${next.x}px`; view.style.top = `${next.y}px`;
    view.style.width = `${next.width}px`; view.style.height = `${next.height}px`;
    const from = AFXTransform3D.translation(previous.x - next.x, previous.y - next.y)
      .multiply(AFXTransform3D.scale(next.width > 0 ? previous.width / next.width : 1, next.height > 0 ? previous.height / next.height : 1));
    backing.transform = new AFXTransform3D();
    play("transform", from.toCSS(), new AFXTransform3D().toCSS());
  };
  return {
    get alphaValue() { return Number(element().ownerDocument.defaultView?.getComputedStyle(element()).opacity || 1); },
    set alphaValue(value: number) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("alphaValue must be between zero and one.");
      const view = element(), previous = Number(view.ownerDocument.defaultView?.getComputedStyle(view).opacity || 1);
      layer().opacity = value;
      play("opacity", previous, value);
    },
    get frame() { return frame(); },
    set frame(value: GFXRect) { move(value); },
    setFrameOrigin(origin: GFXPoint) { move({ ...frame(), ...origin }); },
    setFrameSize(size: GFXSize) { move({ ...frame(), ...size }); },
  };
}
