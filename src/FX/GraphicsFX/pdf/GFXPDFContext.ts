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

import "regenerator-runtime/runtime";
import { GFXPDFDocument, pdfAssertLive, pdfPageForEmbedding } from "./GFXPDFDocument";
import fontkit from "@pdf-lib/fontkit";
import { GFXColourProfile } from "../GFXColourProfile";
import type { GFXRGBAComponents } from "../colourTypes";
import type { GFXImageDescriptor } from "../GFXImage";
import { PDFDocument, PDFName, PDFDict, PDFHexString, PDFString, PDFOperator, PDFOperatorNames, degrees, pushGraphicsState, popGraphicsState, concatTransformationMatrix, setFillingRgbColor, setStrokingRgbColor, setLineWidth, setDashPattern, setLineCap, setLineJoin, setGraphicsState, clip, clipEvenOdd, endPath, fill, stroke, drawObject, beginText, endText, endMarkedContent, setFontAndSize, setTextMatrix, setTextRenderingMode, showText, TextRenderingMode, type PDFPage, type PDFFont } from "pdf-lib";
import { GFXPath } from "../GFXPath";
import { GFXColour } from "../GFXColour";
import { GFXGradient } from "../GFXGradient";
import { GFXImage, GFXDataConsumer } from "../GFXImage";
import { GFXIdentityTransform, normaliseAffineTransform, normaliseRect, concatenateTransforms, transformPoint, type GFXAffineTransform, type GFXRect } from "../GFXGeometry";
import type { GFXFillRule, GFXBlendMode, GFXLineCap, GFXLineJoin } from "../graphicsTypes";
import { bounded, dataRecord, type GFXPDFPageOptions, type GFXPDFMetadata } from "./pdfTypes";
import { pathOperators } from "./pdfOperators";
import { GFXPDFFontSubset, pdfFontProgram, type GFXPDFPositionedTextRun } from "./GFXPDFFontSubset";
import { normalisePDFLanguage, normalisePDFLink, normalisePDFMarkedContent, normalisePDFOutline, normalisePDFOutputIntentOptions, type GFXPDFLink, type GFXPDFMarkedContent, type GFXPDFOutline, type GFXPDFOutputIntentOptions } from "./GFXPDFStructure";
type Clip = Readonly<{
    path: GFXPath;
    transform: GFXAffineTransform;
    rule: GFXFillRule;
}>;
type State = Readonly<{
    transform: GFXAffineTransform;
    alpha: number;
    blend: GFXBlendMode;
    fill: GFXColour;
    stroke: GFXColour;
    lineWidth: number;
    lineCap: GFXLineCap;
    lineJoin: GFXLineJoin;
    dash: readonly number[];
    phase: number;
    clips: readonly Clip[];
}>;
type Command = Readonly<{
    kind: "pdf-page";
    document: GFXPDFDocument;
    index: number;
    rect: GFXRect;
    state: State;
}> | Readonly<{
    kind: "fill";
    path: GFXPath;
    paint: GFXColour | GFXGradient;
    rule: GFXFillRule;
    state: State;
}> | Readonly<{
    kind: "stroke";
    path: GFXPath;
    state: State;
}> | Readonly<{
    kind: "image";
    image: GFXImage;
    rect: GFXRect;
    state: State;
}> | Readonly<{
    kind: "text";
    runs: readonly GFXPDFPositionedTextRun[];
    state: State;
}> | Readonly<{
    kind: "marked-begin";
    marker: MarkerRecord;
    state: State;
}> | Readonly<{
    kind: "marked-end";
    state: State;
}>;
type MarkerRecord = Readonly<GFXPDFMarkedContent & { mcid: number }>;
type PageRecord = {
    options: GFXPDFPageOptions;
    commands: Command[];
    links: GFXPDFLink[];
    markers: MarkerRecord[];
};
const initial = (): State => Object.freeze({ transform: GFXIdentityTransform, alpha: 1, blend: "normal", fill: GFXColour.rgba(0, 0, 0), stroke: GFXColour.rgba(0, 0, 0), lineWidth: 1, lineCap: "butt", lineJoin: "miter", dash: Object.freeze([]), phase: 0, clips: Object.freeze([]) });
const matrix = (t: GFXAffineTransform) => concatTransformationMatrix(t.a, t.b, t.c, t.d, t.tx, t.ty);
const blendNames = { normal: "Normal", multiply: "Multiply", screen: "Screen", overlay: "Overlay", darken: "Darken", lighten: "Lighten" };

function pdfUnicodeHex(text: string): string {
    let result = "";
    for (const character of text) {
        const codePoint = character.codePointAt(0)!;
        if (codePoint <= 0xffff) result += codePoint.toString(16).padStart(4, "0");
        else {
            const value = codePoint - 0x10000;
            result += (0xd800 + (value >> 10)).toString(16).padStart(4, "0");
            result += (0xdc00 + (value & 0x3ff)).toString(16).padStart(4, "0");
        }
    }
    return result.toUpperCase();
}

