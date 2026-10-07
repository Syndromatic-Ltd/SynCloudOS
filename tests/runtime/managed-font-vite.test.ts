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

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { pathToFileURL } from "node:url";
import { build } from "vite";
// @ts-expect-error tooling module
import { synCloudOS } from "../../scripts/synware/vite-plugin.mjs";
const root = resolve(".artifacts/font-versions/vite-fixture");
mkdirSync(resolve(root, "src/SynWare"), { recursive: true });
const declarationModule = pathToFileURL(resolve("src/NSE/Typography/fontDeclaration.mjs")).href;
const declarationFile = resolve(root, "Typography.mjs");
function writeDeclaration(face = "Book") {
  writeFileSync(declarationFile, `import { defineFontDeclaration } from ${JSON.stringify(declarationModule)};
export default defineFontDeclaration({ resources: { book: "Resources/${face}.woff2" }, families: [{ id: "test", label: "Test", defaultFaceId: "test.book", faces: [{ id: "test.book", label: "Book", browserFamily: "${face}", resource: "book", weight:400, style:"normal" }] }], roles: { ui: { face:"test.book", preload:["test.book"] } } });`);
  mkdirSync(resolve(root, "Resources"), { recursive: true }); writeFileSync(resolve(root, `Resources/${face}.woff2`), `fixture ${face}`);
}
describe("managed fonts in Vite", () => {
  it.each(["/nested/product/", "./"])("builds real HTML and emitted font assets with base %s", async base => {
    writeDeclaration();
    mkdirSync(resolve(root, "nested"), { recursive: true });
    writeFileSync(resolve(root, "nested/index.html"), '<html><head></head><body>Font fixture</body></html>');
    const outDir = resolve(root, base === "./" ? "dist-relative" : "dist-absolute");
    await build({ configFile: false, root, base, logLevel: "silent", plugins: [synCloudOS({ webspringEntry: false, typography: "Typography.mjs" })], build: { outDir, rollupOptions: { input: resolve(root, "nested/index.html") } } });
    const html = readFileSync(resolve(outDir, "nested/index.html"), "utf8");
    const resource = html.match(/url\("([^"]+Book[^\"]+\.woff2)"\)/)![1];
    const served = new URL(resource, `https://example.test${base === "./" ? "/" : base}nested/index.html`).pathname;
    expect(served).toMatch(base === "./" ? /^\/assets\/Book-/ : /^\/nested\/product\/assets\/Book-/);
    expect(readFileSync(resolve(outDir, "assets", served.split("/").at(-1)!), "utf8")).toBe("fixture Book");
    expect(html).toContain(`href="${resource}"`);
  });
  it("provides early HTML typography independent of the application module", () => {
    const plugin = synCloudOS({ webspringEntry: false });
    expect(plugin.transformIndexHtml).toBeDefined();
  });
  it("emits font CSS and only critical preloads in the head with nested dev URLs", async () => {
    writeDeclaration(); const plugin = synCloudOS({ webspringEntry: false, typography: "Typography.mjs" });
    await plugin.configResolved({ root, base: "/nested/product/", command:"serve", mode:"test" });
    const tags = await plugin.transformIndexHtml.handler("<html><head></head></html>");
    const style = tags.find((tag: any) => tag.tag === "style");
    expect(style.children).toContain('/nested/product/Resources/Book.woff2');
    expect(style.children).toContain("font-family: var(--font-ui)");
    expect(tags.filter((tag: any) => tag.tag === "link")).toEqual([expect.objectContaining({ attrs: expect.objectContaining({ rel:"preload", as:"font", crossorigin:"anonymous", href:"/nested/product/Resources/Book.woff2" }), injectTo:"head-prepend" })]);
    expect(plugin.load(plugin.resolveId("virtual:syncloudos/typography"))).toContain("fontResourceUrls");
  });
  it("uses emitted build asset filenames for CSS and preloads", async () => {
    writeDeclaration(); const plugin = synCloudOS({ webspringEntry:false, typography:"Typography.mjs" });
    await plugin.configResolved({ root, base:"/nested/", command:"build", mode:"test" });
    await plugin.buildStart.call({ addWatchFile: vi.fn(), emitFile: () => "font-asset", getFileName: () => "assets/Book-hash.woff2" });
    plugin.generateBundle.handler.call({ getFileName: () => "assets/Book-hash.woff2" });
    const tags = await plugin.transformIndexHtml.handler.call({ getFileName: () => "assets/Book-hash.woff2" }, "");
    expect(tags.find((tag: any) => tag.tag === "style").children).toContain("/nested/assets/Book-hash.woff2");
    expect(tags.find((tag: any) => tag.tag === "link").attrs.href).toBe("/nested/assets/Book-hash.woff2");
  });
  it("refreshes the declaration and invalidates its virtual module on HMR", async () => {
    writeDeclaration(); const plugin = synCloudOS({ webspringEntry:false, typography:"Typography.mjs" });
    await plugin.configResolved({ root, base:"/", command:"serve", mode:"test" });
    const invalidateModule = vi.fn(), send = vi.fn();
    plugin.configureServer({ middlewares:{use:vi.fn()}, watcher:{add:vi.fn(),on:vi.fn(),once:vi.fn(),off:vi.fn()}, moduleGraph:{getModuleById:() => ({}),invalidateModule}, ws:{send}, httpServer:null });
    writeDeclaration("Roman"); await plugin.handleHotUpdate({ file:declarationFile });
    const tags = await plugin.transformIndexHtml.handler("");
    expect(tags.find((tag:any) => tag.tag === "style").children).toContain("Resources/Roman.woff2");
    expect(invalidateModule).toHaveBeenCalled(); expect(send).toHaveBeenCalledWith(expect.objectContaining({type:"full-reload"}));
  });
  it.each(["serve", "build"])("resolves relative base assets from nested HTML in %s",async(command)=>{
    writeDeclaration();const plugin=synCloudOS({webspringEntry:false,typography:"Typography.mjs"});
    await plugin.configResolved({root,base:"./",command,mode:"test"});
    await plugin.buildStart.call({addWatchFile:vi.fn(),emitFile:()=>"font",getFileName:()=>"assets/Book-hash.woff2"});
    if(command === "build") plugin.generateBundle.handler.call({getFileName:()=>"assets/Book-hash.woff2"});
    const tags=await plugin.transformIndexHtml.handler("",{path:"/nested/routed/index.html"});
    const href=tags.find((tag:any)=>tag.tag==="link").attrs.href;
    expect(new URL(href,"https://example.test/nested/routed/index.html").pathname).toBe(command==="build"?"/assets/Book-hash.woff2":"/Resources/Book.woff2");
  });
});
