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

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { build } from "vite";
import { expect, it } from "vitest";
import { synCloudOS } from "../../scripts/synware/vite-plugin.mjs";

it("versions the final production HTML and public icon bytes in the offline worker", async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), "syncloudos-pwa-build-"));
  const write = (file: string, value: string) => writeFileSync(join(root, file), value);
  mkdirSync(join(root, "src/SynWare/Notes.app/Contents"), { recursive: true });
  mkdirSync(join(root, "public"));
  write("src/main.ts", "export const ready = true;");
  write("src/SynWare/Notes.app/Contents/index.tsx", "export default function Notes() { return null; }");
  write("src/SynWare/Notes.app/Contents/Info.ts", `export default { schemaVersion: 1, bundleIdentifier: "com.example.notes", displayName: "Notes", version: "1.0.0", routes: [{ path: "/notes" }], webApp: { scope: "/notes", startURL: "/notes", icons: [{ src: "/icon.svg?v=1", sizes: "any", type: "image/svg+xml" }] } };`);
  const html = (title: string) => `<html><head><title>${title}</title></head><body><script type="module" src="/src/main.ts"></script></body></html>`;
  const icon = (colour: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${colour}"/></svg>`;
  write("index.html", html("First")); write("public/icon.svg", icon("blue"));
  async function builtWorker() {
    const result = await build({ configFile: false, root, cacheDir: join(root, ".vite-cache"), logLevel: "silent", plugins: [synCloudOS({ webspringEntry: false })], build: { write: false, minify: false } }) as any;
    const output = Array.isArray(result) ? result[0].output : result.output;
    const manifest = output.find((entry: any) => entry.fileName.endsWith(".webmanifest"));
    expect(JSON.parse(manifest.source).scope).toBe("/notes");
    return String(output.find((entry: any) => entry.fileName === "syncloudos-sw.js").source);
  }
  try {
    const first = await builtWorker();
    write("index.html", html("Second"));
    const second = await builtWorker(); expect(second).not.toBe(first);
    write("public/icon.svg", icon("red"));
    const third = await builtWorker(); expect(third).not.toBe(second);
  } finally {
    if (!resolve(root).startsWith(`${realpathSync.native(tmpdir())}${sep}syncloudos-pwa-build-`) || existsSync(join(root, "node_modules"))) throw new Error("Refusing unsafe temporary build cleanup.");
    rmSync(root, { recursive: true });
  }
}, 30000);
