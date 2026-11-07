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

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const runtimeClientTargets = new Map([
  ["app", ["existing-client", "lifecycle"]],
  ["application", ["existing-client", "lifecycle"]],
  ["appearance", ["existing-client", "appearance"]],
  ["colourPanel", ["existing-client", "colour-panel"]],
  ["commands", ["existing-client", "commands"]],
  ["documentResources", ["existing-client", "documents"]],
  ["documentStore", ["existing-client", "documents"]],
  ["drag", ["existing-client", "drag"]],
  ["focus", ["existing-client", "responder"]],
  ["locale", ["existing-client", "locale"]],
  ["navigation", ["existing-client", "navigation"]],
  ["pasteboards", ["existing-client", "pasteboard"]],
  ["persistence", ["existing-client", "preferences"]],
  ["presentation", ["existing-client", "presentation"]],
  ["sounds", ["existing-client", "sound"]],
  ["undo", ["existing-client", "undo"]],
  ["workspaceDocuments", ["existing-client", "documents"]],
  ["animations", ["missing-client", "animation"]],
  ["errors", ["missing-client", "error"]],
  ["events", ["missing-client", "event"]],
  ["images", ["missing-client", "images"]],
  ["platform", ["missing-client", "platform"]],
  ["responderId", ["missing-client", "responder"]],
  ["settings", ["missing-client", "settings-availability"]],
  ["signal", ["missing-client", "cancellation"]],
  ["state", ["missing-client", "identity"]],
  ["text", ["missing-client", "text-layout"]],
  ["textLayout", ["missing-client", "text-layout"]],
  ["tracking", ["missing-client", "tracking"]],
  ["webContent", ["missing-client", "web-content"]],
  ["notifications", ["missing-client", "notifications"]],
]);

const mountedClientTargets = new Map([
  ...["runtimeInfo", "branding", "appId", "responderId", "sessionId", "signal"].map(name => [name, ["existing-client", "mount-identity"]]),
  ...["presentation", "lifecycle", "commands", "responders", "undo", "documents", "windows", "pasteboards", "drag", "colourPanel", "audio", "services", "navigation", "locale", "appearance", "persistence", "scheduler", "mediaQueries", "identity", "notifications", "errors", "externalActions", "share", "workArea", "settingsAvailability", "connectivity", "events", "tracking", "textLayout", "animations", "images", "filePanels", "motion", "media", "video", "location", "midi", "lumina", "haptics", "webContent", "fonts"].map(name => [name, ["existing-client", name]]),
  ["trusted", ["trusted-client", "trusted-mount"]],
]);
const mountedHooks = new Map([
  ["useSCOS", "mounted"], ["useSynApp", "mounted"],
  ["useNSEMenuPort", "mounted"], ["useFonts", "mounted.fonts"],
]);

function lexicalChecker(files) {
  const options = { noResolve: true, noLib: true, types: [], allowJs: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = pathname => files.get(resolve(pathname));
  return ts.createProgram([...files.keys()], options, host).getTypeChecker();
}

function mountedHookPath(expression, checker) {
  const call = unwrap(expression);
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
  const declarations = checker.getSymbolAtLocation(call.expression)?.declarations ?? [];
  for (const declaration of declarations) {
    if (!ts.isImportSpecifier(declaration) || declaration.isTypeOnly) continue;
    const owner = declaration.parent.parent.parent;
    if (ts.isImportDeclaration(owner) && !owner.importClause?.isTypeOnly &&
        ["@syndromatic/syncloudos", "@syndromatic/syncloudos/sdk"].includes(staticString(owner.moduleSpecifier))) {
      return mountedHooks.get(declaration.propertyName?.text ?? declaration.name.text) ?? null;
    }
  }
  return null;
}

function ambientBrowserReference(expression, checker) {
  let root = unwrap(expression);
  while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)) root = unwrap(root.expression);
  return !ts.isIdentifier(root) || !(checker.getSymbolAtLocation(root)?.declarations?.length);
}

function normalisePath(pathname) {
  return pathname.replaceAll("\\", "/");
}

function isWithin(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && relativePath !== "..");
}

