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
import { GFXBitmapContext, GFXContext, GFXColour, GFXImage, GFXLayer, GFXPath, GFXIdentityTransform } from "../../../src/FX/GraphicsFX/public";
import { createOwnedGFXIdentifierIssuer, createMountedGFXIdentifierIssuer } from "../../../src/FX/GraphicsFX/identifierAuthority";
import { NSEGraphicsView } from "../../../src/NSE/Graphics/NSEGraphicsView";
const owner = () => {
    let i = 0;
    return createOwnedGFXIdentifierIssuer(() => () => `image${++i}`);
};
describe("GraphicsFX direct recorder images and layers", () => {
    it("records the same immutable pixels through transforms and clipping", () => {
        const image = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 128]) });
        const context = GFXContext.recording({ size: { width: 10, height: 10 }, identifiers: owner() });
        context.clip(GFXPath.rect({ x: 0, y: 0, width: 9, height: 9 }));
        context.setTransform({ ...GFXIdentityTransform, tx: 2 });
        context.setAlpha(0.5);
        context.drawImage(image, { x: 1, y: 1, width: 4, height: 6 });
        const command = context.displayList.commands[0]!;
        expect(command.kind).toBe("image");
        if (command.kind === "image")
            expect(command.image).toBe(image);
        const svg = context.toSVG();
        expect(svg).toContain('preserveAspectRatio="none"');
        expect(svg).toContain('x="1" y="1" width="4" height="6"');
        expect(svg).toContain("data:image/png;base64,");
        const { container } = render(<NSEGraphicsView displayList={context.displayList} label="Image"/>);
        expect(container.querySelector('image')?.getAttribute('transform')).toBe("matrix(1 0 0 1 2 0)");
        expect(container.querySelector('image')?.getAttribute('opacity')).toBe("0.5");
    });
    it("draws an immutable layer snapshot into either recorder or bitmap", () => {
        const surface = new GFXBitmapContext({ width: 1, height: 1 });
        surface.fillPath(GFXPath.rect({ x: 0, y: 0, width: 1, height: 1 }), GFXColour.rgba(0, 1, 0));
        const layer = new GFXLayer(surface);
        surface.dispose();
        const recorder = GFXContext.recording({ size: { width: 2, height: 2 }, identifiers: owner() });
        layer.draw(recorder, { x: 0, y: 0, width: 2, height: 2 });
        recorder.drawLayer(layer, { x: 0, y: 0, width: 1, height: 1 });
        expect(recorder.displayList.commands).toHaveLength(2);
        const bitmap = new GFXBitmapContext({ width: 1, height: 1 });
        layer.draw(bitmap, { x: 0, y: 0, width: 1, height: 1 });
        expect(bitmap.makeImage().pixel(0, 0).g).toBe(1);
        bitmap.dispose();
    });
    it("rejects invalid image destinations atomically and revokes image-only exports", () => {
        let live = true;
        const ownerToken = createMountedGFXIdentifierIssuer(owner(), () => {
            if (!live)
                throw new Error("revoked");
        });
        const recorder = GFXContext.recording({ size: { width: 2, height: 2 }, identifiers: ownerToken }), image = new GFXImage({ width: 1, height: 1, alpha: "opaque", colourSpace: "srgb", data: new Uint8Array(4) });
        expect(() => recorder.drawImage(image, { x: 0, y: 0, width: -1, height: 1 })).toThrow();
        expect(recorder.displayList.commands).toHaveLength(0);
        recorder.drawImage(image, { x: 0, y: 0, width: 1, height: 1 });
        expect(recorder.toSVG()).toContain("image");
        live = false;
        expect(() => recorder.toSVG()).toThrow(/revoked/);
    });
    it("projects saved interpolation into SVG and the accessible view", () => {
        const recorder = GFXContext.recording({ size: { width: 2, height: 2 }, identifiers: owner() }), image = new GFXImage({ width: 1, height: 1, alpha: "opaque", colourSpace: "srgb", data: new Uint8Array(4) });
        recorder.save();
        recorder.setInterpolation("linear");
        recorder.drawImage(image, { x: 0, y: 0, width: 2, height: 2 });
        recorder.restore();
        recorder.drawImage(image, { x: 0, y: 0, width: 2, height: 2 });
        const svg = recorder.toSVG();
        expect(svg).toContain('image-rendering="auto"');
        expect(svg).toContain('image-rendering="pixelated"');
        const { container } = render(<NSEGraphicsView displayList={recorder.displayList} label="Interpolation"/>);
        const images = container.querySelectorAll("image");
        expect(images[0]?.style.imageRendering).toBe("auto");
        expect(images[1]?.style.imageRendering).toBe("pixelated");
    });
});
