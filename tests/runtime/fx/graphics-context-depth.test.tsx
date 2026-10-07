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
import {
  GFXBitmapContext,
  GFXColour,
  GFXContext,
  GFXImage,
  GFXPath,
  GFXPattern,
  GFXShading,
  GFXGradient,
  type GFXBlendMode,
} from "../../../src/FX/GraphicsFX/public";
import { createOwnedGFXIdentifierIssuer } from "../../../src/FX/GraphicsFX/identifierAuthority";
import { NSEGraphicsView } from "../../../src/NSE/Graphics/NSEGraphicsView";

const rect = (x: number, y: number, width: number, height: number) => GFXPath.rect({ x, y, width, height });
const recorder = (scale = 1) => GFXContext.recording({
  size: { width: 8, height: 8 },
  scale,
  identifiers: createOwnedGFXIdentifierIssuer(() => {
    let id = 0;
    return () => `depth${++id}`;
  }),
});

describe("GraphicsFX context depth", () => {
  it("round-trips user/device coordinates through CTM and device scale and rejects a singular inverse", () => {
    const recording = recorder(2);
    recording.setTransform({ a: 1.25, b: 0.5, c: -0.25, d: 2, tx: 3, ty: -4 });
    const user = { x: 1.25, y: -2.5 };
    const device = recording.convertPointToDeviceSpace(user);
    expect(device).toEqual({ x: 10.375, y: -16.75 });
    const restored = recording.convertPointFromDeviceSpace(device);
    expect(Math.hypot(restored.x - user.x, restored.y - user.y)).toBeLessThanOrEqual(1e-9);

    const bitmap = new GFXBitmapContext({ width: 8, height: 8, scale: 2 });
    bitmap.setTransform({ a: 1.25, b: 0.5, c: -0.25, d: 2, tx: 3, ty: -4 });
    expect(bitmap.convertPointToDeviceSpace(user)).toEqual(device);
    const bitmapRestored = bitmap.convertPointFromDeviceSpace(device);
    expect(Math.hypot(bitmapRestored.x - user.x, bitmapRestored.y - user.y)).toBeLessThanOrEqual(1e-9);
    expect(() => bitmap.setTransform({ a: 1, b: 2, c: 2, d: 4, tx: 0, ty: 0 })).toThrow(/singular/i);
    bitmap.dispose();
    recording.setTransform({ a: 1, b: 2, c: 2, d: 4, tx: 0, ty: 0 });
    expect(() => recording.convertPointFromDeviceSpace({ x: 0, y: 0 })).toThrow(/singular/i);
  });

  it("composites overlapping children once through a scoped transparency group", () => {
    const grouped = new GFXBitmapContext({ width: 3, height: 1 });
    const group = grouped.beginTransparencyGroup({ alpha: 0.5 });
    grouped.fillPath(rect(0, 0, 2, 1), GFXColour.rgba(1, 0, 0));
    grouped.fillPath(rect(1, 0, 2, 1), GFXColour.rgba(0, 1, 0));
    grouped.endTransparencyGroup(group);
    expect(grouped.makeImage().pixel(1, 0).a).toBe(128 / 255);

    const individual = new GFXBitmapContext({ width: 3, height: 1 });
    individual.setAlpha(0.5);
    individual.fillPath(rect(0, 0, 2, 1), GFXColour.rgba(1, 0, 0));
    individual.fillPath(rect(1, 0, 2, 1), GFXColour.rgba(0, 1, 0));
    expect(individual.makeImage().pixel(1, 0).a).toBe(192 / 255);
    expect(() => grouped.endTransparencyGroup(group)).toThrow(/group|matching/i);
    expect(grouped.makeImage().pixel(1, 0).a).toBe(128 / 255);
    grouped.dispose(); individual.dispose();
  });

  it("records an isolated SVG/NSE group rather than applying opacity to each child", () => {
    const context = recorder();
    const group = context.beginTransparencyGroup({ alpha: 0.5 });
    context.setFill(GFXColour.rgba(1, 0, 0)); context.fill(rect(0, 0, 4, 4));
    context.setFill(GFXColour.rgba(0, 1, 0)); context.fill(rect(2, 0, 4, 4));
    context.endTransparencyGroup(group);
    const svg = context.toSVG();
    expect(svg).toContain('data-gfx-transparency-group="');
    expect(svg).toContain('opacity="0.5"');
    expect((svg.match(/<path /g) ?? []).length).toBe(2);
    const { container } = render(<NSEGraphicsView displayList={context.displayList} label="Group"/>);
    const node = container.querySelector("g[data-gfx-transparency-group]");
    expect(node?.getAttribute("opacity")).toBe("0.5");
    expect(node?.querySelectorAll("path")).toHaveLength(2);
  });

  it("keeps recorder saves inside their transparency group and leaves an unbalanced group uncommitted", () => {
    const context = recorder();
    context.save();
    const group = context.beginTransparencyGroup({ alpha: 0.5 });
    expect(() => context.restore()).toThrow(/group|matching|scope/i);
    context.save();
    context.setFill(GFXColour.rgba(1, 0, 0));
    context.fill(rect(0, 0, 2, 2));
    expect(() => context.endTransparencyGroup(group)).toThrow(/unbalanced|save|restore/i);
    expect(() => context.displayList).toThrow(/group.*open/i);
    context.restore();
    context.endTransparencyGroup(group);
    expect(context.displayList.commands).toHaveLength(1);
    context.restore();
    expect(() => context.restore()).toThrow(/matching/i);
  });

  it("keeps bitmap saves inside their transparency group and leaves an unbalanced group uncomposited", () => {
    const bitmap = new GFXBitmapContext({ width: 2, height: 2 });
    bitmap.save();
    const group = bitmap.beginTransparencyGroup({ alpha: 0.5 });
    expect(() => bitmap.restore()).toThrow(/group|matching|scope/i);
    bitmap.save();
    bitmap.fillPath(rect(0, 0, 2, 2), GFXColour.rgba(1, 0, 0));
    expect(() => bitmap.endTransparencyGroup(group)).toThrow(/unbalanced|save|restore/i);
    expect(() => bitmap.makeImage()).toThrow(/group.*open/i);
    bitmap.restore();
    bitmap.endTransparencyGroup(group);
    expect(bitmap.makeImage().pixel(0, 0).a).toBe(128 / 255);
    bitmap.restore();
    expect(() => bitmap.restore()).toThrow(/matching/i);
    bitmap.dispose();
  });

  it.each<[GFXBlendMode, [number, number, number, number]]>([
    ["source-in", [255, 0, 0, 64]],
    ["source-out", [255, 0, 0, 64]],
    ["source-atop", [128, 0, 128, 128]],
    ["destination-in", [0, 0, 255, 64]],
    ["destination-out", [0, 0, 255, 64]],
    ["destination-atop", [127, 0, 128, 128]],
    ["xor", [127, 0, 128, 128]],
  ])("implements premultiplied Porter-Duff %s", (mode, expected) => {
    const bitmap = new GFXBitmapContext({ width: 1, height: 1 });
    bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(0, 0, 1, 0.5));
    bitmap.setBlendMode(mode);
    bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(1, 0, 0, 0.5));
    expect([...bitmap.makeImage().copyData()]).toEqual(expected);
    bitmap.dispose();
  });

  it("implements copy/clear and truthfully rejects unsupported Porter-Duff recording", () => {
    const bitmap = new GFXBitmapContext({ width: 1, height: 1 });
    bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(0, 0, 1));
    bitmap.setBlendMode("copy"); bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(1, 0, 0, 0.5));
    expect([...bitmap.makeImage().copyData()]).toEqual([255, 0, 0, 128]);
    bitmap.setBlendMode("clear"); bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(1, 1, 1));
    expect([...bitmap.makeImage().copyData()]).toEqual([0, 0, 0, 0]);
    bitmap.dispose();

    const context = recorder();
    expect(() => context.setBlendMode("source-in")).toThrow(/recording|svg|porter/i);
  });

  it("applies negative pattern phase and explicit conic paint sampling scale", () => {
    const image = new GFXImage({ width: 2, height: 1, alpha: "opaque", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]) });
    const pattern = new GFXPattern(image);
    const bitmap = new GFXBitmapContext({ width: 4, height: 1 });
    bitmap.setPatternPhase({ x: -1, y: 0 });
    bitmap.fillPath(rect(0, 0, 4, 1), pattern);
    expect(bitmap.makeImage().pixel(0, 0).b).toBe(1);
    expect(bitmap.makeImage().pixel(1, 0).r).toBe(1);
    bitmap.dispose();

    const context = recorder();
    context.setPatternPhase({ x: -1, y: 0 }); context.setFill(pattern); context.fill(rect(0, 0, 4, 1));
    const patternPaint = context.displayList.commands[0]!.kind === "fill-path" ? context.displayList.commands[0]!.paint : null;
    expect(patternPaint?.kind).toBe("pattern");
    if (patternPaint?.kind === "pattern") expect(patternPaint.transform.tx).toBe(-1);

    const ramp = new GFXGradient([{ offset: 0, colour: GFXColour.rgba(1, 0, 0) }, { offset: 1, colour: GFXColour.rgba(0, 0, 1) }]);
    const sampled = recorder(); sampled.setPaintSamplingScale(2); sampled.setFill(new GFXShading(ramp, { kind: "conic", centre: { x: 1, y: 1 }, startAngle: 0 })); sampled.fill(rect(0, 0, 2, 2));
    const paint = sampled.displayList.commands[0]!.kind === "fill-path" ? sampled.displayList.commands[0]!.paint : null;
    expect(paint?.kind).toBe("pattern");
    if (paint?.kind === "pattern") { expect(paint.image.width).toBe(4); expect(paint.image.height).toBe(4); expect(paint.transform.a).toBe(0.5); }
  });
});
