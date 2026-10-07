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
import { describe, expect, it } from "vitest";
import { AFXAnimation } from "../../../src/FX/AnimationFX/AFXAnimation";
import { AFXBasicAnimation } from "../../../src/FX/AnimationFX/AFXBasicAnimation";
import { AFXEmitterCell } from "../../../src/FX/AnimationFX/AFXEmitterCell";
import { AFXEmitterLayer } from "../../../src/FX/AnimationFX/AFXEmitterLayer";
import type {
  AFXFrameScheduler,
  AFXLayerSnapshot,
  AFXLayerSurface,
} from "../../../src/FX/AnimationFX/AFXLayer";
import { AFXReplicatorLayer } from "../../../src/FX/AnimationFX/AFXReplicatorLayer";
import { AFXShapeLayer } from "../../../src/FX/AnimationFX/AFXShapeLayer";
import { AFXTransform3D } from "../../../src/FX/AnimationFX/AFXTransform3D";
import { GFXColour } from "../../../src/FX/GraphicsFX/GFXColour";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { GFXPath } from "../../../src/FX/GraphicsFX/GFXPath";
import { BrowserAnimationLayerSurface } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";
import * as publicAnimationFX from "../../../src/FX/AnimationFX/public";

class FrameClock implements AFXFrameScheduler {
  time = 0;
  reducedMotion = false;
  suspended = false;
  readonly frames = new Set<(timestamp: number) => void>();
  readonly state = new Set<() => void>();

  now() { return this.time; }
  requestFrame(callback: (timestamp: number) => void) {
    this.frames.add(callback);
    return () => this.frames.delete(callback);
  }
  subscribeState(callback: () => void) {
    this.state.add(callback);
    return () => this.state.delete(callback);
  }
  advance(seconds: number) {
    this.time += seconds;
    const callbacks = [...this.frames];
    this.frames.clear();
    callbacks.forEach((callback) => callback(this.time));
  }
  setState(values: { reducedMotion?: boolean; suspended?: boolean }) {
    Object.assign(this, values);
    this.state.forEach((callback) => callback());
  }
}

const pixel = (value: number) => new GFXImage({
  width: 1,
  height: 1,
  alpha: "straight",
  colourSpace: "srgb",
  data: new Uint8Array([value, value, value, 255]),
});

const white = pixel(255);
const grey = pixel(127);

function shape(clock: FrameClock) {
  const element = document.createElement("div");
  const layer = new AFXShapeLayer(new BrowserAnimationLayerSurface(element), clock);
  layer.frame = { x: 0, y: 0, width: 10, height: 10 };
  layer.path = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 });
  layer.fillColour = GFXColour.parse("white");
  return { element, layer };
}

function emitter(clock = new FrameClock()) {
  const element = document.createElement("div");
  const layer = new AFXEmitterLayer(new BrowserAnimationLayerSurface(element), clock);
  layer.frame = { x: 0, y: 0, width: 100, height: 100 };
  return { clock, element, layer };
}

