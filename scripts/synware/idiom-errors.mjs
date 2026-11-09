/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import ts from "typescript";
import { parse as parseCss, walk as walkCss } from "css-tree";
import { IDIOM_REPLACEMENTS, replacementMessage } from "./idiom-replacements.mjs";

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.[jt]sx$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function walk(node, visitor) {
  visitor(node);
  ts.forEachChild(node, child => walk(child, visitor));
}
function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}
function literal(node) {
  node = unwrap(node);
  if (node && (ts.isStringLiteralLike(node) || ts.isJsxText(node))) return node.text;
  return null;
}
function propertyName(node) {
  return node && (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) ? node.text : null;
}
function accessPath(node) {
  node = unwrap(node);
  if (!node) return null;
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const parent = accessPath(node.expression);
    return parent ? `${parent}.${node.name.text}` : null;
  }
  if (ts.isElementAccessExpression(node)) {
    const parent = accessPath(node.expression), name = literal(node.argumentExpression);
    return parent && name ? `${parent}.${name}` : null;
  }
  return null;
}
function jsxTag(node) { return node.tagName?.getText() ?? ""; }
function attribute(node, name) {
  const found = node.attributes.properties.find(value => ts.isJsxAttribute(value) && value.name.getText() === name);
  if (!found?.initializer) return null;
  return ts.isJsxExpression(found.initializer) ? unwrap(found.initializer.expression) : found.initializer;
}
function lexicalBindings(source) {
  const scopes = new Map();
  const scopeOf = (node, functionOnly = false) => {
    for (let scope = node; scope; scope = scope.parent)
      if (ts.isSourceFile(scope) || ts.isFunctionLike(scope) || (!functionOnly && (ts.isBlock(scope) || ts.isCatchClause(scope)))) return scope;
    return source;
  };
  const add = (scope, name) => {
    if (!name) return;
    if (ts.isIdentifier(name)) {
      if (!scopes.has(scope)) scopes.set(scope, new Set());
      scopes.get(scope).add(name.text);
    } else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) for (const item of name.elements) if (ts.isBindingElement(item)) add(scope, item.name);
  };
  walk(source, node => {
    if (ts.isParameter(node)) add(scopeOf(node.parent, true), node.name);
    else if (ts.isVariableDeclaration(node)) {
      const declarationList = node.parent;
      const functionOnly = ts.isVariableDeclarationList(declarationList) && !(declarationList.flags & ts.NodeFlags.BlockScoped);
      add(scopeOf(node.parent, functionOnly), node.name);
    } else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) add(scopeOf(node.parent), node.name);
    else if (ts.isFunctionExpression(node) || ts.isClassExpression(node)) add(node, node.name);
    else if (ts.isImportClause(node) || ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) add(source, node.name);
  });
  return (name, node) => {
    for (let scope = node; scope; scope = scope.parent) if (scopes.get(scope)?.has(name)) return true;
    return false;
  };
}
function identifierReference(node) {
  if (!ts.isIdentifier(node)) return true;
  const parent = node.parent;
  if ((ts.isPropertyAccessExpression(parent) && parent.name === node) || (parent?.name === node && !ts.isShorthandPropertyAssignment(parent))) return false;
  return !ts.isImportSpecifier(parent) && !ts.isExportSpecifier(parent) && !ts.isJsxAttribute(parent);
}

