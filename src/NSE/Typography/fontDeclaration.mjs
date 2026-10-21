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

// Pure data/compiler contract: usable in Node configuration and browser code.
const genericFamilies = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong"]);
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const namePattern = /^[^\u0000-\u001f\u007f;{}<>\\"',]{1,128}$/u;

function capture(value, depth = 0) {
  if (depth > 12) throw new TypeError("Font declaration is too deeply nested.");
  if (value === undefined || value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object" || Object.getOwnPropertySymbols(value).length) throw new TypeError("Font declaration must contain plain data.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 4096) throw new TypeError("Font declaration requires bounded plain arrays.");
    if (Object.keys(descriptors).some(key => key !== "length" && (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length))) throw new TypeError("Unsupported font array property.");
    return Object.freeze(Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[index];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError("Font arrays must be dense data without accessors.");
      return capture(descriptor.value, depth + 1);
    }));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("Font declaration requires plain objects.");
  if (Object.keys(descriptors).length > 4096) throw new TypeError("Font declaration exceeds its item limit.");
  return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => {
    if (!("value" in descriptor) || !descriptor.enumerable) throw new TypeError("Font declaration must not contain accessors or hidden properties.");
    return [key, capture(descriptor.value, depth + 1)];
  })));
}
function record(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new TypeError(`Invalid ${label}.`);
  return value;
}
function list(value, label) { if (!Array.isArray(value)) throw new TypeError(`Invalid ${label}.`); return value; }
function id(value) { if (typeof value !== "string" || !idPattern.test(value)) throw new TypeError("Invalid font identifier."); return value; }
function name(value) { if (typeof value !== "string" || !namePattern.test(value) || value.trim() !== value) throw new TypeError("Invalid font name."); return value; }
function fallback(value) { const items = list(value, "font fallback"); if (items.length > 15) throw new TypeError("Too many font fallbacks."); return Object.freeze(items.map(name)); }
function unique(map, key, value, label) { if (map.has(key)) throw new TypeError(`Duplicate ${label} ${key}.`); map.set(key, value); }
function stack(family, fallbacks) { return [family, ...fallbacks].map(value => genericFamilies.has(value) ? value : `"${value}"`).join(", "); }

