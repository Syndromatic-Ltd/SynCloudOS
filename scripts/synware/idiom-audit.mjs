/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// The idiom audit tells an agent whether a valid SynWare is also an idiomatic
// one. "0 errors" from the structural validator only means the bundle loads;
// these findings are warnings and never make a project invalid.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import ts from "typescript";

const SOURCE = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs"];
const STYLE = [".css"];
const MAX_FILES = 400;
const COLOUR_LITERAL_THRESHOLD = 12;

/** Raw interactive HTML elements and the NSE controls that replace them. */
export const NSE_CONTROL_REPLACEMENTS = Object.freeze({
  button: "NSEButton",
  input: "NSETextField, NSESearchField, NSESlider, NSEStepper, NSEButton with buttonType switch, or NSESwitch",
  select: "NSEPopupButton or NSESegmentedControl",
  textarea: "NSETextView",
  table: "NSETableView bound to an NSEArrayController",
});

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
function inspectSource(file, text) {
  const facts = { nseApplication: false, functionDefaultExport: false, stateHooks: 0, rawControls: new Map(), unmanaged: [], preferenceWrites: [], legacyTheme: [] };
  const source = parse(file, text);
  const locals = new Map();
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) locals.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(source);
  const visit = (node, inEffect) => {
    if (ts.isClassLike(node)) {
      for (const clause of node.heritageClauses ?? []) for (const type of clause.types) if (/(^|\.)NSEApplication$/u.test(type.expression.getText(source))) facts.nseApplication = true;
    }
    if (ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)) facts.functionDefaultExport = true;
    if (ts.isExportAssignment(node) && !node.isExportEquals && (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression))) facts.functionDefaultExport = true;
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && Object.hasOwn(NSE_CONTROL_REPLACEMENTS, node.tagName.text)) {
      const tag = node.tagName.text;
      const hidden = tag === "input" && node.attributes.properties.some(property => ts.isJsxAttribute(property) && property.name.getText(source) === "type" && property.initializer && ts.isStringLiteral(property.initializer) && ["hidden", "file"].includes(property.initializer.text));
      if (!hidden) {
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

const LEGACY_THEME = /(?<![-\w])atmo[-_ ]?(onyx|heritage)\b/giu;
function legacyThemeMentions(text) {
  return [...text.matchAll(LEGACY_THEME)].map(match => ({ name: `Atmo-${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`, line: lineOf(text, match.index) }));
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
  const unknown = new Map();
  for (const match of text.matchAll(TOKEN_USE)) {
    if (known.has(match[1])) continue;
    unknown.set(match[1], unknown.get(match[1]) ?? lineOf(text, match.index));
  }
  return unknown;
}

/**
 * Audits application bundles for SynCloudOS idioms. `applications` are
 * `{ directory, bundleIdentifier }`; findings use `severity: "warning"`. With `sdkRoot`, uses of
 * `var(--nse-*)` that the installed SDK does not define are reported as `idiom.nse-token`.
 */
export function auditSynWareIdioms({ root, applications, sdkRoot }) {
  const findings = [], summary = [], stylesheets = new Set(), scanned = new Set();
  const at = (file, line, rule, message) => findings.push({ file: slash(relative(root, file)), line, rule, severity: "warning", message });
  for (const application of applications) {
    const entry = resolve(application.directory, "Contents/index.tsx");
    if (!existsSync(entry)) continue;
    const files = collectLocalModuleGraph(entry, root);
    const report = { bundleIdentifier: application.bundleIdentifier, filesScanned: files.length, classAuthoring: false, stateHooks: 0, rawControls: 0, legacyThemeMentions: 0, unmanagedLifecycle: 0, preferenceDocumentWrites: 0 };
    let functionRoot = false;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      scanned.add(file);
      for (const mention of legacyThemeMentions(text)) {
        report.legacyThemeMentions++;
        at(file, mention.line, "idiom.atmo-appearance", `${mention.name} is an obsolete raster theme and must not be used, including as a dark mode. Use Atmo, the vector theme SynCloudOS ships, which supports light and dark colour schemes itself; select the scheme with colourScheme rather than a different theme.`);
      }
      if (STYLE.includes(extname(file))) { stylesheets.add(file); continue; }
      const facts = inspectSource(file, text);
      report.classAuthoring ||= facts.nseApplication;
      report.stateHooks += facts.stateHooks;
      if (file === entry && facts.functionDefaultExport) functionRoot = true;
      for (const [tag, { count, line }] of facts.rawControls) {
        report.rawControls += count;
        at(file, line, "idiom.nse-controls", `${count} raw <${tag}> element${count === 1 ? "" : "s"}. Use ${NSE_CONTROL_REPLACEMENTS[tag]} so the control gets Atmo's appearance, light and dark, focus, keyboard, accessibility and responder-chain actions.`);
      }
      for (const { api, line } of facts.unmanaged) {
        report.unmanagedLifecycle++;
        const replacement = api === "requestAnimationFrame" ? "this.fx.animation.manageDisplayLink(outlet) (or manageRenderer for AFX layers), which pauses while the view is hidden or off screen and follows reduced motion"
          : api === "new ResizeObserver" ? "the drawableSizeDidChange option of this.fx.animation.manageDisplayLink, or an @outlet with NSE layout"
          : api === "new Worker" ? "managedTask(this, { lifetime, policy: \"latest\" }) on a view controller, which cancels superseded work and ends with the view"
          : "an @outlet on a view controller, whose activity already tracks visibility";
        at(file, line, "idiom.managed-lifecycle", `${api} inside a React effect. Use ${replacement}.`);
      }
      for (const line of facts.preferenceWrites) {
        report.preferenceDocumentWrites++;
        at(file, line, "idiom.document-state", "This preference holds a structured value (a list or record, through preferences.set, setJSON or a list- or record-typed NSEPreferenceDescriptor). Preferences are for small settings; keep primary application state (simulations, records, user work) in a document type with workspaceDocuments, which provides saving, undo and autosave.");
      }
    }
    if (!report.classAuthoring) {
      report.classAuthoring = false;
      at(entry, 1, "idiom.cocoa-class-authoring", `${functionRoot ? "The application default-exports a function component instead of an NSEApplication subclass" : "The application has no NSEApplication subclass"}${report.stateHooks ? `, and its code keeps state in ${report.stateHooks} useState/useReducer hook${report.stateHooks === 1 ? "" : "s"}` : ""}. Default-export an NSEApplication subclass whose NSEViewController holds @observable state, exposes bind() bindings and @action methods, and renders NSE controls; see docs/framework/cocoa-authoring.md.`);
    }
    summary.push(report);
  }
  // Stylesheets are often imported by the host entry rather than the bundle, so
  // every project stylesheet is checked once, in addition to those reached above.
  const stylesheetReport = { scanned: 0, colourLiterals: 0, legacyThemeMentions: 0, unknownTokens: 0 };
  const known = collectSdkTokens(sdkRoot);
  if (known) {
    // The project's own --nse-* definitions are not unknown either.
    const files = new Set([...scanned, ...stylesheets, ...collectProjectStylesheets(root)]);
    const local = new Set();
    for (const file of files) for (const match of readFileSync(file, "utf8").matchAll(TOKEN_DEFINITION)) local.add(match[1]);
    for (const file of files) {
      const unknown = unknownTokenUses(readFileSync(file, "utf8"), { has: token => known.has(token) || local.has(token) });
      if (unknown.size === 0) continue;
      stylesheetReport.unknownTokens += unknown.size;
      const names = [...unknown.keys()];
      at(file, [...unknown.values()][0], "idiom.nse-token", `${names.length} --nse-* token${names.length === 1 ? "" : "s"} the installed SDK does not define: ${names.slice(0, 8).join(", ")}${names.length > 8 ? ", ..." : ""}. An undefined token falls back to its var() fallback or the property's initial value, so it never follows Atmo. Use the documented tokens in docs/framework/appearance.md (--nse-app-foreground-secondary, --nse-app-surface, --nse-app-separator, --nse-app-accent and the rest of the --nse-app-* colours), which every theme defines for light and dark, or mix a tint from one of them with color-mix().`);
    }
  }
  for (const file of new Set([...stylesheets, ...collectProjectStylesheets(root)])) {
    const text = readFileSync(file, "utf8");
    stylesheetReport.scanned++;
    if (!scanned.has(file)) for (const mention of legacyThemeMentions(text)) {
      stylesheetReport.legacyThemeMentions++;
      at(file, mention.line, "idiom.atmo-appearance", `${mention.name} is an obsolete raster theme and must not be used, including as a dark mode. Use Atmo, the vector theme SynCloudOS ships, which supports light and dark colour schemes itself.`);
    }
    const lines = colourLiterals(text);
    stylesheetReport.colourLiterals += lines.length;
    if (lines.length >= COLOUR_LITERAL_THRESHOLD) at(file, lines[0], "idiom.atmo-appearance", `This stylesheet hard-codes ${lines.length} colour literals. Atmo, the default vector theme, already draws NSE controls and window chrome in light and dark; use NSE controls and semantic tokens (var(--nse-*)), and respond to [data-mode="dark"] only where your own content needs it, instead of a parallel palette.`);
  }
  return { findings, idiomAudit: { applications: summary, stylesheets: stylesheetReport, warnings: findings.length } };
}
