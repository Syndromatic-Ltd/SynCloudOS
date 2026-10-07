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

import { GFXColour } from "../../../FX/GraphicsFX/public";
import { classifyEyeDropperError, type NSEEyeDropperAdapter, type NSEEyeDropperResult } from "./NSEEyeDropperAdapter";

interface NativeEyeDropper {
  open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
}

type EyeDropperWindow = Window & { EyeDropper?: new () => NativeEyeDropper };

/** Pixels shown across the loupe, and how large each is drawn. */
const LOUPE_PIXELS = 11;
const LOUPE_ZOOM = 12;
const LOUPE_SIZE = LOUPE_PIXELS * LOUPE_ZOOM;

const cancelled = Object.freeze({ kind: "cancelled" as const });

/**
 * The loupe's glass, traced from the Mac OS X magnifier lens: a fine graphite
 * rim with a pale inner edge, a gloss cap over the top third ending in a soft
 * curve, and a glow rising from the bottom. It lies over the magnified pixels.
 */
const LOUPE_GLASS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
  <defs>
    <linearGradient id="nse-loupe-gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.62"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.16"/>
    </linearGradient>
    <radialGradient id="nse-loupe-glow" cx="50" cy="96" r="42" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="48.5" fill="url(#nse-loupe-glow)"/>
  <path d="M5.6 36.5A45.5 45.5 0 0 1 94.4 36.5Q50 27.5 5.6 36.5Z" fill="url(#nse-loupe-gloss)"/>
  <circle cx="50" cy="50" r="47.6" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="1"/>
  <circle cx="50" cy="50" r="48.8" fill="none" stroke="#6f7072" stroke-width="1.4"/>
