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

import type { EditorProps } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NSEAttachmentAppearance, NSEAttributedAttachmentRun } from "../../Text";
import type { NSETextAttachmentImage, NSETextAttachmentResolver } from "../textViewTypes";

/** What an attachment cell may do to the text it sits in. */
export interface NSEAttachmentCellEditing {
  editable(): boolean;
  /** Resizes the attachment at a backend position. */
  resize(position: number, bounds: { readonly width: number; readonly height: number }, actionName: string): void;
  /**
   * Starts moving the attachment at a backend position with the pointer. The
   * move outlives this cell: every step re-anchors the attachment, which
   * redraws it elsewhere in the text.
   */
  beginMove(position: number, event: PointerEvent, grab: { readonly x: number; readonly y: number }): void;
}

const resizeHandles = ["top-start", "top", "top-end", "end", "bottom-end", "bottom", "bottom-start", "start"] as const;
type ResizeHandle = typeof resizeHandles[number];
const minimumAttachmentSide = 16;

const safeImageSource = (src: unknown): src is string => {
  if (typeof src !== "string" || !src || src.length > 4_000_000) return false;
  if (/^(?:https?:|blob:)/i.test(src) || /^data:image\//i.test(src)) return true;
  return /^(?:\/|\.{1,2}\/)/.test(src) && !/^\/\//.test(src);
};
const cssUrl = (src: string) => `url("${src.replace(/["\\\n]/g, (character) => `\\${character.charCodeAt(0).toString(16)} `)}")`;

function rgba(colour: string, alpha: number): string {
  const hex = colour.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const own = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return `rgb(${r} ${g} ${b} / ${Math.round(own * alpha * 1000) / 1000})`;
}

/** Draws an appearance onto a cell's image box. Every property is reset first, so edits never accumulate. */
function applyAppearance(box: HTMLElement, image: HTMLImageElement, decoration: HTMLElement, appearance: NSEAttachmentAppearance | undefined, height: number) {
  const filters: string[] = [], transforms: string[] = [];
  image.style.removeProperty("border"); image.style.removeProperty("padding"); image.style.removeProperty("background");
  image.style.removeProperty("box-shadow"); image.style.removeProperty("opacity");
  box.style.removeProperty("-webkit-box-reflect"); box.style.removeProperty("margin-block-end");
  delete box.dataset.border; delete decoration.dataset.shadow;
  decoration.removeAttribute("style");
  if (!appearance) { image.style.removeProperty("filter"); image.style.removeProperty("transform"); return; }
  const border = appearance.border;
  if (border?.kind === "line") {
    box.dataset.border = "line";
    image.style.border = `${border.width}px ${border.pattern} ${border.colour}`;
  } else if (border?.kind === "picture-frame") {
    // A paper matte with a hairline edge, scaled with the picture.
    box.dataset.border = "picture-frame";
    image.style.padding = `${Math.round(Math.max(4, image.width * 0.05) * border.scale)}px`;
    image.style.background = "#fff";
    image.style.boxShadow = "0 0 0 1px rgb(0 0 0 / .1), inset 0 0 0 1px rgb(0 0 0 / .04)";
  }
  if (appearance.exposure) filters.push(`brightness(${(1 + appearance.exposure * 0.8).toFixed(3)})`);
  if (appearance.saturation) filters.push(`saturate(${(1 + appearance.saturation).toFixed(3)})`);
  const shadow = appearance.shadow;
  if (shadow?.kind === "drop") {
    // A drop shadow follows the opaque pixels, as Pages' does for a cut-out image.
    const radians = shadow.angle * Math.PI / 180;
    const x = Math.round(Math.cos(radians) * shadow.offset * 10) / 10, y = Math.round(-Math.sin(radians) * shadow.offset * 10) / 10;
    filters.push(`drop-shadow(${x}px ${y}px ${shadow.blur / 2}px ${rgba(shadow.colour, shadow.opacity)})`);
  } else if (shadow) {
    decoration.dataset.shadow = shadow.kind;
    decoration.style.setProperty("--nse-shadow-colour", rgba(shadow.colour, shadow.opacity));
    decoration.style.setProperty("--nse-shadow-blur", `${shadow.blur}px`);
    decoration.style.setProperty("--nse-shadow-offset", `${shadow.offset}px`);
    decoration.style.setProperty("--nse-shadow-curl", `${(shadow.curvature ?? 0.4) * 7}deg`);
  }
  if (appearance.opacity !== undefined && appearance.opacity < 1) image.style.opacity = String(appearance.opacity);
  if (appearance.rotation) transforms.push(`rotate(${appearance.rotation}deg)`);
  if (appearance.flipHorizontal || appearance.flipVertical) transforms.push(`scale(${appearance.flipHorizontal ? -1 : 1}, ${appearance.flipVertical ? -1 : 1})`);
  if (filters.length) image.style.filter = filters.join(" "); else image.style.removeProperty("filter");
  if (transforms.length) image.style.transform = transforms.join(" "); else image.style.removeProperty("transform");
  if (appearance.reflection) {
    // The reflection is strongest at the image's foot and gone by half its height; the text keeps clear of it.
    box.style.setProperty("-webkit-box-reflect", `below 2px linear-gradient(transparent 50%, rgb(255 255 255 / ${appearance.reflection}))`);
    box.style.marginBlockEnd = `${Math.round(height * 0.5)}px`;
  }
}

/**
 * NSTextAttachment cell: the resolved image, or the accessible placeholder.
 * Placement wraps text beside or around the image, following its opaque
 * outline when asked. A selected image in editable text shows eight handles;
 * dragging any of them resizes it in proportion, never stretched. Dragging the
 * image itself moves it through the text, which re-wraps around it as it goes.
 */
export function nseAttachmentNodeViews(doc: Document, resolver: () => NSETextAttachmentResolver | undefined, editing: NSEAttachmentCellEditing): NonNullable<EditorProps["nodeViews"]> {
  return {
    attachment(initial, _view, getPos) {
      let node: ProseMirrorNode = initial, generation = 0, selected = false;
      let image: HTMLImageElement | null = null, box: HTMLElement | null = null;
      let resizing: { pointerId: number; handle: ResizeHandle; direction: 1 | -1; startX: number; startY: number; startWidth: number; aspect: number; scale: number; maximum: number; width: number } | null = null;
      const dom = doc.createElement("span");
      dom.setAttribute("contenteditable", "false");
      const place = (run: NSEAttributedAttachmentRun, src: string | null) => {
        const placement = run.placement;
        dom.style.removeProperty("shape-outside"); dom.style.removeProperty("shape-image-threshold"); dom.style.removeProperty("shape-margin");
        dom.style.removeProperty("--nse-attachment-spacing");
        if (!placement || placement.wrap === "inline") { delete dom.dataset.wrap; delete dom.dataset.align; delete dom.dataset.textFit; return; }
        dom.dataset.wrap = placement.wrap;
        dom.dataset.align = placement.alignment ?? (placement.wrap === "around" ? "start" : "centre");
        if (placement.wrap !== "around") { delete dom.dataset.textFit; return; }
        const spacing = placement.spacing ?? 12;
        dom.style.setProperty("--nse-attachment-spacing", `${spacing}px`);
        dom.dataset.textFit = placement.textFit ?? "rectangle";
        if (placement.textFit === "shape" && src) {
          // Text follows the image's opaque outline: a cut-out wraps like Pages' Text Fit ▸ Shape.
          dom.style.setProperty("shape-outside", cssUrl(src));
          dom.style.setProperty("shape-image-threshold", String(placement.alphaThreshold ?? 0.5));
          dom.style.setProperty("shape-margin", `${spacing}px`);
        }
      };
      const placeholder = (run: NSEAttributedAttachmentRun) => {
        image = null; box = null;
        place(run, null);
        dom.className = "nse-text-attachment"; dom.dataset.kind = run.attachmentKind; delete dom.dataset.display;
        dom.setAttribute("role", "img"); dom.setAttribute("aria-label", run.alt);
        dom.replaceChildren(doc.createTextNode(run.alt || "Attachment"));
      };
      const handles = () => {
        box?.querySelectorAll(":scope > .nse-text-attachment-handle").forEach((handle) => handle.remove());
        if (!selected || !box || !image || !editing.editable()) return;
        for (const position of resizeHandles) {
          const handle = doc.createElement("span");
          handle.className = "nse-text-attachment-handle"; handle.dataset.handle = position;
          handle.setAttribute("aria-hidden", "true");
          box.append(handle);
        }
      };
      const render = () => {
        const current = ++generation;
        const run = node.attrs.value as NSEAttributedAttachmentRun;
        let resolved: NSETextAttachmentImage | null = null;
        try { resolved = run.attachmentKind === "image" ? resolver()?.(run) ?? null : null; } catch { resolved = null; }
        if (!resolved || !safeImageSource(resolved.src)) return placeholder(run);
        place(run, resolved.src);
        dom.className = "nse-text-attachment"; dom.dataset.kind = run.attachmentKind; dom.dataset.display = "image";
        dom.removeAttribute("role"); dom.removeAttribute("aria-label");
        const nextBox = doc.createElement("span");
        nextBox.className = "nse-text-attachment-box";
        const element = doc.createElement("img");
        element.alt = run.alt; element.draggable = false; element.decoding = "async";
        const size = run.bounds ?? (resolved.naturalWidth && resolved.naturalHeight ? { width: resolved.naturalWidth, height: resolved.naturalHeight } : run.intrinsicSize ? { width: run.intrinsicSize.inline, height: run.intrinsicSize.block } : null);
        if (size) { element.width = Math.round(size.width); element.height = Math.round(size.height); element.style.aspectRatio = `auto ${size.width} / ${size.height}`; }
        element.addEventListener("error", () => { if (current === generation) placeholder(run); }, { once: true });
        const decoration = doc.createElement("span");
        decoration.className = "nse-text-attachment-shadow"; decoration.setAttribute("aria-hidden", "true");
        nextBox.append(decoration, element);
        applyAppearance(nextBox, element, decoration, run.appearance, size?.height ?? 0);
        image = element; box = nextBox;
        dom.replaceChildren(nextBox);
        element.src = resolved.src;
        handles();
      };
      const sizeTo = (width: number) => {
        if (!image || !resizing) return;
        resizing.width = width;
        image.width = Math.round(width); image.height = Math.round(width / resizing.aspect);
        image.style.aspectRatio = `auto ${image.width} / ${image.height}`;
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!resizing || event.pointerId !== resizing.pointerId) return;
        event.preventDefault();
        const { handle } = resizing;
        // Corners follow whichever axis moved further; edges follow their own. The aspect never changes.
        const dx = (event.clientX - resizing.startX) * resizing.scale * resizing.direction;
        const dy = (event.clientY - resizing.startY) * resizing.scale * (handle.startsWith("top") ? -1 : 1);
        const byHeight = dy * resizing.aspect;
        const delta = handle === "top" || handle === "bottom" ? byHeight : handle === "start" || handle === "end" ? dx : Math.abs(dx) >= Math.abs(byHeight) ? dx : byHeight;
        sizeTo(Math.min(resizing.maximum, Math.max(minimumAttachmentSide, resizing.startWidth + delta)));
      };
      const endResize = (event: PointerEvent) => {
        if (!resizing || event.pointerId !== resizing.pointerId) return;
        const finished = resizing; resizing = null;
        dom.removeEventListener("pointermove", onPointerMove);
        dom.removeEventListener("pointerup", endResize);
        dom.removeEventListener("pointercancel", endResize);
        delete dom.dataset.resizing;
        const run = node.attrs.value as NSEAttributedAttachmentRun;
        const position = typeof getPos === "function" ? getPos() : undefined;
        const width = Math.round(finished.width), height = Math.max(1, Math.round(finished.width / finished.aspect));
        if (event.type === "pointercancel" || position === undefined || (run.bounds?.width === width && run.bounds?.height === height)) { render(); return; }
        editing.resize(position, { width, height }, "Resize Image");
      };
      dom.addEventListener("pointerdown", (event) => {
        const handle = (event.target as Element | null)?.closest?.(".nse-text-attachment-handle") as HTMLElement | null;
        if (!image || !editing.editable() || event.button !== 0) return;
        if (!handle) {
          // A touch moves only an image already selected, so a swipe over a picture still scrolls.
          if (event.pointerType === "touch" && !selected) return;
          const position = typeof getPos === "function" ? getPos() : undefined;
          if (position === undefined) return;
          event.preventDefault(); event.stopPropagation();
          const rect = image.getBoundingClientRect();
          editing.beginMove(position, event, { x: event.clientX - rect.left, y: event.clientY - rect.top });
          return;
        }
        event.preventDefault(); event.stopPropagation();
        const rect = image.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        // Page zoom and transforms scale client pixels; bounds are layout pixels.
        const scale = image.offsetWidth > 0 ? image.offsetWidth / rect.width : 1;
        const container = dom.closest(".ProseMirror") as HTMLElement | null;
        // Never wider than the text it sits in; a container not yet laid out sets no limit.
        const maximum = container && container.clientWidth > 0 ? Math.max(minimumAttachmentSide, container.clientWidth) : Number.POSITIVE_INFINITY;
        const position = handle.dataset.handle as ResizeHandle;
        // An end-edge handle grows rightward in left-to-right text, leftward in right-to-left.
        const rightToLeft = doc.defaultView?.getComputedStyle(dom).direction === "rtl";
        const direction = ((position.endsWith("end") ? 1 : -1) * (rightToLeft ? -1 : 1)) as 1 | -1;
        resizing = { pointerId: event.pointerId, handle: position, direction, startX: event.clientX, startY: event.clientY,
          startWidth: image.offsetWidth, aspect: image.offsetWidth / Math.max(1, image.offsetHeight), scale, maximum, width: image.offsetWidth };
        dom.dataset.resizing = "true";
        dom.addEventListener("pointermove", onPointerMove);
        dom.addEventListener("pointerup", endResize);
        dom.addEventListener("pointercancel", endResize);
        // Capture keeps the drag when the pointer leaves the image; synthetic pointers have none to give.
        try { dom.setPointerCapture?.(event.pointerId); } catch { /* the drag continues while over the image */ }
      });
      render();
      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          const changed = JSON.stringify(next.attrs.value) !== JSON.stringify(node.attrs.value);
          node = next; if (changed && !resizing) render();
          return true;
        },
        selectNode() { selected = true; dom.dataset.selected = "true"; handles(); },
        deselectNode() { selected = false; delete dom.dataset.selected; handles(); },
        // Handles are the cell's own; the editor never sees their pointer traffic.
        stopEvent: (event) => Boolean(resizing) || Boolean((event.target as Element | null)?.closest?.(".nse-text-attachment-handle")),
        ignoreMutation: () => true,
      };
    },
  };
}
