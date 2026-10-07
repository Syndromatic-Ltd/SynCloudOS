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

import type { RuntimeResourceLedger } from "../Resources/RuntimeResourceLedger";
import { GFXImage } from "../../FX/GraphicsFX/GFXImage";
import type { RuntimeCacheRegistry, RuntimeCache } from "../Cache";
import type { DocumentResourceService } from "../Documents";
import type { DocumentResourceDescriptor } from "../Documents";
import type {
  RuntimeDecodedImageLease,
  RuntimeImageAdapterLease,
  RuntimeImageAdapterSource,
  RuntimeImageDiagnostics,
  RuntimeImageLoadRequest,
  RuntimeImagePolicySubject,
  RuntimeImagePolicyRequest,
  RuntimeImageResource,
  RuntimeImageService,
  RuntimeImageCapInsets,
  RuntimeImageRenderingMode,
  RuntimeImageResizingMode,
  RuntimeImageSource,
} from "./imageTypes";
import { createOwnedGFXIdentifierIssuer } from "../../FX/GraphicsFX/identifierAuthority";

const maximumImageBytes = 8 * 1024 * 1024;
const maximumDecodedPixels = 64 * 1024 * 1024;
const maximumActiveDecodedBytes = 64 * 1024 * 1024;
const maximumActiveOperations = 64;
const allowedBinaryTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const maximumSVGBytes = 256 * 1024;
const allowedSVGElements = new Set([
  "svg", "g", "defs", "symbol", "use", "image", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "lineargradient", "radialgradient", "stop", "clippath", "mask", "pattern", "filter", "fegaussianblur", "feoffset", "feflood",
  "fecomposite", "feblend", "fecolormatrix", "femerge", "femergenode", "fedropshadow", "text", "tspan", "title", "desc", "style",
]);
const allowedSVGAttributes = new Set([
  "id", "class", "xmlns", "xmlns:xlink", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height",
  "viewbox", "preserveaspectratio", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity", "transform", "d", "points", "offset", "stop-color",
  "stop-opacity", "gradientunits", "gradienttransform", "spreadmethod", "clip-path", "clip-rule", "clippathunits", "mask", "maskunits",
  "maskcontentunits", "patternunits", "patterncontentunits", "filter", "filterunits", "primitiveunits", "stddeviation", "dx", "dy", "flood-color",
  "flood-opacity", "in", "in2", "result", "operator", "type", "values", "mode", "k1", "k2", "k3", "k4", "color-interpolation-filters",
  "text-anchor", "font-family", "font-size", "font-weight", "font-style", "letter-spacing", "textlength", "lengthadjust", "dominant-baseline",
  "alignment-baseline", "style", "href", "xlink:href", "role", "focusable", "tabindex", "display", "visibility", "overflow", "vector-effect",
  "paint-order", "color-interpolation", "stroke-dasharray", "stroke-dashoffset", "shape-rendering", "image-rendering", "marker-start", "marker-mid", "marker-end", "cursor", "aria-label", "aria-labelledby",
  "aria-describedby",
]);
const svgName = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const svgIdentifier = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const externalSVGProtocol = /\b(?:https?|data|blob|javascript|file|ftp)\s*:/i;
const svgURL = /url\s*\(\s*(?:"(#[A-Za-z_][A-Za-z0-9_.:-]*)"|'(#[A-Za-z_][A-Za-z0-9_.:-]*)'|(#[A-Za-z_][A-Za-z0-9_.:-]*))\s*\)/giu;
const svgURLStart = /url\s*\(/i;
const intrinsicUint8ArraySlice = Uint8Array.prototype.slice;
const abortError = (message: string) => { const error = new Error(message); error.name = "AbortError"; return error; };

function ownDataRecord(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError(`${name} must be a plain record.`);
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError(`${name} must not contain symbols.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors);
  if (actual.some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key))) throw new TypeError(`${name} has an invalid shape.`);
  if (actual.some((key) => !Object.prototype.hasOwnProperty.call(descriptors[key]!, "value"))) throw new TypeError(`${name} must not contain accessors.`);
  return Object.fromEntries(actual.map((key) => [key, descriptors[key]!.value]));
}

function boundedString(value: unknown, name: string, max = 1024): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) throw new TypeError(`${name} must be a bounded string.`);
  return value;
}

function normaliseSubject(value: unknown): RuntimeImagePolicySubject {
  const raw = ownDataRecord(value, ["appId", "capability", "windowControllerId", "documentId"].filter((key) => Object.prototype.hasOwnProperty.call(value ?? {}, key)), "Image policy subject");
  const capability = raw.capability;
  if (capability !== "image.decode" && capability !== "image.export") throw new TypeError("Image capability is unsupported.");
  const subject: RuntimeImagePolicySubject = {
    appId: boundedString(raw.appId, "Image subject app id", 256), capability,
    ...(raw.windowControllerId === undefined ? {} : { windowControllerId: boundedString(raw.windowControllerId, "Image subject window id", 256) }),
    ...(raw.documentId === undefined ? {} : { documentId: boundedString(raw.documentId, "Image subject document id", 256) }),
  };
  return Object.freeze(subject);
}

function bytesKey(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const value of bytes) { hash ^= value; hash = Math.imul(hash, 0x01000193); }
  return `${bytes.byteLength}:${(hash >>> 0).toString(16)}`;
}

function rejectSVG(name: string, reason: string): never {
  throw new DOMException(`${name} ${reason}.`, "SecurityError");
}

function skipSVGWhitespace(svg: string, cursor: number): number {
  while (cursor < svg.length && /[\t\n\r ]/.test(svg[cursor]!)) cursor += 1;
  return cursor;
}

function readSVGName(svg: string, cursor: number, name: string): readonly [string, number] {
  const start = cursor;
  while (cursor < svg.length && /[A-Za-z0-9_.:-]/.test(svg[cursor]!)) cursor += 1;
  const value = svg.slice(start, cursor);
  if (!svgName.test(value) || value.length > 128) rejectSVG(name, "contains an invalid XML name");
  return [value, cursor];
}

function collectSafeSVGURLReferences(value: string, references: Set<string>, name: string, context: string): void {
  if (externalSVGProtocol.test(value)) rejectSVG(name, `${context} contains an external subresource`);
  const remainder = value.replace(svgURL, (_match, doubleQuoted: string | undefined, singleQuoted: string | undefined, bare: string | undefined) => {
    const reference = doubleQuoted ?? singleQuoted ?? bare;
    references.add(reference!.slice(1));
    return "";
  });
  if (svgURLStart.test(remainder)) rejectSVG(name, `${context} contains a non-local URL reference`);
}

function validateSVGStyle(value: string, references: Set<string>, name: string): void {
  if (value.includes("&") || /[@\\\\]|\/\*/.test(value)) rejectSVG(name, "contains unsafe CSS");
  if (/(?:image-set|cross-fade|element|src)\s*\(/i.test(value)) rejectSVG(name, "contains an unsupported CSS subresource function");
  collectSafeSVGURLReferences(value, references, name, "SVG CSS");
}

function validateSVGAttribute(
  element: string,
  attribute: string,
  value: string,
  identifiers: Set<string>,
  references: Set<string>,
  name: string,
): void {
  const canonical = attribute.toLowerCase();
  if (canonical.startsWith("on") || !allowedSVGAttributes.has(canonical)) {
    rejectSVG(name, `contains unsupported SVG attribute ${attribute}`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) rejectSVG(name, "contains a control character");
  if (canonical === "xmlns") {
    if (value !== "http://www.w3.org/2000/svg") rejectSVG(name, "contains an unsupported SVG namespace");
    return;
  }
  if (canonical === "xmlns:xlink") {
    if (value !== "http://www.w3.org/1999/xlink") rejectSVG(name, "contains an unsupported SVG namespace");
    return;
  }
  if (canonical === "id") {
    if (!svgIdentifier.test(value) || !identifiers.add(value)) rejectSVG(name, "contains an invalid or duplicate SVG identifier");
    return;
  }
  if (canonical === "href" || canonical === "xlink:href") {
    if (!svgIdentifier.test(value.slice(1)) || !value.startsWith("#")) rejectSVG(name, "contains a non-local SVG link");
    references.add(value.slice(1));
    return;
  }
  if (canonical === "style") {
    validateSVGStyle(value, references, name);
    return;
  }
  if (externalSVGProtocol.test(value)) rejectSVG(name, "contains an external subresource");
  if (value.includes("&") && svgURLStart.test(value)) rejectSVG(name, "contains an encoded SVG URL reference");
  collectSafeSVGURLReferences(value, references, name, `SVG ${element} attribute`);
}

function sanitiseSVGMarkup(value: unknown, name: string): string {
  const svg = boundedString(value, name, maximumSVGBytes);
  if (new TextEncoder().encode(svg).byteLength > maximumSVGBytes) throw new RangeError(`${name} exceeds the byte limit.`);
  if (!/<svg[\t\n\r />]/i.test(svg)) throw new TypeError(`${name} must contain a root svg element.`);
  const identifiers = new Set<string>();
  const references = new Set<string>();
  const stack: string[] = [];
  let rootSeen = false;
  let rootClosed = false;
  let elementCount = 0;
  let cursor = 0;
  while (cursor < svg.length) {
    if (svg[cursor] !== "<") {
      const next = svg.indexOf("<", cursor);
      const text = svg.slice(cursor, next < 0 ? svg.length : next);
      if (stack.length === 0 && !/^[\uFEFF\t\n\r ]*$/.test(text)) rejectSVG(name, "contains content outside the root svg element");
      if (stack[stack.length - 1] === "style") validateSVGStyle(text, references, name);
      cursor = next < 0 ? svg.length : next;
      continue;
    }
    if (svg.startsWith("<!--", cursor) || svg.startsWith("<!", cursor) || svg.startsWith("<?", cursor)) rejectSVG(name, "contains unsupported XML declarations or comments");
    cursor += 1;
    if (svg[cursor] === "/") {
      const [rawElement, afterName] = readSVGName(svg, cursor + 1, name);
      const element = rawElement.toLowerCase();
      cursor = skipSVGWhitespace(svg, afterName);
      if (svg[cursor] !== ">" || stack.length === 0 || stack[stack.length - 1] !== element) rejectSVG(name, "contains malformed SVG element nesting");
      stack.pop(); cursor += 1;
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    const [rawElement, afterElementName] = readSVGName(svg, cursor, name);
    const element = rawElement.toLowerCase();
    if (!allowedSVGElements.has(element)) rejectSVG(name, `contains unsupported SVG element ${rawElement}`);
    if (stack.length === 0) {
      if (rootSeen || rootClosed || element !== "svg") rejectSVG(name, "must contain exactly one root svg element");
      rootSeen = true;
    }
    if ((elementCount += 1) > 4096) throw new RangeError(`${name} exceeds the SVG element limit.`);
    cursor = afterElementName;
    const attributes = new Set<string>();
    let selfClosing = false;
    for (;;) {
      cursor = skipSVGWhitespace(svg, cursor);
      if (svg.startsWith("/>", cursor)) { selfClosing = true; cursor += 2; break; }
      if (svg[cursor] === ">") { cursor += 1; break; }
      const [rawAttribute, afterAttributeName] = readSVGName(svg, cursor, name);
      const attribute = rawAttribute.toLowerCase();
      if (!attributes.add(attribute) || attributes.size > 96) rejectSVG(name, "contains duplicate or excessive SVG attributes");
      cursor = skipSVGWhitespace(svg, afterAttributeName);
      if (svg[cursor] !== "=") rejectSVG(name, "contains an unquoted SVG attribute");
      cursor = skipSVGWhitespace(svg, cursor + 1);
      const quote = svg[cursor];
      if (quote !== "\"" && quote !== "'") rejectSVG(name, "contains an unquoted SVG attribute");
      const valueStart = cursor + 1;
      const valueEnd = svg.indexOf(quote, valueStart);
      if (valueEnd < 0 || valueEnd - valueStart > 16 * 1024) rejectSVG(name, "contains an invalid SVG attribute value");
      const attributeValue = svg.slice(valueStart, valueEnd);
      if (attributeValue.includes("<")) rejectSVG(name, "contains malformed SVG markup");
      validateSVGAttribute(element, rawAttribute, attributeValue, identifiers, references, name);
      cursor = valueEnd + 1;
    }
    if (!selfClosing) stack.push(element);
    else if (stack.length === 0) rootClosed = true;
  }
  if (!rootSeen || !rootClosed || stack.length !== 0) throw new TypeError(`${name} must contain a complete root svg element.`);
  for (const reference of references) if (!identifiers.has(reference)) rejectSVG(name, "contains an unresolved SVG reference");
  return svg;
}

function svgToBytes(svg: string): Uint8Array {
  return new TextEncoder().encode(svg);
}

function normaliseRenderingMode(value: unknown): RuntimeImageRenderingMode {
  if (value === undefined) return "original";
  if (value !== "original" && value !== "template") throw new TypeError("Image rendering mode is unsupported.");
  return value;
}

function normaliseTintColour(value: unknown): string | null {
  if (value === undefined) return null;
  const colour = boundedString(value, "Image tint colour", 64);
  if (!/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(colour)) throw new TypeError("Image tint colour is invalid.");
  return colour;
}

function normaliseCapInsets(value: unknown): RuntimeImageCapInsets | null {
  if (value === undefined) return null;
  const raw = ownDataRecord(value, ["top", "right", "bottom", "left"], "Image cap insets");
  const inset = (name: string) => {
    const next = raw[name];
    if (typeof next !== "number" || !Number.isFinite(next) || next < 0 || next > 4096) throw new TypeError(`Image cap inset ${name} is invalid.`);
    return next;
  };
  return Object.freeze({ top: inset("top"), right: inset("right"), bottom: inset("bottom"), left: inset("left") });
}

function normaliseResizingMode(value: unknown): RuntimeImageResizingMode {
  if (value === undefined) return "stretch";
  if (value !== "stretch" && value !== "tile" && value !== "cap-insets") throw new TypeError("Image resizing mode is unsupported.");
  return value;
}

function copyImageBytes(value: unknown, name: string): Uint8Array {
  if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype || Object.getOwnPropertySymbols(value).length || Object.prototype.hasOwnProperty.call(value, "byteLength") || Object.prototype.hasOwnProperty.call(value, "buffer") || Object.prototype.hasOwnProperty.call(value, "byteOffset")) throw new TypeError(`${name} must be a canonical Uint8Array.`);
  if (value.byteLength === 0 || value.byteLength > maximumImageBytes) throw new RangeError(`${name} length is invalid.`);
  return intrinsicUint8ArraySlice.call(value) as Uint8Array;
}

function snapshotDocumentDescriptor(value: unknown): DocumentResourceDescriptor {
  const raw = ownDataRecord(value, ["kind", "documentId", "resourceId", "leaseId", "generation", "mimeType", "byteLength"], "Document image descriptor");
  if (raw.kind !== "document-resource") throw new TypeError("Document image descriptor kind is invalid.");
  const documentId = boundedString(raw.documentId, "Document image descriptor document id", 256);
  const resourceId = boundedString(raw.resourceId, "Document image descriptor resource id", 512);
  const leaseId = boundedString(raw.leaseId, "Document image descriptor lease id", 512);
  if (!Number.isSafeInteger(raw.generation) || (raw.generation as number) <= 0) throw new TypeError("Document image descriptor generation is invalid.");
  if (typeof raw.mimeType !== "string" || !allowedBinaryTypes.has(raw.mimeType)) throw new TypeError("Document image descriptor MIME type is invalid.");
  if (!Number.isSafeInteger(raw.byteLength) || (raw.byteLength as number) < 0 || (raw.byteLength as number) > maximumImageBytes) throw new RangeError("Document image descriptor byte length is invalid.");
  return Object.freeze({
    kind: "document-resource",
    documentId,
    resourceId,
    leaseId,
    generation: raw.generation as number,
    mimeType: raw.mimeType,
    byteLength: raw.byteLength as number,
  });
}

interface NormalisedImageSource {
  readonly source: RuntimeImageSource;
  readonly adapterSource: RuntimeImageAdapterSource;
  readonly identity: string;
  readonly documentLease?: Readonly<{ documentId: string; descriptor: DocumentResourceDescriptor }>;
}

/**
 * A bundled resource, named the way bundlers hand it over: a root path (`import url from "./a.png"`)
 * or an absolute URL on the site's own origin (`new URL("./a.png", import.meta.url).href`), with an
 * optional query such as a dev server's cache key. Anything on another origin is a `url` source.
 */
function normaliseAppAssetPath(value: unknown, origin: string | null): string {
  let path = boundedString(value, "App asset path", 2048);
  if (/^https?:\/\//i.test(path)) {
    let url: URL;
    try { url = new URL(path); } catch { throw new TypeError("App asset path is invalid."); }
    if (origin === null || url.origin !== origin) throw new TypeError("App asset URLs must be on this site's origin; use a url source for other origins.");
    if (url.hash) throw new TypeError("App asset path is invalid.");
    path = `${url.pathname}${url.search}`;
  }
  const query = path.indexOf("?");
  const pathname = query < 0 ? path : path.slice(0, query);
  const search = query < 0 ? "" : path.slice(query);
  if (!pathname.startsWith("/") || pathname.startsWith("//") || !/^\/[A-Za-z0-9._~@+\/-]+$/.test(pathname) || !/^(\?[A-Za-z0-9._~=&+-]*)?$/.test(search)) {
    throw new TypeError("App asset path is invalid.");
  }
  const segments = pathname.slice(1).split("/");
  if (segments.length === 0 || segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new TypeError("App asset path must be a canonical single-root path.");
  }
  return `${pathname}${search}`;
}

function normaliseSource(value: unknown, documents: DocumentResourceService, origin: string | null): NormalisedImageSource {
  if (!value || typeof value !== "object") throw new TypeError("Image source must be a plain record.");
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (!kindDescriptor || !Object.prototype.hasOwnProperty.call(kindDescriptor, "value")) throw new TypeError("Image source kind must be data.");
  const kind = kindDescriptor.value;
  if (kind === "url") {
    const raw = ownDataRecord(value, ["kind", "url", "cors"], "URL image source");
    const url = boundedString(raw.url, "Image URL", 4096);
    if (!/^https?:\/\/[^\s\\]+$/i.test(url) || /[\u0000-\u001f\u007f]/.test(url)) throw new TypeError("Image URL is invalid or uses an unsupported scheme.");
    if (raw.cors !== "none" && raw.cors !== "anonymous" && raw.cors !== "use-credentials") throw new TypeError("Image CORS mode is invalid.");
    const source = Object.freeze({ kind, url, cors: raw.cors });
    return { source, adapterSource: source, identity: JSON.stringify(["url", url, raw.cors]) };
  }
  if (kind === "app-asset") {
    const raw = ownDataRecord(value, ["kind", "path"], "App asset image source");
    const path = normaliseAppAssetPath(raw.path, origin);
    const source = Object.freeze({ kind, path });
    return { source, adapterSource: Object.freeze({ kind: "url", url: path, cors: "anonymous" }), identity: JSON.stringify(["asset", path]) };
  }
  if (kind === "bytes") {
    const raw = ownDataRecord(value, ["kind", "mimeType", "bytes"], "Binary image source");
    if (typeof raw.mimeType !== "string" || !allowedBinaryTypes.has(raw.mimeType)) throw new TypeError("Binary image MIME type is unsupported.");
    const bytes = copyImageBytes(raw.bytes, "Binary image bytes");
    const mimeType = raw.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/svg+xml";
    if (mimeType === "image/svg+xml") sanitiseSVGMarkup(new TextDecoder().decode(bytes), "Binary SVG image");
    const source = Object.freeze({ kind, mimeType, bytes });
    const adapterSource = Object.freeze({ kind, mimeType, bytes });
    return { source, adapterSource, identity: JSON.stringify(["bytes", raw.mimeType, bytesKey(bytes)]) };
  }
  if (kind === "generated-svg") {
    const raw = ownDataRecord(value, ["kind", "svg", "intrinsicSize", "density"].filter((key) => Object.prototype.hasOwnProperty.call(value, key)), "Generated SVG image source");
    const svg = sanitiseSVGMarkup(raw.svg, "Generated SVG");
    if (raw.intrinsicSize !== undefined) {
      const size = ownDataRecord(raw.intrinsicSize, ["width", "height"], "Generated SVG size");
      if (typeof size.width !== "number" || typeof size.height !== "number" || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
        throw new TypeError("Generated SVG intrinsic size is invalid.");
      }
    }
    if (raw.density !== undefined && (typeof raw.density !== "number" || !Number.isFinite(raw.density) || raw.density < 0.125 || raw.density > 8)) {
      throw new TypeError("Generated SVG density is invalid.");
    }
    const bytes = svgToBytes(svg);
    const source = Object.freeze({
      kind,
      svg,
      ...(raw.intrinsicSize === undefined ? {} : { intrinsicSize: Object.freeze({ width: (raw.intrinsicSize as { width: number }).width, height: (raw.intrinsicSize as { height: number }).height }) }),
      ...(raw.density === undefined ? {} : { density: raw.density as number }),
    });
    return {
      source,
      adapterSource: Object.freeze({ kind: "bytes", mimeType: "image/svg+xml", bytes }),
      identity: JSON.stringify(["generated-svg", bytesKey(bytes)]),
    };
  }
  if (kind === "document-resource") {
    const raw = ownDataRecord(value, ["kind", "documentId", "descriptor"], "Document image source");
    const documentId = boundedString(raw.documentId, "Image document id", 256);
    const descriptor = snapshotDocumentDescriptor(raw.descriptor);
    if (!documents.isActive(documentId, descriptor)) throw new TypeError("Document image resource is not active for this document.");
    const bytes = documents.resolve(documentId, descriptor);
    if (!bytes) throw new TypeError("Document image resource cannot be resolved.");
    if (!allowedBinaryTypes.has(descriptor.mimeType)) throw new TypeError("Document image MIME type is unsupported.");
    if (descriptor.mimeType === "image/svg+xml") sanitiseSVGMarkup(new TextDecoder().decode(bytes), "Document SVG image");
    const source = Object.freeze({ kind, documentId, descriptor }) as RuntimeImageSource;
    return {
      source,
      adapterSource: Object.freeze({ kind: "bytes", mimeType: descriptor.mimeType as "image/png", bytes }),
      identity: JSON.stringify(["document", documentId, descriptor.leaseId, descriptor.generation]),
      documentLease: Object.freeze({ documentId, descriptor }),
    };
  }
  throw new TypeError("Image source kind is unsupported.");
}

function assertDocumentLeaseActive(normalised: NormalisedImageSource, documents: DocumentResourceService): void {
  if (!normalised.documentLease) return;
  if (!documents.isActive(normalised.documentLease.documentId, normalised.documentLease.descriptor)) {
    throw abortError("Document image resource is no longer active.");
  }
}

interface InspectedDecodedImageLease extends RuntimeDecodedImageLease {
  /** Exact private adapter capability; never exposed through RuntimeImageResource. */
  readonly adapterLease: RuntimeDecodedImageLease;
}

function inspectLease(value: RuntimeDecodedImageLease): InspectedDecodedImageLease {
  const raw = ownDataRecord(value, ["src", "intrinsicSize", "density", "byteLength", "corsClean", "release", ...(Object.prototype.hasOwnProperty.call(value, "sourceOrientation") ? ["sourceOrientation"] : []), ...(Object.prototype.hasOwnProperty.call(value, "sourceICCProfile") ? ["sourceICCProfile"] : [])], "Decoded image lease");
  const size = ownDataRecord(raw.intrinsicSize, ["width", "height"], "Decoded image size");
  const width = size.width; const height = size.height; const density = raw.density; const byteLength = raw.byteLength;
  if (typeof raw.src !== "string" || raw.src.length === 0 || raw.src.length > 4096 || (!raw.src.startsWith("blob:") && !raw.src.startsWith("/") && !/^https?:\/\//i.test(raw.src)) || /[\u0000-\u001f\u007f]/.test(raw.src) || typeof raw.release !== "function" || typeof raw.corsClean !== "boolean") throw new TypeError("Decoded image lease is invalid.");
  if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > maximumDecodedPixels) throw new RangeError("Decoded image dimensions are invalid.");
  if (typeof density !== "number" || !Number.isFinite(density) || density < 0.125 || density > 8) throw new RangeError("Decoded image density is invalid.");
  if ("sourceOrientation" in raw && (!Number.isSafeInteger(raw.sourceOrientation) || (raw.sourceOrientation as number) < 1 || (raw.sourceOrientation as number) > 8)) throw new RangeError("Decoded image source orientation is invalid.");
  if ("sourceICCProfile" in raw) {
    const profile = raw.sourceICCProfile;
    // Encoded length is not an upper bound for a PNG's compressed iCCP profile.
    if (!(profile instanceof Uint8Array) || Object.getPrototypeOf(profile) !== Uint8Array.prototype || profile.byteLength < 132 || profile.byteLength > 4 * 1024 * 1024) throw new TypeError("Decoded image source ICC profile exceeds the bounded size.");
    const view = new DataView(profile.buffer, profile.byteOffset, profile.byteLength);
    if (view.getUint32(0) !== profile.byteLength || profile[36] !== 97 || profile[37] !== 99 || profile[38] !== 115 || profile[39] !== 112) throw new TypeError("Decoded image source ICC header is invalid.");
  }
  if (!Number.isSafeInteger(byteLength) || (byteLength as number) < 0 || (byteLength as number) > maximumImageBytes) throw new RangeError("Decoded image byte length is invalid.");
  return Object.freeze({
    src: raw.src,
    intrinsicSize: Object.freeze({ width, height }),
    density,
    ...("sourceOrientation" in raw ? { sourceOrientation: raw.sourceOrientation as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 } : {}),
    ...("sourceICCProfile" in raw ? { sourceICCProfile: intrinsicUint8ArraySlice.call(raw.sourceICCProfile) as Uint8Array } : {}),
    byteLength: byteLength as number,
    corsClean: raw.corsClean,
    release: () => (raw.release as () => void).call(value),
    adapterLease: value,
  });
}

function releaseRejectedLease(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const release = Object.getOwnPropertyDescriptor(value, "release");
  if (release && Object.prototype.hasOwnProperty.call(release, "value") && typeof release.value === "function") {
    try { release.value.call(value); } catch { /* rejection remains authoritative */ }
  }
}

function adapterSourcesEqual(left: RuntimeImageAdapterSource, right: RuntimeImageAdapterSource): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "url" && right.kind === "url") return left.url === right.url && left.cors === right.cors;
  if (left.kind !== "bytes" || right.kind !== "bytes" || left.mimeType !== right.mimeType || left.bytes.byteLength !== right.bytes.byteLength) return false;
  for (let index = 0; index < left.bytes.byteLength; index += 1) if (left.bytes[index] !== right.bytes[index]) return false;
  return true;
}

function adapterSourceForDecode(source: RuntimeImageAdapterSource): RuntimeImageAdapterSource {
  if (source.kind !== "bytes") return source;
  return Object.freeze({ kind: "bytes", mimeType: source.mimeType, bytes: intrinsicUint8ArraySlice.call(source.bytes) as Uint8Array });
}

interface ImageActivation {
  readonly generation: number;
  readonly controller: AbortController;
  promise: Promise<InspectedDecodedImageLease>;
  references: number;
  operationActive: boolean;
  adapterWorkActive: boolean;
  authorised: boolean;
  readonly publications: Set<ImageResourcePublication>;
}

interface ImageResourcePublication {
  invalidate(): void;
  dispose(): void;
}

interface Entry {
  readonly key: string;
  readonly source: RuntimeImageAdapterSource;
  readonly canonicalSource: RuntimeImageSource;
  readonly normalised: NormalisedImageSource;
  readonly subject: RuntimeImagePolicySubject;
  lease: InspectedDecodedImageLease | null;
  cacheResident: boolean;
  cacheKey: string | null;
  activation: ImageActivation | null;
  nextGeneration: number;
  invalidated: boolean;
}

export function createRuntimeImageService(options: {
  readonly runtimeId: RuntimeImageService["runtimeId"];
  readonly signal: AbortSignal;
  readonly adapterLease?: RuntimeImageAdapterLease;
  readonly caches: RuntimeCacheRegistry;
  readonly documents: DocumentResourceService;
  readonly randomUUID: () => string;
  readonly authorise: (request: RuntimeImagePolicyRequest, signal: AbortSignal) => boolean | Promise<boolean>;
  readonly resources?: RuntimeResourceLedger;
  /** The site's origin; an `app-asset` may name its file by an absolute URL on it. */
  readonly origin?: string | null;
}): RuntimeImageService {
  const active = new Map<string, Entry>();
  const entries = new Set<Entry>();
  const livePublications = new Set<ImageResourcePublication>();
  const cacheLookup = new Map<string, string>();
  const handles = new WeakMap<RuntimeImageResource, Readonly<{ entry: Entry; activation: ImageActivation }>>();
  let disposed = false;
  let activeOperations = 0;
  let graphicsIssuerSequence = 0;
  const cache: RuntimeCache<string, Entry> = options.caches.create("runtime.images.decoded", {
    resourceKind: "decoded-image",
    maxEntries: 64,
    maxWeight: 32 * 1024 * 1024,
    weightOf: (entry) => entry.lease?.byteLength ?? 0,
    onEvict(entry, cacheKey) {
      entry.cacheResident = false;
      if (cacheLookup.get(entry.key) === cacheKey) cacheLookup.delete(entry.key);
      if ((entry.activation?.references ?? 0) === 0) {
        entry.lease?.release();
        entry.lease = null;
        entries.delete(entry);
      }
    },
  });
  // Decoded images pinned by leases or in-flight work are active residency.
  // The entry is also the decoded cache's value, so a cached image that is
  // leased is counted once, as active.
  const unregisterAccounting = options.resources?.register({
    id: "runtime.images.active",
    kind: "decoded-image",
    owner: "runtime",
    *measure() {
      for (const entry of entries) {
        const bytes = entry.lease?.byteLength ?? 0;
        if (bytes > 0 && ((entry.activation?.references ?? 0) > 0 || entry.activation?.operationActive)) yield { key: entry, bytes, state: "active" as const };
      }
    },
  });
  const assertLive = (signal?: AbortSignal) => {
    signal?.throwIfAborted(); options.signal.throwIfAborted();
    if (disposed) throw abortError("Image service disposed.");
  };
  const startActivation = (entry: Entry, run: (activation: ImageActivation) => Promise<InspectedDecodedImageLease>): ImageActivation => {
    const controller = new AbortController();
    const abortRuntime = () => controller.abort(options.signal.reason ?? abortError("Runtime disposed."));
    options.signal.addEventListener("abort", abortRuntime, { once: true });
    entry.nextGeneration += 1;
    const activation: ImageActivation = {
      generation: entry.nextGeneration,
      controller,
      promise: Promise.resolve(null as never),
      references: 0,
      operationActive: true,
      adapterWorkActive: false,
      authorised: false,
      publications: new Set(),
    };
    entry.activation = activation;
    active.set(entry.key, entry);
    activeOperations += 1;
    activation.promise = Promise.resolve()
      .then(() => run(activation))
      .finally(() => {
        options.signal.removeEventListener("abort", abortRuntime);
        activation.operationActive = false;
        activeOperations -= 1;
        if (activation.references === 0) {
          if (entry.activation === activation) {
            entry.activation = null;
            active.delete(entry.key);
          }
          if (!entry.lease && !entry.cacheResident) entries.delete(entry);
        }
      });
    return activation;
  };
  const unsubscribeDocumentInvalidation = options.documents.subscribeInvalidation((invalidation) => {
    for (const entry of [...entries]) {
      const documentLease = entry.normalised.documentLease;
      if (!documentLease || documentLease.documentId !== invalidation.documentId ||
        documentLease.descriptor.leaseId !== invalidation.descriptor.leaseId ||
        documentLease.descriptor.generation !== invalidation.descriptor.generation ||
        documentLease.descriptor.resourceId !== invalidation.descriptor.resourceId) continue;
      entry.invalidated = true;
      const activation = entry.activation;
      for (const publication of activation?.publications ?? []) publication.invalidate();
      activation?.controller.abort(abortError("Document image resource was invalidated."));
      entry.activation = null;
      active.delete(entry.key);
      if (entry.cacheResident && entry.cacheKey) cache.delete(entry.cacheKey);
      else {
        entry.lease?.release();
        entry.lease = null;
        entries.delete(entry);
      }
    }
  });
  const service: RuntimeImageService = {
    runtimeId: options.runtimeId,
    createGraphicsIdentifierIssuer() {
      assertLive();
      const runtimeNonce = boundedString(options.randomUUID(), "Graphics runtime nonce", 256);
      if (!/^[A-Za-z0-9_-]+$/.test(runtimeNonce)) throw new TypeError("Graphics runtime nonce is invalid.");
      graphicsIssuerSequence += 1;
      const issuerSequence = graphicsIssuerSequence;
      let viewSequence = 0;
      return createOwnedGFXIdentifierIssuer(() => {
        assertLive();
        const viewNonce = boundedString(options.randomUUID(), "Graphics view nonce", 256);
        if (!/^[A-Za-z0-9_-]+$/.test(viewNonce)) throw new TypeError("Graphics view nonce is invalid.");
        viewSequence += 1;
        const view = viewSequence;
        let definitionSequence = 0;
        return () => {
          assertLive();
          if (definitionSequence >= 10_000) throw new RangeError("Graphics definition identifier limit exceeded.");
          definitionSequence += 1;
          return `nse-graphics-${runtimeNonce}-${issuerSequence}-${viewNonce}-${view}-${definitionSequence}`;
        };
      });
    },
    load(request: RuntimeImageLoadRequest) {
      assertLive();
      const raw = ownDataRecord(request, ["subject", "source", "accessibleLabel", "renderingMode", "tintColour", "capInsets", "resizingMode"].filter((key) => Object.prototype.hasOwnProperty.call(request, key)), "Image load request");
      const subject = normaliseSubject(raw.subject);
      if (subject.capability !== "image.decode") throw new TypeError("Image loading requires image.decode capability.");
      const normalised = normaliseSource(raw.source, options.documents, options.origin ?? null);
      const label = raw.accessibleLabel === undefined ? "" : boundedString(raw.accessibleLabel, "Image accessible label", 1024);
      const renderingMode = normaliseRenderingMode(raw.renderingMode);
      const tintColour = normaliseTintColour(raw.tintColour);
      const capInsets = normaliseCapInsets(raw.capInsets);
      const resizingMode = normaliseResizingMode(raw.resizingMode);
      if (resizingMode === "cap-insets" && !capInsets) throw new TypeError("Cap-inset resizing requires cap insets.");
      const subjectKey = JSON.stringify([subject.appId, subject.windowControllerId ?? null, subject.documentId ?? null, subject.capability]);
      const baseKey = `${subjectKey}|${normalised.identity}`;
      let key = baseKey;
      let collision = 0;
      let entry: Entry | undefined;
      let reactivated = false;
      while (!entry) {
        const activeEntry = active.get(key);
        if (activeEntry) {
          if (adapterSourcesEqual(activeEntry.source, normalised.adapterSource)) entry = activeEntry;
          else key = `${baseKey}|collision:${++collision}`;
          continue;
        }
        const cachedKey = cacheLookup.get(key);
        const cachedEntry = cachedKey ? cache.get(cachedKey) : undefined;
        if (cachedEntry) {
          if (adapterSourcesEqual(cachedEntry.source, normalised.adapterSource)) {
            if (active.size >= 64) throw new RangeError("Runtime image entry limit exceeded.");
            entry = cachedEntry;
            active.set(key, cachedEntry);
            reactivated = true;
          } else key = `${baseKey}|collision:${++collision}`;
          continue;
        }
        if (cachedKey) cacheLookup.delete(key);
        break;
      }
      if (!entry) {
        if (active.size >= 64) throw new RangeError("Runtime image entry limit exceeded.");
        if (activeOperations >= maximumActiveOperations) throw new RangeError("Runtime image operation limit exceeded.");
        if (!options.adapterLease) throw new Error("No image adapter is available.");
        entry = { key, source: normalised.adapterSource, canonicalSource: normalised.source, normalised, subject, lease: null, cacheResident: false, cacheKey: null, activation: null, nextGeneration: 0, invalidated: false };
        entries.add(entry);
        const ownedEntry = entry;
        startActivation(entry, (activation) => Promise.resolve()
          .then(() => options.authorise(Object.freeze({ subject, source: normalised.source, operation: "decode" }), activation.controller.signal))
          .then((allowed) => {
            activation.controller.signal.throwIfAborted();
            if (allowed !== true) { const error = new Error("Image decode is not authorised."); error.name = "SecurityError"; throw error; }
            assertDocumentLeaseActive(normalised, options.documents);
            activation.adapterWorkActive = true;
            try {
              return Promise.resolve(options.adapterLease!.adapter.decode(Object.freeze({ cacheKey: key, source: adapterSourceForDecode(normalised.adapterSource), signal: activation.controller.signal })))
                .finally(() => { activation.adapterWorkActive = false; });
            } catch (error) {
              activation.adapterWorkActive = false;
              throw error;
            }
          })
          .then((candidate) => {
            let lease: InspectedDecodedImageLease;
            try { lease = inspectLease(candidate); } catch (error) { releaseRejectedLease(candidate); throw error; }
            try { assertDocumentLeaseActive(normalised, options.documents); }
            catch (error) { lease.release(); throw error; }
            if (disposed || activation.controller.signal.aborted || activation.references === 0 || ownedEntry.activation !== activation || active.get(key) !== ownedEntry || ownedEntry.invalidated) { lease.release(); throw abortError("Image decode no longer has an owner."); }
            let activeBytes = 0;
            for (const current of entries) activeBytes += current.lease?.byteLength ?? 0;
            if (activeBytes + lease.byteLength > maximumActiveDecodedBytes) { lease.release(); throw new RangeError("Runtime decoded-image byte limit exceeded."); }
            ownedEntry.lease = lease;
            ownedEntry.cacheKey = `${key}|cors-clean:${lease.corsClean ? "yes" : "no"}`;
            ownedEntry.cacheResident = cache.set(ownedEntry.cacheKey, ownedEntry);
            if (ownedEntry.cacheResident) cacheLookup.set(key, ownedEntry.cacheKey);
            activation.authorised = true;
            return lease;
          }));
      } else if (reactivated) {
        if (activeOperations >= maximumActiveOperations) {
          active.delete(entry.key);
          throw new RangeError("Runtime image operation limit exceeded.");
        }
        const ownedEntry = entry;
        startActivation(entry, (activation) => Promise.resolve()
          .then(() => options.authorise(Object.freeze({ subject, source: ownedEntry.canonicalSource, operation: "decode" }), activation.controller.signal))
          .then((allowed) => {
            assertLive(activation.controller.signal);
            if (allowed !== true) { const error = new Error("Image decode is not authorised."); error.name = "SecurityError"; throw error; }
            assertDocumentLeaseActive(ownedEntry.normalised, options.documents);
            if (activation.references === 0 || ownedEntry.activation !== activation || active.get(ownedEntry.key) !== ownedEntry || !ownedEntry.lease || !ownedEntry.cacheResident || ownedEntry.invalidated) throw abortError("Cached image lost its owning lease.");
            activation.authorised = true;
            return ownedEntry.lease;
          }));
      }
      const ownedEntry = entry;
      const ownedActivation = ownedEntry.activation;
      if (!ownedActivation) throw abortError("Image activation is unavailable.");
      if (ownedActivation.controller.signal.aborted && ownedActivation.adapterWorkActive) {
        throw abortError("Image decode cancellation is still settling.");
      }
      ownedActivation.references += 1;
      let state: RuntimeImageResource["state"] = ownedEntry.lease && ownedActivation.authorised && !ownedActivation.operationActive ? "ready" : "loading";
      let revision = 0;
      let released = false;
      const listeners = new Set<() => void>();
      const publish = () => {
        revision += 1;
        for (const listener of [...listeners]) {
          try { listener(); } catch { /* resource state remains authoritative */ }
        }
      };
      const setState = (next: RuntimeImageResource["state"]) => {
        if (released || state === next) return;
        state = next;
        publish();
      };
      const publication: ImageResourcePublication = {
        invalidate: () => setState("failed"),
        dispose: () => {
          if (!released) { state = "released"; released = true; publish(); }
          listeners.clear();
          ownedActivation.publications.delete(publication);
          livePublications.delete(publication);
        },
      };
      ownedActivation.publications.add(publication);
      livePublications.add(publication);
      const ready = ownedActivation.promise.then(() => {
        if (released || ownedEntry.invalidated || ownedEntry.activation !== ownedActivation || !ownedActivation.authorised) throw abortError("Image resource lost its activation.");
        setState("ready");
      }, (error) => { setState("failed"); throw error; });
      const resource: RuntimeImageResource = Object.freeze({
        get state() { return released ? "released" : ownedEntry.invalidated ? "failed" : state; },
        get revision() { return revision; },
        get src() { return !released && !ownedEntry.invalidated && state === "ready" && ownedEntry.activation === ownedActivation && ownedActivation.authorised && ownedEntry.lease ? ownedEntry.lease.src : ""; },
         get intrinsicSize() {
           if (released || ownedEntry.invalidated || state !== "ready" || ownedEntry.activation !== ownedActivation || !ownedActivation.authorised) return null;
           return ownedEntry.normalised.source.kind === "generated-svg"
             ? ownedEntry.normalised.source.intrinsicSize ?? ownedEntry.lease?.intrinsicSize ?? null
             : ownedEntry.lease?.intrinsicSize ?? null;
         },
         get density() {
           if (released || ownedEntry.invalidated || state !== "ready" || ownedEntry.activation !== ownedActivation || !ownedActivation.authorised) return null;
           return ownedEntry.normalised.source.kind === "generated-svg"
             ? ownedEntry.normalised.source.density ?? ownedEntry.lease?.density ?? null
             : ownedEntry.lease?.density ?? null;
         },
         get sourceOrientation() {
           if (released || ownedEntry.invalidated || state !== "ready" || ownedEntry.activation !== ownedActivation || !ownedActivation.authorised) return null;
           return ownedEntry.lease?.sourceOrientation ?? null;
         },
         get sourceICCProfile() {
           if (released || ownedEntry.invalidated || state !== "ready" || ownedEntry.activation !== ownedActivation || !ownedActivation.authorised) return null;
           const profile = ownedEntry.lease?.sourceICCProfile;
           return profile ? intrinsicUint8ArraySlice.call(profile) as Uint8Array : null;
         },
        accessibleLabel: label,
        renderingMode,
        tintColour,
        capInsets,
        resizingMode,
        ready,
        subscribe(listener: () => void) {
          if (typeof listener !== "function") throw new TypeError("An image resource listener is required.");
          if (released) return () => undefined;
          listeners.add(listener);
          let subscribed = true;
          return () => {
            if (!subscribed) return;
            subscribed = false;
            listeners.delete(listener);
          };
        },
        release() {
          if (released) return;
          state = "released"; released = true; publish(); listeners.clear();
          ownedActivation.publications.delete(publication);
          livePublications.delete(publication);
          ownedActivation.references -= 1;
          if (ownedActivation.references !== 0) return;
          ownedActivation.controller.abort(abortError("Image activation lost its last owner."));
          if (ownedActivation.adapterWorkActive) return;
          if (ownedEntry.activation === ownedActivation) {
            ownedEntry.activation = null;
            active.delete(ownedEntry.key);
          }
          if (ownedEntry.lease) {
            if (ownedEntry.cacheResident && ownedEntry.normalised.documentLease &&
              !options.documents.isActive(ownedEntry.normalised.documentLease.documentId, ownedEntry.normalised.documentLease.descriptor) && ownedEntry.cacheKey) {
              cache.delete(ownedEntry.cacheKey);
            } else if (!ownedEntry.cacheResident) { ownedEntry.lease.release(); ownedEntry.lease = null; entries.delete(ownedEntry); }
          } else if (!ownedEntry.cacheResident) entries.delete(ownedEntry);
        },
      });
      handles.set(resource, Object.freeze({ entry: ownedEntry, activation: ownedActivation }));
      return resource;
    },
    whenActivationSettled(resource) {
      const ownership = handles.get(resource);
      if (!ownership) throw new TypeError("Image resource is not owned by this runtime.");
      return ownership.activation.promise.then(() => undefined, () => undefined);
    },
    async readPixels(resource, signal) {
      assertLive(signal);
      const ownership = handles.get(resource);
      if (!ownership || resource.state === "released") throw new TypeError("Image resource is not owned by this runtime.");
      const { entry, activation } = ownership;
      await resource.ready;
      assertLive(signal);
      assertDocumentLeaseActive(entry.normalised, options.documents);
      if (!entry.lease?.corsClean) { const error = new Error("Image pixels are not CORS-clean."); error.name = "SecurityError"; throw error; }
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason ?? options.signal.reason ?? abortError("Image export aborted."));
      signal?.addEventListener("abort", abort, { once: true }); options.signal.addEventListener("abort", abort, { once: true }); activation.controller.signal.addEventListener("abort", abort, { once: true });
      try {
        const exportSubject = Object.freeze({ ...entry.subject, capability: "image.export" as const });
        const allowed = await options.authorise(Object.freeze({ subject: exportSubject, source: entry.canonicalSource, operation: "export" }), controller.signal);
        controller.signal.throwIfAborted();
        if (allowed !== true) { const error = new Error("Image export is not authorised."); error.name = "SecurityError"; throw error; }
        assertDocumentLeaseActive(entry.normalised, options.documents);
        if (activation.references <= 0 || entry.activation !== activation || !activation.authorised || active.get(entry.key) !== entry || !entry.lease || handles.get(resource) !== ownership) throw abortError("Image export lost its owning resource.");
        const adapter = options.adapterLease!.adapter;
        if (!adapter.readPixels) throw new DOMException("Image adapter does not support owned pixel access.", "NotSupportedError");
        const pixels = await adapter.readPixels(entry.lease.adapterLease, controller.signal);
        controller.signal.throwIfAborted();
        assertDocumentLeaseActive(entry.normalised, options.documents);
        if (activation.references <= 0 || entry.activation !== activation || !activation.authorised || active.get(entry.key) !== entry || !entry.lease || handles.get(resource) !== ownership || resource.state !== "ready") throw abortError("Pixel read lost its owning resource.");
        if (!(pixels instanceof GFXImage)) throw new TypeError("Image adapter returned invalid owned pixels.");
        return pixels;
      }
      finally { signal?.removeEventListener("abort", abort); options.signal.removeEventListener("abort", abort); activation.controller.signal.removeEventListener("abort", abort); }
    },
    async export(resource, format, signal) {
      assertLive(signal);
      const ownership = handles.get(resource);
      if (!ownership || resource.state === "released") throw new TypeError("Image resource is not owned by this runtime.");
      const { entry, activation } = ownership;
      await resource.ready;
      assertLive(signal);
      assertDocumentLeaseActive(entry.normalised, options.documents);
      if (!entry.lease?.corsClean) { const error = new Error("Image pixels are not CORS-clean."); error.name = "SecurityError"; throw error; }
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason ?? options.signal.reason ?? abortError("Image export aborted."));
      signal?.addEventListener("abort", abort, { once: true }); options.signal.addEventListener("abort", abort, { once: true }); activation.controller.signal.addEventListener("abort", abort, { once: true });
      try {
        const exportSubject = Object.freeze({ ...entry.subject, capability: "image.export" as const });
        const allowed = await options.authorise(Object.freeze({ subject: exportSubject, source: entry.canonicalSource, operation: "export" }), controller.signal);
        controller.signal.throwIfAborted();
        if (allowed !== true) { const error = new Error("Image export is not authorised."); error.name = "SecurityError"; throw error; }
        assertDocumentLeaseActive(entry.normalised, options.documents);
        if (activation.references <= 0 || entry.activation !== activation || !activation.authorised || active.get(entry.key) !== entry || !entry.lease || handles.get(resource) !== ownership) throw abortError("Image export lost its owning resource.");
        const bytes = await options.adapterLease!.adapter.export(entry.lease.adapterLease, format, controller.signal);
        controller.signal.throwIfAborted();
        assertDocumentLeaseActive(entry.normalised, options.documents);
        if (activation.references <= 0 || entry.activation !== activation || !activation.authorised || active.get(entry.key) !== entry || !entry.lease || handles.get(resource) !== ownership || resource.state !== "ready") throw abortError("Image export lost its owning resource.");
        return copyImageBytes(bytes, "Image export bytes");
      }
      finally { signal?.removeEventListener("abort", abort); options.signal.removeEventListener("abort", abort); activation.controller.signal.removeEventListener("abort", abort); }
    },
    diagnostics(): RuntimeImageDiagnostics {
      let references = 0; let bytes = 0;
      for (const entry of active.values()) references += entry.activation?.references ?? 0;
      for (const entry of entries) bytes += entry.lease?.byteLength ?? 0;
      return Object.freeze({ activeOperationCount: activeOperations, activeReferenceCount: references, decodedEntryCount: Array.from(entries).filter((entry) => entry.lease).length, decodedByteCount: bytes });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unregisterAccounting?.();
      unsubscribeDocumentInvalidation();
      const publications = [...livePublications];
      livePublications.clear();
      for (const publication of publications) publication.dispose();
      for (const entry of entries) {
        entry.activation?.publications.clear();
        entry.activation?.controller.abort(abortError("Image service disposed."));
        entry.activation = null; entry.lease?.release(); entry.lease = null;
      }
      active.clear(); cache.dispose(); entries.clear(); cacheLookup.clear(); options.adapterLease?.release();
    },
  };
  return service;
}
