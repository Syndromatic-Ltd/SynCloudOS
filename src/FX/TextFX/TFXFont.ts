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

import { SynCloudOSLifecycleRecord } from "../../SynCloudOS/fxRuntimeContracts";

import type * as HarfBuzz from "harfbuzzjs";
import { TFXFontDescriptor } from "./TFXFontDescriptor";
import type { TFXGlyphInfo, TFXGlyphRun, TFXTextDirection } from "./TFXGlyphRun";
import { GFXPath } from "../GraphicsFX/GFXPath";
import { GFXPDFFontSubset } from "../GraphicsFX/pdf/GFXPDFFontSubset";
import type { GFXPathCommand } from "../GraphicsFX/graphicsTypes";
import { isNativeTFXFontBackendEnvironment } from "./TFXFontBackendEnvironment";

type Backend = typeof HarfBuzz;
export interface TFXFontShapeOptions {
  readonly direction?: TFXTextDirection;
  readonly language?: string;
  readonly script?: string;
  readonly features?: Readonly<Record<string, number>>;
}
const disposalOwners = new WeakMap<TFXFont, () => void>();
const fontGraphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

let backendPromise: Promise<Backend> | null = null;
// Node loads the native package at runtime. The computed specifier keeps it out
// of every bundle graph, so browser builds never resolve its Node-only code.
const nativeHarfBuzzSpecifier = "harfbuzzjs";

function backend(): Promise<Backend> {
  if (backendPromise) return backendPromise;
  backendPromise = isNativeTFXFontBackendEnvironment()
    ? import(/* @vite-ignore */ nativeHarfBuzzSpecifier) as Promise<Backend>
    : import("./vendor/harfbuzzRuntime.mjs");
  return backendPromise;
}

