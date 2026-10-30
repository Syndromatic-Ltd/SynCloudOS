/*
 * SynCloudOS
 * Copyright Â© 2026 Syndromatic Ltd. All rights reserved.
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

/**
 * Hot reload for application modules (dev server only).
 *
 * A module that default-exports a class is made a hot-reload boundary: this
 * transform appends a call that registers the module's classes with the
 * runtime, together with a signature of each class's fields. The runtime
 * (`src/SynCloudOS/AppHosting/applicationHotReload.ts`) compares signatures between
 * two versions of the module: equal means live instances take the new class's
 * methods; different means that application relaunches.
 *
 * The signature covers what a method swap cannot repair: field declarations
 * and initialisers (static and instance, with their decorators), the
 * constructor, the `extends` clause and class decorators. A class with private
 * members (`#field`, `#method`) or a static block signs its whole source,
 * because the brand of a `#field` belongs to the class that declared it.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);
const runtimeSpecifier = "@syndromatic/syncloudos/sdk";
const boundaryExport = "NSEApplicationHotBoundary";
const sourceFile = /\.(?:[cm]?[jt]sx?)$/u;

let babelParser;
function loadBabelParser() {
  if (babelParser) return babelParser;
  try {
    // @babel/parser belongs to @babel/core, which belongs to the React plugin
    // this package already depends on: resolve through that chain, so a strict
    // package manager finds the copy the React plugin itself uses.
    const reactRequire = createRequire(requireFromHere.resolve("@vitejs/plugin-react"));
    const coreRequire = createRequire(reactRequire.resolve("@babel/core"));
    babelParser = coreRequire("@babel/parser");
  } catch (error) {
    throw new Error("SynCloudOS application hot reload needs @babel/parser, which comes with @vitejs/plugin-react.", { cause: error });
  }
  return babelParser;
}

function parseModule(code) {
  return loadBabelParser().parse(code, {
    sourceType: "module",
    allowAwaitOutsideFunction: true,
    plugins: ["typescript", "jsx", "decorators", "decoratorAutoAccessors"],
  });
}

const hash = (value) => createHash("sha1").update(value).digest("hex").slice(0, 16);

function classDeclarationOf(statement) {
  if (statement.type === "ClassDeclaration") return statement;
  if ((statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration") && statement.declaration?.type === "ClassDeclaration") return statement.declaration;
  return null;
}

function sourceOf(code, node) {
  return node ? code.slice(node.start, node.end) : "";
}

function memberKey(code, member) {
  return member.computed ? `[${sourceOf(code, member.key)}]` : sourceOf(code, member.key);
}

/** What a method swap cannot repair, as text. Methods are deliberately absent. */
function ownShape(code, node) {
  const parts = [`extends ${sourceOf(code, node.superClass)}`, ...(node.decorators ?? []).map((decorator) => `@${sourceOf(code, decorator.expression)}`)];
  const dependencies = [node.superClass, ...(node.decorators ?? []).map(decorator => decorator.expression)];
  let unswappable = false;
  for (const member of node.body.body) {
    switch (member.type) {
      case "ClassProperty":
      case "ClassAccessorProperty":
        parts.push(`${member.static ? "static " : ""}${member.type === "ClassAccessorProperty" ? "accessor " : ""}${(member.decorators ?? []).map((decorator) => `@${sourceOf(code, decorator.expression)}`).join(" ")} ${memberKey(code, member)} = ${sourceOf(code, member.value)}`);
        dependencies.push(member.value, ...(member.decorators ?? []).map(decorator => decorator.expression));
        break;
      case "ClassMethod":
        if (member.kind === "constructor" || (member.static && memberKey(code, member) === "viewDependencies")) {
          parts.push(sourceOf(code, member));
          dependencies.push(member);
        } else if (member.decorators?.length) {
          // Lifetimes and declaration options cannot be repaired by swapping the method body.
          parts.push(`${member.static ? "static " : ""}method ${memberKey(code, member)} ${(member.decorators ?? []).map(decorator => `@${sourceOf(code, decorator.expression)}`).join(" ")}`);
          dependencies.push(...member.decorators.map(decorator => decorator.expression));
        }
        break;
      case "ClassPrivateProperty":
      case "ClassPrivateMethod":
      case "StaticBlock":
        unswappable = true;
        break;
      default:
        break;
    }
  }
  return { text: parts.join("\n"), unswappable, dependencies };
}

/** Resource initializers may refer to a descriptor/helper declared beside the class. */
function resourceBindingText(code, nodes, bindings) {
  const found = new Set();
  const scan = node => {
    if (!node || typeof node !== "object") return;
    if (node.type === "Identifier" && bindings.has(node.name) && !found.has(node.name)) {
      found.add(node.name);
      scan(bindings.get(node.name));
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "extra" || key.endsWith("Comments")) continue;
      if (Array.isArray(value)) value.forEach(scan);
      else if (value && typeof value === "object" && typeof value.type === "string") scan(value);
    }
  };
  nodes.forEach(scan);
  return [...found].sort().map(name => `${name}: ${sourceOf(code, bindings.get(name))}`).join("\n");
}

