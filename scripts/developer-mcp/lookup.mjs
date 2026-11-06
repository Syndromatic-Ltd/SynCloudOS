/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { inside, projectContext, slash } from "./project.mjs";
export function similarity(query, candidate) {
  const a = query.toLowerCase(), b = candidate.toLowerCase();
  if (a === b) return 1;
  if (b.includes(a)) return 0.9;
  const row = Array.from({length:b.length+1},(_,i) => i);
  for (let i=1;i<=a.length;i++) {
    let previous = row[0]; row[0]=i;
    for (let j=1;j<=b.length;j++) { const old=row[j]; row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1)); previous=old; }
  }
  return 1-row[b.length]/Math.max(a.length,b.length,1);
}
function applicationMenuQuery(query) {
  return /^(?:application[\s_-]*menu|(?:system\s+)?preferences|settings|account)$/iu.test(query?.trim() ?? "");
}
function symbolScore(query, name) {
  if (query.toLowerCase()===name.toLowerCase()) return 2;
  if (applicationMenuQuery(query)) {
    const preferred=["useApplicationMenuTrigger","SynWareApplicationMenuManifest","SynWareApplicationMenuTriggerPort"];
    const index=preferred.indexOf(name);
    if (index!==-1) return 1.5-index*0.1;
  }
  return similarity(query,name);
}
const DOC_EXCERPT=1500, SIGNATURE_OUTLINE=1200;
/** The installed SDK's map of NSE names to their AppKit, Foundation or Core framework counterparts. */
export function appkitCounterparts(sdkRoot) {
  const path=resolve(sdkRoot,"docs/framework/appkit-counterparts.json");
  return existsSync(path) ? JSON.parse(readFileSync(path,"utf8")) : null;
}
/**
 * The counterpart of a public NSE name: its own entry, or the entry of the name it extends with one of
 * the map's derived suffixes (NSEButtonProps takes NSEButton's). Undefined when the map has none.
 */