function sourceKind(pathname) {
  return pathname.endsWith(".tsx") || pathname.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function sourceFile(pathname) {
  return ts.createSourceFile(pathname, readFileSync(pathname, "utf8"), ts.ScriptTarget.Latest, true, sourceKind(pathname));
}

function staticString(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function unwrap(node) {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAwaitExpression(node)) {
    node = node.expression;
  }
  return node;
}

function expressionPath(node, aliases = new Map(), checker, seen = new Set()) {
  node = unwrap(node);
  if (seen.has(node)) return null;
  seen = new Set(seen).add(node);
  if (ts.isIdentifier(node)) {
    const symbol = checker?.getSymbolAtLocation(node);
    const bound = aliases.get(symbol ?? node.text);
    if (bound) return bound;
    const declaration = symbol?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
      const inherited = mountedHookPath(declaration.initializer, checker) ?? expressionPath(declaration.initializer, aliases, checker, seen);
      if (inherited?.startsWith("mounted")) return inherited;
    }
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const base = expressionPath(node.expression, aliases, checker, seen);
    return base ? `${base}.${node.name.text}` : null;
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const base = expressionPath(node.expression, aliases, checker, seen);
    const member = staticString(unwrap(node.argumentExpression));
    return base && member ? `${base}.${member}` : null;
  }
  return null;
}

function runtimePath(node, aliases, checker) {
  const path = expressionPath(node, aliases, checker);
  return path === "runtime" || path?.startsWith("runtime.") || path === "mounted" || path?.startsWith("mounted.") ? path : null;
}

function nestedExpression(node) {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node
  );
}