/**
 * The signature of each top-level class, keyed by binding name. A class's
 * signature includes that of its superclass when the superclass is declared in
 * the same module, since a field change there changes every subclass instance.
 */
function classSignatures(code, classes, bindings) {
  const signatures = new Map();
  const visit = (name, active) => {
    if (signatures.has(name)) return signatures.get(name);
    const node = classes.get(name);
    const shape = ownShape(code, node);
    const superName = node.superClass?.type === "Identifier" ? node.superClass.name : null;
    const inherited = superName && classes.has(superName) && !active.has(superName) ? visit(superName, new Set([...active, name])) : "";
    const signature = hash(`${shape.unswappable ? sourceOf(code, node) : shape.text}\n${resourceBindingText(code, shape.dependencies, bindings)}\n${inherited}`);
    signatures.set(name, signature);
    return signature;
  };
  for (const name of classes.keys()) visit(name, new Set());
  return signatures;
}

/**
 * Reads an application module: its default-exported class, every named
 * top-level class and their signatures. Returns null when the module does not
 * default-export a class that extends something.
 */
export function analyseApplicationModule(code) {
  if (!/export\s+default\s/u.test(code) || !/\bclass\b/u.test(code)) return null;
  let program;
  try {
    program = parseModule(code).program;
  } catch {
    return null;
  }
  const classes = new Map();
  const bindings = new Map();
  for (const statement of program.body) {
    const declaration = classDeclarationOf(statement);
    if (declaration?.id) classes.set(declaration.id.name, declaration);
    const value = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (value?.type === "VariableDeclaration") {
      for (const variable of value.declarations) if (variable.id.type === "Identifier" && variable.init) bindings.set(variable.id.name, variable.init);
    } else if (value?.type === "FunctionDeclaration" && value.id) bindings.set(value.id.name, value);
  }
  let defaultClass = null;
  const exportedClasses = new Set();
  for (const statement of program.body) {
    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = statement.declaration;
      if (declaration.type === "ClassDeclaration" && declaration.id) defaultClass = declaration.id.name;
      else if (declaration.type === "Identifier" && classes.has(declaration.name)) defaultClass = declaration.name;
    } else if (statement.type === "ExportNamedDeclaration") {
      const declaration = statement.declaration;
      if (declaration?.type === "ClassDeclaration" && declaration.id) exportedClasses.add(declaration.id.name);
      for (const specifier of statement.specifiers ?? []) {
        if (specifier.type === "ExportSpecifier" && specifier.local?.type === "Identifier" && classes.has(specifier.local.name)) {
          exportedClasses.add(specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value);
        }
      }
    }
  }
  if (!defaultClass || !classes.get(defaultClass)?.superClass) return null;
  const signatures = classSignatures(code, classes, bindings);
  return { defaultClass, classes: [...classes.keys()], signatures, ignoredExports: ["default", ...exportedClasses] };
}

/** The code appended to an application module. */
function hotRegistrationCode(id, analysis) {
  const classEntries = analysis.classes.map((name) => `${JSON.stringify(name)}: ${name}`).join(", ");
  const signatureEntries = analysis.classes.map((name) => `${JSON.stringify(name)}: ${JSON.stringify(analysis.signatures.get(name))}`).join(", ");
  return `
import { registerApplicationHotModule as __nseRegisterApplicationHotModule, acceptApplicationHotUpdate as __nseAcceptApplicationHotUpdate } from ${JSON.stringify(runtimeSpecifier)};
__nseRegisterApplicationHotModule(import.meta.hot, { id: ${JSON.stringify(id)}, defaultClass: ${JSON.stringify(analysis.defaultClass)}, classes: { ${classEntries} }, signatures: { ${signatureEntries} }, ignoredExports: ${JSON.stringify(analysis.ignoredExports)}, refreshHost: globalThis });
/** Marks the module as a React Fast Refresh boundary: the classes it exports are not components, this export is. */
export function ${boundaryExport}() { return null; }
if (import.meta.hot) {
  import.meta.hot.accept((next) => __nseAcceptApplicationHotUpdate(import.meta.hot, next));
}
`;
}

/**
 * The hooks the Vite plugin adds for application hot reload: a transform that
 * registers application modules, and the test `handleHotUpdate` uses to leave
 * an application module's own update alone instead of reloading the page.
 */
export function createApplicationHotReload() {
  const hotModules = new Set();
  return {
    transform(code, id) {
      const file = id.split("?")[0];
      if (this.environment?.mode !== "dev" || this.environment.config?.consumer === "server") return null;
      if (!sourceFile.test(file) || file.includes("/node_modules/") || file.includes("\\node_modules\\")) return null;
      hotModules.delete(file);
      const analysis = analyseApplicationModule(code);
      if (!analysis) return null;
      hotModules.add(file);
      return { code: code + hotRegistrationCode(file, analysis), map: null };
    },
    /** True when every module an update touches is an application module that takes its own update. */
    acceptsHotUpdate(context) {
      const modules = context?.modules ?? [];
      return modules.length > 0 && modules.every((module) => typeof module.file === "string" && hotModules.has(module.file));
    },
  };
}