/** Internal readiness seam lets hosts finish/cancel WASM startup before retaining decoded font bytes. */
function waitForTFXFontBackend(signal?: AbortSignal): Promise<Backend> {
  const pending = backend();
  if (!signal) return pending;
  signal.throwIfAborted();
  return new Promise<Backend>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () => finish(() => reject(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export async function prepareTFXFontBackend(signal?: AbortSignal): Promise<void> {
  await waitForTFXFontBackend(signal);
}

/** Internal host binding. It keeps direct font disposal coherent with the registration lease. */
export function bindTFXFontDisposalOwner(font: TFXFont, owner: () => void): () => void {
  if (disposalOwners.has(font)) throw new Error("Font already has a disposal owner.");
  disposalOwners.set(font, owner);
  let bound = true;
  return () => {
    if (!bound) return;
    bound = false;
    if (disposalOwners.get(font) === owner) disposalOwners.delete(font);
  };
}

export class TFXFont {
  readonly #lifecycle = new SynCloudOSLifecycleRecord({ kind: "TFXFont" });
  readonly descriptor: TFXFontDescriptor;
  readonly familyName: string;
  /** The family a font menu groups this face under: the typographic family
   * (name ID 16) where the font has one, else the legacy family (ID 1). */
  readonly typographicFamilyName: string;
  /** The face within its family ("Bold Italic"): name ID 17, else ID 2. */
  readonly styleName: string;
  /** OS/2 usWeightClass (1–1000); 400 when the font has no OS/2 table. */
  readonly weight: number;
  /** OS/2 fsSelection's italic or oblique bit, else the style name. */
  readonly italic: boolean;
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly leading: number;
  readonly verticalAscent: number;
  readonly verticalDescent: number;
  readonly verticalLeading: number;
  readonly embedding: "allowed" | "restricted" | "unknown";
  readonly #sourceBytes: Uint8Array;
  #pdfSubset: GFXPDFFontSubset | null = null;
  #backend: Backend | null;
  #font: HarfBuzz.Font | null;
  #buffer: HarfBuzz.Buffer | null;

  private constructor(backend: Backend, bytes: Uint8Array, descriptor: TFXFontDescriptor) {
    const face = new backend.Face(new backend.Blob(bytes), descriptor.faceIndex);
    if (!face.referenceTable("head") || !face.referenceTable("cmap") || face.upem <= 0) throw new TypeError("Invalid or unsupported font face.");
    const font = new backend.Font(face);
    const axes = face.getAxisInfos();
    for (const [tag, value] of Object.entries(descriptor.variations)) {
      const axis = axes[tag];
      if (!axis || value < axis.min || value > axis.max) throw new RangeError(`Font variation ${tag} is outside its supported range.`);
    }
    font.setVariations(Object.entries(descriptor.variations).map(([tag, value]) => new backend.Variation(tag, value)));
    font.setScale(face.upem, face.upem);
    this.descriptor = descriptor;
    this.familyName = face.getName(1, "en") || descriptor.family || "Unnamed font";
    this.typographicFamilyName = face.getName(16, "en") || this.familyName;
    this.styleName = face.getName(17, "en") || face.getName(2, "en") || "Regular";
    this.unitsPerEm = face.upem;
    const extents = font.hExtents();
    const scale = descriptor.size / face.upem;
    this.ascent = extents.ascender * scale;
    this.descent = -extents.descender * scale;
    this.leading = extents.lineGap * scale;
    const vhea = face.referenceTable("vhea");
    const verticalMetrics = vhea && vhea.byteLength >= 10
      ? new DataView(vhea.buffer, vhea.byteOffset, vhea.byteLength)
      : null;
    this.verticalAscent = verticalMetrics ? Math.max(0, verticalMetrics.getInt16(4) * scale) : descriptor.size / 2;
    this.verticalDescent = verticalMetrics ? Math.max(0, -verticalMetrics.getInt16(6) * scale) : descriptor.size / 2;
    this.verticalLeading = verticalMetrics ? Math.max(0, verticalMetrics.getInt16(8) * scale) : 0;
    const os2 = face.referenceTable("OS/2");
    const os2View = os2 ? new DataView(os2.buffer, os2.byteOffset, os2.byteLength) : null;
    const weightClass = os2View && os2View.byteLength >= 6 ? os2View.getUint16(4) : 0;
    this.weight = weightClass >= 1 && weightClass <= 1000 ? weightClass : 400;
    const selection = os2View && os2View.byteLength >= 64 ? os2View.getUint16(62) : null;
    this.italic = selection === null ? /italic|oblique/i.test(this.styleName) : (selection & 0x0201) !== 0;
    const embeddingBits = os2 && os2.byteLength >= 10 ? new DataView(os2.buffer, os2.byteOffset, os2.byteLength).getUint16(8) : null;
    this.embedding = embeddingBits === null ? "unknown" : (embeddingBits & 2) !== 0 ? "restricted" : "allowed";
    this.#sourceBytes = bytes;
    this.#backend = backend;
    this.#font = font;
    this.#buffer = new backend.Buffer();
    Object.freeze(this);
  }

  static async create(bytes: Uint8Array, descriptor: TFXFontDescriptor, signal?: AbortSignal): Promise<TFXFont> {
    signal?.throwIfAborted();
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 12 || bytes.byteLength > 32 * 1024 * 1024) throw new RangeError("Font binary must contain 12 bytes to 32 MiB.");
    const backend = await waitForTFXFontBackend(signal);
    signal?.throwIfAborted();
    const ownedBytes = bytes.slice();
    return new TFXFont(backend, ownedBytes, descriptor);
  }

  supportsCodePoint(codePoint: number): boolean {
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) throw new RangeError("Invalid Unicode code point.");
    return (this.#requireFont("supportsCodePoint").nominalGlyph(codePoint) ?? 0) !== 0;
  }

  glyphPath(id: number): string {
    if (!Number.isSafeInteger(id) || id < 0) throw new RangeError("Invalid glyph index.");
    return this.#requireFont("glyphPath").glyphToPath(id);
  }

  /** Scaled font outline in typographic coordinates (positive Y points upward). */
  createPathForGlyph(id: number): GFXPath {
    if (!Number.isSafeInteger(id) || id < 0) throw new RangeError("Invalid glyph index.");
    const commands: GFXPathCommand[] = this.#requireFont("createPathForGlyph").glyphToJson(id).map(command => {
      const values = command.values;
      switch (command.type) {
        case "M": return { kind: "move", point: { x: values[0], y: values[1] } };
        case "L": return { kind: "line", point: { x: values[0], y: values[1] } };
        case "Q": return { kind: "quad", control: { x: values[0], y: values[1] }, point: { x: values[2], y: values[3] } };
        case "C": return { kind: "curve", control1: { x: values[0], y: values[1] }, control2: { x: values[2], y: values[3] }, point: { x: values[4], y: values[5] } };
        case "Z": return { kind: "close" };
        default: throw new TypeError("Unsupported font outline command.");
      }
    });
    const scale = this.descriptor.size / this.unitsPerEm;
    return new GFXPath(commands).transformed({ a: scale, b: 0, c: 0, d: scale, tx: 0, ty: 0 });
  }

  /** Uses the canonical HarfBuzz backend to verify that a complete cluster shapes without .notdef. */
  supportsText(text: string): boolean {
    if (typeof text !== "string" || text.length === 0 || text.length > 256) throw new RangeError("Font coverage input must contain 1 to 256 UTF-16 units.");
    this.#requireFont("supportsText");
    const shaped = this.shape(text);
    return shaped.glyphs.length > 0 && shaped.glyphs.every(glyph => glyph.id !== 0);
  }

  /** Opaque PDF export identity. The retained font program is never returned to callers. */
  pdfFontSubset(): GFXPDFFontSubset {
    this.#requireFont("pdfFontSubset");
    if (!this.#pdfSubset) {
      this.#pdfSubset = new GFXPDFFontSubset(this.#sourceBytes, {
        familyName: this.familyName,
        size: this.descriptor.size,
      });
    }
    return this.#pdfSubset;
  }

  shape(text: string, options: Readonly<TFXFontShapeOptions> = {}): TFXGlyphRun {
    const font = this.#requireFont("shape");
    if (typeof text !== "string" || text.length > 65536) throw new RangeError("A shaping run must contain at most 65536 UTF-16 units.");
    const hb = this.#backend!;
    const buffer = this.#buffer!;
    buffer.clearContents();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    const direction = options.direction ?? "ltr";
    const directions = { ltr: hb.Direction.LTR, rtl: hb.Direction.RTL, ttb: hb.Direction.TTB, btt: hb.Direction.BTT };
    if (!(direction in directions)) throw new TypeError("Invalid text direction.");
    buffer.setDirection(directions[direction]);
    if (options.language) buffer.setLanguage(options.language);
    if (options.script) buffer.setScript(options.script);
    const features = Object.entries(options.features ?? {}).map(([tag, value]) => {
      if (!/^[\x20-\x7e]{4}$/.test(tag) || !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new TypeError("OpenType features require four-character tags and unsigned integer values.");
      return new hb.Feature(tag, value);
    });
    if (features.length > 128) throw new RangeError("A shaping run accepts at most 128 OpenType feature settings.");
    hb.shape(font, buffer, features);
    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();
    const scale = this.descriptor.size / this.unitsPerEm;
    const clusters = [...new Set(infos.map((info) => info.cluster))].sort((left, right) => left - right);
    const clusterEnds = new Map(clusters.map((cluster, index) => [cluster, clusters[index + 1] ?? text.length]));
    const infoIndicesByCluster = new Map<number, number[]>();
    for (let index = 0; index < infos.length; index += 1) {
      const grouped = infoIndicesByCluster.get(infos[index]!.cluster);
      if (grouped) grouped.push(index);
      else infoIndicesByCluster.set(infos[index]!.cluster, [index]);
    }
    const ligatureCaretsByGlyph = new Map<number, readonly number[]>();
    for (const cluster of clusters) {
      const end = clusterEnds.get(cluster)!;
      if ([...fontGraphemes.segment(text.slice(cluster, end))].length <= 1) continue;
      for (const glyphIndex of infoIndicesByCluster.get(cluster) ?? []) {
        const carets = font.getLigatureCarets(directions[direction], infos[glyphIndex]!.codepoint);
        if (!carets.length) continue;
        ligatureCaretsByGlyph.set(glyphIndex, carets.map((offset) => offset * scale));
        break;
      }
    }
    let x = 0, y = 0;
    const glyphs: TFXGlyphInfo[] = infos.map((info, index) => {
      const p = positions[index];
      const ligatureCaretOffsets = ligatureCaretsByGlyph.get(index) ?? [];
      const glyph = Object.freeze({
        id: info.codepoint, cluster: info.cluster,
        position: Object.freeze({ x, y }),
        advance: Object.freeze({ x: p.xAdvance * scale, y: p.yAdvance * scale }),
        offset: Object.freeze({ x: p.xOffset * scale, y: p.yOffset * scale }),
        ...(ligatureCaretOffsets.length ? { ligatureCaretOffsets: Object.freeze(ligatureCaretOffsets) } : {}),
      });
      x += glyph.advance.x; y += glyph.advance.y;
      return glyph;
    });
    buffer.clearContents();
    return Object.freeze({ text, direction, glyphs: Object.freeze(glyphs), advance: Object.freeze({ width: Math.abs(x), height: Math.abs(y) }) });
  }

  dispose(): void {
    this.#lifecycle.markDisposed("explicit");
    const owner = disposalOwners.get(this);
    if (owner) {
      disposalOwners.delete(this);
      owner();
      return;
    }
    this.#font = null;
    this.#buffer = null;
    this.#backend = null;
  }
  #requireFont(operation: string): HarfBuzz.Font {
    if (!this.#font) throw this.#lifecycle.error({ code: "TFX_FONT_DISPOSED", operation: operation });
    return this.#font;
  }
}