describe("AnimationFX spatial replication and emitter depth", () => {
  it("keeps replicator presentation history outside the ordinary AnimationFX entry", () => {
    expect(publicAnimationFX).not.toHaveProperty("AFXPresentationHistory");
  });

  it("replicates independently animated child history at each instance delay", () => {
    const clock = new FrameClock();
    const element = document.createElement("div");
    const replica = new AFXReplicatorLayer(
      new BrowserAnimationLayerSurface(element),
      clock,
    );
    replica.frame = { x: 0, y: 0, width: 30, height: 10 };
    replica.instanceCount = 2;
    replica.instanceDelay = 0.5;
    replica.instanceTransform = AFXTransform3D.translation(15, 0);
    const child = shape(clock);
    replica.addSublayer(child.layer);
    child.layer.addAnimation(
      new AFXBasicAnimation({
        targetId: "child-opacity",
        keyPath: "opacity",
        from: 0,
        to: 1,
        animation: new AFXAnimation({ duration: 1, timing: "linear", fill: "both" }),
      }),
      "opacity",
    );
    clock.advance(0.25);
    clock.advance(0.5);
    const sources = [...element.querySelectorAll<SVGGElement>("[data-afx-replica-source]")];
    expect(sources).toHaveLength(2);
    expect(sources[0]!.innerHTML).toContain('opacity="0.75"');
    expect(sources[1]!.innerHTML).toContain('opacity="0.25"');
    replica.dispose();
    expect(clock.frames.size).toBe(0);
    expect(clock.state.size).toBe(0);
  });

  it("samples independently delayed child presentation in projective replicas", () => {
    const clock = new FrameClock();
    const element = document.createElement("div");
    const replica = new AFXReplicatorLayer(
      new BrowserAnimationLayerSurface(element),
      clock,
    );
    replica.frame = { x: 0, y: 0, width: 30, height: 10 };
    replica.instanceCount = 2;
    replica.instanceDelay = 0.5;
    replica.projectionMode = "projective";
    replica.instanceTransform = AFXTransform3D.perspective(400).multiply(
      AFXTransform3D.rotation(0.2, 1, 0, 0),
    );
    const child = shape(clock);
    replica.addSublayer(child.layer);
    child.layer.addAnimation(
      new AFXBasicAnimation({
        targetId: "projective-child-opacity",
        keyPath: "opacity",
        from: 0,
        to: 1,
        animation: new AFXAnimation({ duration: 1, timing: "linear", fill: "both" }),
      }),
      "opacity",
    );
    clock.advance(0.25);
    clock.advance(0.5);
    const sources = [...element.querySelectorAll<HTMLElement>("[data-afx-replica-source]")];
    expect(sources).toHaveLength(2);
    expect(sources[0]!.innerHTML).toContain('opacity="0.75"');
    expect(sources[1]!.innerHTML).toContain('opacity="0.25"');
    replica.dispose();
    expect(clock.frames.size).toBe(0);
  });

  it("keeps planar replication affine but enables projective depth only on a capable backend", () => {
    const clock = new FrameClock();
    const element = document.createElement("div");
    const replica = new AFXReplicatorLayer(
      new BrowserAnimationLayerSurface(element),
      clock,
    );
    replica.instanceCount = 2;
    replica.addSublayer(shape(clock).layer);
    expect(replica.projectionMode).toBe("planar");
    expect(replica.preservesDepth).toBe(false);
    expect(() => {
      replica.instanceTransform = AFXTransform3D.rotation(0.4, 1, 0, 0);
    }).toThrow(/affine/i);

    replica.projectionMode = "projective";
    replica.instanceTransform = AFXTransform3D.perspective(400).multiply(
      AFXTransform3D.rotation(0.4, 1, 0, 0),
    );
    expect(replica.preservesDepth).toBe(true);
    const projective = element.querySelector<HTMLElement>("[data-afx-replicas-projective]");
    expect(projective).not.toBeNull();
    expect(projective!.querySelector<HTMLElement>("[data-afx-replica='1']")!.style.transform)
      .toContain("matrix3d(");
    replica.dispose();

    const incapableSurface: AFXLayerSurface = {
      supportedProperties: [],
      supportsReplication: true,
      replicationCapability: () => Object.freeze({ projectiveDepth: false }),
      apply(_snapshot: AFXLayerSnapshot) {},
      attach() {},
      detach() {},
      setMask() {},
      dispose() {},
    };
    const incapable = new AFXReplicatorLayer(incapableSurface, clock);
    expect(() => { incapable.projectionMode = "projective"; }).toThrow(/projective depth/i);
    expect(incapable.preservesDepth).toBe(false);
    incapable.dispose();
  });

  it("supports point mode, nested cells and one aggregate particle budget", () => {
    const { clock, layer } = emitter();
    const child = new AFXEmitterCell({
      contents: grey,
      birthRate: 8,
      lifetime: 2,
      velocity: 2,
      emissionLatitude: Math.PI / 2,
    });
    layer.seed = 41;
    layer.maxParticles = 4;
    layer.emitterShape = "rectangle";
    layer.emitterSize = { width: 80, height: 60 };
    layer.emitterPosition = { x: 25, y: 30 };
    layer.emitterMode = "points";
    layer.emitterCells = [new AFXEmitterCell({
      contents: white,
      birthRate: 2,
      lifetime: 3,
      childCells: [child],
    })];
    layer.startEmitting();
    clock.advance(0.5);
    clock.advance(0.5);
    clock.advance(0.5);
    const content = layer.presentation.content;
    if (!content || content.kind !== "emitter") throw new Error("Emitter content missing.");
    expect(content.particles.length).toBeLessThanOrEqual(4);
    expect(content.particles.some((particle) => particle.contents === grey)).toBe(true);
    expect(content.particles.find((particle) => particle.contents === white)?.position)
      .toEqual({ x: 25, y: 30 });
    expect(layer.diagnostics.maximumParticles).toBe(4);
    layer.dispose();
  });

  it("keeps nested seeded trajectories invariant across frame subdivision and sorts projective depth", () => {
    const trajectory = (steps: readonly number[]) => {
      const { clock, layer } = emitter();
      layer.seed = 987;
      layer.projectionMode = "projective";
      layer.projectionTransform = AFXTransform3D.perspective(200);
      layer.renderMode = "backToFront";
      const away = new AFXEmitterCell({
        contents: grey,
        birthRate: 2,
        lifetime: 3,
        velocity: 20,
        emissionLatitude: -Math.PI / 2,
      });
      const toward = new AFXEmitterCell({
        contents: white,
        birthRate: 2,
        lifetime: 3,
        velocity: 20,
        emissionLatitude: Math.PI / 2,
        childCells: [away],
      });
      layer.emitterCells = [toward];
      layer.startEmitting();
      steps.forEach((step) => clock.advance(step));
      const content = layer.presentation.content;
      if (!content || content.kind !== "emitter") throw new Error("Emitter content missing.");
      const result = content.particles.map((particle) => ({
        id: particle.id,
        image: particle.contents === white ? "white" : "grey",
        position: particle.position,
        zPosition: particle.zPosition,
      }));
      layer.dispose();
      return result;
    };
    const subdivided = trajectory([0.25, 0.25, 0.25, 0.25, 0.25, 0.25]);
    const single = trajectory([1.5]);
    expect(subdivided).toEqual(single);
    expect(subdivided.map(({ zPosition }) => zPosition))
      .toEqual([...subdivided].map(({ zPosition }) => zPosition).sort((a, b) => a - b));
  });

  it("freezes spatial work under reduced motion and resumes without a catch-up burst", () => {
    const { clock, layer } = emitter();
    layer.emitterCells = [new AFXEmitterCell({
      contents: white,
      birthRate: 4,
      lifetime: 4,
      childCells: [new AFXEmitterCell({ contents: grey, birthRate: 8, lifetime: 2 })],
    })];
    layer.startEmitting();
    clock.advance(0.5);
    clock.setState({ reducedMotion: true });
    expect(layer.particleCount).toBe(0);
    clock.time = 50;
    clock.setState({ reducedMotion: false });
    clock.advance(0.25);
    expect(layer.particleCount).toBeLessThanOrEqual(2);
    layer.dispose();
    expect(clock.frames.size).toBe(0);
    expect(clock.state.size).toBe(0);
  });
});