export function appkitCounterpartFor(name, map) {
  if (!map) return undefined;
  const suffix=new RegExp("(?:"+map.derivedSuffixes.join("|")+")$","u");
  for (let base=name;;) {
    if (Object.hasOwn(map.counterparts,base)) return map.counterparts[base];
    if (!suffix.test(base)) return undefined;
    base=base.replace(suffix,"");
  }
}
/** A long class or interface as its header and member signatures, without bodies or private members. */
function outline(declaration) {
  const text=declaration.getText().replace(/^\s*export\s+/u,"");
  if (text.length<=SIGNATURE_OUTLINE || !(ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration))) return {signature:text,outlined:false};
  const source=declaration.getSourceFile(), open=text.indexOf("{");
  const members=[];
  for (const member of declaration.members) {
    if (member.name && (ts.isPrivateIdentifier(member.name) || ts.getCombinedModifierFlags(member) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected))) continue;
    const body=member.body;
    const start=member.getStart(source), end=body ? body.getStart(source) : member.getEnd();
    members.push("  "+source.text.slice(start,end).replace(/\s+/gu," ").trim().replace(/[;{]?$/u,";"));
  }
  return {signature:(open===-1 ? text : text.slice(0,open+1))+"\n"+members.join("\n")+"\n}",outlined:true};
}
export function docSections(sdkRoot, query, limit=3) {
  const docsRoot=resolve(sdkRoot,"docs/framework");
  if (!existsSync(docsRoot) || !query) return [];
  const words=query.toLowerCase().match(/[a-z][a-z0-9_]+/gu) ?? [];
  const results=[];
  function scan(directory) {
    for (const file of readdirSync(directory,{withFileTypes:true})) {
      const path=resolve(directory,file.name);
      if (file.isDirectory()) scan(path);
      else if (file.isFile() && file.name.endsWith(".md")) {
        const sections=readFileSync(path,"utf8").split(/(?=^#{1,6} )/mu);
        for (const text of sections) {
          const lower=text.toLowerCase();
          let score=words.filter(word=>lower.includes(word)).length;
          if (applicationMenuQuery(query) && lower.includes("useapplicationmenutrigger")) {
            score+=10;
            if (lower.includes("applicationmenu")) score+=2;
            if (lower.includes("preferences")) score+=2;
            if (text.includes("```")) score+=1;
          }
          if (score) results.push({file:slash(relative(sdkRoot,path)),heading:text.split("\n")[0],text:text.slice(0,DOC_EXCERPT),truncated:text.length>DOC_EXCERPT,score});
        }
      }
    }
  }
  scan(docsRoot);
  return results.sort((a,b)=>b.score-a.score).slice(0,limit);
}
export async function lookupSdk({projectRoot,entry,query,limit=8,full=false}={}) {
  const {sdkRoot,sdk}=projectContext(projectRoot);
  const entries=Object.entries(sdk.exports ?? {}).filter(([,target])=>target && typeof target==="object" && target.types).map(([name,target])=>({name:name.replace(/^\.\//u,""),path:resolve(sdkRoot,target.types)}));
  if (!query && !entry) return {version:sdk.version,entries:entries.map(value=>value.name)};
  const selected=entry ? entries.filter(value=>value.name===entry.replace(sdk.name+"/","").replace(/^\.\//u,"")) : entries;
  if (!selected.length) throw new Error("Unknown SDK entry: " + entry);
  for (const value of selected) if (!inside(sdkRoot,value.path)) throw new Error("SDK type export escapes its package.");
  const program=ts.createProgram(selected.map(value=>value.path),{noLib:true,skipLibCheck:true,moduleResolution:ts.ModuleResolutionKind.Bundler,module:ts.ModuleKind.ESNext,allowJs:false});
  // One result per declaration: a symbol re-exported by several entries lists every entry once.
  const checker=program.getTypeChecker(),symbols=[],byDeclaration=new Map(),counterparts=appkitCounterparts(sdkRoot);
  for (const value of selected) {
    const source=program.getSourceFile(value.path),module=source && checker.getSymbolAtLocation(source);
    if (!module) continue;
    for (const exported of checker.getExportsOfModule(module)) {
      const name=exported.getName(),score=query ? symbolScore(query,name) : 1;
      if (score<0.55) continue;
      const symbol=exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const declarations=symbol.getDeclarations() ?? [];
      const key=declarations.map(declaration=>declaration.getSourceFile().fileName+":"+declaration.pos).join("|")+"|"+name;
      const existing=byDeclaration.get(key);
      if (existing) { existing.entries.push(value.name); continue; }
      const shapes=declarations.map(declaration=>full ? {signature:declaration.getText().replace(/^\s*export\s+/u,""),outlined:false} : outline(declaration));
      const signature=shapes.map(shape=>shape.signature).join("\n");
      const jsDoc=ts.displayPartsToString(symbol.getDocumentationComment(checker));
      const tags=symbol.getJsDocTags(checker).map(tag=>"@"+tag.name+" "+ts.displayPartsToString(tag.text));
      const first=declarations[0];
      const record={entry:value.name,entries:[value.name],name,signature,outlined:shapes.some(shape=>shape.outlined),jsDoc:[jsDoc,...tags].filter(Boolean).join("\n"),file:first ? slash(relative(sdkRoot,first.getSourceFile().fileName)) : null,line:first ? first.getSourceFile().getLineAndCharacterOfPosition(first.getStart()).line+1 : null,score};
      // NSE names are AppKit names: say which, or why there is none.
      const counterpart=/^NSE[A-Z]/u.test(name) ? appkitCounterpartFor(name,counterparts) : undefined;
      if (counterpart!==undefined) record.appkitCounterpart=counterpart;
      byDeclaration.set(key,record); symbols.push(record);
    }
  }
  // Report each symbol under one entry: sdk first, then the root, nse and the rest.
  const rank=name=>name==="sdk" ? 0 : name==="." ? 1 : name==="nse" ? 2 : 3;
  for (const record of symbols) { record.entries.sort((a,b)=>rank(a)-rank(b) || a.localeCompare(b)); record.entry=record.entries[0]; }
  const matches=symbols.sort((a,b)=>b.score-a.score || rank(a.entry)-rank(b.entry) || a.name.localeCompare(b.name)).slice(0,limit);
  return {version:sdk.version,symbols:matches,docs:docSections(sdkRoot,applicationMenuQuery(query) ? query : matches[0]?.name ?? query ?? entry)};
}
