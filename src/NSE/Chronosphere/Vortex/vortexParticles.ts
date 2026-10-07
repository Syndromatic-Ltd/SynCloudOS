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

import type { AFXEmitterParticle } from "../../../FX/AnimationFX/AFXLayerContent";
import { GFXColour } from "../../../FX/GraphicsFX/GFXColour";
import { GFXImage } from "../../../FX/GraphicsFX/GFXImage";
import { sampleVortexTrack } from "./vortexPresets";
import type { VortexPreset, VortexTravelImpulse } from "./vortexTypes";

const STAR_Z_NEAR = 0.006, STAR_Z_FAR = 1.5;
const STAR_THRUSTER_PERIOD = 16.101, STAR_SIZE_SCALE = 46, STAR_SIZE_MAX_PX = 24;
interface Cloud { vx: number; vy: number; age: number; sizeStart: number; }
interface Star { z: number; dirX: number; dirY: number; brightness: number; worldSize: number; }

/** Particle math from the original recipe. Rendering and timing remain FX-owned. */
export class VortexParticles {
  elapsed = 0;
  readonly clouds: Cloud[];
  readonly stars: Star[];
  private impulseId: string | number | undefined;
  private impulseAge = Infinity;
  private impulseDuration = 1120;
  private impulseIntensity = 0;
  private impulseDirection = 1;

  constructor(readonly preset: VortexPreset, private readonly random = Math.random) {
    this.clouds = Array.from({ length: preset.cloud.count }, () => ({ ...this.spawnCloud(), age: this.random() * preset.cloud.lifeSeconds }));
    this.stars = Array.from({ length: Math.round(preset.stars.count * 1.3) }, () => this.spawnStar(true));
  }
  private range(min: number, max: number) { return min + this.random() * (max - min); }
  private spawnCloud(): Cloud {
    const c = this.preset.cloud;
    return { vx: this.range(-c.velocityMax, c.velocityMax), vy: this.range(-c.velocityMax, c.velocityMax), age: 0, sizeStart: this.range(...c.sizeStart) };
  }
  private spawnStar(spread = false): Star {
    const s = this.preset.stars;
    return { z: spread ? this.range(STAR_Z_NEAR, STAR_Z_FAR) : STAR_Z_FAR, dirX: this.range(-1, 1), dirY: this.range(-1, 1), brightness: this.range(0.45, 1), worldSize: this.range(...s.size) };
  }
  private recycleStar(star: Star, direction: number) {
    Object.assign(star, this.spawnStar());
    if (direction < 0) star.z = this.range(STAR_Z_NEAR * 2.5, 0.14);
  }
  setTravelImpulse(impulse?: VortexTravelImpulse) {
    if (!impulse || impulse.id === this.impulseId) return;
    this.impulseId = impulse.id;
    this.impulseAge = 0;
    this.impulseDirection = impulse.direction === "past" ? 1 : -1;
    this.impulseDuration = Math.max(220, impulse.durationMs ?? 1120);
    this.impulseIntensity = Math.max(0, impulse.intensity ?? 1);
  }
  get impulseAmount() {
    if (this.impulseAge >= this.impulseDuration) return 0;
    const easeOut = 1 - Math.max(0, Math.min(1, this.impulseAge / this.impulseDuration));
    return easeOut * easeOut * (3 - 2 * easeOut) * this.impulseIntensity;
  }
  advance(deltaSeconds: number, width: number, height: number) {
    const dt = Math.max(0, Math.min(0.1, deltaSeconds));
    this.elapsed += dt;
    this.impulseAge += dt * 1000;
    const boost = this.impulseAmount;
    const cloudDelta = dt * sampleVortexTrack(this.preset.timeline.vortexDt, this.elapsed) * (1 + boost * 1.5);
    for (const cloud of this.clouds) {
      cloud.age += cloudDelta;
      if (cloud.age >= this.preset.cloud.lifeSeconds) Object.assign(cloud, this.spawnCloud());
    }
    const s = this.preset.stars;
    const direction = boost > 0 ? this.impulseDirection : 1;
    const dz = dt * s.speed * (1 + 6 * Math.max(0, 1 - this.elapsed / 2.5)) * (1 + boost * 8) * direction;
    const sway = Math.sin(this.elapsed * (Math.PI / STAR_THRUSTER_PERIOD)) * s.thruster;
    const cos = Math.cos(sway), sin = Math.sin(sway), min = Math.min(width, height);
    const anchorX = (this.preset.core.anchorX - 0.5) * width;
    const anchorY = (0.5 - this.preset.core.anchorY) * height;
    const count = Math.min(this.stars.length, Math.max(s.count, Math.round(s.count * (1 + boost * 0.28))));
    for (let index = 0; index < count; index++) {
      const star = this.stars[index];
      star.z -= dz;
      if ((direction > 0 && star.z <= STAR_Z_NEAR) || (direction < 0 && star.z >= STAR_Z_FAR)) this.recycleStar(star, direction);
      const persp = s.spread / star.z;
      const px = (star.dirX * cos - star.dirY * sin) * persp * min * 0.5;
      const py = (star.dirX * sin + star.dirY * cos) * persp * min * 0.5;
      if (direction > 0 && (Math.abs(anchorX + px) > width * 0.5 + STAR_SIZE_MAX_PX || Math.abs(anchorY + py) > height * 0.5 + STAR_SIZE_MAX_PX)) this.recycleStar(star, direction);
    }
  }
  cloudBatch(image: GFXImage, diameter: number): AFXEmitterParticle[] {
    const c = this.preset.cloud;
    return this.clouds.flatMap((p, id) => {
      const alpha = c.alpha + c.opacityDelta * p.age;
      if (alpha <= 0) return [];
      const size = Math.min(96, Math.max(1, (p.sizeStart + c.sizeGrow * p.age) * this.preset.fboSize * 0.5));
      return [{ id, contents: image, position: { x: (0.5 + p.vx * p.age * 0.5) * diameter, y: (0.5 - p.vy * p.age * 0.5) * diameter }, zPosition: 0, renderOrder: id, colour: GFXColour.rgba(...c.colour, alpha), scale: size * diameter / this.preset.fboSize / image.width, rotation: 0 }];
    });
  }
  starBatch(image: GFXImage, width: number, height: number): AFXEmitterParticle[] {
    const s = this.preset.stars, min = Math.min(width, height), boost = this.impulseAmount;
    const sway = Math.sin(this.elapsed * (Math.PI / STAR_THRUSTER_PERIOD)) * s.thruster;
    const cos = Math.cos(sway), sin = Math.sin(sway);
    const count = Math.min(this.stars.length, Math.max(s.count, Math.round(s.count * (1 + boost * 0.28))));
    const particles: AFXEmitterParticle[] = [];
    for (let id = 0; id < count; id++) {
      const star = this.stars[id], persp = s.spread / star.z;
      const x = this.preset.core.anchorX * width + (star.dirX * cos - star.dirY * sin) * persp * min * 0.5;
      const y = this.preset.core.anchorY * height - (star.dirX * sin + star.dirY * cos) * persp * min * 0.5;
      if (Math.abs(x / width * 2 - 1) > 1.25 || Math.abs(1 - y / height * 2) > 1.25) continue;
      const size = Math.min(STAR_SIZE_MAX_PX, Math.max(0.5, star.worldSize * persp * STAR_SIZE_SCALE));
      const alpha = star.brightness * Math.min(1, 0.12 + persp * 0.55) * s.alpha * Math.min(1, this.elapsed / 1.5) * (1 + boost * 0.24);
      particles.push({ id, contents: image, position: { x, y }, zPosition: 0, renderOrder: id, colour: GFXColour.rgba(...s.colour, Math.min(1, alpha)), scale: size / image.width, rotation: 0 });
    }
    return particles;
  }
}

