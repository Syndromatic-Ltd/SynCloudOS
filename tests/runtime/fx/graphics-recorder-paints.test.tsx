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
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GFXContext, GFXColour, GFXImage, GFXPath, GFXPattern, GFXIdentityTransform } from "../../../src/FX/GraphicsFX/public";
import { createOwnedGFXIdentifierIssuer, createMountedGFXIdentifierIssuer } from "../../../src/FX/GraphicsFX/identifierAuthority";
import { NSEGraphicsView } from "../../../src/NSE/Graphics/NSEGraphicsView";
const image = () => new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]) });
const issuer = () => {
    let i = 0;
    return createOwnedGFXIdentifierIssuer(() => () => `gfxpaint${++i}`);
};
describe("GraphicsFX recorder masks and patterns", () => {
    it("records owned pattern pixels and nested transformed mask snapshots", () => {
        const context = GFXContext.recording({ size: { width: 10, height: 10 }, identifiers: issuer() });
        context.setFill(new GFXPattern(image(), { ...GFXIdentityTransform, tx: 3 }));
        context.save();
        context.setTransform({ ...GFXIdentityTransform, tx: 2 });
        context.clipToMask(image(), { x: 0, y: 0, width: 4, height: 2 });
        context.setTransform(GFXIdentityTransform);
        context.clipToMask(image(), { x: 0, y: 0, width: 8, height: 8 });
        context.fill(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }));
        context.restore();
        context.fill(GFXPath.rect({ x: 0, y: 0, width: 1, height: 1 }));
        const list = context.displayList;
        expect(list.commands[0]!.state.masks).toHaveLength(2);
        expect(list.commands[1]!.state.masks).toHaveLength(0);
        const svg = context.toSVG();
        expect(svg).toContain("patternUnits=\"userSpaceOnUse\"");
        expect(svg).toContain("patternTransform=\"matrix(1 0 0 1 3 0)\"");
        expect(svg.match(/<mask /g)).toHaveLength(2);
        expect(svg).toContain("matrix(1 0 0 1 2 0)");
        const { container } = render(<><NSEGraphicsView displayList={list} label="First"/><NSEGraphicsView displayList={list} label="Second"/></>);
        expect(container.querySelectorAll("pattern")).toHaveLength(4);
        expect(container.querySelectorAll("mask")).toHaveLength(4);
        const ids = [...container.querySelectorAll("[id]")].map(n => n.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
    it("cannot export cached pattern or mask identifiers after mounted revocation", () => {
        let live = true;
        const mounted = createMountedGFXIdentifierIssuer(issuer(), () => {
            if (!live)
                throw new Error("revoked");
        });
        const context = GFXContext.recording({ size: { width: 2, height: 2 }, identifiers: mounted });
        context.setFill(new GFXPattern(image()));
        context.clipToMask(image(), { x: 0, y: 0, width: 2, height: 2 });
        context.fill(GFXPath.rect({ x: 0, y: 0, width: 2, height: 2 }));
        const list = context.displayList;
        expect(context.toSVG()).toContain("pattern");
        const mountedView = render(<NSEGraphicsView displayList={list} label="Before"/>);
        live = false;
        expect(() => context.toSVG()).toThrow(/revoked/);
        expect(() => mountedView.rerender(<NSEGraphicsView displayList={list} label="After"/>)).toThrow(/revoked/);
    });
    it("rejects malformed masks before altering current state", () => {
        const context = GFXContext.recording({ size: { width: 2, height: 2 }, identifiers: issuer() });
        expect(() => context.clipToMask(image(), { x: 0, y: 0, width: 0, height: 2 })).toThrow();
        context.setFill(GFXColour.rgba(1, 0, 0));
        context.fill(GFXPath.rect({ x: 0, y: 0, width: 1, height: 1 }));
        expect(context.displayList.commands[0]!.state.masks).toHaveLength(0);
    });
    it("captures vector clip coordinates and fails oversized definitions before rendering", () => {
        const context = GFXContext.recording({ size: { width: 10, height: 10 }, identifiers: issuer() });
        context.setTransform({ ...GFXIdentityTransform, tx: 3 });
        context.clip(GFXPath.rect({ x: 0, y: 0, width: 1, height: 1 }));
        context.setTransform(GFXIdentityTransform);
        context.fill(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }));
        expect(context.displayList.commands[0]!.state.clipPathData).toBe("M 3 0 L 4 0 L 4 1 L 3 1 Z");
        const tile = new GFXImage({ width: 256, height: 256, alpha: "straight", colourSpace: "srgb", data: new Uint8Array(256 * 256 * 4) });
        const excessive = GFXContext.recording({ size: { width: 10, height: 10 }, identifiers: issuer() });
        excessive.setFill(new GFXPattern(tile));
        for (let i = 0; i < 17; i++)
            excessive.fill(GFXPath.rect({ x: 0, y: 0, width: 1, height: 1 }));
        expect(() => excessive.toSVG()).toThrow(/work limit/);
    });
});
