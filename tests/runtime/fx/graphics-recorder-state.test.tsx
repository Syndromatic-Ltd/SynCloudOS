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
import { GFXBitmapContext, GFXColour, GFXContext, GFXGradient, GFXIdentityTransform, GFXPath, GFXShading } from "../../../src/FX/GraphicsFX/public";
import { createOwnedGFXIdentifierIssuer } from "../../../src/FX/GraphicsFX/identifierAuthority";
import { NSEGraphicsView } from "../../../src/NSE/Graphics/NSEGraphicsView";
const context = () => {
    let i = 0;
    return GFXContext.recording({ size: { width: 10, height: 10 }, identifiers: createOwnedGFXIdentifierIssuer(() => () => `state${++i}`) });
};
const stops = [{ offset: 0, colour: GFXColour.rgba(0, 0, 0) }, { offset: 1, colour: GFXColour.rgba(1, 1, 1) }];
describe("GraphicsFX recorder coordinate and fill state", () => {
    it("makes gradient coordinate units explicit and shares bounding-box sampling", () => {
        const bbox = new GFXGradient(stops);
        expect(bbox.units).toBe("objectBoundingBox");
        expect(bbox.sampleAt({ x: 15, y: 2 }, { x: 10, y: 0, width: 10, height: 4 }).components.r).toBe(0.5);
        const user = new GFXGradient(stops, { kind: "linear", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, { units: "userSpaceOnUse", transform: { ...GFXIdentityTransform, tx: 5 } });
        expect(user.sampleAt({ x: 10, y: 0 }).components.r).toBe(0.5);
        const recorder = context();
        recorder.setFill(user);
        recorder.fill(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }));
        expect(recorder.toSVG()).toContain('gradientUnits="userSpaceOnUse"');
        expect(recorder.toSVG()).toContain('gradientTransform="matrix(1 0 0 1 5 0)"');
        const bitmap = new GFXBitmapContext({ width: 4, height: 1 });
        bitmap.fillPath(GFXPath.rect({ x: 0, y: 0, width: 4, height: 1 }), bbox);
        expect(bitmap.makeImage().pixel(0, 0).r).toBe(32 / 255);
        expect(bitmap.makeImage().pixel(3, 0).r).toBe(223 / 255);
        bitmap.dispose();
    });
    it("projects even-odd fills/clips and restores dash phase and miter state", () => {
        const recorder = context(), path = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }).append(GFXPath.rect({ x: 2, y: 2, width: 6, height: 6 }));
        recorder.clip(path, "evenodd");
        recorder.fill(path, "evenodd");
        recorder.save();
        recorder.setLineDash([2, 1], 0.5);
        recorder.setMiterLimit(3);
        recorder.stroke(path);
        recorder.restore();
        recorder.stroke(path);
        const svg = recorder.toSVG();
        expect(svg).toContain('fill-rule="evenodd"');
        expect(svg).toContain('clip-rule="evenodd"');
        expect(svg).toContain('stroke-dashoffset="0.5"');
        expect(svg).toContain('stroke-miterlimit="3"');
        const { container } = render(<NSEGraphicsView displayList={recorder.displayList} label="Rules"/>);
        expect(container.querySelector('clipPath path')?.getAttribute('clip-rule')).toBe("evenodd");
        const strokes = container.querySelectorAll('path[stroke]');
        expect(strokes[0]?.getAttribute('stroke-dashoffset')).toBe("0.5");
        expect(strokes[1]?.getAttribute('stroke-dashoffset')).toBe("0");
        expect(strokes[1]?.getAttribute('stroke-miterlimit')).toBe("10");
    });
    it("projects axial/radial shadings as native gradients and conic as owned sampled pixels", () => {
        const recorder = context(), ramp = new GFXGradient(stops), path = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 });
        recorder.setFill(new GFXShading(ramp, { kind: "axial", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }));
        recorder.fill(path);
        recorder.setFill(new GFXShading(ramp, { kind: "radial", centre: { x: 5, y: 5 }, radius: 5 }));
        recorder.fill(path);
        recorder.setFill(new GFXShading(ramp, { kind: "conic", centre: { x: 5, y: 5 }, startAngle: 0 }));
        recorder.fill(path);
        const svg = recorder.toSVG();
        expect(svg).toContain("linearGradient");
        expect(svg).toContain("radialGradient");
        expect(svg).toContain("data:image/png;base64,");
        const { container } = render(<NSEGraphicsView displayList={recorder.displayList} label="Shading"/>);
        expect(container.querySelector('pattern image')?.getAttribute('href')).toMatch(/^data:image\/png;base64,/);
    });
    it("uses even-odd holes in bitmap fills and clips", () => {
        const ring = GFXPath.rect({ x: 0, y: 0, width: 6, height: 6 }).append(GFXPath.rect({ x: 2, y: 2, width: 2, height: 2 }));
        const bitmap = new GFXBitmapContext({ width: 6, height: 6 });
        bitmap.fillPath(ring, GFXColour.rgba(1, 0, 0), "evenodd");
        expect(bitmap.makeImage().pixel(3, 3).a).toBe(0);
        expect(bitmap.makeImage().pixel(0, 0).a).toBe(1);
        bitmap.clear();
        bitmap.clip(ring, "evenodd");
        bitmap.fillPath(GFXPath.rect({ x: 0, y: 0, width: 6, height: 6 }), GFXColour.rgba(0, 1, 0));
        expect(bitmap.makeImage().pixel(3, 3).a).toBe(0);
        expect(bitmap.makeImage().pixel(0, 0).g).toBe(1);
        bitmap.dispose();
    });
});