/** Capture resources, named document faces, browser aliases and semantic roles once. */
export function defineFontDeclaration(input) {
  const data = record(capture(input), ["resources", "families", "aliases", "roles"], "font declaration");
  const resources = record(data.resources, Object.keys(data.resources ?? {}), "font resources");
  for (const [key, path] of Object.entries(resources)) {
    id(key);
    if (typeof path !== "string" || path.length > 512 || !path.startsWith("Resources/") || /[\\%:\u0000-\u001f\u007f"<>]/u.test(path) || path.split("/").some(segment => !segment || segment === "." || segment === "..") || !/\.(woff2?|ttf|otf)$/iu.test(path)) throw new TypeError("Invalid font resource path.");
  }
  const faces = new Map(), familyIds = new Map(), cssSelectors = new Map();
  const families = list(data.families, "font families").map(raw => {
    const family = record(raw, ["id", "label", "defaultFaceId", "fallback", "faces"], "font family");
    const familyId = id(family.id), fallbacks = fallback(family.fallback ?? []);
    unique(familyIds, familyId, family, "font family"); name(family.label);
    const presets = list(family.faces, "font faces").map(rawFace => {
      const face = record(rawFace, ["id", "label", "resource", "browserFamily", "fallback", "weight", "style", "display"], "font face");
      id(face.id); name(face.label); name(face.browserFamily);
      if (!Object.hasOwn(resources, face.resource)) throw new TypeError("Font face references an unknown resource.");
      if (!Number.isFinite(face.weight) || face.weight < 1 || face.weight > 1000) throw new TypeError("Invalid font weight.");
      if (face.style !== "normal" && face.style !== "italic") throw new TypeError("Invalid font style.");
      const display = face.display ?? "swap";
      if (!["auto", "block", "swap", "fallback", "optional"].includes(display)) throw new TypeError("Invalid font display.");
      const faceFallbacks = face.fallback === undefined ? fallbacks : fallback(face.fallback);
      const capturedFace = Object.freeze({ ...face, display, familyId, fallback: faceFallbacks });
      unique(faces, face.id, capturedFace, "font face");
      unique(cssSelectors, `${face.browserFamily}/${face.weight}/${face.style}`, face.id, "CSS font selector");
      return Object.freeze({ id: face.id, label: face.label, familyId, family: stack(face.browserFamily, faceFallbacks), weight: face.weight, style: face.style });
    });
    if (!presets.some(preset => preset.id === family.defaultFaceId)) throw new TypeError("Font family default face must belong to that family.");
    return Object.freeze({ id: familyId, label: family.label, defaultPresetId: family.defaultFaceId, presets: Object.freeze(presets) });
  });
  const aliases = list(data.aliases ?? [], "font aliases").map(raw => {
    const alias = record(raw, ["family", "faces"], "font alias"); name(alias.family);
    const aliasFaces = list(alias.faces, "alias faces");
    if (aliasFaces.length === 0) throw new TypeError("Font alias must contain a face.");
    for (const faceId of aliasFaces) {
      const face = faces.get(faceId); if (!face) throw new TypeError("Font alias references an unknown face.");
      unique(cssSelectors, `${alias.family}/${face.weight}/${face.style}`, faceId, "CSS font selector");
    }
    return alias;
  });
  const browserFamilies = new Set([...faces.values()].map(face => face.browserFamily).concat(aliases.map(alias => alias.family)));
  const preloadResources = new Set();
  const roles = record(data.roles ?? {}, Object.keys(data.roles ?? {}), "font roles");
  for (const [key, raw] of Object.entries(roles)) {
    if (!/^[a-z][a-z0-9-]{0,63}$/u.test(key)) throw new TypeError("Invalid typography role.");
    const role = record(raw, ["face", "family", "fallback", "preload"], "font role");
    if ((role.face === undefined) === (role.family === undefined)) throw new TypeError("A font role requires exactly one face or browser family.");
    if (role.face !== undefined && !faces.has(role.face)) throw new TypeError("Font role references an unknown face.");
    if (role.family !== undefined && !browserFamilies.has(role.family) && !genericFamilies.has(role.family)) throw new TypeError("Font role references an unknown browser family.");
    if (role.fallback !== undefined) fallback(role.fallback);
    for (const faceId of list(role.preload ?? [], "preloaded faces")) {
      const face = faces.get(faceId); if (!face) throw new TypeError("Font preload references an unknown face.");
      preloadResources.add(face.resource);
    }
  }
  return Object.freeze({ resources, families: Object.freeze(families), faces: Object.freeze([...faces.values()]), aliases: Object.freeze(aliases), roles, preloadResources: Object.freeze([...preloadResources]) });
}

/** Generate all browser registrations and role variables from the captured data. */
export function fontDeclarationCSS(declaration, urls, options = {}) {
  const settings = record(capture(options), ["scope", "rolePrefix"], "font CSS options");
  const scope = settings.scope ?? ":root";
  const rolePrefix = settings.rolePrefix ?? (scope === ":root" ? "--font-" : "--nse-theme-font-");
  if (typeof scope !== "string" || !scope.trim() || scope !== scope.trim() || /[{};@\u0000-\u001f\u007f]/u.test(scope)) throw new TypeError("Invalid font CSS scope.");
  if (typeof rolePrefix !== "string" || !/^--[a-z][a-z0-9-]*-$/u.test(rolePrefix)) throw new TypeError("Invalid font role prefix.");
  const faceById = new Map(declaration.faces.map(face => [face.id, face]));
  function rule(face, family) {
    const url = urls[face.resource];
    if (typeof url !== "string" || !url || /[\u0000-\u001f\u007f<>]/u.test(url)) throw new TypeError("Missing or unsafe font resource URL.");
    const format = declaration.resources[face.resource].split(".").at(-1).toLowerCase();
    return `@font-face {\n  font-family: ${JSON.stringify(family)};\n  src: url(${JSON.stringify(url)}) format("${format === "ttf" ? "truetype" : format === "otf" ? "opentype" : format}");\n  font-weight: ${face.weight};\n  font-style: ${face.style};\n  font-display: ${face.display};\n}`;
  }
  const rules = declaration.faces.map(face => rule(face, face.browserFamily));
  for (const alias of declaration.aliases) for (const faceId of alias.faces) rules.push(rule(faceById.get(faceId), alias.family));
  const variables = Object.entries(declaration.roles).map(([key, role]) => {
    const face = faceById.get(role.face);
    return `  ${rolePrefix}${key}: ${stack(role.family ?? face.browserFamily, role.fallback ?? face?.fallback ?? [])};`;
  });
  if (scope === ":root" && rolePrefix === "--font-" && declaration.roles.ui) variables.push("  font-family: var(--font-ui);");
  if (variables.length) rules.push(`${scope} {\n${variables.join("\n")}\n}`);
  return rules.join("\n\n") + "\n";
}

// Host/compiler validation of captured declarations, without executing their properties.
export function captureFontDeclaration(input) {
  const data = record(capture(input), ["resources", "families", "faces", "aliases", "roles", "preloadResources"], "captured font declaration");
  return defineFontDeclaration({ resources: data.resources, aliases: data.aliases, roles: data.roles,
    families: list(data.families, "font families").map(family => ({ id: family.id, label: family.label, defaultFaceId: family.defaultPresetId,
      faces: list(data.faces, "font faces").filter(face => face.familyId === family.id).map(face => ({
        id: face.id, label: face.label, resource: face.resource, browserFamily: face.browserFamily, fallback: face.fallback, weight: face.weight, style: face.style, display: face.display,
      })),
    })),
  });
}