function recordSourceUnicode(font: GFXPDFFontSubset, text: string, encoded: Uint8Array, mappings: Map<number, string>): PDFHexString {
    if (encoded.byteLength % 2 !== 0) throw new TypeError("PDF subset text encoding must use 16-bit CIDs.");
    const layout = fontkit.create(pdfFontProgram(font)).layout(text);
    if (layout.glyphs.length * 2 !== encoded.byteLength) throw new TypeError("PDF subset encoding diverged from font layout.");
    const source = new Set(Array.from(text, character => character.codePointAt(0)!));
    let retained = "";
    for (let index = 0; index < layout.glyphs.length; index++) {
        const cid = encoded[index * 2]! << 8 | encoded[index * 2 + 1]!;
        const codePoints = layout.glyphs[index]!.codePoints.filter((codePoint: number) => source.has(codePoint));
        if (!codePoints.length) continue;
        retained += cid.toString(16).padStart(4, "0");
        if (!mappings.has(cid)) mappings.set(cid, String.fromCodePoint(...codePoints));
    }
    return PDFHexString.of(retained);
}

function pdfSourceCMap(mappings: ReadonlyMap<number, string>): Uint8Array {
    const rows = [...mappings.entries()]
        .sort(([left], [right]) => left - right)
        .map(([cid, text]) => `<${cid.toString(16).padStart(4, "0").toUpperCase()}> <${pdfUnicodeHex(text)}>`);
    const lines = [
        "begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
        "/CMapName /Adobe-Identity-UCS def",
        "/CMapType 2 def",
        "1 begincodespacerange",
        "<0000><FFFF>",
        "endcodespacerange",
        `${rows.length} beginbfchar`,
        ...rows,
        "endbfchar",
        "endcmap",
        "",
    ];
    return new TextEncoder().encode(lines.join("\n"));
}
function rule(value: GFXFillRule): GFXFillRule {
    if (value !== "nonzero" && value !== "evenodd")
        throw new TypeError("Invalid PDF fill rule.");
    return value;
}
export class GFXPDFContext {
    readonly #pages: PageRecord[] = [];
    #page: PageRecord | null = null;
    #state = initial();
    #stack: State[] = [];
    #closed = false;
    #generation = 0;
    #commands = 0;
    #pathElements = 0;
    #imagePixels = 0;
    readonly #metadata: GFXPDFMetadata;
    #language: string | null = null;
    #outputIntent: Readonly<{ profile: GFXColourProfile; options: GFXPDFOutputIntentOptions }> | null = null;
    readonly #outlines: GFXPDFOutline[] = [];
    #markedStack: MarkerRecord[] = [];
    constructor(metadata: GFXPDFMetadata = {}) {
        const copied: Record<string, string> = {};
        for (const [key, value] of Object.entries(dataRecord(metadata, ["title", "author", "subject", "keywords"]))) {
            if (!["title", "author", "subject", "keywords"].includes(key) || typeof value !== "string" || value.length > 4096)
                throw new TypeError("Invalid PDF metadata.");
            copied[key] = value;
        }
        this.#metadata = Object.freeze(copied);
        Object.freeze(this);
    }
    #live() {
        if (this.#closed)
            throw new Error("PDF recorder is closed.");
    }
    #drawing() {
        this.#live();
        if (!this.#page)
            throw new Error("Begin a PDF page before drawing.");
        return this.#page;
    }
    beginPage(options: GFXPDFPageOptions): void {
        this.#live();
        options = dataRecord(options, ["width", "height", "rotation", "cropBox", "bleedBox", "trimBox", "artBox"]) as unknown as GFXPDFPageOptions;
        if (this.#page)
            throw new Error("End the current PDF page first.");
        if (this.#pages.length >= 256)
            throw new RangeError("PDF page limit exceeded.");
        const width = bounded(options.width, "page width", .001, 14400), height = bounded(options.height, "page height", .001, 14400), rotation = options.rotation ?? 0;
        if (![0, 90, 180, 270].includes(rotation))
            throw new RangeError("PDF rotation must be a quarter turn.");
        const value: Record<string, unknown> = { width, height, rotation };
        for (const key of ["cropBox", "bleedBox", "trimBox", "artBox"] as const) {
            if (options[key])
                value[key] = normaliseRect(options[key]!);
        }
        this.#page = { options: Object.freeze(value) as unknown as GFXPDFPageOptions, commands: [], links: [], markers: [] };
        this.#pages.push(this.#page);
        this.#state = initial();
        this.#stack = [];
        this.#markedStack = [];
    }
    endPage(): void {
        this.#drawing();
        if (this.#stack.length)
            throw new Error("PDF graphics state is unbalanced.");
        if (this.#markedStack.length)
            throw new Error("PDF marked-content state is unbalanced.");
        this.#page = null;
    }
    setLanguage(language: string): void {
        this.#live();
        this.#language = normalisePDFLanguage(language);
    }
    setOutputIntent(profile: GFXColourProfile, options: GFXPDFOutputIntentOptions): void {
        this.#live();
        if (!(profile instanceof GFXColourProfile))
            throw new TypeError("PDF output intent requires a canonical GFXColourProfile.");
        this.#outputIntent = Object.freeze({ profile, options: normalisePDFOutputIntentOptions(options) });
    }
    addOutline(outline: GFXPDFOutline): void {
        this.#live();
        const value = normalisePDFOutline(outline);
        if (value.pageIndex >= this.#pages.length)
            throw new RangeError("PDF outline page index is out of range.");
        if (this.#outlines.length >= 4096)
            throw new RangeError("PDF outline limit exceeded.");
        this.#outlines.push(value);
    }
    addLink(link: GFXPDFLink): void {
        const page = this.#drawing(), value = normalisePDFLink(link);
        if (page.links.length >= 4096)
            throw new RangeError("PDF link annotation limit exceeded.");
        page.links.push(value);
    }
    beginMarkedContent(marked: GFXPDFMarkedContent): void {
        const page = this.#drawing(), value = normalisePDFMarkedContent(marked);
        if (this.#markedStack.length >= 32 || page.markers.length >= 4096)
            throw new RangeError("PDF marked-content limit exceeded.");
        const marker = Object.freeze({ ...value, mcid: page.markers.length });
        page.markers.push(marker);
        this.#markedStack.push(marker);
        this.#append({ kind: "marked-begin", marker, state: this.#state });
    }
    endMarkedContent(): void {
        this.#drawing();
        if (!this.#markedStack.pop())
            throw new Error("PDF marked-content stack is empty.");
        this.#append({ kind: "marked-end", state: this.#state });
    }
    save(): void {
        this.#drawing();
        if (this.#stack.length >= 128)
            throw new RangeError("PDF state stack limit exceeded.");
        this.#stack.push(this.#state);
    }
    restore(): void {
        this.#drawing();
        const state = this.#stack.pop();
        if (!state)
            throw new Error("PDF graphics state underflow.");
        this.#state = state;
    }
    setTransform(value: GFXAffineTransform): void {
        this.#drawing();
        this.#state = Object.freeze({ ...this.#state, transform: normaliseAffineTransform(value) });
    }
    concatTransform(value: GFXAffineTransform): void {
        this.setTransform(concatenateTransforms(this.#state.transform, value));
    }
    setAlpha(alpha: number): void {
        this.#drawing();
        this.#state = Object.freeze({ ...this.#state, alpha: bounded(alpha, "alpha", 0, 1) });
    }
    setBlendMode(blend: GFXBlendMode): void {
        this.#drawing();
        if (!Object.prototype.hasOwnProperty.call(blendNames, blend))
            throw new TypeError("Unsupported PDF blend mode.");
        this.#state = Object.freeze({ ...this.#state, blend });
    }
    setFillColour(colour: GFXColour): void {
        this.#drawing();
        if (!(colour instanceof GFXColour))
            throw new TypeError("GFXColour required.");
        this.#state = Object.freeze({ ...this.#state, fill: colour });
    }
    setProfiledFillColour(profile: GFXColourProfile, components: GFXRGBAComponents): void {
        if (!(profile instanceof GFXColourProfile))
            throw new TypeError("GFXColourProfile required.");
        const c = profile.toSRGB(components);
        this.setFillColour(GFXColour.rgba(c.r, c.g, c.b, c.a));
    }
    drawProfiledImage(profile: GFXColourProfile, pixels: Omit<GFXImageDescriptor, "colourSpace">, destination: GFXRect): void {
        this.#drawing();
        if (!(profile instanceof GFXColourProfile))
            throw new TypeError("GFXColourProfile required.");
        this.drawImage(profile.decodeImage(pixels), destination);
    }
    setStrokeColour(colour: GFXColour): void {
        this.#drawing();
        if (!(colour instanceof GFXColour))
            throw new TypeError("GFXColour required.");
        this.#state = Object.freeze({ ...this.#state, stroke: colour });
    }
    setLineWidth(width: number): void {
        this.#drawing();
        this.#state = Object.freeze({ ...this.#state, lineWidth: bounded(width, "stroke width", 0, 1e4) });
    }
    setLineCap(cap: GFXLineCap): void {
        this.#drawing();
        if (!["butt", "round", "square"].includes(cap))
            throw new TypeError("Invalid PDF line cap.");
        this.#state = Object.freeze({ ...this.#state, lineCap: cap });
    }
    setLineJoin(join: GFXLineJoin): void {
        this.#drawing();
        if (!["miter", "round", "bevel"].includes(join))
            throw new TypeError("Invalid PDF line join.");
        this.#state = Object.freeze({ ...this.#state, lineJoin: join });
    }
    setLineDash(lengths: readonly number[], phase = 0): void {
        this.#drawing();
        if (!Array.isArray(lengths) || lengths.length > 64 || lengths.some(v => !Number.isFinite(v) || v < 0) || lengths.length && lengths.every(v => v === 0) || !Number.isFinite(phase))
            throw new RangeError("Invalid PDF dash pattern.");
        this.#state = Object.freeze({ ...this.#state, dash: Object.freeze([...lengths]), phase });
    }
    clip(path: GFXPath, fillRule: GFXFillRule = "nonzero"): void {
        this.#drawing();
        if (!(path instanceof GFXPath))
            throw new TypeError("GFXPath required.");
        if (this.#state.clips.length >= 64)
            throw new RangeError("PDF clip limit exceeded.");
        const next = Object.freeze({ path, transform: this.#state.transform, rule: rule(fillRule) });
        this.#state = Object.freeze({ ...this.#state, clips: Object.freeze([...this.#state.clips, next]) });
    }
    #append(command: Command): void {
        const page = this.#drawing();
        let elements = command.state.clips.reduce((sum, item) => sum + item.path.commands.length, 0);
        if (command.kind === "fill" || command.kind === "stroke") elements += command.path.commands.length;
        else if (command.kind === "text") elements += command.runs.reduce((sum, run) => sum + run.outlines.reduce((glyphSum, glyph) => glyphSum + glyph.path.commands.length, 0), 0);
        if (this.#commands >= 10000 || this.#pathElements + elements > 100000)
            throw new RangeError("PDF drawing command budget exceeded.");
        this.#commands++;
        this.#pathElements += elements;
        page.commands.push(Object.freeze(command));
    }
    fill(path: GFXPath, paint: GFXColour | GFXGradient = this.#state.fill, fillRule: GFXFillRule = "nonzero"): void {
        this.#drawing();
        if (!(path instanceof GFXPath) || !(paint instanceof GFXColour || paint instanceof GFXGradient))
            throw new TypeError("Invalid PDF fill data.");
        this.#append({ kind: "fill", path, paint, rule: rule(fillRule), state: this.#state });
    }
    stroke(path: GFXPath): void {
        if (!(path instanceof GFXPath))
            throw new TypeError("GFXPath required.");
        this.#append({ kind: "stroke", path, state: this.#state });
    }
    drawGlyphOutlines(outlines: readonly Readonly<{
        glyphId: number;
        stringIndex: number;
        path: GFXPath;
        embedding: "allowed" | "restricted" | "unknown";
    }>[]): void {
        this.#drawing();
        if (!Array.isArray(outlines) || outlines.length > 10000)
            throw new RangeError("Glyph outline limit exceeded.");
        let elements = 0;
        for (const entry of outlines) {
            if (!Number.isSafeInteger(entry.glyphId) || entry.glyphId < 0 || !Number.isSafeInteger(entry.stringIndex) || entry.stringIndex < 0 || !(entry.path instanceof GFXPath))
                throw new TypeError("Invalid positioned glyph outline.");
            if (entry.embedding !== "allowed")
                throw new DOMException("Glyph font export permission is restricted or unknown.", "SecurityError");
            elements += entry.path.commands.length + this.#state.clips.reduce((sum, item) => sum + item.path.commands.length, 0);
        }
        if (this.#commands + outlines.length > 10000 || this.#pathElements + elements > 100000)
            throw new RangeError("Glyph outline drawing budget exceeded.");
        for (const entry of outlines)
            this.fill(entry.path);
    }
    drawPositionedText(runs: readonly GFXPDFPositionedTextRun[]): void {
        this.#drawing();
        if (!Array.isArray(runs) || runs.length > 4096)
            throw new RangeError("PDF positioned-text run limit exceeded.");
        const copied: GFXPDFPositionedTextRun[] = [];
        let glyphs = 0;
        for (const run of runs) {
            if (!run || typeof run !== "object" || !Number.isSafeInteger(run.sourceStart) || !Number.isSafeInteger(run.sourceEnd) || run.sourceStart < 0 || run.sourceEnd < run.sourceStart || typeof run.text !== "string" || run.text.length !== run.sourceEnd - run.sourceStart || run.text.length > 65536)
                throw new TypeError("Invalid PDF positioned-text source range.");
            if (!["ltr", "rtl", "ttb", "btt"].includes(run.direction))
                throw new TypeError("Invalid PDF positioned-text direction.");
            if (!(run.font instanceof GFXPDFFontSubset) || run.font.embedding !== "allowed")
                throw new DOMException("PDF font export permission is restricted or unknown.", "SecurityError");
            if (!run.baseline || !Number.isFinite(run.baseline.x) || !Number.isFinite(run.baseline.y))
                throw new TypeError("Invalid PDF positioned-text baseline.");
            if (!Array.isArray(run.outlines) || glyphs + run.outlines.length > 10000)
                throw new RangeError("PDF positioned-text glyph limit exceeded.");
            const outlines = run.outlines.map((entry: GFXPDFPositionedTextRun["outlines"][number]) => {
                if (!Number.isSafeInteger(entry.glyphId) || entry.glyphId < 0 || !Number.isSafeInteger(entry.stringIndex) || entry.stringIndex < run.sourceStart || entry.stringIndex >= run.sourceEnd || !(entry.path instanceof GFXPath) || entry.embedding !== "allowed")
                    throw new TypeError("Invalid PDF positioned-text glyph mapping.");
                return Object.freeze({ ...entry });
            });
            glyphs += outlines.length;
            copied.push(Object.freeze({ ...run, baseline: Object.freeze({ x: run.baseline.x, y: run.baseline.y }), outlines: Object.freeze(outlines) }));
        }
        this.#append({ kind: "text", runs: Object.freeze(copied), state: this.#state });
    }
    drawPDFPage(document: GFXPDFDocument, index: number, destination: GFXRect): void {
        this.#drawing();
        const descriptor = document.page(index), rect = normaliseRect(destination), viewport = descriptor.viewport();
        if (!viewport.width || !viewport.height)
            throw new RangeError("PDF source page has empty bounds.");
        if (!rect.width || !rect.height)
            return;
        this.#append({ kind: "pdf-page", document, index, rect, state: this.#state });
    }
    drawImage(image: GFXImage, destination: GFXRect): void {
        this.#drawing();
        if (!(image instanceof GFXImage))
            throw new TypeError("Owned GFXImage required.");
        const rect = normaliseRect(destination);
        if (!rect.width || !rect.height)
            return;
        const count = image.width * image.height;
        if (count > 1048576 || this.#imagePixels + count > 4194304)
            throw new RangeError("PDF image pixel budget exceeded.");
        this.#append({ kind: "image", image, rect, state: this.#state });
        this.#imagePixels += count;
    }
    async finish(consumer?: GFXDataConsumer, signal?: AbortSignal): Promise<Uint8Array> {
        this.#live();
        if (this.#page)
            throw new Error("End the current PDF page before finishing.");
        if (!this.#pages.length)
            throw new Error("PDF requires at least one page.");
        this.#closed = true;
        const generation = ++this.#generation;
        const check = () => {
            signal?.throwIfAborted();
            if (this.#generation !== generation)
                throw new DOMException("PDF export disposed.", "AbortError");
        };
        try {
            check();
            const pdf = await PDFDocument.create({ updateMetadata: false });
            pdf.registerFontkit(fontkit);
            const embeddedFonts = new Map<GFXPDFFontSubset, PDFFont>();
            const unicodeMappings = new Map<GFXPDFFontSubset, Map<number, string>>();
            const renderedPages: PDFPage[] = [];
            check();
            if (this.#metadata.title)
                pdf.setTitle(this.#metadata.title);
            if (this.#metadata.author)
                pdf.setAuthor(this.#metadata.author);
            if (this.#metadata.subject)
                pdf.setSubject(this.#metadata.subject);
            if (this.#metadata.keywords)
                pdf.setKeywords([this.#metadata.keywords]);
            if (this.#language)
                pdf.setLanguage(this.#language);
            if (this.#outputIntent) {
                const profile = pdf.context.register(pdf.context.flateStream(this.#outputIntent.profile.copyData(), { N: 3 }));
                const intent = pdf.context.register(pdf.context.obj({
                    Type: "OutputIntent",
                    S: "GTS_PDFA1",
                    OutputConditionIdentifier: PDFString.of(this.#outputIntent.options.identifier),
                    Info: PDFString.of(this.#outputIntent.options.identifier),
                    DestOutputProfile: profile,
                }));
                pdf.catalog.set(PDFName.of("OutputIntents"), pdf.context.obj([intent]));
            }
            pdf.setProducer("GraphicsFX");
            for (const record of this.#pages) {
                check();
                const page = pdf.addPage([record.options.width, record.options.height]);
                renderedPages.push(page);
                page.setRotation(degrees(record.options.rotation ?? 0));
                for (const key of ["cropBox", "bleedBox", "trimBox", "artBox"] as const) {
                    const box = record.options[key];
                    if (box) {
                        const setter = { cropBox: page.setCropBox, bleedBox: page.setBleedBox, trimBox: page.setTrimBox, artBox: page.setArtBox }[key];
                        setter.call(page, box.x, box.y, box.width, box.height);
                    }
                }
                for (const command of record.commands) {
                    check();
                    if (command.kind === "marked-begin") {
                        const resources = page.node.normalizedEntries().Resources;
                        let propertyLists = resources.lookupMaybe(PDFName.of("Properties"), PDFDict);
                        if (!propertyLists) {
                            propertyLists = pdf.context.obj({});
                            resources.set(PDFName.of("Properties"), propertyLists);
                        }
                        const properties = pdf.context.obj({
                            MCID: command.marker.mcid,
                            ActualText: command.marker.actualText === undefined ? undefined : PDFHexString.fromText(command.marker.actualText),
                        });
                        const propertyName = propertyLists.uniqueKey("GFXMark");
                        propertyLists.set(propertyName, properties);
                        page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of(command.marker.tag), propertyName]));
                        continue;
                    }
                    if (command.kind === "marked-end") {
                        page.pushOperators(endMarkedContent());
                        continue;
                    }
                    const state = command.state;
                    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, -1, 0, record.options.height));
                    for (const item of state.clips) {
                        page.pushOperators(...pathOperators(item.path.transformed(item.transform)), item.rule === "evenodd" ? clipEvenOdd() : clip(), endPath());
                    }
                    page.pushOperators(matrix(state.transform));
                    let opacity = state.alpha;
                    if (command.kind === "stroke")
                        opacity *= state.stroke.components.a;
                    else if (command.kind === "fill") {
                        if (command.paint instanceof GFXColour) opacity *= command.paint.components.a;
                        else {
                            const alpha = command.paint.stops[0]!.colour.components.a;
                            if (command.paint.stops.every(stop => stop.colour.components.a === alpha)) opacity *= alpha;
                        }
                    }
                    else if (command.kind === "text")
                        opacity *= state.fill.components.a;
                    const gs = page.node.newExtGState("GFX", pdf.context.obj({ Type: "ExtGState", ca: opacity, CA: opacity, BM: blendNames[state.blend as keyof typeof blendNames] }));
                    page.pushOperators(setGraphicsState(gs));
                    if (command.kind === "image") {
                        const image = await pdf.embedPng(command.image.toPNG());
                        check();
                        const name = page.node.newXObject("GFXImage", image.ref), r = command.rect;
                        page.pushOperators(concatTransformationMatrix(r.width, 0, 0, -r.height, r.x, r.y + r.height), drawObject(name));
                    }
                    else if (command.kind === "pdf-page") {
                        const descriptor = command.document.page(command.index), box = descriptor.cropBox, viewport = descriptor.viewport();
                        const source = await pdfPageForEmbedding(command.document, command.index, signal);
                        check();
                        const embedded = await pdf.embedPage(source, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height }, [1, 0, 0, 1, 0, 0]);
                        check();
                        pdfAssertLive(command.document);
                        const name = page.node.newXObject("GFXPDFPage", embedded.ref), r = command.rect;
                        page.pushOperators(concatTransformationMatrix(r.width / viewport.width, 0, 0, r.height / viewport.height, r.x, r.y), matrix(viewport.transform), drawObject(name));
                    }
                    else if (command.kind === "stroke") {
                        const colour = state.stroke.converting("srgb").components;
                        page.pushOperators(setStrokingRgbColor(colour.r, colour.g, colour.b), setLineWidth(state.lineWidth), setDashPattern([...state.dash], state.phase), setLineCap(({ butt: 0, round: 1, square: 2 } as const)[state.lineCap]), setLineJoin(({ miter: 0, round: 1, bevel: 2 } as const)[state.lineJoin]), ...pathOperators(command.path), stroke());
                    }
                    else if (command.kind === "text") {
                        const colour = state.fill.converting("srgb").components;
                        page.pushOperators(setFillingRgbColor(colour.r, colour.g, colour.b));
                        for (const run of command.runs)
                            for (const outline of run.outlines)
                                page.pushOperators(...pathOperators(outline.path), fill());
                    }
                    else if (command.paint instanceof GFXColour) {
                        const colour = command.paint.converting("srgb").components;
                        page.pushOperators(setFillingRgbColor(colour.r, colour.g, colour.b), ...pathOperators(command.path), command.rule === "evenodd" ? PDFOperator.of(PDFOperatorNames.FillEvenOdd) : fill());
                    }
                    else
                        await this.#gradient(pdf, page, command.path, command.paint, command.rule);
                    page.pushOperators(popGraphicsState());
                    if (command.kind === "text") {
                        for (const run of command.runs) {
                            check();
                            let embedded = embeddedFonts.get(run.font);
                            if (!embedded) {
                                embedded = await pdf.embedFont(pdfFontProgram(run.font), { subset: true, customName: run.font.familyName });
                                check();
                                embeddedFonts.set(run.font, embedded);
                            }
                            const resource = page.node.newFontDictionary("GFXSearchText", embedded.ref);
                            const baseline = transformPoint(run.baseline, state.transform);
                            const encoded = embedded.encodeText(run.text);
                            let mappings = unicodeMappings.get(run.font);
                            if (!mappings) {
                                mappings = new Map();
                                unicodeMappings.set(run.font, mappings);
                            }
                            const searchable = recordSourceUnicode(run.font, run.text, encoded.asBytes(), mappings);
                            page.pushOperators(
                                pushGraphicsState(),
                                beginText(),
                                setTextRenderingMode(TextRenderingMode.Invisible),
                                setFontAndSize(resource, run.font.size),
                                setTextMatrix(1, 0, 0, 1, baseline.x, record.options.height - baseline.y),
                                showText(searchable),
                                endText(),
                                popGraphicsState(),
                            );
                        }
                    }
                }
                for (const link of record.links) {
                    const rect = link.rect;
                    const annotation = pdf.context.register(pdf.context.obj({
                        Type: "Annot",
                        Subtype: "Link",
                        Rect: [rect.x, record.options.height - rect.y - rect.height, rect.x + rect.width, record.options.height - rect.y],
                        Border: [0, 0, 0],
                        A: { S: "URI", URI: PDFString.of(link.uri) },
                    }));
                    page.node.addAnnot(annotation);
                }
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            }
            check();
            if (this.#pages.some(record => record.markers.length > 0)) {
                const root = pdf.context.obj({ Type: "StructTreeRoot" }), rootRef = pdf.context.register(root);
                const children = [], parentNumbers = [];
                for (let pageIndex = 0; pageIndex < this.#pages.length; pageIndex++) {
                    const record = this.#pages[pageIndex]!, page = renderedPages[pageIndex]!;
                    if (!record.markers.length) continue;
                    page.node.set(PDFName.of("StructParents"), pdf.context.obj(pageIndex));
                    const pageChildren = [];
                    for (const marker of record.markers) {
                        const element = pdf.context.obj({
                            Type: "StructElem",
                            S: marker.tag,
                            P: rootRef,
                            Pg: page.ref,
                            K: marker.mcid,
                            ActualText: marker.actualText === undefined ? undefined : PDFHexString.fromText(marker.actualText),
                        });
                        const elementRef = pdf.context.register(element);
                        children.push(elementRef);
                        pageChildren.push(elementRef);
                    }
                    parentNumbers.push(pdf.context.obj(pageIndex), pdf.context.obj(pageChildren));
                }
                root.set(PDFName.of("K"), pdf.context.obj(children));
                root.set(PDFName.of("ParentTree"), pdf.context.register(pdf.context.obj({ Nums: parentNumbers })));
                pdf.catalog.set(PDFName.of("StructTreeRoot"), rootRef);
                pdf.catalog.set(PDFName.of("MarkInfo"), pdf.context.obj({ Marked: true }));
            }
            if (this.#outlines.length) {
                const root = pdf.context.obj({ Type: "Outlines" }), rootRef = pdf.context.register(root);
                const dictionaries = this.#outlines.map(outline => pdf.context.obj({
                    Title: PDFHexString.fromText(outline.title),
                    Parent: rootRef,
                    Dest: [renderedPages[outline.pageIndex]!.ref, "Fit"],
                }));
                const references = dictionaries.map(dictionary => pdf.context.register(dictionary));
                for (let index = 0; index < dictionaries.length; index++) {
                    if (index > 0) dictionaries[index]!.set(PDFName.of("Prev"), references[index - 1]!);
                    if (index + 1 < dictionaries.length) dictionaries[index]!.set(PDFName.of("Next"), references[index + 1]!);
                }
                root.set(PDFName.of("First"), references[0]!);
                root.set(PDFName.of("Last"), references[references.length - 1]!);
                root.set(PDFName.of("Count"), pdf.context.obj(references.length));
                pdf.catalog.set(PDFName.of("Outlines"), rootRef);
            }
            check();
            for (const [font, embedded] of embeddedFonts) {
                await embedded.embed();
                check();
                const dictionary = pdf.context.lookup(embedded.ref, PDFDict);
                const mappings = unicodeMappings.get(font);
                if (!mappings?.size) throw new TypeError("Searchable PDF font has no source Unicode mapping.");
                const cmap = pdf.context.register(pdf.context.flateStream(pdfSourceCMap(mappings)));
                dictionary.set(PDFName.of("ToUnicode"), cmap);
            }
            check();
            const bytes = await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50, updateFieldAppearances: false });
            check();
            if (bytes.length > 32 * 1024 * 1024)
                throw new RangeError("PDF output exceeds 32 MiB.");
            if (consumer)
                consumer.write(bytes);
            return bytes;
        }
        finally {
            this.#pages.length = 0;
        }
    }
    async #gradient(pdf: PDFDocument, page: PDFPage, path: GFXPath, gradient: GFXGradient, fillRule: GFXFillRule): Promise<void> {
        const firstAlpha = gradient.stops[0]!.colour.components.a;
        if (gradient.stops.some(stop => stop.colour.components.a !== firstAlpha)) {
            await this.#gradientImage(pdf, page, path, gradient, fillRule);
            return;
        }
        let stops = [...gradient.stops];
        if (stops[0]!.offset > 0) stops.unshift({ offset: 0, colour: stops[0]!.colour });
        if (stops[stops.length - 1]!.offset < 1) stops.push({ offset: 1, colour: stops[stops.length - 1]!.colour });
        if (stops.length === 1) stops = [{ offset: 0, colour: stops[0]!.colour }, { offset: 1, colour: stops[0]!.colour }];
        const groups: Array<{ offset: number; first: GFXColour; last: GFXColour }> = [];
        for (const stop of stops) {
            const previous = groups[groups.length - 1];
            if (previous?.offset === stop.offset) previous.last = stop.colour;
            else groups.push({ offset: stop.offset, first: stop.colour, last: stop.colour });
        }
        if (groups.length === 1) groups.push({ offset: 1, first: groups[0]!.last, last: groups[0]!.last });
        const functions = groups.slice(0, -1).map((group, index) => {
            const next = groups[index + 1]!;
            const a = group.last.converting("srgb").components, b = next.first.converting("srgb").components;
            return pdf.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [a.r, a.g, a.b], C1: [b.r, b.g, b.b], N: 1 });
        });
        const fn = functions.length === 1 ? functions[0]! : pdf.context.obj({
            FunctionType: 3,
            Domain: [0, 1],
            Functions: functions,
            Bounds: groups.slice(1, -1).map(group => group.offset),
            Encode: functions.flatMap(() => [0, 1]),
        });
        const g = gradient.geometry, shading = pdf.context.register(pdf.context.obj({
            ShadingType: g.kind === "linear" ? 2 : 3,
            ColorSpace: "DeviceRGB",
            Coords: g.kind === "linear" ? [g.start.x, g.start.y, g.end.x, g.end.y] : [g.centre.x, g.centre.y, 0, g.centre.x, g.centre.y, g.radius],
            Function: fn,
            Extend: [true, true],
        }));
        const resources = page.node.normalizedEntries().Resources;
        let dict = resources.lookupMaybe(PDFName.of("Shading"), PDFDict);
        if (!dict) {
            dict = pdf.context.obj({});
            resources.set(PDFName.of("Shading"), dict);
        }
        const name = PDFName.of(`GFXShading${shading.objectNumber}`);
        dict.set(name, shading);
        page.pushOperators(...pathOperators(path), fillRule === "evenodd" ? clipEvenOdd() : clip(), endPath());
        if (gradient.units === "objectBoundingBox") {
            const bounds = path.bounds;
            page.pushOperators(concatTransformationMatrix(bounds.width, 0, 0, bounds.height, bounds.x, bounds.y));
        }
        page.pushOperators(matrix(gradient.transform), PDFOperator.of(PDFOperatorNames.ShadingFill, [name]));
    }
    async #gradientImage(pdf: PDFDocument, page: PDFPage, path: GFXPath, gradient: GFXGradient, fillRule: GFXFillRule): Promise<void> {
        const bounds = path.bounds;
        if (bounds.width <= 0 || bounds.height <= 0) return;
        const maximumPixels = 1024 * 1024;
        const desiredWidth = Math.max(1, Math.ceil(bounds.width)), desiredHeight = Math.max(1, Math.ceil(bounds.height));
        const scale = Math.min(1, Math.sqrt(maximumPixels / (desiredWidth * desiredHeight)));
        const width = Math.max(1, Math.floor(desiredWidth * scale)), height = Math.max(1, Math.floor(desiredHeight * scale));
        const pixels = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const colour = gradient.sampleAt({
                    x: bounds.x + (x + .5) * bounds.width / width,
                    y: bounds.y + (y + .5) * bounds.height / height,
                }, bounds).converting("srgb").components;
                const offset = (y * width + x) * 4;
                pixels[offset] = Math.round(colour.r * 255);
                pixels[offset + 1] = Math.round(colour.g * 255);
                pixels[offset + 2] = Math.round(colour.b * 255);
                pixels[offset + 3] = Math.round(colour.a * 255);
            }
        }
        const image = new GFXImage({ width, height, alpha: "straight", colourSpace: "srgb", data: pixels });
        const embedded = await pdf.embedPng(image.toPNG());
        const name = page.node.newXObject("GFXGradientImage", embedded.ref);
        page.pushOperators(
            ...pathOperators(path),
            fillRule === "evenodd" ? clipEvenOdd() : clip(),
            endPath(),
            concatTransformationMatrix(bounds.width, 0, 0, -bounds.height, bounds.x, bounds.y + bounds.height),
            drawObject(name),
        );
    }
    dispose(): void {
        this.#generation++;
        this.#closed = true;
        this.#pages.length = 0;
        this.#page = null;
        this.#stack = [];
    }
}