/** A renderer import alone grants no exemption: the file must own its surface. */
export function rendererOwnedSource(text) {
  const source = parse("renderer.tsx", text);
  const imports = new Set(), componentSurfaces = new Set();
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    if (!/^(?:three(?:\/|$)|@react-three\/fiber$|pixi\.js$|@pixi\/|@babylonjs\/|babylonjs$|regl$|p5$|konva$|react-konva$|ogl$)/u.test(node.moduleSpecifier.text)) continue;
    const bindings = node.importClause?.namedBindings;
    if (node.importClause?.name) imports.add(node.importClause.name.text);
    if (bindings && ts.isNamespaceImport(bindings)) imports.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
      imports.add(binding.name.text);
      if (["Canvas", "Stage"].includes((binding.propertyName ?? binding.name).text)) componentSurfaces.add(binding.name.text);
    }
  }
  let owns = false;
  walk(source, node => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && componentSurfaces.has(jsxTag(node))) owns = true;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "getContext" && /^webgl2?$/u.test(literal(node.arguments[0]) ?? "")) owns = true;
    if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && imports.has((accessPath(node.expression) ?? "").split(".")[0])) {
      const hasSurface = node.arguments?.some(argument => ts.isObjectLiteralExpression(argument) && argument.properties.some(property => ["canvas", "view", "context"].includes(propertyName(property.name))));
      const name = accessPath(node.expression) ?? "";
      if (hasSurface || /(?:WebGLRenderer|WebGPURenderer|Renderer|Application|Engine)$/u.test(name)) owns = true;
    }
  });
  return owns;
}

const COLOUR = /#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(|(?:^|\s)(?:white|black|red|blue|green|grey|gray|yellow|orange|purple|pink|navy|teal|silver|maroon|lime|aqua|fuchsia|olive)(?:$|\s)/iu;
const PAINT = /^(?:color|colour|textColor|tintColor|background|backgroundColor|border|borderColor|outline|outlineColor|textDecorationColor|boxShadow|textShadow|fill|stroke|caretColor|accentColor)$/u;
const GLYPH = /^[\s]*[‹›«»<>←→↑↓↔↕⟨⟩⌃⌄▲▼◀▶△▽◁▷⚙⚙️☰✕✖✓✔＋−]|[‹›«»<>←→↑↓↔↕⟨⟩⌃⌄▲▼◀▶△▽◁▷⚙☰✕✖✓✔]\s*$/u;
const SYSTEM_ICON = /(?:^|[\s_/-])(?:arrow[-_ ]?(?:back|forward|left|right)|chevron[-_ ]?(?:left|right)|(?:back|forward|left|right)[-_ ]?(?:arrow|chevron|icon)|NSGoBackTemplate|NSGoForwardTemplate)(?:[\s_./-]|$)/iu;
const NAVIGATION_ARTWORK = /^(?:back|forward|go back|go forward|previous|next|arrow[-_ ]?(?:left|right|back|forward)|chevron[-_ ]?(?:left|right))$/iu;
const GRAPHICS_TAGS = new Set(["svg", "path", "circle", "ellipse", "rect", "line", "polygon", "polyline", "stop", "g", "canvas"]);

