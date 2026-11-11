/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import ts from "typescript";
import { rendererOwnedRegions, withinRendererRegion } from "./idiom-errors.mjs";

function sourceFile(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.[jt]sx$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function walk(node, visit) { if (visit(node) === false) return; ts.forEachChild(node, child => walk(child, visit)); }
function enclosingClass(node) {
  for (let owner = node?.parent; owner; owner = owner.parent) if (ts.isClassLike(owner)) return owner;
  return null;
}
function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}
function named(node) { return node && (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isPrivateIdentifier(node)) ? node.text : null; }
function property(node, key) {
  return ts.isObjectLiteralExpression(node) ? node.properties.find(item => (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item)) && named(item.name) === key) : undefined;
}
function value(item) { return item && (ts.isShorthandPropertyAssignment(item) ? item.name : item.initializer); }
function numeric(node) {
  node = unwrap(node);
  if (!node) return NaN;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPropertyAccessExpression(node) && node.expression.getText() === "Math" && node.name.text === "PI") return Math.PI;
  if (ts.isPrefixUnaryExpression(node)) return node.operator === ts.SyntaxKind.MinusToken ? -numeric(node.operand) : node.operator === ts.SyntaxKind.PlusToken ? numeric(node.operand) : NaN;
  if (!ts.isBinaryExpression(node)) return NaN;
  const left = numeric(node.left), right = numeric(node.right);
  switch (node.operatorToken.kind) {
    case ts.SyntaxKind.PlusToken: return left + right;
    case ts.SyntaxKind.MinusToken: return left - right;
    case ts.SyntaxKind.AsteriskToken: return left * right;
    case ts.SyntaxKind.SlashToken: return left / right;
    default: return NaN;
  }
}