</svg>`;

/**
 * The colour panel's magnifier: it picks a colour from anywhere on the page.
 * Where the browser has a system eyedropper (the EyeDropper API) that is the
 * loupe the user gets, and it can sample the whole screen. Elsewhere the page
 * is captured once and a loupe drawn over it samples the capture: the pixel
 * under the pointer at the moment of the click is the colour picked.
 */
export function createNSEBrowserEyeDropper(view: Window): NSEEyeDropperAdapter {
  return {
    availability: () => view.document ? "available" : "unavailable",
    async pick(signal) {
      if (signal?.aborted) return cancelled;
      const Native = (view as EyeDropperWindow).EyeDropper;
      if (Native) {
        try {
          const { sRGBHex } = await new Native().open({ signal });
          return Object.freeze({ kind: "accepted" as const, colour: GFXColour.parse(sRGBHex) });
        } catch (error) {
          return classifyEyeDropperError(error);
        }
      }
      try {
        return await pickFromCapture(view, signal);
      } catch (error) {
        return classifyEyeDropperError(error);
      }
    },
  };
}

function intersectsViewport(view: Window, element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width >= 1 && rect.height >= 1 && rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth;
}

/** The outermost fixed-position layers on screen (windows, panels, bars), in paint order. */
function fixedLayers(view: Window): HTMLElement[] {
  const layers: { element: HTMLElement; z: number; order: number }[] = [];
  let order = 0;
  for (const element of view.document.body.querySelectorAll<HTMLElement>("*")) {
    order += 1;
    const style = view.getComputedStyle(element);
    if (style.position !== "fixed" || style.display === "none" || style.visibility === "hidden") continue;
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== view.document.body && view.getComputedStyle(ancestor).position !== "fixed") ancestor = ancestor.parentElement;
    if (ancestor && ancestor !== view.document.body) continue;
    if (!intersectsViewport(view, element)) continue;
    layers.push({ element, z: Number.parseInt(style.zIndex, 10) || 0, order });
  }
  return layers.sort((a, b) => a.z - b.z || a.order - b.order).map(({ element }) => element);
}

function loadedImage(image: HTMLImageElement): Promise<HTMLImageElement> {
  return image.complete && image.naturalWidth > 0 ? Promise.resolve(image) : image.decode().then(() => image);
}

/**
 * The visible viewport as it stands on screen, at device pixels. The page
 * is rendered to vector (SVG) and only the viewport's rectangle rasterised,
 * so a long page is never scaled down to fit a canvas and the capture holds
 * one pixel per device pixel. A render of the document draws fixed-position
 * layers where they sit in the viewport as if the page were not scrolled, so
 * they are left out of it and each is drawn at its own place on screen.
 */
async function capturePage(view: Window): Promise<HTMLCanvasElement> {
  const { snapdom } = await import("@zumer/snapdom");
  const document = view.document;
  const root = document.documentElement;
  const dpr = view.devicePixelRatio || 1;
  const width = view.innerWidth;
  const height = view.innerHeight;
  const layers = fixedLayers(view);
  const left = new Set<Element>(layers);
  const page = await loadedImage(await snapdom.toSvg(root, { cache: "auto", embedFonts: false, fast: true, filter: (element) => !left.has(element), filterMode: "hide" }));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const scaleX = page.naturalWidth / Math.max(1, root.scrollWidth);
  const scaleY = page.naturalHeight / Math.max(1, root.scrollHeight);
  context.drawImage(page, view.scrollX * scaleX, view.scrollY * scaleY, width * scaleX, height * scaleY, 0, 0, canvas.width, canvas.height);
  for (const layer of layers) {
    const rect = layer.getBoundingClientRect();
    const shot = await loadedImage(await snapdom.toSvg(layer, { cache: "auto", embedFonts: false, fast: true }));
    context.drawImage(shot, rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr);
  }
  return canvas;
}

function pickFromCapture(view: Window, signal: AbortSignal | undefined): Promise<NSEEyeDropperResult> {
  const document = view.document;
  const root = document.documentElement;
  const previousCursor = root.style.cursor;
  root.style.cursor = "progress";
  return capturePage(view).then((capture) => new Promise<NSEEyeDropperResult>((resolve) => {
    root.style.cursor = previousCursor;
    if (signal?.aborted) {
      resolve(cancelled);
      return;
    }
    const context = capture.getContext("2d", { willReadFrequently: true });
    if (!context) {
      resolve(Object.freeze({ kind: "unavailable" as const }));
      return;
    }
    // The capture is the viewport at device pixels: the pixel under a point
    // is the one its device coordinates fall in.
    const scaleX = capture.width / Math.max(1, view.innerWidth);
    const scaleY = capture.height / Math.max(1, view.innerHeight);
    const sampleAt = (clientX: number, clientY: number) => {
      const x = Math.floor(clientX * scaleX);
      const y = Math.floor(clientY * scaleY);
      const [r, g, b] = context.getImageData(Math.min(capture.width - 1, Math.max(0, x)), Math.min(capture.height - 1, Math.max(0, y)), 1, 1).data;
      return { x, y, colour: GFXColour.rgba(r / 255, g / 255, b / 255) };
    };

    const shield = document.createElement("div");
    shield.setAttribute("data-nse-eyedropper", "");
    shield.setAttribute("role", "application");
    shield.setAttribute("aria-label", "Pick a colour: click to choose, Escape to cancel");
    shield.tabIndex = -1;
    // The loupe stands in for the pointer, as the system eyedropper's does.
    Object.assign(shield.style, { position: "fixed", inset: "0", zIndex: "2147483647", cursor: "none", outline: "none" });
    const loupe = document.createElement("div");
    loupe.setAttribute("data-nse-part", "loupe");
    Object.assign(loupe.style, {
      position: "fixed", width: `${LOUPE_SIZE}px`, height: `${LOUPE_SIZE}px`, borderRadius: "50%", overflow: "hidden", pointerEvents: "none",
      boxShadow: "0 6px 16px rgba(0, 0, 0, 0.32)", visibility: "hidden",
    });
    const lens = document.createElement("canvas");
    lens.width = LOUPE_SIZE;
    lens.height = LOUPE_SIZE;
    Object.assign(lens.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
    const glass = document.createElement("div");
    glass.innerHTML = LOUPE_GLASS;
    Object.assign(glass.style, { position: "absolute", inset: "0" });
    loupe.append(lens, glass);
    const readout = document.createElement("div");
    Object.assign(readout.style, {
      position: "fixed", padding: "2px 7px", borderRadius: "9px", pointerEvents: "none", visibility: "hidden",
      font: "600 11px/1.4 ui-monospace, Menlo, Consolas, monospace", color: "#fff", background: "rgba(24, 30, 38, 0.86)",
    });
    shield.append(loupe, readout);
    const lensContext = lens.getContext("2d")!;
    lensContext.imageSmoothingEnabled = false;

    const draw = (clientX: number, clientY: number) => {
      const { x, y, colour } = sampleAt(clientX, clientY);
      const half = Math.floor(LOUPE_PIXELS / 2);
      lensContext.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
      lensContext.drawImage(capture, x - half, y - half, LOUPE_PIXELS, LOUPE_PIXELS, 0, 0, LOUPE_SIZE, LOUPE_SIZE);
      lensContext.strokeStyle = "rgba(0, 0, 0, 0.12)";
      lensContext.lineWidth = 1;
      for (let line = 1; line < LOUPE_PIXELS; line += 1) {
        lensContext.beginPath(); lensContext.moveTo(line * LOUPE_ZOOM + 0.5, 0); lensContext.lineTo(line * LOUPE_ZOOM + 0.5, LOUPE_SIZE); lensContext.stroke();
        lensContext.beginPath(); lensContext.moveTo(0, line * LOUPE_ZOOM + 0.5); lensContext.lineTo(LOUPE_SIZE, line * LOUPE_ZOOM + 0.5); lensContext.stroke();
      }
      lensContext.strokeStyle = "#fff";
      lensContext.lineWidth = 2;
      lensContext.strokeRect(half * LOUPE_ZOOM, half * LOUPE_ZOOM, LOUPE_ZOOM, LOUPE_ZOOM);
      // The loupe is centred on the pointer: its marked middle pixel is the
      // one a click picks.
      const left = clientX - LOUPE_SIZE / 2;
      const top = clientY - LOUPE_SIZE / 2;
      loupe.style.left = `${left}px`;
      loupe.style.top = `${top}px`;
      loupe.style.visibility = "visible";
      readout.textContent = colour.toHex().toUpperCase();
      readout.style.left = `${left + LOUPE_SIZE / 2 - 34}px`;
      readout.style.top = `${top + LOUPE_SIZE + 8}px`;
      readout.style.visibility = "visible";
    };

    let settled = false;
    const finish = (result: NSEEyeDropperResult) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      view.removeEventListener("keydown", onKeyDown, true);
      shield.remove();
      resolve(result);
    };
    const onAbort = () => finish(cancelled);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      finish(cancelled);
    };
    shield.addEventListener("pointermove", (event) => draw(event.clientX, event.clientY));
    shield.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (event.button !== 0) {
        finish(cancelled);
        return;
      }
      finish(Object.freeze({ kind: "accepted" as const, colour: sampleAt(event.clientX, event.clientY).colour }));
    });
    shield.addEventListener("contextmenu", (event) => event.preventDefault());
    signal?.addEventListener("abort", onAbort, { once: true });
    view.addEventListener("keydown", onKeyDown, true);
    document.body.append(shield);
    shield.focus({ preventScroll: true });
  }), (error: unknown) => {
    root.style.cursor = previousCursor;
    throw error;
  });
}
