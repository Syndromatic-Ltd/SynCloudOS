/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as cssTree from "css-tree";
import ts from "typescript";
import { paintProperties } from "./paint-properties.mjs";
import { optimiseSelectors } from "./selector-performance.mjs";
const stateHooks = ["highlighted", "hovered", "focused", "selected"];
function gates(selector) {
  let result = "";
  for (const state of stateHooks) if (!selector.includes(`data-nse-${state}`) && !selector.includes(state === "highlighted" ? ":active" : state === "hovered" ? ":hover" : state === "focused" ? ":focus" : "data-nse-selected")) result += `:not([data-nse-${state}])`;
  if (!selector.includes("data-nse-enabled") && !selector.includes(":disabled")) result += ':not([data-nse-enabled="false"])';
  if (!selector.includes("data-nse-key-window")) result += ':not([data-nse-key-window="false"])';
  if (!selector.includes("data-nse-state")) result += ':not([data-nse-state="on"]):not([data-nse-state="mixed"])';
  return result;
}
const drawingHooks = new Set(["data-nse-control", "data-nse-part"]);
const legacyPseudoElements = new Set(["before", "after", "first-line", "first-letter"]);
const typographyProperties = [
  "font", "font-variant", "font-variant-emoji", "font-kerning", "font-size-adjust", "font-optical-sizing",
  "font-feature-settings", "font-variation-settings", "font-language-override", "font-palette", "font-synthesis",
  "line-height", "letter-spacing", "word-spacing", "text-transform",
];
const clearDeclarations = [
  ...paintProperties.map(property => property + ":initial"),
  ...typographyProperties.map(property => property + ":unset"),
].join(";");

function drawsElement(selector) {
  const subject = selector.children.toArray();
  const compound = subject.slice(subject.findLastIndex(child => child.type === "Combinator") + 1);
  if (compound.some(child => child.type === "PseudoElementSelector" ||
    child.type === "PseudoClassSelector" && legacyPseudoElements.has(child.name.toLowerCase()))) return false;
  return compound.some(child => {
    if (child.type === "AttributeSelector") return drawingHooks.has(cssTree.ident.decode(cssTree.generate(child.name)));
    if (child.type !== "PseudoClassSelector" || !["is", "where"].includes(child.name.toLowerCase())) return false;
    const argumentsList = child.children?.first;
    return argumentsList?.type === "SelectorList" && argumentsList.children.toArray().every(drawsElement);
  });
}

function confineAppDrawing(selector, root) {
  cssTree.walk(selector, { visit: "PseudoClassSelector", enter(node, item, list) {
    if (cssTree.ident.decode(node.name).toLowerCase() === "scope") {
      list.replace(item, cssTree.parse(root, { context: "selector" }).children);
    }
  } });
  const subject = cssTree.parse(":where(:scope,:scope *)", { context: "selector" }).children;
  let pseudo = null;
  selector.children.forEach((node, item) => {
    if (node.type === "Combinator") pseudo = null;
    if (!pseudo && (node.type === "PseudoElementSelector" ||
        node.type === "PseudoClassSelector" && legacyPseudoElements.has(node.name.toLowerCase()))) pseudo = item;
  });
  selector.children.insertList(subject, pseudo);
}

function clearingRules(children) {
  const selectors = new Set();
  const groups = [];
  for (const child of children) {
    if (child.type === "Rule" && child.prelude.type === "SelectorList") {
      for (const selector of child.prelude.children) {
        if (!drawsElement(selector)) continue;
        const text = cssTree.generate(selector);
        selectors.add(text);
        selectors.add(text + "::before");
        selectors.add(text + "::after");
      }
    }
    if (child.type === "Atrule" && child.block) {
      const clear = clearingRules(child.block.children);
      if (clear) {
        const prelude = child.prelude ? " " + cssTree.generate(child.prelude) : "";
        groups.push("@" + child.name + prelude + "{" + clear + "}");
      }
    }
  }
  if (selectors.size) groups.unshift([...selectors].join(",") + "{" + clearDeclarations + "}");
  return groups.join("\n");
}

/**
 * A partial drawing is state-specific: missing states retain the base layer's complete drawing.
 * @param {string} source
 * @param {string} bundleIdentifier
 * @param {{ layer?: "nse.theme" | "nse.app-theme", boundary?: "data-nse-theme" | "data-nse-app-theme" }} [options]
 */
