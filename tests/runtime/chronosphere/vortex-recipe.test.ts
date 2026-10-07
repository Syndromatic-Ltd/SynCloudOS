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
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { VortexParticles, makeVortexPointSprite } from "../../../src/NSE/Chronosphere/Vortex/vortexParticles";
import { resolveVortexPreset, sampleVortexTrack } from "../../../src/NSE/Chronosphere/Vortex/vortexPresets";
import { VORTEX_SPIN_SHADER } from "../../../src/NSE/Chronosphere/Vortex/vortexShaders";

describe("Vortex recipe", () => {
  const sprite = makeVortexPointSprite();
  it("preserves source ignition tracks and exact Spin Distortion constants", () => {
    const recipe = resolveVortexPreset("chronosphere");
    expect(recipe.cloud.count).toBe(256);
    expect(recipe.swirl).toMatchObject({ angle: 18.75, radius: 2, power: 80.2 });
    expect(sampleVortexTrack(recipe.timeline.sunAlpha, 0.5)).toBe(0.55);
    expect(sampleVortexTrack(recipe.timeline.haloAlpha, 1.92)).toBe(0);
    expect(sampleVortexTrack(recipe.timeline.vortexDt, 0.29)).toBe(1.147);
    expect(VORTEX_SPIN_SHADER).toContain("pow(max(f0, 0.0), uPower) + 0.5");
    expect(VORTEX_SPIN_SHADER).toContain("return vec4(tex.rgb, uAlpha * edge)");
  });
  it("retains the point shader's straight-channel luminance even under zero alpha", () => {
    const source = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([0, 128, 255, 0]) });
    const masked = makeVortexPointSprite(source);
    const x = 32, y = 32;
    const radial = Math.max(0, 1 - Math.hypot((x + 0.5) / 64 - 0.5, (y + 0.5) / 64 - 0.5) / 0.5);
    expect(masked.pixel(x, y).a).toBeCloseTo(Math.round(radial * radial * (3 - 2 * radial) * 255) / 255, 6);
    expect(masked.pixel(0, 0).a).toBe(0);
    expect(masked.pixel(x, y).r).toBe(1);
  });
  it("projects stars from the core with the original perspective size, brightness and sway", () => {
    const recipe = resolveVortexPreset("chronosphere", { stars: { count: 1 } });
    const particles = new VortexParticles(recipe, () => 0.75);
    particles.elapsed = 8;
    particles.stars[0] = { z: 0.1, dirX: 0.25, dirY: -0.5, brightness: 0.8, worldSize: 0.2 };
    const star = particles.starBatch(sprite, 1000, 800)[0];
    const perspective = 0.12 / 0.1;
    expect(star.scale * sprite.width).toBeCloseTo(0.2 * perspective * 46);
    const sway = Math.sin(8 * Math.PI / 16.101) * recipe.stars.thruster;
    expect(star.position.x).toBeCloseTo(500 + (0.25 * Math.cos(sway) + 0.5 * Math.sin(sway)) * perspective * 400);
    expect(star.position.y).toBeCloseTo(0.34 * 800 - (0.25 * Math.sin(sway) - 0.5 * Math.cos(sway)) * perspective * 400);
    expect(star.colour.components.a).toBeCloseTo(0.8 * (0.12 + perspective * 0.55));
  });
  it("grows and fades clouds in source QC units, including the FBO size cap", () => {
    const recipe = resolveVortexPreset("screensaver", { cloud: { count: 1 } });
    const particles = new VortexParticles(recipe, () => 0.5);
    particles.clouds[0] = { vx: 0.4, vy: -0.2, age: 1, sizeStart: 0.06 };
    const cloud = particles.cloudBatch(sprite, 900)[0];
    expect(cloud.position).toEqual({ x: 630, y: 540 });
    expect(cloud.scale * sprite.width).toBeCloseTo((0.06 + 0.15) * 0.5 * 900);
    expect(cloud.colour.components.a).toBeCloseTo(0.2 - 0.125);
    particles.clouds[0].age = 1.8;
    expect(particles.cloudBatch(sprite, 900)).toEqual([]);
  });
  it("keeps cruise motion after ignition, reverses on present travel, and does not restart an impulse id", () => {
    const recipe = resolveVortexPreset("chronosphere", { stars: { count: 1 } });
    const particles = new VortexParticles(recipe, () => 0.5);
    particles.elapsed = 10;
    particles.stars[0].z = 0.8;
    particles.advance(0.1, 1000, 800);
    expect(particles.stars[0].z).toBeCloseTo(0.796);
    particles.setTravelImpulse({ id: 1, direction: "present" });
    particles.advance(0.1, 1000, 800);
    expect(particles.stars[0].z).toBeGreaterThan(0.796);
    const amount = particles.impulseAmount;
    particles.setTravelImpulse({ id: 1, direction: "present" });
    expect(particles.impulseAmount).toBe(amount);
    for (let i = 0; i < 12; i++) particles.advance(0.1, 1000, 800);
    expect(particles.impulseAmount).toBe(0);
  });
});
