/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import ts from "typescript";
export const sdkName = "@syndromatic/syncloudos";
export { bundlePaths } from "../synware/bundle-paths.mjs";
export const json = path => JSON.parse(readFileSync(path,"utf8"));
export const slash = path => path.replaceAll("\\","/");
export function inside(root, path) {
  const part = relative(root,path);
  return part === "" || (!part.startsWith(".." + "/") && !part.startsWith(".." + "\\") && part !== ".." && !isAbsolute(part));
}
export function projectContext(start = process.cwd()) {
  let root = resolve(start);
  if (existsSync(root) && lstatSync(root).isFile()) root = dirname(root);
  while (!existsSync(resolve(root,"package.json"))) {
    const parent = dirname(root);
    if (parent === root) throw new Error("No project package.json found above " + start);
    root = parent;
  }
  const require = createRequire(resolve(root,"package.json"));
  let sdkRoot;
  try {
    let candidate = dirname(require.resolve(sdkName + "/sdk"));
    while (dirname(candidate) !== candidate) {
      if (existsSync(resolve(candidate,"package.json")) && json(resolve(candidate,"package.json")).name === sdkName) { sdkRoot = candidate; break; }
      candidate = dirname(candidate);
    }
  } catch { /* Declaration-only fixtures and package managers may not expose a runtime entry. */ }
  if (!sdkRoot) {
    let candidate = root;
    while (true) {
      const installed = resolve(candidate,"node_modules",sdkName);
      if (existsSync(resolve(installed,"package.json"))) { sdkRoot = realpathSync(installed); break; }
      if (dirname(candidate) === candidate) break;
      candidate = dirname(candidate);
    }
  }
  if (!sdkRoot) throw new Error("Install " + sdkName + " in the consumer project first.");
  const sdk = json(resolve(sdkRoot,"package.json"));
  const ownManifest = json(new URL("../../package.json",import.meta.url));
  if (sdk.version !== ownManifest.version) throw new Error(`Developer MCP ${ownManifest.version} requires installed SDK ${ownManifest.version}, found ${sdk.version}.`);
  return {root,require,sdkRoot,sdk,manifest:json(resolve(root,"package.json"))};
}
/** Read configuration hints without executing user configuration or plugins. Computed values need explicit overrides. */
export function viteHints(root, overrides = {}) {
  const config = ["ts","mts","js","mjs","cts","cjs"].map(ext => resolve(root,"vite.config."+ext)).find(existsSync);
  const options = {};
  const unresolved = [];
  let pluginPresent = false;
  if (config) {
    const source = ts.createSourceFile(config,readFileSync(config,"utf8"),ts.ScriptTarget.Latest,true);
    const names = new Set();
    for (const statement of source.statements) if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === sdkName+"/vite") {
      for (const binding of statement.importClause?.namedBindings?.elements ?? []) if ((binding.propertyName ?? binding.name).text === "synCloudOS") names.add(binding.name.text);
    }
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)) {
        if (pluginPresent) unresolved.push("appsDirectory", "webspringEntry");
        pluginPresent = true;
        const argument = node.arguments[0];
        if (argument && !ts.isObjectLiteralExpression(argument)) unresolved.push("appsDirectory", "webspringEntry");
        if (argument && ts.isObjectLiteralExpression(argument)) for (const property of argument.properties) {
          if (ts.isSpreadAssignment(property) || (property.name && ts.isComputedPropertyName(property.name))) {
            unresolved.push("appsDirectory", "webspringEntry");
            continue;
          }
          const key = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : null;
          if (!["appsDirectory","webspringEntry"].includes(key)) continue;
          if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) options[key] = property.initializer.text;
          else if (ts.isPropertyAssignment(property) && key === "webspringEntry" && property.initializer.kind === ts.SyntaxKind.FalseKeyword) options[key] = false;
          else unresolved.push(key);
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
  return {config:config ? slash(relative(root,config)) : null,pluginPresent,options:{...options,...overrides},unresolved};
}