function terminalExpression(node) {
  const parent = node.parent;
  if (nestedExpression(node)) return false;
  return !(ts.isCallExpression(parent) || ts.isNewExpression(parent)) || parent.expression !== node;
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function stableRecords(records) {
  return [...records].sort((left, right) =>
    left.app.localeCompare(right.app) ||
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.receiver.localeCompare(right.receiver) ||
    left.member.localeCompare(right.member) ||
    left.disposition.localeCompare(right.disposition) ||
    left.target.localeCompare(right.target));
}

// The audit reports on apps whose Info.ts the validator would reject (e.g. computed permissions), so it
// reads the identifier leniently instead of deriving the strict manifest.
function manifestBundleIdentifier(infoPath, fallback) {
  if (!existsSync(infoPath)) return fallback;
  const match = readFileSync(infoPath, "utf8").match(/\bbundleIdentifier\s*:\s*["']([^"']+)["']/u);
  return match?.[1] ?? fallback;
}

function resolveLocalModule(fromPath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromPath), specifier);
  const candidates = [
    base,
    ...sourceExtensions.map((extension) => `${base}${extension}`),
    ...sourceExtensions.map((extension) => resolve(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => (
    sourceExtensions.some((extension) => candidate.endsWith(extension)) &&
    existsSync(candidate) &&
    statSync(candidate).isFile()
  )) ?? null;
}

function localDependencies(filePath, parsed) {
  const dependencies = [];
  for (const statement of parsed.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const target = resolveLocalModule(filePath, statement.moduleSpecifier.text);
    if (target) dependencies.push(target);
  }
  const visit = (node) => {
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      ts.isIdentifier(node.expression) && node.expression.text === "require") && node.arguments[0]) {
      const specifier = staticString(node.arguments[0]);
      const target = specifier && resolveLocalModule(filePath, specifier);
      if (target) dependencies.push(target);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return dependencies;
}

function appRoots(root) {
  const synWareRoot = resolve(root, "src", "SynWare");
  if (!existsSync(synWareRoot)) return { synWareRoot, apps: [] };
  const apps = readdirSync(synWareRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
    .map((entry) => {
      const appRoot = resolve(synWareRoot, entry.name);
      const entryPath = sourceExtensions
        .map((extension) => resolve(appRoot, "Contents", `index${extension}`))
        .find((candidate) => existsSync(candidate));
      return {
        id: manifestBundleIdentifier(resolve(appRoot, "Contents", "Info.ts"), entry.name.slice(0, -4)),
        entry: entryPath ?? resolve(appRoot, "Contents", "index.tsx"),
      };
    })
    .filter(({ entry }) => existsSync(entry))
    .sort((left, right) => left.id.localeCompare(right.id));
  return { synWareRoot, apps };
}

function reachableFiles(entry, synWareRoot) {
  const queue = [entry];
  const visited = new Set();
  const files = new Map();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const parsed = sourceFile(current);
    files.set(current, parsed);
    for (const dependency of localDependencies(current, parsed)) {
      if (isWithin(synWareRoot, dependency) && !visited.has(dependency)) queue.push(dependency);
    }
  }
  return files;
}

function functionNameFromVariable(node) {
  return ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ? node.name.text
    : null;
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function createFunctionIndex(files) {
  const index = new Map();
  for (const [filePath, source] of files) {
    const info = { filePath, source, functions: new Map(), exports: new Map(), imports: new Map(), units: [] };
    const visit = (node) => {
      const name = ts.isFunctionDeclaration(node) && node.name
        ? node.name.text
        : functionNameFromVariable(node);
      if (ts.isFunctionLike(node)) {
        const key = `${filePath}:${node.getStart(source)}`;
        const unit = { key, filePath, source, node, name };
        info.units.push(unit);
        if (name) {
          info.functions.set(name, unit);
          if (isExported(node) || (ts.isVariableDeclaration(node) && isExported(node.parent.parent))) info.exports.set(name, unit);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    index.set(filePath, info);
  }

  for (const info of index.values()) {
    for (const statement of info.source.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const targetPath = resolveLocalModule(info.filePath, statement.moduleSpecifier.text);
      const target = targetPath ? index.get(targetPath) : null;
      if (!target) continue;
      const clause = statement.importClause;
      if (clause.name && target.exports.has("default")) info.imports.set(clause.name.text, target.exports.get("default"));
      if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
      for (const element of clause.namedBindings.elements) {
        const exported = element.propertyName?.text ?? element.name.text;
        const targetUnit = target.exports.get(exported);
        if (targetUnit) info.imports.set(element.name.text, targetUnit);
      }
    }
  }
  return index;
}

function addBinding(bindings, name, path) {
  const previous = bindings.get(name);
  if (previous === path) return false;
  bindings.set(name, path);
  return true;
}

function bindPattern(bindings, pattern, rootPath, checker) {
  let changed = false;
  if (ts.isIdentifier(pattern)) return addBinding(bindings, checker?.getSymbolAtLocation(pattern) ?? pattern.text, rootPath);
  if (!ts.isObjectBindingPattern(pattern)) return false;
  for (const element of pattern.elements) {
    const name = propertyName(element.propertyName ?? element.name);
    if (!name) continue;
    changed = bindPattern(bindings, element.name, rootPath ? `${rootPath}.${name}` : name, checker) || changed;
  }
  return changed;
}

function parameterSeeds(unit, inputs, checker) {
  const bindings = new Map();
  (unit.node.parameters ?? []).forEach((parameter, index) => {
    const input = inputs.get(index);
    if (input) {
      bindPattern(bindings, parameter.name, input, checker);
      return;
    }
    if (ts.isIdentifier(parameter.name) && (
      parameter.name.text === "runtime" ||
      /^(?:SynWareRuntime|AppSDKSynWareRuntime)$/u.test(parameter.type?.getText(unit.source).trim() ?? "")
    )) {
      addBinding(bindings, checker.getSymbolAtLocation(parameter.name) ?? parameter.name.text, "runtime");
      return;
    }
    if (ts.isObjectBindingPattern(parameter.name)) {
      for (const element of parameter.name.elements) {
        if (propertyName(element.propertyName ?? element.name) === "runtime") bindPattern(bindings, element.name, "runtime", checker);
      }
    }
  });
  return bindings;
}

function collectAliases(unit, bindings, checker) {
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const value = mountedHookPath(node.initializer, checker) ?? runtimePath(node.initializer, bindings, checker);
        if (value) changed = bindPattern(bindings, node.name, value, checker) || changed;
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const value = runtimePath(node.right, bindings, checker);
        const left = unwrap(node.left);
        if (value && ts.isIdentifier(left)) changed = addBinding(bindings, checker.getSymbolAtLocation(left) ?? left.text, value) || changed;
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(unit.node, visit);
  }
}

function runtimeDisposition(app, path) {
  const [owner, client] = path.split(".");
  if (owner === "mounted") return mountedClientTargets.get(client) ?? ["unresolved", `${client ?? "mount"}-authority`];
  if (app === "diagnostics" && client === "diagnostics") return ["trusted-client", "diagnostics"];
  if (app === "nse-control-gallery" && ["diagnostics", "platform"].includes(client)) return ["trusted-client", "gallery-conformance"];
  if (app === "journal-publisher" && client === "documents") return ["trusted-client", "journal-provider"];
  return runtimeClientTargets.get(client) ?? ["unresolved", `${client ?? "runtime"}-authority`];
}

function normaliseBrowserPath(path) {
  if (["matchMedia", "fetch", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"].includes(path)) {
    return `globalThis.${path}`;
  }
  if (path.startsWith("history.")) return `window.${path}`;
  if (path.startsWith("location.")) return `window.${path}`;
  return path;
}

function browserDisposition(receiver, member) {
  if (receiver === "globalThis") {
    if (member === "matchMedia") return ["existing-client", "media-query"];
    if (["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"].includes(member)) return ["existing-client", "scheduler"];
    if (member === "fetch") return ["forbidden", "network"];
  }
  if (receiver === "window") {
    if (member === "print") return ["browser-owned", "printing"];
    if (member === "visualViewport") return ["browser-owned", "visual-viewport"];
    if (member === "matchMedia") return ["existing-client", "media-query"];
    if (["addEventListener", "removeEventListener", "dispatchEvent"].includes(member)) return ["missing-client", "global-listener"];
    if (["innerWidth", "innerHeight", "outerWidth", "outerHeight", "devicePixelRatio"].includes(member)) return ["existing-client", "work-area"];
    if (["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"].includes(member)) return ["existing-client", "scheduler"];
    if (member === "open") return ["missing-client", "external-action"];
  }
  if (receiver === "window.history" || receiver === "window.location") return ["existing-client", "route"];
  if (receiver === "window.visualViewport" && ["width", "height", "scale", "offsetLeft", "offsetTop", "pageLeft", "pageTop", "addEventListener", "removeEventListener"].includes(member)) return ["browser-owned", "visual-viewport"];
  if (receiver === "navigator") {
    if (["onLine", "connection"].includes(member)) return ["existing-client", "connectivity"];
    if (member === "share") return ["missing-client", "share"];
    if (member === "clipboard") return ["missing-client", "clipboard"];
    if (member === "mediaDevices") return ["missing-client", "media"];
  }
  if (receiver === "navigator.clipboard") return ["missing-client", "clipboard"];
  if (receiver === "crypto" && member === "randomUUID") return ["existing-client", "scheduler"];
  if (receiver === "Notification") return ["missing-client", "notifications"];
  if (["localStorage", "sessionStorage"].includes(receiver)) return ["forbidden", "storage"];
  if (["XMLHttpRequest", "WebSocket"].includes(receiver)) return ["forbidden", "network"];
  return ["unresolved", "browser-authority"];
}

function browserRecord(path, construct = false) {
  path = normaliseBrowserPath(path);
  if (path.startsWith("document.") && path !== "document.cookie") return null;
  const parts = path.split(".");
  const roots = new Set(["window", "globalThis", "navigator", "crypto", "localStorage", "sessionStorage", "Notification", "XMLHttpRequest", "WebSocket"]);
  if (!roots.has(parts[0])) return null;
  if (construct) {
    const receiver = parts.join(".");
    return { receiver, member: "construct", disposition: browserDisposition(receiver, "construct") };
  }
  if (parts.length < 2) return null;
  const member = parts.at(-1);
  const receiver = parts.slice(0, -1).join(".");
  return { receiver, member, disposition: browserDisposition(receiver, member) };
}

function capabilityRecord(root, app, unit, node, receiver, member, disposition, target) {
  return {
    app,
    file: normalisePath(relative(root, unit.filePath)),
    line: lineOf(unit.source, node),
    receiver,
    member,
    disposition,
    target,
  };
}

function recordKey(record) {
  return [record.app, record.file, record.line, record.receiver, record.member, record.disposition, record.target].join("\0");
}

function auditApp(root, descriptor, synWareRoot) {
  const files = reachableFiles(descriptor.entry, synWareRoot);
  const checker = lexicalChecker(files);
  const index = createFunctionIndex(files);
  const units = [...index.values()].flatMap((info) => [
    ...info.units,
    { key: `${info.filePath}:source`, filePath: info.filePath, source: info.source, node: info.source, name: null },
  ]);
  const inputs = new Map(units.map((unit) => [unit.key, new Map()]));
  const runtimeRecords = new Map();
  const passThroughs = new Map();
  const browserRecords = new Map();
  const unresolved = new Map();
  const add = (collection, record) => collection.set(recordKey(record), record);
  const markInput = (target, index, path) => {
    const state = inputs.get(target.key);
    if (!state || state.get(index) === path) return false;
    state.set(index, path);
    return true;
  };

  let changed = true;
  for (let iteration = 0; changed && iteration < units.length + 1; iteration += 1) {
    changed = false;
    runtimeRecords.clear(); passThroughs.clear(); browserRecords.clear(); unresolved.clear();
    for (const unit of units) {
      const bindings = parameterSeeds(unit, inputs.get(unit.key) ?? new Map(), checker);
      collectAliases(unit, bindings, checker);
      const fileIndex = index.get(unit.filePath);
      const targetForCall = (node) => {
        if (!ts.isIdentifier(node.expression)) return null;
        return fileIndex?.functions.get(node.expression.text) ?? fileIndex?.imports.get(node.expression.text) ?? null;
      };
      const addRuntime = (node, path) => {
        const parts = path.replace(/^mounted(?=\.|$)/u, "runtime").split(".");
        const member = parts.at(-1);
        const receiver = parts.slice(0, -1).join(".") || "runtime";
        const [disposition, target] = runtimeDisposition(descriptor.id, path);
        const record = capabilityRecord(root, descriptor.id, unit, node, receiver, member, disposition, target);
        add(runtimeRecords, record);
        if (disposition === "unresolved") add(unresolved, record);
      };
      const addBrowser = (node, path, construct = false) => {
        if (!ambientBrowserReference(node, checker)) return;
        const browser = browserRecord(path, construct);
        if (!browser) return;
        const [disposition, target] = browser.disposition;
        const record = capabilityRecord(root, descriptor.id, unit, node, browser.receiver, browser.member, disposition, target);
        add(browserRecords, record);
        if (disposition === "unresolved") add(unresolved, record);
      };
      const visit = (node) => {
        if (ts.isCallExpression(node)) {
          const capability = runtimePath(node.expression, bindings, checker);
          if (capability) addRuntime(node.expression, capability);
          const browser = expressionPath(node.expression);
          if (browser) addBrowser(node.expression, browser);
          const target = targetForCall(node);
          if (target) {
            node.arguments.forEach((argument, parameterIndex) => {
              const path = runtimePath(argument, bindings, checker);
              if (!path) return;
              const [disposition] = runtimeDisposition(descriptor.id, path);
              add(passThroughs, capabilityRecord(root, descriptor.id, unit, argument, path, "pass-through", disposition, target.name ?? "local-helper"));
              changed = markInput(target, parameterIndex, path) || changed;
            });
          }
        }
        if (ts.isNewExpression(node)) {
          const browser = expressionPath(node.expression);
          if (browser) addBrowser(node.expression, browser, true);
        }
        if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && terminalExpression(node)) {
          const capability = runtimePath(node, bindings, checker);
          if (capability) addRuntime(node, capability);
          const browser = expressionPath(node);
          if (browser) addBrowser(node, browser);
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(unit.node, visit);
    }
  }
  return {
    apps: stableRecords(runtimeRecords.values()),
    passThroughs: stableRecords(passThroughs.values()),
    browserAuthority: stableRecords(browserRecords.values()),
    unresolved: stableRecords(unresolved.values()),
  };
}

// Deliberately separate from the historical runtime inventory: provenance comes
// from lexical symbols and actual public imports, never from matching client names.
const fxHooks = new Map([
  ["useSCOS", "context"], ["useSynApp", "context"],
  ["useMedia", "media.client"], ["useVideo", "video.session"],
  ["useMIDI", "midi.session"], ["useLocation", "location.session"],
  ["useLumina", "lumina.client"],
]);
const newFxFamilies = new Set(["media", "video", "midi", "location", "lumina"]);

function auditFxApp(root, descriptor, synWareRoot) {
  const files = reachableFiles(descriptor.entry, synWareRoot);
  const infoPath = resolve(dirname(descriptor.entry), "Info.ts");
  if (existsSync(infoPath)) files.set(infoPath, sourceFile(infoPath));
  // Only bind the app's local graph. This is not an SDK build/type check and must
  // not traverse the changing framework source or treat type annotations as authority.
  const checker = lexicalChecker(files);
  const calls = [], assignments = [], functions = new Map(), inputs = new Map(), writes = new Map();
  const symbol = node => checker.getSymbolAtLocation(node);
  const union = (...sets) => new Set(sets.flatMap(set => [...set]));
  const singleton = value => new Set([value]);
  const empty = () => new Set();
  const functionTag = node => {
    const key = `function:${node.getSourceFile().fileName}:${node.pos}`;
    functions.set(key, node); return key;
  };
  for (const file of files.values()) {
    const visit = node => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) calls.push(node);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) assignments.push(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  const enclosingModule = node => {
    while (node && !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) node = node.parent;
    return node;
  };
  function exported(from, specifier, name, seen) {
    if (specifier === "@syndromatic/syncloudos" || specifier === "@syndromatic/syncloudos/sdk") return singleton(name === "*" ? "sdk" : `sdk.${name}`);
    if (specifier.startsWith("@syndromatic/syncloudos/fx/")) {
      const family = specifier.slice("@syndromatic/syncloudos/fx/".length);
      return newFxFamilies.has(family) ? singleton(`value:${family}.${name}`) : empty();
    }
    const target = files.has(specifier) ? specifier : resolveLocalModule(from.fileName, specifier);
    const file = target && files.get(target);
    if (!file) return empty();
    const key = `${target}:${name}`;
    if (seen.has(key)) return empty();
    seen = new Set(seen).add(key);
    if (name === "*") return singleton(`module:${target}`);
    for (const statement of file.statements) {
      if (ts.isExportDeclaration(statement)) {
        const spec = statement.moduleSpecifier && staticString(statement.moduleSpecifier);
        if (!statement.exportClause && spec) {
          const result = exported(file, spec, name, seen); if (result.size) return result;
        }
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          const element = statement.exportClause.elements.find(item => item.name.text === name && !item.isTypeOnly);
          if (element) return spec ? exported(file, spec, element.propertyName?.text ?? name, seen) : value(element.propertyName ?? element.name, seen);
        }
      }
      if (name === "default" && ts.isExportAssignment(statement)) return value(statement.expression, seen);
      if (isExported(statement)) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return singleton(functionTag(statement));
        if (ts.isVariableStatement(statement)) {
          const declaration = statement.declarationList.declarations.find(item => ts.isIdentifier(item.name) && item.name.text === name);
          if (declaration?.initializer) return value(declaration.initializer, seen);
        }
      }
    }
    return empty();
  }
  function member(base, name, node, seen) {
    return union(...[...base].map(tag => {
      if (tag.startsWith("module:")) return exported(node.getSourceFile(), tag.slice(7), name, seen);
      if (tag === "context" && newFxFamilies.has(name)) return singleton(`${name}.client`);
      return singleton(`${tag}.${name}`);
    }));
  }
  function declarationValue(declaration, seen) {
    if (ts.isImportSpecifier(declaration) || ts.isNamespaceImport(declaration) || ts.isImportClause(declaration)) {
      const owner = enclosingModule(declaration);
      if (!owner || owner.importClause?.isTypeOnly || declaration.isTypeOnly) return empty();
      const name = ts.isNamespaceImport(declaration) ? "*" : ts.isImportClause(declaration) ? "default" : declaration.propertyName?.text ?? declaration.name.text;
      return exported(owner.getSourceFile(), owner.moduleSpecifier.text, name, seen);
    }
    if (ts.isBindingElement(declaration)) {
      const owner = declaration.parent.parent;
      const base = ts.isBindingElement(owner) ? declarationValue(owner, seen) : owner.initializer ? value(owner.initializer, seen) : inputs.get(owner) ?? empty();
      return member(base, propertyName(declaration.propertyName ?? declaration.name) ?? "*", declaration, seen);
    }
    if (ts.isParameter(declaration)) return inputs.get(declaration) ?? empty();
    if (ts.isFunctionDeclaration(declaration)) return singleton(functionTag(declaration));
    return declaration.initializer ? value(declaration.initializer, seen) : empty();
  }
  function value(expression, seen = new Set()) {
    if (!expression) return empty();
    const node = unwrap(expression);
    if (seen.has(node)) return empty();
    seen = new Set(seen).add(node);
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return singleton(functionTag(node));
    if (ts.isIdentifier(node)) {
      const binding = symbol(node);
      return union(writes.get(binding) ?? empty(), ...(binding?.declarations ?? []).map(item => declarationValue(item, seen)));
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const name = ts.isPropertyAccessExpression(node) ? node.name.text : staticValue(node.argumentExpression);
      return member(value(node.expression, seen), typeof name === "string" ? name : "*", node, seen);
    }
    if (ts.isConditionalExpression(node)) return union(value(node.whenTrue, seen), value(node.whenFalse, seen));
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require" && !symbol(node.expression)?.declarations?.length) {
        const specifier = node.arguments[0] && staticString(node.arguments[0]);
        return specifier ? exported(node.getSourceFile(), specifier, "*", seen) : empty();
      }
      return union(...[...value(node.expression, seen)].map(tag => {
        if (tag.startsWith("sdk.") && fxHooks.has(tag.slice(4))) return singleton(fxHooks.get(tag.slice(4)));
        if (/^(location|video|midi|lumina)\.client\.create(Manager|CaptureSession|Access|Index)$/u.test(tag)) return singleton(`${tag.split(".")[0]}.session`);
        const fn = functions.get(tag);
        if (!fn?.body || seen.has(fn)) return empty();
        const nextSeen = new Set(seen).add(fn);
        if (!ts.isBlock(fn.body)) return value(fn.body, nextSeen);
        const returns = [];
        const visit = child => {
          if (ts.isReturnStatement(child)) returns.push(value(child.expression, nextSeen));
          else if (!ts.isFunctionLike(child)) ts.forEachChild(child, visit);
        };
        visit(fn.body); return union(...returns);
      }));
    }
    return empty();
  }
  function staticValue(expression, seen = new Set()) {
    if (!expression) return undefined;
    const node = unwrap(expression);
    if (seen.has(node)) return undefined;
    seen = new Set(seen).add(node);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isIdentifier(node)) {
      const declaration = symbol(node)?.valueDeclaration;
      return declaration?.initializer ? staticValue(declaration.initializer, seen) : undefined;
    }
    if (ts.isArrayLiteralExpression(node)) {
      const values = node.elements.map(item => staticValue(item, seen));
      return values.includes(undefined) ? undefined : values;
    }
    if (ts.isObjectLiteralExpression(node)) {
      const result = {};
      for (const property of node.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
          const binding = checker.getShorthandAssignmentValueSymbol(property);
          result[property.name.text] = staticValue(binding?.valueDeclaration?.initializer, seen);
        } else if (ts.isPropertyAssignment(property)) result[propertyName(property.name)] = staticValue(property.initializer, seen);
        else return undefined;
      }
      return result;
    }
    return undefined;
  }
  // Monotone propagation follows actual local calls, including parameter aliases,
  // without confusing unrelated same-name functions in other lexical scopes.
  const merge = (map, key, incoming) => {
    if (!key) return false;
    const previous = map.get(key) ?? empty();
    const next = union(previous, incoming);
    if (next.size === previous.size) return false;
    map.set(key, next); return true;
  };
  for (let iteration = 0; iteration <= calls.length + assignments.length; iteration++) {
    let changed = false;
    for (const assignment of assignments) if (ts.isIdentifier(assignment.left)) changed = merge(writes, symbol(assignment.left), value(assignment.right)) || changed;
    for (const call of calls) for (const tag of value(call.expression)) {
      const fn = functions.get(tag);
      if (fn) fn.parameters.forEach((parameter, index) => { changed = merge(inputs, parameter, value(call.arguments?.[index])) || changed; });
    }
    if (!changed) break;
  }
  const info = files.get(infoPath);
  const exportedInfo = info?.statements.find(ts.isExportAssignment);
  const manifest = exportedInfo && staticValue(exportedInfo.expression);
  const permissions = manifest?.permissions ?? (manifest && !Object.hasOwn(manifest, "permissions") ? [] : undefined);
  const knownPermissions = Array.isArray(permissions) && permissions.every(item => typeof item === "string");
  const usage = [], violations = [];
  const record = (node, family, operation, required = [], anyOf = false, computed = false) => {
    const missing = required.filter(permission => !knownPermissions || !permissions.includes(permission));
    const failed = computed || (anyOf ? missing.length === required.length : missing.length > 0);
    const file = normalisePath(relative(root, node.getSourceFile().fileName));
    const line = lineOf(node.getSourceFile(), node);
    const item = { app: descriptor.id, file, line, location: `${file}:${line}`, family, operation, required, anyOf, missing: failed ? missing : [] };
    usage.push(item);
    if (failed) violations.push({ ...item, reason: computed ? "FX authority uses a computed member that cannot be audited" : !knownPermissions ? "FX permissions must be statically declared in Info.ts" : `Undeclared FX capability: ${anyOf ? "one of " : ""}${missing.join(", ")}` });
  };
  for (const call of calls) for (const tag of value(call.expression)) {
    if (tag.startsWith("value:")) { const operation = tag.slice(6); record(call, operation.split(".")[0], operation); continue; }
    if (tag === "sdk.useLocation") { record(call, "location", "location.createManager", ["location.read"]); continue; }
    if (tag.startsWith("context.") && tag.includes("*")) { record(call, "context", tag, [], false, true); continue; }
    const [family, owner, method] = tag.split(".");
    if (!newFxFamilies.has(family) || !["client", "session"].includes(owner)) continue;
    const operation = `${family}.${method}`;
    if (tag.includes("*")) { record(call, family, operation, [], false, true); continue; }
    let required = [], anyOf = false;
    if (family === "location") required = ["current", "watch"].includes(method) ? ["location.read", "location.request"] : method === "createManager" ? ["location.read"] : [];
    if (family === "video") required = method === "requestDisplay" ? ["video.capture.display"] : method === "requestCamera" ? ["video.capture.camera"] : [];
    if (family === "midi" && ["requestAuthorization", "subscribeEndpoints", "subscribeInput", "acquireOutput"].includes(method)) {
      required = ["midi.access"];
      const request = call.arguments?.[0] ? staticValue(call.arguments[0]) : {};
      if (method === "requestAuthorization" && (!request || request.sysex === true || Object.hasOwn(request, "sysex") && request.sysex !== false)) required.push("midi.sysex");
    }
    if (family === "lumina") {
      if (["query", "suggest", "snapshot"].includes(method)) required = ["lumina.query"];
      if (["upsert", "delete", "deleteDomain"].includes(method)) required = ["lumina.index"];
      if (method === "createIndex") { required = ["lumina.index", "lumina.query"]; anyOf = true; }
    }
    record(call, family, operation, required, anyOf);
  }
  return { usage, violations };
}

