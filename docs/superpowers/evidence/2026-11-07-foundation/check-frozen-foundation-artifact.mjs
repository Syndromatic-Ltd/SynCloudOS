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

// Tests the accepted immutable archive, not a claim that later live edits match it.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { readVerifiedSdkArchive, copyVerifiedSdkArchive, verifyInstalledSdkResources, runNode } from "../../../../scripts/synware/installed-consumer.mjs";
const repository = process.cwd();
const verified = readVerifiedSdkArchive(repository);
const root = realpathSync.native(mkdtempSync(join(tmpdir(), "synware-foundation-frozen-")));
const frozen = copyVerifiedSdkArchive(repository, root);
writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
const npm = process.env.npm_execpath ?? resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
writeFileSync(join(root, ".npmrc"), "audit=false\nfund=false\nignore-scripts=true\n");
const dependencies = ["typescript", "react", "react-dom", "@types/react", "@types/react-dom"].map(name => `${name}@${JSON.parse(readFileSync(resolve("node_modules", name, "package.json"))).version}`);
runNode([npm, "install", "--prefer-offline", "--ignore-scripts", "--package-lock=false", frozen.archive, ...dependencies], root);
verifyInstalledSdkResources(join(root, "node_modules/@syndromatic/syncloudos"), frozen.manifest);
const text = readFileSync("tests/runtime/foundation-packed-consumer.test.ts", "utf8");
const source = ts.createSourceFile("specimen.ts", text, ts.ScriptTarget.Latest, true);
let extracted = 0;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "writeFileSync" && node.arguments.length === 2 && ts.isNoSubstitutionTemplateLiteral(node.arguments[1])) {
    const first = node.arguments[0];
    if (ts.isCallExpression(first) && ts.isStringLiteral(first.arguments[1])) {
      writeFileSync(join(root, first.arguments[1].text), node.arguments[1].text); extracted++;
    }
  }
  ts.forEachChild(node, visit);
}
visit(source); assert.equal(extracted, 3);
writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022", "WebWorker"], types: [], strict: true, noEmit: true, skipLibCheck: false }, files: ["consumer.ts"] }));
const runtime = runNode(["specimen.mjs"], root);
const types = runNode(["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--pretty", "false"], root);
console.log(JSON.stringify({ archiveSHA256: verified.archiveSha256, sourceCommit: verified.manifest.commit, sourceSHA256: verified.sourceSha256, root, runtime: runtime.trim(), strictWorkerTypes: "passed", types }));