/** Definite source misuse; unknown APIs and custom artwork remain legitimate. */
export function inspectIdiomErrors({ file, text }) {
  if (rendererOwnedSource(text)) return [];
  const source = parse(file, text), findings = [], isShadowed = lexicalBindings(source), seen = new Set();
  const at = (node, rule, key, message) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const identity = `${node.pos}:${rule}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    findings.push({ line, rule, severity: "error", message: `${message} ${replacementMessage(key)}` });
  };
  walk(source, node => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node);
      if (["button", "input", "select", "textarea", "table"].includes(tag) && !(tag === "input" && ["hidden", "file"].includes(literal(attribute(node, "type"))))) at(node, "idiom.nse-controls", tag, `1 raw <${tag}> element bypasses NSE control semantics.`);
      if (tag === "img") {
        const identity = ["src", "className", "id", "alt", "aria-label"].map(name => literal(attribute(node, name)) ?? "").join(" ");
        if (SYSTEM_ICON.test(identity)) at(node, "idiom.system-image", "systemImage", "A navigation icon is loaded as a private image.");
      }
      if (tag === "button" || /(?:NSEButton|NSESegmentedControl|NSEPopUpButton)$/u.test(tag)) {
        const title = literal(attribute(node, "title")) ?? (ts.isJsxElement(node.parent) ? node.parent.children.filter(ts.isJsxText).map(child => child.text).join("") : "");
        if (GLYPH.test(title) && !/^[<>−-]\s*\d/u.test(title.trim())) at(node, "idiom.button-glyph", "buttonImage", "A button title uses a glyph as system artwork; keep its accessible text title and supply an image.");
      }
      const appearance = attribute(node, "appearance");
      const constructor = appearance && ts.isNewExpression(appearance) && /(?:^|\.)NSEAppearance$/u.test(accessPath(appearance.expression) ?? "") ? appearance : null;
      const options = constructor ? unwrap(constructor.arguments?.[1]) : null;
      const customTheme = options && (!ts.isObjectLiteralExpression(options) || options.properties.some(property => ts.isSpreadAssignment(property) || (propertyName(property.name) === "theme" && !(ts.isPropertyAssignment(property) && (property.initializer.kind === ts.SyntaxKind.NullKeyword || property.initializer.getText(source) === "undefined")))));
      const namedAppearance = literal(appearance) ?? (constructor && !customTheme ? literal(constructor.arguments?.[0]) : null);
      if (/^NSE/u.test(tag) && ["aqua", "darkAqua"].includes(namedAppearance)) at(node, "idiom.appearance", "appearance", "A named system appearance is forced instead of inherited.");
      if (/^NSE/u.test(tag)) for (const property of node.attributes.properties) {
        if (!ts.isJsxAttribute(property)) continue;
        const key = propertyName(property.name), value = literal(attribute(node, key));
        if (key && key !== "style" && PAINT.test(key) && value && COLOUR.test(value)) at(property, "idiom.ui-colour", "uiColour", "A colour attribute overrides the selected NSE appearance.");
      }
      const style = attribute(node, "style");
      if (style && ts.isObjectLiteralExpression(style)) for (const property of style.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const key = propertyName(property.name), value = literal(property.initializer);
        if (key && value && PAINT.test(key) && COLOUR.test(value) && !GRAPHICS_TAGS.has(tag)) at(property, "idiom.ui-colour", "uiColour", "A UI colour is hard-coded instead of supplied by the selected NSE appearance.");
        if (key && value && /^(?:overflow|overflowY|overflowX)$/u.test(key) && /^(?:auto|scroll)$/u.test(value) && !/^NSE/u.test(tag)) at(property, "idiom.scroll-view", "scroll", "A hand-rolled scrolling container bypasses NSE scrolling.");
      }
      if (tag === "svg" && ts.isJsxElement(node.parent)) {
        const identity = literal(attribute(node, "aria-label")) ?? literal(attribute(node, "data-icon")) ?? literal(attribute(node, "id")) ?? "";
        const path = node.parent.children.some(child => (ts.isJsxSelfClosingElement(child) && jsxTag(child) === "path") || (ts.isJsxElement(child) && jsxTag(child.openingElement) === "path"));
        if (path && NAVIGATION_ARTWORK.test(identity)) at(node, "idiom.system-artwork", "systemImage", "Inline navigation artwork duplicates a named system image.");
      }
    }
    if (ts.isJsxElement(node)) {
      // An all-caps text row directly preceding a heading is an eyebrow; group headers alone are valid.
      let grouped = false;
      for (let ancestor = node; ancestor; ancestor = ancestor.parent) {
        if (!ts.isJsxElement(ancestor)) continue;
        const opening = ancestor.openingElement;
        if (/NSEOutlineView$/u.test(jsxTag(opening)) || ["tree", "treeitem", "group"].includes(literal(attribute(opening, "role"))) || /source[-_ ]?list/iu.test(literal(attribute(opening, "className")) ?? "")) grouped = true;
      }
      const children = grouped ? [] : node.children.filter(child => !ts.isJsxText(child) || child.text.trim());
      for (let index = 0; index < children.length - 1; index++) {
        const eyebrow = children[index], heading = children[index + 1];
        if (!ts.isJsxElement(eyebrow) || !ts.isJsxElement(heading) || !/^h[1-6]$/u.test(jsxTag(heading.openingElement))) continue;
        if (!/^(?:p|span|small|div)$/u.test(jsxTag(eyebrow.openingElement))) continue;
        const label = eyebrow.children.every(ts.isJsxText) ? eyebrow.children.map(child => child.text).join("").trim() : "";
        if (/[A-Z]{2}/u.test(label) && !/[a-z]/u.test(label)) at(eyebrow, "idiom.eyebrow", "eyebrow", "An all-caps eyebrow repeats context above a title.");
      }
    }
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const path = accessPath(node), base = path?.split(".")[0];
      if (!path || !identifierReference(node) || isShadowed(base, node)) return;
      if (/^(?:(?:window|globalThis)\.)?localStorage$/u.test(path)) at(node, "idiom.preferences", "preferences", "Raw localStorage bypasses the structured preferences store.");
      const device = /^(?:(?:window|globalThis)\.)?navigator\.(bluetooth|nfc|geolocation|mediaDevices|contacts|requestMIDIAccess|xr|vibrate)$/u.exec(path)?.[1];
      if (device && IDIOM_REPLACEMENTS[device]) at(node, "idiom.device-fx", device, `Raw navigator.${device} bypasses the owner-scoped framework capability.`);
      if (/^(?:(?:window|globalThis)\.)?speechSynthesis$/u.test(path)) at(node, "idiom.device-fx", "speechSynthesis", "Raw speech synthesis bypasses the framework audio lifecycle.");
    }
    if (ts.isNewExpression(node)) {
      const path = accessPath(node.expression);
      if (["NDEFReader", "window.NDEFReader", "globalThis.NDEFReader"].includes(path) && !isShadowed(path.split(".")[0], node)) at(node, "idiom.device-fx", "nfc", "A raw NFC reader bypasses the framework reader session.");
      if (["SpeechRecognition", "webkitSpeechRecognition", "window.SpeechRecognition", "window.webkitSpeechRecognition"].includes(path) && !isShadowed(path.split(".")[0], node)) at(node, "idiom.device-fx", "SpeechRecognition", "Raw speech recognition bypasses the framework recogniser lifecycle.");
    }
  });
  return findings;
}

/** CSS rules concern consumer UI declarations, not theme-owned semantic values. */
export function inspectStyleErrors({ text }) {
  const css = text.replace(/\/\*[\s\S]*?\*\//gu, value => value.replace(/[^\n]/gu, " "));
  const findings = [];
  const at = (index, rule, key, message) => findings.push({ line: css.slice(0, index).split("\n").length, rule, severity: "error", message: `${message} ${replacementMessage(key)}` });
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const selector = block[1].trim(), declarations = block[2];
    if (selector.startsWith("@")) continue;
    // Themes implement semantic recipe selectors; consumer overrides of private class internals do not.
    let privateClass = false;
    try {
      walkCss(parseCss(selector, { context: "selectorList" }), node => { if (node.type === "ClassSelector" && /^nse-/u.test(node.name)) privateClass = true; });
    } catch { /* Incomplete CSS is left to stylesheet validation. */ }
    if (privateClass) at(block.index + block[1].search(/\S/u), "idiom.control-internals", "uiColour", "A class selector styles private NSE control internals. Supply semantic appearance values or a control recipe.");
    for (const declaration of declarations.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/gu)) {
      const property = declaration[1], value = declaration[2].trim();
      if (property.startsWith("--")) continue;
      const index = block.index + block[0].indexOf("{") + 1 + declaration.index;
      if (/^overflow(?:-[xy])?$/iu.test(property) && /^(?:auto|scroll)$/u.test(value)) at(index, "idiom.scroll-view", "scroll", "A hand-rolled CSS scrolling container bypasses NSE scrolling.");
      if (/^(?:color|background(?:-color)?|border(?:-(?:top|bottom|left|right))?(?:-color)?|outline(?:-color)?|text-decoration-color|box-shadow|text-shadow|caret-color|accent-color)$/iu.test(property) && COLOUR.test(value)) at(index, "idiom.ui-colour", "uiColour", "A UI colour is hard-coded instead of supplied by the selected NSE appearance.");
    }
  }
  return findings;
}
