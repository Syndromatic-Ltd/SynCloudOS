/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// The idiom audit tells an agent whether a valid SynWare is also an idiomatic
// one. "0 errors" from the structural validator only means the bundle loads;
// definite misuse is an error; uncertain patterns remain warnings.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { inspectIdiomErrors, inspectStyleErrors, rendererOwnedRegions, withinRendererRegion, interactiveTable } from "./idiom-errors.mjs";
import { inspectIdiomWarnings, inspectUnusedResources } from "./idiom-warnings.mjs";

const SOURCE = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs"];
const STYLE = [".css"];
const MAX_FILES = 400;
const RAW_CONTROLS = new Set(["button", "input", "select", "textarea", "table"]);

function slash(path) { return path.split(sep).join("/"); }
function lineOf(text, index) { return text.slice(0, index).split("\n").length; }
function resolveLocal(fromFile, specifier, root) {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, ...SOURCE.map(extension => base + extension), ...SOURCE.map(extension => resolve(base, "index" + extension))];
  // TypeScript ESM projects import "./x.js" for "./x.ts".
  if (/\.[cm]?js$/u.test(base)) candidates.push(...[".ts", ".tsx", ".mts"].map(extension => base.replace(/\.[cm]?js$/u, extension)));
  for (const candidate of candidates) {
    if (!candidate.startsWith(root + sep) || candidate.includes(`${sep}node_modules${sep}`)) continue;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every local source and stylesheet an entry reaches through relative imports. */
export function collectLocalModuleGraph(entry, root) {
  const files = new Set(), queue = [entry];
  while (queue.length && files.size < MAX_FILES) {
    const file = queue.shift();
    if (files.has(file)) continue;
    files.add(file);
    if (!SOURCE.includes(extname(file))) continue;
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, extname(file) === ".tsx" || extname(file) === ".jsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = node => {
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text;
      else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text;
      if (specifier?.startsWith(".")) {
        const target = resolveLocal(file, specifier.replace(/\?.*$/u, ""), root);
        if (target && (SOURCE.includes(extname(target)) || STYLE.includes(extname(target)))) queue.push(target);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...files];
}

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "coverage", "out", ".artifacts", ".turbo", ".next"]);
/** Project stylesheets outside dependencies and build output, wherever the host imports them. */
export function collectProjectStylesheets(root) {
  const found = [], pending = [root];
  while (pending.length && found.length < MAX_FILES) {
    const directory = pending.pop();
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) { if (!SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".vite")) pending.push(path); }
      else if (STYLE.includes(extname(entry.name))) found.push(path);
    }
  }
  return found.sort();
}

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.[jt]sx$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function calleeName(node) {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

/** Strips `as`, `satisfies`, `!` and parentheses. */
function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node;
}
/**
 * Whether a preference value is visibly structured: an object or array literal, a chain built on
 * one (`[...saved, entry].slice(-50)`), JSON.stringify(...), or a local variable initialised that
 * way. Anything the audit cannot see (a parameter, a call result) is not reported.
 */
function isStructuredValue(node, locals, depth = 0) {
  node = unwrap(node);
  if (!node || depth > 4) return false;
  if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) return true;
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === "stringify" && ts.isIdentifier(callee.expression) && callee.expression.text === "JSON") return true;
    if (ts.isPropertyAccessExpression(callee)) return isStructuredValue(callee.expression, locals, depth + 1);
    return false;
  }
  if (ts.isPropertyAccessExpression(node)) return false;
  if (ts.isIdentifier(node)) return locals.has(node.text) && isStructuredValue(locals.get(node.text), locals, depth + 1);
  return false;
}
/** Whether a type node is a record or list: `T[]`, `readonly T[]`, `{ ... }`, Array, ReadonlyArray, Record, Map or Set. */
function isStructuredType(node) {
  if (!node) return false;
  if (ts.isTypeOperatorNode(node) || ts.isParenthesizedTypeNode(node)) return isStructuredType(node.type);
  if (ts.isArrayTypeNode(node) || ts.isTupleTypeNode(node) || ts.isTypeLiteralNode(node)) return true;
  if (ts.isTypeReferenceNode(node)) return ["Array", "ReadonlyArray", "Record", "Map", "ReadonlyMap", "Set", "ReadonlySet"].includes(node.typeName.getText());
  return false;
}

