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

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { GFXColour } from "../../../FX/GraphicsFX/public";
import { NSEColourSliderPicker, NSEColourWheelPicker, type NSEColourSliderModel } from "../Pickers";
import { NSEPicker } from "../../Menus/NSEPicker";
import { NSESearchField } from "../../Controls/Fields/NSESearchField";
import { NSEScrollView } from "../../Scroll";
import { builtInColourLists, crayonRows, type NSEColourList, type NSENamedColour } from "./colourPalettes";
import type { NSEColourPickerContext } from "./colourPanelTypes";

/**
 * NSColorPanel's five modes: colour wheel, sliders, colour lists, image
 * palettes and crayons. Each previews while a gesture runs and commits when it
 * ends; the panel has no Apply button, so a commit is the change.
 */

const black = GFXColour.rgba(0, 0, 0);

/** Every row control of the panel stands this high (popups, fields, the
 * search field), with mini sliders, as NSColorPanel's small controls do. */
export const nseColourPanelControlHeight = 24;

function sameColour(hex: string, colour: GFXColour | null) {
  return colour !== null && GFXColour.parse(hex).withAlpha(colour.components.a).equals(colour);
}

export function NSEColourWheelMode({ colour, preview, commit }: NSEColourPickerContext) {
  return <div data-nse-part="wheel-mode">
    <NSEColourWheelPicker colour={colour ?? black} fields={false} brightnessPlacement="beside" controlHeight={nseColourPanelControlHeight} onPreview={(next) => preview(next, "pointer")} onCommit={(next) => commit(next, "pointer")} onCancel={(opening) => preview(opening, "pointer")} />
  </div>;
}

const sliderModels: readonly { readonly value: NSEColourSliderModel; readonly label: string }[] = [
  { value: "grey", label: "Grey Scale Slider" },
  { value: "rgb", label: "RGB Sliders" },
  { value: "cmyk", label: "CMYK Sliders" },
  { value: "hsv", label: "HSB Sliders" },
];

const greyPresets = [0, 0.25, 0.5, 0.75, 1] as const;

export function NSEColourSlidersMode({ colour, preview, commit }: NSEColourPickerContext) {
  const [model, setModel] = useState<NSEColourSliderModel>("rgb");
  const current = colour ?? black;
  return <div data-nse-part="sliders-mode">
    <NSEPicker height={nseColourPanelControlHeight} label="Slider model" labelHidden options={sliderModels} value={model} onValueChange={(next) => setModel(next as NSEColourSliderModel)} />
    <NSEColourSliderPicker model={model} colour={current} controlHeight={nseColourPanelControlHeight} onPreview={(next) => preview(next, "pointer")} onCommit={(next) => commit(next, "pointer")} />
    {model === "grey" ? <div role="group" aria-label="Greys" data-nse-part="grey-presets">
      {greyPresets.map((white) => <button key={white} type="button" aria-label={`${Math.round(white * 100)}% brightness`} style={{ "--nse-colour-sample": GFXColour.grayscale(white).toCSS() } as CSSProperties} onClick={() => commit(GFXColour.grayscale(white, current.components.a), "swatch")} />)}
    </div> : null}
  </div>;
}

