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

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { nseThemeSlot, useNSEThemeRecipe } from "../../Appearance";
import { GFXColour, type GFXCMYKAComponents } from "../../../FX/GraphicsFX/public";
import { NSESlider } from "../../Controls/Values/NSESlider";
import { NSETextField } from "../../Controls/Fields/NSEFields";

/**
 * The slider models of CPSliderColorPicker / NSColorPanel's sliders mode:
 * grey scale, RGB, CMYK and HSB (plus HSL). CMYK is device CMYK; see
 * GFXCMYKAComponents.
 */
export type NSEColourSliderModel = "grey" | "rgb" | "cmyk" | "hsv" | "hsl";

export interface NSEColourSliderPickerProps {
  readonly model: NSEColourSliderModel;
  readonly colour: GFXColour;
  readonly showAlpha?: boolean;
  /** Compact rows for a panel: the value fields take this height and the
   * sliders their mini size. Without it the picker uses small controls. */
  readonly controlHeight?: number;
  onPreview(colour: GFXColour): void;
  onCommit(colour: GFXColour): void;
}

const legends = {
  grey: "Grey Scale",
  rgb: "Red, Green, Blue",
  cmyk: "Cyan, Magenta, Yellow, Black",
  hsv: "Hue, Saturation, Brightness",
  hsl: "Hue, Saturation, Lightness",
} as const;
const hueTrack = "linear-gradient(to right, #f00, #ff0 16.67%, #0f0 33.33%, #0ff 50%, #00f 66.67%, #f0f 83.33%, #f00)";

interface Channel {
  readonly name: string;
  readonly key: string;
  readonly value: number;
  readonly max: number;
  readonly unit?: "%";
  readonly track: string;
}

const percent = (unit: number) => Math.round(unit * 100);

