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

import { describe, expect, it } from "vitest";
import * as typography from "../../src/NSE/Typography";

// Namespace lookup makes the first red an assertion about the absent contract.
const api = typography as unknown as { defineFontDeclaration(input: unknown): any; fontDeclarationCSS(declaration: any, urls: Record<string, string>, options?: { scope?: string; rolePrefix?: string }): string };
export const definition = () => ({
  resources: { book: "Resources/Fonts/Book.woff2", roman: "Resources/Fonts/Roman.woff2" },
  families: [{ id: "example", label: "Example", defaultFaceId: "example-book", fallback: ["system-ui", "sans-serif"], faces: [
    { id: "example-book", label: "Book", resource: "book", browserFamily: "Example", weight: 400, style: "normal" },
    { id: "example-roman", label: "Roman", resource: "roman", browserFamily: "Example Roman", weight: 400, style: "normal" },
  ] }],
  aliases: [{ family: "Example UI", faces: ["example-book"] }],
  roles: { ui: { family: "Example UI", fallback: ["system-ui", "sans-serif"], preload: ["example-book"] }, document: { face: "example-roman" } },
});
describe("managed font declaration", () => {
  it("exposes a single declaration contract", () => { expect(api.defineFontDeclaration).toBeTypeOf("function"); });
  it("preserves distinct named faces with equal traits and existing browser aliases", () => {
    const fonts = api.defineFontDeclaration(definition());
    expect(fonts.families[0].presets.map((p: any) => [p.id, p.label, p.family, p.weight])).toEqual([
      ["example-book", "Book", '"Example", system-ui, sans-serif', 400],
      ["example-roman", "Roman", '"Example Roman", system-ui, sans-serif', 400],
    ]);
    const css = api.fontDeclarationCSS(fonts, { book: "/nested/book.woff2", roman: "/nested/roman.woff2" });
    expect(css.match(/@font-face/g)).toHaveLength(3);
    expect(css).toContain('--font-ui: "Example UI", system-ui, sans-serif;');
    expect(css).toContain('--font-document: "Example Roman", system-ui, sans-serif;');
    expect(css).toContain("font-family: var(--font-ui);");
    expect(fonts.preloadResources).toEqual(["book"]);
  });
  it("captures the input immutably without consulting browser APIs", () => {
    const input = definition(); const fonts = api.defineFontDeclaration(input);
    input.families[0]!.faces[0]!.label = "Changed"; input.resources.book = "Resources/Other.woff2";
    expect(fonts.families[0].presets[0].label).toBe("Book");
    expect(fonts.resources.book).toBe("Resources/Fonts/Book.woff2");
    expect(Object.isFrozen(fonts.roles.ui.fallback)).toBe(true);
    expect(Object.isFrozen(fonts.families[0].presets[0])).toBe(true);
  });
  it.each(["face", "resource", "default", "role", "alias", "path", "css"])("rejects invalid %s references or declarations", part => {
    const input: any = definition();
    if (part === "face") input.families[0].faces[1].id = "example-book";
    if (part === "resource") input.families[0].faces[0].resource = "missing";
    if (part === "default") input.families[0].defaultFaceId = "missing";
    if (part === "role") input.roles.ui.preload = ["missing"];
    if (part === "alias") input.aliases[0].faces.push("example-roman"); // equal traits collide in alias
    if (part === "path") input.resources.book = "Resources/../secret.woff2";
    if (part === "css") input.families[0].faces[0].browserFamily = 'Unsafe"; color:red';
    expect(() => api.defineFontDeclaration(input)).toThrow(TypeError);
  });
  it("rejects accessors without invoking them", () => {
    let reads = 0; const input = definition();
    Object.defineProperty(input.families[0], "label", { enumerable: true, get() { reads++; return "Bad"; } });
    expect(() => api.defineFontDeclaration(input)).toThrow(TypeError); expect(reads).toBe(0);
  });
});

it("emits scoped theme font roles without replacing host font roles or root family", () => {
  const fonts = api.defineFontDeclaration(definition());
  const css = api.fontDeclarationCSS(fonts, { book: "/nested/book.woff2", roman: "/nested/roman.woff2" }, { scope: '[data-nse-theme="com.test.theme"]', rolePrefix: "--nse-theme-font-" });
  expect(css).toContain('[data-nse-theme="com.test.theme"] {');
  expect(css).toContain('--nse-theme-font-ui: "Example UI"');
  expect(css).toContain('url("/nested/book.woff2")');
  expect(css).not.toContain(":root"); expect(css).not.toContain("--font-ui"); expect(css).not.toContain("font-family: var(");
  expect(() => api.fontDeclarationCSS(fonts, {}, {scope: "body {color:red}"})).toThrow(TypeError);
});
