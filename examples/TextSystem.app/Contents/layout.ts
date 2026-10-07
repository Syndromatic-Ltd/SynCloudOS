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

import { TFXFont, TFXFontDescriptor, TFXTextContainer } from "@syndromatic/syncloudos/fx/text";
import { GFXImage } from "@syndromatic/syncloudos/fx/graphics";
import { NSEShapedTextLayoutAdapter, projectNSEAttributedContentToTFX, type NSETextGeometryRevision, type NSEAttributedTextAttributes } from "@syndromatic/syncloudos/nse/text";
import type { ExampleFlowId, TextSystemExampleModel } from "./model";

/** Deliberately private: fixed two-column pages, at most sixteen pages, no truncation. */
export const examplePolicy = Object.freeze({ boxWidth: 300, boxHeight: 220, boxGap: 16, maximumPages: 16, captionHeight: 90 });
export function exampleContainers(model: TextSystemExampleModel, flow: ExampleFlowId): readonly TFXTextContainer[] {
  const count = flow === "body" ? examplePolicy.maximumPages * 2 : 1;
  const { x, y, width, height } = model.object;
  return Array.from({ length: count }, (_, index) => new TFXTextContainer({
    size: { width: examplePolicy.boxWidth, height: flow === "body" ? examplePolicy.boxHeight : examplePolicy.captionHeight },
    insets: { inlineStart: 16, inlineEnd: 16, blockStart: 16, blockEnd: 16 },
    flowOrder: index, exclusionRects: flow === "body" && index === 0 ? [{ x, y, width, height }] : [],
  }));
}
export class ExampleResources {
  readonly #bytes: Uint8Array;
  readonly #fonts = new Map<number, Promise<TFXFont>>();
  #disposed = false;
  fontGeneration = 0; resourceGeneration = 0;
  image: GFXImage | null = null;
  constructor(fontBytes: Uint8Array) { this.#bytes = fontBytes.slice(); }
  async ready(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await Promise.all([this.font(18), this.font(24), this.font(16)]);
    signal?.throwIfAborted();
    if (this.#disposed) throw new DOMException("Example resources disposed.", "AbortError");
    // A tiny app-generated raster is a real retained resource, not a network placeholder.
    this.image = new GFXImage({ width: 2, height: 2, alpha: "opaque", colourSpace: "srgb", data: new Uint8Array([31,100,90,255,55,139,122,255,55,139,122,255,31,100,90,255]) });
    this.resourceGeneration++;
  }
  async font(size: number): Promise<TFXFont> {
    if (this.#disposed) throw new DOMException("Example fonts disposed.", "AbortError");
    if (!Number.isFinite(size) || size < 1 || size > 48) throw new RangeError("This example accepts font sizes 1..48 CSS pixels.");
    let pending = this.#fonts.get(size);
    if (!pending) {
      if (this.#fonts.size >= 48) throw new RangeError("This example accepts at most 48 distinct sizes.");
      pending = TFXFont.create(this.#bytes, new TFXFontDescriptor({ size })).then(font => {
        if (this.#disposed) { font.dispose(); throw new DOMException("Late example font.", "AbortError"); }
        this.fontGeneration++; return font;
      });
      this.#fonts.set(size, pending);
    }
    return pending;
  }
  resolveFont = (attributes: NSEAttributedTextAttributes) => {
    if (attributes.font?.familyId && attributes.font.familyId !== "example.noto") throw new TypeError("This example only resolves example.noto.");
    return this.font(attributes.font?.size ?? 18);
  };
  async prepareModelFonts(model: TextSystemExampleModel, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await Promise.all(Object.values(model.flows).flatMap(flow => flow.blocks.flatMap(paragraph => paragraph.runs.filter(run => run.kind === "text").map(run => this.resolveFont(run.attributes ?? {})))));
    signal?.throwIfAborted();
  }
  replaceImage(image: GFXImage): void {
    if (this.#disposed) throw new DOMException("Example resources disposed.", "AbortError");
    this.image = image; this.resourceGeneration++;
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const pending of this.#fonts.values()) void pending.then(font => font.dispose(), () => undefined);
    this.#fonts.clear(); this.image = null;
  }
}
export async function layoutExampleFlow(options: {
  readonly model: TextSystemExampleModel; readonly flow: ExampleFlowId; readonly resources: ExampleResources;
  readonly adapter: NSEShapedTextLayoutAdapter; readonly revision: () => NSETextGeometryRevision; readonly signal?: AbortSignal;
}) {
  const projection = await projectNSEAttributedContentToTFX(options.model.flows[options.flow], { resolveFont: options.resources.resolveFont, units: "css-pixels", signal: options.signal });
  return options.adapter.layout({ flowId: options.flow, projection, revision: options.revision(), containers: exampleContainers(options.model, options.flow), signal: options.signal });
}
