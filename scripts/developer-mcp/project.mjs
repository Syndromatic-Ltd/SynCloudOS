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
/** Inspect only direct, top-level mount calls; never evaluate consumer code or resolve computed options. */
export function applicationHostHints(root) {
  const files=ts.sys.readDirectory(root,[".ts",".tsx",".js",".jsx",".mts",".mjs",".cts",".cjs"],["**/node_modules/**","**/.*/**","**/dist/**","**/build/**","**/coverage/**","**/tests/**","**/test/**","**/scripts/**","**/*.app/**"]);
  const calls=[];
  for (const file of files) {
    const source=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true);
    const names=new Set(), namespaces=new Set();
    for (const statement of source.statements) if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text===sdkName+"/browser" && !statement.importClause?.isTypeOnly) {
      const bindings=statement.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
      for (const binding of bindings?.elements ?? []) if (!binding.isTypeOnly && (binding.propertyName ?? binding.name).text==="mountSynCloudOS") names.add(binding.name.text);
    }
    function visit(node) {
      if (ts.isCallExpression(node) && (
        ts.isIdentifier(node.expression) && names.has(node.expression.text) ||
        ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && namespaces.has(node.expression.expression.text) && node.expression.name.text==="mountSynCloudOS"
      )) calls.push({source,node,file:slash(relative(root,file))});
      ts.forEachChild(node,visit);
    }
    if (names.size || namespaces.size) visit(source);
  }
  if (!calls.length) return {status:"not-found",reason:"No direct mountSynCloudOS import/call found in project source. Host requirements could not be assessed; re-exports, wrappers and excluded generated/test/dependency directories are not inspected."};
  if (calls.length!==1) return {status:"unresolved",reason:"Multiple mountSynCloudOS calls found; the active host cannot be selected safely."};
  const {source,node,file}=calls[0], location={file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1};
  const unresolved=reason=>({status:"unresolved",...location,reason});
  if (source.parseDiagnostics.length) return unresolved("Mount source has syntax errors; host options cannot be read safely.");
  let outer=node;
  while (ts.isAwaitExpression(outer.parent) || ts.isVoidExpression(outer.parent) || ts.isParenthesizedExpression(outer.parent)) outer=outer.parent;
  const statement=ts.isExpressionStatement(outer.parent) ? outer.parent
    : ts.isVariableDeclaration(outer.parent) && ts.isVariableDeclarationList(outer.parent.parent) && ts.isVariableStatement(outer.parent.parent.parent) ? outer.parent.parent.parent : null;
  if (statement?.parent!==source) return unresolved("Mount call is not a direct top-level expression or initialiser; control flow and shadowed imports cannot be assessed safely.");
  function properties(expression) {
    if (!expression || !ts.isObjectLiteralExpression(expression)) throw new Error("Mount options and application/authentication declarations must be inline object literals.");
    const values=new Map();
    for (const property of expression.properties) {
      const key=property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : null;
      // Shorthand members (`{ element, bundles }`) are identifiers; they only fail if the host rule needs their value.
      const initializer=ts.isPropertyAssignment(property) ? property.initializer : ts.isShorthandPropertyAssignment(property) ? property.name : null;
      if (key===null || !initializer || values.has(key)) throw new Error("Spreads, computed properties and duplicate keys prevent reliable host inspection.");
      values.set(key,initializer);
    }
    return values;
  }
  function string(expression, fallback) {
    if (expression===undefined) return fallback;
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
    throw new Error("Application id, frame and authentication policy must be literal strings.");
  }
  try {
    if (node.arguments.length!==1) return unresolved("Mount must have exactly one inline options argument.");
    const options=properties(node.arguments[0]);
    if (!options.has("application")) return {status:"checked",...location,application:null};
    const application=properties(options.get("application"));
    const id=string(application.get("id")), frame=string(application.get("frame"),"fullscreen");
    if (!id || !["fullscreen","declared"].includes(frame)) return unresolved("Primary application id/frame is missing or invalid.");
    const auth=options.get("authentication");
    const authentication=string(auth && ts.isObjectLiteralExpression(auth) ? properties(auth).get("policy") : auth,"disabled");
    if (!["disabled","optional","required"].includes(authentication)) return unresolved("Authentication policy is invalid.");
    return {status:"checked",...location,application:{id,frame},authentication};
  } catch (error) {return unresolved(error.message);}
}
