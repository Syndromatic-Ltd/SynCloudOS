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
import { describe, expect, it, vi } from "vitest";
import { NSEFontLibrary } from "../../src/NSE/Typography/NSEFontLibrary";
import { NSEFontManager } from "../../src/NSE/Typography/NSEFontManager";
import { typographyTokens } from "../../src/NSE/Typography/typographyTokens";
import { typographyFontFamilies } from "../fixtures/typographyFontFamilies";
import type { NSEFontManagerOptions } from "../../src/NSE/Typography/NSEFontManager";

describe("host supplied typography fonts", () => {
  it("offers no fonts or known product ids without supplied or registered data", () => {
    const manager = new NSEFontManager({ library: null });
    expect(manager.availableFamilies).toEqual([]);
    expect(manager.allFamilies()).toEqual([]);
    expect(manager.getPreset("prelude-medium")).toBeNull();
    expect(() => manager.fontCommand("prelude-medium", 12)).toThrow(/unknown font/i);
  });

  it("resolves supplied generic metadata and bounded commands without a product catalog", () => {
    const manager = new NSEFontManager({ families: typographyFontFamilies, library: null });
    expect(manager.allFamilies()).toEqual(typographyFontFamilies);
    expect(manager.fontCommand("fixture.sans.bold-italic", 18)).toEqual({ fontId: "fixture.sans.bold-italic", size: 18 });
    expect(manager.descriptorForPreset("fixture.sans.bold-italic", 18)).toEqual({ families: ["Fixture Sans", "sans-serif"], size: 18, weight: 700, style: "italic", stretch: "normal" });
    expect(manager.cssForDescriptor(manager.descriptorForPreset("fixture.sans.bold-italic", 18))).toMatchObject({ fontFamily: '"Fixture Sans", sans-serif', fontSize: "18px", fontWeight: 700, fontStyle: "italic" });
    expect(() => manager.fontCommand("not-supplied", 18)).toThrow(/unknown font/i);
  });

  it("captures supplied family and preset data independently from later caller mutation", () => {
    const families = typographyFontFamilies.map(family => ({ ...family, presets: family.presets.map(preset => ({ ...preset })) }));
    const manager = new NSEFontManager({ families, library: null });
    families[0]!.label = "Changed";
    families[0]!.presets[0]!.family = "Changed Face";
    families.splice(0);
    expect(manager.getFamily("fixture.sans")?.label).toBe("Fixture Sans");
    expect(manager.descriptorForPreset("fixture.sans.regular").families).toEqual(["Fixture Sans", "sans-serif"]);
    expect(Object.isFrozen(manager.availableFamilies)).toBe(true);
    expect(Object.isFrozen(manager.availableFamilies[0])).toBe(true);
    expect(Object.isFrozen(manager.availableFamilies[0]?.presets[0])).toBe(true);
  });

  it("rejects an options getter without invoking it", () => {
    const getter = vi.fn(() => typographyFontFamilies);
    const options: NSEFontManagerOptions = { library: null };
    Object.defineProperty(options, "families", { enumerable: true, get: getter });
    expect(() => new NSEFontManager(options)).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(["family", "preset", "array"] as const)("rejects a %s getter without invoking it", (part) => {
      const getter = vi.fn(() => part === "array" ? typographyFontFamilies[0] : "Fixture Sans");
      const families = typographyFontFamilies.map(family => ({ ...family, presets: family.presets.map(preset => ({ ...preset })) }));
      if (part === "family") Object.defineProperty(families[0], "label", { enumerable: true, get: getter });
      if (part === "preset") Object.defineProperty(families[0]!.presets[0], "label", { enumerable: true, get: getter });
      if (part === "array") Object.defineProperty(families, "0", { enumerable: true, get: getter });
      expect(() => new NSEFontManager({ families, library: null })).toThrow(TypeError);
      expect(getter).not.toHaveBeenCalled();
  });
  it("rejects duplicate family ids", () => {
    expect(() => new NSEFontManager({ families: [typographyFontFamilies[0]!, typographyFontFamilies[0]!], library: null })).toThrow(/duplicate/i);
  });
  it("rejects duplicate preset ids across supplied families", () => {
    const families = typographyFontFamilies.map(family => ({ ...family, presets: family.presets.map(preset => ({ ...preset })) }));
    families[1]!.presets[0]!.id = families[0]!.presets[0]!.id;
    families[1]!.defaultPresetId = families[0]!.presets[0]!.id;
    expect(() => new NSEFontManager({ families, library: null })).toThrow(/duplicate/i);
  });
  it("rejects missing default faces at construction", () => {
    const family = typographyFontFamilies[0]!;
    expect(() => new NSEFontManager({ families: [{ ...family, defaultPresetId: "missing" }], library: null })).toThrow(/default/i);
  });
  it("rejects incoherent preset family membership at construction", () => {
    const family = typographyFontFamilies[0]!;
    expect(() => new NSEFontManager({ families: [{ ...family, presets: [{ ...family.presets[0]!, familyId: "other" }] }], library: null })).toThrow(/family/i);
  });
  it("rejects invalid CSS family descriptors at construction", () => {
    const family = typographyFontFamilies[0]!;
    expect(() => new NSEFontManager({ families: [{ ...family, presets: [{ ...family.presets[0]!, family: "Unsafe; color: red" }] }], library: null })).toThrow(/family/i);
  });

  it("derives imported choices from the injected library and stops offering released faces", async () => {
    const release = vi.fn();
    const register = vi.fn(async () => release);
    const library = new NSEFontLibrary({ storage: null, preferences: null, faceHost: { register } });
    const manager = new NSEFontManager({ library });
    expect(manager.allFamilies()).toEqual([]);
    const bytes = readFileSync(new URL("../fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf", import.meta.url));
    const result = await library.addFonts([{ name: "Fixture.ttf", size: bytes.byteLength, arrayBuffer: async () => Uint8Array.from(bytes).buffer }]);
    expect(result.rejected).toEqual([]);
    expect(result.added).toHaveLength(1);
    const id = result.added[0]!.id;
    expect(manager.allFamilies()).toEqual(library.getSnapshot().userFamilies);
    expect(manager.isUserFont(id)).toBe(true);
    expect(manager.fontCommand(id, 16)).toEqual({ fontId: id, size: 16 });
    expect(register).toHaveBeenCalledOnce();
    library.addFavourite(id); library.noteUsed(id);
    expect(library.getSnapshot()).toMatchObject({ favourites: [id], recents: [id] });
    expect(await library.removeFont(id)).toBe(true);
    expect(release).toHaveBeenCalledOnce();
    expect(manager.allFamilies()).toEqual([]);
    expect(manager.getPreset(id)).toBeNull();
    expect(library.getSnapshot()).toMatchObject({ favourites: [], recents: [] });
  });

  it("keeps supplied choices separate from imported removable faces", () => {
    const library = new NSEFontLibrary({ faceHost: null, storage: null, preferences: null });
    const manager = new NSEFontManager({ families: typographyFontFamilies, library });
    expect(manager.allFamilies()).toEqual(typographyFontFamilies);
    expect(manager.isUserFont("fixture.sans.regular")).toBe(false);
    expect(library.canAddFonts).toBe(false);
  });

  it.each(["family", "preset"] as const)("rejects a supplied %s id that collides with later library registration", async (part) => {
    const bytes = readFileSync(new URL("../fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf", import.meta.url));
    const file = { name: "Fixture.ttf", size: bytes.byteLength, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
    const discovery = new NSEFontLibrary({ faceHost: { register: async () => () => undefined } });
    const added = await discovery.addFonts([file]);
    const imported = discovery.userPreset(added.added[0]!.id)!;
    const library = new NSEFontLibrary({ faceHost: { register: async () => () => undefined } });
    const supplied = { ...typographyFontFamilies[0]!, presets: typographyFontFamilies[0]!.presets.map(preset => ({ ...preset })) };
    if (part === "family") { supplied.id = imported.familyId; supplied.presets.forEach(preset => { preset.familyId = imported.familyId; }); }
    else { supplied.presets[0]!.id = imported.id; supplied.defaultPresetId = imported.id; }
    const manager = new NSEFontManager({ families: [supplied], library });
    expect(manager.allFamilies()).toEqual([supplied]);
    expect((await library.addFonts([file])).rejected).toEqual([]);
    expect(() => manager.allFamilies()).toThrow(/duplicate/i);
    expect(() => manager.getPreset(imported.id)).toThrow(/duplicate/i);
  });

  it("accepts absent optional preset fields without retaining explicit undefined values", () => {
    const family = typographyFontFamilies[0]!;
    const manager = new NSEFontManager({ families: [{ ...family, presets: [{ ...family.presets[0]!, style: undefined, weight: undefined }] }], library: null });
    expect(manager.getPreset(family.defaultPresetId)).not.toHaveProperty("style");
    expect(manager.getPreset(family.defaultPresetId)).not.toHaveProperty("weight");
    expect(manager.descriptorForPreset(family.defaultPresetId).weight).toBe(400);
  });

  it("uses generic typography defaults", () => {
    expect(typographyTokens).toEqual({ wordmark: "inherit", title: "system-ui, sans-serif", body: "system-ui, sans-serif" });
  });

  it("registers no product font resources", () => {
    const css = readFileSync(new URL("../../src/NSE/Typography/fonts.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/@font-face|url\(/);
  });
});