/** Facts about one source file that the idiom rules read. */
function inspectSource(file, text, regions = []) {
  const facts = { nseApplication: false, functionDefaultExport: false, stateHooks: 0, rawControls: new Map(), unmanaged: [], preferenceWrites: [], legacyTheme: [] };
  const source = parse(file, text);
  const locals = new Map();
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) locals.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(source);
  const visit = (node, inEffect) => {
    if (withinRendererRegion(node, source, regions)) return;
    if (ts.isClassLike(node)) {
      for (const clause of node.heritageClauses ?? []) for (const type of clause.types) if (/(^|\.)NSEApplication$/u.test(type.expression.getText(source))) facts.nseApplication = true;
    }
    if (ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)) facts.functionDefaultExport = true;
    if (ts.isExportAssignment(node) && !node.isExportEquals && (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression))) facts.functionDefaultExport = true;
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && RAW_CONTROLS.has(node.tagName.text)) {
      const tag = node.tagName.text;
      const hidden = tag === "input" && node.attributes.properties.some(property => ts.isJsxAttribute(property) && property.name.getText(source) === "type" && property.initializer && ts.isStringLiteral(property.initializer) && ["hidden", "file"].includes(property.initializer.text));
      if (!hidden && (tag !== "table" || interactiveTable(node))) {
        const entry = facts.rawControls.get(tag) ?? { count: 0, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 };
        entry.count++; facts.rawControls.set(tag, entry);
      }
    }
    let effect = inEffect;
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name === "useState" || name === "useReducer") facts.stateHooks++;
      if (name === "useEffect" || name === "useLayoutEffect") effect = true;
      if (inEffect && name === "requestAnimationFrame") facts.unmanaged.push({ api: "requestAnimationFrame", line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
      const onPreferences = ts.isPropertyAccessExpression(node.expression) && /(^|\.)preferences$/u.test(node.expression.expression.getText(source));
      if (onPreferences && node.arguments.length >= 2 && (name === "setJSON" || (name === "set" && isStructuredValue(node.arguments[1], locals))))
        facts.preferenceWrites.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
    }
    if (ts.isTypeReferenceNode(node) && /(^|\.)NSEPreferenceDescriptor$/u.test(node.typeName.getText(source)) && isStructuredType(node.typeArguments?.[0]))
      facts.preferenceWrites.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
    if (inEffect && ts.isNewExpression(node) && ts.isIdentifier(node.expression) && ["ResizeObserver", "Worker", "IntersectionObserver"].includes(node.expression.text))
      facts.unmanaged.push({ api: `new ${node.expression.text}`, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    ts.forEachChild(node, child => visit(child, effect));
  };
  visit(source, false);
  return facts;
}

function colourLiterals(css) {
  // Comments are not paint; strip them before counting.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//gu, match => match.replace(/[^\n]/gu, " "));
  return [...stripped.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/giu)].map(match => lineOf(stripped, match.index));
}

