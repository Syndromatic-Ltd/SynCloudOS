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
import { renderGraphics as render, drawFigure } from "./graphicsViewFixture";
import { describe, expect, it } from "vitest";
import { GFXContext, GFXImage, GFXPath, GFXPattern, GFXIdentityTransform } from "../../../src/FX/GraphicsFX/public";
import { createOwnedGFXIdentifierIssuer } from "../../../src/FX/GraphicsFX/identifierAuthority";
import { NSEView } from "../../../src/NSE/Views/NSEView";

const image = () => new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]) });
const issuer = () => {
    let i = 0;
    return createOwnedGFXIdentifierIssuer(() => () => `gfxdef${++i}`);
};
/** A 10×10 list filled with a pattern: its pattern identity is `pattern:1`, as the outer list's is. */
function patternFigure() {
    const context = GFXContext.recording({ size: { width: 10, height: 10 }, identifiers: issuer() });
    context.setFill(new GFXPattern(image(), GFXIdentityTransform));
    context.fill(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }));
    return context.displayList;
}

describe("GFXContext.drawDisplayList", () => {
    it("places a recorded list in the destination and keeps its definitions apart from the outer list's", () => {
        const outer = GFXContext.recording({ size: { width: 40, height: 20 }, identifiers: issuer() });
        outer.setFill(new GFXPattern(image(), GFXIdentityTransform));
        outer.fill(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }));
        outer.drawDisplayList(patternFigure(), { x: 10, y: 0, width: 20, height: 20 });
        const nested = outer.displayList.commands[1]!;
        expect(nested.kind).toBe("display-list");
        if (nested.kind !== "display-list") return;
        expect(nested.transform).toEqual({ a: 2, b: 0, c: 0, d: 2, tx: 10, ty: 0 });
        const svg = outer.toSVG();
        expect(svg).toContain('data-gfx-display-list="" opacity="1" transform="matrix(2 0 0 2 10 0)"');
        expect(svg.match(/<pattern /g)).toHaveLength(2);

        const view = render(<NSEView draw={drawFigure(outer.displayList)} aria-label="Nested figure" />);
        const group = view.container.querySelector("g[data-gfx-display-list] g[data-gfx-display-list]");
        expect(group?.getAttribute("transform")).toBe("matrix(2 0 0 2 10 0)");
        const patternIds = Array.from(view.container.querySelectorAll("pattern"), node => node.id);
        expect(new Set(patternIds).size).toBe(2);
        expect(group?.querySelector("path")?.getAttribute("fill")).toBe(`url(#${patternIds.find(id => view.container.querySelector("path")?.getAttribute("fill") !== `url(#${id})`)})`);
    });

    it("composes the current transform and clips the nested list with the outer clip", () => {
        const outer = GFXContext.recording({ size: { width: 40, height: 40 }, identifiers: issuer() });
        outer.concatTransform({ ...GFXIdentityTransform, tx: 5, ty: 5 });
        outer.clip(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }));
        outer.drawDisplayList(patternFigure(), { x: 0, y: 0, width: 10, height: 10 });
        const nested = outer.displayList.commands[0]!;
        if (nested.kind !== "display-list") throw new Error("expected a nested list");
        expect(nested.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 5, ty: 5 });
        expect(nested.state.clipPathDataChain).toHaveLength(1);
        expect(outer.toSVG()).toMatch(/<g clip-path="url\(#[^"]+\)"><g data-gfx-display-list=""/);
    });

    it("accepts only recorder-owned lists and counts their commands against the limit", () => {
        const outer = GFXContext.recording({ size: { width: 10, height: 10 }, identifiers: issuer() });
        expect(() => outer.drawDisplayList({ size: { width: 1, height: 1 }, commands: [] }, { x: 0, y: 0, width: 1, height: 1 })).toThrow(TypeError);
        const big = GFXContext.recording({ size: { width: 10, height: 10 }, identifiers: issuer() });
        for (let index = 0; index < 6000; index++) big.fill(GFXPath.rect({ x: 0, y: 0, width: 1, height: 1 }));
        const list = big.displayList;
        outer.drawDisplayList(list, { x: 0, y: 0, width: 10, height: 10 });
        expect(() => outer.drawDisplayList(list, { x: 0, y: 0, width: 10, height: 10 })).toThrow(/command limit/);
    });

    it("ignores an empty destination", () => {
        const outer = GFXContext.recording({ size: { width: 10, height: 10 }, identifiers: issuer() });
        outer.drawDisplayList(patternFigure(), { x: 0, y: 0, width: 0, height: 10 });
        expect(outer.displayList.commands).toHaveLength(0);
    });
});
