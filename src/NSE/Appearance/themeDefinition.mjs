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

/** Capture descriptors without executing accessors. This is static data, not an extension API. */
function capture(value, path, ancestors = new Set(), depth = 0) {
  if (depth > 24) throw new TypeError(`${path} exceeds the nesting limit.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null) throw new TypeError(`${path} must contain only static data.`);
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must be a plain data object.`);
  if (ancestors.has(value)) throw new TypeError(`${path} must not contain cycles.`);
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length > 16384) throw new TypeError(`${path} exceeds its item limit.`);
  const result = array ? [] : Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (array && key === "length") continue;
    if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) throw new TypeError(`${path} contains an unsupported key.`);
    if (array && !/^(0|[1-9][0-9]*)$/.test(key)) throw new TypeError(`${path} contains an unsupported array property.`);
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || !descriptor.enumerable) throw new TypeError(`${path}.${key} must be an enumerable data property.`);
    result[key] = capture(descriptor.value, `${path}.${key}`, ancestors, depth + 1);
  }
  if (array && Object.keys(result).length !== value.length) throw new TypeError(`${path} must not be sparse.`);
  ancestors.delete(value);
  return Object.freeze(result);
}
function record(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  if (keys) for (const key of Object.keys(value)) if (!keys.includes(key)) throw new TypeError(`${label}.${key} is unsupported.`);
  return value;
}
function text(value, label) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new TypeError(`${label} must be nonblank text without surrounding whitespace.`);
  return value;
}
function choice(value, label, choices) {
  if (typeof value !== "string" || !choices.includes(value)) throw new TypeError(`${label} must be one of ${choices.join(", ")}.`);
}
function number(value, label, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new TypeError(`${label} must be between ${min} and ${max}.`);
}
function navigation(value, label) {
  const item = record(value, label, ["kind", "placement", "flow", "content", "overflow", "selectedHeaderAlignment"]);
  choice(item.kind, `${label}.kind`, ["tab-strip", "source-list", "panorama"]);
  choice(item.placement, `${label}.placement`, ["block-start", "block-end", "inline-start"]);
  choice(item.flow, `${label}.flow`, ["in-flow", "overlay"]);
  choice(item.content, `${label}.content`, ["icon-and-label", "label"]);
  if ((item.kind === "source-list") !== (item.placement === "inline-start")) throw new TypeError(`${label} has an unsupported kind/placement combination.`);
  if (item.kind === "source-list" && item.flow !== "in-flow") throw new TypeError(`${label} source lists must be in-flow.`);
  const overflow = record(item.overflow, `${label}.overflow`, ["kind", "maximumVisibleItems"]);
  choice(overflow.kind, `${label}.overflow.kind`, ["more", "scroll"]);
  if (item.kind === "panorama" && (item.placement !== "block-start" || item.flow !== "in-flow" || overflow.kind !== "scroll")) throw new TypeError(`${label} panorama requires block-start, in-flow, scrolling navigation.`);
  if (item.selectedHeaderAlignment !== undefined) {
    choice(item.selectedHeaderAlignment, `${label}.selectedHeaderAlignment`, ["nearest", "start"]);
    if (item.kind !== "tab-strip" || overflow.kind !== "scroll") throw new TypeError(`${label} header alignment requires a scrolling tab strip.`);
  }
  if (overflow.kind === "more") {
    number(overflow.maximumVisibleItems, `${label} visible items`, 2, 20);
    if (!Number.isInteger(overflow.maximumVisibleItems)) throw new TypeError(`${label} visible items must be integral.`);
  } else if ("maximumVisibleItems" in overflow) throw new TypeError(`${label} scroll overflow does not take a visible-item limit.`);
}
const defaultPresentation = {
  peerNavigation: {
    compact: { kind: "tab-strip", placement: "block-start", flow: "in-flow", content: "icon-and-label", overflow: { kind: "scroll" } },
    regular: { kind: "source-list", placement: "inline-start", flow: "in-flow", content: "icon-and-label", overflow: { kind: "scroll" } },
  },
  chrome: "continuous", login: "plain", tabStyle: "plain", metrics: { navigation: { barBlockSize: 48, edgeGap: 0 } },
};
const none = { kind: "none", durationMs: 0, easing: "ease-out" };
export function defineNSETheme(definition) {
  const input = record(capture(definition, "Theme"), "Theme", ["id", "displayName", "recipes", "tokens", "presentation", "metadata", "styleTokenNames"]);
  const id = text(input.id, "Theme.id"), displayName = text(input.displayName, "Theme.displayName");
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id)) throw new TypeError("Theme.id must be a lowercase reverse-DNS identifier.");
  const recipes = input.recipes === undefined ? [] : input.recipes;
  if (!Array.isArray(recipes)) throw new TypeError("Theme.recipes must be an array.");
  const slots = new Set(), ids = new Set();
  for (const value of recipes) {
    const recipe = record(value, "Theme recipe", ["slot", "recipeId"]);
    const slot = text(recipe.slot, "Theme recipe slot"), recipeId = text(recipe.recipeId, "Theme recipe id");
    if (/\.\d+(?:\.\d+)?x$/.test(slot)) throw new TypeError("Semantic slots must not contain artwork pixel scale; use CSS image-set for resources.");
    if (slots.has(slot) || ids.has(recipeId)) throw new TypeError("Theme recipe slot or id is duplicated.");
    slots.add(slot); ids.add(recipeId);
  }
  const styleTokenNames = input.styleTokenNames === undefined ? [] : input.styleTokenNames;
  if (!Array.isArray(styleTokenNames) || styleTokenNames.length > 8192 || new Set(styleTokenNames).size !== styleTokenNames.length) throw new TypeError("Theme styleTokenNames must be a bounded unique array.");
  for (const name of styleTokenNames) if (typeof name !== "string" || !/^--nse-[a-z][a-z0-9-]*$/.test(name)) throw new TypeError("Theme styleTokenNames must contain only --nse-* custom-property names.");
  const tokens = record(input.tokens === undefined ? { light: {}, dark: {} } : input.tokens, "Theme.tokens", ["common", "light", "dark"]);
  for (const mode of ["light", "dark", ...(tokens.common !== undefined ? ["common"] : [])]) {
    for (const [key, value] of Object.entries(record(tokens[mode], `Theme.tokens.${mode}`))) {
      if (!/^--nse-[a-z][a-z0-9-]*$/.test(key)) throw new TypeError(`Invalid theme token ${key}.`);
      if (/^--nse-font-(?:body|label|title|monospace)$/.test(key)) throw new TypeError(`Use --nse-theme-font-* for theme font defaults.`);
      if (typeof value !== "string" && typeof value !== "number") throw new TypeError(`Theme token ${key} must be text or a finite number.`);
      if (typeof value === "string") {
        // Tokens are scalar paint/math data. Resource-bearing CSS belongs in the
        // package stylesheet, where the resource AST and paths are validated.
        const functions = new Set(["var", "env", "calc", "min", "max", "clamp", "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix", "light-dark", "linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient"]);
        if (!value.trim() || /[;{}\\'"@]|\/\*/.test(value)
          || [...value.matchAll(/([a-z_-][a-z0-9_-]*)\s*\(/gi)].some(match => !functions.has(match[1].toLowerCase()))) {
          throw new TypeError(`Theme token ${key} contains unsupported CSS.`);
        }
      }
    }
  }
  const presentation = record(input.presentation === undefined ? defaultPresentation : input.presentation, "Theme.presentation", ["peerNavigation", "chrome", "login", "tabStyle", "metrics", "motion"]);
  const peer = record(presentation.peerNavigation, "Theme peerNavigation", ["compact", "regular"]);
  navigation(peer.compact, "compact navigation"); navigation(peer.regular, "regular navigation");
  choice(presentation.chrome, "Theme chrome", ["continuous", "rail-aligned"]);
  choice(presentation.login, "Theme login", ["plain", "ornamented"]);
  choice(presentation.tabStyle, "Theme tabStyle", ["plain", "layered"]);
  const metrics = record(record(presentation.metrics, "Theme metrics", ["navigation"]).navigation, "Navigation metrics", ["barBlockSize", "edgeGap"]);
  number(metrics.barBlockSize, "Navigation barBlockSize", 32, 160); number(metrics.edgeGap, "Navigation edgeGap", 0, 48);
  const inputMotion = record(presentation.motion === undefined ? {} : presentation.motion, "Theme motion", ["peerNavigation", "login", "shell", "overlay"]), motion = {};
  for (const [name, kinds, maximum] of [["peerNavigation", ["none", "slide", "fade"], 500], ["login", ["none", "slide", "fade", "swing"], 1500], ["shell", ["none", "slide", "fade", "depth"], 1500], ["overlay", ["none", "slide", "fade", "bounce"], 1500]]) {
    const value = record(inputMotion[name] === undefined ? none : inputMotion[name], `${name} transition`, ["kind", "durationMs", "easing"]);
    choice(value.kind, `${name} kind`, kinds); choice(value.easing, `${name} easing`, ["linear", "ease-out", "ease-in-out", "decelerate"]);
    number(value.durationMs, `${name} durationMs`, 0, maximum);
    if (value.kind === "none" && value.durationMs !== 0) throw new TypeError(`A disabled ${name} transition must have zero duration.`);
    motion[name] = value;
  }
  if (input.metadata !== undefined) {
    const metadata = record(input.metadata, "Theme metadata", ["version", "themeContractVersion", "supportedAppearances", "description", "author"]);
    text(metadata.version, "Theme version");
    if (metadata.themeContractVersion !== 1) throw new TypeError("Unsupported theme contract version.");
    if (!Array.isArray(metadata.supportedAppearances) || !metadata.supportedAppearances.length || new Set(metadata.supportedAppearances).size !== metadata.supportedAppearances.length) throw new TypeError("Theme supportedAppearances must be a nonempty unique array.");
    for (const mode of metadata.supportedAppearances) choice(mode, "Supported appearance", ["light", "dark"]);
    for (const key of ["description", "author"]) if (metadata[key] !== undefined) text(metadata[key], `Theme ${key}`);
  }
  return capture({ id, displayName, recipes, tokens, styleTokenNames, presentation: { ...presentation, motion }, ...(input.metadata ? { metadata: input.metadata } : {}) }, "Theme");
}
export const neutralNSETheme = defineNSETheme({ id: "com.syndromatic.neutral", displayName: "NSE" });
