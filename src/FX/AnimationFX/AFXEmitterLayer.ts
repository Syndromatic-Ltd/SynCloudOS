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

import { SynCloudOSLifecycleRecord, synCloudOSLifecycleSignalReason } from "../../SynCloudOS/fxRuntimeContracts";
import {
  AFXLayer,
  type AFXFrameScheduler,
  type AFXLayerSurface,
} from "./AFXLayer";
import { AFXEmitterCell } from "./AFXEmitterCell";
import { AFXTransform3D } from "./AFXTransform3D";
import type { AFXEmitterContent, AFXEmitterParticle } from "./AFXLayerContent";
import { GFXColour } from "../GraphicsFX/GFXColour";
import {
  normalisePoint,
  normaliseSize,
  type GFXPoint,
  type GFXSize,
} from "../GraphicsFX/GFXGeometry";

export type AFXEmitterShape = "point" | "line" | "rectangle" | "circle";
export type AFXEmitterMode = "points" | "volume" | "surface" | "outline";
export type AFXEmitterProjectionMode = "planar" | "projective";
export type AFXEmitterRenderMode =
  | "unordered"
  | "oldestFirst"
  | "oldestLast"
  | "backToFront";

type AFXEmitterPoint3D = Readonly<{ x: number; y: number; z: number }>;

type LiveParticle = Readonly<{
  id: number;
  cell: AFXEmitterCell;
  born: number;
  lifetime: number;
  origin: AFXEmitterPoint3D;
  velocity: AFXEmitterPoint3D;
  colour: Readonly<{ r: number; g: number; b: number; a: number }>;
  scale: number;
  spin: number;
}>;

type ChildSchedule = {
  readonly parentId: number;
  readonly childIndex: number;
  readonly cell: AFXEmitterCell;
  readonly interval: number;
  next: number;
  ordinal: number;
};

const MAX_PARTICLES = 2048;
const MAX_SPAWN_PER_FRAME = 128;
const MAX_CELL_COUNT = 64;
const MAX_CELL_DEPTH = 8;
const MAX_NESTED_SCHEDULES = 8192;
const finite = (value: number, label: string, minimum?: number) => {
  if (!Number.isFinite(value) || (minimum !== undefined && value < minimum))
    throw new RangeError(`${label} is outside its finite range.`);
  return value;
};
const unit = (value: number) => Math.max(0, Math.min(1, value));
const emitterHierarchy = (roots: readonly AFXEmitterCell[]) => {
  const cells: AFXEmitterCell[] = [];
  const stack = roots.map((cell) => ({ cell, depth: 1 })).reverse();
  while (stack.length) {
    const entry = stack.pop()!;
    if (entry.depth > MAX_CELL_DEPTH)
      throw new RangeError(`Emitter cell hierarchy exceeds depth ${MAX_CELL_DEPTH}.`);
    cells.push(entry.cell);
    if (cells.length > MAX_CELL_COUNT)
      throw new RangeError(`Emitter cell hierarchy exceeds ${MAX_CELL_COUNT} cells.`);
    for (let index = entry.cell.childCells.length - 1; index >= 0; index--)
      stack.push({ cell: entry.cell.childCells[index]!, depth: entry.depth + 1 });
  }
  return cells;
};

/** Deterministic bounded particle projection with opt-in projective depth. */
export class AFXEmitterLayer extends AFXLayer {
  readonly #lifecycle = new SynCloudOSLifecycleRecord({ kind: "AFXEmitterLayer" });
  readonly #scheduler: AFXFrameScheduler;
  #cells: readonly AFXEmitterCell[] = Object.freeze([]);
  #position: GFXPoint = normalisePoint({ x: 0, y: 0 });
  #size: GFXSize = normaliseSize({ width: 0, height: 0 });
  #shape: AFXEmitterShape = "point";
  #mode: AFXEmitterMode = "volume";
  #projectionMode: AFXEmitterProjectionMode = "planar";
  #projectionTransform = new AFXTransform3D();
  #renderMode: AFXEmitterRenderMode = "unordered";
  #seed = 1;
  #randomState = 1;
  #birthRate = 1;
  #lifetime = 1;
  #velocity = 1;
  #scale = 1;
  #maxParticles = 512;
  #particles: LiveParticle[] = [];
  #nextBirths: number[] = [];
  #childSchedules: ChildSchedule[] = [];
  #nextParticle = 0;
  #last = 0;
  #elapsed = 0;
  #cancelFrame: (() => void) | null = null;
  #releaseState: (() => void) | null = null;
  #running = false;
  #disposed = false;
  readonly #ownerSignal: AbortSignal | undefined;
  #spawnedThisFrame = 0;