/** Evidence-based source warnings, independent of project validity. No source code is executed. */
export function inspectIdiomWarnings({ file, text, regions = rendererOwnedRegions({ file, text }) }) {
  if (!/\.[cm]?[jt]sx?$/u.test(file)) return [];
  const source = sourceFile(file, text), findings = [], locals = new Map(), aliases = new Map(), outlets = new Map(), paths = new Set();
  const warn = (node, rule, message) => !withinRendererRegion(node, source, regions) && findings.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, rule: `idiom.${rule}`, severity: "warning", message });
  walk(source, node => {
    if (withinRendererRegion(node, source, regions)) return false;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) locals.set(node.name.text, node.initializer);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith("@syndromatic/syncloudos")) {
      for (const item of node.importClause?.namedBindings?.elements ?? []) aliases.set(item.name.text, item.propertyName?.text ?? item.name.text);
    }
    if (ts.isPropertyDeclaration(node) && node.name && node.type && /\bNSEViewOutlet\b/u.test(node.type.getText(source))) {
      const owner = enclosingClass(node), names = outlets.get(owner) ?? new Set();
      names.add(node.name.getText(source)); outlets.set(owner, names);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isNewExpression(node.initializer) && /^GFX(?:Mutable)?Path$/u.test(node.initializer.expression.getText(source))) paths.add(node.name.text);
    if (ts.isParameter(node) && node.type && /^GFX(?:Mutable)?Path$/u.test(node.type.getText(source))) paths.add(node.name.getText(source));
  });
  const dereference = (node, depth = 0) => {
    node = unwrap(node);
    return node && ts.isIdentifier(node) && locals.has(node.text) && depth < 4 ? dereference(locals.get(node.text), depth + 1) : node;
  };
  const hasCall = (node, predicate) => {
    let found = false;
    if (node) walk(node, child => { if (ts.isCallExpression(child) && predicate(child)) found = true; });
    return found;
  };
  const canonical = node => aliases.get(node?.getText(source)) ?? node?.getText(source);
  const isAnimation = node => ts.isNewExpression(node) && /^AFX(?:Animation|BasicAnimation|SpringAnimation|KeyframeAnimation)$/u.test(canonical(node.expression));
  const backedElement = node => {
    node = dereference(node);
    return node && ts.isPropertyAccessExpression(node) && node.name.text === "element" && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword && outlets.get(enclosingClass(node))?.has(node.expression.name.getText(source));
  };
  walk(source, node => {
    if (withinRendererRegion(node, source, regions)) return false;
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && node.tagName.text === "video")
      warn(node, "video", 'Raw <video> has no complete AVPlayerView counterpart in the current SDK. Review the lower-level VFXVideoClient, VFXVideoPresentationClient and VFXRouteDetector types from "@syndromatic/syncloudos/fx/video" for device-owned playback/presentation. They do not supply a ready-made player view or standard player controls.');
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const entry = node.moduleSpecifier.text;
      if (/^@syndromatic\/syncloudos(?:\/nse(?:\/[^/]+)?)?$/u.test(entry)) {
        const replacements = { NSEUserDefaults: "NSEUserDefaults", NumberFormatter: "NSENumberFormatter", NSENumberFormatter: "NSENumberFormatter", NSEData: "NSEData", NSEDataConvertible: "NSEDataConvertible" };
        for (const item of node.importClause?.namedBindings?.elements ?? []) {
          const old = item.propertyName?.text ?? item.name.text, replacement = replacements[old];
          if (replacement) warn(item, "foundation-import", `${old} belongs to Foundation in Beta 2. Use import${replacement === "NSEDataConvertible" || item.isTypeOnly || node.importClause?.isTypeOnly ? " type" : ""} { ${replacement} } from "@syndromatic/syncloudos/foundation"; NSEData uses count and bytes, and exported file payloads use data rather than blob.`);
        }
      }
    }
    if (isAnimation(node)) {
      const options = dereference(node.arguments?.[0]);
      if (options && ts.isObjectLiteralExpression(options)) {
        const reduced = property(options, "reducedMotion");
        if (unwrap(value(reduced)) && ts.isStringLiteral(unwrap(value(reduced))) && unwrap(value(reduced)).text === "never")
          warn(reduced, "reduced-motion", 'This animation disables reduced motion. Use reducedMotion: "system" and let the animation host resolve the person\'s preference, or document and verify an essential-motion exception.');
        if (canonical(node.expression) === "AFXKeyframeAnimation") {
          const values = dereference(value(property(options, "values")));
          const generated = values && ts.isCallExpression(values) && ts.isPropertyAccessExpression(values.expression) && ["from", "map"].includes(values.expression.name.text);
          const callback = generated ? dereference(values.arguments[values.expression.name.text === "from" ? 1 : 0]) : null;
          if (generated && hasCall(callback, call => /(?:sample|evaluate|valueAt|progressAt|sampleCurve|sampleTiming|eas(?:e|ing)|curve)/iu.test(call.expression.getText(source))))
            warn(node, "resampled-animation", "Generated keyframe values sample a timing curve in application code. Prefer AFXBasicAnimation or AFXSpringAnimation; for authored keyframes use AFXKeyframeAnimation keyTimes and timingFunctions. This warning does not establish compositor eligibility.");
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text, receiver = node.expression.expression;
      if (method === "animate" && ((/\.animations$/u.test(receiver.getText(source)) && backedElement(node.arguments[0])) || backedElement(receiver)))
        warn(node, "backed-view-animation", "This raw animation targets an element declared as an NSEViewOutlet. Animate its outlet.layer with AFXBasicAnimation, AFXSpringAnimation or AFXKeyframeAnimation so backing-layer ownership, cancellation and reduced motion stay together.");
      if (method === "addEventListener" && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "visibilitychange") {
        const callback = dereference(node.arguments[1]);
        if (hasCall(callback, call => /(?:animation|layer|displayLink|renderer)/iu.test(call.expression.getText(source)) && /(?:pause|resume|start|stop|cancel|settle|animate|Animation)/u.test(call.expression.getText(source))))
          warn(node, "animation-visibility", "This visibilitychange listener controls animation. Use the view controller's managed animation/display-link lifetime; the host already settles animation when the page becomes hidden. Non-animation visibility listeners are outside this check.");
      }
      let pathReceiver = receiver;
      while (ts.isCallExpression(pathReceiver) && ts.isPropertyAccessExpression(pathReceiver.expression)) pathReceiver = pathReceiver.expression.expression;
      if (method === "arc" && node.arguments.length >= 4 && paths.has(pathReceiver.getText(source))) {
        const first = unwrap(node.arguments[0]);
        const start = numeric(node.arguments[ts.isObjectLiteralExpression(first) ? 2 : 3]);
        const end = numeric(node.arguments[ts.isObjectLiteralExpression(first) ? 3 : 4]);
        const gap = Math.abs(Math.abs(end - start) - 2 * Math.PI);
        if (Number.isFinite(gap) && gap < 0.01)
          warn(node, "full-circle", "This arc covers approximately a full circle. For a full circle use GFXPath.ellipse({ x, y, width, height }) from @syndromatic/syncloudos/fx/graphics instead of subtracting an epsilon from 2π. Keep a genuine open arc if that is the intended artwork.");
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isNewExpression(node.initializer) && node.initializer.expression.getText(source) === "Uint8Array") {
      let scope = node.parent;
      while (scope.parent && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
      let image = hasCall(scope, call => /(?:GFXImage|ImageData|createImageBitmap)/u.test(call.expression.getText(source)));
      walk(scope, child => { if (ts.isNewExpression(child) && /^(?:GFXImage|ImageData)$/u.test(child.expression.getText(source))) image = true; });
      let indexedLoopWrite = false;
      walk(scope, child => {
        if (!ts.isBinaryExpression(child) || child.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !ts.isElementAccessExpression(child.left) || child.left.expression.getText(source) !== node.name.text) return;
        for (let ancestor = child.parent; ancestor && ancestor !== scope; ancestor = ancestor.parent) {
          if (ts.isForStatement(ancestor) || ts.isForOfStatement(ancestor) || ts.isWhileStatement(ancestor)) indexedLoopWrite = true;
        }
      });
      if (image && indexedLoopWrite) warn(node, "pixel-sprite", "This typed array is filled in a loop and then used to create an image. If it draws a sprite, prefer GFXBitmapContext with GFXGradient (or a bundled image); byte buffers used for decoding or scientific data may be legitimate and need review.");
    }
  });
  return findings;
}

const RESOURCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".mp3", ".wav", ".ogg", ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".otf", ".pdf"]);
const TEXT_REFERENCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".css", ".svg", ".json", ".html"]);
function referencesIn(file) {
  const extension = extname(file).toLowerCase();
  if (!TEXT_REFERENCE_EXTENSIONS.has(extension) || !existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  if (/\.[cm]?[jt]sx?$/u.test(file)) {
    const references = [];
    walk(sourceFile(file, text), node => {
      if (ts.isStringLiteralLike(node)) references.push(node.text);
      // A nonempty static prefix/suffix conservatively retains a dynamically named family.
      if (ts.isTemplateExpression(node)) references.push(node.head.text, ...node.templateSpans.map(span => span.literal.text));
    });
    return references;
  }
  const stripped = text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/<!--[\s\S]*?-->/gu, "");
  return [...stripped.matchAll(/["']([^"']+)["']|url\(\s*([^)'"\s]+)\s*\)/gu)].map(match => match[1] ?? match[2]);
}

/** Warn only about static references, never claim that dynamic assets can safely be deleted. */
export function inspectUnusedResources({ root, applications, files }) {
  const resources = [], metadata = [];
  const visit = directory => {
    if (!existsSync(directory)) return;
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const file = resolve(directory, item.name);
      if (item.isDirectory()) visit(file);
      else if (RESOURCE_EXTENSIONS.has(extname(item.name).toLowerCase())) resources.push(file);
    }
  };
  for (const application of applications) {
    const directory = resolve(root, application.directory);
    visit(resolve(directory, "Contents/Resources"));
    metadata.push(resolve(directory, "Contents/Info.ts"));
  }
  const references = [...new Set([...files, ...metadata])].flatMap(referencesIn);
  const used = (file, refs) => {
    const name = basename(file), stem = basename(file, extname(file));
    return refs.some(reference => {
      const cleaned = reference.replace(/[?#].*$/u, "").replaceAll("\\", "/");
      const tail = cleaned.split("/").pop();
      return tail === name || tail === stem || (tail?.length >= 5 && (tail.endsWith("-") || tail.startsWith("-")) && name.includes(tail));
    });
  };
  // Only reachable SVG/CSS resource references retain other assets; a dead SVG does not retain its own children.
  const retained = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const file of resources) if (!retained.has(file) && used(file, references)) {
      retained.add(file); references.push(...referencesIn(file)); changed = true;
    }
  }
  return resources.filter(file => !retained.has(file)).sort().map(file => ({ file, line: 1, rule: "idiom.unused-resource", severity: "warning", message: `No static reference to bundle resource ${basename(file)} was found in scanned source, manifest or reachable artwork. Dynamic lookup and external consumers are not resolved; verify its use before removing it.` }));
}

/** Bar heights an app might hard-code instead of reading the layout guides: window title bars, toolbars, top bars and tab bars. */
const KNOWN_BAR_HEIGHTS = new Set([24, 26, 31, 43, 44, 46, 49, 52, 56, 59, 68, 72]);
const LAYOUT_GUIDE = "Use the --nse-safe-area-inset-* properties, useNSESafeArea, or NSEScrollView's automatic content insets so content follows the bars the framework actually shows.";

/** App and host stylesheets (never a .scostheme theme): layout that guesses at the system bars instead of following the layout guides. */
export function inspectStyleWarnings({ file = "", text }) {
  if (!file.endsWith(".css") || /\.scostheme[\/]/iu.test(file)) return [];
  const css = text.replace(/\/\*[\s\S]*?\*\//gu, value => value.replace(/[^\n]/gu, " "));
  const findings = [], line = index => css.slice(0, index).split("\n").length;
  const warn = (index, message) => findings.push({ line: line(index), rule: "idiom.layout-guide", severity: "warning", message: `${message} ${LAYOUT_GUIDE}` });
  for (const match of css.matchAll(/env\(\s*safe-area-inset-(?:top|bottom|left|right)/gu)) warn(match.index, "A raw env(safe-area-inset-*) reads the screen edge, not the window's safe area.");
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const body = block[2];
    if (!/(?:^|;)\s*position\s*:\s*(?:fixed|sticky)\b/iu.test(body)) continue;
    for (const declaration of body.matchAll(/([\w-]+)\s*:\s*(-?\d+(?:\.\d+)?)px\s*(?:;|$)/gu)) {
      if (!/^(?:top|bottom|inset-block-start|inset-block-end|padding-top|padding-bottom|padding-block-start|padding-block-end)$/iu.test(declaration[1])) continue;
      if (KNOWN_BAR_HEIGHTS.has(Math.abs(Number(declaration[2])))) warn(block.index + block[0].indexOf("{") + 1 + declaration.index, `A pinned element is offset by ${declaration[2]}px, the height of a system bar.`);
    }
  }
  return findings;
}
