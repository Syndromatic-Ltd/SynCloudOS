/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
/** Shared Vite bundle rules: direct, case-insensitive *.app directories, no symlinks, both required entry files. */
export function bundlePaths(root, appsDirectory = "src/SynWare") {
  const directory = resolve(root,appsDirectory);
  if (!existsSync(directory)) return [];
  if (lstatSync(directory).isSymbolicLink()) throw new Error("SynWare apps directory must not be a symbolic link.");
  const entries = readdirSync(directory,{withFileTypes:true}).filter(entry => /\.app$/iu.test(entry.name));
  const names = new Set();
  return entries.sort((a,b) => a.name.localeCompare(b.name,"en")).map(entry => {
    const key = entry.name.toLowerCase();
    if (names.has(key)) throw new Error("Case-insensitive duplicate SynWare bundle: " + entry.name);
    names.add(key);
    const path = resolve(directory,entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("SynWare bundle must be a real directory: " + path);
    for (const suffix of ["Contents","Contents/Info.ts","Contents/index.tsx"]) {
      const part = resolve(path,suffix);
      if (existsSync(part) && lstatSync(part).isSymbolicLink()) throw new Error("SynWare discovery rejects symbolic links: " + part);
    }
    return path;
  });
}
