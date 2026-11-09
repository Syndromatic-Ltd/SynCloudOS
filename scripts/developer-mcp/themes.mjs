/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { parse, generate, lexer, tokenize, tokenTypes, walk } from "css-tree";
import { inside, projectContext, slash } from "./project.mjs";

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
  const path = resolve(context.sdkRoot, "tooling/nse-appearance-contract.json");
  if (!existsSync(path)) throw new Error("The installed SDK has no neutral NSE appearance contract. Install a matching current SDK and developer MCP build.");
  const contract = JSON.parse(readFileSync(path, "utf8"));
  if (contract.schemaVersion !== 1 || !Array.isArray(contract.values) || !contract.values.length || !contract.definition?.idPattern)
    throw new Error("The installed neutral NSE appearance contract is malformed.");
  return contract;
}

function strictStylesheet(text) {
  const stack = [];
  const opens = new Map([[tokenTypes.LeftCurlyBracket, tokenTypes.RightCurlyBracket], [tokenTypes.LeftSquareBracket, tokenTypes.RightSquareBracket], [tokenTypes.LeftParenthesis, tokenTypes.RightParenthesis], [tokenTypes.Function, tokenTypes.RightParenthesis]]);
  const closes = new Set([tokenTypes.RightCurlyBracket, tokenTypes.RightSquareBracket, tokenTypes.RightParenthesis]);
  tokenize(text, (type, start, end) => {
    if (opens.has(type)) stack.push(opens.get(type));
    else if (closes.has(type) && stack.pop() !== type) throw new SyntaxError("Unbalanced CSS brackets.");
    else if (type === tokenTypes.BadString || type === tokenTypes.BadUrl) throw new SyntaxError("Malformed CSS string or URL.");
    else if (type === tokenTypes.Comment && !text.slice(start, end).endsWith("*/")) throw new SyntaxError("Unclosed CSS comment.");
  });
  if (stack.length) throw new SyntaxError("Unclosed CSS block or function.");
  return parse(text, { positions: true, onParseError(error) { throw error; } });
}

/** Positive attributes must apply to the provider itself, not an ancestor or a :not branch. */
function providerAttributes(selector) {
  const attributes = new Map();
  let valid = true;
  const visit = node => {
    if (node.type === "Combinator") { valid = false; return; }
    if (node.type === "AttributeSelector" && node.matcher === "=") {
      attributes.set(generate(node.name), node.value?.value ?? node.value?.name);
    } else if (node.type === "PseudoClassSelector") {
      if (!["where", "is"].includes(node.name) || !node.children || node.children.size !== 1) { valid = false; return; }
      const list = node.children.first;
      if (list.type !== "SelectorList" || list.children.size !== 1) { valid = false; return; }
      list.children.first.children.forEach(visit);
    }
  };
  selector.children.forEach(visit);
  return valid ? attributes : null;
}

function resolvedColour(value, declarations, trail = new Set()) {
  const ast = parse(value, { context: "value" });
  walk(ast, { visit: "Function", enter(node, item, list) {
    if (node.name !== "var") return;
    const children = node.children.toArray();
    const name = children[0]?.type === "Identifier" ? children[0].name : null;
    if (!name?.startsWith("--") || trail.has(name)) throw new Error("Unresolved or cyclic colour variable.");
    const fallbackIndex = children.findIndex(child => child.type === "Operator" && child.value === ",");
    const target = declarations.get(name)?.value ?? (fallbackIndex >= 0 ? children.slice(fallbackIndex + 1).map(generate).join("") : null);
    if (target === null) throw new Error(`Unknown colour variable ${name}.`);
    const next = resolvedColour(target, declarations, new Set([...trail, name]));
    const replacement = parse(next, { context: "value" });
    list.replace(item, replacement.children);
    return walk.skip;
  } });
  return generate(ast);
}

/** Provision a real, editable theme definition and its loaded light/dark stylesheet. */
export async function scaffoldTheme({ projectRoot, name, directory } = {}) {
  const context = projectContext(projectRoot);
  const contract = installedContract(context);
  if (typeof name !== "string" || !name.trim()) throw new TypeError("A theme name is required.");
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  if (!id || !new RegExp(contract.definition.idPattern, "u").test(id) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(id) || /[\\/]/u.test(name))
    throw new TypeError("A theme name must produce a valid NSE appearance id and cannot contain path separators or a reserved device name.");
  const target = guardedPath(context.root, directory ?? `src/Themes/${id}`);
  if (existsSync(target)) throw new Error("The theme directory already exists; existing themes are never overwritten.");
  const definition = { id, displayName: name.trim(), recipes: [] };
  const manifest = { ...definition, stylesheet: "styles.css" };
  const appearance = `import { defineNSEAppearance } from "${contract.definition.import}";\nimport "./styles.css";\n\nexport const appearance = defineNSEAppearance(${JSON.stringify(definition, null, 2)});\n`;
  const stylesheet = "/* Starter values from NSE's neutral contract. Replace these with your own palette. */\n" + contract.schemes.map(scheme =>
    `[data-nse-appearance="${id}"][data-nse-colour-scheme-resolved="${scheme}"] {\n` +
    contract.values.map(value => `  ${value.name}: ${value.defaults[scheme]};`).join("\n") + "\n}",
  ).join("\n\n") + "\n";
  mkdirSync(target, { recursive: true });
  const files = { "theme.json": JSON.stringify(manifest, null, 2) + "\n", "appearance.ts": appearance, "styles.css": stylesheet };
  for (const [path, text] of Object.entries(files)) writeFileSync(resolve(target, path), text, { flag: "wx" });
  return {
    createdPaths: Object.keys(files).map(path => slash(relative(context.root, resolve(target, path)))),
    contract,
    nextSteps: ["Edit styles.css in both colour schemes; recipes are optional and must refer to artwork your theme supplies.", "Import appearance from the generated appearance.ts and supply it as the theme of NSEAppearance from @syndromatic/syncloudos/nse.", "Call validate_theme with the theme directory before using it. This checks values, not visual fidelity or contrast."],
  };
}

