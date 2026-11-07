/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root=resolve(process.argv[2]);
const packageJSON=JSON.parse(readFileSync(resolve(root,"package.json"),"utf8"));
function graph(entry) {
 const visited=new Set();
 function visit(path) {
  if (visited.has(path)) return;
  const inside=relative(root,path);assert(!inside.startsWith(".."),"Package import escapes artifact");
  if (![".js",".mjs"].includes(extname(path)) || !existsSync(path)) return;
  visited.add(path);
  const source=ts.createSourceFile(path,readFileSync(path,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const follow=specifier=>{if(specifier.startsWith(".")) visit(resolve(dirname(path),specifier));};
  function scan(node) {
   if ((ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) follow(node.moduleSpecifier.text);
   if (ts.isCallExpression(node) && node.expression.kind===ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) follow(node.arguments[0].text);
   ts.forEachChild(node,scan);
  }
  scan(source);
 }
 visit(resolve(root,entry));
 return [...visited];
}
const markers=/ASAuthorizationController|ASAuthorizationPlatformPublicKeyCredentialProvider|createPasskeyAuthentication/;
const checks=[];
for(const entry of [".","./browser","./sdk","./auth"]) {
 const files=graph(packageJSON.exports[entry].import);
 const matches=files.filter(path=>markers.test(readFileSync(path,"utf8")));
 assert.deepEqual(matches,[],`Default ${entry} import graph includes optional passkeys`);
 checks.push({entry,modules:files.length,containsPasskeys:false});
}
for(const entry of ["./authentication-services","./auth/passkey"]) {
 assert(packageJSON.exports[entry],`Missing optional export ${entry}`);
 const files=graph(packageJSON.exports[entry].import);
 assert(files.some(path=>markers.test(readFileSync(path,"utf8"))),`Optional ${entry} contains no passkey implementation`);
 checks.push({entry,modules:files.length,containsPasskeys:true});
}
const receipt=JSON.parse(readFileSync(process.argv[3] ? resolve(process.argv[3]) : resolve(root,"../../build-manifest.json"),"utf8"));
const output={artifactRoot:root,frameworkCommit:receipt.commit,archiveSha256:receipt.archiveSha256,checks,scope:"Real emitted ESM dependency graphs; no relying-party/authenticator acceptance claim"};
writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)),process.argv[3] ? "authorization-installed-passkey-exclusion.json" : "authorization-passkey-exclusion.json"),JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify(output,null,2));
