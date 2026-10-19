/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, lstatSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { createSynWareValidator, parseManifest } from "../synware/validation-core.mjs";
import { bundlePaths, inside, json, projectContext, sdkName, slash, viteHints } from "./project.mjs";
import { similarity } from "./lookup.mjs";
export { lookupSdk } from "./lookup.mjs";
const run = promisify(execFile);
function optionsFor(context, input) {
  const hints = viteHints(context.root,Object.fromEntries(["appsDirectory","webspringEntry"].filter(key=>input[key]!==undefined).map(key=>[key,input[key]])));
  if (hints.unresolved.some(key=>input[key]===undefined)) throw new Error("Computed Vite options cannot be inspected safely; pass appsDirectory/webspringEntry explicitly. Unresolved: "+hints.unresolved.join(", "));
  if (hints.options.appsDirectory === "" || hints.options.webspringEntry === "") throw new Error("Vite directory and shell paths must not be empty.");
  return hints;
}
export async function inspectProject(input={}) {
  const context=projectContext(input.projectRoot), {root,sdkRoot,sdk,manifest}=context;
  const vite=optionsFor(context,input);
  const bundles=bundlePaths(root,vite.options.appsDirectory).map(path=>{
    const info=resolve(path,"Contents/Info.ts"), entry=resolve(path,"Contents/index.tsx");
    let id=null,error=null;
    try { id=parseManifest(info).id; } catch (failure) {error=failure.message;}
    return {directory:slash(relative(root,path)),id,manifest:existsSync(info),entry:existsSync(entry),error};
  });
  const shellPath=resolve(root,vite.options.webspringEntry || "src/Webspring/Contents/index.tsx");
  const receipt=resolve(sdkRoot,"tooling/build-receipt.json");
  return {projectRoot:root,sdk:{version:sdk.version,path:sdkRoot,buildReceipt:existsSync(receipt)?json(receipt):null},vite,bundles,shell:{enabled:vite.options.webspringEntry!==false,path:slash(relative(root,shellPath)),exists:existsSync(shellPath)},dependencies:manifest.dependencies ?? {},devDependencies:manifest.devDependencies ?? {}};
}
export async function validateProject(input={}) {
  const context=projectContext(input.projectRoot),{root,sdkRoot,sdk,manifest}=context;
  const vite=optionsFor(context,input), findings=[];
  const validator=createSynWareValidator({schema:json(resolve(sdkRoot,"tooling/manifest.schema.json")),allowedImports:["react","react/jsx-runtime","react/jsx-dev-runtime",...Object.keys(sdk.exports ?? {}).filter(key=>key!=="./sdk/testing").map(key=>sdkName+key.slice(1))],dependencies:{...manifest.dependencies,...manifest.devDependencies}});
  let bundles=[];
  try { bundles=bundlePaths(root,vite.options.appsDirectory).map(path=>validator.validateDirectory(path)); }
  catch (error) {findings.push({file:vite.options.appsDirectory ?? "src/SynWare",line:1,rule:"synware.structure",message:error.message});}
  findings.push(...bundles.flatMap(bundle=>bundle.findings.map(finding=>({...finding,file:slash(relative(root,finding.file))}))));
  let typescript={ran:false,exitCode:null};
  if (input.typescript!==false) {
    let tsc;
    try {tsc=context.require.resolve("typescript/bin/tsc");}
    catch {findings.push({file:"package.json",line:1,rule:"typescript.missing",message:"Install TypeScript in the consumer project to run tsc --noEmit."});}
    if (tsc) {
      let output="",exitCode=0;
      try { const result=await run(process.execPath,[tsc,"--noEmit","--pretty","false"],{cwd:root,maxBuffer:16*1024*1024,timeout:120000,windowsHide:true}); output=result.stdout+result.stderr; }
      catch (error) {output=(error.stdout ?? "")+(error.stderr ?? "");exitCode=typeof error.code==="number"?error.code:1;}
      typescript={ran:true,exitCode};
      const before=findings.length;
      for (const line of output.split(/\r?\n/u)) {
        const located=/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/u.exec(line);
        const global=/^error (TS\d+): (.*)$/u.exec(line);
        if (located) findings.push({file:slash(located[1]),line:Number(located[2]),column:Number(located[3]),rule:located[4],message:located[5]});
        else if (global) findings.push({file:"tsconfig.json",line:1,rule:global[1],message:global[2]});
      }
      if (exitCode && findings.length===before) findings.push({file:"tsconfig.json",line:1,rule:"typescript.failed",message:output.trim() || "TypeScript process failed or timed out."});
    }
  }
  return {ok:findings.length===0,findings,bundles:bundles.map(({findings,...bundle})=>bundle),typescript};
}
export async function scaffold(input) {
  const context=projectContext(input.projectRoot),{root}=context, vite=optionsFor(context,input);
  const {id,name,route}=input;
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/u.test(id ?? "")) throw new Error("Use a reverse-domain application id.");
  if (!name || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(name)) throw new Error("Name must be a safe bundle name, not a path.");
  if (!route || !route.startsWith("/") || route.startsWith("//") || /[?#\s]/u.test(route)) throw new Error("Route must be an absolute application pathname.");
  const target=resolve(root,vite.options.appsDirectory ?? "src/SynWare",name+".app");
  if (!inside(root,target)) throw new Error("Scaffold target must stay within the project.");
  for (let current=target;inside(root,current);current=dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Scaffolding through a symbolic link is forbidden.");
    if (current===root) break;
  }
  if (existsSync(target)) throw new Error("Bundle already exists; no files were changed.");
  const manifest={schemaVersion:1,id,version:"0.1.0",title:name,routes:[{path:route,primary:true}],presentations:["desktop","tablet","mobile"],localeResources:{base:"Resources/Localised/Base.locale/Localisable.strings"},webspring:{visible:true}};
  const header="/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.\n * Designed by Kavish Krishnakumar in Manchester.\n * SPDX-License-Identifier: AGPL-3.0-or-later\n */\n";
  const files={
    "Contents/Info.ts":header+"export default "+JSON.stringify(manifest,null,2)+" as const;\n",
    "Contents/index.tsx":header+'import { createSynWare } from "@syndromatic/syncloudos/sdk";\nimport manifest from "./Info";\n\nfunction Root() { return <main><h1>{manifest.title}</h1></main>; }\n\nexport default createSynWare({ manifest, root: Root });\n',
    "Contents/Resources/Localised/Base.locale/Localisable.strings":'"app.title" = '+JSON.stringify(name)+';\n',
  };
  mkdirSync(target,{recursive:true});
  const createdPaths=[];
  for (const [path,text] of Object.entries(files)) {const file=resolve(target,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text,{flag:"wx"});createdPaths.push(slash(relative(root,file)));}
  return {createdPaths};
}
export async function explainError({projectRoot,query,limit=5}) {
  const {sdkRoot,sdk}=projectContext(projectRoot);
  const catalogue=json(resolve(sdkRoot,"tooling/error-catalogue.json"));
  const normalized=query.toLowerCase(), words=new Set(normalized.match(/[a-z_]{3,}/gu) ?? []);
  const matches=catalogue.map(entry=>{
    const text=[entry.code,entry.title,entry.cause,entry.fix].join(" ").toLowerCase();
    const exact=normalized.includes(entry.code.toLowerCase());
    const overlap=[...words].filter(word=>text.includes(word)).length/Math.max(words.size,1);
    return {...entry,score:exact?2:Math.max(similarity(query,entry.code),similarity(query,entry.title),overlap),docs:entry.docs ?? null};
  }).filter(entry=>entry.score>=0.3).sort((a,b)=>b.score-a.score).slice(0,limit);
  return {version:sdk.version,matches};
}
