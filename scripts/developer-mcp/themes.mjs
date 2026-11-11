/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// .scostheme bundles for agents: scaffold a complete bundle, and validate one against the installed theme contract.
// Nothing here imports, evaluates or executes theme code; Info.ts is read statically by the bundle validator.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { parse, generate, walk } from "css-tree";
import { readThemeBundle, themeRuleSummaries } from "../synware/theme-bundles.mjs";
import { inspectStyleErrors } from "../synware/idiom-errors.mjs";
import { inside, projectContext, slash } from "./project.mjs";

const IDENTIFIER = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;

function guardedPath(root, name) {
  const path = resolve(root, name);
  if (!inside(root, path) || path === root) throw new Error("A theme path must stay inside the consumer project.");
  let current = root;
  for (const segment of relative(root, path).split(sep)) {
    current = resolve(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Theme paths cannot traverse symbolic links.");
  }
  return path;
}

function installedContract(context) {
  const path = resolve(context.sdkRoot, "tooling/nse-theme-contract.json");
  if (!existsSync(path)) throw new Error("The installed SDK has no NSE theme contract. Install a matching current SDK and developer MCP build.");
  const contract = JSON.parse(readFileSync(path, "utf8"));
  if (contract.themeContractVersion !== 1 || !contract.controls || !Array.isArray(contract.colours) || !contract.colours.length)
    throw new Error("The installed NSE theme contract is malformed.");
  return contract;
}

/** Atmo's definition, from the installed SDK's own bundle: the starting values a new theme replaces. */
function installedAtmo(context) {
  const path = resolve(context.sdkRoot, "themes/Atmo.scostheme/Contents/Theme.json");
  if (!existsSync(path)) throw new Error("The installed SDK has no Atmo.scostheme to take starting values from. Install a matching current SDK.");
  return JSON.parse(readFileSync(path, "utf8"));
}

const attributeValue = node => node.value ? (node.value.type === "String" ? node.value.value : node.value.name) : null;

/** Which contract parts a bundle's rules draw. A part counts as drawn when a rule with declarations names it,
 * under its control or with no control at all (a part rule that applies wherever the part appears). */
export function themeCoverage(stylesheets, contract) {
  const drawn = new Set();
  for (const text of stylesheets) {
    walk(parse(text, { parseCustomProperty: false }), {
      visit: "Rule",
      enter(rule) {
        if (!rule.block.children.toArray().some(child => child.type === "Declaration")) return;
        for (const selector of rule.prelude.children?.toArray() ?? []) {
          const controls = new Set(), parts = new Set();
          walk(selector, node => {
            if (node.type !== "AttributeSelector") return;
            const name = generate(node.name), value = attributeValue(node);
            if (!value) return;
            if (name === "data-nse-control") controls.add(value);
            if (name === "data-nse-part") parts.add(value);
          });
          for (const control of controls) drawn.add(control);
          for (const part of parts) {
            // A part belongs to its nearest control. Named under one of its own controls, it is drawn there;
            // named with no control, or under an outer control that does not own it (a nested control's part), it is drawn wherever it appears.
            const owners = Object.entries(contract.controls).filter(([, entry]) => entry.parts.includes(part)).map(([control]) => control);
            const named = owners.filter(control => controls.has(control));
            for (const control of named.length ? named : owners) drawn.add(`${control}.${part}`);
          }
        }
      },
    });
  }
  const all = Object.entries(contract.controls).flatMap(([control, entry]) => entry.parts.map(part => `${control}.${part}`));
  const undrawn = all.filter(item => !drawn.has(item));
  return { drawn: all.length - undrawn.length, total: all.length, undrawn };
}

/** Create a complete, valid bundle: Atmo's colours (marked for replacement), navigation and presentation,
 * and an empty, commented rule for every part in the contract. Never overwrites anything. */
export async function scaffoldTheme({ projectRoot, bundleIdentifier, displayName, directory } = {}) {
  const context = projectContext(projectRoot);
  const contract = installedContract(context), atmo = installedAtmo(context);
  if (typeof bundleIdentifier !== "string" || !IDENTIFIER.test(bundleIdentifier)) throw new TypeError("A theme bundleIdentifier is a lower-case reverse-DNS name such as com.example.dusk.");
  if (typeof displayName !== "string" || !displayName.trim() || /[\\/:*?"<>|]/u.test(displayName) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(displayName.trim()))
    throw new TypeError("A theme displayName is required and must be usable as a bundle folder name.");
  const name = displayName.trim();
  const target = guardedPath(context.root, resolve(context.root, directory ?? "src/Themes", `${name}.scostheme`));
  if (existsSync(target)) throw new Error("The theme bundle already exists; existing themes are never overwritten.");
  const info = `/* ${name}: theme identity. Read statically; a theme contains no code. */\n`
    + `/* Theme.json starts with Atmo's colours, navigation and presentation. Replace every colour with your own palette. */\n`
    + `export default ${JSON.stringify({ bundleIdentifier, displayName: name, version: "1.0.0", themeContractVersion: contract.themeContractVersion })};\n`;
  const definition = { colours: { light: atmo.colours.light, dark: atmo.colours.dark }, navigation: atmo.navigation, presentation: atmo.presentation, images: {} };
  const css = [
    `/* ${name}: control drawing. Every part in the installed theme contract has an empty rule below, grouped by control.`,
    "   Draw through these hooks only: [data-nse-control], [data-nse-part] and the state attributes the contract lists.",
    "   Typography, motion and layout are framework-owned; a focused control must keep a visible focus indicator.",
    "   Colours in Theme.json are Atmo's starting values: replace them with your palette. */",
    "",
    ...Object.entries(contract.controls).flatMap(([control, entry]) => [
      `/* ${control}${entry.states?.length ? ` (states: ${entry.states.join(", ")})` : ""} */`,
      `[data-nse-control="${control}"] {}`,
      ...entry.parts.map(part => `[data-nse-control="${control}"] [data-nse-part="${part}"] {}`),
      "",
    ]),
  ].join("\n");
  const files = { "Contents/Info.ts": info, "Contents/Theme.json": JSON.stringify(definition, null, 2) + "\n", "Contents/Resources/theme.css": css };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(resolve(target, path, ".."), { recursive: true });
    writeFileSync(resolve(target, path), text, { flag: "wx" });
  }
  return {
    bundlePath: slash(relative(context.root, target)),
    createdPaths: Object.keys(files).map(path => slash(relative(context.root, resolve(target, path)))),
    nextSteps: [
      "Replace every colour in Contents/Theme.json, in light and dark, with your own palette.",
      "Draw each control in Contents/Resources/theme.css; validate_theme lists the parts still undrawn.",
      "Choose navigation and presentation in Theme.json from the values the contract allows.",
    ],
  };
}

/** Validate a .scostheme with the bundle rules against the installed contract. Errors are rule violations and hard limits;
 * warnings are parts the theme does not yet draw. */
export async function validateTheme({ projectRoot, path } = {}) {
  const context = projectContext(projectRoot);
  const contract = installedContract(context);
  if (typeof path !== "string" || !/\.scostheme[\\/]?$/iu.test(path)) throw new TypeError("Name a .scostheme bundle to validate.");
  const target = guardedPath(context.root, path);
  const errors = [], seen = new Set();
  const error = (file, rule, message, line = 1) => {
    const entry = { file: slash(relative(context.root, file)), line, rule, message };
    const key = JSON.stringify(entry); if (!seen.has(key)) { seen.add(key); errors.push(entry); }
  };
  let bundle = null;
  try { bundle = readThemeBundle(target, { contract }); }
  catch (failure) {
    const match = /^(.*?): ([a-z-]+): ([\s\S]*)$/u.exec(failure.message);
    if (match) error(match[1], `theme.${match[2]}`, match[3]); else error(target, "theme.bundle", failure.message);
  }
  // The idiom rules see every stylesheet, so one violation does not hide the others.
  const stylesheets = bundle?.stylesheets ?? [];
  const cssFiles = bundle ? stylesheets : (() => { const css = resolve(target, "Contents/Resources/theme.css"); return existsSync(css) ? [css] : []; })();
  const themeSiblings = cssFiles.flatMap(file => themeRuleSummaries(readFileSync(file, "utf8")));
  for (const file of cssFiles) for (const finding of inspectStyleErrors({ file, text: readFileSync(file, "utf8"), themeSiblings }))
    if (finding.severity === "error") error(file, finding.rule, finding.message, finding.line);
  let coverage = { drawn: 0, total: 0, undrawn: [] };
  try { coverage = themeCoverage(cssFiles.map(file => readFileSync(file, "utf8")), contract); } catch { /* Syntax errors are already reported. */ }
  return {
    ok: errors.length === 0,
    errors,
    warnings: coverage.undrawn.map(item => ({ rule: "theme.undrawn-part", part: item, message: `${item} is not drawn by this theme.` })),
    coverage: { drawn: coverage.drawn, total: coverage.total },
  };
}
