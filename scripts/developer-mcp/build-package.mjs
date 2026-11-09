/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { parse, generate } from "css-tree";
import { deriveNSEThemeContract } from "../synware/build-theme-contract.mjs";

/** Build the offline theme schema from NSE's neutral provider, never a concrete theme. */
export function deriveNSEAppearanceContract(repositoryRoot) {
  const cssFile = "src/NSE/Appearance/nse-appearance.css";
  const definitionFile = "src/NSE/Appearance/NSEAppearanceDefinition.ts";
  const css = parse(readFileSync(resolve(repositoryRoot, cssFile), "utf8"), { positions: true });
  const modes = { light: new Map(), dark: new Map() };
  css.children.forEach(rule => {
    if (rule.type !== "Rule") return;
    const selector = generate(rule.prelude);
    const scheme = /\[data-nse-colour-scheme-resolved=(?:"|')?(light|dark)(?:"|')?\]/u.exec(selector)?.[1];
    if (!scheme) return;
    rule.block.children.forEach(declaration => {
      if (declaration.type === "Declaration" && declaration.property.startsWith("--nse-")) {
        modes[scheme].set(declaration.property, { value: generate(declaration.value), line: declaration.loc?.start.line });
      }
    });
  });
  if (!modes.light.size || [...modes.light.keys()].some(name => !modes.dark.has(name)) || modes.light.size !== modes.dark.size)
    throw new Error("The neutral NSE appearance contract must declare the same values in light and dark.");
  const text = readFileSync(resolve(repositoryRoot, definitionFile), "utf8");
  const source = ts.createSourceFile(definitionFile, text, ts.ScriptTarget.Latest, true);
  const interfaces = source.statements.filter(ts.isInterfaceDeclaration);
  const fields = name => {
    const declaration = interfaces.find(node => node.name.text === name);
    if (!declaration) throw new Error(`Neutral NSE appearance interface ${name} is missing.`);
    return declaration.members.filter(ts.isPropertySignature).map(member => ({ name: member.name.getText(source), required: !member.questionToken, type: member.type.getText(source) }));
  };
  let idPattern;
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations)
      if (declaration.name.getText(source) === "NSE_APPEARANCE_ID") idPattern = declaration.initializer?.getText(source).replace(/^\//u, "").replace(/\/[a-z]*$/u, "");
  }
  if (!idPattern) throw new Error("Neutral NSE appearance id validation is missing.");
  return {
    schemaVersion: 1,
    sources: [cssFile, definitionFile],
    definition: { import: "@syndromatic/syncloudos/nse/appearance", factory: "defineNSEAppearance", idPattern, fields: fields("NSEAppearanceDefinitionInput"), recipeFields: fields("NSEAppearanceRecipeDefinition") },
    schemes: ["light", "dark"],
    values: [...modes.light].map(([name, light]) => ({ name, type: "colour", source: { file: cssFile, line: light.line }, defaults: { light: light.value, dark: modes.dark.get(name).value } })),
    recipesRequired: false,
  };
}
/** Add only version-matched offline inputs; the build receipt excludes its own eventual archive hash. */
export async function writeDeveloperSdkData({repositoryRoot,directory,commit,source}) {
  cpSync(resolve(repositoryRoot,"docs/framework"),resolve(directory,"docs/framework"),{recursive:true});
  const tooling=resolve(directory,"tooling");
  mkdirSync(tooling,{recursive:true});
  cpSync(resolve(repositoryRoot,"src/SynCloudOS/AppSDK/manifest/synapp-manifest.schema.json"),resolve(tooling,"manifest.schema.json"));
  const code=ts.transpileModule(readFileSync(resolve(repositoryRoot,"src/SynCloudOS/ErrorManager/errorCatalogue.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {errorCatalogue}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
  writeFileSync(resolve(tooling,"error-catalogue.json"),JSON.stringify(errorCatalogue,null,2)+"\n");
  writeFileSync(resolve(tooling,"build-receipt.json"),JSON.stringify({schemaVersion:1,commit,sourceSha256:source.sha256},null,2)+"\n");
  writeFileSync(resolve(tooling,"nse-theme-contract.json"),JSON.stringify(deriveNSEThemeContract(repositoryRoot),null,2)+"\n");
}
export function writeDeveloperMcpPackage({repositoryRoot,directory,sdkVersion}) {
  const repository=JSON.parse(readFileSync(resolve(repositoryRoot,"package.json"),"utf8"));
  cpSync(resolve(repositoryRoot,"scripts/developer-mcp"),resolve(directory,"scripts/developer-mcp"),{recursive:true,filter:path=>!path.endsWith("build-package.mjs")&&!path.endsWith("PACKAGE_README.md")});
  cpSync(resolve(repositoryRoot,"scripts/developer-mcp/PACKAGE_README.md"),resolve(directory,"README.md"));
  for (const file of ["validation-core.mjs","manifest-source.mjs","bundle-paths.mjs","project-derivation.mjs","create-synware.mjs","idiom-audit.mjs","idiom-errors.mjs","idiom-replacements.mjs","idiom-warnings.mjs"]) {
    mkdirSync(resolve(directory,"scripts/synware"),{recursive:true});
    writeFileSync(resolve(directory,"scripts/synware",file),readFileSync(resolve(repositoryRoot,"scripts/synware",file),"utf8")
      .replace("../../src/SynCloudOS/Identity/bundleIdentifier.mjs","./bundleIdentifier.mjs"));
  }
  cpSync(resolve(repositoryRoot,"src/SynCloudOS/Identity/bundleIdentifier.mjs"),resolve(directory,"scripts/synware/bundleIdentifier.mjs"));
  const toolsPath=resolve(directory,"scripts/developer-mcp/tools.mjs");
  writeFileSync(toolsPath,readFileSync(toolsPath,"utf8").replace("../../src/SynCloudOS/Identity/bundleIdentifier.mjs","../synware/bundleIdentifier.mjs"));
  for (const file of ["LICENSE","NOTICE"]) cpSync(resolve(repositoryRoot,file),resolve(directory,file));
  const manifest={name:"@syndromatic/syncloudos-developer-mcp",version:sdkVersion,type:"module",description:"Offline, installed-SDK-matched SynCloudOS developer tools for MCP coding agents",license:repository.license,repository:repository.repository,engines:repository.engines,bin:{"syncloudos-mcp":"scripts/developer-mcp/server.mjs"},files:["scripts","README.md","LICENSE","NOTICE"],peerDependencies:{"@syndromatic/syncloudos":sdkVersion},dependencies:{"@modelcontextprotocol/sdk":repository.devDependencies["@modelcontextprotocol/sdk"],zod:repository.devDependencies.zod,typescript:repository.devDependencies.typescript,ajv:repository.dependencies.ajv,"css-tree":repository.devDependencies["css-tree"]}};
  writeFileSync(resolve(directory,"package.json"),JSON.stringify(manifest,null,2)+"\n");
  return manifest;
}
