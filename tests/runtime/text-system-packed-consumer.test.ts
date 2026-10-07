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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// These tests never install, build or start a server. Actual package acceptance is a later parent gate.
import { assertCustomTextSystemSourceBoundary, createCustomTextSystemFixtureSource, createCustomTextSystemConsumerSources, customTextSystemCompilerOptions, verifyCustomTextSystemLicensedResource } from "../../scripts/synware/check-custom-text-system-consumer.mjs";

const files = ["src/main.tsx", "src/example/Contents/index.tsx", "src/example/Contents/model.ts", "src/example/Contents/style.css", "src/assets/ExampleFont.ttf"];
const fixture = readFileSync("tests/e2e/fixtures/custom-text-surface.tsx", "utf8");
describe("independent custom text consumer preparation", () => {
  it("loads the required public browser stylesheet only in the trusted host bootstrap", () => {
    const paths = [...files, "src/example/Host/bootstrap.tsx"];
    const source = 'import "@syndromatic/syncloudos/browser/styles.css";';
    expect(() => assertCustomTextSystemSourceBoundary(source, "src/example/Host/bootstrap.tsx", paths)).not.toThrow();
    for (const path of ["src/main.tsx", "src/example/Contents/index.tsx", "src/example/Contents/example.ts"]) {
      expect(() => assertCustomTextSystemSourceBoundary(source, path, paths)).toThrow(/public|host|consumer/i);
    }
    expect(() => assertCustomTextSystemSourceBoundary('import "@syndromatic/syncloudos/assets/browser.css";', "src/example/Host/bootstrap.tsx", paths)).toThrow(/public|consumer/i);
    const copiedHost = createCustomTextSystemConsumerSources().get("src/example/Host/bootstrap.tsx")!.toString();
    expect(copiedHost).toContain(source);
  });
  it("confines public browser host provisioning to the separate private bootstrap", () => {
    const paths = [...files, "src/example/Host/bootstrap.tsx"];
    const source = 'import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";';
    expect(() => assertCustomTextSystemSourceBoundary(source, "src/example/Contents/example.ts", paths)).toThrow(/public|host|consumer/i);
    expect(() => assertCustomTextSystemSourceBoundary(source, "src/example/Host/bootstrap.tsx", paths)).not.toThrow();
    expect(() => assertCustomTextSystemSourceBoundary('import "../Host/bootstrap";', "src/example/Contents/index.tsx", paths)).toThrow(/host|consumer|escapes/i);
    const copies = createCustomTextSystemConsumerSources();
    expect(copies.get("src/example/Host/bootstrap.tsx")).toEqual(readFileSync("examples/TextSystem.app/Host/bootstrap.tsx"));
    expect(copies.get("src/example/Contents/image.ts")).toEqual(readFileSync("examples/TextSystem.app/Contents/image.ts"));
    expect(copies.get("src/main.tsx")).toContain("startFreshHost");
  });
  it("accepts only public framework paths and consumer-local private example resources", () => {
    expect(() => assertCustomTextSystemSourceBoundary(`import { TextEditingSession } from "@syndromatic/syncloudos/nse/text";
      export { textSystemDocumentType } from "./example/Contents";
      import fontURL from "./assets/ExampleFont.ttf?url";`, "src/main.tsx", files)).not.toThrow();
    expect(() => assertCustomTextSystemSourceBoundary(`import "./style.css"; import type { ExampleViewId } from "./model";`, "src/example/Contents/index.tsx", files)).not.toThrow();
  });
  it.each([
    'import { NSETextView } from "../../src/NSE/public/text";',
    'export * from "@syndromatic/syncloudos/nse/text/internal";',
    'import type { Editor } from "@tiptap/core";',
    'const vendor = import("@syndromatic/syncloudos/types/NSE/Editor.js");',
    'const module = import(window.location.hash);',
    'const runtime = require("@syndromatic/syncloudos/src/SynCloudOS");',
  ])("rejects a checkout/backend/nonliteral escape: %s", source => {
    expect(() => assertCustomTextSystemSourceBoundary(source, "src/main.tsx", files)).toThrow(/consumer|public|literal|require/i);
  });
  it("does not accept an unresolved private or sibling file", () => {
    expect(() => assertCustomTextSystemSourceBoundary('import "./example/Contents/missing";', "src/main.tsx", files)).toThrow(/local|consumer/i);
    expect(() => assertCustomTextSystemSourceBoundary('import "../normal-sibling/main";', "src/main.tsx", [...files, "normal-sibling/main.ts"])).toThrow(/local|consumer/i);
  });
  it("rewrites the actual custom fixture to local example/font and instruments captured bytes without replacing the host", () => {
    const source = createCustomTextSystemFixtureSource(fixture);
    expect(source).toContain('from "./example/Contents"');
    expect(source).toContain('from "./assets/ExampleFont.ttf?url"');
    expect(source).toContain("documentTypes: [textSystemDocumentType]");
    expect(source).toContain("createSynWareTestHost");
    expect(source).toContain("window.customInstalledPDF");
    expect(source).toContain("window.customInstalledCaptureRace");
    expect(source).not.toMatch(/\.\.\//);
    expect(() => createCustomTextSystemFixtureSource(fixture.replace("const output = await prepared.output.exportPDF();", "// changed contract"))).toThrow(/fixture|contract/i);
  });
  it("checks declarations strictly without repository aliases or skipped library diagnostics", () => {
    const options = customTextSystemCompilerOptions();
    expect(options).toMatchObject({ strict: true, skipLibCheck: false, noEmit: true, moduleResolution: "Bundler", types: ["vite/client"] });
    expect(options).not.toHaveProperty("paths"); expect(options).not.toHaveProperty("baseUrl");
  });
  it("prepares the actual example and verified licensed font as a standalone consumer graph", () => {
    const copies = createCustomTextSystemConsumerSources();
    const paths = [...copies.keys()];
    expect(copies.get("src/assets/ExampleFont.ttf")).toEqual(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf"));
    expect(copies.get("src/assets/ExampleFont-OFL.txt")).toEqual(readFileSync("tests/fixtures/fx/fonts/notosans-OFL.txt"));
    for (const file of ["Info.ts", "model.ts", "layout.ts", "example.ts", "view.tsx", "index.tsx", "style.css"]) {
      expect(copies.get(`src/example/Contents/${file}`)).toEqual(readFileSync(`examples/TextSystem.app/Contents/${file}`));
    }
    for (const [path, bytes] of copies) if (/\.tsx?$/.test(path)) {
      expect(() => assertCustomTextSystemSourceBoundary(bytes.toString(), path, paths)).not.toThrow();
    }
    expect(JSON.parse(copies.get("tsconfig.json")!.toString()).compilerOptions.skipLibCheck).toBe(false);
    expect(copies.get("index.html")).toContain('src="/src/main.tsx"');
    expect(copies.get("vite.config.mjs")).toContain("this.getModuleIds()");
    expect(copies.get("vite.config.mjs")).not.toContain("alias");
    const publicProbe = copies.get("src/public-contracts.ts")!.toString();
    expect(publicProbe).toContain("NSEStringDrawingOptions");
    expect(publicProbe).toContain("TFXTextGeometryCapabilities, TFXTextLayoutResult");
    expect(publicProbe).toContain("app.textLayout.geometryCapabilities");
    expect(publicProbe).toContain("port.geometryCapabilities");
    expect(paths.some(path => /__tests__|normal-sibling|check-types/.test(path))).toBe(false);
  }, 60_000);
  it("accepts only the license's Git line-ending conversion and rejects altered licensing text", () => {
    const sources = JSON.parse(readFileSync("tests/fixtures/fx/fonts/sources.json", "utf8"));
    const license = readFileSync("tests/fixtures/fx/fonts/notosans-OFL.txt");
    const provenance = sources.find((source: { file: string }) => source.file === "notosans-OFL.txt");
    expect(() => verifyCustomTextSystemLicensedResource(license, provenance)).not.toThrow();
    expect(() => verifyCustomTextSystemLicensedResource(Buffer.from(license.toString().replaceAll("\r\n", "\n")), provenance)).not.toThrow();
    expect(() => verifyCustomTextSystemLicensedResource(Buffer.from(license.toString().replace("Copyright", "Changed")), provenance)).toThrow(/fingerprint/i);
  });
  it("rejects any binary font change", () => {
    const sources = JSON.parse(readFileSync("tests/fixtures/fx/fonts/sources.json", "utf8"));
    const font = readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf");
    font[20] ^= 1;
    expect(() => verifyCustomTextSystemLicensedResource(font, sources.find((source: { file: string }) => source.file.endsWith(".ttf")))).toThrow(/fingerprint/i);
  });
});
