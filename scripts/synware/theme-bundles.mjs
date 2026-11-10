/** Host-trusted, static .scostheme bundles. Ported from PR #1 without fonts or motion. */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as cssTree from "css-tree";
import { SaxesParser } from "saxes";
import ts from "typescript";
import { parseManifest } from "./manifest-source.mjs";
const identifier = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;
const resourceExtensions = new Set([".css", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif", ".txt", ".md", ".json", ".strings"]);
const inside = (root, path) => { const rel = relative(root, path); return !isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\"); };
function walk(root) {
  const files=[]; let bytes=0;
  function visit(path, depth=0) {
    if(depth>20) throw new TypeError(`${path}: directory-depth: Theme directory depth exceeds 20 levels.`);
    const stat=lstatSync(path);
    if(stat.isSymbolicLink()) throw new TypeError(`Theme packages reject symbolic links: ${path}`);
    if(!inside(root,realpathSync(path))) throw new TypeError(`Theme path escapes package: ${path}`);
    if(stat.isDirectory()) {
      const seen=new Set();
      for(const name of readdirSync(path).sort()) {
        const key=name.toLowerCase(); if(seen.has(key)) throw new TypeError(`Theme case collision: ${path}/${name}`); seen.add(key); visit(resolve(path,name),depth+1);
      }
    } else if(stat.isFile()) {
      bytes+=stat.size;
      if(stat.size>32*1024*1024) throw new TypeError(`${path}: resource-size: Theme resource size limit exceeded.`);
      if(bytes>128*1024*1024) throw new TypeError(`${path}: bundle-size: Theme bundle size limit exceeded.`);
      if(files.length>=4096) throw new TypeError(`${path}: resource-count: Theme resource count limit exceeded.`);
      files.push(path);
    } else throw new TypeError(`Unsupported theme file: ${path}`);
  }
  visit(root); return files;
}
function keys(value, allowed, label) {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  for(const key of Object.keys(value)) if(!allowed.includes(key)) throw new TypeError(`${label} contains unsupported field ${key}.`);
}
function staticInfo(path) {
  const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  if(source.parseDiagnostics.length || source.statements.some(node=>!ts.isExportAssignment(node)&&!ts.isVariableStatement(node)&&!ts.isInterfaceDeclaration(node)&&!ts.isTypeAliasDeclaration(node))) throw new TypeError('Theme Info.ts must contain only static declarations and a default export.');
  function inspect(node) {
    if(ts.isCallExpression(node)||ts.isNewExpression(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node)||ts.isFunctionDeclaration(node)||ts.isClassExpression(node)||ts.isAwaitExpression(node)) throw new TypeError('Theme Info.ts cannot contain executable expressions.');
    ts.forEachChild(node,inspect);
  }
  inspect(source); return parseManifest(path);
}
/** CSS grammar and decoded identifiers close URL()/escaped-url/image-set bypasses. */
function validateCssValue(value,onResource,label,forbidDynamic=false,depth=0) {
  if(depth>24) throw new TypeError(`Theme CSS nesting limit exceeded: ${label}`);
  let ast; try { ast=cssTree.parse(value,{context:'value'}); } catch(cause) { throw new TypeError(`Unsupported CSS value in ${label}: ${cause.message}`); }
  cssTree.walk(ast,node=>{
    if(node.type==='Raw') { if(node.value.trim()) validateCssValue(node.value,onResource,label,forbidDynamic,depth+1); return; }
    if(node.type==='Url') { onResource(node.value); return; }
    if(node.type!=='Function') return;
    const name=cssTree.ident.decode(node.name).toLowerCase();
    if(name==='local') throw new TypeError(`Theme fonts must be package-local, not installed local() resources: ${label}`);
    if(['expression','-moz-binding'].includes(name)) throw new TypeError(`Executable CSS function: ${label}`);
    if(forbidDynamic&&['var','env','attr'].includes(name)) throw new TypeError(`Dynamic theme resource is unsupported: ${label}`);
    if(name==='url'||name==='src') {
      const children=node.children.toArray();
      if(children.length===1&&children[0].type==='String') onResource(children[0].value);
      else if(name==='url') {
        const canonical=cssTree.generate(node).replace(/^[^(]+/u,'url');
        const parsed=cssTree.parse(canonical,{context:'value'}).children.toArray();
        if(parsed.length!==1||parsed[0].type!=='Url') throw new TypeError(`Dynamic theme URL is unsupported: ${label}`);
        onResource(parsed[0].value);
      } else throw new TypeError(`Dynamic theme src() is unsupported: ${label}`);
    }
    if(['image-set','-webkit-image-set','image','cross-fade','-webkit-cross-fade'].includes(name)) node.children.forEach(child=>{
      if(child.type==='String') onResource(child.value);
      if(child.type==='Function'&&['var','env','attr'].includes(cssTree.ident.decode(child.name).toLowerCase())) throw new TypeError(`Dynamic theme image sources are unsupported: ${label}`);
    });
  });
}
function validateSvg(source,label) {
  if(source.length>4*1024*1024) throw new TypeError(`Theme SVG exceeds size limit: ${label}`);
  const parser=new SaxesParser({xmlns:true}); let hasRoot=false;
  const fragment=url=>{if(!/^#[A-Za-z_][\w:.-]*$/u.test(url))throw new TypeError(`SVG resource must be a local fragment: ${label}`);};
  parser.on('doctype',()=>{throw new TypeError(`Theme SVG cannot declare a DOCTYPE: ${label}`);});
  parser.on('processinginstruction',()=>{throw new TypeError(`Theme SVG cannot contain processing instructions: ${label}`);});
  parser.on('opentag',node=>{
    if(!hasRoot) { if(node.local!=='svg') throw new TypeError(`Theme SVG root must be svg: ${label}`); hasRoot=true; }
    if(node.uri!=='http://www.w3.org/2000/svg'|| !/^(?:svg|g|defs|symbol|use|path|rect|circle|ellipse|line|polyline|polygon|text|tspan|title|desc|linearGradient|radialGradient|stop|clipPath|mask|pattern|filter|fe[A-Z][A-Za-z]+)$/u.test(node.local)) throw new TypeError(`Unsupported or executable SVG element ${node.local}: ${label}`);
    for(const attribute of Object.values(node.attributes)) {
      if(/^on/iu.test(attribute.local)||attribute.local==='base') throw new TypeError(`Executable SVG attribute ${attribute.name}: ${label}`);
      if(attribute.local==='href') fragment(attribute.value);
      if(/(?:javascript:|https?:|data:|expression\s*\(|@import)/iu.test(attribute.value)&&!attribute.name.startsWith('xmlns')) throw new TypeError(`External SVG resource: ${label}`);
      if(attribute.local==='style') {
        if(/[{}@]|behavior|binding/iu.test(attribute.value)) throw new TypeError(`Unsupported SVG style: ${label}`);
        cssTree.walk(cssTree.parse(attribute.value, {context: "declarationList"}), {visit: "Declaration", enter(node) { validateCssValue(cssTree.generate(node.value), fragment, label); }});
      } else if(/url|\\/iu.test(attribute.value)) validateCssValue(attribute.value,fragment,label);
    }
  });
  parser.on('error',error=>{throw new TypeError(`Invalid theme SVG ${label}: ${error.message}`);});
  parser.write(source).close(); if(!hasRoot) throw new TypeError(`Empty SVG: ${label}`);
}
function localPath(root,from,url) {
  const svgData=/^data:image\/svg\+xml(?:;charset=utf-8)?(;base64)?,([\s\S]*)$/iu.exec(url);
  if(svgData) {
    if(svgData[1]&&!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(svgData[2]))throw new TypeError('Invalid base64 SVG resource.');
    const source=svgData[1]?new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(svgData[2],'base64')):decodeURIComponent(svgData[2]);
    validateSvg(source,from);return null;
  }
  if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(url)) return null;
  if(url.startsWith('#')) return null;
  let decoded; try { decoded=decodeURIComponent(url.split(/[?#]/u)[0]); } catch {throw new TypeError(`Invalid theme URL: ${url}`);}
  if(!decoded||/^(?:[a-z][a-z\d+.-]*:|\/|\\)/iu.test(decoded)||decoded.includes('\\')) throw new TypeError(`Theme URL must be package-local: ${url} in ${from}`);
  const target=resolve(dirname(from),decoded);
  if(!inside(root,target)||!existsSync(target)||!lstatSync(target).isFile()) throw new TypeError(`Theme URL escapes package or is missing: ${url} in ${from}`);
  return target;
}
export function assertThemeFileNames(names) {
  const seen = new Set();
  for (const name of names) {
    const key = name.replaceAll("\\", "/").toLowerCase();
    if (seen.has(key)) throw new TypeError(`Theme case collision: ${name}`);
    seen.add(key);
  }
}
const freeze = value => { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const fail = (file, rule, message) => { throw new TypeError(`${file}: ${rule}: ${message}`); };
const record = (value, allowed, file) => { try { keys(value, allowed, file); } catch (error) { fail(file, "unknown-key", error.message); } };
export function imageDimensions(file) {
  const bytes = readFileSync(file), extension = extname(file).toLowerCase();
  if (extension === ".svg") {
    const source = bytes.toString("utf8");
    const width = /\bwidth=["']([\d.]+)(?:px)?["']/u.exec(source), height = /\bheight=["']([\d.]+)(?:px)?["']/u.exec(source);
    if (width && height) return { width: Number(width[1]), height: Number(height[1]) };
    const viewBox = /\bviewBox=["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*["']/u.exec(source);
    if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  }
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length >= 10 && /^GIF8[79]a/u.test(bytes.subarray(0, 6).toString())) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const kind = bytes.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    if (kind === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") { const bits = bytes.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
  }
  if (extension === ".jpg" || extension === ".jpeg") for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset] !== 255) break;
    const marker = bytes[offset + 1], length = bytes.readUInt16BE(offset + 2);
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    if (length < 2) break; offset += length + 2;
  }
  if (extension === ".avif") { const at = bytes.indexOf(Buffer.from("ispe")); if (at >= 4 && at + 16 <= bytes.length) return { width: bytes.readUInt32BE(at + 8), height: bytes.readUInt32BE(at + 12) }; }
  fail(file, "image-dimensions", "Cannot read the image dimensions.");
}
function validateDefinition(input, contract, file, root) {
  record(input, ["colours", "navigation", "presentation", "images"], file);
  record(input.colours, ["light", "dark", "highContrastLight", "highContrastDark"], file);
  for (const scheme of ["light", "dark", "highContrastLight", "highContrastDark"]) {
    const values = input.colours[scheme];
    if (values === undefined && scheme.startsWith("highContrast")) continue;
    if (values && Object.keys(values).some(name => !contract.colours.includes(name))) fail(file, "unknown-colour", "Colour names must belong to the theme contract.");
    record(values, contract.colours, file);
    for (const name of contract.colours) {
      if (!(name in values)) { if (!scheme.startsWith("highContrast")) fail(file, "missing-colour", `${scheme}.${name} is required.`); continue; }
      if (typeof values[name] !== "string" || !values[name].trim() || cssTree.lexer.matchProperty("color", values[name]).error) fail(file, "colour", `Invalid ${scheme}.${name}.`);
      if (/\b(?:var|env|attr)\s*\(/iu.test(values[name])) fail(file, "colour", `${scheme}.${name} must be a self-contained colour.`);
    }
  }
  record(input.navigation, ["compact", "regular"], file);
  for (const width of ["compact", "regular"]) {
    record(input.navigation[width], ["placement", "flow"], file);
    for (const key of ["placement", "flow"]) if (!contract.navigation[width][key].includes(input.navigation[width][key])) fail(file, "navigation", `Invalid ${width}.${key}.`);
  }
  record(input.presentation, Object.keys(contract.presentation), file);
  for (const [name, choices] of Object.entries(contract.presentation)) if (!choices.includes(input.presentation[name])) fail(file, "presentation", `Invalid ${name}.`);
  if (!input.images || typeof input.images !== "object" || Array.isArray(input.images)) fail(file, "images", "Supply an images map.");
  for (const [name, image] of Object.entries(input.images)) {
    record(image, ["files", "pointSize", "template"], file);
    record(image.files, ["1x", "2x", "3x"], file); record(image.pointSize, ["width", "height"], file);
    if (!image.files["1x"] || ![image.pointSize.width, image.pointSize.height].every(value => Number.isFinite(value) && value > 0) || (image.template !== undefined && typeof image.template !== "boolean")) fail(file, "images", `Invalid image ${name}.`);
    for (const [resolution, source] of Object.entries(image.files)) {
      if (typeof source !== "string" || !source.startsWith("Resources/")) fail(file, "image-path", `${name}.${resolution} must name a Resources file.`);
      try { const target = localPath(root, file, source); if (!target || ![".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"].includes(extname(target).toLowerCase())) fail(file, "image-path", `${name}.${resolution} is not an image.`); imageDimensions(target); }
      catch (error) { fail(file, "image-path", `${name}.${resolution}: ${error.message}`); }
    }
  }
}
const semanticParts = new Set(["title", "label", "content", "field", "cell", "row", "item", "segment", "value", "text-content", "primary-text", "secondary-text"]);
/** Negative predicates cannot anchor a drawing; every positive alternative must. */
function selectorHasAnchor(selector) {
  return selector.children.toArray().some(node => {
    if (node.type === "AttributeSelector") return ["data-nse-control", "data-nse-part"].includes(cssTree.generate(node.name));
    if (node.type !== "PseudoClassSelector") return false;
    if (node.name === "scope") return true;
    if (!["is", "where"].includes(node.name) || !node.children) return false;
    const alternatives = node.children.toArray().flatMap(child => child.type === "SelectorList" ? child.children.toArray() : child.type === "Selector" ? [child] : []);
    return alternatives.length > 0 && alternatives.every(selectorHasAnchor);
  });
}
/** Shared by bundle validation and the idiom audit. Throws a file-specific rule violation. */
export function validateThemeCSS(source, { file, root, contract, onImport = () => undefined } = {}) {
  const ast = cssTree.parse(source, { parseCustomProperty: true, positions: true, onParseError(error) { fail(file, "css-syntax", error.message); } });
  const attributes = new Set(["control", "part", "state", "highlighted", "enabled", "selected", "hovered", "focused", "key-window", "tracking", "colour-scheme-resolved", "contrast", "transparency", ...Object.values(contract.controls).flatMap(control => Object.keys(control.variants))].map(name => `data-nse-${name}`));
  const valueText = node => cssTree.generate(node.value);
  const checkSlice = (declarations, label) => {
    const find = name => declarations.find(node => cssTree.ident.decode(node.property).toLowerCase() === name);
    const shorthand = find("border-image"), source = find("border-image-source"), slice = find("border-image-slice");
    if (!shorthand && !(source && slice)) return;
    const imageSource = shorthand ?? source, sliceValue = shorthand ? valueText(shorthand).replace(/url\([^)]*\)/gu, "").split("/")[0] : valueText(slice);
    const insets = [...sliceValue.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(%?)(?=\s|$)/gu)].map(match => ({ value: Number(match[1]), percent: Boolean(match[2]) }));
    const resources = []; validateCssValue(valueText(imageSource), url => { const target = localPath(root, file, url); if (target) resources.push(target); }, file);
    for (const target of resources) { const size = imageDimensions(target); for (let index = 0; index < insets.length; index++) { const inset = insets[index]; if (inset.percent ? inset.value > 100 : inset.value > (index % 2 ? size.width : size.height)) fail(file, "slice-insets", `${label} slice exceeds ${target}'s dimensions.`); } }
  };
  cssTree.walk(ast, {
    enter(node) {
      if (node.type === "Raw" && node.value.trim()) fail(file, "css-syntax", "Unparsed CSS is not permitted.");
      if (node.type === "Atrule") {
        const name = cssTree.ident.decode(node.name).toLowerCase();
        if (name === "import") {
          const match = /^(["'])([^"']+)\1\s*$/u.exec(cssTree.generate(node.prelude));
          if (!match) fail(file, "css-import", "Use a quoted local stylesheet import.");
          const target = localPath(root, file, match[2]); if (!target || extname(target).toLowerCase() !== ".css") fail(file, "css-import", "Import a local CSS file."); onImport(target);
        } else if (!["media", "supports", "container", "layer"].includes(name)) fail(file, "css-at-rule", `@${name} is not theme data; fonts and motion are framework-owned.`);
      }
      if (node.type === "Selector") {
        let anchored = false, semantic = false;
        const selector = cssTree.generate(node);
        cssTree.walk(node, child => {
          if (["ClassSelector", "IdSelector"].includes(child.type) || child.type === "TypeSelector" && child.name !== "*") fail(file, "css-selector", `Use contract hooks only: ${selector}`);
          if (child.type === "PseudoClassSelector" && ["root", "host", "host-context"].includes(child.name)) fail(file, "css-selector", `Use contract hooks only: ${selector}`);
          if (child.type === "PseudoClassSelector" && child.name === "scope") anchored = true;
          if (child.type !== "AttributeSelector") return;
          const name = cssTree.ident.decode(cssTree.generate(child.name));
          if (!attributes.has(name)) fail(file, "css-selector", `Unknown contract attribute ${name}.`);
          const value = child.value?.value ?? child.value?.name;
          if (name === "data-nse-control") { anchored = true; if (value && !contract.controls[value]) fail(file, "css-control", `Unknown control ${value}.`); }
          if (name === "data-nse-part") { anchored = true; if (value && !Object.values(contract.controls).some(control => control.parts.includes(value))) fail(file, "css-part", `Unknown part ${value}.`); if (semanticParts.has(value)) semantic = true; }
        });
        if (!selectorHasAnchor(node)) fail(file, "css-selector", `A selector needs a control, part or :scope hook: ${selector}`);
        return cssTree.walk.skip;
      }
      if (node.type === "Rule") {
        const declarations = node.block.children.toArray().filter(child => child.type === "Declaration"); checkSlice(declarations, "border-image");
        const selector = cssTree.generate(node.prelude), pseudo = /::(?:before|after)/u.test(selector);
        const semantic = !pseudo && (/(?:data-nse-control)/u.test(selector) && !/data-nse-part/u.test(selector) || [...semanticParts].some(part => selector.includes(`data-nse-part="${part}"`) || selector.includes(`data-nse-part=${part}]`)));
        const focused = /data-nse-focused|:focus/u.test(selector);
        if (semantic) for (const declaration of declarations) if (["display", "visibility", "content"].includes(cssTree.ident.decode(declaration.property))) fail(file, "semantic-limit", "Themes cannot set semantic display, visibility or content.");
        if (focused) {
          const removals = declarations.filter(declaration => /^(?:outline|outline-width|outline-style|box-shadow)$/u.test(declaration.property) && /^(?:none|0(?:px)?|transparent)$/u.test(valueText(declaration)));
          const replacement = declarations.some(declaration => /^(?:outline|box-shadow|border|border-color|background|background-color)$/u.test(declaration.property) && !/^(?:none|0(?:px)?|transparent)$/u.test(valueText(declaration)));
          if (removals.length && !replacement) fail(file, "focus-limit", "A focused control must retain a visible focus indicator.");
        }
        if (semantic && /data-nse-control-size=(?:"|')?(?:regular|large)/u.test(selector)) for (const declaration of declarations) if (/^min-(?:width|height|inline-size|block-size)$/u.test(declaration.property) && /^\d+(?:\.\d+)?px$/u.test(valueText(declaration)) && parseFloat(valueText(declaration)) < 24) fail(file, "hit-target-limit", "Regular and large hit targets must be at least 24 points.");
      }
      if (node.type === "Declaration") {
        const property = cssTree.ident.decode(node.property).toLowerCase();
        if (/^(?:animation|transition)(?:-|$)/u.test(property)) fail(file, "motion", "Themes cannot define motion.");
        if (/^(?:font(?:-|$)|line-height$|letter-spacing$|word-spacing$|text-transform$)/u.test(property)) fail(file, "typography", "Themes cannot define typography.");
        if (["behavior", "-moz-binding"].includes(property)) fail(file, "css-code", "Executable CSS is forbidden.");
        validateCssValue(valueText(node), url => localPath(root, file, url), file);
      }
    },
  });
  return ast;
}
export function readThemeBundle(bundlePath, options = {}) {
  const root = resolve(bundlePath), files = walk(root), contents = resolve(root, "Contents");
  assertThemeFileNames(files.map(file => relative(root, file)));
  for (const file of files) {
    const name = relative(contents, file).replaceAll("\\", "/");
    if (["Info.ts", "Theme.json"].includes(name)) continue;
    if (name.startsWith("Licences/") && (/\.(?:txt|md)$/iu.test(name) || /\/(?:LICENSE|LICENCE|NOTICE|COPYING)$/u.test(name))) continue;
    if (!name.startsWith("Resources/") || !resourceExtensions.has(extname(file).toLowerCase())) fail(file, "static-resources", "Themes contain static data and resources only; no code, fonts or motion.");
  }
  const infoPath = resolve(contents, "Info.ts"), definitionPath = resolve(contents, "Theme.json");
  let info;
  try { info = staticInfo(infoPath); } catch (error) { fail(infoPath, "static-info", error.message); }
  record(info, ["bundleIdentifier", "displayName", "version", "themeContractVersion"], infoPath);
  if (!identifier.test(info.bundleIdentifier ?? "") || typeof info.displayName !== "string" || !info.displayName.trim() || typeof info.version !== "string" || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-z-]+(?:\.[\da-z-]+)*)?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/iu.test(info.version) || info.themeContractVersion !== 1) fail(infoPath, "metadata", "Invalid bundle identifier, display name, semver or themeContractVersion.");
  const contract = options.contract ?? JSON.parse(readFileSync(new URL("../../tooling/nse-theme-contract.json", import.meta.url), "utf8"));
  let input; try { input = JSON.parse(readFileSync(definitionPath, "utf8")); } catch (error) { fail(definitionPath, "json", error.message); }
  validateDefinition(input, contract, definitionPath, root);
  for (const file of files.filter(file => extname(file).toLowerCase() === ".svg")) validateSvg(readFileSync(file, "utf8"), file);
  const imports = new Map(), stylesheets = new Map();
  for (const file of files.filter(file => extname(file).toLowerCase() === ".css")) {
    const dependencies = []; imports.set(file, dependencies);
    stylesheets.set(file, validateThemeCSS(readFileSync(file, "utf8"), { file, root, contract, onImport: path => dependencies.push(path) }));
  }
  const stylesheetPath = resolve(contents, "Resources/theme.css"), visited = new Set(), visiting = new Set();
  const visit = file => { if (visiting.has(file)) fail(file, "cyclic-import", "Cyclic theme CSS imports."); if (visited.has(file)) return; if (!stylesheets.has(file)) fail(file, "stylesheet", "Missing theme stylesheet."); visiting.add(file); for (const child of imports.get(file)) visit(child); visiting.delete(file); visited.add(file); };
  visit(stylesheetPath);
  const theme = freeze({ bundleIdentifier: info.bundleIdentifier, displayName: info.displayName, version: info.version, ...input });
  return Object.freeze({ bundlePath: root, infoPath, stylesheetPath, theme, files: Object.freeze(files), stylesheets: Object.freeze([...visited]), contract });
}
export function discoverThemeBundles(directory, options) {
  if (!directory || !existsSync(directory)) return Object.freeze([]);
  if (lstatSync(directory).isSymbolicLink()) fail(directory, "symbolic-link", "Theme discovery rejects symbolic links.");
  const names = readdirSync(directory).filter(name => name.toLowerCase().endsWith(".scostheme")).sort(); assertThemeFileNames(names);
  const seen = new Set();
  return Object.freeze(names.map(name => { const bundle = readThemeBundle(resolve(directory, name), options); if (seen.has(bundle.theme.bundleIdentifier)) fail(bundle.infoPath, "duplicate-identifier", `Duplicate theme identifier ${bundle.theme.bundleIdentifier}.`); seen.add(bundle.theme.bundleIdentifier); return bundle; }));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] !== "--validate" || !process.argv[3]) throw new Error("Usage: node theme-bundles.mjs --validate <bundle.scostheme>");
  const bundle = readThemeBundle(process.argv[3]); console.log(`${bundle.theme.bundleIdentifier}: zero errors`);
}