const TOKEN_DEFINITION = /(--nse-[a-z0-9-]+)\s*:/gu;
const TOKEN_STRING = /["'`](--nse-[a-z0-9-]+)/gu;
const TOKEN_USE = /var\(\s*(--nse-[a-z0-9-]+)/gu;
const sdkTokenCache = new Map();
/**
 * The --nse-* custom properties the installed SDK defines: declared in a shipped stylesheet or set
 * by name from its JavaScript (appearance providers set some at runtime). Null when no SDK is found.
 */
export function collectSdkTokens(sdkRoot) {
  if (!sdkRoot || !existsSync(sdkRoot)) return null;
  if (sdkTokenCache.has(sdkRoot)) return sdkTokenCache.get(sdkRoot);
  const tokens = new Set();
  const walk = directory => {
    for (const name of readdirSync(directory)) {
      if (name === "node_modules" || name === "docs") continue;
      const path = resolve(directory, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      const css = name.endsWith(".css"), js = /\.m?js$/u.test(name);
      if (!css && !js) continue;
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(css ? TOKEN_DEFINITION : TOKEN_STRING)) tokens.add(match[1]);
    }
  };
  walk(sdkRoot);
  sdkTokenCache.set(sdkRoot, tokens);
  return tokens;
}
function unknownTokenUses(text, known) {
  const unknown = [];
  for (const match of text.matchAll(TOKEN_USE)) {
    if (known.has(match[1])) continue;
    unknown.push([match[1], lineOf(text, match.index), match.index]);
  }
  return unknown;
}

/** Actual comments only: a directive affects its own line or the immediately following line. */
function optOutComments(file, text) {
  const comments = [], seen = new Set();
  const add = (pos, end) => {
    if (seen.has(pos)) return;
    seen.add(pos);
    const comment = text.slice(pos, end);
    if (!/^\/\/\s*syncloudos-allow\b/u.test(comment)) return;
    const match = /^\/\/\s*syncloudos-allow\s+([^: \r\n]+)\s*(?::(.*))?$/u.exec(comment);
    const rule = match?.[1] ?? "";
    const reason = match?.[2]?.trim() ?? "";
    comments.push({ line: lineOf(text, pos), rule, reason, valid: /^idiom\.[a-z0-9-]+$/u.test(rule) && reason.length > 0, suppressed: 0 });
  };
  if (file.endsWith(".css")) {
    // CSS comments use the same directive text, with // inside a block comment.
    for (const match of text.matchAll(/\/\*([\s\S]*?)\*\//gu)) {
      const body = match[1].trim();
      if (body.startsWith("// syncloudos-allow")) {
        const offset = match.index + match[0].indexOf("//");
        add(offset, offset + body.length);
      }
    }
  } else {
    const source = parse(file, text);
    const visit = node => {
      for (const range of [...(ts.getLeadingCommentRanges(text, node.pos) ?? []), ...(ts.getTrailingCommentRanges(text, node.end) ?? [])])
        if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia) add(range.pos, range.end);
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const range of ts.getLeadingCommentRanges(text, 0) ?? []) if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia) add(range.pos, range.end);
  }
  return comments.sort((a, b) => a.line - b.line);
}

/** Audit app, Webspring and host module graphs without executing project code. */
export function auditSynWareIdioms({ root, applications, sdkRoot, entries = [] }) {
  const findings = [], summary = [], scanned = new Set(), rendererExemptions = [], optOuts = [];
  const sources = new Map(), directives = new Map(), emitted = new Set(), rendererRegions = new Map();
  const regionsFor = file => {
    if (!rendererRegions.has(file)) rendererRegions.set(file, STYLE.includes(extname(file)) ? [] : rendererOwnedRegions({ file, text: read(file) }));
    return rendererRegions.get(file);
  };
  const read = file => {
    if (!sources.has(file)) {
      const text = readFileSync(file, "utf8");
      sources.set(file, text);
      const items = optOutComments(file, text);
      directives.set(file, items);
      for (const item of items) {
        optOuts.push({ file: slash(relative(root, file)), ...item });
        if (!item.valid) findings.push({ file: slash(relative(root, file)), line: item.line, rule: "idiom.opt-out", severity: "error", message: "An opt-out requires // syncloudos-allow <rule-id>: <reason>; provide a non-blank reason and an idiom rule id." });
      }
    }
    return sources.get(file);
  };
  const at = (file, line, rule, message, severity = "warning") => {
    const key = `${file}:${line}:${rule}:${message}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    const directive = directives.get(file)?.find(item => item.valid && item.rule === rule && (item.line === line || item.line + 1 === line));
    if (directive) {
      directive.suppressed++;
      optOuts.find(item => item.file === slash(relative(root, file)) && item.line === directive.line && item.rule === rule).suppressed++;
      return;
    }
    findings.push({ file: slash(relative(root, file)), line, rule, severity, message });
  };
  const inspectFile = file => {
    if (scanned.has(file)) return;
    scanned.add(file);
    const text = read(file);
    if (STYLE.includes(extname(file))) return;
    const regions = regionsFor(file);
    for (const region of regions) rendererExemptions.push({ file: slash(relative(root, file)), ...region });
    for (const finding of [...inspectIdiomErrors({ file, text, sdkRoot, regions }), ...inspectIdiomWarnings({ file, text, sdkRoot, regions })])
      at(file, finding.line, finding.rule, finding.message, finding.severity);
    const facts = inspectSource(file, text, regionsFor(file));
    for (const { api, line } of facts.unmanaged) {
      const replacement = api === "requestAnimationFrame" ? "NSEViewController.fx.animation.manageDisplayLink (or manageRenderer)"
        : api === "new ResizeObserver" ? "NSEViewController.fx.animation.manageDisplayLink with drawableSizeDidChange"
        : api === "new Worker" ? "managedTask"
        : "NSEViewController outlets";
      at(file, line, "idiom.managed-lifecycle", `${api} inside a React effect. Use ${replacement} from @syndromatic/syncloudos/nse to bind resources to the view lifetime.`);
    }
    for (const line of facts.preferenceWrites)
      at(file, line, "idiom.document-state", "This preference holds a structured list or record. Keep primary user work in workspaceDocuments through SCOS from @syndromatic/syncloudos; use NSEUserDefaults from @syndromatic/syncloudos/foundation for small settings.");
  };
  for (const application of applications) {
    const entry = resolve(application.directory, "Contents/index.tsx");
    if (!existsSync(entry)) continue;
    const files = collectLocalModuleGraph(entry, root);
    const report = { bundleIdentifier: application.bundleIdentifier, filesScanned: files.length, classAuthoring: false, stateHooks: 0, rawControls: 0, unmanagedLifecycle: 0, preferenceDocumentWrites: 0 };
    let functionRoot = false;
    for (const file of files) {
      const text = read(file);
      if (!STYLE.includes(extname(file))) {
        const facts = inspectSource(file, text, regionsFor(file));
        report.classAuthoring ||= facts.nseApplication;
        report.stateHooks += facts.stateHooks;
        report.rawControls += [...facts.rawControls.values()].reduce((sum, item) => sum + item.count, 0);
        report.unmanagedLifecycle += facts.unmanaged.length;
        report.preferenceDocumentWrites += facts.preferenceWrites.length;
        if (file === entry && facts.functionDefaultExport) functionRoot = true;
      }
      inspectFile(file);
    }
    if (!report.classAuthoring) at(entry, 1, "idiom.cocoa-class-authoring", `${functionRoot ? "The application default-exports a function component" : "The application has no NSEApplication subclass"}${report.stateHooks ? `, with ${report.stateHooks} useState/useReducer hooks` : ""}. Prefer NSEApplication from @syndromatic/syncloudos and NSEViewController from @syndromatic/syncloudos/nse with observable state, bindings and actions; see docs/framework/cocoa-authoring.md.`);
    summary.push(report);
  }
  for (const entry of entries) if (existsSync(entry)) for (const file of collectLocalModuleGraph(entry, root)) inspectFile(file);
  const stylesheets = new Set([...scanned].filter(file => STYLE.includes(extname(file))));
  for (const file of collectProjectStylesheets(root)) { stylesheets.add(file); read(file); }
  const stylesheetReport = { scanned: stylesheets.size, colourLiterals: 0, unknownTokens: 0 };
  const known = collectSdkTokens(sdkRoot);
  const local = new Set();
  for (const file of new Set([...scanned, ...stylesheets])) for (const match of read(file).matchAll(TOKEN_DEFINITION)) local.add(match[1]);
  if (known) for (const file of new Set([...scanned, ...stylesheets])) {
    const unknown = unknownTokenUses(read(file), { has: token => known.has(token) || local.has(token) });
    const visible = unknown.filter(([, , index]) => !regionsFor(file).some(region => region.start <= index && index < region.end));
    stylesheetReport.unknownTokens += visible.length;
    for (const [name, line] of visible) at(file, line, "idiom.nse-token", `The installed SDK does not define: ${name}. Use the neutral --nse-colour-* semantic values described by NSEAppearanceDefinition from @syndromatic/syncloudos/nse, or supply this value in your own theme; see docs/framework/appearance.md.`);
  }
  for (const file of stylesheets) {
    const text = read(file);
    stylesheetReport.colourLiterals += colourLiterals(text).length;
    for (const finding of inspectStyleErrors({ file, text, sdkRoot })) at(file, finding.line, finding.rule, finding.message, finding.severity);
  }
  for (const finding of inspectUnusedResources({ root, applications, files: [...scanned, ...stylesheets] })) {
    const file = resolve(root, finding.file);
    at(file, finding.line, finding.rule, finding.message, finding.severity);
  }
  const errors = findings.filter(item => item.severity === "error").length;
  const warnings = findings.filter(item => item.severity === "warning").length;
  return { findings, idiomAudit: { applications: summary, stylesheets: stylesheetReport, errors, warnings, idiomatic: errors === 0 && warnings === 0, optOuts, rendererExemptions } };
}
