/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, lstatSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import { createSynWareValidator, deriveManifestForFolder, discoverProjectFolders, rejectDuplicateBundleIdentifiers } from "../synware/validation-core.mjs";
import { deriveSynWareManifest, kebabCase, titleFromFolderName, assertUniqueBundleIdentifiers } from "../synware/project-derivation.mjs";
import { scaffoldProjectFiles, scaffoldBundleIdentifier } from "../synware/create-synware.mjs";
import { auditSynWareIdioms } from "../synware/idiom-audit.mjs";
import { runLaunchCheck } from "./launch-check.mjs";
import { normalizeBundleIdentifier } from "../../src/SynCloudOS/Identity/bundleIdentifier.mjs";
import { applicationHostHints, bundlePaths, discoveryKeys, inside, json, projectContext, sdkName, slash, viteHints } from "./project.mjs";
import { docSections, lookupSdk, similarity } from "./lookup.mjs";
export { lookupSdk } from "./lookup.mjs";
const run = promisify(execFile);
function optionsFor(context, input) {
  const hints = viteHints(context.root,Object.fromEntries(discoveryKeys.filter(key=>input[key]!==undefined).map(key=>[key,input[key]])));
  if (hints.unresolved.some(key=>input[key]===undefined)) throw new Error("Computed Vite options cannot be inspected safely; pass appsDirectory/webspringEntry explicitly. Unresolved: "+hints.unresolved.join(", "));
  if (hints.options.appsDirectory === "" || hints.options.webspringEntry === "") throw new Error("Vite directory and shell paths must not be empty.");
  return hints;
}
export async function inspectProject(input={}) {
  const context=projectContext(input.projectRoot), {root,sdkRoot,sdk,manifest}=context;
  const vite=optionsFor(context,input);
  const bundles=bundlePaths(root,vite.options.appsDirectory).map(path=>{
    const info=resolve(path,"Contents/Info.ts"), entry=resolve(path,"Contents/index.tsx");
    let bundleIdentifier=null,displayName=null,error=null;
    let resolvedManifest = null;
    try { resolvedManifest=deriveManifestForFolder(path); bundleIdentifier=resolvedManifest.bundleIdentifier; displayName=resolvedManifest.displayName; } catch (failure) {error=failure.message;}
    return {directory:slash(relative(root,path)),bundleIdentifier,displayName,manifest:existsSync(info),resolvedManifest,entry:existsSync(entry),error};
  });
  assertUniqueBundleIdentifiers(bundles.filter(bundle=>bundle.resolvedManifest).map(bundle=>({...bundle,manifest:bundle.resolvedManifest})));
  const shellPath=resolve(root,vite.options.webspringEntry || "src/Webspring/Contents/index.tsx");
  const folders = ["preferencesDirectory", "widgetsDirectory", "integrationsDirectory"].flatMap((key, index) =>
    discoverProjectFolders(resolve(root, vite.options[key] ?? ["src/Preferences", "src/Widgets", "src/Integrations"][index]))
      .map(path => ({ directory: slash(relative(root, path)), kind: path.endsWith(".prefPane") ? "preferencePane" : path.endsWith(".widget") ? "widget" : "integration" })));
  const receipt=resolve(sdkRoot,"tooling/build-receipt.json");
  return {projectRoot:root,sdk:{version:sdk.version,path:sdkRoot,buildReceipt:existsSync(receipt)?json(receipt):null},vite,bundles,folders,shell:{enabled:vite.options.webspringEntry!==false,path:slash(relative(root,shellPath)),exists:existsSync(shellPath)},dependencies:manifest.dependencies ?? {},devDependencies:manifest.devDependencies ?? {}};
}
export async function validateProject(input={}) {
  const context=projectContext(input.projectRoot),{root,sdkRoot,sdk,manifest}=context;
  const vite=optionsFor(context,input), findings=[];
  const validator=createSynWareValidator({schema:json(resolve(sdkRoot,"tooling/manifest.schema.json")),allowedImports:["react","react/jsx-runtime","react/jsx-dev-runtime",...Object.keys(sdk.exports ?? {}).filter(key=>key!=="./sdk/testing").map(key=>sdkName+key.slice(1))],dependencies:{...manifest.dependencies,...manifest.devDependencies}});
  let bundles=[];
  try {
    const paths = bundlePaths(root,vite.options.appsDirectory);
    for (const [key, fallback] of [["preferencesDirectory","src/Preferences"],["widgetsDirectory","src/Widgets"],["integrationsDirectory","src/Integrations"]]) paths.push(...discoverProjectFolders(resolve(root,vite.options[key] ?? fallback)));
    bundles=rejectDuplicateBundleIdentifiers(paths.map(path=>validator.validateDirectory(path)));
  }
  catch (error) {findings.push({file:vite.options.appsDirectory ?? "src/SynWare",line:1,rule:"synware.structure",message:error.message});}
  findings.push(...bundles.flatMap(bundle=>bundle.findings.map(finding=>({...finding,file:slash(relative(root,finding.file))}))));
  let host=applicationHostHints(root);
  if (host.status==="checked" && host.application) {
    const primaries=bundles.filter(bundle=>bundle.bundleIdentifier && normalizeBundleIdentifier(bundle.bundleIdentifier)===normalizeBundleIdentifier(host.application.bundleIdentifier));
    if (primaries.length!==1 || !primaries[0].ok) host={...host,status:"unresolved",reason:"The primary bundle is missing, ambiguous or invalid; its application-menu requirement could not be assessed."};
    else {
      const file=resolve(primaries[0].directory,"Contents/Info.ts"), primary=primaries[0].manifest;
      // With sign-in disabled no session can exist, so a primary that is not public can never open.
      const isPublic=primary.runtime?.policy?.public===true || (primary.permissions ?? []).includes("app.open.public");
      if (host.authentication==="disabled" && !isPublic) findings.push({
        file:slash(relative(root,file)),line:1,rule:"synware.public-policy",
        message:`Primary application ${host.application.bundleIdentifier} is mounted with authentication "disabled" but is not public, so it can never launch: nobody can sign in. Set runtime: { policy: { public: true } } in Info.ts, or enable authentication.`,
      });
      const fillsPage=host.application.frame==="fullscreen" || (primary.runtime?.presentation ?? "appView")==="appView";
      if (fillsPage && host.authentication!=="disabled" && primary.applicationMenu?.trigger!=="content") findings.push({
        file:slash(relative(root,file)),line:1,rule:"synware.application-menu",
        message:`Primary application ${host.application.bundleIdentifier} fills the page with ${host.authentication} authentication. Declare applicationMenu: { trigger: "content" } and render a useApplicationMenuTrigger() button so people can reach Preferences > Account, Sign In and Log Out.`,
      });
    }
  }
  let typescript={ran:false,exitCode:null};
  if (input.typescript!==false) {
    let tsc;
    try {tsc=context.require.resolve("typescript/bin/tsc");}
    catch {findings.push({file:"package.json",line:1,rule:"typescript.missing",message:"Install TypeScript in the consumer project to run tsc --noEmit."});}
    if (tsc) {
      // A solution-style tsconfig.json ("files": [] with "references") checks nothing under a bare
      // tsc --noEmit, so each referenced project is checked on its own.
      const projects=typescriptProjects(context,root);
      let output="",exitCode=0;
      for (const project of projects) {
        const args=[tsc,"--noEmit","--pretty","false",...(project ? ["-p",project] : [])];
        try { const result=await run(process.execPath,args,{cwd:root,maxBuffer:16*1024*1024,timeout:120000,windowsHide:true}); output+=result.stdout+result.stderr; }
        catch (error) {output+=(error.stdout ?? "")+(error.stderr ?? "");exitCode=exitCode || (typeof error.code==="number"?error.code:1);}
      }
      typescript={ran:true,exitCode,projects:projects.map(project=>project ?? "tsconfig.json")};
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
  // Building is not launching: run the host entry in a page so launch-time failures (denied
  // capabilities, missing documents, render loops) are found here rather than in a browser.
  let launch={ran:false,reason:"Skipped by launch: false."};
  if (input.launch!==false) {
    const checked=await runLaunchCheck(root);
    launch={ran:checked.ran,...(checked.entry ? {entry:checked.entry} : {}),...(checked.limits ? {limits:checked.limits} : {}),...(checked.reason ? {reason:checked.reason} : {})};
    findings.push(...checked.findings);
  }
  // Idiom findings are warnings: they never make a valid project invalid, but an
  // agent must not read "0 errors" as idiomatic SynCloudOS.
  const audit=input.idioms===false ? {findings:[],idiomAudit:null} : auditSynWareIdioms({root,sdkRoot:context.sdkRoot,applications:bundles.filter(bundle=>bundle.kind==="application" && bundle.ok)});
  findings.push(...audit.findings);
  return {ok:findings.every(finding=>finding.severity==="warning"),findings,bundles:bundles.map(({findings,...bundle})=>bundle),typescript,launch,host,idiomAudit:audit.idiomAudit};
}
/** The TypeScript projects validate checks: the root config, or the projects a solution-style root config references. */
function typescriptProjects(context,root) {
  let ts;
  try { ts=context.require("typescript"); } catch { return [null]; }
  const out=[], seen=new Set();
  const visit=(configPath,depth) => {
    const key=configPath.toLowerCase();
    if (seen.has(key) || depth>8) return;
    seen.add(key);
    const read=ts.readConfigFile(configPath,ts.sys.readFile);
    const config=read.config;
    const solution=config && Array.isArray(config.files) && config.files.length===0 && !config.include && Array.isArray(config.references) && config.references.length>0;
    if (!solution) { out.push(configPath); return; }
    for (const reference of config.references) {
      if (typeof reference?.path!=="string") continue;
      let target=resolve(dirname(configPath),reference.path);
      if (!/\.json$/iu.test(target)) target=resolve(target,"tsconfig.json");
      if (ts.sys.fileExists(target)) visit(target,depth+1);
    }
  };
  const rootConfig=resolve(root,"tsconfig.json");
  if (!ts.sys.fileExists(rootConfig)) return [null];
  visit(rootConfig,0);
  return out.length===0 ? [null] : out.map(path=>slash(relative(root,path)) === "tsconfig.json" ? null : slash(relative(root,path)));
}
export async function scaffold(input) {
  const context=projectContext(input.projectRoot),{root}=context, vite=optionsFor(context,input);
  const {name,route,kind = "application"}=input;
  const id = input.id ?? kebabCase(name);
  if (kind !== "application" && !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(id ?? "")) throw new Error("Use a valid contribution ID.");
  if (kind === "application" && input.id !== undefined) throw new Error("Applications declare bundleIdentifier, not id.");
  const bundleIdentifier = kind === "application" ? input.bundleIdentifier ?? scaffoldBundleIdentifier(name,input.organisation) : null;
  if (!name || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(name)) throw new Error("Name must be a safe bundle name, not a path.");
  if (route !== undefined && (!route.startsWith("/") || route.startsWith("//") || /[?#\s]/u.test(route))) throw new Error("Route must be an absolute application pathname.");
  const location = { application: [vite.options.appsDirectory ?? "src/SynWare", ".app"], preferencePane: [vite.options.preferencesDirectory ?? "src/Preferences", ".prefPane"], widget: [vite.options.widgetsDirectory ?? "src/Widgets", ".widget"], integration: [vite.options.integrationsDirectory ?? "src/Integrations", ".integration.ts"] }[kind];
  if (!location) throw new Error(`Unknown project folder kind: ${kind}.`);
  const target=resolve(root,location[0],name+location[1]);
  if (!inside(root,target)) throw new Error("Scaffold target must stay within the project.");
  for (let current=target;inside(root,current);current=dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Scaffolding through a symbolic link is forbidden.");
    if (current===root) break;
  }
  if (existsSync(target)) throw new Error("Bundle already exists; no files were changed.");
  const manifest={bundleIdentifier,displayName:titleFromFolderName(name),version:"1.0.0",webspring:{visible:true}};
  if (route !== undefined) manifest.routes = [{path:route,primary:true}];
  if (input.policy!==undefined || input.presentation!==undefined) manifest.runtime={
    ...(input.policy!==undefined ? {policy:input.policy} : {}),
    ...(input.presentation!==undefined ? {presentation:input.presentation} : {}),
  };
  if (input.contentApplicationMenu!==undefined && typeof input.contentApplicationMenu!=="boolean") throw new Error("contentApplicationMenu must be a boolean.");
  if (input.contentApplicationMenu) manifest.applicationMenu={trigger:"content"};
  const validateManifest=new Ajv2020({allErrors:true,strict:false}).compile(json(resolve(context.sdkRoot,"tooling/manifest.schema.json")));
  if (kind === "application" && !validateManifest(deriveSynWareManifest({folderName:name+".app",info:manifest}))) throw new Error("Scaffold manifest is invalid: "+validateManifest.errors.map(error=>(error.instancePath || "/")+" "+error.message).join("; "));
  const header="/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.\n * Designed by Kavish Krishnakumar in Manchester.\n * SPDX-License-Identifier: AGPL-3.0-or-later\n */\n";
  if (input.authoring!==undefined && !["separate","inline","function"].includes(input.authoring)) throw new Error("authoring must be separate, inline or function.");
  if (kind !== "application" && input.authoring!==undefined) throw new Error("authoring applies to application scaffolds only.");
  // Class authoring (NSEApplication + NSEViewController + NSE controls) is the default. The CLI
  // and this tool share one template, so the code an agent is handed cannot drift from create-synware.
  let testFallback=false;
  const files=Object.fromEntries(scaffoldProjectFiles({kind,name,id,bundleIdentifier,organisation:input.organisation,owners:input.owners,...(kind==="application"?{authoring:input.authoring,contentApplicationMenu:input.contentApplicationMenu===true}:{})}));
  if (kind === "application") {
    files["Contents/Info.ts"]=header+'import type { SynWareInfo } from "@syndromatic/syncloudos/sdk";\n\nexport default '+JSON.stringify(manifest,null,2)+" satisfies SynWareInfo;\n";
    files["Contents/index.tsx"]=header+files["Contents/index.tsx"];
    // The class scaffold's host test runs under Vitest with jsdom and Testing Library. A project
    // missing any of them gets a dependency-free smoke test instead, so the scaffold type-checks.
    const deps={...context.manifest.dependencies,...context.manifest.devDependencies};
    const missingTestTools=["vitest","jsdom","@testing-library/react"].filter(name=>!deps[name]);
    if (files["Contents/__tests__/app.test.tsx"]?.includes('from "vitest"') && missingTestTools.length>0) {
      files["Contents/__tests__/app.test.tsx"]='import Application from "../index";\n\nif (typeof Application !== "function") throw new Error("Expected an NSEApplication subclass");\n';
      testFallback=missingTestTools;
    }
  }
  if (kind !== "integration") mkdirSync(target,{recursive:true});
  const createdPaths=[];
  for (const [path,text] of Object.entries(files)) {const file=path ? resolve(target,path) : target;mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text,{flag:"wx"});createdPaths.push(slash(relative(root,file)));}
  const nextSteps=[];
  if (input.policy?.public!==true) nextSteps.push('Before using this bundle as the primary application with authentication "disabled" or "optional", explicitly set runtime.policy.public to true. Do not make private applications public unless that access is intended.');
  if (input.presentation===undefined) nextSteps.push('For a secondary windowed application, set runtime.presentation to "windowedView"; the default appView is for the primary application.');
  if (!input.contentApplicationMenu && (input.presentation===undefined || input.presentation==="appView")) nextSteps.push('A fullscreen primary with authentication "optional" or "required" must declare applicationMenu: { trigger: "content" } and render a useApplicationMenuTrigger() button, so people can reach Preferences > Account, Sign In and Log Out. Pass contentApplicationMenu: true to scaffold both.');
  if (testFallback) nextSteps.push(`The project has no ${testFallback.join(", ")}, so Contents/__tests__/app.test.tsx is a smoke test. Install vitest, jsdom and @testing-library/react as dev dependencies to test the application with createSynWareTestHost from @syndromatic/syncloudos/sdk/testing.`);
  nextSteps.push("Review the generated manifest and run the validate tool before registering the bundle.");
  return {createdPaths,nextSteps};
}
export async function explainError({projectRoot,query,limit=5}) {
  const {sdkRoot,sdk}=projectContext(projectRoot);
  const catalogue=json(resolve(sdkRoot,"tooling/error-catalogue.json"));
  const normalized=query.toLowerCase(), words=new Set(normalized.match(/[a-z_]{3,}/gu) ?? []);
  const tokens=new Set(normalized.match(/[a-z0-9_]+/gu) ?? []);
  const matches=catalogue.filter(entry=>tokens.has(entry.code.toLowerCase())).slice(0,limit).map(entry=>({...entry,score:2,docs:entry.docs ?? null}));
  const relatedThreshold=0.3;
  const sdkErrors=[];
  const codes=[...new Set(query.match(/\bTS\d+\b/gu) ?? [])];
  const npmWarning=/\bnpm\s+(?:warn(?:ing)?\b|notice\b)|\b(?:install|lifecycle) scripts? (?:were |was |had |are )?blocked\b/iu.test(query);
  const suggestedLookups=[...new Set(query.match(/\b[A-Z][a-zA-Z0-9_]*(?:[a-z][A-Z]|[A-Z][a-z])[a-zA-Z0-9_]*\b/gu) ?? [])].filter(name=>!/^TS\d+$/u.test(name)).slice(0,10);
  let classification={kind:"unclassified",catalogue:false,message:"No exact SynCloudOS catalogue code or exported SDK error class was identified. Related suggestions are not diagnoses."};
  const nextSteps=[];
  if (matches.length) {
    classification={kind:"catalogue",catalogue:true,message:"Exact error-code tokens found in the installed SynCloudOS catalogue."};
    nextSteps.push("Use the matching code's cause, fix and linked documentation; inspect the original exception and its structured diagnostics.");
  } else if (codes.length) {
    classification={kind:"typescript",catalogue:false,message:"TypeScript compiler diagnostics are outside the SynCloudOS runtime error-code catalogue.",codes};
    nextSteps.push("Read the complete compiler diagnostic and compare the argument and expected types. Use the lookup_sdk tool for SDK symbols named in the message, then run the consumer's TypeScript compiler again.");
  } else if (npmWarning) {
    classification={kind:"npm-warning",catalogue:false,message:"npm installation warnings are outside the SynCloudOS runtime error-code catalogue."};
    nextSteps.push("Inspect npm's named package and warning. A blocked install script is not proof that installation or the SDK failed; approve only trusted scripts under your project's npm policy if their native tool is needed, then run the consumer build.");
  } else {
    for (const name of new Set(query.match(/\b[A-Za-z_$][\w$]*Error\b/gu) ?? [])) {
      const found=await lookupSdk({projectRoot,query:name,limit:100});
      sdkErrors.push(...found.symbols.filter(symbol=>symbol.name===name && /^(?:declare\s+)?(?:abstract\s+)?class\s/u.test(symbol.signature)).map(symbol=>({...symbol,docs:docSections(sdkRoot,name)})));
    }
    if (sdkErrors.length) {
      classification={kind:"sdk-error",catalogue:false,message:"An exported SDK error class was identified in installed declarations, outside the global runtime code catalogue."};
      nextSteps.push("Read the exported error declaration and linked domain documentation. Inspect its typed fields (such as reason) rather than interpreting it as an unrelated runtime catalogue code.");
    } else nextSteps.push("Paste the canonical error code or exported SDK error class name, or use the lookup_sdk tool for the API involved. Symptom-only similarity is not evidence of a particular failure.");
  }
  const related=classification.kind!=="unclassified" ? [] : catalogue.map(entry=>{
    const text=[entry.code,entry.title,entry.cause,entry.fix].join(" ").toLowerCase();
    const overlap=[...words].filter(word=>text.includes(word)).length/Math.max(words.size,1);
    return {...entry,score:Math.max(similarity(query,entry.code),similarity(query,entry.title),overlap),docs:entry.docs ?? null};
  }).filter(entry=>entry.score>=relatedThreshold).sort((a,b)=>b.score-a.score).slice(0,limit);
  return {version:sdk.version,classification,matches,sdkErrors,related,relatedThreshold,nextSteps,suggestedLookups};
}
