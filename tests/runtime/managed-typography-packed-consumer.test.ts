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

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../scripts/synware/installed-consumer.mjs";

it("uses managed typography from an independently installed package in Node and app code", () => {
  const consumer = createInstalledConsumer(process.cwd(), "managed-typography-");
  writeFileSync(join(consumer.root, "declaration.mjs"), `
import assert from "node:assert/strict";
import { defineFontDeclaration, fontDeclarationCSS } from "@syndromatic/syncloudos/typography";
assert.equal(typeof document, "undefined");
const fonts = defineFontDeclaration({
  resources: { book: "Resources/Book.woff2", roman: "Resources/Roman.woff2" },
  families: [{ id: "example", label: "Example", defaultFaceId: "example.book", faces: [
    { id: "example.book", label: "Book", resource: "book", browserFamily: "Example Book", weight: 400, style: "normal" },
    { id: "example.roman", label: "Roman", resource: "roman", browserFamily: "Example", weight: 400, style: "normal" },
  ] }],
  roles: { ui: { face: "example.roman", fallback: ["system-ui", "sans-serif"] } },
});
assert.equal(fonts.families[0].presets[0].id, "example.book");
assert.notEqual(fonts.families[0].presets[0].family, fonts.families[0].presets[1].family);
assert.match(fontDeclarationCSS(fonts, { book: "/book.woff2", roman: "/roman.woff2" }), /--font-ui:/);
export default fonts;
`);
  expect(runNode(["declaration.mjs"], consumer.root)).toBe("");
  writeFileSync(join(consumer.root, "consumer.tsx"), `
import { defineFontDeclaration, type FontDeclaration } from "@syndromatic/syncloudos/typography";
import { useFonts } from "@syndromatic/syncloudos/sdk";
import { TFXFontDescriptor } from "@syndromatic/syncloudos/fx/text";
import type { MountSynCloudOSOptions } from "@syndromatic/syncloudos/browser";

const fonts: FontDeclaration = defineFontDeclaration({
  resources: { regular: "Resources/Inter.woff2" },
  families: [{ id: "inter", label: "Inter", defaultFaceId: "inter.regular", faces: [
    { id: "inter.regular", label: "Regular", resource: "regular", browserFamily: "Inter", weight: 400, style: "normal" },
  ] }],
  roles: { ui: { face: "inter.regular", fallback: ["system-ui", "sans-serif"] } },
});
export const configuration: MountSynCloudOSOptions["fonts"] = {
  declaration: fonts, resourceUrls: { "Resources/Inter.woff2": "/assets/Inter.woff2" },
};
export function FontConsumer() {
  const access = useFonts();
  const preset = access.manager.getPreset("inter.regular");
  async function shape() {
    const registration = await access.loadFace("inter.regular", new TFXFontDescriptor({ size: 18 }));
    try { return registration.font.shape("office").glyphs; }
    finally { registration.dispose(); }
  }
  void shape;
  return <span>{preset?.label}</span>;
}
`);
  for (const mode of ["NodeNext", "Bundler"]) {
    writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022", module: mode === "NodeNext" ? "NodeNext" : "ESNext", moduleResolution: mode,
        strict: true, skipLibCheck: false, noEmit: true, jsx: "react-jsx",
        lib: ["ES2022", "DOM", "DOM.Iterable"], types: ["vite/client"],
      }, files: ["consumer.tsx"],
    }));
    expect(runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root)).toBe("");
  }
}, 120_000);
