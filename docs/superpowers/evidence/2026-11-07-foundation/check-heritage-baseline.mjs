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

import { execFileSync } from "node:child_process";
import { dirname, resolve, relative, extname } from "node:path";
import { build } from "esbuild";
const base = "ba7d226";
const root = process.cwd();
const files = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", base], { encoding: "utf8" }).trim().split("\n"));
const plugin = { name: "read-only-git-baseline", setup(api) {
  api.onResolve({ filter: /./ }, args => {
    if (!args.path.startsWith(".") && !args.path.startsWith("src/") && !args.path.startsWith(root)) return;
    const absolute = resolve(args.resolveDir || root, args.path);
    const candidates = [absolute, ...[".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"].map(suffix => absolute + suffix)];
    for (const candidate of candidates) {
      const path = relative(root, candidate).replaceAll("\\", "/");
      if (files.has(path) && /\.(?:tsx?|[cm]?js|json)$/u.test(path)) return { path: candidate, namespace: "git-baseline" };
    }
  });
  api.onLoad({ filter: /./, namespace: "git-baseline" }, args => ({
    contents: execFileSync("git", ["show", `${base}:${relative(root,args.path).replaceAll("\\", "/")}`], { encoding: "utf8", maxBuffer: 16*1024*1024 }),
    loader: extname(args.path) === ".tsx" ? "tsx" : extname(args.path) === ".ts" ? "ts" : extname(args.path) === ".json" ? "json" : "js",
    resolveDir: dirname(args.path),
  }));
} };
for (const entry of ["src/SynCloudOSReact/DevInspectorRegion.tsx", "src/SynCloudOS/Inspector/inspectorDevEntry.ts"]) {
  for (const baseline of [true,false]) {
    try {
      await build({ entryPoints:[entry], bundle:true,write:false,metafile:true,format:"esm",platform:"browser",minifySyntax:true,
        external:["react","react/jsx-runtime","../../NSE/*"],loader:{".css":"empty"},define:{"import.meta.env.DEV":"true"},
        plugins:baseline?[plugin]:[],logLevel:"silent" });
      console.log(JSON.stringify({entry,revision:baseline?base:"current",result:"passed"}));
    } catch(error) {
      console.log(JSON.stringify({entry,revision:baseline?base:"current",result:"failed",errors:error.errors?.map(item=>({text:item.text,file:item.location?.file})) ?? [String(error)]}));
    }
  }
}