export function NSEColourPalettesMode({ colour, commit, recents }: NSEColourPickerContext & { readonly recents: readonly GFXColour[] }) {
  const instanceId = useId().replace(/:/g, "");
  const [listId, setListId] = useState("syndromatic");
  const [query, setQuery] = useState("");
  const recentList = useMemo<NSEColourList>(() => ({
    id: "recent",
    name: "Recently Used",
    colours: recents.map((recent) => ({ name: recent.toHex().toUpperCase(), hex: recent.toHex() })),
  }), [recents]);
  const lists = [...builtInColourLists, recentList];
  const list = lists.find((candidate) => candidate.id === listId) ?? lists[0]!;
  const needle = query.trim().toLowerCase();
  const shown = needle ? list.colours.filter((entry) => entry.name.toLowerCase().includes(needle)) : list.colours;
  const selectedIndex = shown.findIndex((entry) => sameColour(entry.hex, colour));
  const optionId = (index: number) => `colour-list-${instanceId}-${index}`;
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (selectedIndex < 0) return;
    const option = listRef.current?.querySelector<HTMLElement>(`#${optionId(selectedIndex)}`);
    const scroll = option?.closest<HTMLElement>(".nse-scroll-view");
    if (!option || !scroll) return;
    // Reveal the chosen colour inside the list only; the page never moves.
    const optionRect = option.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    if (optionRect.top < scrollRect.top) scroll.scrollTop -= scrollRect.top - optionRect.top;
    else if (optionRect.bottom > scrollRect.bottom) scroll.scrollTop += optionRect.bottom - scrollRect.bottom;
  }, [selectedIndex]);
  const choose = (entry: NSENamedColour | undefined) => {
    if (entry) commit(GFXColour.parse(entry.hex).withAlpha(colour?.components.a ?? 1), "swatch");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (event.key === "Home") { event.preventDefault(); choose(shown[0]); return; }
    if (event.key === "End") { event.preventDefault(); choose(shown.at(-1)); return; }
    if (!step) return;
    event.preventDefault();
    choose(shown[Math.max(0, Math.min(shown.length - 1, (selectedIndex < 0 ? (step > 0 ? -1 : shown.length) : selectedIndex) + step))]);
  };
  return <div data-nse-part="palettes-mode">
    <NSEPicker height={nseColourPanelControlHeight} label="List" options={lists.map((candidate) => ({ value: candidate.id, label: candidate.name }))} value={list.id} onValueChange={(next) => { setListId(next); setQuery(""); }} />
    <NSEScrollView data-nse-part="colour-list-scroll">
      <div ref={listRef} role="listbox" aria-label={`${list.name} colours`} tabIndex={0} aria-activedescendant={selectedIndex >= 0 ? optionId(selectedIndex) : undefined} data-nse-part="colour-list" onKeyDown={onKeyDown}>
        {shown.map((entry, index) => <div key={`${entry.name}-${entry.hex}`} id={optionId(index)} role="option" aria-selected={index === selectedIndex} data-nse-part="colour-list-row" onClick={() => choose(entry)}>
          <span data-nse-part="colour-list-chip" aria-hidden="true" style={{ backgroundColor: entry.hex }} />
          <span data-nse-part="colour-list-name">{entry.name}</span>
        </div>)}
        {shown.length === 0 ? <p role="status" data-nse-part="colour-list-empty">{list.colours.length === 0 ? "No colours yet." : "No matching colours."}</p> : null}
      </div>
    </NSEScrollView>
    <NSESearchField height={nseColourPanelControlHeight} aria-label={`Search ${list.name}`} placeholder="Search" value={query} onValueChange={setQuery} />
  </div>;
}

interface PaletteImage {
  readonly id: string;
  readonly name: string;
  readonly url: string | null;
}

const spectrum: PaletteImage = { id: "spectrum", name: "Spectrum", url: null };
const OPEN_IMAGE = "__open-image";

/** Hue across, white above and black below: NSColorPanel's Spectrum. */
function drawSpectrum(context: CanvasRenderingContext2D, width: number, height: number) {
  const hues = context.createLinearGradient(0, 0, width, 0);
  for (let stop = 0; stop <= 6; stop += 1) hues.addColorStop(stop / 6, `hsl(${stop * 60} 100% 50%)`);
  context.fillStyle = hues;
  context.fillRect(0, 0, width, height);
  const light = context.createLinearGradient(0, 0, 0, height);
  light.addColorStop(0, "rgba(255, 255, 255, 1)");
  light.addColorStop(0.5, "rgba(255, 255, 255, 0)");
  light.addColorStop(0.5, "rgba(0, 0, 0, 0)");
  light.addColorStop(1, "rgba(0, 0, 0, 1)");
  context.fillStyle = light;
  context.fillRect(0, 0, width, height);
}