export function scopeThemeCSS(source, bundleIdentifier, options = {}) {
  const { layer = "nse.theme", boundary = "data-nse-theme" } = options;
  const ast = cssTree.parse(source, { parseCustomProperty: true });
  const root = "[" + boundary + "=" + JSON.stringify(bundleIdentifier) + "]";
  const app = boundary === "data-nse-app-theme";
  const seen = new WeakSet();
  cssTree.walk(ast, { visit: "Rule", enter(node, item, list) {
    if (seen.has(node)) return cssTree.walk.skip;
    const selectors = [];
    let needsControlScope = false;
    for (const selector of node.prelude.children) {
      if (app) confineAppDrawing(selector, root);
      const text = cssTree.generate(selector), exclusions = gates(text);
      if (text.includes(":scope") && !text.includes("data-nse-control") && !text.includes("data-nse-part")) { selectors.push(text); continue; }
      let hasControl = false;
      const carriesControl = child => { let found = false; cssTree.walk(child, node => { if (node.type === "AttributeSelector" && cssTree.ident.decode(cssTree.generate(node.name)) === "data-nse-control") found = true; }); return found; };
      for (const child of selector.children) if (carriesControl(child)) hasControl = true;
      if (!hasControl) { needsControlScope = true; selectors.push(`:scope${exclusions} ${text}`, `:scope${exclusions}:is(${text})`); continue; }
      const children = selector.children.toArray(), modified = [];
      for (let index = 0; index < children.length; index++) {
        const child = children[index]; modified.push(cssTree.generate(child));
        if (child.type === "AttributeSelector" && drawingHooks.has(cssTree.ident.decode(cssTree.generate(child.name))) || child.type === "PseudoClassSelector" && carriesControl(child)) modified.push(exclusions);
      }
      selectors.push(modified.join(""));
    }
    const rule = `${selectors.join(",")} {${cssTree.generate(node.block).slice(1, -1)}}`;
    const next = cssTree.parse(needsControlScope ? `@scope ([data-nse-control]) to ([data-nse-control]) { ${rule} }` : rule, { parseCustomProperty: true });
    cssTree.walk(next, { visit: "Rule", enter(child) { seen.add(child); } });
    list.replace(item, next.children);
    return cssTree.walk.skip;
  } });
  const clear = clearingRules(ast.children);
  const clearLayer = clear ? "@layer clear {\n" + clear + "\n}\n" : "";
  const foreignTheme = "[" + boundary + "]:not(" + root + ")";
  const limit = app ? foreignTheme + ", [data-nse-system-surface]" : foreignTheme;
  let content = clearLayer + cssTree.generate(ast);
  if (app) {
    const { appThemeControls } = JSON.parse(readFileSync(new URL("../../tooling/nse-theme-contract.json", import.meta.url), "utf8"));
    const controls = appThemeControls.map(name => "[data-nse-control=" + JSON.stringify(name) + "]").join(",");
    // TabStrip and window titlebar cells borrow the button hook for their base drawing.
    const nestedControl = '[data-nse-control]:not([data-nse-control="button"][data-nse-part="cell"])';
    content = "@scope (:scope:is(" + controls + "), :scope :is(" + controls + ")) to (" + nestedControl + ") {\n" + content + "\n}";
  }
  // The style engine files the twins above under nothing. optimiseSelectors re-files them.
  return optimiseSelectors(`@layer ${layer} { @scope (${root}) to (${limit}) {\n${content}\n} }\n`);
}
/** Resolve local imports before wrapping: @import is not valid inside a scope. */
export function themeStylesheet(bundle, fileImport) {
  function stylesheet(file) {
    const ast = cssTree.parse(readFileSync(file, "utf8"), { parseCustomProperty: true });
    cssTree.walk(ast, { visit: "Atrule", enter(node, item, list) {
      if (node.name.toLowerCase() !== "import") return;
      const path = node.prelude.children.first.value;
      const imported = cssTree.parse(stylesheet(resolve(dirname(file), path)), { parseCustomProperty: true });
      list.replace(item, imported.children); return cssTree.walk.skip;
    } });
    const resource = value => {
      if (/^(?:data:|#|\/|[a-z]+:)/iu.test(value)) return value;
      const boundary = value.search(/[?#]/u);
      const path = boundary === -1 ? value : value.slice(0, boundary);
      const suffix = boundary === -1 ? "" : value.slice(boundary);
      return fileImport(resolve(dirname(file), decodeURIComponent(path))) + suffix;
    };
    cssTree.walk(ast, node => {
      if (node.type === "Url") node.value = resource(node.value);
      if (node.type === "Function" && ["image-set", "-webkit-image-set"].includes(node.name)) for (const child of node.children) if (child.type === "String") child.value = resource(child.value);
    });
    return cssTree.generate(ast);
  }
  const options = bundle.theme.kind === "app"
    ? { layer: /** @type {const} */ ("nse.app-theme"), boundary: /** @type {const} */ ("data-nse-app-theme") }
    : undefined;
  return scopeThemeCSS(stylesheet(bundle.stylesheetPath), bundle.theme.bundleIdentifier, options);
}
/** Only host source is inspected. Bundle Info.ts is parsed by validation, never executed. */
export function referencedThemeIdentifiers(root, bundles) {
  const known = new Set(["com.syndromatic.atmo", ...bundles.map(bundle => bundle.theme.bundleIdentifier)]), selected = new Set();
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isSymbolicLink() || ["node_modules", ".git", ".artifacts", "dist", "tests", "test", "__tests__", "docs", "scripts"].includes(entry.name) || entry.name.endsWith(".scostheme")) continue;
      if (entry.isDirectory()) { visit(file); continue; }
      if (!/\.(?:tsx?|jsx?|mjs|mts)$/u.test(entry.name) || /\.(?:test|spec)\.[^.]+$/u.test(entry.name)) continue;
      const text = readFileSync(file, "utf8");
      if (!text.includes("virtual:syncloudos/themes")) continue;
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /tsx|jsx/u.test(entry.name) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const bindings = new Set(), namespaces = new Set();
      for (const node of source.statements) if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === "virtual:syncloudos/themes") {
        const named = node.importClause?.namedBindings;
        if (named && ts.isNamedImports(named)) for (const binding of named.elements) if ((binding.propertyName?.text ?? binding.name.text) === "themes") bindings.add(binding.name.text);
        if (named && ts.isNamespaceImport(named)) namespaces.add(named.name.text);
      }
      function inspect(node) {
        if (ts.isElementAccessExpression(node) && (ts.isIdentifier(node.expression) && bindings.has(node.expression.text) || ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "themes" && namespaces.has(node.expression.expression.getText(source)))) {
          if (ts.isStringLiteralLike(node.argumentExpression)) { if (!known.has(node.argumentExpression.text)) throw new TypeError(`${file}: Unknown theme ${node.argumentExpression.text}.`); selected.add(node.argumentExpression.text); }
          else for (const id of known) selected.add(id);
        }
        ts.forEachChild(node, inspect);
      }
      inspect(source);
    }
  }
  visit(root); return selected;
}
export function themeModuleSource(bundles, selected, fileImport, stylePrefix) {
  const imports = ['import { atmoTheme as builtInAtmo } from "@syndromatic/syncloudos/nse/themes/atmo";'], entries = ['"com.syndromatic.atmo":builtInAtmo'];
  let imageIndex = 0;
  for (const bundle of bundles) {
    const theme = bundle.theme, images = {};
    if (theme.bundleIdentifier === "com.syndromatic.atmo") continue;
    const styleImport = `import ${JSON.stringify(stylePrefix + theme.bundleIdentifier + ".css")};`;
    if (theme.kind === "app") {
      if (selected.has(theme.bundleIdentifier)) imports.push(styleImport);
      entries.push(JSON.stringify(theme.bundleIdentifier) + ":freeze(" + JSON.stringify(theme) + ")");
      continue;
    }
    for (const [name, image] of Object.entries(theme.images)) {
      const files = {};
      for (const [scale, path] of Object.entries(image.files)) { const variable = `image${imageIndex++}`; imports.push(`import ${variable} from ${JSON.stringify(fileImport(resolve(bundle.bundlePath, "Contents", path)) + "?url")};`); files[scale] = variable; }
      images[name] = "{..." + JSON.stringify(image) + ",files:{" + Object.entries(files).map(([scale, variable]) => `${JSON.stringify(scale)}:${variable}`).join(",") + "}}";
    }
    if (selected.has(theme.bundleIdentifier)) imports.push(styleImport);
    entries.push(`${JSON.stringify(theme.bundleIdentifier)}:freeze({...${JSON.stringify(theme)},images:{${Object.entries(images).map(([name, code]) => `${JSON.stringify(name)}:${code}`).join(",")}}})`);
  }
  return `${imports.join("\n")}\nconst freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };\nconst values = Object.freeze({${entries.join(",")}});\nexport const themes = Object.freeze(new Proxy(values, { get(target, key, receiver) { if (typeof key === "string" && key !== "toJSON" && !(key in Object.prototype) && !Object.hasOwn(target, key)) throw new TypeError("Unknown theme: " + key); return Reflect.get(target, key, receiver); } }));\n`;
}