  constructor(
    surface: AFXLayerSurface,
    scheduler: AFXFrameScheduler,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ) {
    super(surface, scheduler, options);
    this.#ownerSignal = options.signal;
    this.#scheduler = scheduler;
    let pendingRelease: (() => void) | null = null;
    try {
      this.setLayerContent("constructor", this.#content([]));
      if (options.signal?.aborted || this.#disposed)
        throw new DOMException("Emitter owner aborted during construction.", "AbortError");
      pendingRelease = scheduler.subscribeState?.(() => this.#stateChanged()) ?? null;
      if (options.signal?.aborted || this.#disposed) {
        try { pendingRelease?.(); } catch {}
        pendingRelease = null;
        throw new DOMException("Emitter owner aborted during construction.", "AbortError");
      }
      this.#releaseState = pendingRelease;
      pendingRelease = null;
    } catch (error) {
      try { pendingRelease?.(); } catch {}
      if (!this.#disposed) {
        this.#disposed = true;
        super.dispose();
      }
      throw error;
    }
  }

  #assertLive(operation: string) {
    if (this.#disposed) throw this.#lifecycle.error({ code: "AFX_EMITTER_LAYER_DISPOSED", operation: operation });
  }
  #content(particles: readonly AFXEmitterParticle[]): AFXEmitterContent {
    return Object.freeze({ kind: "emitter", particles: Object.freeze([...particles]) });
  }
  #reset(operation: string, clear = true) {
    try { this.#cancelFrame?.(); } catch {}
    this.#cancelFrame = null;
    this.#randomState = this.#seed || 0x6d2b79f5;
    this.#elapsed = 0;
    this.#nextBirths = this.#cells.map((cell) => {
      const rate = cell.enabled ? cell.birthRate * this.#birthRate : 0;
      return rate > 0 ? 1 / rate : Number.POSITIVE_INFINITY;
    });
    this.#childSchedules = [];
    if (clear) {
      this.#particles = [];
      this.setLayerContent(operation, this.#content([]));
    }
    this.#last = this.#scheduler.now();
    if (!Number.isFinite(this.#last))
      throw new RangeError("Emitter clock must be finite seconds.");
  }
  #reconfigure(operation: string) {
    this.#assertLive(operation);
    const active = this.#running;
    this.#reset(operation);
    if (active) this.#scheduleIfActive();
  }
  #random() {
    let value = (this.#randomState += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  #vary(centre: number, range: number) {
    return range ? centre + (this.#random() - 0.5) * range : centre;
  }
  #origin(): GFXPoint {
    const { x, y } = this.#position, { width, height } = this.#size;
    if (this.#mode === "points") return this.#position;
    if (this.#shape === "point") return this.#position;
    if (this.#shape === "line")
      return normalisePoint({ x: x + (this.#random() - 0.5) * width, y });
    if (this.#shape === "rectangle") {
      if (this.#mode === "volume")
        return normalisePoint({
          x: x + (this.#random() - 0.5) * width,
          y: y + (this.#random() - 0.5) * height,
        });
      const perimeter = 2 * (width + height);
      if (!perimeter) return this.#position;
      let distance = this.#random() * perimeter;
      if (distance <= width) return normalisePoint({ x: x - width / 2 + distance, y: y - height / 2 });
      distance -= width;
      if (distance <= height) return normalisePoint({ x: x + width / 2, y: y - height / 2 + distance });
      distance -= height;
      if (distance <= width) return normalisePoint({ x: x + width / 2 - distance, y: y + height / 2 });
      return normalisePoint({ x: x - width / 2, y: y + height / 2 - (distance - width) });
    }
    const angle = this.#random() * Math.PI * 2;
    const radius = this.#mode === "volume" ? Math.sqrt(this.#random()) : 1;
    return normalisePoint({
      x: x + Math.cos(angle) * width * 0.5 * radius,
      y: y + Math.sin(angle) * height * 0.5 * radius,
    });
  }
  #pointAt(particle: LiveParticle, time: number): AFXEmitterPoint3D {
    const age = Math.max(0, time - particle.born), cell = particle.cell;
    return Object.freeze({
      x: particle.origin.x + particle.velocity.x * age + 0.5 * cell.xAcceleration * age * age,
      y: particle.origin.y + particle.velocity.y * age + 0.5 * cell.yAcceleration * age * age,
      z: particle.origin.z + particle.velocity.z * age + 0.5 * cell.zAcceleration * age * age,
    });
  }
  #nestedRandom(parentId: number, childIndex: number, ordinal: number) {
    let state = (this.#seed ^ Math.imul(parentId, 0x9e3779b1) ^ Math.imul(childIndex + 1, 0x85ebca6b) ^ Math.imul(ordinal + 1, 0xc2b2ae35)) >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
  #scheduleChildren(particle: LiveParticle) {
    particle.cell.childCells.forEach((cell, childIndex) => {
      const rate = cell.enabled ? cell.birthRate * this.#birthRate : 0;
      if (!(rate > 0) || !Number.isFinite(rate)) return;
      if (this.#childSchedules.length >= MAX_NESTED_SCHEDULES) return;
      const interval = 1 / rate;
      this.#childSchedules.push({
        parentId: particle.id,
        childIndex,
        cell,
        interval,
        next: particle.born + interval,
        ordinal: 0,
      });
    });
  }
  #spawn(
    cell: AFXEmitterCell,
    born: number,
    origin?: AFXEmitterPoint3D,
    random: () => number = () => this.#random(),
  ) {
    const vary = (centre: number, range: number) =>
      range ? centre + (random() - 0.5) * range : centre;
    const lifetime = vary(cell.lifetime, cell.lifetimeRange) * this.#lifetime;
    if (!(lifetime > 0)) return;
    const longitude = vary(cell.emissionLongitude, cell.emissionRange);
    const latitude = vary(cell.emissionLatitude, cell.emissionLatitudeRange);
    const speed = vary(cell.velocity, cell.velocityRange) * this.#velocity;
    const planarSpeed = Math.cos(latitude) * speed;
    const source = cell.colour.converting("srgb").components;
    const particle = Object.freeze({
      id: ++this.#nextParticle,
      cell,
      born,
      lifetime,
      origin: origin ?? Object.freeze({ ...this.#origin(), z: 0 }),
      velocity: Object.freeze({
        x: Math.cos(longitude) * planarSpeed,
        y: Math.sin(longitude) * planarSpeed,
        z: Math.sin(latitude) * speed,
      }),
      colour: Object.freeze({
        r: unit(vary(source.r, cell.redRange)),
        g: unit(vary(source.g, cell.greenRange)),
        b: unit(vary(source.b, cell.blueRange)),
        a: unit(vary(source.a, cell.alphaRange)),
      }),
      scale: Math.max(0, vary(cell.scale, cell.scaleRange) * this.#scale),
      spin: vary(cell.spin, cell.spinRange),
    });
    this.#particles.push(particle);
    this.#scheduleChildren(particle);
  }
  #hasNestedCells() {
    return this.#cells.some((cell) => cell.childCells.length > 0);
  }
  #spawnSpatialEvents() {
    let processed = 0;
    while (processed++ < 4096) {
      let rootIndex = -1;
      let rootTime = Number.POSITIVE_INFINITY;
      for (let index = 0; index < this.#cells.length; index++) {
        const time = this.#nextBirths[index] ?? Number.POSITIVE_INFINITY;
        if (time <= this.#elapsed + Number.EPSILON && time < rootTime) {
          rootIndex = index;
          rootTime = time;
        }
      }

      let childSchedule: ChildSchedule | null = null;
      let childTime = Number.POSITIVE_INFINITY;
      for (const schedule of this.#childSchedules) {
        if (schedule.next > this.#elapsed + Number.EPSILON) continue;
        if (
          schedule.next < childTime ||
          (schedule.next === childTime && childSchedule !== null &&
            (schedule.parentId < childSchedule.parentId ||
              (schedule.parentId === childSchedule.parentId &&
                schedule.childIndex < childSchedule.childIndex)))
        ) {
          childSchedule = schedule;
          childTime = schedule.next;
        }
      }

      if (rootIndex < 0 && !childSchedule) break;
      if (rootIndex >= 0 && rootTime <= childTime) {
        const cell = this.#cells[rootIndex]!;
        const rate = cell.enabled ? cell.birthRate * this.#birthRate : 0;
        const interval = rate > 0 ? 1 / rate : Number.POSITIVE_INFINITY;
        this.#nextBirths[rootIndex] = rootTime + interval;
        if (
          this.#particles.length < this.#maxParticles &&
          this.#spawnedThisFrame < MAX_SPAWN_PER_FRAME
        ) {
          this.#spawn(cell, rootTime);
          this.#spawnedThisFrame++;
        }
        continue;
      }

      const schedule = childSchedule!;
      const born = schedule.next;
      const ordinal = schedule.ordinal;
      schedule.next += schedule.interval;
      schedule.ordinal++;
      const parent = this.#particles.find((particle) => particle.id === schedule.parentId);
      if (!parent || born >= parent.born + parent.lifetime - Number.EPSILON) continue;
      if (
        this.#particles.length < this.#maxParticles &&
        this.#spawnedThisFrame < MAX_SPAWN_PER_FRAME
      ) {
        this.#spawn(
          schedule.cell,
          born,
          this.#pointAt(parent, born),
          this.#nestedRandom(parent.id, schedule.childIndex, ordinal),
        );
        this.#spawnedThisFrame++;
      }
    }
  }
  #project(now: number) {
    const output: { particle: LiveParticle; value: AFXEmitterParticle }[] = [];
    for (const particle of this.#particles) {
      const age = now - particle.born;
      if (age < 0 || age >= particle.lifetime) continue;
      const cell = particle.cell;
      const point = this.#pointAt(particle, now);
      const projected = this.#projectionMode === "projective"
        ? this.#projectionTransform.transformPoint(point)
        : point;
      output.push({ particle, value: Object.freeze({
        id: particle.id,
        contents: cell.contents,
        position: normalisePoint({
          x: projected.x,
          y: projected.y,
        }),
        zPosition: projected.z,
        renderOrder: cell.renderOrder,
        colour: GFXColour.rgba(
          unit(particle.colour.r + cell.redSpeed * age),
          unit(particle.colour.g + cell.greenSpeed * age),
          unit(particle.colour.b + cell.blueSpeed * age),
          unit(particle.colour.a + cell.alphaSpeed * age),
        ),
        scale: Math.max(0, particle.scale + cell.scaleSpeed * age),
        rotation: particle.spin * age,
      }) });
    }
    this.#particles = this.#particles.filter((particle) => now - particle.born < particle.lifetime);
    const retained = new Set(this.#particles.map((particle) => particle.id));
    this.#childSchedules = this.#childSchedules.filter((schedule) => retained.has(schedule.parentId));
    if (this.#renderMode === "oldestFirst")
      output.sort((a, b) => a.particle.born - b.particle.born || a.value.renderOrder - b.value.renderOrder || a.value.id - b.value.id);
    else if (this.#renderMode === "oldestLast")
      output.sort((a, b) => b.particle.born - a.particle.born || a.value.renderOrder - b.value.renderOrder || a.value.id - b.value.id);
    else if (this.#renderMode === "backToFront")
      output.sort((a, b) => a.value.zPosition - b.value.zPosition || a.value.renderOrder - b.value.renderOrder || a.value.id - b.value.id);
    this.setLayerContent("startEmitting", this.#content(output.map(({ value }) => value)));
  }
  #tick = (now: number) => {
    this.#cancelFrame = null;
    if (!this.#running || this.#scheduler.suspended || this.#scheduler.reducedMotion) return;
    if (!Number.isFinite(now) || now < this.#last) {
      this.stopEmitting();
      return;
    }
    const delta = now - this.#last;
    if (!Number.isFinite(delta) || delta > 3_600 || !Number.isFinite(this.#elapsed + delta)) {
      this.stopEmitting();
      return;
    }
    const frameStart = this.#elapsed;
    this.#elapsed += delta;
    this.#last = now;
    this.#spawnedThisFrame = 0;
    if (this.#hasNestedCells()) {
      this.#spawnSpatialEvents();
    } else {
      this.#particles = this.#particles.filter((particle) => this.#elapsed - particle.born < particle.lifetime);
      for (let index = 0; index < this.#cells.length; index++) {
        const cell = this.#cells[index]!;
        const rate = cell.enabled ? cell.birthRate * this.#birthRate : 0;
        if (!(rate > 0) || !Number.isFinite(rate)) continue;
        const interval = 1 / rate;
        const first = this.#nextBirths[index] ?? frameStart + interval;
        const due = first <= this.#elapsed + Number.EPSILON
          ? Math.floor((this.#elapsed - first) / interval + Number.EPSILON) + 1
          : 0;
        this.#nextBirths[index] = first + due * interval;
        const available = Math.min(
          due,
          this.#maxParticles - this.#particles.length,
          MAX_SPAWN_PER_FRAME - this.#spawnedThisFrame,
        );
        if (available <= 0) continue;
        const firstKept = due - available;
        for (let item = 0; item < available; item++) {
          const born = first + (firstKept + item) * interval;
          this.#spawn(cell, born);
          this.#spawnedThisFrame++;
        }
      }
    }
    this.#project(this.#elapsed);
    this.#scheduleIfActive();
  };
  #scheduleIfActive() {
    if (
      !this.#running ||
      this.#cancelFrame ||
      this.#scheduler.suspended ||
      this.#scheduler.reducedMotion
    ) return;
    this.#cancelFrame = this.#scheduler.requestFrame(this.#tick);
  }
  #stateChanged() {
    if (!this.#running) return;
    this.#cancelFrame?.();
    this.#cancelFrame = null;
    const now = this.#scheduler.now();
    if (!Number.isFinite(now)) {
      this.stopEmitting();
      return;
    }
    if (this.#scheduler.reducedMotion) {
      this.#particles = [];
      this.#childSchedules = [];
      this.#nextBirths = this.#cells.map((cell) => {
        const rate = cell.enabled ? cell.birthRate * this.#birthRate : 0;
        return rate > 0 ? this.#elapsed + 1 / rate : Number.POSITIVE_INFINITY;
      });
      this.setLayerContent("startEmitting", this.#content([]));
    }
    this.#last = now;
    this.#scheduleIfActive();
  }

  get emitterCells() { return this.#cells; }
  set emitterCells(value: readonly AFXEmitterCell[]) {
    this.#assertLive("emitterCells");
    if (!Array.isArray(value) || value.some((cell) => !(cell instanceof AFXEmitterCell)))
      throw new TypeError("Emitter cells require at most 64 AFXEmitterCell values.");
    const hierarchy = emitterHierarchy(value);
    const resources = new Set(hierarchy.map((cell) => cell.contents));
    const bytes = [...resources].reduce(
      (total, image) => total + image.bytesPerRow * image.height,
      0,
    );
    if (!Number.isSafeInteger(bytes) || bytes > 8 * 1024 * 1024)
      throw new RangeError("Emitter image resources exceed the 8 MiB projection resource budget.");
    this.#cells = Object.freeze([...value]);
    this.#reconfigure("emitterCells");
  }
  get emitterPosition() { return this.#position; }
  set emitterPosition(value: GFXPoint) { const next = normalisePoint(value); this.#assertLive("emitterPosition"); this.#position = next; this.#reconfigure("emitterPosition"); }
  get emitterSize() { return this.#size; }
  set emitterSize(value: GFXSize) {
    const next = normaliseSize(value);
    if (next.width < 0 || next.height < 0) throw new RangeError("Emitter size cannot be negative.");
    this.#assertLive("emitterSize"); this.#size = next; this.#reconfigure("emitterSize");
  }
  get emitterShape() { return this.#shape; }
  set emitterShape(value: AFXEmitterShape) {
    if (!["point", "line", "rectangle", "circle"].includes(value)) throw new TypeError("Unsupported emitter shape.");
    this.#assertLive("emitterShape"); this.#shape = value; this.#reconfigure("emitterShape");
  }
  get emitterMode() { return this.#mode; }
  set emitterMode(value: AFXEmitterMode) {
    if (!["points", "volume", "surface", "outline"].includes(value)) throw new TypeError("Unsupported emitter mode.");
    this.#assertLive("emitterMode"); this.#mode = value; this.#reconfigure("emitterMode");
  }
  get projectionMode() { return this.#projectionMode; }
  set projectionMode(value: AFXEmitterProjectionMode) {
    if (!["planar", "projective"].includes(value))
      throw new TypeError("Unsupported emitter projection mode.");
    this.#assertLive("projectionMode"); this.#projectionMode = value; this.#reconfigure("projectionMode");
  }
  get projectionTransform() { return this.#projectionTransform; }
  set projectionTransform(value: AFXTransform3D) {
    if (!(value instanceof AFXTransform3D))
      throw new TypeError("Emitter projection transform requires AFXTransform3D.");
    this.#assertLive("projectionTransform"); this.#projectionTransform = value; this.#reconfigure("projectionTransform");
  }
  get renderMode() { return this.#renderMode; }
  set renderMode(value: AFXEmitterRenderMode) {
    if (!["unordered", "oldestFirst", "oldestLast", "backToFront"].includes(value))
      throw new TypeError("Unsupported emitter render mode.");
    this.#assertLive("renderMode"); this.#renderMode = value; this.#reconfigure("renderMode");
  }
  get seed() { return this.#seed; }
  set seed(value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError("Emitter seed must be an unsigned 32-bit integer.");
    this.#assertLive("seed"); this.#seed = value; this.#reconfigure("seed");
  }
  get birthRate() { return this.#birthRate; }
  set birthRate(value: number) { const next = finite(value, "Emitter birth rate", 0); if (next > 1_024) throw new RangeError("Emitter birth-rate multiplier exceeds 1024."); this.#assertLive("birthRate"); this.#birthRate = next; this.#reconfigure("birthRate"); }
  get lifetime() { return this.#lifetime; }
  set lifetime(value: number) { const next = finite(value, "Emitter lifetime", 0); if (next > 16) throw new RangeError("Emitter lifetime multiplier exceeds 16."); this.#assertLive("lifetime"); this.#lifetime = next; this.#reconfigure("lifetime"); }
  get velocity() { return this.#velocity; }
  set velocity(value: number) { const next = finite(value, "Emitter velocity"); if (Math.abs(next) > 1_024) throw new RangeError("Emitter velocity multiplier exceeds 1024."); this.#assertLive("velocity"); this.#velocity = next; this.#reconfigure("velocity"); }
  get scale() { return this.#scale; }
  set scale(value: number) { const next = finite(value, "Emitter scale", 0); if (next > 1_024) throw new RangeError("Emitter scale multiplier exceeds 1024."); this.#assertLive("scale"); this.#scale = next; this.#reconfigure("scale"); }
  get maxParticles() { return this.#maxParticles; }
  set maxParticles(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_PARTICLES) throw new RangeError(`Maximum particles must be from zero to ${MAX_PARTICLES}.`);
    this.#assertLive("maxParticles"); this.#maxParticles = value; this.#reconfigure("maxParticles");
  }
  get particleCount() { return this.#particles.length; }
  get isEmitting() { return this.#running; }
  get diagnostics() { return Object.freeze({ particleCount: this.#particles.length, spawnedThisFrame: this.#spawnedThisFrame, maximumParticles: this.#maxParticles, maximumSpawnPerFrame: MAX_SPAWN_PER_FRAME }); }

  startEmitting() {
    this.#assertLive("startEmitting");
    if (this.#running) return;
    this.#running = true;
    this.#reset("startEmitting");
    this.#scheduleIfActive();
  }
  stopEmitting() {
    this.#assertLive("stopEmitting");
    this.#running = false;
    try { this.#cancelFrame?.(); } catch {}
    this.#cancelFrame = null;
    this.#particles = [];
    this.#childSchedules = [];
    this.#nextBirths = this.#cells.map(() => Number.POSITIVE_INFINITY);
    this.setLayerContent("stopEmitting", this.#content([]));
  }
  override dispose() {
    if (this.#disposed) return;
    this.#lifecycle.markDisposed(this.#ownerSignal?.aborted ? synCloudOSLifecycleSignalReason(this.#ownerSignal) : "explicit");
    this.#running = false;
    let releaseError: unknown;
    try { this.#cancelFrame?.(); } catch (error) { releaseError = error; }
    this.#cancelFrame = null;
    try { this.#releaseState?.(); } catch (error) { releaseError ??= error; }
    this.#releaseState = null;
    this.#particles = [];
    this.#childSchedules = [];
    this.#disposed = true;
    try { super.dispose(); } catch (error) { releaseError ??= error; }
    if (releaseError) throw releaseError;
  }
}
