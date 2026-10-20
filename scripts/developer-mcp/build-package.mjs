/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
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
}
export function writeDeveloperMcpPackage({repositoryRoot,directory,sdkVersion}) {
  const repository=JSON.parse(readFileSync(resolve(repositoryRoot,"package.json"),"utf8"));
  cpSync(resolve(repositoryRoot,"scripts/developer-mcp"),resolve(directory,"scripts/developer-mcp"),{recursive:true,filter:path=>!path.endsWith("build-package.mjs")&&!path.endsWith("PACKAGE_README.md")});
  cpSync(resolve(repositoryRoot,"scripts/developer-mcp/PACKAGE_README.md"),resolve(directory,"README.md"));
  for (const file of ["validation-core.mjs","manifest-source.mjs","bundle-paths.mjs","project-derivation.mjs","create-synware.mjs"]) {
    mkdirSync(resolve(directory,"scripts/synware"),{recursive:true});
    cpSync(resolve(repositoryRoot,"scripts/synware",file),resolve(directory,"scripts/synware",file));
  }
  for (const file of ["LICENSE","NOTICE"]) cpSync(resolve(repositoryRoot,file),resolve(directory,file));
  const manifest={name:"@syndromatic/syncloudos-developer-mcp",version:sdkVersion,type:"module",description:"Offline, installed-SDK-matched SynCloudOS developer tools for MCP coding agents",license:repository.license,repository:repository.repository,engines:{node:">=22.12.0"},bin:{"syncloudos-mcp":"scripts/developer-mcp/server.mjs"},files:["scripts","README.md","LICENSE","NOTICE"],peerDependencies:{"@syndromatic/syncloudos":sdkVersion},dependencies:{"@modelcontextprotocol/sdk":repository.devDependencies["@modelcontextprotocol/sdk"],zod:repository.devDependencies.zod,typescript:repository.devDependencies.typescript,ajv:repository.dependencies.ajv}};
  writeFileSync(resolve(directory,"package.json"),JSON.stringify(manifest,null,2)+"\n");
  return manifest;
}
