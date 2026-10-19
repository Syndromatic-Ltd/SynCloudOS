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

// @vitest-environment jsdom
import React from "react";
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateNSESmoothSurfaceClipPath, generateNSESmoothSurfacePath } from "../../src/NSE/SmoothSurface";
import { useWebspringFolderAppearance, WebspringFolderTile, type WebspringFolderAppearance, type WebspringFolderItem } from "../../src/Webspring/public";
import { WebspringFolderAppearanceProvider, resolveWebspringFolderTileGeometry } from "../../src/Webspring/WebspringFolderAppearance";

const folder: WebspringFolderItem = {
  kind: "folder", id: "folder.tools", title: "Tools", badgeCount: 0,
  dialPlacement: { index: 0 } as unknown as WebspringFolderItem["dialPlacement"],
  apps: ["alpha", "beta"].map((id) => ({ id, title: id, iconUrl: `/${id}.png` })) as unknown as WebspringFolderItem["apps"],
};

const squircle: WebspringFolderAppearance = {
  shape: { kind: "roundedRect", smoothSurface: { radius: "36%", curve: "squircle", smoothing: 0.6 } },
  fill: "inset",
};
const cottonCircle: WebspringFolderAppearance = {
  shape: { kind: "circle" },
  fill: { kind: "texture", image: '/textures/"cotton".jpg', size: "128px", colour: "#20242c" },
};

// jsdom lays nothing out; give every element the tile's 60-pixel box.
let side = 60;
const layout = ["offsetWidth", "offsetHeight"].map((key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)!] as const);
beforeEach(() => {
  side = 60;
  for (const [key] of layout) Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => side });
});
afterEach(() => {
  cleanup();
  for (const [key, descriptor] of layout) Object.defineProperty(HTMLElement.prototype, key, descriptor);
});

function renderTile(appearance: WebspringFolderAppearance | null, dropTarget = false) {
  const tile = <WebspringFolderTile folder={folder} dropTarget={dropTarget} />;
  const { container } = render(appearance ? <WebspringFolderAppearanceProvider value={appearance}>{tile}</WebspringFolderAppearanceProvider> : tile);
  return container.querySelector<HTMLElement>(".webspring-folder-tile")!;
}

describe("WebspringFolderTile", () => {
  it("draws the default inset squircle from NSESmoothSurface geometry sized to the tile", () => {
    const tile = renderTile(null);
    const options = { radius: 21.6, curve: "squircle" as const, smoothing: 0.6 };
    const path = generateNSESmoothSurfacePath(60, 60, options);

    expect(tile.dataset.shape).toBe("roundedRect");
    expect(tile.dataset.fill).toBe("inset");
    expect(tile.style.getPropertyValue("--webspring-folder-tile-clip")).toBe(generateNSESmoothSurfaceClipPath(60, 60, options));
    // The well's shading is a frame around the same outline, clipped with the well.
    for (const shading of tile.querySelectorAll(".webspring-folder-tile-surface path")) {
      expect(shading.getAttribute("fill-rule")).toBe("evenodd");
      expect(shading.getAttribute("d")).toBe(`M -32 -32 H 92 V 92 H -32 Z ${path}`);
    }
    expect(tile.querySelectorAll(".webspring-folder-tile-surface path")).toHaveLength(2);
    expect(tile.querySelector(".webspring-folder-tile-lip path")!.getAttribute("d")).toBe(path);
    // A fragment reference would make the stage snapshot drop its background images.
    expect(tile.outerHTML).not.toMatch(/url\(#/u);
    expect(tile.querySelectorAll(".webspring-folder-tile-member img")).toHaveLength(2);
  });

  it("scales a percentage radius with the tile", () => {
    expect(resolveWebspringFolderTileGeometry(squircle.shape, 120, 120).path)
      .toBe(generateNSESmoothSurfacePath(120, 120, { radius: 43.2, curve: "squircle", smoothing: 0.6 }));
    expect(resolveWebspringFolderTileGeometry({ kind: "roundedRect", smoothSurface: { radius: 12, curve: "arc", smoothing: 0 } }, 120, 120).path)
      .toBe(generateNSESmoothSurfacePath(120, 120, { radius: 12, curve: "arc", smoothing: 0 }));
  });

  it("clips a circle and lines it with the configured texture", () => {
    const tile = renderTile(cottonCircle);

    expect(tile.dataset.shape).toBe("circle");
    expect(tile.dataset.fill).toBe("texture");
    expect(tile.style.getPropertyValue("--webspring-folder-tile-clip")).toBe("circle(closest-side)");
    expect(tile.querySelector(".webspring-folder-tile-lip path")!.getAttribute("d")).toBe("M 0 30 A 30 30 0 1 0 60 30 A 30 30 0 1 0 0 30 Z");
    expect(tile.style.getPropertyValue("--webspring-folder-tile-texture")).toBe('url("/textures/\\22 cotton\\22 .jpg")');
    expect(tile.style.getPropertyValue("--webspring-folder-tile-texture-size")).toBe("128px");
    expect(tile.style.getPropertyValue("--webspring-folder-tile-texture-colour")).toBe("#20242c");
  });

  it("rings a drop target outside its shape", () => {
    for (const appearance of [squircle, cottonCircle]) {
      const tile = renderTile(appearance, true);
      const outline = resolveWebspringFolderTileGeometry(appearance.shape, 60, 60).path;
      const ring = tile.querySelector(".webspring-folder-tile-ring-stroke path")!;

      expect(tile.dataset.dropTarget).toBe("true");
      expect(ring.getAttribute("d")).toBe(outline);
      expect(ring.getAttribute("stroke-width")).toBe("6");
      // The ring and its shadow are clipped to outside the outline by an even-odd frame.
      const rim = ring.closest<HTMLElement>(".webspring-folder-tile-rim")!;
      expect(rim.style.clipPath).toBe(`path(evenodd, "M -32 -32 H 92 V 92 H -32 Z ${outline}")`);
      expect(tile.outerHTML).not.toMatch(/url\(#/u);
      cleanup();
    }
  });

  it("draws no clip or shading before the tile has a size", () => {
    side = 0;
    const tile = renderTile(null);
    expect(tile.style.getPropertyValue("--webspring-folder-tile-clip")).toBe("");
    expect(tile.querySelector("svg")).toBeNull();
  });

  it("gives custom views the appearance through a hook", () => {
    expect(renderHook(() => useWebspringFolderAppearance()).result.current.shape.kind).toBe("roundedRect");
    expect(renderHook(() => useWebspringFolderAppearance(), {
      wrapper: ({ children }) => <WebspringFolderAppearanceProvider value={cottonCircle}>{children}</WebspringFolderAppearanceProvider>,
    }).result.current).toBe(cottonCircle);
  });
});