/** Original GL_POINTS radial mask, baked once into a sprite for AFX particles. */
export function makeVortexPointSprite(source?: GFXImage): GFXImage {
  const edge = 64, data = new Uint8Array(edge * edge * 4);
  for (let y = 0; y < edge; y++) for (let x = 0; x < edge; x++) {
    const radial = Math.max(0, Math.min(1, 1 - Math.hypot((x + 0.5) / edge - 0.5, (y + 0.5) / edge - 0.5) / 0.5));
    const mask = radial * radial * (3 - 2 * radial);
    // WebGL interpolated the source's straight channels independently, including
    // RGB under zero alpha. GFXImage.sample uses premultiplied interpolation;
    // that would lose the luminance mask in this particular source recipe.
    const tex = source ? sampleStraight(source, (x + 0.5) / edge, (y + 0.5) / edge) : undefined;
    const alpha = tex ? Math.max(tex.a, tex.r, tex.g, tex.b) * mask : mask;
    const offset = (y * edge + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = 255;
    data[offset + 3] = Math.round(alpha * 255);
  }
  return new GFXImage({ width: edge, height: edge, alpha: "straight", colourSpace: "srgb", data });
}

function sampleStraight(image: GFXImage, u: number, v: number) {
  const px = u * image.width - 0.5, py = v * image.height - 0.5;
  const x = Math.floor(px), y = Math.floor(py), fx = px - x, fy = py - y;
  const read = (ix: number, iy: number) => image.pixel(Math.max(0, Math.min(image.width - 1, ix)), Math.max(0, Math.min(image.height - 1, iy)));
  const values = [read(x, y), read(x + 1, y), read(x, y + 1), read(x + 1, y + 1)];
  const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  const result = { r: 0, g: 0, b: 0, a: 0 };
  for (let i = 0; i < 4; i++) for (const key of ["r", "g", "b", "a"] as const) result[key] += values[i][key] * weights[i];
  return result;
}
