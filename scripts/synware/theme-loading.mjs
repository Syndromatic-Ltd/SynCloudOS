/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as cssTree from "css-tree";
import ts from "typescript";
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
/** A partial drawing is state-specific: missing states retain the base layer's complete drawing. */
export function scopeThemeCSS(source, bundleIdentifier) {
  const ast = cssTree.parse(source, { parseCustomProperty: true });
  const seen = new WeakSet();
  cssTree.walk(ast, { visit: "Rule", enter(node, item, list) {
    if (seen.has(node)) return cssTree.walk.skip;
    const selectors = [];
    let needsControlScope = false;
    for (const selector of node.prelude.children) {
      const text = cssTree.generate(selector), exclusions = gates(text);
      if (text.includes(":scope") && !text.includes("data-nse-control") && !text.includes("data-nse-part")) { selectors.push(text); continue; }
      let hasControl = false;
      const carriesControl = child => { let found = false; cssTree.walk(child, node => { if (node.type === "AttributeSelector" && cssTree.generate(node.name) === "data-nse-control") found = true; }); return found; };
      for (const child of selector.children) if (carriesControl(child)) hasControl = true;
      if (!hasControl) { needsControlScope = true; selectors.push(`:scope${exclusions} ${text}`, `:scope${exclusions}:is(${text})`); continue; }
      const children = selector.children.toArray(), modified = [];
      for (let index = 0; index < children.length; index++) {
        const child = children[index]; modified.push(cssTree.generate(child));
        if (child.type === "AttributeSelector" && ["data-nse-control", "data-nse-part"].includes(cssTree.generate(child.name)) || child.type === "PseudoClassSelector" && carriesControl(child)) modified.push(exclusions);
      }
      selectors.push(modified.join(""));
    }
    const rule = `${selectors.join(",")} {${cssTree.generate(node.block).slice(1, -1)}}`;
    const next = cssTree.parse(needsControlScope ? `@scope ([data-nse-control]) to ([data-nse-control]) { ${rule} }` : rule, { parseCustomProperty: true });
    cssTree.walk(next, { visit: "Rule", enter(child) { seen.add(child); } });
    list.replace(item, next.children);
    return cssTree.walk.skip;
  } });
  // The style engine files the twins above under nothing; optimiseSelectors re-files them.
  return optimiseSelectors(`@layer nse.theme { @scope ([data-nse-theme="${bundleIdentifier}"]) to ([data-nse-theme]:not([data-nse-theme="${bundleIdentifier}"])) {\n${cssTree.generate(ast)}\n} }\n`);
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
    const resource = value => /^(?:data:|#|\/|[a-z]+:)/iu.test(value) ? value : fileImport(resolve(dirname(file), decodeURIComponent(value)));
    cssTree.walk(ast, node => {
      if (node.type === "Url") node.value = resource(node.value);
      if (node.type === "Function" && ["image-set", "-webkit-image-set"].includes(node.name)) for (const child of node.children) if (child.type === "String") child.value = resource(child.value);
    });
    return cssTree.generate(ast);
  }
  return scopeThemeCSS(stylesheet(bundle.stylesheetPath), bundle.theme.bundleIdentifier);
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
    for (const [name, image] of Object.entries(theme.images)) {
      const files = {};
      for (const [scale, path] of Object.entries(image.files)) { const variable = `image${imageIndex++}`; imports.push(`import ${variable} from ${JSON.stringify(fileImport(resolve(bundle.bundlePath, "Contents", path)) + "?url")};`); files[scale] = variable; }
      images[name] = "{..." + JSON.stringify(image) + ",files:{" + Object.entries(files).map(([scale, variable]) => `${JSON.stringify(scale)}:${variable}`).join(",") + "}}";
    }
    if (selected.has(theme.bundleIdentifier)) imports.push(`import ${JSON.stringify(stylePrefix + theme.bundleIdentifier + ".css")};`);
    entries.push(`${JSON.stringify(theme.bundleIdentifier)}:freeze({...${JSON.stringify(theme)},images:{${Object.entries(images).map(([name, code]) => `${JSON.stringify(name)}:${code}`).join(",")}}})`);
  }
  return `${imports.join("\n")}\nconst freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };\nconst values = Object.freeze({${entries.join(",")}});\nexport const themes = Object.freeze(new Proxy(values, { get(target, key, receiver) { if (typeof key === "string" && key !== "toJSON" && !(key in Object.prototype) && !Object.hasOwn(target, key)) throw new TypeError("Unknown theme: " + key); return Reflect.get(target, key, receiver); } }));\n`;
}