export function auditSynWareFXCapabilities(root = repositoryRoot) {
  root = resolve(root);
  const { synWareRoot, apps } = appRoots(root);
  const results = apps.map(app => auditFxApp(root, app, synWareRoot));
  return { fxUsage: results.flatMap(result => result.usage), fxViolations: results.flatMap(result => result.violations) };
}

export function auditSynWareCapabilityUsage(root = repositoryRoot) {
  root = resolve(root);
  const { synWareRoot, apps } = appRoots(root);
  const auditedAppIds = apps.map(({ id }) => id).sort();
  const aggregate = { apps: [], passThroughs: [], browserAuthority: [], unresolved: [] };
  for (const app of apps) {
    const audit = auditApp(root, app, synWareRoot);
    aggregate.apps.push(...audit.apps);
    aggregate.passThroughs.push(...audit.passThroughs);
    aggregate.browserAuthority.push(...audit.browserAuthority);
    aggregate.unresolved.push(...audit.unresolved);
  }
  return Object.freeze({
    ...auditSynWareFXCapabilities(root),
    auditedAppIds: Object.freeze(auditedAppIds),
    apps: Object.freeze(stableRecords(aggregate.apps)),
    passThroughs: Object.freeze(stableRecords(aggregate.passThroughs)),
    browserAuthority: Object.freeze(stableRecords(aggregate.browserAuthority)),
    unresolved: Object.freeze(stableRecords(aggregate.unresolved)),
  });
}

