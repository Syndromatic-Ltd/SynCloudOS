/** Validated host-trusted static .scostheme packages. No package code is evaluated. */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import postcss from 'postcss';
import * as cssTree from 'css-tree';
import { SaxesParser } from 'saxes';
import ts from 'typescript';
import { parseManifest } from './manifest-source.mjs';
import { defineNSETheme } from '../../src/NSE/Appearance/themeDefinition.mjs';
import { defineFontDeclaration, fontDeclarationCSS } from '../../src/NSE/Typography/fontDeclaration.mjs';

const identifier = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;
const resourceExtensions = new Set(['.css','.png','.jpg','.jpeg','.webp','.gif','.svg','.avif','.woff','.woff2','.ttf','.otf','.txt','.md','.json','.strings']);
const fontRoles = new Set(['ui','body','title','label','monospace']);
const inside = (root, path) => { const rel = relative(root,path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'); };
function walk(root) {
  const files=[]; let bytes=0;
  function visit(path, depth=0) {
    if(depth>20) throw new TypeError('Theme directory depth exceeds 20 levels.');
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
      if(stat.size>32*1024*1024 || bytes>128*1024*1024 || files.length>=4096) throw new TypeError('Theme resource size or count limit exceeded.');
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
        postcss.parse(`svg{${attribute.value}}`).walkDecls(decl=>validateCssValue(decl.value,fragment,label));
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
  if(!decoded||/^(?:[a-z][a-z\d+.-]*:|\/|\\)/iu.test(decoded)||decoded.includes('\\')) throw new TypeError(`Theme URL must be package-local: ${url}`);
  const target=resolve(dirname(from),decoded);
  if(!inside(root,target)||!existsSync(target)||!lstatSync(target).isFile()) throw new TypeError(`Theme URL escapes package or is missing: ${url} in ${from}`);
  return target;
}
function captureFonts(root,contents,definition,version) {
  const path=resolve(contents,'Fonts.json'); if(!existsSync(path)) return null;
  const input=JSON.parse(readFileSync(path,'utf8')); defineFontDeclaration(input);
  for(const role of Object.keys(input.roles??{})) if(!fontRoles.has(role)) throw new TypeError(`Unsupported theme font role: ${role}`);
  const names=new Map();
  const namespace=name=>{if(!names.has(name))names.set(name,`${definition.id}-${version}-${name}`);return names.get(name);};
  for(const family of input.families) for(const face of family.faces) face.browserFamily=namespace(face.browserFamily);
  for(const alias of input.aliases??[]) alias.family=namespace(alias.family);
  for(const family of input.families) {
    if(family.fallback) family.fallback=family.fallback.map(name=>names.get(name)??name);
    for(const face of family.faces) if(face.fallback) face.fallback=face.fallback.map(name=>names.get(name)??name);
  }
  for(const role of Object.values(input.roles??{})) {
    if(role.family&&names.has(role.family))role.family=names.get(role.family);
    if(role.fallback)role.fallback=role.fallback.map(name=>names.get(name)??name);
  }
  const declaration=defineFontDeclaration(input);
  const resources=Object.entries(declaration.resources).map(([id,resourcePath])=>Object.freeze({id,path:resourcePath,file:localPath(root,path,resourcePath)}));
  return Object.freeze({declaration,resources:Object.freeze(resources)});
}
export function readThemePackage(packagePath) {
  const root=resolve(packagePath), files=walk(root), contents=resolve(root,'Contents');
  for(const file of files) {
    const rel=relative(contents,file).replaceAll('\\','/');
    if(['Info.ts','Theme.json','Fonts.json','styles.css'].includes(rel))continue;
    if(rel.startsWith('Licences/')&&(/\.(?:txt|md)$/iu.test(rel)||/\/(?:LICENSE|LICENCE|NOTICE|COPYING)$/u.test(rel)))continue;
    if(!rel.startsWith('Resources/')||!resourceExtensions.has(extname(file).toLowerCase())) throw new TypeError(`Theme packages contain static data and local resources only: ${file}`);
  }
  const infoPath=resolve(contents,'Info.ts'),metadata=staticInfo(infoPath);
  keys(metadata,['bundleIdentifier','displayName','version','themeContractVersion','definition','stylesheet','description','author'],'Theme Info.ts');
  if(!identifier.test(metadata.bundleIdentifier??'')||typeof metadata.displayName!=='string'||!metadata.displayName.trim()||typeof metadata.version!=='string'||!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(metadata.version)||metadata.themeContractVersion!==1||metadata.definition!=='Theme.json'||metadata.stylesheet!=='styles.css')throw new TypeError(`Invalid theme package metadata: ${infoPath}`);
  const inputDefinition=JSON.parse(readFileSync(resolve(contents,'Theme.json'),'utf8'));
  let definition=defineNSETheme(inputDefinition);
  if(definition.id!==metadata.bundleIdentifier||definition.displayName!==metadata.displayName||definition.metadata?.version!==metadata.version||definition.metadata?.themeContractVersion!==metadata.themeContractVersion)throw new TypeError(`Theme definition metadata disagrees with Info.ts: ${root}`);
  const fonts=captureFonts(root,contents,definition,metadata.version);
  const scope=`[data-nse-theme="${definition.id}"]`;
  for(const file of files.filter(file=>extname(file).toLowerCase()==='.svg'))validateSvg(readFileSync(file,'utf8'),file);
  const parsed=new Map(files.filter(file=>file.toLowerCase().endsWith('.css')).map(file=>[file,postcss.parse(readFileSync(file,'utf8'),{from:file})]));
  const tokensByFile=new Map(), importsByFile=new Map();
  for(const [file,css] of parsed) {
    const names=new Set(), imports=[];tokensByFile.set(file,names);importsByFile.set(file,imports);
    css.walkAtRules(rule=>{
      if(rule.name==='scope'&&rule.params!==`(${scope}) to ([data-nse-theme]:not(${scope}))`)throw new TypeError(`Theme @scope must bound nested foreign themes: ${file}`);
      if(rule.name==='font-face') {
        const family=rule.nodes.find(node=>node.type==='decl'&&node.prop==='font-family')?.value.replace(/^['"]|['"]$/gu,'');
        if(!family?.startsWith(definition.id+'-'))throw new TypeError('Theme font-face family must be package-unique.');
      }
      if(rule.name==='import') {
        const match=/^(["'])([^"']+)\1\s*$/u.exec(rule.params);
        if(!match)throw new TypeError(`Theme @import must be a quoted local stylesheet: ${file}`);
        const target=localPath(root,file,match[2]);if(!target?.toLowerCase().endsWith('.css'))throw new TypeError('Theme import must target CSS.');imports.push(target);
      } else if(!['scope','media','supports','container','layer','keyframes','-webkit-keyframes','font-face','starting-style'].includes(rule.name))throw new TypeError(`Unsupported theme CSS at-rule @${rule.name}`);
      if(/keyframes$/u.test(rule.name)&&!rule.params.startsWith(definition.id.replaceAll('.','-')+'-'))throw new TypeError(`Theme keyframes must be namespaced: ${rule.params}`);
    });
    css.walkRules(rule=>{
      if(rule.parent.type==='atrule'&&/keyframes$/u.test(rule.parent.name))return;
      let parent=rule.parent;while(parent&&!(parent.type==='atrule'&&parent.name==='scope'))parent=parent.parent;
      if(!parent)throw new TypeError(`Theme selectors require a bounded @scope: ${file}`);
      if(/:(?:has|not)\([^)]*data-nse-theme/u.test(rule.selector))throw new TypeError('Theme selectors cannot negate or relationally match theme boundaries.');
      for(const selector of rule.selectors)if(!selector.includes(scope))throw new TypeError(`Unscoped theme selector: ${selector}`);
    });
    css.walkDecls(decl=>{
      const property=cssTree.ident.decode(decl.prop);
      if(/^--nse-[a-z][a-z0-9-]*$/u.test(property))names.add(property);
      if(['behavior','-moz-binding'].includes(property.toLowerCase()))throw new TypeError('Executable theme CSS is unsupported.');
      validateCssValue(decl.value,url=>localPath(root,file,url),file,decl.parent.type==='atrule'&&decl.parent.name==='font-face'&&property.toLowerCase()==='src');
    });
  }
  const visited=new Set(),visiting=new Set();
  function visit(file) { if(visiting.has(file))throw new TypeError(`Cyclic theme CSS imports: ${file}`);if(visited.has(file))return;visiting.add(file);for(const imported of importsByFile.get(file)??[])visit(imported);visiting.delete(file);visited.add(file); }
  visit(resolve(contents,'styles.css'));
  const names=new Set();for(const file of visited)for(const name of tokensByFile.get(file)??[])names.add(name);
  for(const role of Object.keys(fonts?.declaration.roles??{}))names.add(`--nse-theme-font-${role}`);
  const styleTokenNames=[...names].sort();
  if(inputDefinition.styleTokenNames!==undefined&&JSON.stringify([...inputDefinition.styleTokenNames].sort())!==JSON.stringify(styleTokenNames))throw new TypeError(`Theme styleTokenNames must exactly match its reachable stylesheet and font role inventory: ${root}`);
  definition=defineNSETheme({...definition,styleTokenNames});
  return Object.freeze({name:root.split(/[\\/]/u).at(-1),packagePath:root,infoPath,stylesheetPath:resolve(contents,'styles.css'),definition,fonts,files:Object.freeze(files),licences:Object.freeze(files.filter(file=>file.startsWith(resolve(contents,'Licences')+'/'))),localizedMetadata:Object.freeze(files.filter(file=>file.includes('/Resources/Localised/')&&file.endsWith('.strings')))});
}
export function discoverThemePackages(directory) {
  if(!directory||!existsSync(directory))return Object.freeze([]);
  if(lstatSync(directory).isSymbolicLink())throw new TypeError('Theme directory must not be a symbolic link.');
  const seenNames=new Set(),seenIds=new Set();
  return Object.freeze(readdirSync(directory).filter(name=>name.toLowerCase().endsWith('.scostheme')).sort().map(name=>{
    if(seenNames.has(name.toLowerCase()))throw new TypeError(`Theme package case collision: ${name}`);seenNames.add(name.toLowerCase());
    const theme=readThemePackage(resolve(directory,name));if(seenIds.has(theme.definition.id))throw new TypeError(`Duplicate theme ID: ${theme.definition.id}`);seenIds.add(theme.definition.id);return theme;
  }));
}
export function themeFontCSS(theme,urls) {
  if(!theme.fonts)return '';
  return fontDeclarationCSS(theme.fonts.declaration,urls,{scope:`[data-nse-theme="${theme.definition.id}"]`,rolePrefix:'--nse-theme-font-'});
}
