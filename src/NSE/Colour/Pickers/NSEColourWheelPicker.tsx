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

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { nseThemeSlot, useNSEThemeRecipe } from "../../Appearance";
import { GFXColour } from "../../../FX/GraphicsFX/public";
import { NSESlider } from "../../Controls/Values/NSESlider";
import { NSETextField } from "../../Controls/Fields/NSEFields";

export interface NSEColourWheelPickerProps {
  readonly colour: GFXColour;
  readonly disabled?: boolean;
  /** Numeric hue/saturation/brightness/opacity entry below the wheel. A host
   * that already offers channel entry (the colour panel) turns it off. */
  readonly fields?: boolean;
  /** Where the brightness slider stands: below the wheel, or upright beside
   * it as in the colour panel's wheel mode. */
  readonly brightnessPlacement?: "below" | "beside";
  /** Compact controls for a panel: the value fields take this height and the
   * brightness slider its mini size. Without it the picker uses small controls. */
  readonly controlHeight?: number;
  onPreview(colour: GFXColour): void;
  onCommit(colour: GFXColour): void;
  onCancel?(opening: GFXColour): void;
}

function releasePointerCaptureSafely(element: HTMLElement | null, pointerId: number) {
  if (!element?.releasePointerCapture) return;
  try {
    if (!element.hasPointerCapture || element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Capture may already have been released by the browser before React sees
    // lostpointercapture. Settlement remains authoritative and idempotent.
  }
}

export function NSEColourWheelPicker({ colour, disabled, fields = true, brightnessPlacement = "below", controlHeight, onPreview, onCommit, onCancel }: NSEColourWheelPickerProps) {
  const [draft, setDraft] = useState(colour);
  const latest = useRef(colour);
  const activePointer = useRef<number | null>(null);
  const pointerOpening = useRef<GFXColour | null>(null);
  const pointerElement = useRef<HTMLElement | null>(null);
  useEffect(() => { latest.current = colour; setDraft(colour); }, [colour]);
  const cancelActiveGesture = useCallback((pointerId?: number) => {
    const activeId = activePointer.current;
    if (activeId === null || (pointerId !== undefined && pointerId !== activeId)) return;
    const opening = pointerOpening.current ?? colour;
    const element = pointerElement.current;
    activePointer.current = null;
    pointerOpening.current = null;
    pointerElement.current = null;
    releasePointerCaptureSafely(element, activeId);
    latest.current = opening;
    setDraft(opening);
    onCancel?.(opening);
  }, [colour, onCancel]);
  useEffect(() => {
    if (!disabled) return;
    cancelActiveGesture();
  }, [cancelActiveGesture, disabled]);
  const adjust = (hueDelta: number, saturationDelta: number) => {
    if (disabled) return;
    const hsv = draft.hsva;
    const next = GFXColour.hsva({ ...hsv, h: hsv.h + hueDelta, s: hsv.s + saturationDelta });
    latest.current = next; setDraft(next); onPreview(next);
  };
  const updateFromPointer = (element: HTMLElement, clientX: number, clientY: number) => {
    if (disabled) return;
    const rect = element.getBoundingClientRect();
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
    const hue = (Math.atan2(-y, x) * 180 / Math.PI + 360) % 360;
    const saturation = Math.min(1, Math.hypot(x, y) / radius);
    const next = GFXColour.hsva({ ...latest.current.hsva, h: hue, s: saturation });
    latest.current = next;
    setDraft(next);
    onPreview(next);
  };
  const updateNumeric = (part: "h" | "s" | "v" | "a", raw: number) => {
    if (disabled) return;
    const hsv = draft.hsva;
    const next = GFXColour.hsva({ ...hsv, [part]: part === "h" ? raw : raw / 100 });
    latest.current = next;
    setDraft(next);
    onPreview(next);
  };
  const hueRadians = draft.hsva.h * Math.PI / 180;
  const wheelStyle: CSSProperties & Record<`--nse-${string}`, string> = {
    "--nse-colour-wheel-x": `${50 + Math.cos(hueRadians) * draft.hsva.s * 50}%`,
    "--nse-colour-wheel-y": `${50 - Math.sin(hueRadians) * draft.hsva.s * 50}%`,
    "--nse-colour-wheel-full": GFXColour.hsva({ h: draft.hsva.h, s: draft.hsva.s, v: 1, a: 1 }).toCSS(),
    "--nse-colour-wheel-darkness": String(1 - draft.hsva.v),
    // An upright slider is the horizontal one turned a quarter, so its track
    // still runs "to right": black at the bottom, the full colour at the top.
    "--nse-colour-channel-track": `linear-gradient(to right, #000, ${GFXColour.hsva({ h: draft.hsva.h, s: draft.hsva.s, v: 1, a: 1 }).toCSS()})`,
  };
  const appearance = useNSEThemeRecipe(nseThemeSlot("colour-wheel", "wheel", disabled ? "disabled" : "normal"));
  return <div data-nse-control="colour-wheel" data-state={disabled ? "disabled" : "ready"} data-brightness={brightnessPlacement} {...appearance.attributes} style={wheelStyle}>
    <div role="slider" aria-label="Colour hue and saturation" aria-disabled={disabled || undefined} aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(draft.hsva.h)} tabIndex={disabled ? -1 : 0} {...appearance.attributes}
      onPointerDown={(event) => { if (disabled) return; activePointer.current = event.pointerId; pointerOpening.current = colour; pointerElement.current = event.currentTarget; event.currentTarget.setPointerCapture?.(event.pointerId); updateFromPointer(event.currentTarget, event.clientX, event.clientY); }}
      onPointerMove={(event) => { if (!disabled && activePointer.current === event.pointerId) updateFromPointer(event.currentTarget, event.clientX, event.clientY); }}
      onPointerUp={(event) => { if (disabled || activePointer.current !== event.pointerId) return; updateFromPointer(event.currentTarget, event.clientX, event.clientY); activePointer.current = null; pointerOpening.current = null; pointerElement.current = null; releasePointerCaptureSafely(event.currentTarget, event.pointerId); onCommit(latest.current); }}
      onPointerCancel={(event) => { cancelActiveGesture(event.pointerId); }}
      onLostPointerCapture={(event) => { cancelActiveGesture(event.pointerId); }}
      onKeyDown={(event) => {
      if (disabled) return;
      if (event.key === "ArrowRight") adjust(1, 0);
      else if (event.key === "ArrowLeft") adjust(-1, 0);
      else if (event.key === "ArrowUp") adjust(0, 0.01);
      else if (event.key === "ArrowDown") adjust(0, -0.01);
    }} onKeyUp={(event) => { if (!disabled && event.key.startsWith("Arrow")) onCommit(latest.current); }}><span data-nse-part="wheel-surface" /></div>
    <NSESlider controlSize={controlHeight === undefined ? "small" : "mini"} orientation={brightnessPlacement === "beside" ? "vertical" : "horizontal"} data-nse-part="brightness" aria-label="Brightness" minimum={0} maximum={100} value={Math.round(draft.hsva.v * 100)} disabled={disabled} onValueChange={(value, phase) => { if (disabled) return; if (value !== Math.round(latest.current.hsva.v * 100)) { const next = GFXColour.hsva({ ...latest.current.hsva, v: value / 100 }); latest.current = next; setDraft(next); onPreview(next); } if (phase === "commit") onCommit(latest.current); }} />
    {fields ? <div data-nse-part="numeric">
      <NSETextField controlSize="small" height={controlHeight} label="Hue" aria-label="Hue" type="number" inputMode="numeric" min={0} max={360} value={String(Math.round(draft.hsva.h))} disabled={disabled} onValueChange={(text, phase) => { if (phase === "commit") { if (!disabled) onCommit(latest.current); } else if (text.trim() !== "" && Number.isFinite(Number(text))) updateNumeric("h", Number(text)); }} />
      <NSETextField controlSize="small" height={controlHeight} label="Saturation" aria-label="Saturation" type="number" inputMode="numeric" min={0} max={100} value={String(Math.round(draft.hsva.s * 100))} disabled={disabled} onValueChange={(text, phase) => { if (phase === "commit") { if (!disabled) onCommit(latest.current); } else if (text.trim() !== "" && Number.isFinite(Number(text))) updateNumeric("s", Number(text)); }} />
      <NSETextField controlSize="small" height={controlHeight} label="Brightness" aria-label="Brightness value" type="number" inputMode="numeric" min={0} max={100} value={String(Math.round(draft.hsva.v * 100))} disabled={disabled} onValueChange={(text, phase) => { if (phase === "commit") { if (!disabled) onCommit(latest.current); } else if (text.trim() !== "" && Number.isFinite(Number(text))) updateNumeric("v", Number(text)); }} />
      <NSETextField controlSize="small" height={controlHeight} label="Opacity" aria-label="Opacity" type="number" inputMode="numeric" min={0} max={100} value={String(Math.round(draft.hsva.a * 100))} disabled={disabled} onValueChange={(text, phase) => { if (phase === "commit") { if (!disabled) onCommit(latest.current); } else if (text.trim() !== "" && Number.isFinite(Number(text))) updateNumeric("a", Number(text)); }} />
    </div> : null}
  </div>;
}