export function capabilityMatrixPath(root = repositoryRoot) {
  return resolve(root, ".artifacts", "synware", "capability-audit.json");
}

export function writeCapabilityMatrix(root = repositoryRoot, audit = auditSynWareCapabilityUsage(root)) {
  const matrix = {
    schemaVersion: 1,
    auditedAppIds: audit.auditedAppIds,
    apps: audit.apps,
    passThroughs: audit.passThroughs,
    browserAuthority: audit.browserAuthority,
    unresolved: audit.unresolved,
    fxUsage: audit.fxUsage,
    fxViolations: audit.fxViolations,
  };
  const target = capabilityMatrixPath(root);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(matrix, null, 2)}\n`);
  return target;
}

export function main(arguments_ = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const rootArgument = arguments_.find(argument => argument !== "--check");
  const root = rootArgument ? resolve(rootArgument) : repositoryRoot;
  const audit = auditSynWareCapabilityUsage(root);
  if (audit.auditedAppIds.length === 0) {
    stderr.write(`No SynWare applications found in ${root}; provide the consumer repository root.\n`);
    return 1;
  }
  if (audit.unresolved.length > 0 || audit.fxViolations.length > 0 || audit.browserAuthority.some(record => record.disposition === "forbidden")) {
    stderr.write(`${JSON.stringify(audit, null, 2)}\n`);
    return 1;
  }
  const target = arguments_.includes("--check") ? null : writeCapabilityMatrix(root, audit);
  stdout.write(`SynWare capability authority audit passed: ${audit.auditedAppIds.length} applications, ${audit.apps.length} runtime records, ${audit.browserAuthority.length} browser records.\n`);
  stdout.write(`FX declaration audit: ${audit.fxUsage.length} scoped operations, zero violations.\n`);
  if (target) stdout.write(`Capability matrix written: ${normalisePath(relative(root, target))}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
