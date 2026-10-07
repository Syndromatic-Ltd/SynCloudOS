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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("framework source retirement boundary", () => {
  it("does not retain the application editor, its host wrappers or a font compatibility catalogue", () => {
    for (const path of [
      "src/NSE/Editor",
      "src/NSE/Text/legacyFontCatalog.ts",
      "src/SynCloudOSReact/SynCloudOSNSEEditor.tsx",
      "src/SynCloudOSReact/NSEEditorUndoAdapter.ts",
    ]) expect(existsSync(path), path).toBe(false);
  });

  it("ships no site font resources or retired editor dependencies", () => {
    expect(existsSync("src/NSE/Typography/Resources/fonts")).toBe(false);
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    for (const name of ["@tiptap/core", "@tiptap/react", "@tiptap/starter-kit", "@tiptap/extension-image", "@tiptap/extension-link", "@tiptap/extension-text-align", "@tiptap/extension-underline"]) {
      expect(manifest.dependencies, name).not.toHaveProperty(name);
    }
    // The ordinary view may use a private DOM backend without exposing it as an application engine.
    expect(manifest.dependencies).toHaveProperty("@tiptap/pm");
  });

  it("allows the host's typography to flow through framework chrome", () => {
    const cssFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith(".css") ? [path] : [];
    });
    const coupled = cssFiles("src").filter(path => /Prelude|Avenir|Ocean Sans|Noteworthy|Ioskeley|Syndromatic Graffiti|Marker Felt/.test(readFileSync(path, "utf8")));
    expect(coupled).toEqual([]);
  });

  it("omits retired editor declarations and site font assets from the SDK inventory", () => {
    const manifest = JSON.parse(readFileSync(".artifacts/synapp-sdk/build-manifest.json", "utf8"));
    const paths = manifest.resources.files.map((file: { path: string }) => file.path);
    expect(paths.filter((path: string) => /(?:^|\/)NSE\/Editor\/|legacyFontCatalog|NSEEditorUndoAdapter|SynCloudOSNSEEditor/.test(path))).toEqual([]);
    expect(paths.filter((path: string) => /Prelude|Avenir|Ocean.?Sans|Noteworthy|Ioskeley|Brooklyn.Kid/.test(path))).toEqual([]);
  });
});