/** Validate data and CSS without importing, evaluating or executing theme code. */
export async function validateTheme({ projectRoot, path } = {}) {
  const context = projectContext(projectRoot);
  const contract = installedContract(context);
  const target = guardedPath(context.root, path ?? "src/Themes");
  const manifestPath = existsSync(target) && lstatSync(target).isDirectory() ? guardedPath(context.root, resolve(target, "theme.json")) : target;
  const findings = [];
  const at = (file, rule, message, extra = {}) => findings.push({ file: slash(relative(context.root, file)), line: 1, rule, severity: "error", message, ...extra });
  let definition;
  try { definition = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch (error) { at(manifestPath, "theme.definition", `Read a valid theme.json containing the defineNSEAppearance definition (${contract.definition.import}): ${error.message}`); }
  if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
    if (!findings.length) at(manifestPath, "theme.definition", `Supply a plain defineNSEAppearance definition from ${contract.definition.import}.`);
    return { ok: false, findings, checkedValues: 0, contract };
  }
  for (const field of contract.definition.fields) {
    if (field.required && (typeof definition[field.name] !== "string" || !definition[field.name].trim()))
      at(manifestPath, "theme.definition", `Appearance ${field.name} must be a non-blank string for defineNSEAppearance from ${contract.definition.import}.`);
  }
  if (typeof definition.id !== "string" || !new RegExp(contract.definition.idPattern, "u").test(definition.id))
    at(manifestPath, "theme.definition", `Appearance id must match /${contract.definition.idPattern}/ for defineNSEAppearance from ${contract.definition.import}.`);
  const recipes = definition.recipes ?? [];
  if (!Array.isArray(recipes)) at(manifestPath, "theme.definition", `Appearance recipes must be an array for defineNSEAppearance from ${contract.definition.import}.`);
  else {
    const slots = new Set(), ids = new Set();
    for (const [index, recipe] of recipes.entries()) {
      for (const field of contract.definition.recipeFields) if (field.required && (typeof recipe?.[field.name] !== "string" || !recipe[field.name].trim()))
        at(manifestPath, "theme.definition", `Recipe ${index} ${field.name} must be a non-blank string for defineNSEAppearance from ${contract.definition.import}.`);
      const slot = typeof recipe?.slot === "string" ? recipe.slot.trim() : recipe?.slot;
      const recipeId = typeof recipe?.recipeId === "string" ? recipe.recipeId.trim() : recipe?.recipeId;
      if (slots.has(slot) || ids.has(recipeId)) at(manifestPath, "theme.duplicate-recipe", "Recipe slots and recipe ids must be unique after trimming.");
      slots.add(slot); ids.add(recipeId);
    }
  }
  const stylesheetName = definition.stylesheet ?? "styles.css";
  if (typeof stylesheetName !== "string" || !stylesheetName.trim()) {
    at(manifestPath, "theme.definition", "The theme stylesheet must name a CSS file inside the project.");
    return { ok: false, findings, checkedValues: 0, contract };
  }
  const stylesheet = guardedPath(context.root, resolve(dirname(manifestPath), stylesheetName));
  const modes = Object.fromEntries(contract.schemes.map(scheme => [scheme, new Map()]));
  try {
    const ast = strictStylesheet(readFileSync(stylesheet, "utf8"));
    ast.children.forEach(rule => {
      if (rule.type !== "Rule") return;
      rule.prelude.children.forEach(selector => {
        const attributes = providerAttributes(selector);
        if (!attributes || attributes.get("data-nse-appearance") !== definition.id) return;
        const scheme = attributes.get("data-nse-colour-scheme-resolved");
        const selected = scheme ? (modes[scheme] ? [scheme] : []) : contract.schemes;
        for (const mode of selected) rule.block.children.forEach(declaration => {
          if (declaration.type === "Declaration" && (scheme || !contract.values.some(value => value.name === declaration.property))) modes[mode].set(declaration.property, { value: generate(declaration.value), line: declaration.loc?.start.line ?? 1 });
        });
      });
    });
  } catch (error) { at(stylesheet, "theme.stylesheet", `Read a valid theme stylesheet: ${error.message}`); }
  let checkedValues = 0;
  for (const scheme of contract.schemes) for (const value of contract.values) {
    const declaration = modes[scheme].get(value.name);
    if (!declaration) { at(stylesheet, "theme.missing-value", `Supply ${value.name} for the ${scheme} colour scheme, scoped to this NSE appearance.`, { value: value.name, scheme }); continue; }
    checkedValues++;
    let valid = false;
    try { valid = declaration.value.trim() && !lexer.matchProperty("color", resolvedColour(declaration.value, modes[scheme])).error; } catch { /* Report the original value below. */ }
    if (!valid)
      at(stylesheet, "theme.malformed-value", `${value.name} in ${scheme} must be a valid CSS colour.`, { value: value.name, scheme, line: declaration.line });
  }
  return { ok: !findings.length, findings, checkedValues, contract };
}