export function NSEColourSliderPicker({ model, colour, showAlpha, controlHeight, onPreview, onCommit }: NSEColourSliderPickerProps) {
  const sliderSize = controlHeight === undefined ? "small" : "mini";
  const [draft, setDraft] = useState(colour);
  const latest = useRef(colour);
  // CMYK is edited in its own components: the colour is held as RGB, and
  // re-deriving CMYK from it on every change would move black into the inks
  // under the user's hand. The draft is dropped when the colour arrives from
  // elsewhere.
  const cmykDraft = useRef<GFXCMYKAComponents | null>(null);
  useEffect(() => {
    if (!colour.equals(latest.current)) cmykDraft.current = null;
    latest.current = colour;
    setDraft(colour);
  }, [colour]);
  const rgb = draft.converting("srgb").components;
  const hsv = draft.hsva;
  const hsl = draft.hsla;
  const cmyk = cmykDraft.current ?? draft.cmyka;
  const white = draft.converting("grayscale").components.r;
  const css = (next: GFXColour) => next.withAlpha(1).toCSS();
  const cmykTrack = (key: keyof GFXCMYKAComponents) => `linear-gradient(to right, ${css(GFXColour.cmyka({ ...cmyk, [key]: 0 }))}, ${css(GFXColour.cmyka({ ...cmyk, [key]: 1 }))})`;
  // Each track previews the colour that channel would produce at either end
  // (hue runs the spectrum), so the rows read as a map, not just a number.
  const channels: readonly Channel[] = model === "grey"
    ? [{ name: "Brightness", key: "W", value: percent(white), max: 100, unit: "%", track: "linear-gradient(to right, #000, #fff)" }]
    : model === "rgb"
      ? [
        { name: "Red", key: "R", value: Math.round(rgb.r * 255), max: 255, track: `linear-gradient(to right, ${css(GFXColour.rgba(0, rgb.g, rgb.b))}, ${css(GFXColour.rgba(1, rgb.g, rgb.b))})` },
        { name: "Green", key: "G", value: Math.round(rgb.g * 255), max: 255, track: `linear-gradient(to right, ${css(GFXColour.rgba(rgb.r, 0, rgb.b))}, ${css(GFXColour.rgba(rgb.r, 1, rgb.b))})` },
        { name: "Blue", key: "B", value: Math.round(rgb.b * 255), max: 255, track: `linear-gradient(to right, ${css(GFXColour.rgba(rgb.r, rgb.g, 0))}, ${css(GFXColour.rgba(rgb.r, rgb.g, 1))})` },
      ]
      : model === "cmyk"
        ? [
          { name: "Cyan", key: "C", value: percent(cmyk.c), max: 100, unit: "%", track: cmykTrack("c") },
          { name: "Magenta", key: "M", value: percent(cmyk.m), max: 100, unit: "%", track: cmykTrack("m") },
          { name: "Yellow", key: "Y", value: percent(cmyk.y), max: 100, unit: "%", track: cmykTrack("y") },
          { name: "Black", key: "K", value: percent(cmyk.k), max: 100, unit: "%", track: cmykTrack("k") },
        ]
        : model === "hsv"
          ? [
            { name: "Hue", key: "H", value: Math.round(hsv.h), max: 360, track: hueTrack },
            { name: "Saturation", key: "S", value: percent(hsv.s), max: 100, unit: "%", track: `linear-gradient(to right, ${css(GFXColour.hsva({ ...hsv, s: 0 }))}, ${css(GFXColour.hsva({ ...hsv, s: 1 }))})` },
            { name: "Brightness", key: "B", value: percent(hsv.v), max: 100, unit: "%", track: `linear-gradient(to right, #000, ${css(GFXColour.hsva({ ...hsv, v: 1 }))})` },
          ]
          : [
            { name: "Hue", key: "H", value: Math.round(hsl.h), max: 360, track: hueTrack },
            { name: "Saturation", key: "S", value: percent(hsl.s), max: 100, unit: "%", track: `linear-gradient(to right, ${css(GFXColour.hsla({ ...hsl, s: 0 }))}, ${css(GFXColour.hsla({ ...hsl, s: 1 }))})` },
            { name: "Lightness", key: "L", value: percent(hsl.l), max: 100, unit: "%", track: `linear-gradient(to right, #000, ${css(GFXColour.hsla({ ...hsl, l: 0.5 }))}, #fff)` },
          ];
  const publish = (next: GFXColour) => {
    latest.current = next;
    setDraft(next);
    onPreview(next);
    return next;
  };
  const update = (index: number, raw: number) => {
    const value = Math.max(0, Math.min(channels[index].max, raw));
    const current = latest.current;
    const alpha = current.components.a;
    if (model === "grey") return publish(GFXColour.grayscale(value / 100, alpha));
    if (model === "rgb") {
      const { r, g, b } = current.converting("srgb").components;
      const values = [r, g, b];
      values[index] = value / 255;
      return publish(GFXColour.rgba(values[0], values[1], values[2], alpha));
    }
    if (model === "cmyk") {
      const keys = ["c", "m", "y", "k"] as const;
      const next = { ...(cmykDraft.current ?? current.cmyka), [keys[index]]: value / 100, a: alpha };
      cmykDraft.current = next;
      return publish(GFXColour.cmyka(next));
    }
    if (model === "hsv") {
      const { h, s, v } = current.hsva;
      const values = [h, s * 100, v * 100];
      values[index] = value;
      return publish(GFXColour.hsva({ h: values[0], s: values[1] / 100, v: values[2] / 100, a: alpha }));
    }
    const { h, s, l } = current.hsla;
    const values = [h, s * 100, l * 100];
    values[index] = value;
    return publish(GFXColour.hsla({ h: values[0], s: values[1] / 100, l: values[2] / 100, a: alpha }));
  };
  const updateAlpha = (percentValue: number) => {
    const next = latest.current.withAlpha(Math.max(0, Math.min(100, percentValue)) / 100);
    if (cmykDraft.current) cmykDraft.current = { ...cmykDraft.current, a: next.components.a };
    publish(next);
  };
  const entry = (text: string, phase: "preview" | "commit" | "cancel", apply: (value: number) => void) => {
    if (phase === "commit") { onCommit(latest.current); return; }
    if (phase === "cancel") return;
    if (text.trim() !== "" && Number.isFinite(Number(text))) apply(Number(text));
  };
  const appearance = useNSEThemeRecipe(nseThemeSlot("colour-slider", "track", "normal"));
  const alphaTrack = `linear-gradient(to right, ${draft.withAlpha(0).toCSS()}, ${css(draft)})`;
  return <fieldset data-nse-control="colour-sliders" data-model={model} data-state="ready" {...appearance.attributes}><legend>{legends[model]}</legend>
    {channels.map((channel, index) => <div key={channel.name} data-nse-part="channel" data-unit={channel.unit} style={{ "--nse-colour-channel-track": channel.track } as CSSProperties}>
      <span data-nse-part="channel-key" aria-hidden="true">{channel.key}</span>
      <span data-nse-part="channel-name" aria-hidden="true">{channel.name}</span>
      <NSESlider controlSize={sliderSize} aria-label={channel.name} minimum={0} maximum={channel.max} value={channel.value} onValueChange={(value, phase) => { if (value !== channel.value) update(index, value); if (phase === "commit") onCommit(latest.current); }} />
      <NSETextField controlSize="small" height={controlHeight} aria-label={channel.name} type="number" inputMode="numeric" min={0} max={channel.max} value={String(channel.value)} onValueChange={(text, phase) => entry(text, phase, (value) => update(index, value))} />
    </div>)}
    {showAlpha ? <div data-nse-part="channel" data-channel="alpha" data-unit="%" style={{ "--nse-colour-channel-track": alphaTrack } as CSSProperties}>
      <span data-nse-part="channel-key" aria-hidden="true">A</span>
      <span data-nse-part="channel-name" aria-hidden="true">Opacity</span>
      <NSESlider controlSize={sliderSize} aria-label="Alpha" minimum={0} maximum={100} value={Math.round(rgb.a * 100)} onValueChange={(value, phase) => { if (value !== Math.round(latest.current.components.a * 100)) updateAlpha(value); if (phase === "commit") onCommit(latest.current); }} />
      <NSETextField controlSize="small" height={controlHeight} aria-label="Alpha" type="number" inputMode="numeric" min={0} max={100} value={String(Math.round(rgb.a * 100))} onValueChange={(text, phase) => entry(text, phase, updateAlpha)} />
    </div> : null}
  </fieldset>;
}
