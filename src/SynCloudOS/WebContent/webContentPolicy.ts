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

import type { RuntimeWebContentCapability, RuntimeWebContentSource } from "./webContentTypes";

const maximumHTMLBytes = 256 * 1024;
const allowedCapabilities = new Set<RuntimeWebContentCapability>(["forms", "scripts", "same-origin", "downloads", "popups"]);
const sandboxTokens: Readonly<Record<RuntimeWebContentCapability, string>> = Object.freeze({
  forms: "allow-forms", scripts: "allow-scripts", "same-origin": "allow-same-origin",
  downloads: "allow-downloads", popups: "allow-popups",
});

function primitiveText(value: unknown, label: string, maximum = 2_048): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) throw new TypeError(`${label} is invalid.`);
  return value;
}

function safeURL(value: unknown, baseURL: string): URL {
  const raw = primitiveText(value, "Web content URL", 8_192);
  let url: URL;
  try { url = new URL(raw, baseURL); } catch { throw new TypeError("Web content URL is invalid."); }
  const base = new URL(baseURL);
  const sameOrigin = url.origin === base.origin;
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && sameOrigin)) || url.username || url.password) {
    throw new DOMException("Web content URL is not permitted.", "SecurityError");
  }
  return url;
}

export function normaliseWebContentSource(value: unknown, baseURL: string): RuntimeWebContentSource {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("Web content source must be a plain record.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError("Web content source cannot contain symbols.");
  for (const key of keys as string[]) {
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) throw new TypeError("Web content source cannot contain accessors.");
  }
  const kind = descriptors.kind?.value;
  if (kind === "url") {
    if (keys.some((key) => key !== "kind" && key !== "url")) throw new TypeError("URL source contains unknown fields.");
    return Object.freeze({ kind: "url", url: safeURL(descriptors.url?.value, baseURL).href });
  }
  if (kind === "html") {
    if (keys.some((key) => key !== "kind" && key !== "html" && key !== "baseUrl")) throw new TypeError("HTML source contains unknown fields.");
    const html = primitiveText(descriptors.html?.value, "Web content HTML", maximumHTMLBytes);
    if (new TextEncoder().encode(html).byteLength > maximumHTMLBytes) throw new RangeError("Web content HTML exceeds the byte limit.");
    const baseUrlValue = descriptors.baseUrl?.value;
    const baseUrl = baseUrlValue === undefined ? new URL(baseURL).href : safeURL(baseUrlValue, baseURL).href;
    return Object.freeze({ kind: "html", html, baseUrl });
  }
  throw new TypeError("Web content source kind is unsupported.");
}

export function sandboxForWebContentCapabilities(value: unknown, source: RuntimeWebContentSource, runtimeOrigin: string): string {
  const canonicalSource = normaliseWebContentSource(source, new URL(runtimeOrigin).href);
  if (value === undefined) return "";
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > allowedCapabilities.size) {
    throw new TypeError("Web content capabilities must be a bounded plain array.");
  }
  const capabilities: RuntimeWebContentCapability[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || typeof descriptor.value !== "string" || !allowedCapabilities.has(descriptor.value as RuntimeWebContentCapability)) {
      throw new TypeError("Web content capability is invalid.");
    }
    if (seen.has(descriptor.value)) throw new TypeError("Web content capabilities must be unique.");
    seen.add(descriptor.value); capabilities.push(descriptor.value as RuntimeWebContentCapability);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) throw new TypeError("Web content capabilities contain hostile properties.");
  }
  if (seen.has("scripts") && seen.has("same-origin")) {
    throw new DOMException("Scripts and same-origin cannot be combined for direct web content.", "SecurityError");
  }
  return capabilities.map((capability) => sandboxTokens[capability]).sort().join(" ");
}

const allowedContainerTags = new Set(["p", "strong", "em", "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3"]);
const escapeText = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function sanitiseWebContentHTML(value: unknown, token?: string, epoch?: number, runtimeBaseURL = "https://invalid.syncloudos/"): string {
  const source = normaliseWebContentSource(value, runtimeBaseURL);
  if (source.kind !== "html") throw new TypeError("Only inline HTML sources can be sanitised.");
  const stack: string[] = [];
  let output = "";
  let offset = 0;
  let tokens = 0;
  while (offset < source.html.length) {
    if (++tokens > 10_000) throw new RangeError("Web content HTML exceeds the token limit.");
    const open = source.html.indexOf("<", offset);
    if (open < 0) { output += escapeText(source.html.slice(offset)); break; }
    output += escapeText(source.html.slice(offset, open));
    const close = source.html.indexOf(">", open + 1);
    if (close < 0) throw new TypeError("Web content HTML contains an unclosed tag.");
    const raw = source.html.slice(open + 1, close);
    let match = /^\s*\/\s*([a-z0-9]+)\s*$/.exec(raw);
    if (match) {
      const tag = match[1]!;
      if (tag === "a") throw new DOMException("Inline external navigation requires the policy-bound openExternal API.", "SecurityError");
      if (!allowedContainerTags.has(tag)) throw new DOMException("Web content HTML contains a forbidden tag.", "SecurityError");
      if (stack.pop() !== tag) throw new TypeError("Web content HTML tags must be balanced.");
      output += `</${tag}>`;
    } else if (/^\s*br\s*\/?\s*$/.test(raw)) {
      output += "<br>";
    } else if ((match = /^\s*([a-z0-9]+)\s*$/.exec(raw))) {
      const tag = match[1]!;
      if (!allowedContainerTags.has(tag)) throw new DOMException("Web content HTML contains a forbidden tag.", "SecurityError");
      if (stack.length >= 64) throw new RangeError("Web content HTML exceeds the nesting limit.");
      stack.push(tag); output += `<${tag}>`;
    } else {
      if (/^\s*a(?:\s|$)/.test(raw)) throw new DOMException("Inline external navigation requires the policy-bound openExternal API.", "SecurityError");
      throw new DOMException("Web content HTML contains forbidden markup.", "SecurityError");
    }
    offset = close + 1;
  }
  if (stack.length) throw new TypeError("Web content HTML tags must be balanced.");
  const bootstrap = token && Number.isSafeInteger(epoch)
    ? `<script>Object.freeze(window.__synCloudOSWebContent={token:${JSON.stringify(token)},navigationEpoch:${epoch}});</script>` : "";
  const scriptPolicy = bootstrap ? " script-src 'unsafe-inline';" : "";
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';${scriptPolicy} img-src 'none'; style-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"></head><body>${output}${bootstrap}</body></html>`;
  if (new TextEncoder().encode(document).byteLength > maximumHTMLBytes * 2) throw new RangeError("Sanitised web content exceeds the byte limit.");
  return document;
}