export function NSEColourImageMode({ colour, preview, commit }: NSEColourPickerContext) {
  const [images, setImages] = useState<readonly PaletteImage[]>([spectrum]);
  const [imageId, setImageId] = useState(spectrum.id);
  const [marker, setMarker] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = useRef<number | null>(null);
  const opening = useRef<GFXColour | null>(null);
  const image = images.find((candidate) => candidate.id === imageId) ?? spectrum;
  useEffect(() => () => {
    for (const candidate of images) if (candidate.url) URL.revokeObjectURL(candidate.url);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!image.url) {
      drawSpectrum(context, canvas.width, canvas.height);
      return;
    }
    const picture = new Image();
    let current = true;
    picture.onload = () => {
      if (!current) return;
      // Cover the palette, cropping the longer side about the centre.
      const scale = Math.max(canvas.width / picture.naturalWidth, canvas.height / picture.naturalHeight);
      const width = picture.naturalWidth * scale;
      const height = picture.naturalHeight * scale;
      context.drawImage(picture, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    };
    picture.src = image.url;
    return () => { current = false; };
  }, [image]);
  const sample = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width - 1, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
    setMarker({ x: x / rect.width, y: y / rect.height });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const [r, g, b] = context.getImageData(Math.floor(x * canvas.width / rect.width), Math.floor(y * canvas.height / rect.height), 1, 1).data;
    return GFXColour.rgba(r / 255, g / 255, b / 255, colour?.components.a ?? 1);
  };
  const openImage = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const next = { id: `image-${Date.now()}`, name: file.name.replace(/\.[^.]+$/, ""), url: URL.createObjectURL(file) };
    setImages((current) => [...current, next]);
    setImageId(next.id);
    setMarker(null);
  };
  return <div data-nse-part="image-mode">
    <NSEPicker height={nseColourPanelControlHeight} label="Image" options={[...images.map((candidate) => ({ value: candidate.id, label: candidate.name })), { value: OPEN_IMAGE, label: "Open Image…" }]} value={image.id} onValueChange={(next) => {
      if (next === OPEN_IMAGE) fileRef.current?.click();
      else { setImageId(next); setMarker(null); }
    }} />
    <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { openImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
    <div data-nse-part="image-palette">
      <canvas ref={canvasRef} width={480} height={340} role="img" aria-label={`${image.name}: click or drag to pick a colour`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          active.current = event.pointerId;
          opening.current = colour;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const next = sample(event);
          if (next) preview(next, "pointer");
        }}
        onPointerMove={(event) => {
          if (active.current !== event.pointerId) return;
          const next = sample(event);
          if (next) preview(next, "pointer");
        }}
        onPointerUp={(event) => {
          if (active.current !== event.pointerId) return;
          active.current = null;
          const next = sample(event);
          if (next) commit(next, "pointer");
        }}
        onPointerCancel={() => {
          active.current = null;
          if (opening.current) preview(opening.current, "pointer");
        }}
      />
      {marker ? <span data-nse-part="image-marker" aria-hidden="true" style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }} /> : null}
    </div>
  </div>;
}

/**
 * One crayon, after the Mac OS X crayon box: a cone of wax with a worn,
 * blunted point and a shadowed collar where it meets the stick; a round stick
 * lit from the left with a specular stripe; and a paper wrapper ruled twice
 * at its head. Its colour comes from --nse-crayon.
 */
function Crayon({ ids }: { readonly ids: CrayonGradientIds }) {
  return <svg viewBox="0 0 20 130" preserveAspectRatio="none" aria-hidden focusable={false} data-nse-part="crayon-art">
    <path d="M1.6 19.5 8 4.6Q8.5 3.2 10 3.1Q11.5 3.2 12 4.6L18.4 19.5Z" fill="var(--nse-crayon)" />
    <path d="M1.6 19.5 8 4.6Q8.5 3.2 10 3.1Q11.5 3.2 12 4.6L18.4 19.5Z" fill={`url(#${ids.tip})`} />
    <path d="M8 4.6Q8.5 3.2 10 3.1Q11.5 3.2 12 4.6Q10 5.6 8 4.6Z" fill="rgba(255,255,255,0.35)" />
    <path d="M1.6 19.5 8 4.6Q8.5 3.2 10 3.1Q11.5 3.2 12 4.6L18.4 19.5" fill="none" stroke="rgba(0,0,0,0.42)" strokeWidth="0.5" />
    <rect x="0.3" y="19" width="19.4" height="111" fill="var(--nse-crayon)" />
    <rect x="0.3" y="19" width="19.4" height="111" fill={`url(#${ids.shade})`} />
    <ellipse cx="10" cy="19.6" rx="9.7" ry="1.3" fill="rgba(0,0,0,0.3)" />
    <rect x="0.3" y="25" width="19.4" height="105" fill={`url(#${ids.paper})`} />
    <rect x="0.3" y="26" width="19.4" height="0.9" fill="rgba(0,0,0,0.42)" />
    <rect x="0.3" y="28.2" width="19.4" height="0.6" fill="rgba(0,0,0,0.3)" />
    <rect x="3.6" y="19.6" width="2" height="110.4" fill="rgba(255,255,255,0.42)" />
    <rect x="0.3" y="19" width="19.4" height="111" fill="none" stroke="rgba(0,0,0,0.42)" strokeWidth="0.5" />
  </svg>;
}

interface CrayonGradientIds {
  readonly tip: string;
  readonly shade: string;
  readonly paper: string;
}

export function NSEColourCrayonsMode({ colour, commit }: NSEColourPickerContext) {
  const gradient = useId().replace(/:/g, "");
  const ids: CrayonGradientIds = { tip: `nse-crayon-tip-${gradient}`, shade: `nse-crayon-shade-${gradient}`, paper: `nse-crayon-paper-${gradient}` };
  const selected = crayonRows.flat().find((entry) => sameColour(entry.hex, colour)) ?? null;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const choose = (entry: NSENamedColour) => {
    commit(GFXColour.parse(entry.hex).withAlpha(colour?.components.a ?? 1), "swatch");
    buttons.current.get(entry.name)?.focus({ preventScroll: true });
  };
  const move = (row: number, column: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 0], ArrowDown: [-1, 0] }[event.key as "ArrowLeft"];
    if (!delta) return;
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(crayonRows.length - 1, row + delta[0]));
    const next = crayonRows[nextRow]!;
    choose(next[Math.max(0, Math.min(next.length - 1, column + delta[1]))]!);
  };
  // The front row is drawn last, over the rows behind it.
  const rowsBackToFront = crayonRows.map((row, index) => ({ row, index })).reverse();
  const focusable = selected?.name ?? crayonRows[0]![0]!.name;
  return <div data-nse-part="crayons-mode">
    <div role="radiogroup" aria-label="Crayons" data-nse-part="crayon-box">
      <svg width="0" height="0" aria-hidden focusable={false} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id={ids.shade} x1="0" x2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.3" />
            <stop offset="0.16" stopColor="#000" stopOpacity="0.04" />
            <stop offset="0.3" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.82" stopColor="#000" stopOpacity="0.16" />
            <stop offset="1" stopColor="#000" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id={ids.tip} x1="0" x2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.28" />
            <stop offset="0.36" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="0.6" stopColor="#000" stopOpacity="0.06" />
            <stop offset="1" stopColor="#000" stopOpacity="0.42" />
          </linearGradient>
          <linearGradient id={ids.paper} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.06" />
          </linearGradient>
        </defs>
      </svg>
      {rowsBackToFront.map(({ row, index }) => row.map((entry, column) => <button
        key={entry.name}
        ref={(node) => { if (node) buttons.current.set(entry.name, node); else buttons.current.delete(entry.name); }}
        type="button"
        role="radio"
        aria-checked={selected?.name === entry.name}
        aria-label={entry.name}
        title={entry.name}
        tabIndex={entry.name === focusable ? 0 : -1}
        data-nse-part="crayon"
        data-row={index}
        style={{ "--nse-crayon": entry.hex, "--nse-crayon-row": index, "--nse-crayon-column": column } as CSSProperties}
        onClick={() => choose(entry)}
        onKeyDown={(event) => move(index, column, event)}
      ><Crayon ids={ids} /></button>))}
      <span data-nse-part="crayon-box-front" aria-hidden="true" />
    </div>
  </div>;
}
